<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseInvoiceItem;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceItem;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Registry-driven report engine. Every report returns the same shape:
 * ['columns' => [{key,label,align,format}], 'rows' => [...], 'totals' => [...], 'chart' => ?array]
 * The generic reports/show page, the xlsx export, and the PDF all render it.
 *
 * Date grouping is done in PHP (not SQL) so SQLite tests behave like MySQL.
 */
class ReportService
{
    public function __construct(private readonly LedgerService $ledger) {}

    /** Report metadata for the hub and controller validation. */
    public static function catalog(): array
    {
        return [
            'sales-register' => ['title' => 'Sales Register', 'category' => 'Sales', 'description' => 'Every posted sales invoice in a period', 'filters' => ['date_range', 'customer']],
            'product-sales' => ['title' => 'Product Sales & Profitability', 'category' => 'Sales', 'description' => 'Qty, bonus given, revenue, cost, profit per product', 'filters' => ['date_range', 'supplier']],
            'customer-sales' => ['title' => 'Customer Sales & Profitability', 'category' => 'Sales', 'description' => 'Revenue, profit, and outstanding per pharmacy', 'filters' => ['date_range']],
            'booker-sales' => ['title' => 'Booker Sales', 'category' => 'Sales', 'description' => 'Sales attributed to each booker via assigned customers', 'filters' => ['date_range']],
            'purchase-register' => ['title' => 'Purchase Register', 'category' => 'Purchases', 'description' => 'Every posted purchase invoice in a period', 'filters' => ['date_range', 'supplier']],
            'supplier-purchases' => ['title' => 'Supplier Purchases', 'category' => 'Purchases', 'description' => 'Purchase volume and margin per supplier', 'filters' => ['date_range']],
            'bonus-analysis' => ['title' => 'Bonus Analysis', 'category' => 'Purchases', 'description' => 'Bonus received vs bonus given away per product', 'filters' => ['date_range']],
            'stock-position' => ['title' => 'Stock Position', 'category' => 'Inventory', 'description' => 'Current stock and value at cost', 'filters' => ['supplier']],
            'expiry' => ['title' => 'Expiry Report', 'category' => 'Inventory', 'description' => 'In-stock batches by expiry window', 'filters' => ['expiry_window']],
            'slow-fast-moving' => ['title' => 'Slow / Fast Moving', 'category' => 'Inventory', 'description' => 'Products ranked by quantity sold in a period', 'filters' => ['date_range', 'order']],
            'outstanding' => ['title' => 'Outstanding & Aging', 'category' => 'Financial', 'description' => 'Receivables per customer with aging buckets', 'filters' => []],
            'supplier-payables' => ['title' => 'Supplier Payables', 'category' => 'Financial', 'description' => 'What you owe each supplier', 'filters' => []],
            'profit-by-month' => ['title' => 'Monthly Sales & Profit', 'category' => 'Financial', 'description' => '12-month trend of sales, cost, and profit', 'filters' => []],
        ];
    }

    public function build(string $key, array $filters): array
    {
        [$from, $to] = $this->range($filters);

        return match ($key) {
            'sales-register' => $this->salesRegister($from, $to, $filters),
            'product-sales' => $this->productSales($from, $to, $filters),
            'customer-sales' => $this->customerSales($from, $to),
            'booker-sales' => $this->bookerSales($from, $to),
            'purchase-register' => $this->purchaseRegister($from, $to, $filters),
            'supplier-purchases' => $this->supplierPurchases($from, $to),
            'bonus-analysis' => $this->bonusAnalysis($from, $to),
            'stock-position' => $this->stockPosition($filters),
            'expiry' => $this->expiry($filters),
            'slow-fast-moving' => $this->slowFastMoving($from, $to, $filters),
            'outstanding' => $this->outstanding(),
            'supplier-payables' => $this->supplierPayables(),
            'profit-by-month' => $this->profitByMonth(),
        };
    }

    private function range(array $filters): array
    {
        return [
            ! empty($filters['from']) ? Carbon::parse($filters['from']) : now()->startOfMonth(),
            ! empty($filters['to']) ? Carbon::parse($filters['to']) : now(),
        ];
    }

    private function postedSales(Carbon $from, Carbon $to)
    {
        return SalesInvoice::where('status', 'posted')
            ->whereDate('invoice_date', '>=', $from)
            ->whereDate('invoice_date', '<=', $to);
    }

