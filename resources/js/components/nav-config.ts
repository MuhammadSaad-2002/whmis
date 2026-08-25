import { type NavItem } from '@/types';
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    BadgePercent,
    Banknote,
    BarChart3,
    BookUser,
    Boxes,
    Building2,
    ClipboardList,
    FlaskConical,
    Gift,
    KeyRound,
    LayoutGrid,
    Pill,
    ScrollText,
    ShieldCheck,
    ShoppingCart,
    Store,
    Tags,
    TrendingUp,
    Undo2,
    UserCog,
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
        label: 'Samples',
        items: [
            { title: 'Sample Receipts', url: '/samples/receipts', icon: FlaskConical, permission: 'samples.view' },
            { title: 'Sample Issues', url: '/samples/issues', icon: Gift, permission: 'samples.view' },
        ],
    },
    {
        label: 'Stock Loans',
        items: [
            { title: 'Loan Stock In', url: '/loans/in', icon: ArrowDownToLine, permission: 'loans.view' },
            { title: 'Loan Stock Out', url: '/loans/out', icon: ArrowUpFromLine, permission: 'loans.view' },
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
            { title: 'Booker Assignments', url: '/booker-assignments', icon: UserCog, permission: 'audit.view' },
            { title: 'License', url: '/license', icon: KeyRound, permission: 'license.view' },
        ],
    },
];
