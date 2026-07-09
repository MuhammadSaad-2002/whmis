import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Head } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';

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
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="border-b pb-4">
                    <h1 className="text-4xl font-bold">Permission Catalog</h1>
                    <p className="text-sm text-muted-foreground">
                        The full set of permissions, by module, and which roles hold each. Grant them to roles on the Roles page.
                    </p>
                </div>

                <div className="grid gap-4">
                    {Object.entries(groups).map(([module, perms]) => (
                        <div key={module} className="rounded-xl border">
                            <div className="border-b bg-muted px-4 py-2 font-semibold capitalize">{module}</div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-64">Permission</TableHead>
                                        <TableHead>Held by roles</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {perms.map((perm) => (
                                        <TableRow key={perm.name}>
                                            <TableCell className="font-mono text-sm">{perm.name}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {perm.roles.length === 0 && <span className="text-muted-foreground">—</span>}
                                                    {perm.roles.map((r) => (
                                                        <Badge key={r} variant="secondary">{r}</Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
}
