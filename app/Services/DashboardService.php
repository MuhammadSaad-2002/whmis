<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Booking;
use App\Models\LedgerEntry;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Assembles the Executive Dashboard payload for Admin / Super Admin.
 *
 * Figures use ReportService (canonical report math), ledger balances, and
 * persisted operational records. This service only reads; it does not post
 * transactions or mutate stock.
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
    public function __construct(private readonly ReportService $reports) {}

    public function executivePayload(Carbon $from, Carbon $to, string $period): array
    {
        return array_map(
            fn ($prop) => $prop instanceof Closure ? $prop() : $prop,
            $this->executiveProps($from, $to, $period),
        );
    }

    /** Inertia resolves only the closures requested on a partial visit. */
    public function executiveProps(Carbon $from, Carbon $to, string $period): array
    {
        $periodData = null;
        $snapshotData = null;
        $activity = function () use (&$periodData, $from, $to): array {
            return $periodData ??= $this->periodData($from, $to);
        };
        $snapshot = function () use (&$snapshotData): array {
            return $snapshotData ??= $this->snapshotData();
        };

        return [
            'scope' => 'executive',
            'filterValues' => [
                'period' => $period,
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'days' => (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1,
            ],
            'kpis' => fn () => $activity()['kpis'],
            'hr' => fn () => $activity()['hr'],
            'monthlyTrend' => fn () => $activity()['monthlyTrend'],
            'topProducts' => fn () => $activity()['topProducts'],
            'salesBySupplier' => fn () => $activity()['salesBySupplier'],
            'topCustomers' => fn () => $activity()['topCustomers'],
            'rankingTotals' => fn () => $activity()['rankingTotals'],
            'asOf' => fn () => $snapshot()['asOf'],
            'financials' => fn () => $snapshot()['financials'],
            'aging' => fn () => $snapshot()['aging'],
            'topDebtors' => fn () => $snapshot()['topDebtors'],
            'stockOnLoan' => fn () => $snapshot()['stockOnLoan'],
            'attention' => fn () => $snapshot()['attention'],
            'recentSales' => fn () => $snapshot()['recentSales'],
            'expiringSoon' => fn () => $snapshot()['expiringSoon'],
        ];
    }

    private function periodData(Carbon $from, Carbon $to): array
    {
        $periodFilters = ['from' => $from->toDateString(), 'to' => $to->toDateString()];
        $productRows = collect($this->reports->build('product-sales', $periodFilters)['rows']);
        $supplierRows = $this->salesBySupplier($productRows);
        $customerRows = $this->reports->customerSalesRows($from, $to);

        return [
            'kpis' => $this->periodKpis($from, $to),
            'hr' => app(HrReportService::class)->totals($from, $to),
            'monthlyTrend' => $this->reports->salesProfitTrend($from, $to),
            'topProducts' => $this->topProducts($productRows),
            'salesBySupplier' => $supplierRows->take(8)->values()->all(),
            'topCustomers' => $this->topCustomers($customerRows),
            'rankingTotals' => [
                'products' => (float) $productRows->where('net_revenue', '>', 0)->sum('net_revenue'),
                'suppliers' => (float) $supplierRows->where('value', '>', 0)->sum('value'),
                'customers' => (float) $customerRows->where('net_revenue', '>', 0)->sum('net_revenue'),
            ],
        ];
    }

    private function snapshotData(): array
    {
        $asOf = now();
        $outstanding = $this->reports->build('outstanding', []);

        return [
            'asOf' => $asOf->toIso8601String(),
            'financials' => $this->financials(),
            'aging' => $this->aging($outstanding['totals']),
            'topDebtors' => $this->topDebtors($outstanding['rows']),
            'stockOnLoan' => $this->stockOnLoan(),
            'attention' => $this->attention($outstanding['rows'], $asOf),
            'recentSales' => $this->recentSales(),
            'expiringSoon' => $this->expiringSoon($asOf),
        ];
    }

    /** Sales / profit / margin / purchases for the period, each with a % delta vs the prior period. */
    private function periodKpis(Carbon $from, Carbon $to): array
    {
        [$prevFrom, $prevTo] = $this->previousPeriod($from, $to);

        $now = $this->reports->salesPeriodTotals($from, $to);
        $prev = $this->reports->salesPeriodTotals($prevFrom, $prevTo);

        $purchases = $this->reports->purchasePeriodTotals($from, $to)['net_purchases'];
        $prevPurchases = $this->reports->purchasePeriodTotals($prevFrom, $prevTo)['net_purchases'];

        return [
            'sales' => $now['net_sales'],
            'sales_delta' => $this->delta($now['net_sales'], $prev['net_sales']),
            'profit' => $now['net_profit'],
            'profit_delta' => $this->delta($now['net_profit'], $prev['net_profit']),
            'margin_pct' => $now['net_sales'] > 0 ? round($now['net_profit'] / $now['net_sales'] * 100, 1) : 0.0,
            'prev_margin_pct' => $prev['net_sales'] > 0 ? round($prev['net_profit'] / $prev['net_sales'] * 100, 1) : null,
            'purchases' => $purchases,
            'purchases_delta' => $this->delta($purchases, $prevPurchases),
            'cogs' => $now['net_cost'],
            'invoice_count' => $now['invoice_count'],
            'average_invoice' => $now['invoice_count'] > 0 ? round($now['gross_sales'] / $now['invoice_count'], 2) : null,
        ];
    }

    /** The equal-length window immediately before [from, to]. */
    private function previousPeriod(Carbon $from, Carbon $to): array
    {
        $days = (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay());
        $prevTo = $from->copy()->startOfDay()->subDay();
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
        $hr = app(HrReportService::class)->totals();

        return [
            'receivable' => $receivable,
            'payable' => $payable,
            'net_position' => round($receivable + $hr['advance'] - $payable - $hr['payable'], 2),
            'employee_payable' => $hr['payable'],
            'employee_advances' => $hr['advance'],
            'inventory_value' => $inventory,
        ];
    }

    /** Receivables aging buckets for the donut — straight from the Outstanding report totals. */
    private function aging(array $totals): array
    {
        return [
            ['label' => '0–30', 'value' => (float) $totals['current']],
            ['label' => '31–60', 'value' => (float) $totals['d31_60']],
            ['label' => '61–90', 'value' => (float) $totals['d61_90']],
            ['label' => '90+', 'value' => (float) $totals['over_90']],
        ];
    }

    /** Top 5 customers by outstanding balance, from the Outstanding report rows. */
    private function topDebtors(array $rows): array
    {
        return collect($rows)
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
    private function topProducts(Collection $rows): array
    {
        return $rows
            ->take(8)
            ->map(fn ($row) => ['label' => $row['product'] ?? '—', 'value' => (float) $row['net_revenue']])
            ->values()->all();
    }

    /** Net revenue grouped by supplier in the period, top 8 (same Product Sales rows). */
    private function salesBySupplier(Collection $rows): Collection
    {
        return $rows
            ->groupBy(fn ($row) => $row['supplier'] ?? '—')
            ->map(fn ($group, $supplier) => [
                'label' => $supplier,
                'value' => round((float) $group->sum('net_revenue'), 2),
            ])
            ->sortByDesc('value');
    }

    /** Top 5 customers by net revenue in the period. */
    private function topCustomers(Collection $rows): array
    {
        return $rows
            ->take(5)
            ->map(fn ($row) => [
                'customer_id' => $row['customer_id'],
                'customer' => $row['customer'],
                'total' => (float) $row['net_revenue'],
                'profit' => (float) $row['net_profit'],
            ])->values()->all();
    }

    /** Outstanding loaned stock (both directions), from the Stock on Loan report. */
    private function stockOnLoan(): array
    {
        $data = $this->reports->build('stock-on-loan', []);

        return [
            'outstanding_out' => (float) $data['totals']['outstanding_out'],
            'outstanding_in' => (float) $data['totals']['outstanding_in'],
            'net_out' => (float) $data['totals']['net_out'],
            'rows' => collect($data['rows'])->take(6)->map(fn ($row) => [
                'direction' => $row['direction'],
                'product' => $row['product'],
                'supplier' => $row['supplier'],
                'outstanding' => (float) $row['outstanding'],
            ])->values()->all(),
        ];
    }

    /** Cheap "needs attention" counters. */
    private function attention(array $outstanding, Carbon $asOf): array
    {
        $drafts = SalesInvoice::where('status', 'draft')
            ->selectRaw('COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total')->first();
        $overdue = collect($outstanding)->where('over_90', '>', 0);

        return [
            'draft_sales' => (int) $drafts->count,
            'draft_sales_total' => (float) $drafts->total,
            'draft_purchases' => PurchaseInvoice::where('status', 'draft')->count(),
            'pending_bookings' => Booking::where('status', 'pending')->count(),
            'expiring_90' => $this->expiringBatches($asOf)->count(),
            'overdue_accounts' => $overdue->count(),
            'overdue_amount' => round((float) $overdue->sum('over_90'), 2),
        ];
    }

    private function recentSales()
    {
        return SalesInvoice::with('customer:id,name')
            ->latest('id')
            ->limit(8)
            ->get(['id', 'invoice_number', 'customer_id', 'invoice_date', 'status', 'total_amount']);
    }

    private function expiringBatches(Carbon $asOf): Builder
    {
        return Batch::inStock()->normal()
            ->whereDate('expiry_date', '>=', $asOf)
            ->whereDate('expiry_date', '<=', $asOf->copy()->addDays(90));
    }

    private function expiringSoon(Carbon $asOf): array
    {
        return $this->expiringBatches($asOf)->with('product:id,name')
            ->orderBy('expiry_date')
            ->orderBy('id')
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
