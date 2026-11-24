import { type PaginatedData } from '@/components/paginator';
import { SearchField } from '@/components/ui/search-field';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import AppLayout from '@/layouts/app-layout';
import { money, qty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowDownUp, Building2, History, Layers, List } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import '../sales/invoice-list.css';

const columns = [['product', 'Product'], ['supplier', 'Supplier'], ['available', 'Available'],
    ['reserved', 'Reserved'], ['reorder', 'Reorder Level'], ['value', 'Value at Cost']] as const;
const tableColumns = [columns[0], [null, 'Pcs/Pack'], ...columns.slice(1)] as const;
const pageSizes = [10, 20, 25, 50];
const sortOptions = columns.flatMap(([key, label], index) => (['asc', 'desc'] as const).map((direction) => ({
    key, direction, value: `${key}.${direction}`, label: `${label} · ${index < 2 ? (direction === 'asc' ? 'A–Z' : 'Z–A') : (direction === 'asc' ? 'Low to high' : 'High to low')}`,
})));

type StockFigure = string | number | null;
type ProductRow = {
    id: number; name: string; generic_name: string | null; pack_size: string | null;
    reorder_level: string; stock: StockFigure; reserved: StockFigure; stock_value: StockFigure;
    is_low_stock: number | string; company?: { id: number; name: string } | null;
};
type Sort = (typeof columns)[number][0];
type Filters = { search?: string; company_id?: string | number; low_stock?: boolean; sort?: Sort; direction?: 'asc' | 'desc'; per_page?: string };
type Props = {
    products: PaginatedData<ProductRow> & { per_page: number };
    companies: { id: number; name: string }[]; filters: Filters; totals: { inventory_value: number };
    summary: { all: number; low: number; available: number; reserved: number; stock_value: number };
};

const count = (value: number) => `${qty(value)} product${value === 1 ? '' : 's'}`;

