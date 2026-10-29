package com.mustrysolutions.perspective.components.gateway.guard;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import com.inductiveautomation.ignition.common.gson.JsonObject;

class AlarmFeedTest {

    private static final class Sub implements AlarmFeed.Subscriber {
        final List<JsonObject> got = new ArrayList<>();
        SourceFilter filter = SourceFilter.ALL;

        @Override
        public SourceFilter filter() {
            return filter;
        }

        @Override
        public int top() {
            return 3;
        }

        @Override
        public void push(JsonObject payload) {
            got.add(payload);
        }
    }

    /** Counts starts and stops; the tests drive tick() themselves. */
    private static final class FakePoller implements AlarmFeed.Poller {
        int starts;
        int stops;

        @Override
        public Runnable start(Runnable tick) {
            starts++;
            return () -> stops++;
        }
    }

    private final AtomicLong now = new AtomicLong(1_000_000);
    private final List<ActiveAlarm> alarms = new ArrayList<>();
    private final FakePoller poller = new FakePoller();
    private final AlarmFeed feed = new AlarmFeed(() -> List.copyOf(alarms), now::get, poller);

    @Test
    void sendsOnChangeAndAsHeartbeat() {
        Sub s = new Sub();
        feed.subscribe(s);
        feed.tick();
        assertEquals(1, s.got.size(), "first tick sends");

        now.addAndGet(500);
        feed.tick();
        assertEquals(1, s.got.size(), "nothing changed, no heartbeat due");

        alarms.add(new ActiveAlarm("s", "d", "l", ActiveAlarm.HIGH, false, 1));
        now.addAndGet(500);
        feed.tick();
        assertEquals(2, s.got.size(), "a change goes out at once");
        assertEquals(1, s.got.get(1).getAsJsonObject("active").get("high").getAsInt());

        now.addAndGet(AlarmFeed.HEARTBEAT_MS);
        feed.tick();
        assertEquals(3, s.got.size(), "heartbeat when unchanged");
        assertTrue(s.got.get(2).get("seq").getAsLong() > s.got.get(1).get("seq").getAsLong());
        assertEquals(now.get(), s.got.get(2).get("sentAt").getAsLong());
    }

    @Test
    void eachSubscriberSeesItsOwnFilter() {
        Sub all = new Sub();
        Sub line2 = new Sub();
        line2.filter = SourceFilter.of(List.of("Line 2*"));
        alarms.add(new ActiveAlarm("s", "Line 1/x", "l", ActiveAlarm.HIGH, false, 1));
        alarms.add(new ActiveAlarm("s", "Line 1/y", "c", ActiveAlarm.CRITICAL, false, 1));
        feed.subscribe(all);
        feed.subscribe(line2);
        feed.subscribe(all); // idempotent
        assertEquals(2, feed.subscriberCount());
        feed.tick();
        assertEquals(1, all.got.get(0).getAsJsonObject("active").get("high").getAsInt());
        assertEquals(0, line2.got.get(0).getAsJsonObject("active").get("high").getAsInt());
        // Critical is never filtered: line2 counts it too, without its label.
        assertEquals(1, line2.got.get(0).getAsJsonObject("active").get("critical").getAsInt());
        assertEquals(0, line2.got.get(0).getAsJsonArray("top").size());
    }

    @Test
    void pushNowAndUnsubscribe() {
        Sub s = new Sub();
        Sub other = new Sub();
        feed.subscribe(s);
        feed.subscribe(other);
        feed.pushNow(s);
        assertEquals(0, s.got.size(), "nothing to send before the first poll");
        feed.tick();
        assertEquals(1, s.got.size());
        feed.pushNow(s);
        feed.pushNow(s);
        assertEquals(3, s.got.size(), "pushNow ignores the heartbeat timer");
        feed.unsubscribe(s);
        now.addAndGet(10_000);
        feed.tick();
        assertEquals(3, s.got.size());
        assertEquals(1, feed.subscriberCount());
    }

