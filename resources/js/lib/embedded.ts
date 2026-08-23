import { router } from '@inertiajs/react';

// Shared contract between the workspace shell (top document) and the pages it
// hosts inside <iframe>s. Same-origin only, so we can postMessage freely.

export const WORKSPACE_PATH = '/workspace';
const SOURCE = 'whmis';

// Page <title>s are templated as "<Page> - <AppName>" (see app.tsx). Tabs show
// only the page part, so strip the app-name suffix before labelling a tab.
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Laravel';
function stripAppName(title: string): string {
    const suffix = ` - ${APP_NAME}`;
    return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

export type ShellMessage =
    // A different-page navigation happened inside a frame → open/focus a tab.
    | { source: typeof SOURCE; type: 'open-tab'; url: string }
    // The frame's own page/title changed (mount, in-tab redirect) → relabel the
    // owning tab and remember its current url for refresh-restore.
    | { source: typeof SOURCE; type: 'tab-state'; path: string; title: string };

/** True when this document is running inside another frame (i.e. a workspace tab). */
export function isFramed(): boolean {
    try {
        return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
        // Cross-origin access throws — treat as framed to be safe.
        return true;
    }
}

/** Current path (no origin), used as a tab's identity. */
export function currentPath(): string {
    return window.location.pathname + window.location.search;
}

function postToShell(message: ShellMessage): void {
    if (typeof window === 'undefined' || window.parent === window.self) return;
    window.parent.postMessage(message, window.location.origin);
}

/** Tell the shell this frame's page title / url so it can relabel the tab. */
export function reportTabState(title: string): void {
    if (!isFramed()) return;
    postToShell({ source: SOURCE, type: 'tab-state', path: currentPath(), title: stripAppName(title || document.title) });
}

/**
 * Inside a frame, intercept Inertia navigations:
 *  - non-GET (saves/posts/deletes) stay in the frame (redirect-after-POST lands here too);
 *  - GET to the SAME pathname (filters, pagination, sort) stays in the frame;
 *  - GET to a DIFFERENT pathname is a drill-down → cancel it and ask the shell to
 *    open/focus a tab instead.
 * Call once at app boot; it no-ops when not framed.
 */
export function initEmbeddedNav(): void {
    if (!isFramed()) return;

    router.on('before', (event) => {
        const visit = event.detail.visit;
        if (visit.method !== 'get') return true;

        const target = new URL(String(visit.url), window.location.origin);
        if (target.pathname === window.location.pathname) return true; // same page, refine in place

        postToShell({ source: SOURCE, type: 'open-tab', url: target.pathname + target.search });
        return false; // cancel the in-frame navigation; the shell takes over
    });
}