export default function InventoryIndex({ products, companies, filters, totals, summary }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [dense, setDense] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const sort = filters.sort ?? 'product';
    const direction = filters.direction ?? 'asc';
    const lowOnly = Boolean(filters.low_stock);
    const hasFilters = Boolean(filters.search?.trim() || filters.company_id || lowOnly);
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: products.data.length, autoFocus: false, onActivate: () => {}, // Inventory rows do not open a record.
    });

    useEffect(() => { setSearch(filters.search ?? ''); }, [filters.search]);
    useEffect(() => () => clearTimeout(searchTimer.current), []);

    function visit(next: Filters, page = 1, replace = false) {
        clearTimeout(searchTimer.current);
        const { low_stock, ...query } = next;
        router.get(route('inventory.index', {}, false), { ...query, low_stock: low_stock ? 1 : undefined, page: page === 1 ? undefined : page }, {
            only: ['products', 'filters', 'summary', 'totals'], preserveState: true, preserveScroll: true, replace,
            onStart: () => setLoading(true), onFinish: () => setLoading(false),
        });
    }

    const change = (next: Partial<Filters>) => visit({ ...filters, search: search.trim() || undefined, ...next });

    function updateSearch(event: ChangeEvent<HTMLInputElement>) {
        const value = event.target.value;
        setSearch(value);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if ((filters.search ?? '') !== value.trim()) visit({ ...filters, search: value.trim() || undefined }, 1, true);
        }, 300);
    }

    function clearFilters() {
        setSearch('');
        visit({ sort: filters.sort, direction: filters.direction, per_page: filters.per_page });
    }

    function sortBy(key: Sort) {
        change({ sort: key, direction: key === sort ? (direction === 'asc' ? 'desc' : 'asc') : (key === 'product' || key === 'supplier' ? 'asc' : 'desc') });
    }

    const visiblePages = [...new Set([1, products.current_page - 1, products.current_page, products.current_page + 1, products.last_page])]
        .filter((page) => page >= 1 && page <= products.last_page).sort((a, b) => a - b);

    return <AppLayout>
        <Head title="Inventory" />
        <main className="inventory-register" aria-busy={loading}>
            <header className="hero">
                <div className="intro"><h1>Stock Position</h1><p className="sub">Available stock and value at cost · {count(summary.all)} · {qty(summary.low)} at or below reorder level</p></div>
                <div className="sp" />
                <Link className="hbtn" href={route('inventory.batches', {}, false)}><Layers className="i" />Batches &amp; Expiry</Link>
                <Link className="hbtn" href={route('inventory.movements', {}, false)}><History className="i" />Movements</Link>
            </header>
            <section className="kpis" aria-label="Inventory summary">
                <StockKpi title="Total Inventory Value" color="#1f4e79" value={money(totals.inventory_value)} note="All inventory · at cost" />
                <StockKpi title="Available Units" color="#087568" value={qty(summary.available)} note={`${count(products.total)} in this view`} />
                <StockKpi title="Reserved Units" color="#64748b" value={qty(summary.reserved)} note="Products in this view" />
                <StockKpi title="Low-stock Products" color="#e3a008" value={qty(summary.low)} note="At or below reorder level" />
            </section>

            <section className="card list" aria-label="Stock position list">
                <div className="tabs" role="group" aria-label="Filter by stock level">
                    <button type="button" className={`tab ${lowOnly ? '' : 'on'}`} aria-pressed={!lowOnly} onClick={() => change({ low_stock: false })}>All products <span className="ct">{summary.all}</span></button>
                    <button type="button" className={`tab ${lowOnly ? 'on' : ''}`} aria-pressed={lowOnly} onClick={() => change({ low_stock: true })}>Low stock <span className="ct">{summary.low}</span></button>
                </div>
                <div className="filters">
                    <SearchField ref={searchRef} onKeyDown={onSearchKeyDown} maxLength={120} aria-label="Search products by name or generic name" placeholder="Product or generic name" value={search} onChange={updateSearch} />
                    <label className="fld choice"><Building2 className="i" aria-hidden="true" /><select aria-label="Supplier" value={filters.company_id ?? ''} onChange={(event) => change({ company_id: event.target.value || undefined })}>
                        <option value="">All suppliers</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select></label>
                    <label className="fld choice stock-sort-mobile"><ArrowDownUp className="i" aria-hidden="true" /><select aria-label="Sort stock position" value={`${sort}.${direction}`} onChange={(event) => {
                        const option = sortOptions.find(({ value }) => value === event.target.value);
                        if (option) change({ sort: option.key, direction: option.direction });
                    }}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    {hasFilters && <button type="button" className="clear" onClick={clearFilters}>Clear filters</button>}<div className="fsp" />
                    <button type="button" className="dens" title="Toggle row density" aria-label="Compact rows" aria-pressed={dense} onClick={() => setDense((value) => !value)}><List className="i" /></button>
                </div>

                {!products.data.length ? <div className="empty">{hasFilters ? 'No products match these filters.' : 'No products found.'}</div> : <>
                    <div className="stock-cards" aria-label="Stock cards">
                        {products.data.map((product) => <StockCard key={product.id} product={product} />)}
                    </div>
                    <div className="tblwrap stock-table" tabIndex={0} role="region" aria-label="Stock position table">
                        <table className={dense ? 'dense' : undefined}>
                            <thead><tr>
                                {tableColumns.map(([key, label], index) => <th key={label} scope="col" className={cn(key && 's', sort === key && 'act', (index === 1 || index >= 3) && 'r')}
                                    aria-sort={sort === key ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}>
                                    {key ? <button type="button" className="sort" onClick={() => sortBy(key)}>{label}<span className="ar" aria-hidden="true">{sort === key ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span></button> : label}
                                </th>)}
                                <th scope="col">Status</th>
                            </tr></thead>
                            <tbody>
                                {products.data.map((product, index) => <tr key={product.id} {...rowProps(index)}>
                                    <td className="cust"><b>{product.name}</b>{product.generic_name && <small>{product.generic_name}</small>}</td>
                                    <td className="r num">{packSize(product)}</td>
                                    <td className="stock-supplier">{product.company?.name ?? '—'}</td>
                                    <td className={cn('r num number-cell', Number(product.is_low_stock) === 1 && 'neg')}>{qty(product.stock)}</td>
                                    <td className="r num">{qty(product.reserved)}</td><td className="r num">{qty(product.reorder_level)}</td>
                                    <td className="r num">{money(product.stock_value)}</td><td><StockStatus product={product} /></td>
                                </tr>)}
                            </tbody>
                            <tfoot><tr><td colSpan={3}>Totals · {count(products.total)}</td><td className="r num">{qty(summary.available)}</td>
                                <td className="r num">{qty(summary.reserved)}</td><td /><td className="r num">{money(summary.stock_value)}</td><td />
                            </tr></tfoot>
                        </table>
                    </div>
                </>}

                <div className="pager">
                    <span>{products.total ? `${products.from}–${products.to} of ${products.total}` : '0 results'}</span>
                    <label>· Rows <select aria-label="Rows per page" value={products.per_page} onChange={(event) => change({ per_page: event.target.value })}>
                        {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select></label><div className="sp" />
                    <nav className="pg" aria-label="Inventory pages">
                        <button type="button" disabled={products.current_page <= 1} onClick={() => visit(filters, products.current_page - 1)}>‹ Prev</button>
                        {visiblePages.map((page, index) => <span className="pg-entry" key={page}>
                            {index > 0 && page - visiblePages[index - 1] > 1 && <span className="muted hidden md:inline">…</span>}
                            <button type="button" aria-current={products.current_page === page ? 'page' : undefined} className={products.current_page === page ? 'on' : ''} onClick={() => visit(filters, page)}>{page}</button>
                        </span>)}
                        <button type="button" disabled={products.current_page >= products.last_page} onClick={() => visit(filters, products.current_page + 1)}>Next ›</button>
                    </nav>
                </div>
            </section>
        </main>
    </AppLayout>;
}

function StockKpi({ title, value, note, color }: { title: string; value: string; note: string; color: string }) {
    return <div className="card kpi"><div className="lbl"><i style={{ background: color }} />{title}</div><div className="val num">{value}</div><div className="foot">{note}</div></div>;
}

function packSize(product: ProductRow) {
    return product.pack_size?.trim() || '—';
}

function StockStatus({ product }: { product: ProductRow }) {
    if (Number(product.is_low_stock) === 1) return <span className="st low">Low stock</span>;
    if (Number(product.stock) <= 0) return <span className="st no-stock">No available stock</span>;
    return <span className="st posted">In stock</span>;
}

function StockCard({ product }: { product: ProductRow }) {
    return <article className="stock-card">
        <header><div><h2>{product.name}</h2><p className="muted">{[product.company?.name, product.generic_name].filter(Boolean).join(' · ')}</p></div><StockStatus product={product} /></header>
        <dl>
            <div><dt>Available</dt><dd className={cn('num', Number(product.is_low_stock) === 1 && 'neg')}>{qty(product.stock)}</dd></div>
            <div><dt>Reserved</dt><dd className="num">{qty(product.reserved)}</dd></div>
            <div><dt>Reorder level</dt><dd className="num">{qty(product.reorder_level)}</dd></div>
            <div><dt>Pcs/Pack</dt><dd className="num">{packSize(product)}</dd></div>
            <div className="stock-card-value"><dt>Value at cost</dt><dd className="num">{money(product.stock_value)}</dd></div>
        </dl>
    </article>;
}
