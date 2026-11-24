<?php

namespace App\Services;

use App\Models\{Dispatch, DispatchEvent, DispatchEventItem, SalesInvoice, SalesReturnItem, User};
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Fulfilment tracking only. Invoice posting owns stock and accounting effects. */
class DispatchService
{
    public const FIELD_ACTIONS = ['picking', 'packed', 'dispatched', 'delivered', 'failed'];
    public const TRANSITIONS = [
        'picking' => ['pending'], 'packed' => ['picking'],
        'dispatched' => ['packed', 'failed', 'partial'], 'failed' => ['dispatched', 'partial'],
        'delivered' => ['dispatched', 'partial'],
        'correct_delivery' => ['delivered', 'partial', 'dispatched', 'failed', 'closed'],
        'close_returned' => ['pending', 'picking', 'packed', 'dispatched', 'partial', 'failed'],
        'assign' => ['pending', 'picking', 'packed', 'dispatched', 'partial', 'failed'],
    ];

    public function mayVerifyBoardActivity(User $actor): bool
    {
        return $actor->is_active && $actor->hasAnyRole(['Admin', 'Super Admin']) && $actor->can('dispatch.manage');
    }

    public function pickupProgress(SalesInvoice $invoice): array
    {
        $sums = DB::table('dispatch_pickup_lines')->join('dispatch_events', 'dispatch_events.id', '=', 'dispatch_pickup_lines.dispatch_event_id')
            ->whereIn('dispatch_events.action', ['pickup', 'put_back'])
            ->selectRaw('sale_batch_allocation_id, SUM(dispatch_pickup_lines.quantity) AS total')
            ->whereIn('sale_batch_allocation_id', DB::table('sale_batch_allocations as a')
                ->join('sales_invoice_items as i', 'i.id', '=', 'a.sales_invoice_item_id')
                ->where('i.sales_invoice_id', $invoice->id)->select('a.id'))
            ->groupBy('sale_batch_allocation_id');
        $returned = SalesReturnItem::whereHas('salesReturn', fn ($q) => $q->where('sales_invoice_id', $invoice->id)->where('status', 'posted'))
            ->selectRaw('sales_invoice_item_id, batch_id, SUM(quantity) AS units')->groupBy('sales_invoice_item_id', 'batch_id')->get()
            ->keyBy(fn ($line) => $line->sales_invoice_item_id.':'.$line->batch_id);
        return DB::table('sale_batch_allocations as a')->join('sales_invoice_items as i', 'i.id', '=', 'a.sales_invoice_item_id')
            ->join('products as p', 'p.id', '=', 'i.product_id')->join('batches as b', 'b.id', '=', 'a.batch_id')
            ->leftJoinSub($sums, 'picked', 'picked.sale_batch_allocation_id', '=', 'a.id')
            ->where('i.sales_invoice_id', $invoice->id)->orderBy('i.sort_order')->orderBy('a.id')
            ->get(['a.id', 'a.sales_invoice_item_id', 'a.batch_id', 'a.quantity', 'p.name as product', 'b.batch_number as batch', 'b.expiry_date as expiry', 'picked.total'])
            ->map(function ($row) use ($returned) {
                $row->expiry = $row->expiry ? substr($row->expiry, 0, 10) : null;
                $row->picked = (float) $row->total;
                $restored = (float) ($returned[$row->sales_invoice_item_id.':'.$row->batch_id]->units ?? 0);
                $row->remaining = max(0, round((float) $row->quantity - $restored - $row->picked, 2));
                unset($row->total);
                return $row;
            })->all();
    }

    public function assertCanCancel(SalesInvoice $invoice): void
    {
        $dispatch = Dispatch::where('sales_invoice_id', $invoice->id)->first();
        if (! $dispatch?->custody_required) return;
        if (collect($this->pickupProgress($invoice))->sum('picked') > 0) {
            throw new \RuntimeException('Resolve picked stock custody before cancelling. For delivered items, use a sales return instead.');
        }
    }

