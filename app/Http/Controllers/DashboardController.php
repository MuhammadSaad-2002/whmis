<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Services\DashboardService;
use App\Services\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Support\Header;

class DashboardController extends Controller
{
    public function __invoke(Request $request, ReportService $reports, DashboardService $dashboard)
    {
        $user = $request->user();
        $canViewSupplierDetails = $user->canViewSupplierDetails();

        // Admin / Super Admin get the richer Executive Dashboard.
        if ($canViewSupplierDetails && $user->can('dashboard.executive')) {
            [$from, $to, $period] = $this->resolvePeriod($request);

            return Inertia::render('dashboard', $dashboard->executiveProps($from, $to, $period));
        }

        // If access changed since the executive view opened, discard its old
        // client props instead of merging a different role's dashboard into them.
        if ($request->header(Header::PARTIAL_COMPONENT) === 'dashboard'
            && in_array('filterValues', explode(',', (string) $request->header(Header::PARTIAL_ONLY)), true)) {
            return Inertia::location(route('dashboard', absolute: false));
        }

        // Bookers get a stripped, own-data-only dashboard — no company-wide
        // financials. Everyone else (dashboard.view_all) gets the full view.
        if (! $canViewSupplierDetails || ! $user->can('dashboard.view_all')) {
            return $this->bookerDashboard($request);
        }

        $today = now()->toDateString();

        $todaySales = $reports->salesPeriodTotals(now()->startOfDay(), now());
        $todayPurchases = $reports->purchasePeriodTotals(now()->startOfDay(), now());
        $monthSales = $reports->salesPeriodTotals(now()->startOfMonth(), now());

        $receivable = (float) LedgerEntry::where('party_type', 'customer')
            ->selectRaw('COALESCE(SUM(debit - credit), 0) as v')->value('v');
        $payable = (float) LedgerEntry::where('party_type', 'company')
            ->selectRaw('COALESCE(SUM(credit - debit), 0) as v')->value('v');

        return Inertia::render('dashboard', [
            'kpis' => [
                'today_sales' => $todaySales['net_sales'],
                'today_sales_count' => SalesInvoice::where('status', 'posted')->whereDate('invoice_date', $today)->count(),
                'today_purchases' => $todayPurchases['net_purchases'],
                'month_sales' => $monthSales['net_sales'],
                'month_profit' => $monthSales['net_profit'],
                'month_payroll_expense' => app(\App\Services\HrReportService::class)->totals(now()->startOfMonth(), now())['expense'],
                'receivable' => $receivable,
                'payable' => $payable,
                'inventory_value' => (float) Batch::selectRaw('COALESCE(SUM(qty_available * effective_cost), 0) as v')->value('v'),
                'draft_sales' => SalesInvoice::where('status', 'draft')->count(),
                'draft_purchases' => PurchaseInvoice::where('status', 'draft')->count(),
                'pending_bookings' => Booking::where('status', 'pending')->count(),
            ],
            'monthlyTrend' => $reports->profitByMonth()['chart'],
            'expiringSoon' => Batch::with('product:id,name')
                ->inStock()
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
                ]),
            'recentSales' => SalesInvoice::with('customer:id,name')
                ->latest('id')
                ->limit(8)
                ->get(['id', 'invoice_number', 'customer_id', 'invoice_date', 'status', 'total_amount']),
            'topCustomers' => collect($reports->build('customer-sales', [
                'from' => now()->subDays(30)->toDateString(),
                'to' => $today,
            ])['rows'])->take(5)->map(fn ($row) => [
                'customer_id' => $row['customer_id'],
                'customer' => ['id' => $row['customer_id'], 'name' => $row['customer']],
                'total' => $row['net_revenue'],
                'profit' => $row['net_profit'],
            ])->values(),
        ]);
    }

    /** One-page executive summary PDF (Admin / Super Admin only — gated on the route). */
    public function exportPdf(Request $request, DashboardService $dashboard)
    {
        [$from, $to, $period] = $this->resolvePeriod($request);
        $payload = $dashboard->executivePayload($from, $to, $period);

        return Pdf::loadView('pdf.executive', $payload)
            ->setPaper('a4', 'portrait')
            ->stream('executive-summary.pdf');
    }

    /**
     * Resolve the period selector into inclusive Pakistan business dates.
     *
     * @return array{0: Carbon, 1: Carbon, 2: string}
     */
    private function resolvePeriod(Request $request): array
    {
        $period = $request->string('period')->toString() ?: 'last_12';
        $today = now('Asia/Karachi')->startOfDay();
        $monthStart = $today->copy()->startOfMonth();
        $yesterday = $today->copy()->subDay();
        $rollingMonths = ['last_3' => 3, 'last_6' => 6, 'last_9' => 9, 'last_12' => 12];

        if (isset($rollingMonths[$period])) {
            return [$today->copy()->subMonthsNoOverflow($rollingMonths[$period])->addDay(), $today, $period];
        }

        if ($period === 'custom') {
            $range = validator([
                'from' => $request->input('from'),
                'to' => $request->input('to', $today->toDateString()),
            ], [
                'from' => ['required', 'date_format:Y-m-d'],
                'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            ], [
                'to.after_or_equal' => 'The end date must be on or after the start date.',
            ])->validate();

            return [Carbon::parse($range['from'], $today->timezone), Carbon::parse($range['to'], $today->timezone), $period];
        }

        return match ($period) {
            'today' => [$today->copy(), $today, $period],
            'yesterday' => [$yesterday->copy(), $yesterday, $period],
            'last_month' => [$monthStart->copy()->subMonth(), $monthStart->copy()->subDay(), $period],
            'ytd' => [$today->copy()->startOfYear(), $today, $period],
            default => [$monthStart, $today, 'this_month'],
        };
    }

    /** Own-data-only dashboard for bookers: assigned pharmacies + their orders. */
    private function bookerDashboard(Request $request)
    {
        $uid = $request->user()->id;
        $today = now()->toDateString();

        $ownBookings = Booking::where('booker_id', $uid);

        $byStatus = (clone $ownBookings)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return Inertia::render('dashboard', [
            'scope' => 'booker',
            'kpis' => [
                'assigned_pharmacies' => Customer::forBooker($uid)->count(),
                'orders_total' => (clone $ownBookings)->count(),
                'orders_this_month' => (clone $ownBookings)
                    ->whereBetween('booking_date', [now()->startOfMonth()->toDateString(), $today])
                    ->count(),
                'orders_pending' => (int) ($byStatus[Booking::STATUS_PENDING] ?? 0),
                'orders_approved' => (int) ($byStatus[Booking::STATUS_APPROVED] ?? 0),
                'orders_draft' => (int) ($byStatus[Booking::STATUS_DRAFT] ?? 0),
                'orders_converted' => (int) ($byStatus[Booking::STATUS_CONVERTED] ?? 0),
            ],
            'recentBookings' => (clone $ownBookings)
                ->with('customer:id,name')
                ->latest('booking_date')->latest('id')
                ->limit(8)
                ->get(['id', 'booking_number', 'customer_id', 'booking_date', 'status']),
        ]);
    }
}
