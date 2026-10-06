// Entry point of the separate MustryToasts bundle. The gateway adds this bundle
// to every page (see ToastResources in the gateway scope), so system.mustry.toast()
// works on any page without placing a component. It registers a handler for the
// toast message protocol on the page's connection once the client store exists.
import { ClientStore } from '@inductiveautomation/perspective-client';
import { ToastHost } from './ToastHost';
import { TOAST_PROTOCOL, normalizeToast } from './toastLogic';
import '../scss/toast.scss';

declare global {
    interface Window {
        __client?: ClientStore;
        __mustryToasts?: ToastHost;
    }
}

let counter = 0;
const makeId = (): string => `mustry-toast-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function install(store: ClientStore): void {
    const host = window.__mustryToasts ?? new ToastHost(document);
    window.__mustryToasts = host;
    store.connection.handlers.set(TOAST_PROTOCOL, (payload: unknown) => {
        const toast = normalizeToast(payload, makeId);
        if (toast) {
            host.show(toast);
        }
    });
}

// The client store is created after the bundles load; poll briefly for it.
function waitForStore(attempt = 0): void {
    const store = window.__client;
    if (store && store.connection && store.connection.handlers) {
        install(store);
        return;
    }
    if (attempt < 600) {
        window.setTimeout(() => waitForStore(attempt + 1), 50);
    }
}

waitForStore();

export { ToastHost };
