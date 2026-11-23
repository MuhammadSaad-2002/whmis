import { workspacePath } from '@/lib/embedded';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Tab {
    id: string;
    url: string;
    title: string;
    canGoBack?: boolean;
}

type Destination = Pick<Tab, 'url' | 'title'>;
const STORAGE_KEY = 'whmis:workspace-tabs';
export const WORKSPACE_LOGOUT_EVENT = 'whmis:workspace-logout';
export const MAX_TABS = 6;

const newId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const pathOf = (url: string) => new URL(url, window.location.origin).pathname;
const identity = (url: string) => pathOf(url).endsWith('/create') ? url.split('#')[0] : pathOf(url);

export function clearWorkspaceTabs(): void {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage disabled. */ }
}

export function endWorkspaceSession(): void {
    clearWorkspaceTabs();
    try { localStorage.setItem(WORKSPACE_LOGOUT_EVENT, newId()); } catch { /* Other windows revalidate on next request. */ }
}

function clearLegacyTabs(): void {
    try {
        for (let index = localStorage.length - 1; index >= 0; index--) {
            const key = localStorage.key(index);
            if (key === STORAGE_KEY || key?.startsWith(`${STORAGE_KEY}:`)) localStorage.removeItem(key);
        }
    } catch { /* Older versions used localStorage. */ }
}

interface Persisted {
    version: 2;
    scope: string;
    items: Destination[];
    active: number;
}

function loadInitial(scope: string, home: Destination, singleView: boolean, requested: string | null) {
    let items: Destination[] = [];
    let active = 0;
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Persisted | null;
        if (saved?.version === 2 && scope && saved.scope === scope && Array.isArray(saved.items)) {
            items = saved.items.flatMap((entry) => {
                const path = workspacePath(entry?.url);
                return path && typeof entry.title === 'string' ? [{ url: path, title: entry.title }] : [];
            }).slice(0, MAX_TABS);
            active = Math.max(0, items.findIndex((entry) => entry.url === saved.items[saved.active]?.url));
        }
    } catch { /* Ignore old/corrupt state. */ }
    if (!items.length) items = [home];
    if (home.url !== '/dashboard') items = items.map((item) => pathOf(item.url) === '/dashboard' ? home : item);
    if (requested) {
        const match = items.findIndex((item) => identity(item.url) === identity(requested));
        if (match >= 0) active = match;
        if (items[active].url !== requested) items[active] = { url: requested, title: pathOf(requested) };
    }
    if (singleView) { items = [items[active]]; active = 0; }
    const tabs = items.map((item) => ({ ...item, id: newId() }));
    return { tabs, activeId: tabs[active].id };
}

export function useTabs(scope: string, home: Destination, singleView: boolean, requested: string | null) {
    const [initial] = useState(() => loadInitial(scope, home, singleView, requested));
    const [tabs, setTabs] = useState<Tab[]>(initial.tabs);
    const [activeId, setActiveId] = useState(initial.activeId);
    const tabsRef = useRef(tabs);
    const apply = useCallback((next: Tab[]) => {
        tabsRef.current = next;
        setTabs(next);
    }, []);
    useEffect(clearLegacyTabs, []);
    useEffect(() => {
        if (!scope) return;
        try {
            const active = Math.max(tabs.findIndex((tab) => tab.id === activeId), 0);
            const data: Persisted = { version: 2, scope, items: tabs.map(({ url, title }) => ({ url, title })), active };
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch { /* Storage disabled. */ }
    }, [tabs, activeId, scope]);

    const openTab = useCallback((raw: string) => {
        const url = workspacePath(raw);
        if (!url) return false;
        const existing = tabsRef.current.find((tab) => identity(tab.url) === identity(url));
        if (existing) { setActiveId(existing.id); return true; }
        if (tabsRef.current.length >= MAX_TABS) return false;
        const tab = { id: newId(), url, title: pathOf(url) };
        apply([...tabsRef.current, tab]);
        setActiveId(tab.id);
        return true;
    }, [apply]);

    const closeTabs = (ids: string[]) => {
        const current = tabsRef.current;
        const next = current.filter((tab) => !ids.includes(tab.id));
        if (next.length) {
            apply(next);
            setActiveId((active) => !ids.includes(active) ? active :
                next[Math.min(current.findIndex((tab) => tab.id === active), next.length - 1)]?.id ?? next[0].id);
        } else {
            const tab = { ...home, id: newId() };
            apply([tab]);
            setActiveId(tab.id);
        }
    };

    const updateTab = useCallback((id: string, url: string, title: string, canGoBack: boolean) => {
        const tab = tabsRef.current.find((item) => item.id === id);
        if (!tab || (tab.url === url && tab.title === title && !!tab.canGoBack === canGoBack)) return;
        apply(tabsRef.current.map((item) => item.id === id ? { ...item, url, title, canGoBack } : item));
    }, [apply]);

    return { tabs, activeId, openTab, focusTab: setActiveId, closeTabs, updateTab };
}
