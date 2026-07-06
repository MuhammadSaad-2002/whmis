<?php

namespace App\Console\Commands;

use App\Models\Batch;
use App\Models\PaymentAllocation;
use App\Models\Product;
use App\Models\SalesInvoice;
use App\Notifications\SystemAlert;
use App\Services\AlertService;
use Illuminate\Console\Command;

class CheckAlerts extends Command
{
    protected $signature = 'whmis:check-alerts';

    protected $description = 'Generate low-stock, expiry, and overdue-invoice notifications';

    public function handle(AlertService $alerts): int
    {
        $sent = 0;

        // Low stock: available <= reorder level (> 0)
        $lowStock = Product::query()
            ->active()
            ->where('reorder_level', '>', 0)
            ->withSum('batches as stock', 'qty_available')
            ->get()
            ->filter(fn (Product $product) => (float) ($product->stock ?? 0) <= (float) $product->reorder_level);

        foreach ($lowStock as $product) {
            $sent += $alerts->send('inventory.view', new SystemAlert(
                'low_stock',
                'Low stock',
                sprintf('%s is at %s (reorder level %s).',
                    $product->name,
                    rtrim(rtrim(number_format((float) ($product->stock ?? 0), 2), '0'), '.'),
                    rtrim(rtrim(number_format((float) $product->reorder_level, 2), '0'), '.')),
                '/inventory?low_stock=1',
                "product:{$product->id}",
            ));
        }

        // Expiring batches (within 90 days, still in stock)
        $expiring = Batch::with('product:id,name')
            ->inStock()
            ->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '<=', now()->addDays(90))
            ->get();

        foreach ($expiring as $batch) {
            $days = (int) floor(now()->diffInDays($batch->expiry_date, false));
            $sent += $alerts->send('inventory.view', new SystemAlert(
                'expiry',
                $days < 0 ? 'Batch expired' : 'Batch expiring soon',
                sprintf('%s batch %s %s (%s in stock).',
                    $batch->product?->name,
                    $batch->batch_number,
                    $days < 0 ? 'has expired' : "expires in {$days} days",
                    rtrim(rtrim(number_format((float) $batch->qty_available, 2), '0'), '.')),
                '/inventory/batches?expiry=90',
                "batch:{$batch->id}",
            ));
        }

        // Overdue posted invoices with unallocated balance
        $overdue = SalesInvoice::with('customer:id,name')
            ->where('status', 'posted')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', now())
            ->get();

        $allocated = PaymentAllocation::where('invoice_type', 'sales_invoice')
            ->whereIn('invoice_id', $overdue->pluck('id'))
            ->whereHas('payment', fn ($q) => $q->where('status', 'completed'))
            ->selectRaw('invoice_id, SUM(amount) as total')
            ->groupBy('invoice_id')
            ->pluck('total', 'invoice_id');

        foreach ($overdue as $invoice) {
            $outstanding = round((float) $invoice->total_amount - (float) ($allocated[$invoice->id] ?? 0), 2);
            if ($outstanding <= 0) {
                continue;
            }

            $sent += $alerts->send('payments.view', new SystemAlert(
                'overdue_invoice',
                'Invoice overdue',
                sprintf('%s (%s) was due %s — Rs %s outstanding.',
                    $invoice->invoice_number,
                    $invoice->customer?->name,
                    $invoice->due_date->format('d M Y'),
                    number_format($outstanding, 2)),
                "/sales/{$invoice->id}",
                "sales_invoice:{$invoice->id}",
            ));
        }

        $this->info("Alerts sent: {$sent}");

        return self::SUCCESS;
    }
}
