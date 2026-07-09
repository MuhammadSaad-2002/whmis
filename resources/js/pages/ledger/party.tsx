import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { amount, money, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { FileDown } from 'lucide-react';

interface StatementRow {
    id: number;
    date: string;
    type: string;
    description: string | null;
    debit: number;
    credit: number;
    balance: number;
}

interface Props {
    party: { id: number; name: string; city: string | null; phone: string | null; credit_limit: string };
    partyType: 'customer' | 'company';
    statement: { opening_balance: number; rows: StatementRow[]; closing_balance: number };
    aging: { current: number; '31_60': number; '61_90': number; over_90: number; total: number };
    outstanding: number;
    filters: { from?: string; to?: string };
}

export default function LedgerParty({ party, partyType, statement, aging, outstanding, filters }: Props) {
    const isCustomer = partyType === 'customer';
    const baseUrl = isCustomer ? `/ledger/customers/${party.id}` : `/ledger/suppliers/${party.id}`;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Ledger', href: '/ledger/outstanding' },
        { title: party.name, href: baseUrl },
    ];

    // Customer: debit-balance = receivable. Supplier: credit-balance = payable.
    const displayBalance = (b: number) => (isCustomer ? b : -b);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Ledger — ${party.name}`} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-bold">{party.name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {isCustomer ? 'Customer' : 'Supplier'} ledger{party.city ? ` · ${party.city}` : ''}{party.phone ? ` · ${party.phone}` : ''}
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <a href={`${baseUrl}/pdf?from=${filters.from ?? ''}&to=${filters.to ?? ''}`} target="_blank" rel="noreferrer">
                            <FileDown className="mr-1 size-4" /> Statement PDF
                        </a>
                    </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                    <Card>
                        <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle></CardHeader>
                        <CardContent className="text-xl font-semibold tabular-nums">{money(outstanding)}</CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Current (0–30)</CardTitle></CardHeader>
                        <CardContent className="text-xl font-semibold tabular-nums">{amount(aging.current)}</CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">31–60 days</CardTitle></CardHeader>
                        <CardContent className="text-xl font-semibold tabular-nums">{amount(aging['31_60'])}</CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">61–90 days</CardTitle></CardHeader>
                        <CardContent className="text-xl font-semibold tabular-nums">{amount(aging['61_90'])}</CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Over 90 days</CardTitle></CardHeader>
                        <CardContent className="text-xl font-semibold tabular-nums text-destructive">{amount(aging.over_90)}</CardContent>
                    </Card>
                </div>

                <div className="flex gap-2">
                    <Input
                        type="date" className="w-40" value={filters.from ?? ''}
                        onChange={(e) => router.get(baseUrl, { ...filters, from: e.target.value || undefined }, { preserveState: true })}
                    />
                    <Input
                        type="date" className="w-40" value={filters.to ?? ''}
                        onChange={(e) => router.get(baseUrl, { ...filters, to: e.target.value || undefined }, { preserveState: true })}
                    />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow className="bg-muted/30">
                                <TableCell colSpan={5} className="font-medium">Opening Balance</TableCell>
                                <TableCell className="text-right font-medium tabular-nums">
                                    {amount(displayBalance(statement.opening_balance))}
                                </TableCell>
                            </TableRow>
                            {statement.rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{shortDate(row.date)}</TableCell>
                                    <TableCell className="capitalize">{row.type.replace('_', ' ')}</TableCell>
                                    <TableCell>{row.description}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.debit > 0 ? amount(row.debit) : ''}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.credit > 0 ? amount(row.credit) : ''}</TableCell>
                                    <TableCell className="text-right tabular-nums">{amount(displayBalance(row.balance))}</TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-muted/30">
                                <TableCell colSpan={5} className="font-semibold">Closing Balance</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">
                                    {amount(displayBalance(statement.closing_balance))}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AppLayout>
    );
}
