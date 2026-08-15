import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavItem } from '@/types';
import { Link, usePage } from '@inertiajs/react';

type NavGroup = { label: string; items: NavItem[] };

interface NavMainProps {
    groups: NavGroup[];
    // When provided (workspace shell), items open tabs instead of navigating the
    // whole document. `activeUrl` then drives the active highlight (the active tab's path).
    onNavigate?: (url: string, title: string) => void;
    activeUrl?: string;
}

export function NavMain({ groups = [], onNavigate, activeUrl }: NavMainProps) {
    const page = usePage();
    const currentUrl = activeUrl ?? page.url;

    return (
        <>
            {groups.map((group) => (
                <SidebarGroup key={group.label} className="px-2 py-0">
                    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                    <SidebarMenu>
                        {group.items.map((item) => (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton asChild isActive={item.url === currentUrl}>
                                    {onNavigate ? (
                                        <button type="button" onClick={() => onNavigate(item.url, item.title)}>
                                            {item.icon && <item.icon />}
                                            <span>{item.title}</span>
                                        </button>
                                    ) : (
                                        <Link href={item.url} prefetch>
                                            {item.icon && <item.icon />}
                                            <span>{item.title}</span>
                                        </Link>
                                    )}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            ))}
        </>
    );
}