    public function assertCanReturnLine(SalesInvoice $invoice, int $itemId, float $units, float $alreadyReturned): void
    {
        $dispatch = Dispatch::where('sales_invoice_id', $invoice->id)->first();
        if (! $dispatch?->custody_required || ! $dispatch->custodian_id) return;
        $batches = collect($this->pickupProgress($invoice))->where('sales_invoice_item_id', $itemId);
        $line = collect($this->progress($invoice))->firstWhere('id', $itemId);
        $notWithSalesman = $batches->sum('quantity') - $batches->sum('picked') + ($line['delivered'] ?? 0);
        if (round($units + $alreadyReturned - $notWithSalesman, 2) > 0) {
            throw new \RuntimeException('Resolve the picked stock custody before returning quantities that are still with the Salesman.');
        }
    }

    public function syncReturns(SalesInvoice $invoice): void
    {
        $dispatch = Dispatch::where('sales_invoice_id', $invoice->id)->first();
        if (! $dispatch?->custody_required || $dispatch->isHistoricalDelivery()) return;
        $progress = collect($this->progress($invoice));
        $before = $dispatch->status;
        if ($progress->sum('remaining') == 0 && $progress->sum('returned') > 0) {
            $dispatch->status = $progress->sum('delivered') > 0 ? 'delivered' : 'closed';
        } elseif (in_array($before, ['delivered','closed'], true) && $progress->sum('remaining') > 0) {
            $dispatch->status = $progress->sum('delivered') > 0 ? 'partial' : 'pending';
        }
        if (collect($this->pickupProgress($invoice))->sum('remaining') > 0 && $dispatch->pickup_confirmed_at
            && ! in_array($dispatch->status, ['delivered','closed'], true)) {
            $dispatch->pickup_confirmed_at = null;
            $dispatch->status = 'picking';
        }
        if ($dispatch->isDirty()) {
            $dispatch->save();
            AuditLogger::action($invoice, 'dispatch_return_sync', ['from' => $before, 'to' => $dispatch->status]);
        }
    }

    public function availableActions(?Dispatch $dispatch, bool $manager): array
    {
        if ($dispatch?->isHistoricalDelivery()) return [];

        if (! $dispatch?->custody_required) return $manager
            ? [...self::FIELD_ACTIONS, 'assign', 'correct_delivery', 'close_returned'] : self::FIELD_ACTIONS;

        $actions = match (true) {
            (bool) $dispatch->handover_to_id => $manager ? ['cancel_handover'] : [],
            $dispatch->status === 'closed' => [],
            $dispatch->status === 'delivered' => $manager ? ['correct_delivery'] : [],
            ! $dispatch->pickup_confirmed_at => ['pickup', 'confirm_pickup'],
            in_array($dispatch->status, ['packed', 'failed'], true) => ['dispatched'],
            in_array($dispatch->status, ['dispatched', 'partial'], true) => ['delivered', 'failed'],
            default => [],
        };
        if ($manager && ! $dispatch->handover_to_id && ! in_array($dispatch->status, ['delivered', 'closed'], true)) {
            $actions = [...$actions, ...($dispatch->custodian_id ? ['request_handover', 'put_back'] : ['assign']), 'close_returned'];
        }
        return $actions;
    }

