import { useCallback, useEffect, useRef, useState } from 'react';

export interface Tab {
    id: string; // stable across the tab's life → iframe key, so the frame never remounts
    url: string; // path (+query) shown in the frame and remembered for refresh-restore
    title: string;
}

const STORAGE_KEY = 'whmis:workspace-tabs';
const HOME: Omit<Tab, 'id'> = { url: '/dashboard', title: 'Dashboard' };
export const MAX_TABS = 15;

export function clearWorkspaceTabs(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage may be disabled in the browser.
    }
}

export const WORKSPACE_LOGOUT_EVENT = 'whmis:workspace-logout';

export function endWorkspaceSession(): void {
    clearWorkspaceTabs();
    try {
        localStorage.setItem(WORKSPACE_LOGOUT_EVENT, newId());
    } catch {
        // Other browser tabs will revalidate on their next server request.
    }
}

function clearLegacyTabs(): void {
    try {
        for (let index = localStorage.length - 1; index >= 0; index--) {
            const key = localStorage.key(index);
            if (key === STORAGE_KEY || key?.startsWith(`${STORAGE_KEY}:`)) localStorage.removeItem(key);
        }
    } catch {
        // Older versions used localStorage. The current workspace never reads it.
    }
}

function newId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function pathOf(url: string): string {
    try {
        return new URL(url, window.location.origin).pathname;
    } catch {
        return url;
    }
}

/** Keep filters in one tab, but don't reuse a booking draft for a different customer or repeat source. */
function tabIdentity(url: string): string {
    const path = pathOf(url);
    if (path !== '/bookings/create') return path;

    const params = new URL(url, window.location.origin).searchParams;
    return JSON.stringify([path, params.get('customer_id'), params.get('repeat_booking_id')]);
}

interface Persisted {
    scope: string;
    items: { url: string; title: string }[];
    active: number;
}

function loadInitial(scope: string, home: Omit<Tab, 'id'>): { tabs: Tab[]; activeId: string } {
    let items: { url: string; title: string }[] = [];
    let active = 0;

    if (typeof window !== 'undefined') {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Persisted;
                if (scope && parsed.scope === scope && Array.isArray(parsed.items)) {
                    items = parsed.items.filter((item) => item && isWorkspaceUrl(item.url) && typeof item.title === 'string');
                    const activeUrl = parsed.items[parsed.active]?.url;
                    active = Math.max(items.findIndex((item) => item.url === activeUrl), 0);
                }
            }
        } catch {
            // ignore corrupt storage
        }
    }

    if (items.length === 0) items = [home];
    if (home.url !== HOME.url) items = items.map(item => pathOf(item.url) === HOME.url ? home : item);
    const tabs = items.slice(0, MAX_TABS).map((i) => ({ id: newId(), url: i.url, title: i.title || i.url }));

    return { tabs, activeId: tabs[active]?.id ?? tabs[0].id };
}

export function useTabs(scope: string, home: Omit<Tab, 'id'> = HOME) {
    const initialRef = useRef<{ tabs: Tab[]; activeId: string } | null>(null);
    const seed = (initialRef.current ??= loadInitial(scope, home));

    const [tabs, setTabs] = useState<Tab[]>(seed.tabs);
    const [activeId, setActiveId] = useState<string>(seed.activeId);

    // Ref mirror so the callbacks can read current tabs synchronously without
    // nesting setState calls inside updaters.
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;

    useEffect(clearLegacyTabs, []);

    // Restore on refresh only within this authenticated session and browser tab.
    useEffect(() => {
        if (!scope) return;
        try {
            const active = Math.max(tabs.findIndex((t) => t.id === activeId), 0);
            const payload: Persisted = { scope, items: tabs.map((t) => ({ url: t.url, title: t.title })), active };
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // ignore quota/serialisation errors
        }
    }, [tabs, activeId, scope]);

    const focusTab = useCallback((id: string) => setActiveId(id), []);

    const openTab = useCallback((url: string, title?: string) => {
        if (!isWorkspaceUrl(url)) return;
        const identity = tabIdentity(url);
        const existing = tabsRef.current.find((t) => tabIdentity(t.url) === identity);
        if (existing) {
            setActiveId(existing.id);
            return;
        }
        if (tabsRef.current.length >= MAX_TABS) {
            // soft cap: keep the last tab focused, refuse to open beyond the limit
            setActiveId(tabsRef.current[tabsRef.current.length - 1].id);
            return;
        }
        const tab: Tab = { id: newId(), url, title: title || pathOf(url) };
        setTabs((prev) => [...prev, tab]);
        setActiveId(tab.id);
    }, []);

    const closeTab = useCallback((id: string) => {
        const current = tabsRef.current;
        const index = current.findIndex((t) => t.id === id);
        if (index === -1) return;

        const next = current.filter((t) => t.id !== id);
        if (next.length === 0) {
            const homeTab: Tab = { id: newId(), ...home };
            setTabs([homeTab]);
            setActiveId(homeTab.id);
            return;
        }
        setTabs(next);
        setActiveId((active) => (active === id ? (next[index] ?? next[index - 1]).id : active));
    }, [home]);

    // Close every tab and return to the user's accessible home page.
    const closeAll = useCallback(() => {
        const homeTab: Tab = { id: newId(), ...home };
        setTabs([homeTab]);
        setActiveId(homeTab.id);
    }, [home]);

    // Relabel / re-url a tab from a frame's tab-state message (mount or in-tab redirect).
    const updateTab = useCallback((id: string, patch: { url?: string; title?: string }) => {
        if (patch.url && !isWorkspaceUrl(patch.url)) return;
        setTabs((prev) =>
            prev.map((t) =>
                t.id === id
                    ? { ...t, ...(patch.url ? { url: patch.url } : {}), ...(patch.title ? { title: patch.title } : {}) }
                    : t,
            ),
        );
    }, []);

    const atLimit = tabs.length >= MAX_TABS;

    return { tabs, activeId, openTab, focusTab, closeTab, closeAll, updateTab, atLimit };
}

function isWorkspaceUrl(url: unknown): url is string {
    if (typeof url !== 'string' || !url.startsWith('/')) return false;
    try {
        const target = new URL(url, window.location.origin);
        return target.origin === window.location.origin && !['/', '/workspace', '/login', '/logout'].includes(target.pathname);
    } catch {
        return false;
    }
}
