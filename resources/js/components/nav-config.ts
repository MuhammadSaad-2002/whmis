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
    ContactRound,
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

export type PermittedNavItem = NavItem & { permission: string; alternatePermission?: string; keywords?: string[] };
type PermittedNavGroup = { label: string; restrictedLabel?: string; icon?: NavItem['icon']; items: PermittedNavItem[] };

// Canonical page paths, labels, and permission keys.
export const navGroups: PermittedNavGroup[] = [
    {
        label: 'Overview',
        items: [{ title: 'Dashboard', url: '/dashboard', icon: LayoutGrid, permission: 'dashboard.view', keywords: ['executive', 'overview'] }],
    },
    {
        label: 'Transactions',
        items: [
            { title: 'My Workday', url: '/booker/workday', icon: ClipboardList, permission: 'bookings.create' },
            { title: 'Bookings', url: '/bookings', icon: ClipboardList, permission: 'bookings.view' },
            { title: 'Sales Invoices', url: '/sales', icon: TrendingUp, permission: 'sales.view' },
            { title: 'Purchase Invoices', url: '/purchases', icon: ShoppingCart, permission: 'purchases.view' },
            { title: 'Returns', url: '/returns/sales', icon: Undo2, permission: 'returns.view', keywords: ['sales returns'] },
            { title: 'Dispatch & Delivery', url: '/dispatch', icon: Boxes, permission: 'dispatch.view', alternatePermission: 'dispatch.assigned', keywords: ['my deliveries'] },
            { title: 'Booking & Delivery Schedules', url: '/dispatch/schedules', icon: ClipboardList, permission: 'dispatch.plan' },
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
            { title: 'Collections & Recovery', url: '/collections', icon: Banknote, permission: 'collections.view' },
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
        label: 'Human Resources',
        items: [
            { title: 'Employees', url: '/hr/employees', icon: Users, permission: 'employees.view' },
            { title: 'Attendance', url: '/hr/attendance', icon: ClipboardList, permission: 'hr.attendance.view' },
            { title: 'Leave', url: '/hr/leave', icon: ClipboardList, permission: 'hr.leave.view' },
            { title: 'Payroll', url: '/hr/payroll', icon: Banknote, permission: 'hr.payroll.view' },
            { title: 'Employee Finance', url: '/hr/finance', icon: BookUser, permission: 'hr.payroll.view' },
            { title: 'HR Settings', url: '/hr/settings', icon: UserCog, permission: 'hr.settings.manage' },
            { title: 'My HR', url: '/hr/my-profile', icon: Users, permission: 'hr.self.view' },
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
            { title: 'System Readiness', url: '/system/health', icon: ShieldCheck, permission: 'system.health' },
            { title: 'Roles & Permissions', url: '/roles', icon: ShieldCheck, permission: 'roles.manage' },
            { title: 'Audit Log', url: '/audit-log', icon: ScrollText, permission: 'audit.view' },
            { title: 'Booker Assignments', url: '/booker-assignments', icon: UserCog, permission: 'audit.view' },
            { title: 'License', url: '/license', icon: KeyRound, permission: 'license.view' },
        ],
    },
];

const navItemsByUrl = new Map(navGroups.flatMap(({ items }) => items.map((item) => [item.url, item] as const)));

function itemsFor(...urls: string[]): PermittedNavItem[] {
    return urls.flatMap((url) => {
        const item = navItemsByUrl.get(url);
        return item ? [item] : [];
    });
}

export const workspaceNavGroups: PermittedNavGroup[] = [
    {
        label: 'Daily Work',
        items: itemsFor('/dashboard', '/sales', '/bookings', '/purchases', '/inventory', '/payments', '/dispatch', '/reports', '/booker/workday'),
    },
    {
        label: 'Customers & Sales',
        icon: ContactRound,
        items: itemsFor('/customers', '/returns/sales', '/incentives', '/dispatch/schedules'),
    },
    {
        label: 'Stock & Suppliers',
        restrictedLabel: 'Stock & Products',
        icon: Boxes,
        items: itemsFor('/suppliers', '/products', '/categories', '/loans/in', '/loans/out', '/samples/receipts', '/samples/issues'),
    },
    {
        label: 'Finance & Recovery',
        icon: Banknote,
        items: itemsFor('/collections', '/ledger/position'),
    },
    {
        label: 'People & Payroll',
        icon: Users,
        items: itemsFor('/hr/employees', '/hr/attendance', '/hr/leave', '/hr/payroll', '/hr/finance', '/hr/settings', '/hr/my-profile'),
    },
    {
        label: 'Administration',
        icon: ShieldCheck,
        items: itemsFor('/users', '/roles', '/booker-assignments', '/audit-log', '/system/health', '/license'),
    },
];

export function permittedWorkspaceGroups(can: (permission: string) => boolean, canViewSupplierDetails: boolean): PermittedNavGroup[] {
    return workspaceNavGroups.map((group) => ({
        ...group,
        label: !canViewSupplierDetails && group.restrictedLabel ? group.restrictedLabel : group.label,
        items: group.items.filter(({ permission, alternatePermission }) => can(permission) || (alternatePermission && can(alternatePermission))),
    }));
}
