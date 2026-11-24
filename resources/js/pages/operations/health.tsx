import { MasterStatus, RegisterLayout, RegisterList } from '@/components/master-register';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { RefreshCw } from 'lucide-react';

export default function Health({ checks }: { checks: { name: string; ok: boolean; detail: string }[] }) {
    const ready = checks.filter(check => check.ok).length;
    return <AppLayout>
        <Head title="System Readiness" />
        <RegisterLayout title="System Readiness" description={<>Read-only deployment and workflow checks · {ready} of {checks.length} ready</>}
            actions={<button type="button" className="hbtn pri" onClick={() => router.reload()}><RefreshCw className="i" aria-hidden="true" />Recheck</button>}>
            <RegisterList title="Readiness checks" controls={<h2 className="font-bold">Readiness checks</h2>}>
                {dense => <Table className={`register-short-table${dense ? ' dense' : ''}`}>
                    <TableHeader><TableRow><TableHead>Check</TableHead><TableHead className="r">Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {checks.map(check => <TableRow key={check.name}>
                            <TableCell className="wrap-cell">
                                <strong>{check.name}</strong>
                                <span className="row-secondary">{check.detail}</span>
                            </TableCell>
                            <TableCell className="r"><MasterStatus status={check.ok ? 'Ready' : 'Needs attention'} tone={check.ok ? 'positive' : 'attention'} /></TableCell>
                        </TableRow>)}
                    </TableBody>
                </Table>}
            </RegisterList>
        </RegisterLayout>
    </AppLayout>;
}
