<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Booking;
use App\Models\LedgerEntry;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Services\ReportService;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __invoke(ReportService $reports)
    {
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
}
