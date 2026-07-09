import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
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
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
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
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: categories.data.length,
        onActivate: (i) => openEdit(categories.data[i]),
    });

    const form = useForm({ name: '', description: '' });
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Name'),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/categories', { search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold">Product Categories</h1>
                    {can('categories.manage') && (
                        <Button onClick={openCreate}>
                            <Plus className="mr-1 size-4" /> Add Category
                        </Button>
                    )}
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                    <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Search…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Products</TableHead>
                                <TableHead className="w-24" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {categories.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                                        No categories found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {categories.data.map((category, index) => (
                                <TableRow key={category.id} {...rowProps(index)}>
                                    <TableCell className="font-medium">{category.name}</TableCell>
                                    <TableCell>{category.description || '—'}</TableCell>
                                    <TableCell className="text-right">{category.products_count}</TableCell>
                                    <TableCell>
                                        {can('categories.manage') && (
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => openEdit(category)}>
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => {
                                                        if (confirm(`Delete category "${category.name}"?`)) {
                                                            router.delete(route('categories.destroy', category.id), { preserveScroll: true });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="size-4 text-destructive" />
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={categories} />
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Category'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-3">
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
