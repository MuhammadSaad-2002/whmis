import { RegisterLayout, RegisterList } from '@/components/master-register';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { ShieldCheck } from 'lucide-react';

interface PermissionRow {
    name: string;
    module: string;
    roles: string[];
}

interface Props {
    groups: Record<string, PermissionRow[]>;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Roles & Permissions', href: '/roles' },
    { title: 'Permission Catalog', href: '/permissions' },
];

export default function PermissionsIndex({ groups }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Permission Catalog" />
            <RegisterLayout title="Permission Catalog" description="Permissions grouped by module, and the roles that hold them"
                actions={<Link className="hbtn" href={route('roles.index')}><ShieldCheck className="i" aria-hidden="true" />Roles &amp; Permissions</Link>}>
                <RegisterList title="Permission Catalog">
                    {dense => <Table className={dense ? 'dense' : undefined}>
                        <TableHeader>
                            <TableRow><TableHead className="w-64">Permission</TableHead><TableHead>Held by roles</TableHead></TableRow>
                        </TableHeader>
                        {Object.entries(groups).map(([module, perms]) => <TableBody key={module}>
                                    <TableRow><TableHead scope="rowgroup" colSpan={2} className="register-group">{module.replaceAll('-', ' ')}</TableHead></TableRow>
                                    {perms.map((perm) => (
                                        <TableRow key={perm.name}>
                                            <TableCell className="text-sm">{perm.name}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {perm.roles.length === 0 && <span className="text-muted-foreground">—</span>}
                                                    {perm.roles.map((r) => (
                                                        <span key={r} className="st master-tag">{r}</span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                        </TableBody>)}
                    </Table>}
                </RegisterList>
            </RegisterLayout>
        </AppLayout>
    );
}
