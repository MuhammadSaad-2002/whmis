import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { usePermissions } from '@/hooks/use-permissions';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import {
    BadgePercent,
    Banknote,
    BarChart3,
    BookUser,
    Boxes,
    Building2,
    ClipboardList,
    LayoutGrid,
    Pill,
    ScrollText,
    ShieldCheck,
    ShoppingCart,
    Store,
    Tags,
    TrendingUp,
    Undo2,
    Users,
} from 'lucide-react';
import AppLogo from './app-logo';

type PermittedNavItem = NavItem & { permission: string };

const navGroups: { label: string; items: PermittedNavItem[] }[] = [
    {
        label: 'Overview',
        items: [{ title: 'Dashboard', url: '/dashboard', icon: LayoutGrid, permission: 'dashboard.view' }],
    },
    {
        label: 'Transactions',
        items: [
            { title: 'Bookings', url: '/bookings', icon: ClipboardList, permission: 'bookings.view' },
            { title: 'Sales Invoices', url: '/sales', icon: TrendingUp, permission: 'sales.view' },
            { title: 'Purchase Invoices', url: '/purchases', icon: ShoppingCart, permission: 'purchases.view' },
            { title: 'Returns', url: '/returns/sales', icon: Undo2, permission: 'returns.view' },
        ],
    },
    {
        label: 'Finance',
        items: [
            { title: 'Payments', url: '/payments', icon: Banknote, permission: 'payments.view' },
            { title: 'Outstanding', url: '/ledger/outstanding', icon: BookUser, permission: 'ledger.view' },
        ],
    },
    {
        label: 'Inventory',
        items: [
            { title: 'Inventory', url: '/inventory', icon: Boxes, permission: 'inventory.view' },
            { title: 'Products', url: '/products', icon: Pill, permission: 'products.view' },
            { title: 'Categories', url: '/categories', icon: Tags, permission: 'categories.view' },
        ],
    },
    {
        label: 'Master Data',
        items: [
            { title: 'Customers', url: '/customers', icon: Store, permission: 'customers.view' },
            { title: 'Suppliers', url: '/suppliers', icon: Building2, permission: 'suppliers.view' },
            { title: 'Incentive Rules', url: '/incentives', icon: BadgePercent, permission: 'incentives.view' },
        ],
    },
    {
        label: 'Reports',
        items: [{ title: 'Reports', url: '/reports', icon: BarChart3, permission: 'reports.view' }],
    },
    {
        label: 'Administration',
        items: [
            { title: 'Users', url: '/users', icon: Users, permission: 'users.manage' },
            { title: 'Roles & Permissions', url: '/roles', icon: ShieldCheck, permission: 'roles.manage' },
            { title: 'Audit Log', url: '/audit-log', icon: ScrollText, permission: 'audit.view' },
        ],
    },
];

export function AppSidebar() {
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
                            <Link href="/dashboard" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain groups={visibleGroups} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
