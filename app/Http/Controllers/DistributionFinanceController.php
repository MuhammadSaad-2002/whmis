<?php

namespace App\Http\Controllers;

use App\Models\{FinanceWorkItem, Payment, PaymentAllocation, SalesInvoice, SalesReturn, User};
use App\Services\{DailyCollectionReport, DeliveryCollectionService, DeliveryPlanningService, FinanceApprovalService, InvoiceBalanceService, ReportPdfRenderer, TreasuryService};
use App\Support\Paisa;
use App\Support\ReportCsv;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class DistributionFinanceController
{
    private const RECEIPTS = ['receipt', 'refund_recovery', 'shortage_repayment', 'recovery_repayment', 'advance_repayment'];

    private const PAYOUTS = ['supplier_payment', 'customer_refund', 'commission_payout', 'advance', 'salary_payment', 'expense'];

    private const LEDGER_FILTERS = [
        'opening' => ['opening'], 'receipt' => self::RECEIPTS, 'payout' => self::PAYOUTS,
        'transfer' => ['transfer_in', 'transfer_out'], 'other' => ['adjustment'],
    ];

    public function __construct(private TreasuryService $treasury, private FinanceApprovalService $approvals, private DeliveryCollectionService $collections) {}

    public function treasury(Request $request)
    {
        $actor = $request->user();
        $filters = $request->validate([
            'account' => ['nullable', 'integer', 'min:1'],
            'search' => ['nullable', 'string', 'max:120'],
            'movement' => ['nullable', Rule::in(array_keys(self::LEDGER_FILTERS))],
        ]);
        $canManage = $actor->can('treasury.manage');
        $control = $this->treasury->control();
        $accounts = $this->treasury->visible($actor)->with('operators:id,name')->orderBy('name')->get();
        $movements = DB::table('treasury_entries')->whereIn('account_id', $accounts->pluck('id'))
            ->selectRaw('account_id, kind, SUM(paisa) AS paisa, COUNT(*) AS entry_count, MIN(business_date) AS first_date')
            ->groupBy('account_id', 'kind')->get();
        $byAccount = $movements->groupBy('account_id');
        $movementTotals = $movements->groupBy('kind')->map(fn ($rows) => (int) $rows->sum('paisa'));
        $accounts->each(fn ($account) => $account->setAttribute('balance_paisa', (int) $byAccount->get($account->id, collect())->sum('paisa')));
        $account = isset($filters['account']) ? $accounts->firstWhere('id', (int) $filters['account']) : $accounts->first();
        $accountMovements = $byAccount->get($account?->id ?? 0, collect());
        $accountStats = $account ? [
            'opening' => (int) $accountMovements->where('kind', 'opening')->sum('paisa'),
            'opened' => $accountMovements->firstWhere('kind', 'opening')?->first_date,
            'receipts' => (int) $accountMovements->whereIn('kind', self::RECEIPTS)->sum('paisa'),
            'payouts' => -(int) $accountMovements->whereIn('kind', self::PAYOUTS)->sum('paisa'),
            'entries' => (int) $accountMovements->sum('entry_count'),
        ] : null;
        $pending = $actor->can('distribution.reconcile')
            ? DB::table('delivery_collections')->whereNull('recorded_at')->where('reported_paisa', '>', 0)
                ->selectRaw('method, COUNT(*) AS count')->groupBy('method')->pluck('count', 'method')
            : collect();
        // Calculate the running balance before filtering which movements are displayed.
        $ledger = $account ? DB::table('treasury_entries')->where('account_id', $account->id)
            ->select('*')->selectRaw('SUM(paisa) OVER (PARTITION BY account_id ORDER BY business_date, id ROWS UNBOUNDED PRECEDING) as running_paisa')
            : null;
        $entries = $ledger ? DB::query()->fromSub($ledger, 'ledger')
            ->leftJoin('users as actors', 'actors.id', '=', 'ledger.actor_id')->select('ledger.*', 'actors.name as actor_name')
            ->when(($filters['search'] ?? '') !== '', fn ($query) => $query->where('ledger.reference', 'like', '%'.$filters['search'].'%'))
            ->when($filters['movement'] ?? null, fn ($query, $kind) => $query->whereIn('ledger.kind', self::LEDGER_FILTERS[$kind]))
            ->latest('ledger.business_date')->latest('ledger.id')->paginate(30)->withQueryString() : null;
        $approvalQueue = null;
        if ($actor->can('finance.review')) {
            $visible = $this->approvals->visibleRequests($actor);
            $awaiting = (clone $visible)->where('status', 'pending');
            $openings = (clone $awaiting)->where('kind', 'opening');
            $preview = fn (FinanceWorkItem $item) => [
                'id' => $item->id, 'kind' => $item->kind, 'status' => $item->status, 'amount_paisa' => $item->amount_paisa,
                'date' => $item->payload['date'] ?? null,
                'account' => $accounts->firstWhere('id', (int) ($item->payload['account_id'] ?? 0))?->name,
                'requester_id' => $item->created_by,
            ];
            $approvalQueue = [
                'count' => $awaiting->count(),
                'openings' => $openings->count(),
                'items' => $visible->whereIn('status', ['pending', 'approved'])->latest('id')->limit(20)->get()->map($preview),
                'opening_items' => $openings->latest('id')->limit(20)->get()->map($preview),
            ];
        }
        return Inertia::render('operations/treasury', [
            'accounts' => $accounts, 'account' => $account, 'accountStats' => $accountStats, 'entries' => $entries,
            'filters' => ['search' => $filters['search'] ?? '', 'movement' => $filters['movement'] ?? ''],
            'control' => ['go_live_date' => $control->go_live_date, 'locked_at' => $control->locked_at, 'live' => $this->treasury->live()],
            'approvalQueue' => $approvalQueue,
            'approvalLimits' => $actor->hasRole('Super Admin') ? array_replace(
                array_fill_keys(FinanceApprovalService::KINDS, null),
                array_intersect_key(json_decode($control->approval_limits ?? '{}', true, flags: JSON_THROW_ON_ERROR), array_flip(FinanceApprovalService::KINDS)),
            ) : null,
            'totals' => [
                'opening' => $movementTotals['opening'] ?? 0,
                'receipts' => $movementTotals->only(self::RECEIPTS)->sum(),
                'payouts' => -$movementTotals->only(self::PAYOUTS)->sum(),
                'transfers' => -($movementTotals['transfer_out'] ?? 0),
                'closing' => $movementTotals->sum(), 'pending_cash' => $pending['cash'] ?? null, 'pending_bank' => $pending['online'] ?? null,
                'can_reconcile' => $actor->can('distribution.reconcile'),
            ],
            'staff' => $canManage ? User::where('is_active', true)->orderBy('name')->get(['id','name']) : [],
            'salesmen' => $canManage ? app(DeliveryPlanningService::class)->activeSalesmen()->orderBy('name')->get(['id','name']) : [],
        ]);
    }

    public function accountExport(Request $request, int $id)
    {
        $account = $this->treasury->visible($request->user())->findOrFail($id);
        $entries = DB::table('treasury_entries')->where('account_id', $account->id)->orderBy('business_date')->orderBy('id')->cursor();
        return ReportCsv::download("treasury-account-{$account->id}.csv", ['Date','Movement','Reference','Source','Actor ID','Receipt','Payout','Balance'],
            (function () use ($entries) {
                $balance = 0;
                foreach ($entries as $e) {
                    $balance += (int) $e->paisa;
                    yield [$e->business_date, $e->kind, $e->reference, $e->source_type.' #'.$e->source_id, $e->actor_id,
                        Paisa::rupees(max(0, (int) $e->paisa)), Paisa::rupees(max(0, -(int) $e->paisa)), Paisa::rupees($balance)];
                }
            })());
    }

    public function saveAccount(Request $request)
    {
        $data = $request->validate(['id' => 'nullable|integer|exists:financial_accounts,id',
            'name' => ['required','string','max:120',Rule::unique('financial_accounts')->ignore((int) $request->input('id'))],
            'kind' => 'required|in:cash,petty_cash,bank,custody', 'custodian_id' => 'nullable|integer|exists:users,id',
            'opening' => 'required|numeric|decimal:0,2|min:0|max:999999999999', 'opening_reference' => 'nullable|string|max:200',
            'operators' => 'nullable|array', 'operators.*' => 'integer|distinct|exists:users,id']);
        $this->approvals->saveAccount($request->user(), $data);
        return back()->with('success', 'Account saved.');
    }

    public function limits(Request $request)
    {
        abort_unless($request->user()->hasRole('Super Admin'), 403);
        $amount = 'nullable|numeric|decimal:0,2|min:0|max:999999999999';
        if ($request->has('limits')) {
            $changes = $request->validate(['limits' => ['required', 'array:'.implode(',', FinanceApprovalService::KINDS)], 'limits.*' => $amount])['limits'];
        } else {
            $data = $request->validate(['kind' => ['required', Rule::in(FinanceApprovalService::KINDS)], 'amount' => $amount]);
            $changes = [$data['kind'] => $data['amount'] ?? null];
        }
        DB::transaction(function () use ($request, $changes) {
            $control = DB::table('treasury_control')->where('id', 1)->lockForUpdate()->first();
            $limits = json_decode($control->approval_limits ?? '{}', true, flags: JSON_THROW_ON_ERROR);
            foreach ($changes as $kind => $amount) {
                if ($amount === null) {
                    unset($limits[$kind]);
                } else {
                    $limits[$kind] = Paisa::from($amount);
                }
            }
            DB::table('treasury_control')->where('id', 1)->update(['approval_limits' => json_encode($limits, JSON_THROW_ON_ERROR)]);
            $this->treasury->event('control', 1, 'limits_updated', $request->user(), ['limits' => $changes]);
        }, 3);
        return back()->with('success', 'Delegated approval limits updated.');
    }

    public function approvals(Request $request)
    {
        $filters = $request->validate([
            'request_id' => ['nullable', 'integer', 'min:1'],
            'status' => ['nullable', Rule::in(['all', 'pending', 'approved', 'posted', 'rejected', 'cancelled'])],
            'search' => 'nullable|string|max:120',
            'type' => ['nullable', Rule::in(FinanceApprovalService::KINDS)],
        ]);
        $actor = $request->user();
        $requestId = (int) ($filters['request_id'] ?? 0) ?: null;
        $visible = $this->approvals->visibleRequests($actor);
        $summary = (clone $visible)->selectRaw('status, COUNT(*) as count, SUM(amount_paisa) as amount_paisa')
            ->groupBy('status')->toBase()->get()->keyBy('status')
            ->map(fn ($row) => ['count' => (int) $row->count, 'amount_paisa' => (int) $row->amount_paisa]);
        $status = $filters['status'] ?? (($summary->get('pending')['count'] ?? 0) ? 'pending' : 'all');
        $search = trim($filters['search'] ?? '');
        $items = (clone $visible)
            ->when($requestId, fn ($query, $id) => $query->whereKey($id))
            ->when(! $requestId, fn ($q) => $q
                ->when($status !== 'all', fn ($row) => $row->where('status', $status))
                ->when($filters['type'] ?? null, fn ($row, $type) => $row->where('kind', $type))
                ->when($search !== '', fn ($row) => $row->where(function ($match) use ($search) {
                    $term = '%'.$search.'%';
                    $match->where('payload->notes', 'like', $term)->orWhere('kind', 'like', $term)
                        ->orWhereRaw("REPLACE(kind, '_', ' ') LIKE ?", [$term]);
                    if (preg_match('/^#?([0-9]{1,18})$/', $search, $id)) $match->orWhere('id', (int) $id[1]);
                })))
            ->withCasts(['approved_at' => 'datetime', 'posted_at' => 'datetime'])
            ->latest('id')->paginate(25)->withQueryString();
        $names = User::whereKey($items->getCollection()->flatMap(fn ($item) => [$item->created_by, $item->approved_by, $item->posted_by])
            ->filter()->unique()->values()->all())->pluck('name', 'id');

        return Inertia::render('operations/finance-approvals', [
            'items' => $items->through(fn ($item) => $item->only([
                'id', 'kind', 'status', 'created_by', 'approved_by', 'posted_by', 'beneficiary_id', 'amount_paisa',
                'created_at', 'approved_at', 'posted_at', 'approval_note',
            ]) + [
                'has_evidence' => (bool) $item->evidence_path,
                'requester_name' => $names->get($item->created_by), 'reviewer_name' => $names->get($item->approved_by), 'poster_name' => $names->get($item->posted_by),
                'payload' => \Illuminate\Support\Arr::only($item->payload ?? [], ['date', 'notes', 'invoice_id', 'target_id', 'account_id', 'booking_id',
                    'employee_id', 'award_id', 'award_invoice_number', 'commission_role', 'collection_id', 'day_id', 'credit_id', 'share', 'method', 'direction', 'opening_id']),
            ]),
            'summary' => $summary,
            'filters' => ['status' => $status, 'search' => $search, 'type' => $filters['type'] ?? ''],
            'requestId' => $requestId,
            'accounts' => $this->treasury->options($actor), 'kinds' => $actor->can('manage-employee-commissions') ? FinanceApprovalService::KINDS
                : array_values(array_diff(FinanceApprovalService::KINDS, FinanceApprovalService::PRIVATE_KINDS)),
            'today' => now('Asia/Karachi')->toDateString(), 'actorId' => $actor->id,
        ]);
    }

    public function createApproval(Request $request)
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(FinanceApprovalService::KINDS)], 'request_key' => 'required|uuid',
            'date' => 'required|date_format:Y-m-d', 'notes' => 'required|string|max:1500',
            'amount' => 'nullable|numeric|decimal:0,2|min:0|max:999999999999', 'invoice_id' => 'nullable|integer',
            'day_id' => 'nullable|integer', 'credit_id' => 'nullable|integer', 'account_id' => 'nullable|integer', 'target_id' => 'nullable|integer',
            'employee_id' => 'nullable|integer', 'award_id' => 'nullable|integer|min:1|prohibited_unless:kind,commission_payout',
            'booking_id' => 'nullable|integer', 'commission_role' => 'nullable|in:booker,salesman',
            'collection_id' => 'nullable|integer',
            'method' => 'nullable|in:cash,bank', 'direction' => 'nullable|in:in,out',
            'evidence' => 'nullable|file|max:8192|mimes:pdf,png,jpg,jpeg,csv',
            'opening_csv' => 'nullable|file|max:1024|mimes:csv,txt',
            'share' => 'nullable|numeric|decimal:0,2|min:0|max:100',
            'items' => 'nullable|array|max:1000', 'items.*.sales_invoice_item_id' => 'required|integer|distinct',
            'items.*.quantity' => 'required|numeric|decimal:0,2|min:0|max:999999999999',
        ]);
        if ($data['kind'] === 'opening' && $request->hasFile('opening_csv')) {
            $data['imports'] = app(\App\Services\TreasuryOpeningImport::class)->parse($request->file('opening_csv'));
        }
        $path = $request->file('evidence')?->store('finance-evidence', 'local');
        try {
            $item = $this->approvals->request($request->user(), $data['kind'], collect($data)->except(['evidence','opening_csv','kind'])->all(), $path);
            if ($path && $item->evidence_path !== $path) Storage::disk('local')->delete($path);
        } catch (\Throwable $e) {
            if ($path) Storage::disk('local')->delete($path);
            throw $e;
        }
        return back()->with('success', 'Submitted for independent review.');
    }

    public function approve(Request $request, int $id)
    {
        $data = $request->validate(['note' => 'required|string|max:1500', 'approve' => 'required|boolean']);
        $this->approvals->approve($id, $request->user(), $data['note'], $data['approve']);
        return back()->with('success', 'Decision recorded.');
    }

    public function postApproval(Request $request, int $id)
    {
        $data = $request->validate(['reference' => 'nullable|string|max:200', 'account_id' => 'nullable|integer']);
        $this->approvals->post($id, $request->user(), $data['reference'] ?? null, isset($data['account_id']) ? (int) $data['account_id'] : null);
        return back()->with('success', 'Approved transaction posted.');
    }

    public function withdraw(Request $request, int $id)
    {
        $data = $request->validate(['reason' => 'required|string|max:1500']);
        $this->approvals->withdraw($id, $request->user(), $data['reason']);
        return back()->with('success', 'Request cancelled.');
    }

    public function evidence(Request $request, int $id)
    {
        $item = $this->approvals->visibleRequests($request->user())->findOrFail($id);
        abort_if(in_array($item->kind, FinanceApprovalService::PRIVATE_KINDS, true) && ! $request->user()->can('manage-employee-commissions'), 403);
        abort_unless($item->evidence_path, 404);
        return Storage::disk('local')->download($item->evidence_path);
    }

    public function reversalPreview(Request $request, InvoiceBalanceService $balance, string $kind, int $id)
    {
        $distribution = [];
        $financialAccounts = [];
        if ($kind === 'receipt') {
            $source = Payment::where('direction','in')->findOrFail($id);
            $label = $source->payment_number;
            $movements = DB::table('treasury_entries as entry')->join('financial_accounts as account','account.id','=','entry.account_id')
                ->whereIn('account.id', $this->treasury->visible($request->user())->select('id'))
                ->where('entry.source_type','payment')->where('entry.source_id',$id)->whereNull('entry.reverses_id')
                ->get(['account.name','entry.paisa']);
            foreach ($movements as $movement) $financialAccounts[] = ['name'=>$movement->name,'delta'=>-(int)$movement->paisa];
            $distribution = $source->allocations()->where('invoice_type','sales_invoice')->get(['invoice_id','amount'])->groupBy('invoice_id')
                ->map(fn ($rows) => Paisa::from($rows->sum('amount')))->all();
        } else {
            $source = SalesReturn::findOrFail($id);
            $label = $source->return_number;
            $distribution[$source->sales_invoice_id] = Paisa::from($source->total_amount);
        }
        $snapshots = $balance->sales()->whereKey(array_keys($distribution))->get()->keyBy('id');
        $invoices = SalesInvoice::whereKey(array_keys($distribution))->get()->map(function ($invoice) use ($distribution, $request, $snapshots) {
            $current = Paisa::from($snapshots[$invoice->id]->outstanding ?? 0);
            $delta = $distribution[$invoice->id];
            return [
                'id' => $invoice->id, 'number' => $invoice->invoice_number, 'outstanding' => $current,
                'projected' => $current + $delta, 'refund_credit' => $this->approvals->refundable($invoice),
                'commission_paisa' => $request->user()->can('manage-employee-commissions') ? (int) DB::table('commission_awards')->where('sales_invoice_id',$invoice->id)->sum('earned_paisa') : null,
                'dependencies' => $this->approvals->dependencies($invoice)->map(fn ($item) => $item->only(['id','kind','status','amount_paisa'])
                    + ['target_id'=>$item->payload['target_id'] ?? null])->values(),
            ];
        });
        return Inertia::render('operations/reversal-preview', ['label'=>$label,'kind'=>$kind,'invoices'=>$invoices,'accounts'=>$financialAccounts]);
    }

    public function daily(Request $request, InvoiceBalanceService $balances)
    {
        $finance = $request->routeIs('distribution.reconcile');
        $filters = $request->validate(['date' => 'nullable|date_format:Y-m-d', 'salesman_id' => 'nullable|integer|min:1', 'format' => 'nullable|in:csv,pdf']);
        $date = $filters['date'] ?? now('Asia/Karachi')->toDateString();
        $days = DB::table('collection_days as day')->join('users as actor','actor.id','=','day.salesman_id')
            ->where('day.business_date', $date)->when(! $finance, fn ($q) => $q->where('day.salesman_id', $request->user()->id))
            ->when($finance && ! empty($filters['salesman_id']), fn ($q) => $q->where('day.salesman_id', $filters['salesman_id']))
            ->orderBy('actor.name')->orderBy('day.revision')->get(['day.*','actor.name as salesman']);
        $reports = DB::table('delivery_collections as c')->join('sales_invoices as i','i.id','=','c.sales_invoice_id')->join('customers as customer','customer.id','=','i.customer_id')
            ->leftJoin('payments as p','p.id','=','c.payment_id')->whereIn('c.collection_day_id', $days->pluck('id'))->orderBy('c.id')
            ->select('c.*','i.invoice_number','i.total_amount','customer.name as customer','p.payment_number','p.status as payment_status');
        if ($finance) $reports->leftJoin('users as reviewer', 'reviewer.id', '=', 'c.reviewer_id')->addSelect('reviewer.name as reviewer', 'p.reference_no as posted_reference');
        $rows = $reports->get();
        $dues = $balances->sales()->whereKey($rows->pluck('sales_invoice_id')->unique()->all())->get()->keyBy('id');
        $rows->each(fn ($row) => $row->outstanding = $dues[$row->sales_invoice_id]->outstanding ?? 0);
        if (($filters['format'] ?? null) === 'pdf') {
            $salesman = ! $finance ? $request->user()->name : (isset($filters['salesman_id'])
                ? ($days->first()?->salesman ?? 'Selected salesman') : null);
            $data = app(DailyCollectionReport::class)->data($date, $finance, $days, $rows, $salesman);

            return app(ReportPdfRenderer::class)->render($data)->stream(($finance ? 'daily-reconciliation-' : 'daily-collections-').$date.'.pdf')
                ->header('Cache-Control', 'private, no-store');
        }
        if (($filters['format'] ?? null) === 'csv') {
            $labels = $days->keyBy('id');
            return ReportCsv::download("daily-collections-{$date}.csv",
                ['Business date','Salesman','Revision','Customer','Invoice','Total','Previous paid','Method','Reported','Verified','Shortage','Outstanding','Receipt','Status','Review notes'],
                $rows->map(fn ($row) => [$date,$labels[$row->collection_day_id]->salesman,$labels[$row->collection_day_id]->revision,
                    $row->customer,$row->invoice_number,$row->total_amount,Paisa::rupees($row->previous_paid_paisa),$row->method,
                    Paisa::rupees($row->reported_paisa),$row->verified_paisa !== null ? Paisa::rupees($row->verified_paisa) : '',
                    Paisa::rupees($row->shortage_paisa),max(0,(float) $row->outstanding),$row->payment_number,$row->payment_status ?? ($row->recorded_at ? 'recorded' : 'pending'), $row->review_note]));
        }
        if ($finance) {
            $postedOnDate = PaymentAllocation::query()->where('invoice_type', (new SalesInvoice)->getMorphClass())
                ->whereIn('invoice_id', $rows->pluck('sales_invoice_id')->unique())
                ->whereHas('payment', fn ($query) => $query->where('status', 'completed')->whereDate('payment_date', $date))
                ->selectRaw('invoice_id, SUM(amount) AS total')->groupBy('invoice_id')->pluck('total', 'invoice_id');
            $rows->each(function ($row) use ($postedOnDate) {
                $row->posted_on_date_paisa = Paisa::from($postedOnDate->get($row->sales_invoice_id));
                $row->created_at = $row->created_at ? \Illuminate\Support\Carbon::parse($row->created_at)->toISOString() : null;
                $row->recorded_at = $row->recorded_at ? \Illuminate\Support\Carbon::parse($row->recorded_at)->toISOString() : null;
            });
        }
        return Inertia::render('operations/daily-collections', [
            'days' => $days, 'rows' => $rows, 'date' => $date, 'finance' => $finance,
            'staff' => $finance ? app(DeliveryPlanningService::class)->salesmen()->orderBy('name')->get(['id','name']) : [],
            'accounts' => $finance ? $this->treasury->options($request->user()) : [],
            'salesmanId' => $finance ? ((int) ($filters['salesman_id'] ?? 0) ?: null) : null,
            'cashNotes' => $finance ? DeliveryCollectionService::CASH_NOTES : [],
            'canPost' => $finance && $request->user()->can('payments.manage'),
            'actorId' => $request->user()->id,
        ]);
    }

    public function report(Request $request, SalesInvoice $sale)
    {
        $data = $request->validate(['amount' => 'required|numeric|decimal:0,2|min:0.01|max:999999999999', 'method' => 'required|in:cash,online',
            'reference' => 'nullable|string|max:200', 'request_key' => 'required|uuid']);
        $this->collections->report($sale, $request->user(), $data);
        return back()->with('success', 'Collection reported; it will not affect the invoice until verified.');
    }

    public function submit(Request $request, int $id)
    {
        $this->collections->submit($id, $request->user());
        return back()->with('success', 'Day submitted to Finance.');
    }

    public function countCash(Request $request, int $id)
    {
        $data = $request->validate(['amount' => 'required|numeric|decimal:0,2|min:0|max:999999999999',
            'breakdown' => ['nullable', 'array:'.implode(',', [...DeliveryCollectionService::CASH_NOTES, 'coins'])],
            'breakdown.coins' => 'nullable|numeric|decimal:0,2|min:0|max:999999999999',
        ] + array_fill_keys(array_map(fn ($note) => 'breakdown.'.$note, DeliveryCollectionService::CASH_NOTES), 'nullable|integer|min:0|max:100000000'));
        $this->collections->countCash($id, $request->user(), Paisa::from($data['amount']), $data['breakdown'] ?? null);
        return back()->with('success', 'Physical cash count saved.');
    }

    public function recordMatchingCash(Request $request, int $id)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|min:1',
            'collection_ids' => 'required|array|min:1|max:100', 'collection_ids.*' => 'required|integer|min:1|distinct',
        ]);
        $count = $this->collections->recordMatchingCash($id, $request->user(), (int) $data['account_id'], $data['collection_ids']);
        return back()->with('success', $count ? "Posted {$count} verified cash receipt(s) against their invoices." : 'These cash receipts were already recorded.');
    }

    public function record(Request $request, int $id)
    {
        $data = $request->validate(['amount' => 'required|numeric|decimal:0,2|min:0|max:999999999999', 'account_id' => 'nullable|integer',
            'reference' => 'nullable|string|max:200', 'notes' => 'nullable|string|max:1500', 'shortage_approval_id' => 'nullable|integer']);
        $this->collections->record($id, $request->user(), $data);
        return back()->with('success', 'Verification recorded.');
    }

    public function close(Request $request, int $id)
    {
        $data = $request->validate(['notes' => 'nullable|string|max:1500']);
        $this->collections->close($id, $request->user(), $data['notes'] ?? '');
        return back()->with('success', 'Reconciliation closed.');
    }
}
