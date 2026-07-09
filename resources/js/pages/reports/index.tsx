import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';

interface ReportMeta {
    key: string;
    title: string;
    category: string;
    description: string;
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reports', href: '/reports' }];

export default function ReportsIndex({ catalog }: { catalog: Record<string, ReportMeta[]> }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div>
                    <h1 className="text-3xl font-bold">Reports</h1>
                    <p className="text-sm text-muted-foreground">Every report exports to Excel and PDF</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(catalog).map(([category, reports]) => (
                        <Card key={category}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">{category}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {reports.map((report) => (
                                    <Link
                                        key={report.key}
                                        href={route('reports.show', report.key)}
                                        className="flex items-center justify-between border-t px-4 py-3 hover:bg-muted/50"
                                    >
                                        <div>
                                            <div className="text-sm font-medium">{report.title}</div>
                                            <div className="text-xs text-muted-foreground">{report.description}</div>
                                        </div>
                                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                                    </Link>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
}