    private function recordCustody(SalesInvoice $invoice, Dispatch $dispatch, array $data, User $actor, bool $manager, ?int $verifiedFor): void
    {
        $action = $data['action'];
        $progress = collect($this->pickupProgress($invoice))->keyBy('id');
        $quantityTotal = $progress->sum('picked');
        $custodian = (int) $dispatch->custodian_id;
        $member = (int) $dispatch->assigned_to;
        $notes = trim($data['notes'] ?? '');
        $eventAssignee = $dispatch->assigned_to;
        $lines = [];
        $changes = [];
        if (in_array($action, ['pickup', 'confirm_pickup'], true)) {
            abort_unless($verifiedFor === $member || ($member > 0 && $member === $actor->id && $actor->can('dispatch.assigned') && $actor->is_active), 403);
            if ($verifiedFor && $custodian && $custodian !== $member) $this->fail('Resolve custody with a handover before recording this pickup.');
            if ($dispatch->pickup_confirmed_at || $dispatch->handover_to_id || ! in_array($dispatch->status, ['pending', 'picking'], true)) {
                $this->fail('Pickup is locked or the delivery is not available.');
            }
            if ($action === 'confirm_pickup') {
                if ($progress->isEmpty() || $progress->sum('remaining') > 0 || $quantityTotal <= 0) $this->fail('Pick every required batch before confirming.');
                $changes = ['pickup_confirmed_at' => now(), 'status' => 'packed'];
            } else {
                $changes = ['custodian_id' => $verifiedFor ?? $actor->id, 'status' => 'picking'];
            }
        } elseif ($action === 'accept_handover') {
            abort_unless($actor->is_active && $actor->can('dispatch.assigned') && (int) $dispatch->handover_to_id === $actor->id, 404);
            $changes = ['handover_to_id' => null, 'custodian_id' => $actor->id, 'assigned_to' => $actor->id];
            $eventAssignee = $actor->id;
        } else {
            abort_unless($manager, 403);
            if ($notes === '') $this->fail('Enter a reason for this custody action.');
            if ($action === 'request_handover') {
                if (! $custodian || $dispatch->handover_to_id || in_array($dispatch->status, ['delivered', 'closed'], true)) $this->fail('No available custody handover.');
                $target = (int) ($data['assigned_to'] ?? 0);
                if ($target === $custodian || ! app(DeliveryPlanningService::class)->activeSalesmen()->whereKey($target)->exists()) $this->fail('Choose a different active Salesman.');
                $changes = ['handover_to_id' => $target];
                $eventAssignee = $target;
            } elseif ($action === 'cancel_handover') {
                if (! $dispatch->handover_to_id) $this->fail('No handover is awaiting confirmation.');
                $changes = ['handover_to_id' => null];
            } elseif ($action === 'put_back') {
                if (! $custodian || $dispatch->handover_to_id || collect($this->progress($invoice))->sum('delivered') > 0) {
                    $this->fail('Only undelivered stock outside a pending handover can be put back.');
                }
                $changes = ['pickup_confirmed_at' => null, 'status' => 'picking'];
            }
        }

        if (in_array($action, ['pickup', 'put_back'], true)) {
            foreach ($data['pickup_lines'] ?? [] as $input) {
                $id = (int) $input['id'];
                $qty = round((float) $input['quantity'], 2);
                if (! $progress->has($id) || isset($lines[$id]) || $qty < 0) $this->fail('Invalid or duplicate pickup batch.');
                $line = $progress[$id];
                if ($qty > ($action === 'pickup' ? $line->remaining : $line->picked)) $this->fail('Quantity exceeds the available batch balance.');
                $lines[$id] = $action === 'pickup' ? $qty : -$qty;
            }
            if (array_sum($lines) == 0) $this->fail('Enter a positive quantity for at least one batch.');
            if ($action === 'put_back' && round($quantityTotal + array_sum($lines), 2) <= 0) $changes += ['custodian_id' => null];
        } elseif (in_array($action, ['request_handover', 'accept_handover'], true)) {
            // The ledger gets the exact custody snapshot without adding pickup units.
            $delivered = collect($this->progress($invoice))->pluck('delivered', 'id')->all();
            foreach ($progress as $row) {
                $sent = min((float) ($delivered[$row->sales_invoice_item_id] ?? 0), $row->picked);
                $lines[$row->id] = $row->picked - $sent;
                $delivered[$row->sales_invoice_item_id] = ($delivered[$row->sales_invoice_item_id] ?? 0) - $sent;
            }
        }
        $event = $dispatch->events()->create(['action' => $action, 'request_key' => $data['request_key'],
            'created_by' => $actor->id, 'assigned_to' => $eventAssignee, 'notes' => $notes ?: null]);
        foreach (array_filter($lines) as $id => $qty) DB::table('dispatch_pickup_lines')->insert([
            'dispatch_event_id' => $event->id, 'sale_batch_allocation_id' => $id, 'quantity' => $qty,
        ]);
        $dispatch->update($changes);
        AuditLogger::action($invoice, 'dispatch_'.$action, ['dispatch_event_id' => $event->id, 'from_custodian' => $custodian ?: null,
            'changes' => $changes, 'verified_for' => $verifiedFor]);
    }

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

