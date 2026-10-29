package com.mustrysolutions.perspective.components.gateway.guard;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

import com.inductiveautomation.ignition.common.alarming.AlarmEvent;
import com.inductiveautomation.ignition.common.alarming.AlarmFilter;
import com.inductiveautomation.ignition.common.alarming.AlarmState;
import com.inductiveautomation.ignition.common.alarming.query.conditions.EnumCondition;
import com.inductiveautomation.ignition.common.gson.JsonObject;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.gateway.alarming.AlarmManager;

/**
 * One alarm poller per gateway, shared by every Idle Guard. Each tick it reads
 * the active alarms once, then gives each subscribed guard its own filtered
 * summary: at once when it changed, otherwise as a heartbeat. The heartbeat is
 * what lets the browser fail open: a guard that hears nothing for
 * {@code config.alarm.staleAfterSec} removes its idle mode.
 *
 * <p>One query per tick, whatever the number of displays, is the reason this
 * polls instead of registering an {@code AlarmListener} per guard.
 *
 * <p>The poll only runs while at least one guard is subscribed: it starts with
 * the first subscriber and stops with the last, so a gateway whose projects use
 * none of the guard pays nothing for it.
 */
public final class AlarmFeed {

    private static final LoggerEx log = LoggerEx.newBuilder().build("MustrySolutions.PerspectiveComponents.IdleGuard.AlarmFeed");

    /** How often the gateway's alarm status is read. Bounds the alarm-to-wake latency. */
    static final long POLL_MS = 1000;
    /** An unchanged summary is re-sent this often. Must stay well under the browser's staleAfterSec (min 3 s). */
    static final long HEARTBEAT_MS = 2000;

    /** Starts the periodic poll of {@code tick}; the returned handle stops it. */
    @FunctionalInterface
    public interface Poller {
        Runnable start(Runnable tick);
    }

    /** A guard listening to the feed (its gateway-side delegate). */
    public interface Subscriber {
        SourceFilter filter();

        int top();

        /** Deliver one {@code screensaver-alarms} payload to the browser. */
        void push(JsonObject payload);
    }

    private static final class Slot {
        final Subscriber subscriber;
        String lastBody;
        long lastSent;
        long seq;

        Slot(Subscriber subscriber) {
            this.subscriber = subscriber;
        }
    }

    private final Supplier<List<ActiveAlarm>> source;
    private final LongSupplier clock;
    private final Poller poller;
    private final List<Slot> slots = new CopyOnWriteArrayList<>();
    /** The last alarms read; null until the first poll since polling (re)started. */
    private volatile List<ActiveAlarm> latest;
    private volatile boolean healthy = true;
    /** Stops the running poll; null while nobody is subscribed. Guarded by this. */
    private Runnable stopPolling;
    /**
     * Bumped on every poll start and stop. A tick carries the generation it was
     * started under and publishes nothing once it changed, so a read still in
     * flight from a stopped poll cannot deliver old alarms after a restart.
     */
    private volatile long generation;
    /** Set by {@link #shutdown()}: the feed never polls again. Guarded by this. */
    private volatile boolean closed;

    public AlarmFeed(Supplier<List<ActiveAlarm>> source, LongSupplier clock, Poller poller) {
        this.source = source;
        this.clock = clock;
        this.poller = poller;
    }

    /** The live feed: the gateway's alarm status, read on a daemon thread while a guard listens. */
    public static AlarmFeed forGateway(AlarmManager alarms) {
        return new AlarmFeed(() -> fromGateway(alarms), System::currentTimeMillis, AlarmFeed::pollOnDaemonThread);
    }

