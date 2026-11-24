<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class BookingService
{
    /** Repeat quantities using today's catalogue; old prices and promotions are not promises. */
    public function repeatPrefill(Booking $booking, int $warehouseId, User $viewer): array
    {
        $showSupplier = $viewer->canViewSupplierDetails();
        $items = [];
        $skipped = [];
        $hiddenCount = 0;
        $linesByProduct = $booking->items()->with([
            'product' => fn ($products) => $products
                ->withTrashed()
                ->when($showSupplier, fn ($q) => $q->with('company:id,name'))
                ->withSum(['batches as stock' => fn ($q) => $q->where('warehouse_id', $warehouseId)], 'qty_available'),
        ])->get()->groupBy('product_id');

        foreach ($linesByProduct as $productId => $lines) {
            $product = $lines->first()->product;
            if ($product && ! $product->isVisibleTo($viewer)) {
                $hiddenCount++;
                continue;
            }
            if (! $product || $product->trashed() || $product->status !== 'active') {
                $skipped[] = $product && ! $product->trashed() ? $product->name : "Product #{$productId}";
                continue;
            }
            $items[] = ['product_id' => $product->id, 'product_name' => $product->name,
                'quantity' => (string) $lines->sum('quantity'), 'requested_bonus' => '0', 'incentives' => [],
                'trade_price' => (string) $product->trade_price, 'discount_percent' => (string) $product->default_discount_percent,
                'gst_percent' => (string) $product->tax_percent, 'remarks' => '',
                'retail_price' => (string) $product->retail_price,
                ...($showSupplier ? ['company' => $product->company?->name] : []),
                'stock' => (float) ($product->stock ?? 0)];
        }
        return ['customer_id' => $booking->customer_id, 'items' => $items, 'source' => $booking->booking_number,
            'skipped' => $skipped, 'hidden_count' => $hiddenCount];
    }

    public function __construct(
        private readonly NumberSeriesService $numbers,
    ) {}

    public function quantities(Booking $booking): array
    {
        $totals = DB::table('booking_invoice_lines as line')
            ->join('booking_items as item', 'item.id', '=', 'line.booking_item_id')
            ->join('sales_invoices as invoice', 'invoice.id', '=', 'line.sales_invoice_id')
            ->where('item.booking_id', $booking->id)->whereIn('invoice.status', ['draft', 'posted'])
            ->selectRaw('line.booking_item_id, invoice.status, SUM(line.quantity) AS quantity, SUM(line.bonus_quantity) AS bonus')
            ->groupBy('line.booking_item_id', 'invoice.status')->get()->groupBy('booking_item_id');

        return $booking->items->mapWithKeys(function ($item) use ($totals) {
            $line = ($totals[$item->id] ?? collect())->keyBy('status');
            $draft = (float) ($line['draft']->quantity ?? 0);
            $posted = (float) ($line['posted']->quantity ?? 0);
            $draftBonus = (float) ($line['draft']->bonus ?? 0);
            $postedBonus = (float) ($line['posted']->bonus ?? 0);

            return [$item->id => [
                'id' => $item->id, 'product' => $item->product?->name ?? "Product #{$item->product_id}",
                'approved' => (float) $item->quantity, 'approved_bonus' => (float) $item->requested_bonus,
                'draft' => $draft, 'posted' => $posted, 'draft_bonus' => $draftBonus, 'posted_bonus' => $postedBonus,
                'cancelled' => (float) $item->cancelled_quantity, 'cancelled_bonus' => (float) $item->cancelled_bonus,
                'remaining' => max(0, round((float) $item->quantity - $draft - $posted - (float) $item->cancelled_quantity, 2)),
                'remaining_bonus' => max(0, round((float) $item->requested_bonus - $draftBonus - $postedBonus - (float) $item->cancelled_bonus, 2)),
            ]];
        })->all();
    }

    public function hasTrackedConversion(SalesInvoice $invoice): bool
    {
        return $invoice->booking_id && DB::table('booking_invoice_lines')->where('sales_invoice_id', $invoice->id)->exists();
    }

    public function assertDraftComposition(SalesInvoice $invoice, array $items): void
    {
        $expected = DB::table('booking_invoice_lines as line')->join('booking_items as item', 'item.id', '=', 'line.booking_item_id')
            ->where('sales_invoice_id', $invoice->id)->get(['item.product_id', 'line.quantity', 'line.bonus_quantity'])->keyBy('product_id');
        if ($expected->isEmpty()) return;
        $actual = collect($items)->groupBy('product_id');
        if ($actual->count() !== $expected->count() || $expected->contains(fn ($row, $product) =>
            round($actual->get($product, collect())->sum('quantity') * 100) !== round((float) $row->quantity * 100)
            || round($actual->get($product, collect())->sum('bonus_quantity') * 100) !== round((float) $row->bonus_quantity * 100))) {
            throw new RuntimeException('Booking quantities are locked on the invoice. Cancel the draft and convert the correct quantities from the booking.');
        }
    }

    public function refreshConversionStatus(Booking $booking): void
    {
        $rows = collect($this->quantities($booking->load('items.product')));
        $remaining = $rows->sum('remaining') + $rows->sum('remaining_bonus');
        $invoices = $booking->salesInvoices()->whereIn('status', ['draft', 'posted'])->orderBy('id');
        $first = $invoices->value('id');
        $booking->update([
            'status' => $remaining > 0 ? ($first ? Booking::STATUS_PARTIALLY_INVOICED : Booking::STATUS_APPROVED) : Booking::STATUS_CONVERTED,
            'sales_invoice_id' => $first,
            'converted_at' => $first ? ($booking->converted_at ?? now()) : $booking->converted_at,
        ]);
    }

    public function closeRemainder(Booking $booking, string $reason): void
    {
        DB::transaction(function () use ($booking, $reason) {
            $booking = Booking::whereKey($booking->id)->with('items.product')->lockForUpdate()->firstOrFail();
            if (! in_array($booking->status, [Booking::STATUS_APPROVED, Booking::STATUS_PARTIALLY_INVOICED], true)) {
                throw new RuntimeException('This booking has no open remainder.');
            }
            $rows = $this->quantities($booking);
            foreach ($booking->items as $item) {
                $row = $rows[$item->id];
                $item->update(['cancelled_quantity' => $row['cancelled'] + $row['remaining'],
                    'cancelled_bonus' => $row['cancelled_bonus'] + $row['remaining_bonus']]);
            }
            $booking->update(['remainder_closed_at' => now()]);
            $this->refreshConversionStatus($booking);
            AuditLogger::action($booking, 'remainder_closed', ['reason' => $reason, 'quantities' => $rows]);
            $invoice = $booking->salesInvoices()->latest('id')->first();
            if ($invoice) app(CommissionService::class)->recalculate($invoice);
        }, 3);
    }

    /**
     * Convert an approved booking into a draft sales invoice. Stock is not
     * reserved — batches are chosen (FIFO) when the invoice is posted.
     */
    public function convertToSale(Booking $booking, ?array $selection = null): SalesInvoice
    {
        return DB::transaction(function () use ($booking, $selection) {
            $booking = Booking::whereKey($booking->id)->with(['items.product', 'items.incentives'])->lockForUpdate()->firstOrFail();

            if (! in_array($booking->status, [Booking::STATUS_APPROVED, Booking::STATUS_PARTIALLY_INVOICED], true)) {
                throw new RuntimeException("Only approved bookings can be converted (current: {$booking->status}).");
            }

            $remaining = $this->quantities($booking);
            $requested = $selection === null ? null : collect($selection)->keyBy('id');
            if ($requested && $requested->keys()->diff(array_keys($remaining))->isNotEmpty()) {
                throw new RuntimeException('A selected item does not belong to this booking.');
            }
            $breakdowns = [];
            $payload = [];
            $sourceItems = [];

            foreach ($booking->items as $item) {
                $available = $remaining[$item->id];
                $units = $requested === null ? $available['remaining'] : (float) ($requested[$item->id]['quantity'] ?? 0);
                $bonus = $requested === null ? $available['remaining_bonus'] : (float) ($requested[$item->id]['bonus_quantity'] ?? 0);
                if ($units < 0 || $bonus < 0 || $units > $available['remaining'] || $bonus > $available['remaining_bonus']) {
                    throw new RuntimeException('Selected units exceed the remaining approved quantity or bonus.');
                }
                if ($units == 0 && $bonus == 0) continue;
                // Scale the approved monetary incentives; do not independently reapply
                // fixed discounts or quantity slabs on each split invoice.
                $ratio = $units / (float) $item->quantity;
                $priorRatio = ($available['draft'] + $available['posted']) / (float) $item->quantity;
                $i = count($payload);
                $sourceItems[$i] = $item->id;
                $breakdowns[$i] = $item->incentives;

                $payload[] = [
                    'product_id' => $item->product_id,
                    'batch_id' => null,
                    'quantity' => $units,
                    'bonus_quantity' => $bonus,
                    'applied_rule_id' => $item->applied_rule_id,
                    'trade_price' => $item->trade_price,
                    'discount_percent' => (float) $item->discount_percent,
                    'incentive_discount' => round((float) $item->incentive_discount * ($priorRatio + $ratio), 2)
                        - round((float) $item->incentive_discount * $priorRatio, 2),
                    'gst_percent' => (float) $item->gst_percent,
                    'remarks' => $item->remarks,
                ];
            }
            if ($payload === []) throw new RuntimeException('Select at least one quantity to invoice.');

            $computed = MarginCalculator::computeSalesItems($payload, [
                'discount_percent' => 0,
                'gst_percent' => 0,
            ]);

            $invoice = SalesInvoice::create([
                'invoice_number' => $this->numbers->next('sales_invoice'),
                'customer_id' => $booking->customer_id,
                'booker_id' => $booking->booker_id,
                'warehouse_id' => $booking->warehouse_id,
                'booking_id' => $booking->id,
                'sale_type' => 'booking',
                'invoice_date' => now('Asia/Karachi')->toDateString(),
                'status' => SalesInvoice::STATUS_DRAFT,
                'created_by' => Auth::id(),
            ] + $computed['totals']);

            foreach ($computed['items'] as $i => $itemData) {
                $line = $invoice->items()->create($itemData);
                DB::table('booking_invoice_lines')->insert(['booking_item_id' => $sourceItems[$i], 'sales_invoice_id' => $invoice->id,
                    'quantity' => $line->quantity, 'bonus_quantity' => $line->bonus_quantity]);
                $item = $booking->items->firstWhere('id', $sourceItems[$i]);
                $ratio = (float) $line->quantity / (float) $item->quantity;
                foreach ($breakdowns[$i] as $b) {
                    $line->incentives()->create([
                        'sales_invoice_id' => $invoice->id,
                        'customer_id' => $invoice->customer_id,
                        'product_id' => $line->product_id,
                        'incentive_rule_id' => $b['incentive_rule_id'],
                        'rule_type' => $b['rule_type'],
                        'rule_name' => $b['rule_name'],
                        'bonus_qty' => (float) $b['bonus_qty'] > 0 ? $line->bonus_quantity : 0,
                        'discount_amount' => round((float) $b['discount_amount'] * $ratio, 2),
                        'trade_price' => $b['trade_price'],
                        'value_given' => round((float) $b['value_given'] * $ratio, 2),
                        'sort_order' => $b['sort_order'],
                    ]);
                }
            }

            $this->refreshConversionStatus($booking);
            AuditLogger::action($booking, 'converted', ['booking_number' => $booking->booking_number, 'invoice_number' => $invoice->invoice_number]);
            app(CommissionService::class)->snapshot($invoice);
            app(CommissionService::class)->recalculate($invoice);

            return $invoice;
        }, 3);
    }
}
