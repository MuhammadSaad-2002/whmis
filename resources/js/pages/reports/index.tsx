import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Boxes, ChevronRight, ClipboardList, FlaskConical, Landmark, PackageOpen, ShoppingCart, type LucideIcon } from 'lucide-react';

interface ReportMeta {
    key: string;
    title: string;
    category: string;
    description: string;
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reports', href: '/reports' }];

const CATEGORY_META: Record<string, { icon: LucideIcon; description: string }> = {
    Sales: { icon: ShoppingCart, description: 'Revenue, customers, bookers and incentives' },
    Purchases: { icon: PackageOpen, description: 'Supplier purchases and received bonuses' },
    Inventory: { icon: Boxes, description: 'Stock position, movement and expiry' },
    Samples: { icon: FlaskConical, description: 'Segregated sample stock and issues' },
    Loans: { icon: ClipboardList, description: 'Borrowed and loaned-out stock balances' },
    Financial: { icon: Landmark, description: 'Receivables, payables and profitability' },
};

export default function ReportsIndex({ catalog }: { catalog: Record<string, ReportMeta[]> }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />
            <div className="flex h-full flex-col gap-5 bg-gradient-to-b from-muted/30 to-background p-4 md:p-6">
                <div className="brand-panel rounded-2xl border border-sidebar-border p-6 shadow-xl shadow-brand-navy/10">
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Reports Centre</h1>
                    <p className="mt-2 max-w-2xl text-sm text-white/70">Grouped by workflow so the right operational or financial view is easy to find. Every report exports to Excel and PDF.</p>
                </div>

                <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(catalog).map(([category, reports]) => {
                        const meta = CATEGORY_META[category] ?? { icon: ClipboardList, description: 'Operational reports' };
                        const Icon = meta.icon;
                        return (
                        <Card key={category} className="overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md">
                            <CardHeader className="border-b bg-muted/25 pb-4">
                                <div className="flex items-start gap-3">
                                    <span className="rounded-xl bg-accent p-2.5 text-accent-foreground"><Icon className="size-5" /></span>
                                    <div className="min-w-0">
                                        <CardTitle className="text-base">{category}</CardTitle>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{meta.description} · {reports.length} reports</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {reports.map((report) => (
                                    <Link
                                        key={report.key}
                                        href={route('reports.show', report.key)}
                                        className="group flex items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0 hover:bg-accent/60"
                                    >
                                        <div>
                                            <div className="text-sm font-medium">{report.title}</div>
                                            <div className="text-xs text-muted-foreground">{report.description}</div>
                                        </div>
                                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                    </Link>
                                ))}
                            </CardContent>
                        </Card>
                        );
                    })}
                </div>
            </div>
        </AppLayout>
    );
}