    public function record(SalesInvoice $invoice, array $data, User $actor, bool $approvedCorrection = false): void
    {
        DB::transaction(function () use ($invoice, $data, $actor, $approvedCorrection) {
            $invoice = SalesInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $limited = ! $actor->can('dispatch.manage');
            if (isset($data['expected_status'])) abort_unless(! $limited && $actor->is_active, 403);
            $dispatch = Dispatch::where('sales_invoice_id', $invoice->id)->first();
            if ($dispatch?->isHistoricalDelivery()) {
                abort_if($limited && (int) $dispatch->assigned_to !== $actor->id, 404);
                $this->fail('This historical delivery is read-only.');
            }
            if ($limited && $data['action'] !== 'accept_handover') {
                abort_unless($actor->can('dispatch.assigned') && $actor->is_active, 403);
                abort_unless($dispatch && (int) $dispatch->assigned_to === $actor->id, 404);
                abort_unless(in_array($data['action'], [...self::FIELD_ACTIONS, 'pickup', 'confirm_pickup'], true)
                    && ! array_key_exists('assigned_to', $data) && ! array_key_exists('planned_date', $data), 403);
            }
            if ($invoice->status !== 'posted') $this->fail('Only posted invoices can be dispatched.');
            $existing = DispatchEvent::where('request_key', $data['request_key'])->first();
            if ($existing) {
                if (! Dispatch::whereKey($existing->dispatch_id)->where('sales_invoice_id', $invoice->id)->exists()) $this->fail('This action reference belongs to another invoice.');
                return;
            }
            if (isset($data['expected_status']) && $data['expected_status'] !== ($dispatch?->status ?? 'untracked')) {
                $this->fail('This invoice changed while the form was open. Close it and refresh the board.');
            }
            $verifiedFor = null;
            if (! empty($data['admin_verified'])) {
                abort_unless(isset($data['expected_status'], $data['verified_salesman_id']) && $this->mayVerifyBoardActivity($actor) && $dispatch?->custody_required
                    && in_array($data['action'], ['pickup', 'confirm_pickup', 'dispatched', 'delivered', 'failed'], true), 403);
                $verifiedFor = (int) $dispatch->assigned_to;
                if ($verifiedFor !== (int) $data['verified_salesman_id']) $this->fail('The assigned Salesman changed. Close this form and refresh the board.');
                if (array_key_exists('assigned_to', $data) || array_key_exists('planned_date', $data)) $this->fail('Record assignment changes separately from verified activity.');
                if (! $verifiedFor || ! app(DeliveryPlanningService::class)->activeSalesmen()->whereKey($verifiedFor)->exists()) {
                    $this->fail('Assign an active Salesman before recording verified activity.');
                }
                if ($data['action'] === 'failed' && trim($data['notes'] ?? '') === '') $this->fail('Enter a reason for this action.');
                if ($data['action'] === 'delivered' && ! empty($data['collections'])) $this->fail('The Salesman must report their own collections.');
                $data['notes'] = trim(($data['notes'] ?? '')."\nOffice verified activity for assigned Salesman #{$verifiedFor}.");
            }
            if (isset($data['expected_status']) && ! $dispatch && $data['action'] === 'assign'
                && array_sum(array_column($this->progress($invoice), 'remaining')) <= 0) {
                $this->fail('This invoice has no remaining units to deliver.');
            }
            $dispatch ??= Dispatch::create([
                'sales_invoice_id' => $invoice->id,
                'custody_required' => isset($data['expected_status']) && $data['action'] === 'assign' && $this->pickupProgress($invoice) !== [],
            ]);
            $action = $data['action'];
            if (in_array($action, ['pickup', 'confirm_pickup', 'put_back', 'request_handover', 'accept_handover', 'cancel_handover'], true)) {
                if (! $dispatch->custody_required) $this->fail('Item-level pickup is available for newly posted invoices.');
                $this->recordCustody($invoice, $dispatch, $data, $actor, ! $limited, $verifiedFor);
                return;
            }
            if ($dispatch->custody_required) {
                if ($action === 'correct_delivery' && ! $approvedCorrection) $this->fail('Submit a delivery correction for independent Finance approval.');
                if ($dispatch->handover_to_id) $this->fail('Resolve the pending handover first.');
                if (in_array($action, ['picking', 'packed'], true)) $this->fail('Record and confirm actual picked quantities first.');
                if ($action === 'assign' && $dispatch->custodian_id && array_key_exists('assigned_to', $data)
                    && (int) $data['assigned_to'] !== (int) $dispatch->assigned_to) $this->fail('Picked stock requires a confirmed handover.');
                if (in_array($action, ['dispatched', 'delivered', 'failed'], true)) {
                    if (! $dispatch->pickup_confirmed_at) $this->fail('Confirm the complete pickup before dispatching.');
                    if ($verifiedFor) {
                        if ((int) $dispatch->custodian_id !== $verifiedFor) $this->fail('The assigned Salesman must hold the picked stock.');
                    } else {
                        abort_unless((int) $dispatch->custodian_id === $actor->id && $actor->is_active && $actor->can('dispatch.assigned'), 403);
                    }
                }
            }
            $assignedTo = array_key_exists('assigned_to', $data) ? $data['assigned_to'] : $dispatch->assigned_to;
            if (array_key_exists('assigned_to', $data)) {
                if ($assignedTo && $dispatch->custody_required && ! app(DeliveryPlanningService::class)->activeSalesmen()->whereKey($assignedTo)->exists()) {
                    $this->fail('Choose an active Salesman for an invoice that requires pickup.');
                }
                app(OperationsAccess::class)->validateAssignee($assignedTo, ['dispatch.view', 'dispatch.assigned'], $actor);
            }
            $state = $dispatch->status ?? 'pending';
            if (! in_array($state, self::TRANSITIONS[$action] ?? [], true)) $this->fail('This action is unavailable in the current delivery status. Refresh the invoice.');
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
            $date = $action === 'assign' && array_key_exists('planned_date', $data) ? $data['planned_date'] : $dispatch->planned_date;
            $dispatch->update(['status' => $status, 'assigned_to' => $assignedTo, 'planned_date' => $date,
                'original_assignee_id' => $dispatch->original_assignee_id ?? $assignedTo]);
            if ($dispatch->custody_required && $action === 'delivered' && ! $verifiedFor) {
                $collections = $data['collections'] ?? [];
                if ($collections === []) $collections = [['amount' => 0, 'method' => 'none', 'request_key' => $data['request_key']]];
                foreach ($collections as $collection) {
                    app(DeliveryCollectionService::class)->report($invoice, $actor, $collection, $event->id);
                }
            }
            AuditLogger::action($invoice, 'dispatch_'.$action, ['dispatch_event_id' => $event->id, 'status' => $status,
                'assigned_to' => $assignedTo, 'planned_date' => $date, 'verified_for' => $verifiedFor]);
            if (in_array($action, ['delivered','correct_delivery','close_returned'], true)) app(CommissionService::class)->recalculate($invoice);
        });
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['action' => $message]);
    }
}
