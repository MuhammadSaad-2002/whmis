import { type NavItem } from '@/types';
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

export type PermittedNavItem = NavItem & { permission: string };

// Single source of truth for the sidebar navigation, shared by the normal
// AppSidebar and the workspace (tabbed) shell so permissions and ordering match.
export const navGroups: { label: string; items: PermittedNavItem[] }[] = [
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
            { title: 'Financial Position', url: '/ledger/position', icon: BookUser, permission: 'ledger.view' },
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
