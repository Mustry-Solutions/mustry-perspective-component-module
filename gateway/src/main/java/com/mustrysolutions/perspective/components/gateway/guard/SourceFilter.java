package com.mustrysolutions.perspective.components.gateway.guard;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.inductiveautomation.ignition.common.gson.JsonPrimitive;
import com.inductiveautomation.ignition.common.model.values.QualifiedValue;

/**
 * The guard's {@code config.alarm.sources}: glob patterns matched against an alarm's
 * display path and its source path, case-insensitively. {@code *} matches any
 * run of characters (slashes included); everything else is literal. No
 * patterns means every alarm counts.
 *
 * <p>Matching is an iterative two-pointer glob match, never a regex: a pattern
 * like {@code **********zz} used to compile to nested {@code .*} and backtrack
 * catastrophically on the single gateway-wide poll thread. The work per match
 * is bounded by pattern length times path length, and both the number of
 * patterns ({@link #MAX_PATTERNS}) and their length ({@link #MAX_PATTERN_LENGTH})
 * are capped.
 */
public final class SourceFilter {

    /** Patterns past this many are ignored. */
    public static final int MAX_PATTERNS = 32;
    /** A longer pattern is ignored (it matches nothing). */
    public static final int MAX_PATTERN_LENGTH = 256;

    public static final SourceFilter ALL = new SourceFilter(List.of());

    private final List<String> raw;
    /** Lower-cased, runs of stars collapsed; over-long patterns left out. */
    private final List<String> globs;

    private SourceFilter(List<String> raw) {
        this.raw = List.copyOf(raw);
        List<String> kept = new ArrayList<>();
        for (String p : this.raw) {
            if (p.length() <= MAX_PATTERN_LENGTH) {
                kept.add(normalise(p));
            }
        }
        this.globs = List.copyOf(kept);
    }

    /**
     * Blank entries are dropped; an all-blank list is {@link #ALL}. At most
     * {@link #MAX_PATTERNS} patterns are kept. A list whose every pattern is
     * over-long matches nothing (never everything: the filter exists to hide
     * alarms from a screen).
     */
    public static SourceFilter of(List<String> patterns) {
        List<String> kept = new ArrayList<>();
        if (patterns != null) {
            for (String p : patterns) {
                if (kept.size() >= MAX_PATTERNS) {
                    break;
                }
                if (p != null && !p.isBlank()) {
                    kept.add(p.trim());
                }
            }
        }
        return kept.isEmpty() ? ALL : new SourceFilter(kept);
    }

    /**
     * The patterns in a property value as the gateway's PropertyTree reads
     * {@code config.alarm.sources}: an array node reads as a {@code QualifiedValue[]};
     * plain arrays, collections and a single string are accepted too. Anything
     * that is not a string is skipped.
     */
    public static List<String> patternsOf(Object value) {
        List<String> out = new ArrayList<>();
        Object v = unwrap(value);
        if (v instanceof Object[] array) {
            for (Object el : array) {
                addString(out, el);
            }
        } else if (v instanceof Iterable<?> items) {
            for (Object el : items) {
                addString(out, el);
            }
        } else {
            addString(out, v);
        }
        return out;
    }

    private static Object unwrap(Object value) {
        return value instanceof QualifiedValue qv ? qv.getValue() : value;
    }

    private static void addString(List<String> out, Object el) {
        Object v = unwrap(el);
        if (v instanceof JsonPrimitive p && p.isString()) {
            out.add(p.getAsString());
        } else if (v instanceof String s) {
            out.add(s);
        }
    }

    /** Lower-case, and collapse runs of stars (they mean the same as one). */
    static String normalise(String glob) {
        StringBuilder out = new StringBuilder(glob.length());
        for (char c : glob.toLowerCase(Locale.ROOT).toCharArray()) {
            if (c == '*' && out.length() > 0 && out.charAt(out.length() - 1) == '*') {
                continue;
            }
            out.append(c);
        }
        return out.toString();
    }

    /**
     * Does {@code text} match {@code glob} ({@code *} = any run, the rest
     * literal, both already lower-cased)? Iterative: on a mismatch it backs up
     * to the last star and lets that star take one more character, so it never
     * recurses and never revisits an earlier star.
     */
    static boolean globMatches(String glob, String text) {
        int g = 0;
        int t = 0;
        int star = -1;
        int resume = 0;
        while (t < text.length()) {
            if (g < glob.length() && glob.charAt(g) == '*') {
                star = g++;
                resume = t;
            } else if (g < glob.length() && glob.charAt(g) == text.charAt(t)) {
                g++;
                t++;
            } else if (star >= 0) {
                g = star + 1;
                t = ++resume;
            } else {
                return false;
            }
        }
        while (g < glob.length() && glob.charAt(g) == '*') {
            g++;
        }
        return g == glob.length();
    }

    public boolean matches(ActiveAlarm alarm) {
        if (raw.isEmpty()) {
            return true;
        }
        // Lower-cased once per alarm (ActiveAlarm), not once per guard.
        String display = alarm.displayKey();
        String source = alarm.sourceKey();
        for (String g : globs) {
            if (globMatches(g, display) || globMatches(g, source)) {
                return true;
            }
        }
        return false;
    }

    public List<String> patterns() {
        return raw;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof SourceFilter f && f.raw.equals(raw);
    }

    @Override
    public int hashCode() {
        return raw.hashCode();
    }
}
