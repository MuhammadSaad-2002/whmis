import { MasterFilterSelect, RegisterLayout } from '@/components/master-register';
import { SearchField } from '@/components/ui/search-field';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import {
    Boxes,
    ChevronRight,
    ClipboardList,
    FlaskConical,
    Landmark,
    PackageOpen,
    ShoppingCart,
    SlidersHorizontal,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import './reports.css';

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
    'Human Resources': { icon: Users, description: 'Staff, attendance, payroll and performance' },
};

export default function ReportsIndex({ catalog }: { catalog: Record<string, ReportMeta[]> }) {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const query = search.trim().toLowerCase();
    const groups = Object.entries(catalog)
        .filter(([category]) => !categoryFilter || category === categoryFilter)
        .map(([category, reports]) => ({
            category,
            reports: reports.filter((report) => `${report.title} ${report.description} ${category}`.toLowerCase().includes(query)),
        }))
        .filter(({ reports }) => reports.length > 0);
    const count = groups.reduce((total, { reports }) => total + reports.length, 0);
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />
            <div className="reports-page">
                <RegisterLayout title="Reports Centre" description="Explore operational and financial reports. Export any report to Excel or PDF.">
                    <div className="report-directory-toolbar">
                        <SearchField
                            aria-label="Search reports"
                            placeholder="Search reports"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <MasterFilterSelect label="Report category" icon={SlidersHorizontal} value={categoryFilter} onChange={setCategoryFilter}>
                            <option value="">All categories</option>
                            {Object.keys(catalog).map((category) => (
                                <option key={category}>{category}</option>
                            ))}
                        </MasterFilterSelect>
                        {(query || categoryFilter) && (
                            <button
                                type="button"
                                className="clear"
                                onClick={() => {
                                    setSearch('');
                                    setCategoryFilter('');
                                }}
                            >
                                Clear filters
                            </button>
                        )}
                        <span className="muted" role="status">
                            {count} {count === 1 ? 'report' : 'reports'}
                        </span>
                    </div>
                    {groups.length === 0 && <p className="card report-directory-empty">No reports match the selected filters.</p>}
                    <div className="report-directory-grid">
                        {groups.map(({ category, reports }) => {
                            const meta = CATEGORY_META[category] ?? { icon: ClipboardList, description: 'Operational reports' };
                            const Icon = meta.icon;
                            return (
                                <section key={category} className="card list" aria-label={category}>
                                    <header className="report-directory-header">
                                        <span className="report-directory-icon">
                                            <Icon className="size-5" aria-hidden="true" />
                                        </span>
                                        <div>
                                            <h2 className="report-directory-title">{category}</h2>
                                            <p className="report-directory-description">{meta.description}</p>
                                        </div>
                                    </header>
                                    {reports.map((report) => (
                                        <Link key={report.key} href={route('reports.show', report.key)} className="report-directory-link">
                                            <div>
                                                <strong>{report.title}</strong>
                                                <div className="report-directory-description">{report.description}</div>
                                            </div>
                                            <ChevronRight className="i" aria-hidden="true" />
                                        </Link>
                                    ))}
                                </section>
                            );
                        })}
                    </div>
                </RegisterLayout>
            </div>
        </AppLayout>
    );
}
