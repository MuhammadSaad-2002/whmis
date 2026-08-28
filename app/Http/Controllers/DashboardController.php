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

class DashboardController extends Controller
{
    public function __invoke(Request $request, ReportService $reports, DashboardService $dashboard)
    {
        // Admin / Super Admin get the richer Executive Dashboard.
        if ($request->user()->can('dashboard.executive')) {
            [$from, $to, $period] = $this->resolvePeriod($request);

            return Inertia::render('dashboard', $dashboard->executivePayload($from, $to, $period));
        }

        // Bookers get a stripped, own-data-only dashboard — no company-wide
        // financials. Everyone else (dashboard.view_all) gets the full view.
        if (! $request->user()->can('dashboard.view_all')) {
            return $this->bookerDashboard($request);
        }

        $today = now()->toDateString();

        $todaySales = SalesInvoice::where('status', 'posted')->whereDate('invoice_date', $today);
        $todayPurchases = PurchaseInvoice::where('status', 'posted')->whereDate('invoice_date', $today);

        $monthSales = SalesInvoice::where('status', 'posted')
            ->whereBetween('invoice_date', [now()->startOfMonth()->toDateString(), $today]);

        $receivable = (float) LedgerEntry::where('party_type', 'customer')
            ->selectRaw('COALESCE(SUM(debit - credit), 0) as v')->value('v');
        $payable = (float) LedgerEntry::where('party_type', 'company')
            ->selectRaw('COALESCE(SUM(credit - debit), 0) as v')->value('v');

        return Inertia::render('dashboard', [
            'kpis' => [
                'today_sales' => (float) (clone $todaySales)->sum('total_amount'),
                'today_sales_count' => (clone $todaySales)->count(),
                'today_purchases' => (float) (clone $todayPurchases)->sum('total_amount'),
                'month_sales' => (float) (clone $monthSales)->sum('total_amount'),
                'month_profit' => (float) (clone $monthSales)->sum('total_profit'),
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
            'topCustomers' => SalesInvoice::where('status', 'posted')
                ->whereBetween('invoice_date', [now()->subDays(30)->toDateString(), $today])
                ->selectRaw('customer_id, SUM(total_amount) as total, SUM(total_profit) as profit')
                ->groupBy('customer_id')
                ->orderByDesc('total')
                ->limit(5)
                ->with('customer:id,name')
                ->get(),
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
     * Resolve the period selector into a [from, to] window.
     * Presets: this_month, last_3, last_6, last_12; custom reads from/to.
     *
     * @return array{0: Carbon, 1: Carbon, 2: string}
     */
    private function resolvePeriod(Request $request): array
    {
        $period = $request->string('period')->toString() ?: 'this_month';
        $to = now();

        $from = match ($period) {
            'last_3' => now()->subMonthsNoOverflow(3)->addDay()->startOfDay(),
            'last_6' => now()->subMonthsNoOverflow(6)->addDay()->startOfDay(),
            'last_12' => now()->subMonthsNoOverflow(12)->addDay()->startOfDay(),
            'custom' => $request->filled('from') ? Carbon::parse($request->string('from')->toString())->startOfDay() : now()->startOfMonth(),
            default => now()->startOfMonth(),
        };

        if ($period === 'custom' && $request->filled('to')) {
            $to = Carbon::parse($request->string('to')->toString());
        }

        // 'custom' without a valid start falls back to a coherent this-month window.
        if ($period === 'custom' && ! $request->filled('from')) {
            $period = 'this_month';
        }

        return [$from, $to, $period];
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
