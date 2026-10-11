package com.mustrysolutions.perspective.components.gateway.guard;

/**
 * One active alarm, reduced to what the guard needs. Built from the gateway's
 * {@code AlarmEvent} by {@link AlarmFeed#fromGateway}; plain data so the
 * filter and summary logic test without a gateway.
 *
 * @param source      the source path, e.g. {@code prov:default:/tag:Line1/Speed:/alm:High}
 * @param displayPath the display path, or the source path when none is set
 * @param label       the alarm label (falls back to its name)
 * @param priority    0 = Diagnostic ... 4 = Critical ({@code AlarmPriority.getIntValue()})
 * @param acked       acknowledged (still active)
 * @param activeSince epoch ms the alarm went active
 */
public record ActiveAlarm(String source, String displayPath, String label, int priority, boolean acked, long activeSince) {

    public static final int DIAGNOSTIC = 0;
    public static final int LOW = 1;
    public static final int MEDIUM = 2;
    public static final int HIGH = 3;
    public static final int CRITICAL = 4;

    /** JSON keys of the counts, by priority. Must match alarmPolicy.ts. */
    static final String[] PRIORITY_KEYS = {"diagnostic", "low", "medium", "high", "critical"};

    public ActiveAlarm {
        source = source == null ? "" : source;
        displayPath = displayPath == null || displayPath.isEmpty() ? source : displayPath;
        label = label == null ? "" : label;
        priority = Math.max(DIAGNOSTIC, Math.min(CRITICAL, priority));
    }
}
