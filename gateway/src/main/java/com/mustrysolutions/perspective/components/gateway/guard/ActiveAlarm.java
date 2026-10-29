package com.mustrysolutions.perspective.components.gateway.guard;

import java.util.Locale;
import java.util.Objects;

/**
 * One active alarm, reduced to what the guard needs. Built from the gateway's
 * {@code AlarmEvent} by {@link AlarmFeed#fromGateway}; plain data so the
 * filter and summary logic test without a gateway.
 *
 * <p>The lower-cased paths the source filters match against are computed once
 * here, per alarm and poll, instead of once per guard.
 */
public final class ActiveAlarm {

    public static final int DIAGNOSTIC = 0;
    public static final int LOW = 1;
    public static final int MEDIUM = 2;
    public static final int HIGH = 3;
    public static final int CRITICAL = 4;

    /** JSON keys of the counts, by priority. Must match alarmPolicy.ts. */
    static final String[] PRIORITY_KEYS = {"diagnostic", "low", "medium", "high", "critical"};

    private final String source;
    private final String displayPath;
    private final String label;
    private final int priority;
    private final boolean acked;
    private final long activeSince;
    private final String sourceKey;
    private final String displayKey;

    /**
     * @param source      the source path, e.g. {@code prov:default:/tag:Line1/Speed:/alm:High}
     * @param displayPath the display path, or the source path when none is set
     * @param label       the alarm label (falls back to its name)
     * @param priority    0 = Diagnostic ... 4 = Critical ({@code AlarmPriority.getIntValue()})
     * @param acked       acknowledged (still active)
     * @param activeSince epoch ms the alarm went active
     */
    public ActiveAlarm(String source, String displayPath, String label, int priority, boolean acked, long activeSince) {
        this.source = source == null ? "" : source;
        this.displayPath = displayPath == null || displayPath.isEmpty() ? this.source : displayPath;
        this.label = label == null ? "" : label;
        this.priority = Math.max(DIAGNOSTIC, Math.min(CRITICAL, priority));
        this.acked = acked;
        this.activeSince = activeSince;
        this.sourceKey = this.source.toLowerCase(Locale.ROOT);
        this.displayKey = this.displayPath.toLowerCase(Locale.ROOT);
    }

    public String source() {
        return source;
    }

    public String displayPath() {
        return displayPath;
    }

    public String label() {
        return label;
    }

    public int priority() {
        return priority;
    }

    public boolean acked() {
        return acked;
    }

    public long activeSince() {
        return activeSince;
    }

    /** The source path, lower-cased (what {@link SourceFilter} matches). */
    String sourceKey() {
        return sourceKey;
    }

    /** The display path, lower-cased (what {@link SourceFilter} matches). */
    String displayKey() {
        return displayKey;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof ActiveAlarm a && a.priority == priority && a.acked == acked && a.activeSince == activeSince
            && a.source.equals(source) && a.displayPath.equals(displayPath) && a.label.equals(label);
    }

    @Override
    public int hashCode() {
        return Objects.hash(source, displayPath, label, priority, acked, activeSince);
    }

    @Override
    public String toString() {
        return "ActiveAlarm[" + displayPath + ", " + PRIORITY_KEYS[priority] + (acked ? ", acked" : "") + "]";
    }
}
