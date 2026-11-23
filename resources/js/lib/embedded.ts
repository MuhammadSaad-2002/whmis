import { PRODUCT_NAME } from '@/lib/brand';
import { router } from '@inertiajs/react';

export const WORKSPACE_PATH = '/workspace';
export const WORKSPACE_TAB_BREAKPOINT = 1024;
export const GLOBAL_SEARCH_PERMISSION = 'global-search.use';
const SOURCE = 'whmis';

export type ShellMessage =
    | { source: typeof SOURCE; type: 'open-tab'; url: string }
    | { source: typeof SOURCE; type: 'tab-state'; path: string; title: string; canGoBack: boolean }
    | { source: typeof SOURCE; type: 'global-search' };

interface DraftGuard {
    dirty: () => boolean;
    saving: () => boolean;
    ask: () => Promise<boolean>;
}

interface FrameNavigation {
    visit: (url: string) => void;
    back: () => void;
    needsLeaveCheck: () => boolean;
    confirmLeave: () => Promise<boolean>;
}

declare global {
    interface Window {
        tradentraFrame?: FrameNavigation;
    }
}

let draftGuard: DraftGuard | undefined;
let canGoBack = false;

export function registerDraftGuard(guard: DraftGuard) {
    draftGuard = guard;
    return () => { if (draftGuard === guard) draftGuard = undefined; };
}

export function workspacePath(url: unknown): string | null {
    if (typeof url !== 'string' || !url.trim() || url.trim() === '#') return null;
    try {
        const target = new URL(url, window.location.href);
        const pathname = target.pathname.replace(/\/+$/, '') || '/';
        if (target.origin !== window.location.origin || !['http:', 'https:'].includes(target.protocol)
            || ['/', WORKSPACE_PATH, '/login', '/logout'].includes(pathname)) return null;
        return target.pathname + target.search + target.hash;
    } catch {
        return null;
    }
}

export function isFramed(): boolean {
    return typeof window !== 'undefined' && window.self !== window.top;
}

export function currentPath(): string {
    return window.location.pathname + window.location.search + window.location.hash;
}

function postToShell(message: ShellMessage): void {
    if (isFramed()) window.parent.postMessage(message, window.location.origin);
}

export function isGlobalSearchShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
        && !event.isComposing && event.key.toLowerCase() === 'k';
}

export function requestGlobalSearch(): void {
    postToShell({ source: SOURCE, type: 'global-search' });
}

export function reportTabState(title: string): void {
    const suffix = ` - ${PRODUCT_NAME}`;
    const name = title || document.title;
    postToShell({ source: SOURCE, type: 'tab-state', path: currentPath(), title: name.endsWith(suffix) ? name.slice(0, -suffix.length) : name, canGoBack });
}

export function openWorkspaceTab(url: string): void {
    const path = workspacePath(url);
    if (!path) return;
    if (isFramed() && window.matchMedia(`(width >= ${WORKSPACE_TAB_BREAKPOINT}px)`).matches) {
        postToShell({ source: SOURCE, type: 'open-tab', url: path });
    } else {
        router.visit(path);
    }
}

export function frameNavigation(frame?: HTMLIFrameElement): FrameNavigation | undefined {
    try { return frame?.contentWindow?.tradentraFrame; } catch { return undefined; }
}

interface View {
    path: string;
    left: number;
    top: number;
}

function screen(path: string): string {
    const url = new URL(path, window.location.origin);
    return url.pathname.endsWith('/create') ? url.pathname + url.search : url.pathname;
}

function scrollToView(view: View) {
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ left: view.left, top: view.top, behavior: 'instant' })));
}

/** Ordinary visits stay in the active frame. Each frame owns its Back stack. */
export function initEmbeddedNav(): void {
    if (!isFramed()) return;

    const stack: View[] = [];
    let displayed = currentPath();
    let displayedState: unknown = window.history.state;
    let outgoing: (View & { replace: boolean }) | undefined;
    let backTarget: View | undefined;
    let nativeTarget: string | undefined;
    let bypass = false;

    const capture = (): View => ({ path: displayed, left: window.scrollX, top: window.scrollY });
    const needsLeaveCheck = () => !!(draftGuard?.dirty() || draftGuard?.saving());
    const confirmLeave = () => needsLeaveCheck() && draftGuard ? draftGuard.ask() : Promise.resolve(true);
    const allowedOnce = (action: () => void) => {
        bypass = true;
        try { action(); } finally { bypass = false; }
    };
    function navigateBack(target: View) {
        backTarget = target;
        router.visit(target.path, {
            replace: true,
            onSuccess: () => scrollToView(target),
            onFinish: () => { backTarget = undefined; },
        });
    }
    window.tradentraFrame = {
        needsLeaveCheck,
        confirmLeave,
        visit: (url) => {
            const path = workspacePath(url);
            if (path && path !== currentPath()) router.visit(path);
        },
        back: () => {
            const target = stack.at(-1);
            if (!target || backTarget) return;
            if (!needsLeaveCheck()) navigateBack(target);
            else void confirmLeave().then((leave) => { if (leave) allowedOnce(() => navigateBack(target)); });
        },
    };

    router.on('before', ({ detail: { visit } }) => {
        if (visit.prefetch) return true;
        const path = workspacePath(visit.url.href);
        const leavesView = path && (screen(path) !== screen(displayed) || (path !== displayed && !visit.preserveState));
        if (visit.method === 'get' && leavesView && !bypass && needsLeaveCheck()) {
            void confirmLeave().then((leave) => { if (leave) allowedOnce(() => router.visit(visit.url, visit)); });
            return false;
        }
        if (!visit.async) {
            outgoing = { ...capture(), replace: visit.replace };
            displayedState = window.history.state;
        }
        return true;
    });

    // Clean Back/Forward uses Inertia's own history restoration. Dirty native
    // navigation keeps the editor open while the user chooses what to do.
    window.addEventListener('popstate', (event) => {
        const target = currentPath();
        if (target === displayed) return;
        if (needsLeaveCheck()) {
            event.stopImmediatePropagation();
            window.history.pushState(displayedState, '', displayed);
            const stored = stack.findLast((entry) => entry.path === target);
            const scroll = event.state?.documentScrollPosition;
            void confirmLeave().then((leave) => {
                if (leave && workspacePath(target)) {
                    allowedOnce(() => navigateBack(stored ?? { path: target, left: scroll?.left ?? 0, top: scroll?.top ?? 0 }));
                }
            });
            return;
        }
        nativeTarget = target;
    }, { capture: true });

    function recordNavigation(url: string) {
        const next = workspacePath(url);
        if (!next) return;
        if (screen(next) !== screen(displayed)) {
            if (backTarget) {
                const index = stack.lastIndexOf(backTarget);
                if (index >= 0) stack.splice(index);
            } else if (nativeTarget) {
                const index = stack.findLastIndex((entry) => screen(entry.path) === screen(next));
                if (index >= 0) stack.splice(index);
                else stack.push(outgoing ?? capture());
            } else if (!outgoing?.replace) {
                stack.push(outgoing ?? capture());
            }
            if (stack.length > 40) stack.shift();
        }
        nativeTarget = undefined;
        outgoing = undefined;
        displayed = next;
        displayedState = window.history.state;
        canGoBack = stack.length > 0;
    }

    // Replace visits (filter/search, toolbar Back, first save) do not emit navigate.
    router.on('navigate', ({ detail: { page } }) => recordNavigation(page.url));
    router.on('success', ({ detail: { page } }) => recordNavigation(page.url));
    router.on('error', () => recordNavigation(currentPath()));
}
