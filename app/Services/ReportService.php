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
use App\Models\SalesInvoiceItemIncentive;
use App\Models\SalesReturn;
use App\Models\SalesReturnItem;
use App\Models\StockMovement;
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
            'product-sales-daily' => ['title' => 'Daily Product Sales', 'category' => 'Sales', 'description' => 'Per product, per day: qty, bonus given, revenue, cost and profit (net of returns). Cost includes the bonus units shipped free, so profit is true.', 'filters' => ['date_range', 'supplier', 'product']],
            'customer-sales' => ['title' => 'Customer Sales & Profitability', 'category' => 'Sales', 'description' => 'Revenue, profit, and outstanding per pharmacy', 'filters' => ['date_range']],
            'booker-sales' => ['title' => 'Booker Sales', 'category' => 'Sales', 'description' => 'Sales attributed to each booker via assigned customers', 'filters' => ['date_range']],
            'incentives-given' => ['title' => 'Incentives Given', 'category' => 'Sales', 'description' => 'Incentive rules granted to customers: times applied, invoices, and Rs value', 'filters' => ['date_range', 'customer']],
            'purchase-register' => ['title' => 'Purchase Register', 'category' => 'Purchases', 'description' => 'Every posted purchase invoice in a period', 'filters' => ['date_range', 'supplier']],
            'supplier-purchases' => ['title' => 'Supplier Purchases', 'category' => 'Purchases', 'description' => 'Purchase volume and margin per supplier', 'filters' => ['date_range']],
            'bonus-analysis' => ['title' => 'Bonus Analysis', 'category' => 'Purchases', 'description' => 'Bonus received vs bonus given away per product', 'filters' => ['date_range']],
            'stock-position' => ['title' => 'Stock Position', 'category' => 'Inventory', 'description' => 'Current stock and value at cost', 'filters' => ['supplier']],
            'stock-movement' => ['title' => 'Stock Movement', 'category' => 'Inventory', 'description' => 'Per-product opening, purchases, billed vs bonus units sold, closing and value at cost', 'filters' => ['date_range', 'supplier', 'product']],
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
            'product-sales-daily' => $this->productSalesDaily($from, $to, $filters),
            'customer-sales' => $this->customerSales($from, $to),
            'booker-sales' => $this->bookerSales($from, $to),
            'incentives-given' => $this->incentivesGiven($from, $to, $filters),
            'purchase-register' => $this->purchaseRegister($from, $to, $filters),
            'supplier-purchases' => $this->supplierPurchases($from, $to),
            'bonus-analysis' => $this->bonusAnalysis($from, $to),
            'stock-position' => $this->stockPosition($filters),
            'stock-movement' => $this->stockMovement($from, $to, $filters),
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

    /** Valid (non-cancelled) sales returns in a period, for netting reports. */
    private function postedReturns(Carbon $from, Carbon $to)
    {
        return SalesReturn::where('status', SalesReturn::STATUS_POSTED)
            ->whereDate('return_date', '>=', $from)
            ->whereDate('return_date', '<=', $to);
    }

    private function salesRegister(Carbon $from, Carbon $to, array $filters): array
    {
        $invoices = $this->postedSales($from, $to)
            ->when($filters['customer_id'] ?? null, fn ($q, $id) => $q->where('customer_id', $id))
            ->with('customer:id,name,city')
            ->orderBy('invoice_date')->orderBy('id')
            ->get();

        // Net each listed invoice by all of its valid returns (regardless of the
        // return's own date) so the register shows the true final sale.
        $returns = SalesReturn::where('status', SalesReturn::STATUS_POSTED)
            ->whereIn('sales_invoice_id', $invoices->pluck('id'))
            ->get()
            ->groupBy('sales_invoice_id');

        $rows = $invoices->map(function ($invoice) use ($returns) {
            $ret = $returns[$invoice->id] ?? collect();
            $retAmount = (float) $ret->sum('total_amount');
            $retCost = (float) $ret->sum('total_cost');
            $gross = (float) $invoice->total_amount;

            return [
                'invoice_number' => $invoice->invoice_number,
                'invoice_date' => $invoice->invoice_date->toDateString(),
                'customer' => $invoice->customer?->name,
                'sale_type' => ucwords(str_replace('_', ' ', $invoice->sale_type)),
                'total_amount' => $gross,
                'returns' => round($retAmount, 2),
                'net_amount' => round($gross - $retAmount, 2),
                'net_profit' => round((float) $invoice->total_profit - ($retAmount - $retCost), 2),
            ];
        });

        return [
            'columns' => [
                ['key' => 'invoice_number', 'label' => 'Invoice #'],
                ['key' => 'invoice_date', 'label' => 'Date', 'format' => 'date'],
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'sale_type', 'label' => 'Type'],
                ['key' => 'total_amount', 'label' => 'Gross', 'align' => 'right', 'format' => 'money'],
                ['key' => 'returns', 'label' => 'Returns', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_amount', 'label' => 'Net', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_profit', 'label' => 'Net Profit', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'total_amount' => (float) $rows->sum('total_amount'),
                'returns' => (float) $rows->sum('returns'),
                'net_amount' => (float) $rows->sum('net_amount'),
                'net_profit' => (float) $rows->sum('net_profit'),
            ],
        ];
    }

    private function productSales(Carbon $from, Carbon $to, array $filters): array
    {
        $companyId = $filters['company_id'] ?? null;

        $sold = SalesInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->when($companyId, fn ($q, $id) => $q->whereHas('product', fn ($p) => $p->where('company_id', $id)))
            ->with('product:id,name,company_id', 'product.company:id,name')
            ->get()
            ->groupBy('product_id');

        $returned = SalesReturnItem::query()
            ->whereHas('salesReturn', fn ($q) => $q->where('status', SalesReturn::STATUS_POSTED)
                ->whereDate('return_date', '>=', $from)->whereDate('return_date', '<=', $to))
            ->when($companyId, fn ($q, $id) => $q->whereHas('product', fn ($p) => $p->where('company_id', $id)))
            ->with('product:id,name,company_id', 'product.company:id,name')
            ->get()
            ->groupBy('product_id');

        $rows = $sold->keys()->merge($returned->keys())->unique()->map(function ($productId) use ($sold, $returned) {
            $soldGroup = $sold[$productId] ?? collect();
            $retGroup = $returned[$productId] ?? collect();
            $product = ($soldGroup->first() ?? $retGroup->first())->product;

            $grossQty = (float) $soldGroup->sum('quantity');
            $retQty = (float) $retGroup->sum('quantity');
            $grossRev = (float) $soldGroup->sum('net_amount');
            $retRev = (float) $retGroup->sum('net_amount');
            $retCost = (float) $retGroup->sum('cost_amount');

            return [
                'product' => $product?->name,
                'supplier' => $product?->company?->name,
                'qty' => $grossQty,
                'bonus' => (float) $soldGroup->sum('bonus_quantity'),
                'returned_qty' => $retQty,
                'net_qty' => round($grossQty - $retQty, 2),
                'revenue' => round($grossRev, 2),
                'returns' => round($retRev, 2),
                'net_revenue' => round($grossRev - $retRev, 2),
                'net_cost' => round((float) $soldGroup->sum('cost_amount') - $retCost, 2),
                'net_profit' => round((float) $soldGroup->sum('profit') - ($retRev - $retCost), 2),
            ];
        })->sortByDesc('net_revenue')->values();

        return [
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'supplier', 'label' => 'Supplier'],
                ['key' => 'qty', 'label' => 'Qty Sold', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'bonus', 'label' => 'Bonus Given', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'returned_qty', 'label' => 'Qty Returned', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'net_qty', 'label' => 'Net Qty', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'revenue', 'label' => 'Gross Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'returns', 'label' => 'Returns', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_revenue', 'label' => 'Net Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_cost', 'label' => 'Net Cost', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_profit', 'label' => 'Net Profit', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'qty' => (float) $rows->sum('qty'),
                'bonus' => (float) $rows->sum('bonus'),
                'returned_qty' => (float) $rows->sum('returned_qty'),
                'net_qty' => (float) $rows->sum('net_qty'),
                'revenue' => (float) $rows->sum('revenue'),
                'returns' => (float) $rows->sum('returns'),
                'net_revenue' => (float) $rows->sum('net_revenue'),
                'net_cost' => (float) $rows->sum('net_cost'),
                'net_profit' => (float) $rows->sum('net_profit'),
            ],
        ];
    }

    /**
     * Daily Product Sales — one row per product per day, net of returns.
     *
     * Cost/profit come straight from the posted sale items, where cost_amount is
     * the FIFO cost of quantity + bonus_quantity (bonus units ship free but are
     * still costed in InvoicePostingService::postSale). So profit = net revenue −
     * COGS of every unit shipped, and the free bonus units correctly pull profit
     * down — they are never treated as zero-cost. Returns are netted by their own
     * return_date bucket (bonus is not netted; returns rarely carry bonus units).
     */
    private function productSalesDaily(Carbon $from, Carbon $to, array $filters): array
    {
        $companyId = $filters['company_id'] ?? null;
        $productId = $filters['product_id'] ?? null;

        $byCompany = fn ($q, $id) => $q->whereHas('product', fn ($p) => $p->where('company_id', $id));
        $byProduct = fn ($q, $id) => $q->where('product_id', $id);

        // Sales, bucketed by product × invoice date.
        $sold = SalesInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->when($companyId, $byCompany)
            ->when($productId, $byProduct)
            ->with('invoice:id,invoice_date', 'product:id,name,company_id', 'product.company:id,name')
            ->get()
            ->groupBy(fn ($item) => $item->product_id.'|'.$item->invoice->invoice_date->toDateString());

        // Returns, bucketed by product × return date.
        $returned = SalesReturnItem::query()
            ->whereHas('salesReturn', fn ($q) => $q->where('status', SalesReturn::STATUS_POSTED)
                ->whereDate('return_date', '>=', $from)->whereDate('return_date', '<=', $to))
            ->when($companyId, $byCompany)
            ->when($productId, $byProduct)
            ->with('salesReturn:id,return_date', 'product:id,name,company_id', 'product.company:id,name')
            ->get()
            ->groupBy(fn ($item) => $item->product_id.'|'.$item->salesReturn->return_date->toDateString());

        $rows = $sold->keys()->merge($returned->keys())->unique()
            ->map(function ($key) use ($sold, $returned) {
                [$productId, $date] = explode('|', $key);
                $soldGroup = $sold[$key] ?? collect();
                $retGroup = $returned[$key] ?? collect();
                $product = ($soldGroup->first() ?? $retGroup->first())->product;

                $soldRev = (float) $soldGroup->sum('net_amount');
                $retRev = (float) $retGroup->sum('net_amount');
                $soldCost = (float) $soldGroup->sum('cost_amount');
                $retCost = (float) $retGroup->sum('cost_amount');

                $revenue = round($soldRev - $retRev, 2);
                $cost = round($soldCost - $retCost, 2);
                // Same netting the other profit reports use: return profit is
                // (retRev − retCost), removed from the day's sale profit.
                $profit = round((float) $soldGroup->sum('profit') - ($retRev - $retCost), 2);

                return [
                    'date' => $date,
                    'product' => $product?->name,
                    'supplier' => $product?->company?->name,
                    'qty' => round((float) $soldGroup->sum('quantity') - (float) $retGroup->sum('quantity'), 2),
                    'bonus' => (float) $soldGroup->sum('bonus_quantity'),
                    'revenue' => $revenue,
                    'cost' => $cost,
                    'profit' => $profit,
                    'margin_pct' => $revenue > 0 ? round($profit / $revenue * 100, 2) : 0.0,
                ];
            })
            ->sortBy(fn ($row) => [$row['product'], $row['date']])->values();

        $totalRevenue = round((float) $rows->sum('revenue'), 2);
        $totalProfit = round((float) $rows->sum('profit'), 2);

        return [
            'columns' => [
                ['key' => 'date', 'label' => 'Date', 'format' => 'date'],
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'supplier', 'label' => 'Supplier'],
                ['key' => 'qty', 'label' => 'Qty', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'bonus', 'label' => 'Bonus', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'revenue', 'label' => 'Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'cost', 'label' => 'Cost', 'align' => 'right', 'format' => 'money'],
                ['key' => 'profit', 'label' => 'Profit', 'align' => 'right', 'format' => 'money'],
                ['key' => 'margin_pct', 'label' => 'Margin %', 'align' => 'right', 'format' => 'pct'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'qty' => round((float) $rows->sum('qty'), 2),
                'bonus' => (float) $rows->sum('bonus'),
                'revenue' => $totalRevenue,
                'cost' => round((float) $rows->sum('cost'), 2),
                'profit' => $totalProfit,
                'margin_pct' => $totalRevenue > 0 ? round($totalProfit / $totalRevenue * 100, 2) : 0.0,
            ],
        ];
    }

    private function customerSales(Carbon $from, Carbon $to): array
    {
        $invoices = $this->postedSales($from, $to)->with('customer:id,name,city')->get()->groupBy('customer_id');
        $returns = $this->postedReturns($from, $to)->with('customer:id,name,city')->get()->groupBy('customer_id');

        $customerIds = $invoices->keys()->merge($returns->keys())->filter()->unique();
        $customers = Customer::whereIn('id', $customerIds)->get()->keyBy('id');

        $rows = $customerIds->map(function ($customerId) use ($invoices, $returns, $customers) {
            $invGroup = $invoices[$customerId] ?? collect();
            $retGroup = $returns[$customerId] ?? collect();
            $customer = $customers[$customerId] ?? $invGroup->first()?->customer ?? $retGroup->first()?->customer;

            $grossRev = (float) $invGroup->sum('total_amount');
            $retRev = (float) $retGroup->sum('total_amount');
            $retCost = (float) $retGroup->sum('total_cost');

            return [
                'customer' => $customer?->name,
                'city' => $customer?->city,
                'invoices' => $invGroup->count(),
                'revenue' => round($grossRev, 2),
                'returns' => round($retRev, 2),
                'net_revenue' => round($grossRev - $retRev, 2),
                'net_profit' => round((float) $invGroup->sum('total_profit') - ($retRev - $retCost), 2),
                'outstanding' => $customer ? $this->ledger->outstanding($customer) : 0,
            ];
        })->sortByDesc('net_revenue')->values();

        return [
            'columns' => [
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'city', 'label' => 'City'],
                ['key' => 'invoices', 'label' => 'Invoices', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'revenue', 'label' => 'Gross Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'returns', 'label' => 'Returns', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_revenue', 'label' => 'Net Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_profit', 'label' => 'Net Profit', 'align' => 'right', 'format' => 'money'],
                ['key' => 'outstanding', 'label' => 'Outstanding', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'invoices' => (int) $rows->sum('invoices'),
                'revenue' => (float) $rows->sum('revenue'),
                'returns' => (float) $rows->sum('returns'),
                'net_revenue' => (float) $rows->sum('net_revenue'),
                'net_profit' => (float) $rows->sum('net_profit'),
                'outstanding' => (float) $rows->sum('outstanding'),
            ],
        ];
    }

    private function bookerSales(Carbon $from, Carbon $to): array
    {
        $invoices = $this->postedSales($from, $to)->with('customer:id,name,booker_id')->get();
        $returns = $this->postedReturns($from, $to)->with('customer:id,booker_id')->get();

        $bookerIds = $invoices->pluck('customer.booker_id')
            ->merge($returns->pluck('customer.booker_id'))->filter()->unique();
        $bookers = User::whereIn('id', $bookerIds)->pluck('name', 'id');

        $invByBooker = $invoices->groupBy(fn ($invoice) => $invoice->customer?->booker_id ?? 0);
        $retByBooker = $returns->groupBy(fn ($return) => $return->customer?->booker_id ?? 0);

        $rows = $invByBooker->keys()->merge($retByBooker->keys())->unique()->map(function ($bookerId) use ($invByBooker, $retByBooker, $bookers) {
            $invGroup = $invByBooker[$bookerId] ?? collect();
            $retGroup = $retByBooker[$bookerId] ?? collect();

            $grossRev = (float) $invGroup->sum('total_amount');
            $retRev = (float) $retGroup->sum('total_amount');
            $retCost = (float) $retGroup->sum('total_cost');

            return [
                'booker' => $bookerId ? ($bookers[$bookerId] ?? "User #{$bookerId}") : '— Unassigned —',
                'invoices' => $invGroup->count(),
                'revenue' => round($grossRev, 2),
                'returns' => round($retRev, 2),
                'net_revenue' => round($grossRev - $retRev, 2),
                'net_profit' => round((float) $invGroup->sum('total_profit') - ($retRev - $retCost), 2),
            ];
        })->sortByDesc('net_revenue')->values();

        return [
            'columns' => [
                ['key' => 'booker', 'label' => 'Booker'],
                ['key' => 'invoices', 'label' => 'Invoices', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'revenue', 'label' => 'Gross Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'returns', 'label' => 'Returns', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_revenue', 'label' => 'Net Revenue', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_profit', 'label' => 'Net Profit', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'invoices' => (int) $rows->sum('invoices'),
                'revenue' => (float) $rows->sum('revenue'),
                'returns' => (float) $rows->sum('returns'),
                'net_revenue' => (float) $rows->sum('net_revenue'),
                'net_profit' => (float) $rows->sum('net_profit'),
            ],
        ];
    }

    /**
     * Incentives Given — the durable record of what each customer received.
     * Reads the per-line incentive rows attached to posted (non-cancelled)
     * sales invoices, grouped per customer × rule: how many times applied, in
     * how many distinct invoices, bonus units, Rs discount, and total value.
     */
    private function incentivesGiven(Carbon $from, Carbon $to, array $filters): array
    {
        $records = SalesInvoiceItemIncentive::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->when($filters['customer_id'] ?? null, fn ($q, $id) => $q->where('customer_id', $id))
            ->with('customer:id,name,city')
            ->get();

        $rows = $records
            ->groupBy(fn ($r) => $r->customer_id.'|'.$r->rule_type.'|'.$r->rule_name)
            ->map(function ($group) {
                $first = $group->first();

                return [
                    'customer' => $first->customer?->name ?? '—',
                    'city' => $first->customer?->city,
                    'rule' => $first->rule_name,
                    'type' => ucwords(str_replace('_', ' ', $first->rule_type)),
                    'times' => $group->count(),
                    'invoices' => $group->pluck('sales_invoice_id')->unique()->count(),
                    'bonus_qty' => round((float) $group->sum('bonus_qty'), 2),
                    'discount' => round((float) $group->sum('discount_amount'), 2),
                    'value_given' => round((float) $group->sum('value_given'), 2),
                ];
            })
            ->sortByDesc('value_given')->values();

        return [
            'columns' => [
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'city', 'label' => 'City'],
                ['key' => 'rule', 'label' => 'Incentive Rule'],
                ['key' => 'type', 'label' => 'Type'],
                ['key' => 'times', 'label' => 'Times Applied', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'invoices', 'label' => 'Invoices', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'bonus_qty', 'label' => 'Bonus Units', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'discount', 'label' => 'Discount Rs', 'align' => 'right', 'format' => 'money'],
                ['key' => 'value_given', 'label' => 'Total Value', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'times' => (int) $rows->sum('times'),
                'invoices' => (int) $rows->sum('invoices'),
                'bonus_qty' => (float) $rows->sum('bonus_qty'),
                'discount' => (float) $rows->sum('discount'),
                'value_given' => (float) $rows->sum('value_given'),
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

    /**
     * Per-product stock movement ("stock card"). stock_movements is the append-only
     * truth and reconciles to qty_available, so opening/closing come from signed
     * movement sums. Bonus is folded into each sale/purchase movement quantity, so
     * the bonus columns are overlaid from the source invoice items to expose how
     * much of the in/out flow was free. Out is split into Billed (Out) + Bonus (Out)
     * so the two add up to the units that left stock: the bonus give-away is deducted
     * from stock (inside the sale movement) yet billed to no one.
     *
     * Note: `value` is the CURRENT on-hand value at cost (Σ qty_available ×
     * effective_cost, same as Stock Position) — exact when run to today; `closing`
     * qty is the movement-derived figure as of `to`.
     */
    private function stockMovement(Carbon $from, Carbon $to, array $filters): array
    {
        $companyId = $filters['company_id'] ?? null;
        $productId = $filters['product_id'] ?? null;
        $start = $from->copy()->startOfDay();
        $end = $to->copy()->endOfDay();

        $byCompany = fn ($q, $id) => $q->whereHas('product', fn ($p) => $p->where('company_id', $id));

        // Opening on-hand per product = signed sum of every movement before the window.
        $opening = StockMovement::query()
            ->where('created_at', '<', $start)
            ->when($productId, fn ($q, $id) => $q->where('product_id', $id))
            ->when($companyId, $byCompany)
            ->selectRaw('product_id, SUM(quantity) as qty')
            ->groupBy('product_id')
            ->pluck('qty', 'product_id');

        // In-range movements bucketed by type per product.
        $inRange = StockMovement::query()
            ->whereBetween('created_at', [$start, $end])
            ->when($productId, fn ($q, $id) => $q->where('product_id', $id))
            ->when($companyId, $byCompany)
            ->selectRaw('product_id, type, SUM(quantity) as qty')
            ->groupBy('product_id', 'type')
            ->get()
            ->groupBy('product_id');

        // Bonus received (purchases) / given (sales) per product, from the source items.
        $bonusIn = PurchaseInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->when($productId, fn ($q, $id) => $q->where('product_id', $id))
            ->when($companyId, $byCompany)
            ->selectRaw('product_id, SUM(bonus_quantity) as qty')
            ->groupBy('product_id')
            ->pluck('qty', 'product_id');

        $bonusOut = SalesInvoiceItem::query()
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted')
                ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to))
            ->when($productId, fn ($q, $id) => $q->where('product_id', $id))
            ->when($companyId, $byCompany)
            ->selectRaw('product_id, SUM(bonus_quantity) as qty')
            ->groupBy('product_id')
            ->pluck('qty', 'product_id');

        // Product meta + current value at cost (same subquery as stock-position).
        $products = Product::query()
            ->select('products.*')
            ->with('company:id,name')
            ->when($productId, fn ($q, $id) => $q->where('id', $id))
            ->when($companyId, fn ($q, $id) => $q->where('company_id', $id))
            ->addSelect([
                'stock_value' => Batch::selectRaw('COALESCE(SUM(qty_available * effective_cost), 0)')
                    ->whereColumn('batches.product_id', 'products.id'),
            ])
            ->get()
            ->keyBy('id');

        // One row per product with any opening balance or in-range movement, kept
        // within the product/company filter set.
        $rows = $opening->keys()->merge($inRange->keys())->unique()
            ->filter(fn ($id) => $products->has($id))
            ->map(function ($id) use ($opening, $inRange, $bonusIn, $bonusOut, $products) {
                $product = $products[$id];
                $open = (float) ($opening[$id] ?? 0);
                $byType = ($inRange[$id] ?? collect())->keyBy('type');

                $purchased = (float) ($byType->get('purchase')?->qty ?? 0);
                $sold = -(float) ($byType->get('sale')?->qty ?? 0); // stored negative → show positive out
                // Sale returns, purchase returns, manual adjustments and reservations
                // all net here so closing foots to the movement truth.
                $adjustments = (float) ($inRange[$id] ?? collect())
                    ->whereNotIn('type', ['purchase', 'sale'])
                    ->sum('qty');

                // Bonus is folded into the sale movement, so `sold` = billed + bonus
                // that physically left stock. Split it: Billed (Out) is what the
                // customer paid for, Bonus (Out) is the free units given away.
                $bonusUnitsOut = (float) ($bonusOut[$id] ?? 0);
                $billed = $sold - $bonusUnitsOut;

                return [
                    'product' => $product->name,
                    'supplier' => $product->company?->name,
                    'opening' => round($open, 2),
                    'purchased' => round($purchased, 2),
                    'bonus_in' => (float) ($bonusIn[$id] ?? 0),
                    'billed' => round($billed, 2),
                    'bonus_out' => $bonusUnitsOut,
                    'adjustments' => round($adjustments, 2),
                    // Billed + Bonus = every unit that left via sales, so closing
                    // still foots to the movement truth (qty_available).
                    'closing' => round($open + $purchased - $sold + $adjustments, 2),
                    'value' => round((float) ($product->stock_value ?? 0), 2),
                ];
            })
            ->sortBy('product')->values();

        return [
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'supplier', 'label' => 'Supplier'],
                ['key' => 'opening', 'label' => 'Opening', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'purchased', 'label' => 'Purchased (In)', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'bonus_in', 'label' => 'Bonus In', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'billed', 'label' => 'Billed (Out)', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'bonus_out', 'label' => 'Bonus (Out)', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'adjustments', 'label' => 'Returns/Adj', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'closing', 'label' => 'Closing Qty', 'align' => 'right', 'format' => 'qty'],
                ['key' => 'value', 'label' => 'Value at Cost', 'align' => 'right', 'format' => 'money'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'opening' => round((float) $rows->sum('opening'), 2),
                'purchased' => round((float) $rows->sum('purchased'), 2),
                'bonus_in' => (float) $rows->sum('bonus_in'),
                'billed' => round((float) $rows->sum('billed'), 2),
                'bonus_out' => (float) $rows->sum('bonus_out'),
                'adjustments' => round((float) $rows->sum('adjustments'), 2),
                'closing' => round((float) $rows->sum('closing'), 2),
                'value' => round((float) $rows->sum('value'), 2),
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

        $returns = SalesReturn::where('status', SalesReturn::STATUS_POSTED)
            ->whereDate('return_date', '>=', $start)
            ->get(['return_date', 'total_amount', 'total_cost'])
            ->groupBy(fn ($return) => $return->return_date->format('Y-m'));

        $rows = collect(range(0, 11))->map(function ($offset) use ($start, $invoices, $returns) {
            $month = $start->copy()->addMonths($offset);
            $key = $month->format('Y-m');
            $group = $invoices[$key] ?? collect();
            $ret = $returns[$key] ?? collect();

            $grossSales = (float) $group->sum('total_amount');
            $retSales = (float) $ret->sum('total_amount');
            $retCost = (float) $ret->sum('total_cost');

            $netSales = round($grossSales - $retSales, 2);
            $netProfit = round((float) $group->sum('total_profit') - ($retSales - $retCost), 2);

            return [
                'month' => $month->format('M Y'),
                'sales' => round($grossSales, 2),
                'returns' => round($retSales, 2),
                'net_sales' => $netSales,
                'cost' => round((float) $group->sum('total_cost') - $retCost, 2),
                'profit' => $netProfit,
                'margin_pct' => $netSales > 0 ? round($netProfit / $netSales * 100, 1) : 0,
            ];
        });

        return [
            'columns' => [
                ['key' => 'month', 'label' => 'Month'],
                ['key' => 'sales', 'label' => 'Gross Sales', 'align' => 'right', 'format' => 'money'],
                ['key' => 'returns', 'label' => 'Returns', 'align' => 'right', 'format' => 'money'],
                ['key' => 'net_sales', 'label' => 'Net Sales', 'align' => 'right', 'format' => 'money'],
                ['key' => 'cost', 'label' => 'Net Cost', 'align' => 'right', 'format' => 'money'],
                ['key' => 'profit', 'label' => 'Net Profit', 'align' => 'right', 'format' => 'money'],
                ['key' => 'margin_pct', 'label' => 'Margin %', 'align' => 'right', 'format' => 'pct'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'sales' => (float) $rows->sum('sales'),
                'returns' => (float) $rows->sum('returns'),
                'net_sales' => (float) $rows->sum('net_sales'),
                'cost' => (float) $rows->sum('cost'),
                'profit' => (float) $rows->sum('profit'),
            ],
            'chart' => $rows->map(fn ($row) => [
                'label' => $row['month'],
                'sales' => $row['net_sales'],
                'profit' => $row['profit'],
            ])->all(),
        ];
    }
}
