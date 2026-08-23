import { useCallback, useEffect, useRef, useState } from 'react';

export interface Tab {
    id: string; // stable across the tab's life → iframe key, so the frame never remounts
    url: string; // path (+query) shown in the frame and remembered for refresh-restore
    title: string;
}

const STORAGE_PREFIX = 'whmis:workspace-tabs';
const HOME: Omit<Tab, 'id'> = { url: '/dashboard', title: 'Dashboard' };
export const MAX_TABS = 15;

/**
 * Per-user storage key. localStorage is shared by everyone on the same browser,
 * so the open-tabs set must be namespaced by user id — otherwise the next person
 * to sign in on this browser inherits the previous user's tabs.
 */
function storageKey(scope: string | number | undefined): string {
    return `${STORAGE_PREFIX}:${scope ?? 'anon'}`;
}

function newId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/** Tab identity is the pathname (query ignored), so filters/pagination don't fork a tab. */
function pathOf(url: string): string {
    try {
        return new URL(url, window.location.origin).pathname;
    } catch {
        return url;
    }
}

interface Persisted {
    items: { url: string; title: string }[];
    active: number;
}

function loadInitial(key: string): { tabs: Tab[]; activeId: string } {
    let items: { url: string; title: string }[] = [];
    let active = 0;

    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw) as Persisted;
                if (Array.isArray(parsed.items)) {
                    items = parsed.items.filter((i) => i && typeof i.url === 'string');
                    active = Math.min(Math.max(parsed.active ?? 0, 0), Math.max(items.length - 1, 0));
                }
            }
        } catch {
            // ignore corrupt storage
        }
    }

    if (items.length === 0) items = [HOME];
    const tabs = items.slice(0, MAX_TABS).map((i) => ({ id: newId(), url: i.url, title: i.title || i.url }));

    return { tabs, activeId: tabs[active]?.id ?? tabs[0].id };
}

export function useTabs(scope?: string | number) {
    const key = storageKey(scope);
    const initialRef = useRef<{ tabs: Tab[]; activeId: string } | null>(null);
    const seed = (initialRef.current ??= loadInitial(key));

    const [tabs, setTabs] = useState<Tab[]>(seed.tabs);
    const [activeId, setActiveId] = useState<string>(seed.activeId);

    // Ref mirror so the callbacks can read current tabs synchronously without
    // nesting setState calls inside updaters.
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;

    // Persist tabs + active index for refresh-restore.
    useEffect(() => {
        try {
            const active = Math.max(tabs.findIndex((t) => t.id === activeId), 0);
            const payload: Persisted = { items: tabs.map((t) => ({ url: t.url, title: t.title })), active };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch {
            // ignore quota/serialisation errors
        }
    }, [tabs, activeId, key]);

    const focusTab = useCallback((id: string) => setActiveId(id), []);

    const openTab = useCallback((url: string, title?: string) => {
        const path = pathOf(url);
        const existing = tabsRef.current.find((t) => pathOf(t.url) === path);
        if (existing) {
            setActiveId(existing.id);
            return;
        }
        if (tabsRef.current.length >= MAX_TABS) {
            // soft cap: keep the last tab focused, refuse to open beyond the limit
            setActiveId(tabsRef.current[tabsRef.current.length - 1].id);
            return;
        }
        const tab: Tab = { id: newId(), url, title: title || path };
        setTabs((prev) => [...prev, tab]);
        setActiveId(tab.id);
    }, []);

    const closeTab = useCallback((id: string) => {
        const current = tabsRef.current;
        const index = current.findIndex((t) => t.id === id);
        if (index === -1) return;

        const next = current.filter((t) => t.id !== id);
        if (next.length === 0) {
            const home: Tab = { id: newId(), url: HOME.url, title: HOME.title };
            setTabs([home]);
            setActiveId(home.id);
            return;
        }
        setTabs(next);
        setActiveId((active) => (active === id ? (next[index] ?? next[index - 1]).id : active));
    }, []);

    // Relabel / re-url a tab from a frame's tab-state message (mount or in-tab redirect).
    const updateTab = useCallback((id: string, patch: { url?: string; title?: string }) => {
        setTabs((prev) =>
            prev.map((t) =>
                t.id === id
                    ? { ...t, ...(patch.url ? { url: patch.url } : {}), ...(patch.title ? { title: patch.title } : {}) }
                    : t,
            ),
        );
    }, []);

    const atLimit = tabs.length >= MAX_TABS;

    return { tabs, activeId, openTab, focusTab, closeTab, updateTab, atLimit };
}
