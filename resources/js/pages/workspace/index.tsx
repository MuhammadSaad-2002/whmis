import { TabBar } from '@/components/workspace/tab-bar';
import { WorkspaceFrame } from '@/components/workspace/workspace-frame';
import { WorkspaceTopBar } from '@/components/workspace/workspace-top-bar';
import { useIsMobile } from '@/hooks/use-mobile';
import { clearWorkspaceTabs, endWorkspaceSession, MAX_TABS, useTabs, WORKSPACE_LOGOUT_EVENT } from '@/hooks/use-tabs';
import { frameNavigation, WORKSPACE_PATH, WORKSPACE_TAB_BREAKPOINT, workspacePath, type ShellMessage } from '@/lib/embedded';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function Workspace({ tabScope }: { tabScope: string }) {
    return <WorkspaceSession key={tabScope} tabScope={tabScope} />;
}

function WorkspaceSession({ tabScope }: { tabScope: string }) {
    const { auth } = usePage<SharedData>().props;
    const singleView = useIsMobile(WORKSPACE_TAB_BREAKPOINT);
    const [requested] = useState(() => workspacePath(new URLSearchParams(window.location.search).get('open')));
    const [notice, setNotice] = useState('');
    const home = useMemo(() => {
        const permissions = auth?.permissions ?? [];
        if (permissions.includes('dashboard.view')) return { url: '/dashboard', title: 'Dashboard' };
        if (permissions.includes('employees.view')) return { url: '/hr/employees', title: 'Employees' };
        if (permissions.includes('hr.self.view')) return { url: '/hr/my-profile', title: 'My HR' };
        return { url: '/settings/profile', title: 'Profile' };
    }, [auth?.permissions]);
    const { tabs, activeId, openTab, focusTab, closeTabs, updateTab } = useTabs(tabScope, home, singleView, requested);
    const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
    const activePath = new URL(active.url, window.location.origin).pathname;
    const frames = useRef(new Map<string, HTMLIFrameElement>());
    const checking = useRef(false);
    const registerRef = useCallback((id: string, el: HTMLIFrameElement | null) => {
        if (el) frames.current.set(id, el);
        else frames.current.delete(id);
    }, []);

    // Deep links seed the current view without mounting Dashboard first.
    useEffect(() => {
        if (!requested) return;
        let frame: number;
        let tries = 0;
        const clearHandoff = () => {
            if (!new URLSearchParams(window.location.search).has('open')) return;
            if (window.history.state?.page) {
                window.history.replaceState(window.history.state, '', WORKSPACE_PATH);
            } else if (++tries < 60) {
                frame = requestAnimationFrame(clearHandoff);
            }
        };
        frame = requestAnimationFrame(clearHandoff);
        return () => cancelAnimationFrame(frame);
    }, [requested]);

    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
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
            const sender = [...frames.current.entries()].find(([, frame]) => frame.contentWindow === event.source);
            if (!sender) return;
            const [id] = sender;
            if (data.type === 'open-tab') {
                if (singleView || checking.current || id !== activeId || !workspacePath(data.url)) return;
                setNotice(openTab(data.url) ? '' : `You have ${MAX_TABS} workspace tabs open. Close one before opening another.`);
            } else if (data.type === 'tab-state') {
                const url = workspacePath(data.path);
                if (url && typeof data.title === 'string') updateTab(id, url, data.title, data.canGoBack === true);
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [activeId, openTab, singleView, updateTab]);

    const navigate = (url: string) => {
        if (checking.current) return;
        const path = workspacePath(url);
        const frame = frames.current.get(activeId);
        if (!path || !frame || path === active.url) return;
        setNotice('');
        const controller = frameNavigation(frame);
        if (controller) controller.visit(path);
        else frame.src = path;
    };

    const withLeaveChecks = async (ids: string[], action: () => void) => {
        if (checking.current) return;
        checking.current = true;
        try {
            for (const id of ids) {
                const controller = frameNavigation(frames.current.get(id));
                if (!controller?.needsLeaveCheck()) continue;
                focusTab(id);
                if (!await controller.confirmLeave()) return;
            }
            setNotice('');
            action();
        } finally {
            checking.current = false;
        }
    };
    const close = (ids: string[]) => void withLeaveChecks(ids, () => closeTabs(ids));

    return (
        <div className="flex h-svh w-full min-w-0 flex-col overflow-hidden">
            <Head title={active.title} />
            <WorkspaceTopBar activePath={activePath} home={home} onNavigate={navigate}
                onBack={active.canGoBack ? () => {
                    if (!checking.current) frameNavigation(frames.current.get(activeId))?.back();
                } : undefined}
                onLogout={() => void withLeaveChecks(tabs.map((tab) => tab.id), () => router.post(route('logout'), {}, { onSuccess: endWorkspaceSession }))} />
            {!singleView && tabs.length > 1 && (
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border/50 px-3 md:px-4">
                    <TabBar tabs={tabs} activeId={activeId}
                        onFocus={(id) => { if (!checking.current) { setNotice(''); focusTab(id); } }}
                        onClose={(id) => close([id])} onCloseAll={() => close(tabs.map((tab) => tab.id))} />
                </div>
            )}
            {notice && <p role="status" className="shrink-0 border-b bg-accent px-4 py-2 text-sm text-accent-foreground">{notice}</p>}
            <main className="relative flex-1 overflow-hidden bg-background">
                {tabs.map((tab) => (
                    <WorkspaceFrame key={tab.id} id={tab.id} src={tab.url} title={tab.title}
                        active={tab.id === activeId} registerRef={registerRef} />
                ))}
            </main>
        </div>
    );
}
