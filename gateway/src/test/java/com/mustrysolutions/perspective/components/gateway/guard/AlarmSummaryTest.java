package com.mustrysolutions.perspective.components.gateway.guard;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.inductiveautomation.ignition.common.gson.JsonArray;
import com.inductiveautomation.ignition.common.gson.JsonObject;

class AlarmSummaryTest {

    private static final List<ActiveAlarm> ALARMS = List.of(
        new ActiveAlarm("s/a", "Line 1/A", "Low one", ActiveAlarm.LOW, false, 100),
        new ActiveAlarm("s/b", "Line 1/B", "High acked", ActiveAlarm.HIGH, true, 200),
        new ActiveAlarm("s/c", "Line 2/C", "Critical", ActiveAlarm.CRITICAL, false, 50),
        new ActiveAlarm("s/d", "Line 1/D", "Medium new", ActiveAlarm.MEDIUM, false, 300),
        new ActiveAlarm("s/e", "Line 1/E", "Medium old", ActiveAlarm.MEDIUM, false, 10));

    @Test
    void countsActiveAndUnackedByPriority() {
        JsonObject s = AlarmSummary.of(ALARMS, SourceFilter.ALL, 3);
        JsonObject active = s.getAsJsonObject("active");
        JsonObject unacked = s.getAsJsonObject("unacked");
        assertEquals(1, active.get("critical").getAsInt());
        assertEquals(1, active.get("high").getAsInt());
        assertEquals(2, active.get("medium").getAsInt());
        assertEquals(1, active.get("low").getAsInt());
        assertEquals(0, active.get("diagnostic").getAsInt());
        assertEquals(0, unacked.get("high").getAsInt());
        assertEquals(1, unacked.get("critical").getAsInt());
    }

    @Test
    void topIsUnackedFirstThenPriorityThenNewest() {
        JsonArray top = AlarmSummary.of(ALARMS, SourceFilter.ALL, 10).getAsJsonArray("top");
        assertEquals(5, top.size());
        assertEquals("Critical", top.get(0).getAsJsonObject().get("label").getAsString());
        assertEquals("Medium new", top.get(1).getAsJsonObject().get("label").getAsString());
        assertEquals("Medium old", top.get(2).getAsJsonObject().get("label").getAsString());
        assertEquals("Low one", top.get(3).getAsJsonObject().get("label").getAsString());
        assertEquals("High acked", top.get(4).getAsJsonObject().get("label").getAsString());
        assertEquals("critical", top.get(0).getAsJsonObject().get("priority").getAsString());
    }

    @Test
    void topIsCapped() {
        assertEquals(2, AlarmSummary.of(ALARMS, SourceFilter.ALL, 2).getAsJsonArray("top").size());
        assertEquals(0, AlarmSummary.of(ALARMS, SourceFilter.ALL, -1).getAsJsonArray("top").size());
        assertEquals(5, AlarmSummary.of(ALARMS, SourceFilter.ALL, 99).getAsJsonArray("top").size());
    }

    @Test
    void filterAppliesToCountsAndTop() {
        JsonObject s = AlarmSummary.of(ALARMS, SourceFilter.of(List.of("Line 1/*")), 10);
        assertEquals(0, s.getAsJsonObject("active").get("critical").getAsInt());
        assertEquals(4, s.getAsJsonArray("top").size());
    }
}
