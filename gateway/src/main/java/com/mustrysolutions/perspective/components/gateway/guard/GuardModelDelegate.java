package com.mustrysolutions.perspective.components.gateway.guard;

import java.util.ArrayList;
import java.util.List;

import com.inductiveautomation.ignition.common.gson.JsonElement;
import com.inductiveautomation.ignition.common.gson.JsonObject;
import com.inductiveautomation.perspective.gateway.api.Component;
import com.inductiveautomation.perspective.gateway.api.ComponentModelDelegate;
import com.inductiveautomation.perspective.gateway.messages.EventFiredMsg;

/**
 * Gateway half of one Idle Guard. The browser (guardDelegate.ts) fires
 * {@code screensaver-subscribe} with its source patterns when it mounts and
 * whenever they change; from then on the shared {@link AlarmFeed} pushes
 * {@code screensaver-alarms} to it until the component goes away.
 */
public class GuardModelDelegate extends ComponentModelDelegate implements AlarmFeed.Subscriber {

    static final String EVT_SUBSCRIBE = "screensaver-subscribe";
    static final String EVT_ALARMS = "screensaver-alarms";

    /** How many alarms the banner lists. */
    static final int DEFAULT_TOP = 3;

    private final AlarmFeed feed;
    private volatile SourceFilter filter = SourceFilter.ALL;
    private volatile int top = DEFAULT_TOP;

    public GuardModelDelegate(Component component, AlarmFeed feed) {
        super(component);
        this.feed = feed;
    }

    @Override
    protected void onStartup() {
        log.debugf("Idle Guard delegate up for %s", where());
    }

    @Override
    protected void onShutdown() {
        if (feed != null) {
            feed.unsubscribe(this);
        }
        log.debugf("Idle Guard delegate down for %s", where());
    }

    private String where() {
        return component.getSession().getSessionId() + "@" + component.getComponentAddressPath();
    }

    @Override
    public void handleEvent(EventFiredMsg message) {
        if (!EVT_SUBSCRIBE.equals(message.getEventName()) || feed == null) {
            return;
        }
        JsonObject payload = message.getEvent();
        this.filter = SourceFilter.of(sources(payload));
        if (payload != null && payload.has("top") && payload.get("top").isJsonPrimitive()) {
            this.top = Math.max(0, Math.min(AlarmSummary.MAX_TOP, payload.get("top").getAsInt()));
        }
        feed.subscribe(this);
        feed.pushNow(this);
    }

    static List<String> sources(JsonObject payload) {
        List<String> out = new ArrayList<>();
        if (payload != null && payload.has("sources") && payload.get("sources").isJsonArray()) {
            for (JsonElement el : payload.getAsJsonArray("sources")) {
                if (el != null && el.isJsonPrimitive()) {
                    out.add(el.getAsString());
                }
            }
        }
        return out;
    }

    @Override
    public SourceFilter filter() {
        return filter;
    }

    @Override
    public int top() {
        return top;
    }

    @Override
    public void push(JsonObject payload) {
        fireEvent(EVT_ALARMS, payload);
    }

    @Override
    public void fireEvent(String eventName, JsonObject event) {
        this.component.fireEvent("model", eventName, event);
    }
}
