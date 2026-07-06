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
    ShoppingCart,
    Store,
    Tags,
    TrendingUp,
    Undo2,
} from 'lucide-react';
import AppLogo from './app-logo';

const allNavItems: (NavItem & { permission: string })[] = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutGrid, permission: 'dashboard.view' },
    { title: 'Bookings', url: '/bookings', icon: ClipboardList, permission: 'bookings.view' },
    { title: 'Sales Invoices', url: '/sales', icon: TrendingUp, permission: 'sales.view' },
    { title: 'Purchase Invoices', url: '/purchases', icon: ShoppingCart, permission: 'purchases.view' },
    { title: 'Returns', url: '/returns/sales', icon: Undo2, permission: 'returns.view' },
    { title: 'Inventory', url: '/inventory', icon: Boxes, permission: 'inventory.view' },
    { title: 'Payments', url: '/payments', icon: Banknote, permission: 'payments.view' },
    { title: 'Outstanding', url: '/ledger/outstanding', icon: BookUser, permission: 'ledger.view' },
    { title: 'Reports', url: '/reports', icon: BarChart3, permission: 'reports.view' },
    { title: 'Products', url: '/products', icon: Pill, permission: 'products.view' },
    { title: 'Customers', url: '/customers', icon: Store, permission: 'customers.view' },
    { title: 'Suppliers', url: '/suppliers', icon: Building2, permission: 'suppliers.view' },
    { title: 'Categories', url: '/categories', icon: Tags, permission: 'categories.view' },
    { title: 'Incentive Rules', url: '/incentives', icon: BadgePercent, permission: 'incentives.view' },
];

export function AppSidebar() {
    const { can } = usePermissions();
    const mainNavItems = allNavItems.filter((item) => can(item.permission));

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
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
