import type { PaginatedData } from '@/components/paginator';

export const WORKDAY = '/booker/workday';
export const OUTCOMES = {
    planned: { label: 'Planned', tone: 'bg-accent text-accent-foreground' },
    visited: { label: 'Visited', tone: 'bg-accent text-accent-foreground' },
    no_order: { label: 'No order', tone: 'bg-chart-4/12 text-chart-4' },
    closed: { label: 'Outlet closed', tone: 'bg-muted text-muted-foreground' },
};
export type Outcome = keyof typeof OUTCOMES;
export type Visit = { id: number; outcome: Outcome; notes: string | null };
export type Customer = {
    id: number; name: string; city: string | null; address?: string | null; account_balance: string | number | null;
};
export type DirectoryCustomer = Customer & {
    visit: Visit | null; has_delivery: boolean;
    last_booking: { id: number; booking_number: string; booking_date: string; status: string } | null;
};
export type RouteVisit = Visit & { customer: Customer };
export type Delivery = {
    id: number; invoice_number: string; total_amount: number | string; paid_amount: number | string; outstanding: number | string;
    delivery_status: string; planned_date: string; can_collect: boolean; collectible_paisa: number; pending_paisa: number;
    customer: { name: string; city: string | null; address: string | null; phone: string | null } | null;
};
export type BookStats = {
    all: number; planned: number; due: number; dueAmount: number; ordered: number; none: number; completedVisits: number; orders: number;
};
export type Collections = {
    cash: number; online: number; pending: number; entryCount: number; openDay: number | null;
    entries: { id: number; invoice_number: string; customer: string; method: string; reported_paisa: number; recorded_at: string | null; payment_status: string | null }[];
};
export type Filters = { date: string; search: string; filter: 'all' | 'planned' | 'due' | 'ordered' | 'none'; sort: 'name' | 'balance' | 'recent'; size: number };
export type Page<T> = PaginatedData<T> & { next_page_url: string | null; prev_page_url: string | null };
