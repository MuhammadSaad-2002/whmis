import { FlashToaster } from '@/components/flash-toaster';
import { LicenseBanner } from '@/components/license-banner';
import { WORKSPACE_PATH, currentPath, isFramed, reportTabState } from '@/lib/embedded';
import { type BreadcrumbItem } from '@/types';
import { router } from '@inertiajs/react';
import { useEffect } from 'react';

interface AppLayoutProps {
    children: React.ReactNode;
    breadcrumbs?: BreadcrumbItem[];
}

// Every page wraps this. Two modes:
//  - Framed (running as a workspace tab): render only the page + toaster; the
//    workspace shell owns the sidebar/header/footer. Report title/url up so the
//    owning tab stays labelled and refresh-restorable.
//  - Top document (deep link / bookmark / post-login): hand off to the tabbed
//    workspace so there is one consistent experience.
export default function AppLayout({ children }: AppLayoutProps) {
    const framed = isFramed();

    useEffect(() => {
        if (framed) {
            const report = () => requestAnimationFrame(() => reportTabState(document.title));
            report();
            return router.on('navigate', report);
        }

        if (window.location.pathname !== WORKSPACE_PATH) {
            window.location.replace(`${WORKSPACE_PATH}?open=${encodeURIComponent(currentPath())}`);
        }
    }, [framed]);

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
