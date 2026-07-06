import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { amount, money } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';

interface CustomerRow {
    id: number;
    name: string;
    city: string | null;
    phone: string | null;
    credit_limit: number;
    balance: number;
    aging: { current: number; '31_60': number; '61_90': number; over_90: number; total: number } | null;
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Outstanding', href: '/ledger/outstanding' }];

export default function Outstanding({ customers }: { customers: CustomerRow[] }) {
    const total = customers.reduce((s, c) => s + c.balance, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Outstanding" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Outstanding Receivables</h1>
                    <p className="text-sm text-muted-foreground">
                        Total outstanding: <span className="font-semibold text-foreground">{money(total)}</span> across {customers.length} customers
                    </p>
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Customer</TableHead>
                                <TableHead>City</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead className="text-right">Current</TableHead>
                                <TableHead className="text-right">31–60</TableHead>
                                <TableHead className="text-right">61–90</TableHead>
                                <TableHead className="text-right">90+</TableHead>
                                <TableHead className="text-right">Credit Limit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                        No outstanding balances. 🎉
                                    </TableCell>
                                </TableRow>
                            )}
                            {customers.map((customer) => {
                                const overLimit = customer.credit_limit > 0 && customer.balance > customer.credit_limit;
                                return (
                                    <TableRow key={customer.id}>
                                        <TableCell>
                                            <Link href={route('ledger.customer', customer.id)} className="font-medium hover:underline">
                                                {customer.name}
                                            </Link>
                                            <div className="text-xs text-muted-foreground">{customer.phone}</div>
                                        </TableCell>
                                        <TableCell>{customer.city ?? '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className={overLimit ? 'font-semibold text-destructive' : 'font-medium'}>
                                                {amount(customer.balance)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{customer.aging ? amount(customer.aging.current) : '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums">{customer.aging ? amount(customer.aging['31_60']) : '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums">{customer.aging ? amount(customer.aging['61_90']) : '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className={customer.aging && customer.aging.over_90 > 0 ? 'font-semibold text-destructive' : ''}>
                                                {customer.aging ? amount(customer.aging.over_90) : '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{amount(customer.credit_limit)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AppLayout>
    );
}