    private static Runnable pollOnDaemonThread(Runnable tick) {
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "mustry-idle-guard-alarm-feed");
            t.setDaemon(true);
            return t;
        });
        executor.scheduleWithFixedDelay(tick, 0, POLL_MS, TimeUnit.MILLISECONDS);
        return executor::shutdownNow;
    }

    static List<ActiveAlarm> fromGateway(AlarmManager alarms) {
        List<ActiveAlarm> out = new ArrayList<>();
        // Only active alarms: cleared-unacked ones can be many and are never shown.
        // Shelved ones too, for the Critical rule: an active Critical alarm always
        // counts, shelved or not. A new filter per query (the query engine marks fields on it).
        AlarmFilter activeOnly = new AlarmFilter();
        activeOnly.and(AlarmFilter.STATE, new EnumCondition<>(AlarmState.ActiveUnacked, AlarmState.ActiveAcked));
        activeOnly.getFlags().setRawValue(activeOnly.getFlags().getRawValue() | AlarmFilter.FLAG_INCLUDE_SHELVED);
        for (AlarmEvent e : alarms.queryStatus(activeOnly)) {
            if (e.getState() == null || !e.getState().isActive()) {
                continue;
            }
            int priority = e.getPriority() == null ? ActiveAlarm.LOW : e.getPriority().getIntValue();
            if (e.isShelved() && priority != ActiveAlarm.CRITICAL) {
                continue;
            }
            String label = e.getLabel();
            if (label == null || label.isEmpty()) {
                label = e.getName();
            }
            long since = e.getActiveData() != null ? e.getActiveData().getTimestamp() : 0L;
            out.add(new ActiveAlarm(
                e.getSource() == null ? "" : e.getSource().toString(),
                e.getDisplayPathOrSource(),
                label,
                priority,
                e.getState().isAcked(),
                since,
                e.isShelved()));
        }
        return out;
    }

    /** Stops polling and drops every subscriber (module shutdown). Final: a later subscribe is ignored. */
    public synchronized void shutdown() {
        closed = true;
        stop();
        slots.clear();
    }

    public synchronized void subscribe(Subscriber s) {
        if (closed) {
            // A delegate event racing the module shutdown must not restart the poll.
            return;
        }
        for (Slot slot : slots) {
            if (slot.subscriber == s) {
                return;
            }
        }
        slots.add(new Slot(s));
        if (stopPolling == null) {
            // First guard: start reading. Nothing old is reused, so a guard
            // never gets alarms from before the poll stopped.
            latest = null;
            healthy = true;
            long gen = ++generation;
            stopPolling = poller.start(() -> tickSafely(gen));
            log.debug("First Idle Guard subscribed; alarm polling started.");
        }
    }

    public synchronized void unsubscribe(Subscriber s) {
        slots.removeIf(slot -> slot.subscriber == s);
        if (slots.isEmpty() && stopPolling != null) {
            stop();
            log.debug("Last Idle Guard gone; alarm polling stopped.");
        }
    }

    private void stop() {
        generation++;
        if (stopPolling != null) {
            stopPolling.run();
            stopPolling = null;
        }
        latest = null;
    }

    /**
     * Send this subscriber its summary now (after it subscribed or changed its
     * filter). Before the first poll there is nothing to send: the poll that
     * starts with the first subscriber delivers it.
     */
    public void pushNow(Subscriber s) {
        List<ActiveAlarm> alarms = latest;
        if (closed || !healthy || alarms == null) {
            return;
        }
        for (Slot slot : slots) {
            if (slot.subscriber == s) {
                send(slot, alarms, clock.getAsLong(), true, new HashMap<>());
            }
        }
    }

    int subscriberCount() {
        return slots.size();
    }

    /** Is the alarm poll running? Package-private for tests. */
    synchronized boolean polling() {
        return stopPolling != null;
    }

    private void tickSafely(long gen) {
        try {
            tick(gen);
        } catch (Throwable t) {
            if (gen != generation) {
                // A read from a poll that has since stopped: not this poll's health.
                return;
            }
            // Say nothing to the guards: their feeds go stale and they fail open,
            // which is the safe answer when we cannot read the alarms.
            if (healthy) {
                log.warn("Could not read the gateway alarm status; Idle Guards will fail open until it recovers.", t);
            }
            healthy = false;
        }
    }

    /** One poll of the current generation. Package-private for tests. */
    void tick() {
        tick(generation);
    }

    /** One poll: read the alarms, then update every subscriber, unless the poll it belongs to has stopped. */
    void tick(long gen) {
        List<ActiveAlarm> read = List.copyOf(source.get());
        synchronized (this) {
            // Checked and published under the lock subscribe and stop take, so a
            // read from a stopped poll can never become `latest` after a restart.
            if (gen != generation) {
                return;
            }
            if (!healthy) {
                log.info("Gateway alarm status readable again; Idle Guard feeds resume.");
            }
            healthy = true;
            latest = read;
        }
        long now = clock.getAsLong();
        // Guards with the same patterns (every screen of a project, typically) share one summary per tick.
        Map<SummaryKey, Summary> memo = new HashMap<>();
        for (Slot slot : slots) {
            if (gen != generation) {
                return;
            }
            send(slot, read, now, false, memo);
        }
    }

    private record SummaryKey(SourceFilter filter, int top) {
    }

    private record Summary(JsonObject body, String text) {
    }

    private void send(Slot slot, List<ActiveAlarm> alarms, long now, boolean force, Map<SummaryKey, Summary> memo) {
        Subscriber s = slot.subscriber;
        Summary summary;
        try {
            SummaryKey key = new SummaryKey(s.filter(), s.top());
            summary = memo.get(key);
            if (summary == null) {
                JsonObject body = AlarmSummary.of(alarms, key.filter(), key.top());
                summary = new Summary(body, body.toString());
                memo.put(key, summary);
            }
        } catch (RuntimeException e) {
            log.warn("Could not summarise alarms for an Idle Guard", e);
            return;
        }
        String text = summary.text();
        // Each guard gets its own copy: the envelope (seq, sentAt) is per guard.
        JsonObject body = summary.body().deepCopy();
        synchronized (slot) {
            boolean changed = !text.equals(slot.lastBody);
            if (!force && !changed && now - slot.lastSent < HEARTBEAT_MS) {
                return;
            }
            slot.lastBody = text;
            slot.lastSent = now;
            body.addProperty("seq", ++slot.seq);
            body.addProperty("sentAt", now);
        }
        try {
            s.push(body);
        } catch (RuntimeException e) {
            log.debug("Idle Guard push failed (session closing?)", e);
        }
    }
}
