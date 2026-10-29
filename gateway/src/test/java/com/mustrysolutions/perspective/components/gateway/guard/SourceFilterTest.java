package com.mustrysolutions.perspective.components.gateway.guard;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.inductiveautomation.ignition.common.gson.JsonObject;
import com.inductiveautomation.ignition.common.model.values.BasicQualifiedValue;
import com.inductiveautomation.ignition.common.model.values.QualifiedValue;

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

    @Test
    void globSemantics() {
        assertTrue(SourceFilter.globMatches("a*b*c", "axxbyyc"));
        assertTrue(SourceFilter.globMatches("a*b*c", "abc"));
        assertFalse(SourceFilter.globMatches("a*b*c", "axxbyy"));
        assertTrue(SourceFilter.globMatches("*", ""));
        assertTrue(SourceFilter.globMatches("", ""));
        assertFalse(SourceFilter.globMatches("", "a"));
        assertTrue(SourceFilter.globMatches("*ab", "aab"));
        assertFalse(SourceFilter.globMatches("?", "a"));
        assertEquals("a*b*", SourceFilter.normalise("A***B**"));
    }

    @Test
    void pathologicalPatternsMatchInLinearTime() {
        // As a regex, ten stars took forever on a single gateway-wide thread.
        String path = "a".repeat(200);
        ActiveAlarm alarm = alarm(path, path);
        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
            for (int i = 0; i < 1000; i++) {
                assertFalse(SourceFilter.of(List.of("**********zz")).matches(alarm));
                assertFalse(SourceFilter.of(List.of("*a*a*a*a*a*a*a*a*a*a*a*a*b")).matches(alarm));
            }
            assertTrue(SourceFilter.of(List.of("**********a")).matches(alarm));
        });
    }

    @Test
    void capsPatternCountAndLength() {
        List<String> many = new ArrayList<>();
        for (int i = 0; i < SourceFilter.MAX_PATTERNS; i++) {
            many.add("nothing" + i);
        }
        many.add("*Line2*");
        SourceFilter capped = SourceFilter.of(many);
        assertEquals(SourceFilter.MAX_PATTERNS, capped.patterns().size());
        assertFalse(capped.matches(LINE2));

        // An over-long pattern is ignored; if it was the only one, nothing matches (never everything).
        String tooLong = "*" + "x".repeat(SourceFilter.MAX_PATTERN_LENGTH);
        assertFalse(SourceFilter.of(List.of(tooLong)).matches(LINE1));
        assertTrue(SourceFilter.of(List.of(tooLong, "*Line2*")).matches(LINE2));
    }

    @Test
    void readsPatternsFromAPropertyTreeValue() {
        // An array node reads as QualifiedValue[].
        QualifiedValue[] array = {new BasicQualifiedValue("Line 1/*"), new BasicQualifiedValue("*Line2*")};
        assertEquals(List.of("Line 1/*", "*Line2*"), SourceFilter.fromProperty(array).patterns());
        assertEquals(List.of("Line 1/*", "*Line2*"), SourceFilter.fromProperty(new BasicQualifiedValue(array)).patterns());
        assertEquals(List.of("a", "b"), SourceFilter.fromProperty(List.of("a", "b")).patterns());
        assertEquals(List.of("solo"), SourceFilter.fromProperty("solo").patterns());
        // A usable pattern next to garbage: the garbage is skipped.
        assertEquals(List.of("a"), SourceFilter.fromProperty(new Object[] {"a", 42}).patterns());
    }

    @Test
    void unsetOrEmptySourcesMeanEveryAlarm() {
        assertSame(SourceFilter.ALL, SourceFilter.fromProperty(null));
        assertSame(SourceFilter.ALL, SourceFilter.fromProperty(new QualifiedValue[0]));
        assertSame(SourceFilter.ALL, SourceFilter.fromProperty(new Object[] {" ", null}));
        assertSame(SourceFilter.ALL, SourceFilter.fromProperty(new BasicQualifiedValue(null)));
    }

    @Test
    void setButUnusableSourcesMatchNothing() {
        // An object, a number, an array of non-strings: a broken scope hides alarms, never shows them all.
        assertSame(SourceFilter.NONE, SourceFilter.fromProperty(7));
        assertSame(SourceFilter.NONE, SourceFilter.fromProperty(new JsonObject()));
        assertSame(SourceFilter.NONE, SourceFilter.fromProperty(new Object[] {1, 2}));
        assertSame(SourceFilter.NONE, SourceFilter.fromProperty(new BasicQualifiedValue(new QualifiedValue[] {new BasicQualifiedValue(3)})));
        assertFalse(SourceFilter.NONE.matches(LINE1));
        assertFalse(SourceFilter.NONE.equals(SourceFilter.ALL));
        // Critical still counts: AlarmSummary never filters it.
        ActiveAlarm critical = new ActiveAlarm("s", "Line 1/x", "c", ActiveAlarm.CRITICAL, false, 1);
        assertEquals(1, AlarmSummary.of(List.of(critical), SourceFilter.NONE, 3).getAsJsonObject("active").get("critical").getAsInt());
        assertEquals(0, AlarmSummary.of(List.of(critical), SourceFilter.NONE, 3).getAsJsonArray("top").size());
    }
}
