import { FlashToaster } from '@/components/flash-toaster';
import { LicenseBanner } from '@/components/license-banner';
import { usePermissions } from '@/hooks/use-permissions';
import { GLOBAL_SEARCH_PERMISSION, WORKSPACE_PATH, currentPath, isFramed, isGlobalSearchShortcut, reportTabState, requestGlobalSearch } from '@/lib/embedded';
import { type BreadcrumbItem } from '@/types';
import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';

interface AppLayoutProps {
    children: React.ReactNode;
    breadcrumbs?: BreadcrumbItem[];
}

// Every page wraps this. Two modes:
//  - Framed (running as a workspace tab): render only the page + toaster; the
//    workspace shell owns navigation. Report the latest URL and Back availability.
//  - Top document (deep link / bookmark): hand off to the workspace.
export default function AppLayout({ children }: AppLayoutProps) {
    const framed = isFramed();
    const { url } = usePage();
    const canSearchPages = usePermissions().can(GLOBAL_SEARCH_PERMISSION);

    useEffect(() => {
        if (!framed || !canSearchPages) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !isGlobalSearchShortcut(event)) return;
            event.preventDefault();
            if (!event.repeat) requestGlobalSearch();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [framed, canSearchPages]);

    useEffect(() => {
        if (framed) {
            let reportedTitle = '';
            const report = () => {
                if (reportedTitle === document.title) return;
                reportedTitle = document.title;
                reportTabState(reportedTitle || window.location.pathname);
            };
            const frame = requestAnimationFrame(report);
            const observer = new MutationObserver(report);
            observer.observe(document.head, { childList: true, subtree: true, characterData: true });
            return () => {
                observer.disconnect();
                cancelAnimationFrame(frame);
            };
        }

        if (window.location.pathname !== WORKSPACE_PATH) {
            window.location.replace(`${WORKSPACE_PATH}?open=${encodeURIComponent(currentPath())}`);
        }
    }, [framed, url]);

    if (framed) {
        return (
            <>
                <FlashToaster />
                <LicenseBanner />
                {children}
            </>
        );
    }

    // Top document: redirecting into the workspace, so render nothing.
    return null;
}
