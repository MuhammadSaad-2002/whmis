import { NavMain } from '@/components/nav-main';
import { navGroups } from '@/components/nav-config';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { usePermissions } from '@/hooks/use-permissions';
import { Link } from '@inertiajs/react';
import AppLogo from './app-logo';

interface AppSidebarProps {
    // When provided (workspace shell), nav items open tabs instead of navigating
    // the whole document, and `activeUrl` drives the active highlight.
    onNavigate?: (url: string, title: string) => void;
    activeUrl?: string;
}

export function AppSidebar({ onNavigate, activeUrl }: AppSidebarProps = {}) {
    const { can } = usePermissions();
    const visibleGroups = navGroups
        .map((group) => ({ ...group, items: group.items.filter((item) => can(item.permission)) }))
        .filter((group) => group.items.length > 0);

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            {onNavigate ? (
                                <button type="button" onClick={() => onNavigate('/dashboard', 'Dashboard')}>
                                    <AppLogo />
                                </button>
                            ) : (
                                <Link href="/dashboard" prefetch>
                                    <AppLogo />
                                </Link>
                            )}
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain groups={visibleGroups} onNavigate={onNavigate} activeUrl={activeUrl} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
