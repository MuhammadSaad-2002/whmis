import { MasterRegister, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { ALERT_FIX, required, useClientValidation } from '@/lib/form-validation';
import { Head, router, useForm } from '@inertiajs/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface Category {
    id: number;
    name: string;
    description: string | null;
    products_count: number;
}

interface Props {
    categories: PaginatedData<Category>;
    filters: { search?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Categories', href: '/categories' }];

export default function CategoriesIndex({ categories, filters }: Props) {
    const { can } = usePermissions();
    const canManage = can('categories.manage');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const filterState = useMasterFilters('/categories', filters);
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: categories.data.length,
        onActivate: (i) => { if (canManage) openEdit(categories.data[i]); },
    });

    const form = useForm({ name: '', description: '' });
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Name'),
    });

    const openCreate = () => {
        setEditing(null);
        form.setData({ name: '', description: '' });
        form.clearErrors();
        setDialogOpen(true);
    };

    const openEdit = (category: Category) => {
        setEditing(category);
        form.setData({ name: category.name, description: category.description ?? '' });
        form.clearErrors();
        setDialogOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            toast.error(ALERT_FIX);
            return;
        }
        const options = {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        };
        if (editing) form.put(route('categories.update', editing.id), options);
        else form.post(route('categories.store'), options);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Categories" />
            <MasterRegister title="Product Categories" description="Group products in the catalogue" label="category" pluralLabel="categories" page={categories}
                state={filterState} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Category name"
                actions={canManage && <button type="button" className="hbtn pri" onClick={openCreate}><Plus className="i" aria-hidden="true" />Add Category</button>}>
                    {dense => <Table className={`category-table${dense ? ' dense' : ''}`}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="r">Products</TableHead>
                                {canManage && <TableHead className="r acts-head">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {categories.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={canManage ? 4 : 3} className="empty">
                                        {filterState.applied ? 'No categories match these filters.' : 'No categories found.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {categories.data.map((category, index) => (
                                <TableRow key={category.id} {...rowProps(index)}>
                                    <TableCell className="entity-name"><strong>{category.name}</strong></TableCell>
                                    <TableCell className="wrap-cell">{category.description || '—'}</TableCell>
                                    <TableCell className="r num">{category.products_count}</TableCell>
                                    {canManage && <TableCell>
                                            <div className="acts">
                                                <button type="button" className="ib" title="Edit category" aria-label={`Edit ${category.name}`} onClick={() => openEdit(category)}><Pencil className="i" aria-hidden="true" /></button>
                                                <button type="button" className="ib master-delete" title="Delete category" aria-label={`Delete ${category.name}`}
                                                    onClick={() => {
                                                        if (confirm(`Delete category "${category.name}"?`)) {
                                                            router.delete(route('categories.destroy', category.id), { preserveScroll: true });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="i" aria-hidden="true" />
                                                </button>
                                            </div>
                                    </TableCell>}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>}
            </MasterRegister>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" className="max-w-md" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Category'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid gap-3">
                        <div>
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                value={form.data.name}
                                onChange={(e) => form.setData('name', e.target.value)}
                                onBlur={() => validateField('name')}
                                aria-invalid={!!form.errors.name}
                                className={form.errors.name ? 'border-destructive ring-1 ring-destructive' : ''}
                                autoFocus
                            />
                            {form.errors.name && <p className="text-xs text-destructive">{form.errors.name}</p>}
                        </div>
                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Input id="description" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} />
                        </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>{editing ? 'Save' : 'Create'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
