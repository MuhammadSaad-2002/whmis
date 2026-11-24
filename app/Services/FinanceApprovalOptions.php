<?php

namespace App\Services;

use App\Models\{Customer, Employee, Payment, SalesInvoice, User};
use App\Support\Paisa;
use Illuminate\Support\Facades\DB;

/** Read-side options for the maker form; posting always rechecks the live source. */
class FinanceApprovalOptions
{
    public function __construct(private FinanceApprovalService $approvals, private TreasuryService $treasury, private InvoiceBalanceService $balances, private CommissionService $commission, private LedgerService $ledger) {}

    public function accounts(User $actor): array
    {
        $total = DB::table('treasury_entries')->selectRaw('account_id, SUM(paisa) AS balance')->groupBy('account_id');
        return $this->treasury->visible($actor)->where('active', true)->leftJoinSub($total, 'balances', 'balances.account_id', '=', 'financial_accounts.id')
            ->orderBy('name')->get(['financial_accounts.id','name','kind','balances.balance'])->map(fn ($row) => [
                'id' => $row->id, 'name' => $row->name, 'kind' => $row->kind, 'balance' => (int) $row->balance,
            ])->all();
    }

    public function get(User $actor, string $kind, ?int $customer, ?int $award, ?string $date): array
    {
        abort_if(in_array($kind, FinanceApprovalService::PRIVATE_KINDS, true) && ! $actor->can('manage-employee-commissions'), 403);
        if ($kind === 'opening') {
            abort_unless($actor->can('treasury.manage'), 403);
            return ['opening' => $this->treasury->control()->locked_at ? [] : $this->approvals->openingSnapshot(), 'locked' => (bool) $this->treasury->control()->locked_at];
        }
        if ($kind === 'statement') {
            $accountIds = $this->treasury->visible($actor)->where('active', true)->select('financial_accounts.id');
            return ['statement' => DB::table('treasury_entries')->whereIn('account_id', $accountIds)
                ->where('business_date', '<=', $date ?? now('Asia/Karachi')->toDateString())
                ->selectRaw('account_id, SUM(paisa) AS book')->groupBy('account_id')->pluck('book','account_id')];
        }
        if (in_array($kind, ['refund','credit_apply','credit_writeoff','commission_share'], true)) {
            $sales = SalesInvoice::query()
                ->with(['customer' => fn ($query) => $query->withTrashed()->select('id','name')])
                ->orderByDesc('invoice_date')->orderByDesc('id');
            if ($kind === 'commission_share') {
                $sales->where('status', 'posted')->whereIn('id', DB::table('dispatches')->where('status', 'delivered')->select('sales_invoice_id'));
            } else {
                $sales->whereIn('status', ['posted','cancelled'])->whereHas('paymentAllocations.payment', fn ($q) => $q
                    ->where('direction','in')->where('status','completed')->where('method','!=','adjustment'))
                    ->where(fn ($q) => $q->where('status','cancelled')->orWhereHas('postedReturns')
                        ->orWhereIn('id', DB::table('payment_allocations')->where('invoice_type','sales_invoice')
                            ->select('invoice_id')->groupBy('invoice_id')->havingRaw('SUM(amount) > sales_invoices.total_amount')));
            }
            $rows = $sales->get(['id','customer_id','invoice_number','invoice_date','status','total_amount','booking_id'])
                ->map(function ($sale) use ($kind) {
                    if ($kind === 'commission_share') {
                        $facts = $this->commission->shareFacts(SalesInvoice::findOrFail($sale->id));
                        return $facts ? ['id' => $sale->id, 'label' => $sale->invoice_number, 'customer' => $sale->customer?->name, 'share' => $facts] : null;
                    }
                    $amount = $this->approvals->refundable($sale);
                    if ($kind === 'credit_writeoff') $amount = $sale->customer ? min($amount, max(0, -Paisa::from($this->ledger->outstanding($sale->customer)))) : 0;
                    return $amount > 0 ? ['id' => $sale->id, 'label' => $sale->invoice_number, 'customer' => $sale->customer?->name,
                        'customer_id' => $sale->customer_id, 'max' => $amount] : null;
                })->filter()->values();
            if ($kind === 'commission_share') return ['invoices' => $rows];
            $allocations = DB::table('payment_allocations')->selectRaw('payment_id, SUM(amount) AS allocated')->groupBy('payment_id');
            $receiptRows = Payment::query()->leftJoinSub($allocations, 'a', 'a.payment_id', '=', 'payments.id')->where('party_type','customer')
                ->where('status','completed')->where('direction','in')->where('method','!=','adjustment')
                ->whereRaw('payments.amount > COALESCE(a.allocated, 0)')->orderByDesc('payment_date')->get(['payments.*']);
            $parties = Customer::withTrashed()->whereKey($receiptRows->pluck('party_id')->unique()->all())->get()->keyBy('id');
            foreach ($receiptRows as $receipt) {
                if (! $party = $parties->get($receipt->party_id)) continue;
                $max = $this->approvals->unappliedReceiptCredit($receipt);
                if ($kind === 'credit_writeoff') $max = min($max, max(0, -Paisa::from($this->ledger->outstanding($party))));
                if ($max > 0) $rows->push(['id' => 'receipt:'.$receipt->id, 'label' => $receipt->payment_number.' (unapplied receipt)',
                    'customer' => $party->name, 'customer_id' => $party->id, 'source_payment_id' => $receipt->id, 'max' => $max]);
            }
            $customers = $rows->groupBy('customer_id')->map(function ($group, $id) use ($kind) {
                $max = $group->sum('max');
                if ($kind === 'credit_writeoff' && ($party = Customer::withTrashed()->find($id))) $max = min($max, max(0, -Paisa::from($this->ledger->outstanding($party))));
                return ['id' => (int) $id, 'label' => $group->first()['customer'] ?? 'Archived customer', 'max' => $max];
            })->sortBy('label')->values();
            $targets = $kind === 'credit_apply' && $customer ? $this->balances->openSales()->where('sales_invoices.customer_id', $customer)
                ->orderBy('invoice_date')->get()->map(fn ($row) => ['id' => $row->id, 'label' => $row->invoice_number, 'max' => Paisa::from($row->outstanding)]) : [];

            return ['customers' => $customers, 'invoices' => $rows, 'targets' => $targets];
        }
        if (in_array($kind, ['close_variance','shortage','shortage_repayment','shortage_receipt_reverse','shortage_commission_offset'], true)) {
            if ($kind === 'shortage_receipt_reverse') abort_unless($actor->can('payments.manage'), 403);
            if ($kind === 'close_variance') {
                $cash = DB::table('delivery_collections')->where('method','cash')->groupBy('collection_day_id')
                    ->selectRaw('collection_day_id, SUM(reported_paisa) AS reported, SUM(verified_paisa) AS verified');
                return ['days' => DB::table('collection_days as d')->join('users as u','u.id','=','d.salesman_id')->joinSub($cash,'totals','totals.collection_day_id','=','d.id')
                    ->whereNotNull('d.submitted_at')->whereNull('d.closed_at')->whereNotNull('d.counted_cash_paisa')->where('d.salesman_id','!=',$actor->id)
                    ->whereNotIn('d.id', DB::table('delivery_collections')->whereNull('recorded_at')->select('collection_day_id'))
                    ->where(fn ($q) => $q->whereColumn('d.counted_cash_paisa','!=','totals.reported')->orWhereColumn('d.counted_cash_paisa','!=','totals.verified'))
                    ->orderByDesc('d.business_date')->get(['d.id','d.business_date','d.counted_cash_paisa','u.name','totals.reported','totals.verified'])
                    ->map(fn ($d) => ['id' => $d->id, 'label' => $d->name.' · '.$d->business_date, 'date' => $d->business_date,
                        'reported' => (int) $d->reported, 'verified' => (int) $d->verified, 'counted' => (int) $d->counted_cash_paisa])];
            }
            $rows = DB::table('delivery_collections as c')->join('collection_days as d','d.id','=','c.collection_day_id')
                ->join('users as u','u.id','=','c.reporter_id')->join('sales_invoices as i','i.id','=','c.sales_invoice_id')
                ->where('c.method','cash')->orderByDesc('d.business_date')->orderByDesc('c.id')
                ->when($kind === 'shortage',
                    fn ($q) => $q->whereNotNull('d.submitted_at')->whereNull('d.closed_at')->whereNotNull('d.counted_cash_paisa')
                        ->whereNull('c.recorded_at')->where('d.salesman_id','!=',$actor->id),
                    fn ($q) => $q->where('c.shortage_paisa','>',0))->get(['c.*','d.business_date','d.counted_cash_paisa','u.name','i.invoice_number']);
            return ['collections' => $rows->map(function ($row) use ($kind) {
                $max = $kind === 'shortage' ? $this->approvals->shortageAvailable((object) ['id' => $row->collection_day_id,'counted_cash_paisa' => $row->counted_cash_paisa], $row)
                    : $this->approvals->shortageBalance($row);
                if ($kind === 'shortage_commission_offset' && $max > 0) {
                    $employee = Employee::where('user_id', $row->reporter_id)->value('id');
                    $max = $employee ? min($max, $this->commission->employeeFinance($employee)['due']) : 0;
                }
                if ($max <= 0 || ($kind === 'shortage_receipt_reverse' && $max !== (int) $row->shortage_paisa)) return null;
                return ['id' => $row->id,'label' => $row->invoice_number.' · '.$row->name, 'date' => $row->business_date, 'max' => $max];
            })->filter()->values()];
        }
        if (in_array($kind, ['refund_recovery','refund_correction','credit_release','shortage_repayment_reverse'], true)) {
            $original = match ($kind) { 'credit_release' => 'credit_apply', 'shortage_repayment_reverse' => 'shortage_repayment', default => 'refund' };
            return ['references' => $this->approvals->visibleRequests($actor)->where('kind', $original)->where('status','posted')->latest('id')->get()
                ->map(function ($item) use ($kind, $original) {
                    $remaining = $original === 'refund' ? $this->approvals->remainingRefund($item) : (int) $item->amount_paisa;
                    if ($remaining <= 0) return null;
                    $invoice = isset($item->payload['invoice_id']) ? SalesInvoice::with('customer:id,name')->find($item->payload['invoice_id']) : null;
                    $receipt = ! empty($item->payload['source_payment_id']) ? Payment::find($item->payload['source_payment_id']) : null;
                    $available = $invoice ? $this->approvals->refundable($invoice) : ($receipt ? $this->approvals->unappliedReceiptCredit($receipt) : 0);
                    return ['id' => $item->id,'label' => '#'.$item->id.($invoice ? ' · '.$invoice->invoice_number.' · '.$invoice->customer?->name : ($receipt ? ' · '.$receipt->payment_number : '')),
                        'max' => $remaining, 'correction_max' => $kind === 'refund_correction' ? $remaining + $available : null,
                        'account' => $item->payload['account_id'] ?? null];
                })->filter()->values()];
        }
        if ($kind === 'commission_cap' || in_array($kind, FinanceApprovalService::EMPLOYEE_KINDS, true)) {
            $rows = Employee::orderBy('name')->when($kind === 'commission_cap', fn ($q) => $q->where('status','active'))
                ->get(['id','name'])->map(function ($employee) use ($kind, $award) {
                    $facts = $kind === 'commission_cap' ? [] : $this->commission->employeeFinance($employee->id, $award);
                    return ['id' => $employee->id, 'label' => $employee->name] + $facts;
                })->filter(fn ($employee) => match ($kind) {
                    'commission_payout' => $employee['award_due'] > 0,
                    'recovery_hold' => $employee['recovery'] > 0 && ! $employee['held'],
                    'recovery_resume' => $employee['held'],
                    'recovery_repayment','recovery_waiver' => $employee['recovery'] > 0,
                    default => true,
                })->values();
            return ['employees' => $rows];
        }
        return [];
    }
}
