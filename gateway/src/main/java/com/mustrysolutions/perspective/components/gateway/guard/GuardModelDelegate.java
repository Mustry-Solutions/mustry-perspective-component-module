package com.mustrysolutions.perspective.components.gateway.guard;

import java.util.List;

import com.inductiveautomation.ignition.common.gson.JsonObject;
import com.inductiveautomation.ignition.common.model.values.QualifiedValue;
import com.inductiveautomation.perspective.common.api.PropertyType;
import com.inductiveautomation.perspective.gateway.api.Component;
import com.inductiveautomation.perspective.gateway.api.ComponentModelDelegate;
import com.inductiveautomation.perspective.gateway.messages.EventFiredMsg;
import com.inductiveautomation.perspective.gateway.property.PropertyTree;

/**
 * Gateway half of one Idle Guard. The browser (guardDelegate.ts) fires
 * {@code screensaver-subscribe} when it mounts and whenever its source
 * patterns change; from then on the shared {@link AlarmFeed} pushes
 * {@code screensaver-alarms} to it until the component goes away.
 *
 * <p>The subscribe message is only a trigger: its content is ignored. The
 * source patterns come from the component's own {@code alarm.sources} in the
 * gateway's property tree, and the banner length is {@link #DEFAULT_TOP}, so
 * a user on a lobby screen cannot widen what that screen receives by sending
 * a crafted message.
 */
public class GuardModelDelegate extends ComponentModelDelegate implements AlarmFeed.Subscriber {

    static final String EVT_SUBSCRIBE = "screensaver-subscribe";
    static final String EVT_ALARMS = "screensaver-alarms";

    /** The props path of the source patterns. */
    static final String SOURCES_PATH = "alarm.sources";

    /** How many alarms the banner lists. */
    static final int DEFAULT_TOP = 3;

    private final AlarmFeed feed;
    private volatile SourceFilter filter = SourceFilter.ALL;
    /** Set on shutdown: a subscribe event arriving after it must not re-subscribe a dead delegate. Guarded by this. */
    private boolean down;

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
        synchronized (this) {
            down = true;
            if (feed != null) {
                feed.unsubscribe(this);
            }
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
        SourceFilter configured = SourceFilter.of(configuredSources());
        synchronized (this) {
            if (down) {
                return;
            }
            this.filter = configured;
            feed.subscribe(this);
        }
        feed.pushNow(this);
    }

    /** {@code alarm.sources} as the gateway holds it; empty (every alarm) when unset or unreadable. */
    private List<String> configuredSources() {
        PropertyTree props = component.getPropertyTreeOf(PropertyType.props);
        if (props == null) {
            return List.of();
        }
        return props.read(SOURCES_PATH)
            .map(QualifiedValue::getValue)
            .map(SourceFilter::patternsOf)
            .orElse(List.of());
    }

    @Override
    public SourceFilter filter() {
        return filter;
    }

    @Override
    public int top() {
        return DEFAULT_TOP;
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