    @Test
    void pollsOnlyWhileAGuardListens() {
        assertFalse(feed.polling(), "no guard, no poll: a gateway without guards pays nothing");
        assertEquals(0, poller.starts);

        Sub a = new Sub();
        Sub b = new Sub();
        feed.subscribe(a);
        assertTrue(feed.polling());
        feed.subscribe(b);
        feed.subscribe(a);
        assertEquals(1, poller.starts, "one poll for every guard");

        feed.unsubscribe(a);
        assertTrue(feed.polling(), "still one guard listening");
        feed.unsubscribe(b);
        assertFalse(feed.polling());
        assertEquals(1, poller.stops, "the last guard stops it");
        feed.unsubscribe(b);
        assertEquals(1, poller.stops);

        feed.subscribe(a);
        assertTrue(feed.polling());
        assertEquals(2, poller.starts, "the next guard starts it again");
    }

    @Test
    void neverSendsAlarmsFromBeforeThePollStopped() {
        Sub a = new Sub();
        alarms.add(new ActiveAlarm("s", "d", "l", ActiveAlarm.HIGH, false, 1));
        feed.subscribe(a);
        feed.tick();
        feed.unsubscribe(a);

        alarms.clear();
        Sub b = new Sub();
        feed.subscribe(b);
        feed.pushNow(b);
        assertEquals(0, b.got.size(), "the stale High alarm is not replayed");
        feed.tick();
        assertEquals(0, b.got.get(0).getAsJsonObject("active").get("high").getAsInt());
    }

    @Test
    void shutdownStopsThePollAndDropsEveryone() {
        Sub a = new Sub();
        feed.subscribe(a);
        feed.shutdown();
        assertFalse(feed.polling());
        assertEquals(1, poller.stops);
        assertEquals(0, feed.subscriberCount());
    }

    @Test
    void subscribeAfterShutdownNeverRestartsThePoll() {
        Sub a = new Sub();
        feed.subscribe(a);
        feed.tick();
        feed.shutdown();

        Sub late = new Sub();
        feed.subscribe(late);
        assertFalse(feed.polling(), "a subscribe racing the module shutdown is ignored");
        assertEquals(1, poller.starts);
        assertEquals(0, feed.subscriberCount());
        feed.pushNow(late);
        assertEquals(0, late.got.size());
    }

    @Test
    void aTickFromAStoppedPollPublishesNothing() {
        // A poller that hands the test the tick it was started with.
        List<Runnable> ticks = new ArrayList<>();
        AlarmFeed f = new AlarmFeed(() -> List.copyOf(alarms), now::get, tick -> {
            ticks.add(tick);
            return () -> { };
        });
        alarms.add(new ActiveAlarm("s", "d", "l", ActiveAlarm.HIGH, false, 1));
        Sub a = new Sub();
        f.subscribe(a);
        Runnable oldTick = ticks.get(0);
        f.unsubscribe(a);

        alarms.clear();
        Sub b = new Sub();
        f.subscribe(b);
        alarms.add(new ActiveAlarm("s", "d", "l", ActiveAlarm.HIGH, false, 1));
        oldTick.run();
        assertEquals(0, b.got.size(), "the stopped poll's tick is discarded");
        f.pushNow(b);
        assertEquals(0, b.got.size(), "and left nothing behind to replay");

        alarms.clear();
        ticks.get(1).run();
        assertEquals(1, b.got.size());
        assertEquals(0, b.got.get(0).getAsJsonObject("active").get("high").getAsInt());
    }

    @Test
    void guardsWithTheSamePatternsShareASummaryButNotTheEnvelope() {
        Sub a = new Sub();
        Sub b = new Sub();
        a.filter = SourceFilter.of(List.of("Line 1*"));
        b.filter = SourceFilter.of(List.of("Line 1*"));
        alarms.add(new ActiveAlarm("s", "Line 1/x", "l", ActiveAlarm.HIGH, false, 1));
        feed.subscribe(a);
        feed.tick();
        feed.subscribe(b);
        now.addAndGet(AlarmFeed.HEARTBEAT_MS);
        feed.tick();
        assertEquals(2, a.got.size());
        assertEquals(1, b.got.size());
        assertEquals(2, a.got.get(1).get("seq").getAsLong());
        assertEquals(1, b.got.get(0).get("seq").getAsLong(), "each guard numbers its own messages");
        assertTrue(a.got.get(1) != b.got.get(0), "each guard gets its own copy");
        assertEquals(1, b.got.get(0).getAsJsonObject("active").get("high").getAsInt());
    }
}
