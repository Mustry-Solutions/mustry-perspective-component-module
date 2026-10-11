package com.mustrysolutions.perspective.components.gateway.guard;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class SourceFilterTest {

    private static ActiveAlarm alarm(String source, String display) {
        return new ActiveAlarm(source, display, "x", ActiveAlarm.HIGH, false, 0);
    }

    private static final ActiveAlarm LINE1 = alarm("prov:default:/tag:Line1/Speed:/alm:High", "Line 1/Speed high");
    private static final ActiveAlarm LINE2 = alarm("prov:default:/tag:Line2/Temp:/alm:High", "");

    @Test
    void emptyMeansEverything() {
        assertSame(SourceFilter.ALL, SourceFilter.of(List.of()));
        assertSame(SourceFilter.ALL, SourceFilter.of(Arrays.asList(" ", null, "")));
        assertSame(SourceFilter.ALL, SourceFilter.of(null));
        assertTrue(SourceFilter.ALL.matches(LINE1));
    }

    @Test
    void matchesDisplayPathOrSourceCaseInsensitively() {
        SourceFilter byDisplay = SourceFilter.of(List.of("line 1*"));
        assertTrue(byDisplay.matches(LINE1));
        assertFalse(byDisplay.matches(LINE2));

        SourceFilter bySource = SourceFilter.of(List.of("prov:default:/tag:Line2/*"));
        assertTrue(bySource.matches(LINE2));
        assertFalse(bySource.matches(LINE1));
    }

    @Test
    void displayPathFallsBackToSource() {
        assertTrue(SourceFilter.of(List.of("*Line2/Temp*")).matches(LINE2));
    }

    @Test
    void starIsTheOnlyWildcard() {
        // Regex characters in a pattern are literal.
        assertFalse(SourceFilter.of(List.of("Line.1*")).matches(LINE1));
        assertTrue(SourceFilter.of(List.of("*Speed*")).matches(LINE1));
        assertTrue(SourceFilter.of(List.of("*")).matches(LINE2));
        // Without a star the whole path must match.
        assertFalse(SourceFilter.of(List.of("Line 1")).matches(LINE1));
        assertTrue(SourceFilter.of(List.of("Line 1/Speed high")).matches(LINE1));
    }

    @Test
    void anyPatternMatches() {
        SourceFilter f = SourceFilter.of(List.of("nothing*", "*Line2*"));
        assertTrue(f.matches(LINE2));
        assertFalse(f.matches(LINE1));
    }
}
