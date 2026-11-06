// The gateway's time zone, for components whose data the gateway evaluates (the
// admin managers: Ignition runs schedules and holidays in its own zone, not the
// operator's). Read from the session's own property tree, where Perspective keeps
// session.props.gateway.timezone in the browser: nothing to bind, no round trip.

/** The part of a component store this needs. */
export interface SessionPropsHost {
    view: { page: { sessionProps?: { read(path: string): unknown } } };
}

/** The gateway's IANA zone, or '' when this session can't report one. */
export function gatewayTimeZone(store: SessionPropsHost): string {
    try {
        const id = store.view.page.sessionProps?.read('gateway.timezone.id');
        return typeof id === 'string' ? id : '';
    } catch (e) {
        return '';
    }
}

/** The zone an admin manager reads "now" in: config.timezone, else the gateway's. */
export function managerTimeZone(configured: string, store: SessionPropsHost): string {
    return configured || gatewayTimeZone(store);
}
