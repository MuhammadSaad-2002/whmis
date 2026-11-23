import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { NotificationBell } from '@/components/notification-bell';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { TabBar } from '@/components/workspace/tab-bar';
import { WorkspaceFrame } from '@/components/workspace/workspace-frame';
import { clearWorkspaceTabs, useTabs, WORKSPACE_LOGOUT_EVENT } from '@/hooks/use-tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { WORKSPACE_PATH, type ShellMessage } from '@/lib/embedded';
import { Head, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export default function Workspace({ tabScope }: { tabScope: string }) {
    return <WorkspaceSession key={tabScope} tabScope={tabScope} />;
}

function WorkspaceSession({ tabScope }: { tabScope: string }) {
    const auth = (usePage().props as { auth?: { permissions?: string[] } }).auth;
    const home = useMemo(() => {
        const permissions = auth?.permissions ?? [];
        if (permissions.includes('dashboard.view')) return { url: '/dashboard', title: 'Dashboard' };
        if (permissions.includes('employees.view')) return { url: '/hr/employees', title: 'Employees' };
        if (permissions.includes('hr.self.view')) return { url: '/hr/my-profile', title: 'My HR' };
        return { url: '/settings/profile', title: 'Profile' };
    }, [auth?.permissions]);
    const { tabs, activeId, openTab, focusTab, closeTab, closeAll, updateTab } = useTabs(tabScope, home);
    // Phones don't get the tab strip — navigation just swaps the visible page.
    const isMobile = useIsMobile();

    // Map tab id → its iframe element, so incoming tab-state messages can be
    // attributed to the frame that sent them.
    const frames = useRef(new Map<string, HTMLIFrameElement>());
    const registerRef = useCallback((id: string, el: HTMLIFrameElement | null) => {
        if (el) frames.current.set(id, el);
        else frames.current.delete(id);
    }, []);

    const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? tabs[0], [tabs, activeId]);
    const activePath = useMemo(() => {
        try {
            return new URL(activeTab.url, window.location.origin).pathname;
        } catch {
            return activeTab.url;
        }
    }, [activeTab]);

    // Honour a ?open=<path> hand-off from a deep link / bookmark, then tidy the URL.
    useEffect(() => {
        const open = new URLSearchParams(window.location.search).get('open');
        if (open) {
            openTab(open);
            window.history.replaceState(null, '', WORKSPACE_PATH);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
    }, []);

    // Listen for messages from the framed pages.
    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) window.location.reload();
        };
        const onLogout = (event: StorageEvent) => {
            if (event.key !== WORKSPACE_LOGOUT_EVENT) return;
            clearWorkspaceTabs();
            window.location.replace(WORKSPACE_PATH);
        };
        window.addEventListener('pageshow', onPageShow);
        window.addEventListener('storage', onLogout);
        return () => {
            window.removeEventListener('pageshow', onPageShow);
            window.removeEventListener('storage', onLogout);
        };
    }, []);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data as ShellMessage | undefined;
            if (!data || data.source !== 'whmis') return;

            if (data.type === 'open-tab') {
                if ([...frames.current.values()].some((frame) => frame.contentWindow === event.source)) openTab(data.url);
                return;
            }
            if (data.type === 'tab-state') {
                for (const [id, el] of frames.current.entries()) {
                    if (el.contentWindow === event.source) {
                        updateTab(id, { url: data.path, title: data.title });
                        break;
                    }
                }
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [openTab, updateTab]);

    // Give the active frame focus so keyboard-driven grids work immediately.
    useEffect(() => {
        frames.current.get(activeId)?.contentWindow?.focus();
    }, [activeId]);

    return (
        <AppShell variant="sidebar">
            <Head title={activeTab?.title ?? 'Workspace'} />
            <AppSidebar onNavigate={openTab} activeUrl={activePath} />
            <AppContent variant="sidebar" className="h-svh overflow-hidden">
                <header className="border-sidebar-border/50 flex h-12 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1 shrink-0" />
                    {isMobile ? (
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{activeTab?.title}</span>
                    ) : (
                        <TabBar tabs={tabs} activeId={activeId} onFocus={focusTab} onClose={closeTab} onCloseAll={closeAll} />
                    )}
                    <NotificationBell />
                </header>

                <div className="relative flex-1 overflow-hidden bg-background">
                    {tabs.map((tab) => (
                        <WorkspaceFrame
                            key={tab.id}
                            id={tab.id}
                            src={tab.url}
                            title={tab.title}
                            active={tab.id === activeId}
                            registerRef={registerRef}
                        />
                    ))}
                </div>
            </AppContent>
        </AppShell>
    );
}
