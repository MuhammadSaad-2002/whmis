<?php

namespace App\Services;

use App\Models\{Dispatch, DispatchEvent, DispatchEventItem, SalesInvoice, SalesReturnItem, User};
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Fulfilment tracking only. Invoice posting owns stock and accounting effects. */
class DispatchService
{
    public function progress(SalesInvoice $invoice): array
    {
        $returned = SalesReturnItem::whereHas('salesReturn', fn ($q) => $q->where('sales_invoice_id', $invoice->id)->where('status', 'posted'))
            ->selectRaw('sales_invoice_item_id, SUM(quantity) as total')->groupBy('sales_invoice_item_id')->pluck('total', 'sales_invoice_item_id');
        $delivered = DispatchEventItem::join('dispatch_events', 'dispatch_events.id', '=', 'dispatch_event_items.dispatch_event_id')
            ->join('dispatches', 'dispatches.id', '=', 'dispatch_events.dispatch_id')->where('dispatches.sales_invoice_id', $invoice->id)
            ->selectRaw('sales_invoice_item_id, SUM(quantity) as total')->groupBy('sales_invoice_item_id')->pluck('total', 'sales_invoice_item_id');

        return $invoice->items()->with(['product' => fn ($q) => $q->withTrashed()->select('id', 'name'), 'batch:id,batch_number,expiry_date'])
            ->get()->map(function ($item) use ($returned, $delivered) {
                $units = round((float) $item->quantity + (float) $item->bonus_quantity, 2);
                $returns = (float) ($returned[$item->id] ?? 0);
                $received = (float) ($delivered[$item->id] ?? 0);
                return ['id' => $item->id, 'product' => $item->product?->name ?? 'Unavailable product',
                    'batch' => $item->batch?->batch_number, 'expiry' => $item->batch?->expiry_date?->toDateString(),
                    'units' => $units, 'returned' => $returns, 'delivered' => $received,
                    'remaining' => max(0, round($units - $returns - $received, 2))];
            })->all();
    }

    public function record(SalesInvoice $invoice, array $data, User $actor): void
    {
        DB::transaction(function () use ($invoice, $data, $actor) {
            $invoice = SalesInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            if ($invoice->status !== 'posted') $this->fail('Only posted invoices can be dispatched.');
            $existing = DispatchEvent::where('request_key', $data['request_key'])->first();
            if ($existing) {
                if (! Dispatch::whereKey($existing->dispatch_id)->where('sales_invoice_id', $invoice->id)->exists()) $this->fail('This action reference belongs to another invoice.');
                return;
            }
            $dispatch = Dispatch::firstOrCreate(['sales_invoice_id' => $invoice->id]);
            $assignedTo = array_key_exists('assigned_to', $data) ? $data['assigned_to'] : $dispatch->assigned_to;
            app(OperationsAccess::class)->validateAssignee($assignedTo, 'dispatch.view', $actor);
            $state = $dispatch->status ?? 'pending';
            $action = $data['action'];
            $transitions = [
                'picking' => ['pending'], 'packed' => ['picking'],
                'dispatched' => ['packed', 'failed', 'partial'],
                'failed' => ['dispatched', 'partial'],
                'delivered' => ['dispatched', 'partial'],
                'correct_delivery' => ['delivered', 'partial', 'dispatched', 'failed', 'closed'],
                'close_returned' => ['pending', 'picking', 'packed', 'dispatched', 'partial', 'failed'],
                'assign' => ['pending', 'picking', 'packed', 'dispatched', 'partial', 'failed'],
            ];
            if (! in_array($state, $transitions[$action] ?? [], true)) $this->fail('This action is unavailable in the current delivery status. Refresh the invoice.');
            if (in_array($action, ['failed', 'correct_delivery', 'close_returned']) && empty(trim($data['notes'] ?? ''))) $this->fail('Enter a reason for this action.');
            $lines = collect($this->progress($invoice))->keyBy('id');
            if ($action === 'close_returned' && ($lines->sum('remaining') > 0 || $lines->sum('returned') <= 0)) {
                $this->fail('Close as returned only after all remaining quantities are covered by posted returns.');
            }
            $quantities = [];
            if (in_array($action, ['delivered', 'correct_delivery'])) {
                foreach ($data['items'] ?? [] as $item) {
                    $id = (int) $item['sales_invoice_item_id'];
                    $value = round((float) $item['quantity'], 2);
                    if (isset($quantities[$id])) $this->fail('Each item may appear only once.');
                    if (! $lines->has($id)) $this->fail('A selected item does not belong to this invoice.');
                    $limit = $action === 'delivered' ? $lines[$id]['remaining'] : $lines[$id]['delivered'];
                    if ($value < 0 || $value > $limit + 0.00001) $this->fail('Quantity exceeds the available delivery or correction balance.');
                    $quantities[$id] = $action === 'correct_delivery' ? -$value : $value;
                }
                if (abs(array_sum($quantities)) <= 0) $this->fail('Enter at least one positive quantity.');
                if ($action === 'delivered' && empty(trim($data['receiver_name'] ?? ''))) $this->fail('Enter the name of the person who received the goods.');
            }
            $event = $dispatch->events()->create([
                'action' => $action, 'request_key' => $data['request_key'], 'created_by' => $actor->id,
                'assigned_to' => $assignedTo,
                'receiver_name' => $action === 'delivered' ? ($data['receiver_name'] ?? null) : null, 'notes' => $data['notes'] ?? null,
            ]);
            foreach ($quantities as $id => $value) {
                if ($value != 0) $event->items()->create(['sales_invoice_item_id' => $id, 'quantity' => $value]);
            }
            $status = $action === 'assign' ? $state : $action;
            if ($action === 'close_returned') $status = 'closed';
            if (in_array($action, ['delivered', 'correct_delivery'])) {
                $progress = $this->progress($invoice);
                $status = array_sum(array_column($progress, 'remaining')) <= 0 ? 'delivered'
                    : (array_sum(array_column($progress, 'delivered')) > 0 ? 'partial' : 'dispatched');
            }
            $dispatch->update(['status' => $status, 'assigned_to' => $assignedTo]);
            AuditLogger::action($invoice, 'dispatch_'.$action, ['dispatch_event_id' => $event->id, 'status' => $status, 'assigned_to' => $assignedTo]);
        });
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['action' => $message]);
    }
}
