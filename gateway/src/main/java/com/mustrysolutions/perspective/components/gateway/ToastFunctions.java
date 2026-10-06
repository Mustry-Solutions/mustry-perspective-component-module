package com.mustrysolutions.perspective.components.gateway;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.python.core.Py;
import org.python.core.PyObject;

import com.inductiveautomation.ignition.common.gson.JsonObject;
import com.inductiveautomation.ignition.common.script.builtin.KeywordArgs;
import com.inductiveautomation.ignition.common.script.builtin.PyArgumentMap;
import com.inductiveautomation.ignition.common.script.hints.JythonElement;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.perspective.gateway.api.PerspectiveContext;
import com.inductiveautomation.perspective.gateway.model.PageModel;
import com.inductiveautomation.perspective.gateway.session.InternalSession;

/**
 * {@code system.mustry.toast(...)}: show a toast on Perspective pages.
 *
 * <p>Target resolution, in order: an explicit {@code pageId} (within the given
 * or current session); the calling page, when the script runs on one and no
 * {@code sessionId} was given; otherwise every open page of the given or current
 * session. A gateway-scope script (timer, message handler, WebDev) has no
 * current session and must pass {@code sessionId}.
 *
 * <p>The page renders the toast with the MustryToasts bundle, which the gateway
 * hook adds to every page (see {@link GlobalBrowserResources}).
 */
public class ToastFunctions {

    /** Message protocol; must match TOAST_PROTOCOL in web/typescript/toast/toastLogic.ts. */
    public static final String PROTOCOL = "mustry-toast";

    static final List<String> TYPES = List.of("info", "success", "warning", "error");
    static final double DEFAULT_DURATION_SECONDS = 5.0;

    private static final LoggerEx log = LoggerEx.newBuilder().build(
        "MustrySolutions.PerspectiveComponents.Toast");

    private final Supplier<PerspectiveContext> context;

    public ToastFunctions(Supplier<PerspectiveContext> context) {
        this.context = context;
    }

    /**
     * Show a toast. Returns the number of pages it was sent to. Invalid input or
     * a missing target raises a Python ValueError, so scripts can catch it with
     * a plain {@code except ValueError}.
     */
    @JythonElement(docBundlePrefix = "ToastFunctions")
    @KeywordArgs(
        names = {"message", "title", "type", "duration", "className", "sessionId", "pageId"},
        types = {String.class, String.class, String.class, Double.class, String.class, String.class, String.class})
    public int toast(PyObject[] args, String[] keywords) {
        try {
            return send(PyArgumentMap.interpretPyArgs(args, keywords, ToastFunctions.class, "toast"));
        } catch (IllegalArgumentException e) {
            throw Py.ValueError(e.getMessage());
        }
    }

    private int send(PyArgumentMap a) {
        JsonObject payload = buildPayload(
            a.getStringArg("message", null),
            a.getStringArg("title", null),
            a.getStringArg("type", null),
            a.getDoubleArg("duration", null),
            a.getStringArg("className", null));

        List<PageModel> pages = resolvePages(a.getStringArg("sessionId", null), a.getStringArg("pageId", null));
        int sent = 0;
        for (PageModel page : pages) {
            try {
                page.send(PROTOCOL, payload);
                sent++;
            } catch (Exception e) {
                // A page closing at this moment must not fail the toast for the others.
                log.debugf("Toast not delivered to page %s: %s", page.getId(), e.getMessage());
            }
        }
        return sent;
    }

    /**
     * Validate the script arguments and build the client payload. Pure, so it
     * is unit-tested without a gateway.
     *
     * @throws IllegalArgumentException when there is no message or title, or the type is unknown
     */
    static JsonObject buildPayload(String message, String title, String type, Double duration, String className) {
        String msg = message == null ? "" : message;
        String ttl = title == null ? "" : title;
        if (msg.isBlank() && ttl.isBlank()) {
            throw new IllegalArgumentException("toast() needs a message or a title.");
        }
        String normalizedType = normalizeType(type);
        double seconds = duration == null || duration.isNaN() || duration.isInfinite()
            ? DEFAULT_DURATION_SECONDS : duration;

        JsonObject payload = new JsonObject();
        payload.addProperty("id", UUID.randomUUID().toString());
        payload.addProperty("message", msg);
        payload.addProperty("title", ttl);
        payload.addProperty("type", normalizedType);
        payload.addProperty("duration", seconds);
        payload.addProperty("className", className == null ? "" : className);
        return payload;
    }

    /**
     * Case-insensitive type check; null or blank means "info".
     *
     * @throws IllegalArgumentException for anything other than info, success, warning or error
     */
    static String normalizeType(String type) {
        if (type == null || type.isBlank()) {
            return "info";
        }
        String key = type.trim().toLowerCase(Locale.ROOT);
        if (!TYPES.contains(key)) {
            throw new IllegalArgumentException(
                String.format("Unknown toast type '%s'; use one of %s.", type, TYPES));
        }
        return key;
    }

    private List<PageModel> resolvePages(String sessionId, String pageId) {
        boolean explicitSession = sessionId != null && !sessionId.isBlank();
        InternalSession session = explicitSession ? findSession(sessionId) : InternalSession.SESSION.get();
        if (session == null) {
            throw new IllegalArgumentException(
                "No Perspective session on this thread; pass sessionId (and optionally pageId) "
                    + "when calling toast() from gateway scope.");
        }

        if (pageId != null && !pageId.isBlank()) {
            PageModel page = session.findPage(pageId).orElseThrow(() -> new IllegalArgumentException(
                String.format("Page '%s' not found in session %s.", pageId, session.getSessionId())));
            return List.of(page);
        }

        PageModel current = PageModel.PAGE.get();
        if (!explicitSession && current != null && current.getSession() == session) {
            return List.of(current);
        }
        return new ArrayList<>(session.getPages());
    }

    private InternalSession findSession(String sessionId) {
        UUID id;
        try {
            id = UUID.fromString(sessionId.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(String.format("'%s' is not a Perspective session id.", sessionId));
        }
        Optional<InternalSession> session = context.get().getSessionMonitor().findSession(id);
        return session.orElseThrow(() -> new IllegalArgumentException(
            String.format("Perspective session %s not found.", sessionId)));
    }
}
