package com.mustrysolutions.perspective.components.gateway.guard;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The guard's {@code alarm.sources}: glob patterns matched against an alarm's
 * display path and its source path, case-insensitively. {@code *} matches any
 * run of characters (slashes included); everything else is literal. No
 * patterns means every alarm counts.
 */
public final class SourceFilter {

    public static final SourceFilter ALL = new SourceFilter(List.of());

    private final List<String> raw;
    private final List<Pattern> patterns;

    private SourceFilter(List<String> raw) {
        this.raw = List.copyOf(raw);
        List<Pattern> compiled = new ArrayList<>();
        for (String p : this.raw) {
            compiled.add(compile(p));
        }
        this.patterns = List.copyOf(compiled);
    }

    /** Blank entries are dropped; an all-blank list is {@link #ALL}. */
    public static SourceFilter of(List<String> patterns) {
        List<String> kept = new ArrayList<>();
        if (patterns != null) {
            for (String p : patterns) {
                if (p != null && !p.isBlank()) {
                    kept.add(p.trim());
                }
            }
        }
        return kept.isEmpty() ? ALL : new SourceFilter(kept);
    }

    static Pattern compile(String glob) {
        StringBuilder re = new StringBuilder();
        StringBuilder literal = new StringBuilder();
        for (char c : glob.toLowerCase(Locale.ROOT).toCharArray()) {
            if (c == '*') {
                if (literal.length() > 0) {
                    re.append(Pattern.quote(literal.toString()));
                    literal.setLength(0);
                }
                re.append(".*");
            } else {
                literal.append(c);
            }
        }
        if (literal.length() > 0) {
            re.append(Pattern.quote(literal.toString()));
        }
        return Pattern.compile(re.toString(), Pattern.DOTALL);
    }

    public boolean matches(ActiveAlarm alarm) {
        if (patterns.isEmpty()) {
            return true;
        }
        String display = alarm.displayPath().toLowerCase(Locale.ROOT);
        String source = alarm.source().toLowerCase(Locale.ROOT);
        for (Pattern p : patterns) {
            if (p.matcher(display).matches() || p.matcher(source).matches()) {
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
