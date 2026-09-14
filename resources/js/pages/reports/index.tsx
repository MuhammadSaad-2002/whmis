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

const CATEGORY_META: Record<string, { icon: LucideIcon; tone: string; description: string }> = {
    Sales: { icon: ShoppingCart, tone: 'bg-emerald-500/10 text-emerald-600', description: 'Revenue, customers, bookers and incentives' },
    Purchases: { icon: PackageOpen, tone: 'bg-blue-500/10 text-blue-600', description: 'Supplier purchases and received bonuses' },
    Inventory: { icon: Boxes, tone: 'bg-violet-500/10 text-violet-600', description: 'Stock position, movement and expiry' },
    Samples: { icon: FlaskConical, tone: 'bg-pink-500/10 text-pink-600', description: 'Segregated sample stock and issues' },
    Loans: { icon: ClipboardList, tone: 'bg-orange-500/10 text-orange-600', description: 'Borrowed and loaned-out stock balances' },
    Financial: { icon: Landmark, tone: 'bg-amber-500/10 text-amber-600', description: 'Receivables, payables and profitability' },
};

export default function ReportsIndex({ catalog }: { catalog: Record<string, ReportMeta[]> }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />
            <div className="flex h-full flex-col gap-5 bg-gradient-to-b from-muted/30 to-background p-4 md:p-6">
                <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-slate-950 via-slate-900 to-primary/80 p-6 text-white shadow-xl shadow-primary/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Business intelligence</p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">Reports Centre</h1>
                    <p className="mt-2 max-w-2xl text-sm text-white/70">Grouped by workflow so the right operational or financial view is easy to find. Every report exports to Excel and PDF.</p>
                </div>

                <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(catalog).map(([category, reports]) => {
                        const meta = CATEGORY_META[category] ?? { icon: ClipboardList, tone: 'bg-muted text-foreground', description: 'Operational reports' };
                        const Icon = meta.icon;
                        return (
                        <Card key={category} className="overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md">
                            <CardHeader className="border-b bg-muted/25 pb-4">
                                <div className="flex items-start gap-3">
                                    <span className={`rounded-xl p-2.5 ${meta.tone}`}><Icon className="size-5" /></span>
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
                                        className="group flex items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0 hover:bg-muted/50"
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
