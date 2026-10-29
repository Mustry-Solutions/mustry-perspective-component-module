package com.mustrysolutions.perspective.components.gateway.guard;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.inductiveautomation.ignition.common.gson.JsonArray;
import com.inductiveautomation.ignition.common.gson.JsonObject;

/**
 * What one guard is told about the alarms it watches: active counts by
 * priority (all, and unacknowledged only) and the top few alarms,
 * unacknowledged first, then highest priority, then newest. The browser's
 * alarm policy (idleLogic.ts) decides from this whether to wake or pin.
 *
 * <p><b>Critical alarms are never filtered.</b> Every active Critical alarm
 * counts, whatever the guard's source patterns and shelved or not, so an
 * active Critical alarm is never covered. One outside the patterns (or
 * shelved) reaches the browser as a count only: it is never listed, so no
 * label or path leaves its scope. Every other priority counts and lists only
 * within the patterns, unshelved.
 */
public final class AlarmSummary {

    /** The most alarms a guard may ask to be listed. */
    static final int MAX_TOP = 10;

    static final Comparator<ActiveAlarm> TOP_ORDER = Comparator
        .comparing(ActiveAlarm::acked)
        .thenComparing(Comparator.comparingInt(ActiveAlarm::priority).reversed())
        .thenComparing(Comparator.comparingLong(ActiveAlarm::activeSince).reversed())
        .thenComparing(ActiveAlarm::displayPath);

    private AlarmSummary() {
    }

    /**
     * The summary as the JSON the delegate sends ({@code screensaver-alarms}
     * without the seq/sentAt envelope the feed adds).
     */
    public static JsonObject of(List<ActiveAlarm> alarms, SourceFilter filter, int top) {
        int[] active = new int[ActiveAlarm.PRIORITY_KEYS.length];
        int[] unacked = new int[ActiveAlarm.PRIORITY_KEYS.length];
        List<ActiveAlarm> kept = new ArrayList<>();
        for (ActiveAlarm a : alarms) {
            boolean inScope = !a.shelved() && filter.matches(a);
            if (!inScope && a.priority() != ActiveAlarm.CRITICAL) {
                continue;
            }
            if (inScope) {
                kept.add(a);
            }
            active[a.priority()]++;
            if (!a.acked()) {
                unacked[a.priority()]++;
            }
        }
        kept.sort(TOP_ORDER);
        JsonObject out = new JsonObject();
        out.add("active", counts(active));
        out.add("unacked", counts(unacked));
        JsonArray list = new JsonArray();
        int limit = Math.max(0, Math.min(MAX_TOP, top));
        for (int i = 0; i < kept.size() && i < limit; i++) {
            ActiveAlarm a = kept.get(i);
            JsonObject o = new JsonObject();
            o.addProperty("label", a.label());
            o.addProperty("displayPath", a.displayPath());
            o.addProperty("priority", ActiveAlarm.PRIORITY_KEYS[a.priority()]);
            o.addProperty("acked", a.acked());
            o.addProperty("activeSince", a.activeSince());
            list.add(o);
        }
        out.add("top", list);
        return out;
    }

    private static JsonObject counts(int[] byPriority) {
        JsonObject o = new JsonObject();
        for (int i = 0; i < byPriority.length; i++) {
            o.addProperty(ActiveAlarm.PRIORITY_KEYS[i], byPriority[i]);
        }
        return o;
    }
}