    private function salesRegister(Carbon $from, Carbon $to, array $filters): array
    {
        $invoices = $this->postedSales($from, $to)
            ->when($filters['customer_id'] ?? null, fn ($q, $id) => $q->where('customer_id', $id))
            ->with('customer:id,name,city')
            ->orderBy('invoice_date')->orderBy('id')
            ->get();

        return [
            'columns' => [
                ['key' => 'invoice_number', 'label' => 'Invoice #'],
                ['key' => 'invoice_date', 'label' => 'Date', 'format' => 'date'],
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'sale_type', 'label' => 'Type'],
                ['key' => 'total_amount', 'label' => 'Total', 'align' => 'right', 'format' => 'money'],
                ['key' => 'total_profit', 'label' => 'Profit', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $invoices->map(fn ($invoice) => [
                'invoice_number' => $invoice->invoice_number,
                'invoice_date' => $invoice->invoice_date->toDateString(),
                'customer' => $invoice->customer?->name,
                'sale_type' => ucwords(str_replace('_', ' ', $invoice->sale_type)),
                'total_amount' => (float) $invoice->total_amount,
                'total_profit' => (float) $invoice->total_profit,
            ])->all(),
            'totals' => [
                'total_amount' => (float) $invoices->sum('total_amount'),
                'total_profit' => (float) $invoices->sum('total_profit'),
            ],
        ];
    }

    private function productSales(Carbon $from, Carbon $to, array $filters): array
    {
        $items = SalesInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->when($filters['company_id'] ?? null, fn ($q, $id) => $q->whereHas('product', fn ($p) => $p->where('company_id', $id)))
            ->with('product:id,name,company_id', 'product.company:id,name')
            ->get()
            ->groupBy('product_id');

        $rows = $items->map(function ($group) {
            $first = $group->first();

            return [
                'product' => $first->product?->name,
                'supplier' => $first->product?->company?->name,
                'qty' => (float) $group->sum('quantity'),
                'bonus' => (float) $group->sum('bonus_quantity'),
                'revenue' => (float) $group->sum('net_amount'),
                'cost' => round((float) $group->sum('cost_amount'), 2),
                'profit' => (float) $group->sum('profit'),
            ];
        })->sortByDesc('revenue')->values();

        return [
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'supplier', 'label' => 'Supplier'],
                ['key' => 'qty', 'label' => 'Qty Sold', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'bonus', 'label' => 'Bonus Given', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'revenue', 'label' => 'Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'cost', 'label' => 'Cost', 'align' => 'right', 'format' => 'money'],
                ['key' => 'profit', 'label' => 'Profit', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'qty' => (float) $rows->sum('qty'),
                'bonus' => (float) $rows->sum('bonus'),
                'revenue' => (float) $rows->sum('revenue'),
                'cost' => (float) $rows->sum('cost'),
                'profit' => (float) $rows->sum('profit'),
            ],
        ];
    }

    private function customerSales(Carbon $from, Carbon $to): array
    {
        $invoices = $this->postedSales($from, $to)->with('customer:id,name,city')->get()->groupBy('customer_id');

        $rows = $invoices->map(function ($group) {
            $customer = $group->first()->customer;

            return [
                'customer' => $customer?->name,
                'city' => $customer?->city,
                'invoices' => $group->count(),
                'revenue' => (float) $group->sum('total_amount'),
                'profit' => (float) $group->sum('total_profit'),
                'outstanding' => $customer ? $this->ledger->outstanding($customer) : 0,
            ];
        })->sortByDesc('revenue')->values();

        return [
            'columns' => [
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'city', 'label' => 'City'],
                ['key' => 'invoices', 'label' => 'Invoices', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'revenue', 'label' => 'Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'profit', 'label' => 'Profit', 'align' => 'right', 'format' => 'money'],
                ['key' => 'outstanding', 'label' => 'Outstanding', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'invoices' => (int) $rows->sum('invoices'),
                'revenue' => (float) $rows->sum('revenue'),
                'profit' => (float) $rows->sum('profit'),
                'outstanding' => (float) $rows->sum('outstanding'),
            ],
        ];
    }

    private function bookerSales(Carbon $from, Carbon $to): array
    {
        $invoices = $this->postedSales($from, $to)->with('customer:id,name,booker_id')->get();
        $bookers = User::whereIn('id', $invoices->pluck('customer.booker_id')->filter())->pluck('name', 'id');

        $rows = $invoices
            ->groupBy(fn ($invoice) => $invoice->customer?->booker_id ?? 0)
            ->map(fn ($group, $bookerId) => [
                'booker' => $bookerId ? ($bookers[$bookerId] ?? "User #{$bookerId}") : '— Unassigned —',
                'invoices' => $group->count(),
                'revenue' => (float) $group->sum('total_amount'),
                'profit' => (float) $group->sum('total_profit'),
            ])
            ->sortByDesc('revenue')->values();

        return [
            'columns' => [
                ['key' => 'booker', 'label' => 'Booker'],
                ['key' => 'invoices', 'label' => 'Invoices', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'revenue', 'label' => 'Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'profit', 'label' => 'Profit', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'invoices' => (int) $rows->sum('invoices'),
                'revenue' => (float) $rows->sum('revenue'),
                'profit' => (float) $rows->sum('profit'),
            ],
        ];
    }

    private function purchaseRegister(Carbon $from, Carbon $to, array $filters): array
    {
        $invoices = PurchaseInvoice::where('status', 'posted')
            ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to)
            ->when($filters['company_id'] ?? null, fn ($q, $id) => $q->where('company_id', $id))
            ->with('company:id,name')
            ->orderBy('invoice_date')->orderBy('id')
            ->get();

        return [
            'columns' => [
                ['key' => 'invoice_number', 'label' => 'Invoice #'],
                ['key' => 'supplier_invoice_number', 'label' => 'Supplier Inv #'],
                ['key' => 'company', 'label' => 'Supplier'],
                ['key' => 'invoice_date', 'label' => 'Date', 'format' => 'date'],
                ['key' => 'total_amount', 'label' => 'Total', 'align' => 'right', 'format' => 'money'],
                ['key' => 'total_margin', 'label' => 'Margin', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $invoices->map(fn ($invoice) => [
                'invoice_number' => $invoice->invoice_number,
                'supplier_invoice_number' => $invoice->supplier_invoice_number,
                'company' => $invoice->company?->name,
                'invoice_date' => $invoice->invoice_date->toDateString(),
                'total_amount' => (float) $invoice->total_amount,
                'total_margin' => (float) $invoice->total_margin,
            ])->all(),
            'totals' => [
                'total_amount' => (float) $invoices->sum('total_amount'),
                'total_margin' => (float) $invoices->sum('total_margin'),
            ],
        ];
    }

    private function supplierPurchases(Carbon $from, Carbon $to): array
    {
        $invoices = PurchaseInvoice::where('status', 'posted')
            ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to)
            ->with('company:id,name')
            ->get()
            ->groupBy('company_id');

        $rows = $invoices->map(fn ($group) => [
            'supplier' => $group->first()->company?->name,
            'invoices' => $group->count(),
            'total' => (float) $group->sum('total_amount'),
            'margin' => (float) $group->sum('total_margin'),
        ])->sortByDesc('total')->values();

        return [
            'columns' => [
                ['key' => 'supplier', 'label' => 'Supplier'],
                ['key' => 'invoices', 'label' => 'Invoices', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'total', 'label' => 'Purchases', 'align' => 'right', 'format' => 'money'],
                ['key' => 'margin', 'label' => 'Expected Margin', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'invoices' => (int) $rows->sum('invoices'),
                'total' => (float) $rows->sum('total'),
                'margin' => (float) $rows->sum('margin'),
            ],
        ];
    }

    private function bonusAnalysis(Carbon $from, Carbon $to): array
    {
        $received = PurchaseInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->where('bonus_quantity', '>', 0)
            ->with('product:id,name')
            ->get()
            ->groupBy('product_id');

        $given = SalesInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->where('bonus_quantity', '>', 0)
            ->get()
            ->groupBy('product_id')
            ->map(fn ($group) => (float) $group->sum('bonus_quantity'));

        $productIds = $received->keys()->merge($given->keys())->unique();
        $products = Product::whereIn('id', $productIds)->pluck('name', 'id');

        $rows = $productIds->map(function ($productId) use ($received, $given, $products) {
            $receivedQty = (float) ($received[$productId] ?? collect())->sum('bonus_quantity');
            $givenQty = (float) ($given[$productId] ?? 0);

            return [
                'product' => $products[$productId] ?? "#{$productId}",
                'received' => $receivedQty,
                'given' => $givenQty,
                'net' => $receivedQty - $givenQty,
            ];
        })->sortByDesc('received')->values();

        return [
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'received', 'label' => 'Bonus Received', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'given', 'label' => 'Bonus Given', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'net', 'label' => 'Net Kept', 'align' => 'right', 'format' => 'qty'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'received' => (float) $rows->sum('received'),
                'given' => (float) $rows->sum('given'),
                'net' => (float) $rows->sum('net'),
            ],
        ];
    }

    private function stockPosition(array $filters): array
    {
        $products = Product::query()
            ->with('company:id,name')
            ->withSum('batches as stock', 'qty_available')
            ->when($filters['company_id'] ?? null, fn ($q, $id) => $q->where('company_id', $id))
            ->addSelect([
                'stock_value' => Batch::selectRaw('COALESCE(SUM(qty_available * effective_cost), 0)')
                    ->whereColumn('batches.product_id', 'products.id'),
            ])
            ->orderBy('name')
            ->get()
            ->filter(fn ($product) => (float) ($product->stock ?? 0) > 0)
            ->values();

        return [
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'supplier', 'label' => 'Supplier'],
                ['key' => 'stock', 'label' => 'Available', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'value', 'label' => 'Value at Cost', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $products->map(fn ($product) => [
                'product' => $product->name,
                'supplier' => $product->company?->name,
                'stock' => (float) ($product->stock ?? 0),
                'value' => round((float) ($product->stock_value ?? 0), 2),
            ])->all(),
            'totals' => [
                'stock' => (float) $products->sum('stock'),
                'value' => round((float) $products->sum('stock_value'), 2),
            ],
        ];
    }

    private function expiry(array $filters): array
    {
        $window = $filters['expiry_window'] ?? '90';

        $batches = Batch::with(['product:id,name', 'warehouse:id,name'])
            ->inStock()
            ->whereNotNull('expiry_date')
            ->when($window === 'expired',
                fn ($q) => $q->whereDate('expiry_date', '<', now()),
                fn ($q) => $q->whereDate('expiry_date', '<=', now()->addDays((int) $window)))
            ->orderBy('expiry_date')
            ->get();

        return [
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'batch_number', 'label' => 'Batch'],
                ['key' => 'expiry_date', 'label' => 'Expiry', 'format' => 'date'],
                ['key' => 'qty', 'label' => 'In Stock', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'value', 'label' => 'Value at Cost', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $batches->map(fn ($batch) => [
                'product' => $batch->product?->name,
                'batch_number' => $batch->batch_number,
                'expiry_date' => $batch->expiry_date->toDateString(),
                'qty' => (float) $batch->qty_available,
                'value' => round((float) $batch->qty_available * (float) $batch->effective_cost, 2),
            ])->all(),
            'totals' => [
                'qty' => (float) $batches->sum('qty_available'),
                'value' => round($batches->sum(fn ($b) => (float) $b->qty_available * (float) $b->effective_cost), 2),
            ],
        ];
    }

    private function slowFastMoving(Carbon $from, Carbon $to, array $filters): array
    {
        $sold = SalesInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->get()
            ->groupBy('product_id')
            ->map(fn ($group) => (float) $group->sum('quantity'));

        $products = Product::active()->withSum('batches as stock', 'qty_available')->get();

        $rows = $products->map(fn ($product) => [
            'product' => $product->name,
            'sold' => (float) ($sold[$product->id] ?? 0),
            'stock' => (float) ($product->stock ?? 0),
        ]);

        $rows = (($filters['order'] ?? 'slow') === 'fast')
            ? $rows->sortByDesc('sold')->values()
            : $rows->sortBy('sold')->values();

        return [
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'sold', 'label' => 'Qty Sold in Period', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'stock', 'label' => 'Current Stock', 'align' => 'right', 'format' => 'qty'],
            ],
            'rows' => $rows->all(),
            'totals' => ['sold' => (float) $rows->sum('sold'), 'stock' => (float) $rows->sum('stock')],
        ];
    }

    private function outstanding(): array
    {
        $rows = Customer::active()
            ->withSum('ledgerEntries as debit_sum', 'debit')
            ->withSum('ledgerEntries as credit_sum', 'credit')
            ->orderBy('name')
            ->get()
            ->map(function (Customer $customer) {
                $balance = round((float) $customer->debit_sum - (float) $customer->credit_sum, 2);
                $aging = $balance > 0 ? $this->ledger->aging($customer) : null;

                return [
                    'customer' => $customer->name,
                    'city' => $customer->city,
                    'balance' => $balance,
                    'current' => $aging['current'] ?? 0,
                    'd31_60' => $aging['31_60'] ?? 0,
                    'd61_90' => $aging['61_90'] ?? 0,
                    'over_90' => $aging['over_90'] ?? 0,
                ];
            })
            ->filter(fn ($row) => $row['balance'] != 0.0)
            ->sortByDesc('balance')->values();

        return [
            'columns' => [
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'city', 'label' => 'City'],
                ['key' => 'balance', 'label' => 'Balance', 'align' => 'right', 'format' => 'money'],
                ['key' => 'current', 'label' => '0–30', 'align' => 'right', 'format' => 'money'],
                ['key' => 'd31_60', 'label' => '31–60', 'align' => 'right', 'format' => 'money'],
                ['key' => 'd61_90', 'label' => '61–90', 'align' => 'right', 'format' => 'money'],
                ['key' => 'over_90', 'label' => '90+', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'balance' => (float) $rows->sum('balance'),
                'current' => (float) $rows->sum('current'),
                'd31_60' => (float) $rows->sum('d31_60'),
                'd61_90' => (float) $rows->sum('d61_90'),
                'over_90' => (float) $rows->sum('over_90'),
            ],
        ];
    }

    private function supplierPayables(): array
    {
        $rows = Company::active()
            ->withSum('ledgerEntries as debit_sum', 'debit')
            ->withSum('ledgerEntries as credit_sum', 'credit')
            ->orderBy('name')
            ->get()
            ->map(fn (Company $company) => [
                'supplier' => $company->name,
                'balance' => round((float) $company->credit_sum - (float) $company->debit_sum, 2),
            ])
            ->filter(fn ($row) => $row['balance'] != 0.0)
            ->sortByDesc('balance')->values();

        return [
            'columns' => [
                ['key' => 'supplier', 'label' => 'Supplier'],
                ['key' => 'balance', 'label' => 'Payable', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => ['balance' => (float) $rows->sum('balance')],
        ];
    }

    public function profitByMonth(): array
    {
        $start = now()->subMonths(11)->startOfMonth();

        $invoices = SalesInvoice::where('status', 'posted')
            ->whereDate('invoice_date', '>=', $start)
            ->get(['invoice_date', 'total_amount', 'total_cost', 'total_profit'])
            ->groupBy(fn ($invoice) => $invoice->invoice_date->format('Y-m'));

        $rows = collect(range(0, 11))->map(function ($offset) use ($start, $invoices) {
            $month = $start->copy()->addMonths($offset);
            $key = $month->format('Y-m');
            $group = $invoices[$key] ?? collect();
            $sales = (float) $group->sum('total_amount');
            $profit = (float) $group->sum('total_profit');

            return [
                'month' => $month->format('M Y'),
                'sales' => $sales,
                'cost' => (float) $group->sum('total_cost'),
                'profit' => $profit,
                'margin_pct' => $sales > 0 ? round($profit / $sales * 100, 1) : 0,
            ];
        });

        return [
            'columns' => [
                ['key' => 'month', 'label' => 'Month'],
                ['key' => 'sales', 'label' => 'Sales', 'align' => 'right', 'format' => 'money'],
                ['key' => 'cost', 'label' => 'Cost', 'align' => 'right', 'format' => 'money'],
                ['key' => 'profit', 'label' => 'Profit', 'align' => 'right', 'format' => 'money'],
                ['key' => 'margin_pct', 'label' => 'Margin %', 'align' => 'right', 'format' => 'pct'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'sales' => (float) $rows->sum('sales'),
                'cost' => (float) $rows->sum('cost'),
                'profit' => (float) $rows->sum('profit'),
            ],
            'chart' => $rows->map(fn ($row) => [
                'label' => $row['month'],
                'sales' => $row['sales'],
                'profit' => $row['profit'],
            ])->all(),
        ];
    }
}
