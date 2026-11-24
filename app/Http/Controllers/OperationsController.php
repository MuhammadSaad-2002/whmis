<?php

namespace App\Http\Controllers;

use App\Models\{CollectionFollowUp, Dispatch, SalesInvoice, User};
use App\Services\{AdminDispatchOverview, CollectionService, CollectionWorklist, DeliveryCollectionService, DeliveryPlanningService, DispatchService, FieldDeliveryOverview, InvoiceBalanceService, OperationsAccess, ReportPdfRenderer};
use App\Support\ReportCsv;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class OperationsController extends Controller
{
    public function dispatches(Request $request, AdminDispatchOverview $overview, FieldDeliveryOverview $fieldDeliveries)
    {
        $actor = $request->user();
        $today = now('Asia/Karachi')->toDateString();
        $scoped = ! $actor->can('dispatch.view');
        abort_if($scoped && ! $actor->is_active, 403);
        $filters = $request->validate([
            'search' => 'nullable|string|max:100', 'status' => 'nullable|in:untracked,pending,picking,packed,dispatched,partial,delivered,failed,closed',
            'date' => 'nullable|date_format:Y-m-d', 'assignee_id' => 'nullable|integer',
        ]);
        if (! $scoped) {
            $filters += $request->validate([
                'stage' => ['nullable', Rule::in(array_keys(AdminDispatchOverview::STAGES))],
                'view' => 'nullable|in:board,list',
                'sort' => 'nullable|in:number,customer,date,value,activity',
                'dir' => 'nullable|in:asc,desc',
            ]);
            $view = $filters['view'] ?? 'board';
            $query = $overview->query($filters);
            $rows = $overview->rows(clone $query);
            if ($stage = ($filters['stage'] ?? null)) {
                $overview->forStatuses($rows, AdminDispatchOverview::STAGES[$stage]);
            } elseif ($status = ($filters['status'] ?? null)) {
                $overview->forStatuses($rows, [$status]);
            }

            return Inertia::render('operations/dispatch-index', [
                'invoices' => fn () => $overview->ordered($rows, $filters)->paginate(15)->withQueryString(),
                'pipeline' => fn () => $overview->pipeline($query, $today),
                'board' => fn () => $view === 'board' ? $overview->board($query, $filters) : [],
                'filters' => $filters, 'scoped' => false, 'today' => $today,
                'staff' => fn () => app(OperationsAccess::class)->staff(['dispatch.view', 'dispatch.assigned'], $actor)->orderBy('name')->get(['id', 'name']),
                'canPlan' => $actor->can('dispatch.plan'), 'canManage' => $actor->can('dispatch.manage') && $actor->is_active,
            ]);
        }
        $filters['date'] ??= $today;
        unset($filters['assignee_id']);
        $query = $fieldDeliveries->forDay($actor->id, $filters['date'], $today)
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($q) => $q->where('invoice_number', 'like', "%{$s}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$s}%"))))
            ->when($filters['status'] ?? null, fn ($q, $s) => $q->where('d.status', $s));

        return Inertia::render('operations/dispatch-index', [
            'invoices' => fn () => $fieldDeliveries->ordered(clone $query)->with('customer:id,name,city')
                ->paginate(20)->withQueryString()->through(fn (SalesInvoice $invoice) => [
                    ...$invoice->only(['id', 'invoice_number', 'planned_date', 'dispatch_status', 'customer']),
                    'invoice_date' => $invoice->invoice_date?->toDateString(),
                    'is_complete' => (bool) $invoice->is_complete,
                    'pending_paisa' => (int) $invoice->pending_collection_paisa,
                    'outstanding' => max(0, (float) $invoice->outstanding),
                ]),
            'filters' => $filters, 'scoped' => true,
            'activeDeliveries' => fn () => $fieldDeliveries->uncompleted(clone $query)->count(),
            'staff' => [],
            'canPlan' => $actor->can('dispatch.plan'),
            'today' => $today,
        ]);
    }

    public function dispatchPreview(SalesInvoice $sale)
    {
        abort_unless($sale->isPosted(), 404);
        $dispatch = Dispatch::where('sales_invoice_id', $sale->id)->first();
        $activity = $dispatch?->events()->reorder('id', 'desc')->with('creator:id,name')->limit(20)->get([
            'id', 'dispatch_id', 'action', 'created_at', 'created_by', 'receiver_name', 'notes',
        ]) ?? collect();
        $startedAt = $dispatch?->events()->first()?->created_at;

        return response()->json([
            'first_event_at' => $startedAt?->toISOString(),
            'events' => $activity->map(fn ($event) => [
                'id' => $event->id, 'action' => $event->action, 'created_at' => $event->created_at?->toISOString(),
                'by' => $event->creator?->name, 'receiver' => $event->receiver_name, 'notes' => $event->notes,
            ]),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function dispatchPickList(Request $request, AdminDispatchOverview $overview, DispatchService $dispatch, ReportPdfRenderer $pdf)
    {
        $filters = $request->validate([
            'search' => 'nullable|string|max:100', 'date' => 'nullable|date_format:Y-m-d', 'assignee_id' => 'nullable|integer',
            'ids' => 'nullable|array|max:30', 'ids.*' => 'required|integer|min:1|distinct',
        ]);
        $ids = $filters['ids'] ?? [];
        $rows = $overview->query($ids ? [] : $filters)
            ->whereIn('dispatches.status', ['pending', 'picking'])
            ->when($ids, fn (Builder $q) => $q->whereKey($ids))
            ->select('sales_invoices.*')->addSelect('dispatches.planned_date', 'dispatches.custody_required')
            ->with('customer:id,name')->orderBy('dispatches.planned_date')->orderBy('sales_invoices.id')->limit(31)->get();

        return $pdf->renderView('pdf.dispatch-pick-list', [
            'truncated' => $rows->count() > 30,
            'orders' => $rows->take(30)->map(fn ($invoice) => [
                'invoice' => $invoice,
                'lines' => $invoice->custody_required
                    ? collect($dispatch->pickupProgress($invoice))->filter(fn ($line) => $line->remaining > 0)
                        ->map(fn ($line) => ['product' => $line->product, 'batch' => $line->batch, 'expiry' => $line->expiry, 'quantity' => $line->remaining])
                    : collect($dispatch->progress($invoice))->filter(fn ($line) => $line['remaining'] > 0)
                        ->map(fn ($line) => ['product' => $line['product'], 'batch' => $line['batch'], 'expiry' => $line['expiry'], 'quantity' => $line['remaining']]),
            ]),
        ], 'portrait')->stream('dispatch-pick-list.pdf');
    }

    public function dispatchMoveOptions(Request $request, SalesInvoice $sale, DispatchService $service, DeliveryPlanningService $planning, OperationsAccess $access)
    {
        abort_unless($sale->isPosted(), 404);
        $actor = $request->user();
        abort_unless($actor->is_active, 403);
        $dispatch = Dispatch::where('sales_invoice_id', $sale->id)->with('assignee:id,name')->first();
        $status = $dispatch?->status ?? 'untracked';
        $items = $service->progress($sale);
        $hasRemaining = array_sum(array_column($items, 'remaining')) > 0;
        $hasReturns = array_sum(array_column($items, 'returned')) > 0;
        $custody = (bool) $dispatch?->custody_required;
        $moves = [];
        $pickup = [];
        $assignable = ($status === 'untracked' || ($status === 'pending' && ! $dispatch?->assigned_to)) && $hasRemaining;
        $staff = $assignable ? $access->staff('dispatch.assigned', $actor)
            ->whereIn('id', $planning->activeSalesmen()->select('users.id'))->orderBy('name')->get(['id', 'name']) : collect();
        $defaults = $assignable ? $planning->assignmentDefaults($sale) : [];
        $defaultAssignee = $staff->contains('id', $defaults['assigned_to'] ?? null) ? $defaults['assigned_to'] : null;

        if ($assignable && ! $dispatch?->handover_to_id) $moves[] = ['stage' => 'pending', 'action' => 'assign', 'verify' => false];
        if ($dispatch && ! $dispatch->handover_to_id) {
            if (! $hasRemaining && $hasReturns && in_array($status, DispatchService::TRANSITIONS['close_returned'], true)) {
                $moves[] = ['stage' => 'failed', 'action' => 'close_returned', 'verify' => false];
            }
            $verify = $custody && $service->mayVerifyBoardActivity($actor);
            $isHolder = $dispatch->custodian_id && (int) $dispatch->custodian_id === (int) $dispatch->assigned_to;
            $isAssignee = $actor->can('dispatch.assigned') && (int) $dispatch->assigned_to === $actor->id;
            $canRecord = ! $custody || (($verify || $isAssignee) && $planning->activeSalesmen()->whereKey($dispatch->assigned_to)->exists());
            if ($canRecord && $hasRemaining) {
                if ($custody && ! $dispatch->pickup_confirmed_at && in_array($status, ['pending', 'picking'], true) && (! $dispatch->custodian_id || $isHolder)) {
                    $pickup = $service->pickupProgress($sale);
                    if (array_sum(array_column($pickup, 'remaining')) > 0) {
                        $moves[] = ['stage' => 'picking', 'action' => 'pickup', 'verify' => $verify];
                    }
                    if ($status === 'picking' && $isHolder && $pickup && array_sum(array_column($pickup, 'remaining')) <= 0
                        && array_sum(array_column($pickup, 'picked')) > 0) {
                        $moves[] = ['stage' => 'packed', 'action' => 'confirm_pickup', 'verify' => $verify];
                    }
                } elseif (! $custody || ($dispatch->pickup_confirmed_at && $isHolder)) {
                    $transitions = ['dispatched' => 'dispatched', 'delivered' => 'delivered', 'failed' => 'failed'];
                    if (! $custody) $transitions += ['picking' => 'picking', 'packed' => 'packed'];
                    foreach ($transitions as $stage => $action) {
                        if (in_array($status, DispatchService::TRANSITIONS[$action], true)) $moves[] = compact('stage', 'action', 'verify');
                    }
                }
            }
        }

        return response()->json([
            'status' => $status, 'moves' => $moves, 'items' => $items, 'pickup' => $pickup,
            'staff' => $staff, 'assigned_to' => $defaultAssignee,
            'planned_date' => $dispatch?->planned_date ?: ($defaults['planned_date'] ?? now('Asia/Karachi')->toDateString()),
            'salesman' => $dispatch?->assignee ? ['id' => $dispatch->assignee->id, 'name' => $dispatch->assignee->name] : null,
            'hint' => match (true) {
                $dispatch?->handover_to_id => 'Resolve the pending handover before moving this delivery.',
                $custody && ! $dispatch?->assigned_to => 'Assign this delivery to an active Salesman first.',
                $custody && $status === 'picking' && ! $dispatch->pickup_confirmed_at => 'Record all remaining pickup quantities before moving to Packed.',
                default => 'This move would skip a required step or undo recorded activity. Choose the next valid stage.',
            },
        ])->header('Cache-Control', 'private, no-store');
    }

    public function dispatch(Request $request, SalesInvoice $sale, DispatchService $service, DeliveryCollectionService $collections)
    {
        $actor = $request->user();
        $dispatch = Dispatch::where('sales_invoice_id', $sale->id)
            ->with(['assignee:id,name', 'originalAssignee:id,name', 'custodian:id,name', 'events.creator:id,name', 'events.assignee:id,name', 'events.items', 'events.pickupLines'])->first();
        $scoped = ! $actor->can('dispatch.view');
        $handover = $dispatch && (int) $dispatch->handover_to_id === $actor->id && $actor->can('dispatch.assigned');
        $this->authorizeDispatchDetail($sale, $dispatch, $actor);
        $canManage = $actor->can('dispatch.manage');
        $historical = $dispatch?->isHistoricalDelivery() ?? false;
        $fieldActions = $actor->can('dispatch.assigned') && $actor->is_active && $dispatch && (int) $dispatch->assigned_to === $actor->id;
        $collectiblePaisa = ! $historical && $fieldActions && $sale->isPosted() ? $collections->remainingFor($sale) : 0;
        return Inertia::render('operations/dispatch', [
            'invoice' => $sale->only(['id', 'invoice_number', 'status']) + [
                'customer' => $sale->customer?->name, 'address' => $sale->customer?->address, 'city' => $sale->customer?->city, 'phone' => $sale->customer?->phone,
                'contact' => $sale->customer?->contact_person,
            ],
            'dispatch' => $dispatch,
            'historicalDelivery' => $historical,
            'items' => $historical ? [] : $service->progress($sale),
            'pickupLines' => $dispatch?->custody_required ? $service->pickupProgress($sale) : [],
            'collectiblePaisa' => $collectiblePaisa,
            'canReportCollection' => $collectiblePaisa > 0 && in_array($dispatch->status, ['partial', 'delivered'], true),
            'canRequestCorrection' => $canManage && $actor->can('finance.request'),
            'staff' => $canManage ? app(OperationsAccess::class)->staff(['dispatch.view', 'dispatch.assigned'], $actor)
                ->when($dispatch?->custody_required, fn ($q) => $q->whereIn('id', app(\App\Services\DeliveryPlanningService::class)->activeSalesmen()->select('id')))
                ->orderBy('name')->get(['id', 'name']) : [],
            'scoped' => $scoped, 'canViewInvoice' => $actor->can('sales.view') && $actor->can('view-supplier-details'),
            'canManage' => $canManage, 'fieldActions' => $handover ? ['accept_handover'] : ($fieldActions ? $service->availableActions($dispatch, false) : []),
            'managerActions' => $canManage ? $service->availableActions($dispatch, true) : [],
            'today' => now('Asia/Karachi')->toDateString(),
        ]);
    }

    private function authorizeDispatchDetail(SalesInvoice $sale, ?Dispatch $dispatch, User $actor): void
    {
        $scoped = ! $actor->can('dispatch.view');
        $inScope = $dispatch && $actor->can('dispatch.assigned')
            && in_array($actor->id, [(int) $dispatch->assigned_to, (int) $dispatch->handover_to_id], true);
        abort_if($sale->status === 'draft' || ($scoped && ! $inScope), 404);
        abort_if($scoped && ! $actor->is_active, 403);
    }

    public function dispatchPickingPdf(Request $request, SalesInvoice $sale, DispatchService $service, ReportPdfRenderer $pdf)
    {
        $dispatch = Dispatch::where('sales_invoice_id', $sale->id)->with('assignee:id,name')->first();
        $this->authorizeDispatchDetail($sale, $dispatch, $request->user());
        abort_if($dispatch?->isHistoricalDelivery(), 404);
        $tracksPickup = (bool) $dispatch?->custody_required;
        $formatQty = fn ($value) => rtrim(rtrim(number_format((float) $value, 2), '0'), '.');
        $title = $tracksPickup ? 'Dispatch Picking List' : 'Dispatch Delivery Items';
        $lines = $tracksPickup ? collect($service->pickupProgress($sale))->map(fn ($line) => [
            'product' => $line->product, 'batch' => $line->batch, 'expiry' => $line->expiry,
            'units' => $line->quantity, 'completed' => $line->picked, 'remaining' => $line->remaining,
        ]) : collect($service->progress($sale))->map(fn ($line) => [
            'product' => $line['product'], 'batch' => $line['batch'], 'expiry' => $line['expiry'],
            'units' => $line['units'], 'completed' => $line['delivered'], 'remaining' => $line['remaining'],
        ]);
        if (! $sale->isPosted()) $lines = $lines->map(fn ($line) => array_replace($line, ['remaining' => 0]));
        $quantityKeys = ['units', 'completed', 'remaining'];
        $totals = collect($quantityKeys)->mapWithKeys(fn ($key) => [$key => $formatQty($lines->sum($key))])->all();
        $rows = $lines->map(fn ($line) => array_replace($line, collect($quantityKeys)
            ->mapWithKeys(fn ($key) => [$key => $formatQty($line[$key])])->all()))->all();
        $customer = $sale->customer;
        $context = implode(' · ', array_filter([
            $customer?->name, $dispatch?->assignee?->name ? 'Salesman: '.$dispatch->assignee->name : null,
            $dispatch?->planned_date ? 'Planned: '.$dispatch->planned_date : null,
            'Invoice: '.ucfirst($sale->status), 'Dispatch: '.ucfirst($dispatch?->status ?? 'untracked'),
        ]));

        return $pdf->renderView('pdf.dispatch-items', [
            'title' => $title, 'headerLabel' => $sale->invoice_number, 'context' => $context,
            'notes' => array_filter([implode(', ', array_filter([$customer?->address, $customer?->city])), 'Quantities include bonus units. Only recorded activity is shown.']),
            'columns' => [
                ['key' => 'product', 'label' => 'Product', 'wrap' => true], ['key' => 'batch', 'label' => 'Batch'],
                ['key' => 'expiry', 'label' => 'Expiry', 'format' => 'date'], ['key' => 'units', 'label' => 'Invoice qty', 'align' => 'right'],
                ['key' => 'completed', 'label' => $tracksPickup ? 'Picked' : 'Delivered', 'align' => 'right'],
                ['key' => 'remaining', 'label' => $tracksPickup ? 'To pick' : 'To deliver', 'align' => 'right'],
            ], 'rows' => $rows, 'totals' => $rows ? $totals : [],
        ], 'portrait')->stream('dispatch-items-'.$sale->id.'.pdf')->header('Cache-Control', 'private, no-store');
    }

    public function dispatchAction(Request $request, SalesInvoice $sale, DispatchService $service)
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['assign', 'picking', 'packed', 'dispatched', 'delivered', 'failed', 'correct_delivery', 'close_returned',
                'pickup', 'confirm_pickup', 'put_back', 'request_handover', 'accept_handover', 'cancel_handover'])],
            'request_key' => 'required|uuid', 'assigned_to' => 'nullable|integer',
            'expected_status' => 'nullable|in:untracked,pending,picking,packed,dispatched,partial,delivered,failed,closed',
            'admin_verified' => 'nullable|boolean', 'verified_salesman_id' => 'nullable|integer|min:1',
            'planned_date' => 'nullable|date_format:Y-m-d',
            'receiver_name' => 'nullable|string|max:150', 'notes' => 'nullable|string|max:1000',
            'items' => 'nullable|array', 'items.*.sales_invoice_item_id' => 'required|integer|distinct',
            'items.*.quantity' => 'required|numeric|decimal:0,2|min:0|max:999999999999',
            'pickup_lines' => 'nullable|array', 'pickup_lines.*.id' => 'required|integer|distinct',
            'pickup_lines.*.quantity' => 'required|numeric|decimal:0,2|min:0|max:999999999999',
            'collections' => 'nullable|array|max:2', 'collections.*.request_key' => 'required|uuid|distinct',
            'collections.*.amount' => 'required|numeric|decimal:0,2|min:0|max:999999999999',
            'collections.*.method' => 'required|in:none,cash,online', 'collections.*.reference' => 'nullable|string|max:200',
        ]);
        if (isset($data['expected_status']) && $data['action'] === 'assign') {
            $request->validate([
                'assigned_to' => ['required', 'integer', function ($attribute, $value, $fail) {
                    if (! app(DeliveryPlanningService::class)->activeSalesmen()->whereKey($value)->exists()) $fail('Choose an active Salesman.');
                }],
                'planned_date' => 'required|date_format:Y-m-d',
            ]);
        }
        $service->record($sale, $data, $request->user());
        $partial = isset($data['expected_status']) && $data['action'] === 'delivered'
            && Dispatch::where('sales_invoice_id', $sale->id)->where('status', 'partial')->exists();
        return back()->with('success', $partial ? 'Partial delivery recorded. The remaining units are still out for delivery.' : 'Delivery activity recorded.');
    }

    private function collectionFilters(Request $request): array
    {
        return $request->validate([
            'search' => 'nullable|string|max:100',
            'bucket' => ['nullable', Rule::in(['all', 'overdue', 'follow_up', ...CollectionWorklist::AGING])],
            'flag' => ['nullable', Rule::in(CollectionWorklist::FLAGS)],
            'view' => 'nullable|in:customer,invoice', 'sort' => 'nullable|in:overdue,balance,due',
        ]);
    }

    public function collections(Request $request, CollectionWorklist $worklist)
    {
        $today = now('Asia/Karachi')->startOfDay();
        $filters = $this->collectionFilters($request);
        $open = $worklist->base($today);
        $page = $worklist->page($open, $worklist->filtered($open, $filters, $today), $filters);

        return Inertia::render('operations/collections', $page + [
            'filters' => $filters, 'today' => $today->toDateString(),
            'summary' => fn () => $worklist->summary($open),
        ]);
    }

    public function collectionsCsv(Request $request, CollectionWorklist $worklist)
    {
        $today = now('Asia/Karachi')->startOfDay();
        $filters = $this->collectionFilters($request);
        $rows = $worklist->filtered($worklist->base($today), $filters, $today);

        return ReportCsv::download('collections-'.$today->toDateString().'.csv',
            ['Invoice #', 'Customer', 'Due date', 'Days overdue', 'Invoice amount', 'Paid', 'Returns', 'Applied credit', 'Outstanding'],
            $worklist->exportRows($rows, $filters, $today));
    }

    public function collectionsPdf(Request $request, CollectionWorklist $worklist, ReportPdfRenderer $pdf)
    {
        $today = now('Asia/Karachi')->startOfDay();
        $filters = $this->collectionFilters($request);
        $query = $worklist->filtered($worklist->base($today), $filters, $today);
        $rows = iterator_to_array($worklist->exportRows($query, $filters, $today), false);
        $money = ['format' => 'money', 'align' => 'right'];
        $totals = [];
        foreach (['total', 'paid', 'returns', 'credit', 'outstanding'] as $key) $totals[$key] = array_sum(array_column($rows, $key));

        return $pdf->render([
            'title' => 'Collections & Recovery', 'filters' => [], 'context' => 'Outstanding invoices as of '.$today->format('d M Y').' (PKT)',
            'columns' => [
                ['key' => 'invoice', 'label' => 'Invoice #'], ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'due', 'label' => 'Due date', 'format' => 'date'], ['key' => 'days_overdue', 'label' => 'Days overdue', 'align' => 'right'],
                ['key' => 'total', 'label' => 'Invoice amount'] + $money, ['key' => 'paid', 'label' => 'Paid'] + $money,
                ['key' => 'returns', 'label' => 'Returns'] + $money, ['key' => 'credit', 'label' => 'Applied credit'] + $money,
                ['key' => 'outstanding', 'label' => 'Outstanding'] + $money,
            ],
            'rows' => $rows, 'totals' => $totals,
            'notes' => ['Unallocated customer credit and promises to pay do not reduce these invoice balances.'],
        ], 'landscape')->stream('collections-'.$today->toDateString().'.pdf');
    }

    public function collection(Request $request, SalesInvoice $sale, InvoiceBalanceService $balances)
    {
        abort_if($sale->status === 'draft', 404);
        $balance = $balances->sales()->where('sales_invoices.id', $sale->id)->first();
        $customer = $sale->customer()->withTrashed()->first(['id', 'name', 'phone', 'deleted_at']);
        $props = [
            'invoice' => $sale->only(['id', 'invoice_number', 'status', 'total_amount']) + [
                'customer' => $customer?->name, 'customer_id' => $sale->customer_id,
                'phone' => $customer?->phone, 'customer_archived' => ! $customer || $customer->trashed(),
                'due_on' => ($sale->due_date ?? $sale->invoice_date)?->toDateString(),
                'outstanding' => (float) ($balance?->outstanding ?? 0),
                'paid_amount' => (float) ($balance?->paid_amount ?? 0), 'return_credit' => (float) ($balance?->return_credit ?? 0),
                'applied_credit' => (float) ($balance?->applied_credit ?? 0),
            ],
            'history' => CollectionFollowUp::where('sales_invoice_id', $sale->id)->with(['assignee:id,name', 'creator:id,name'])->latest('id')->get(),
            'staff' => $request->user()->can('collections.manage')
                ? app(OperationsAccess::class)->staff('collections.view', $request->user())->orderBy('name')->get(['id', 'name']) : [],
            'today' => now('Asia/Karachi')->toDateString(),
        ];

        return $request->expectsJson() ? response()->json($props)->header('Cache-Control', 'private, no-store') : Inertia::render('operations/collection', $props);
    }

    public function followUp(Request $request, SalesInvoice $sale, CollectionService $service)
    {
        $today = now('Asia/Karachi')->toDateString();
        $data = $request->validate([
            'assigned_to' => 'nullable|integer', 'outcome' => 'required|in:contacted,promised,unreachable,disputed,statement_requested,reported_paid,visit_needed',
            'promised_date' => 'nullable|required_if:outcome,promised|date_format:Y-m-d|after_or_equal:'.$today,
            'promised_amount' => 'nullable|required_if:outcome,promised|numeric|decimal:0,2|gt:0|max:999999999999',
            'next_follow_up' => 'required|date_format:Y-m-d|after_or_equal:'.$today, 'notes' => 'required|string|max:1000',
        ]);
        $service->followUp($sale, $data, $request->user());
        return back()->with('success', 'Collection follow-up saved. Record actual receipts in Payments.');
    }
}
