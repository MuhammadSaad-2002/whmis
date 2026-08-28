<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use Illuminate\Support\Carbon;

/**
 * Assembles the Executive Dashboard payload for Admin / Super Admin.
 *
 * Every figure is a thin slice of an existing, tested source — ReportService
 * (which owns the canonical report math) and LedgerService — so the dashboard
 * never disagrees with the Reports module. This service only READS; it touches
 * no ledger, posting, inventory or margin logic.
 *
 * Widgets split into two kinds:
 *   - PERIOD widgets (sales/profit/margin/purchases, top products, sales by
 *     supplier, top customers) are scoped to [from, to] and carry a delta vs the
 *     immediately preceding equal-length period.
 *   - SNAPSHOT widgets (receivable/payable/net position/inventory value, aging,
 *     stock on loan, expiring batches) are "as of now" and ignore the period.
 */
class DashboardService
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly LedgerService $ledger,
    ) {}

    public function executivePayload(Carbon $from, Carbon $to, string $period): array
    {
        return [
            'scope' => 'executive',
            'filterValues' => [
                'period' => $period,
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'kpis' => $this->periodKpis($from, $to),
            'financials' => $this->financials(),
            'monthlyTrend' => $this->reports->profitByMonth()['chart'],
            'aging' => $this->aging(),
            'topProducts' => $this->topProducts($from, $to),
            'salesBySupplier' => $this->salesBySupplier($from, $to),
            'topDebtors' => $this->topDebtors(),
            'topCustomers' => $this->topCustomers($from, $to),
            'stockOnLoan' => $this->stockOnLoan(),
            'attention' => $this->attention(),
            'recentSales' => $this->recentSales(),
            'expiringSoon' => $this->expiringSoon(),
        ];
    }

    /** Sales / profit / margin / purchases for the period, each with a % delta vs the prior period. */
    private function periodKpis(Carbon $from, Carbon $to): array
    {
        [$prevFrom, $prevTo] = $this->previousPeriod($from, $to);

        $now = $this->salesTotals($from, $to);
        $prev = $this->salesTotals($prevFrom, $prevTo);

        $purchases = $this->purchaseTotal($from, $to);
        $prevPurchases = $this->purchaseTotal($prevFrom, $prevTo);

        return [
            'sales' => $now['sales'],
            'sales_delta' => $this->delta($now['sales'], $prev['sales']),
            'profit' => $now['profit'],
            'profit_delta' => $this->delta($now['profit'], $prev['profit']),
            'margin_pct' => $now['sales'] > 0 ? round($now['profit'] / $now['sales'] * 100, 1) : 0.0,
            'prev_margin_pct' => $prev['sales'] > 0 ? round($prev['profit'] / $prev['sales'] * 100, 1) : 0.0,
            'purchases' => $purchases,
            'purchases_delta' => $this->delta($purchases, $prevPurchases),
        ];
    }

    /** @return array{sales: float, profit: float} */
    private function salesTotals(Carbon $from, Carbon $to): array
    {
        $row = SalesInvoice::where('status', 'posted')
            ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to)
            ->selectRaw('COALESCE(SUM(total_amount), 0) as sales, COALESCE(SUM(total_profit), 0) as profit')
            ->first();

        return ['sales' => (float) $row->sales, 'profit' => (float) $row->profit];
    }

    private function purchaseTotal(Carbon $from, Carbon $to): float
    {
        return (float) PurchaseInvoice::where('status', 'posted')
            ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to)
            ->sum('total_amount');
    }

    /** The equal-length window immediately before [from, to]. */
    private function previousPeriod(Carbon $from, Carbon $to): array
    {
        $days = $from->diffInDays($to);
        $prevTo = $from->copy()->subDay();
        $prevFrom = $prevTo->copy()->subDays($days);

        return [$prevFrom, $prevTo];
    }

    /** Signed % change, or null when there is no comparable base (avoids ÷0 / ∞). */
    private function delta(float $current, float $previous): ?float
    {
        if ($previous == 0.0) {
            return null;
        }

        return round(($current - $previous) / abs($previous) * 100, 1);
    }

    /** Point-in-time money position (mirrors the current full-dashboard KPIs). */
    private function financials(): array
    {
        $receivable = (float) LedgerEntry::where('party_type', 'customer')
            ->selectRaw('COALESCE(SUM(debit - credit), 0) as v')->value('v');
        $payable = (float) LedgerEntry::where('party_type', 'company')
            ->selectRaw('COALESCE(SUM(credit - debit), 0) as v')->value('v');
        $inventory = (float) Batch::selectRaw('COALESCE(SUM(qty_available * effective_cost), 0) as v')->value('v');

        return [
            'receivable' => $receivable,
            'payable' => $payable,
            'net_position' => round($receivable - $payable, 2),
            'inventory_value' => $inventory,
        ];
    }

    /** Receivables aging buckets for the donut — straight from the Outstanding report totals. */
    private function aging(): array
    {
        $totals = $this->reports->build('outstanding', [])['totals'];

        return [
            ['label' => '0–30', 'value' => (float) $totals['current']],
            ['label' => '31–60', 'value' => (float) $totals['d31_60']],
            ['label' => '61–90', 'value' => (float) $totals['d61_90']],
            ['label' => '90+', 'value' => (float) $totals['over_90']],
        ];
    }

    /** Top 5 customers by outstanding balance, from the Outstanding report rows. */
    private function topDebtors(): array
    {
        return collect($this->reports->build('outstanding', [])['rows'])
            ->take(5)
            ->map(fn ($row) => [
                'customer' => $row['customer'],
                'city' => $row['city'],
                'balance' => (float) $row['balance'],
                'over_90' => (float) $row['over_90'],
            ])
            ->values()->all();
    }

    /** Top 8 products by net revenue in the period (Product Sales report). */
    private function topProducts(Carbon $from, Carbon $to): array
    {
        return collect($this->productSalesRows($from, $to))
            ->take(8)
            ->map(fn ($row) => ['label' => $row['product'], 'value' => (float) $row['net_revenue']])
            ->values()->all();
    }

    /** Net revenue grouped by supplier in the period, top 8 (same Product Sales rows). */
    private function salesBySupplier(Carbon $from, Carbon $to): array
    {
        return collect($this->productSalesRows($from, $to))
            ->groupBy(fn ($row) => $row['supplier'] ?? '—')
            ->map(fn ($group, $supplier) => [
                'label' => $supplier,
                'value' => round((float) $group->sum('net_revenue'), 2),
            ])
            ->sortByDesc('value')
            ->take(8)
            ->values()->all();
    }

    /** Cached Product Sales rows for the period (shared by two widgets). */
    private array $productSalesCache = [];

    private function productSalesRows(Carbon $from, Carbon $to): array
    {
        $key = $from->toDateString().'|'.$to->toDateString();

        return $this->productSalesCache[$key] ??= $this->reports->build('product-sales', [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
        ])['rows'];
    }

    /** Top 5 customers by net revenue in the period. */
    private function topCustomers(Carbon $from, Carbon $to): array
    {
        return SalesInvoice::where('status', 'posted')
            ->whereDate('invoice_date', '>=', $from)->whereDate('invoice_date', '<=', $to)
            ->selectRaw('customer_id, SUM(total_amount) as total, SUM(total_profit) as profit')
            ->groupBy('customer_id')
            ->orderByDesc('total')
            ->limit(5)
            ->with('customer:id,name')
            ->get()
            ->map(fn ($row) => [
                'customer_id' => $row->customer_id,
                'customer' => $row->customer?->name,
                'total' => (float) $row->total,
                'profit' => (float) $row->profit,
            ])->all();
    }

    /** Outstanding loaned stock (both directions), from the Stock on Loan report. */
    private function stockOnLoan(): array
    {
        $data = $this->reports->build('stock-on-loan', []);

        return [
            'outstanding' => (float) $data['totals']['outstanding'],
            'rows' => collect($data['rows'])->take(6)->map(fn ($row) => [
                'direction' => $row['direction'],
                'product' => $row['product'],
                'supplier' => $row['supplier'],
                'outstanding' => (float) $row['outstanding'],
            ])->values()->all(),
        ];
    }

    /** Cheap "needs attention" counters. */
    private function attention(): array
    {
        return [
            'draft_sales' => SalesInvoice::where('status', 'draft')->count(),
            'draft_purchases' => PurchaseInvoice::where('status', 'draft')->count(),
            'pending_bookings' => Booking::where('status', 'pending')->count(),
            'expiring_90' => Batch::inStock()->normal()
                ->whereNotNull('expiry_date')
                ->whereDate('expiry_date', '<=', now()->addDays(90))
                ->count(),
        ];
    }

    private function recentSales()
    {
        return SalesInvoice::with('customer:id,name')
            ->latest('id')
            ->limit(8)
            ->get(['id', 'invoice_number', 'customer_id', 'invoice_date', 'status', 'total_amount']);
    }

    private function expiringSoon(): array
    {
        return Batch::with('product:id,name')
            ->inStock()->normal()
            ->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '<=', now()->addDays(90))
            ->orderBy('expiry_date')
            ->limit(8)
            ->get()
            ->map(fn ($batch) => [
                'id' => $batch->id,
                'product' => $batch->product?->name,
                'batch_number' => $batch->batch_number,
                'expiry_date' => $batch->expiry_date->toDateString(),
                'qty_available' => (float) $batch->qty_available,
            ])->all();
    }
}
