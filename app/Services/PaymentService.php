<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SalesInvoice;
use App\Models\FinancialAccount;
use App\Models\FinanceWorkItem;
use App\Support\Paisa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PaymentService
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly LedgerService $ledger,
    ) {}

    /** Invoice balances available for allocation, net of linked return credits. */
    public function openInvoices(Customer|Company $party): array
    {
        if ($party instanceof Customer) {
            return app(InvoiceBalanceService::class)->openSales()->where('customer_id', $party->id)
                ->orderBy('sales_invoices.invoice_date')->orderBy('sales_invoices.id')->get()->map(fn ($invoice) => [
                    'id' => $invoice->id, 'invoice_type' => $invoice->getMorphClass(),
                    'invoice_number' => $invoice->invoice_number,
                    'invoice_date' => $invoice->invoice_date->toDateString(),
                    'total_amount' => (float) $invoice->total_amount,
                    'outstanding' => (float) $invoice->outstanding,
                ])->all();
        }
        $morph = (new PurchaseInvoice)->getMorphClass();
        $invoices = PurchaseInvoice::query()
            ->where('company_id', $party->id)
            ->where('status', 'posted')
            ->orderBy('invoice_date')
            ->orderBy('id')
            ->get(['id', 'invoice_number', 'invoice_date', 'total_amount']);

        $allocated = PaymentAllocation::where('invoice_type', $morph)
            ->whereIn('invoice_id', $invoices->pluck('id'))
            ->whereHas('payment', fn ($q) => $q->where('status', 'completed'))
            ->selectRaw('invoice_id, SUM(amount) as total')
            ->groupBy('invoice_id')
            ->pluck('total', 'invoice_id');

        // Purchase returns post immediately.
        $returned = PurchaseReturn::whereIn('purchase_invoice_id', $invoices->pluck('id'))
            ->selectRaw('purchase_invoice_id, SUM(total_amount) as total')
            ->groupBy('purchase_invoice_id')
            ->pluck('total', 'purchase_invoice_id');

        return $invoices->map(fn ($invoice) => [
            'id' => $invoice->id,
            'invoice_type' => $morph,
            'invoice_number' => $invoice->invoice_number,
            'invoice_date' => $invoice->invoice_date->toDateString(),
            'total_amount' => (float) $invoice->total_amount,
            'outstanding' => round((float) $invoice->total_amount
                - (float) ($allocated[$invoice->id] ?? 0)
                - (float) ($returned[$invoice->id] ?? 0), 2),
        ])->filter(fn ($row) => $row['outstanding'] > 0)->values()->all();
    }

    /** Recheck form allocations against live dues before recording any money. */
    public function recordManual(Customer|Company $party, array $data, array $allocations): Payment
    {
        return DB::transaction(function () use ($party, $data, $allocations) {
            $allocations = array_filter($allocations, fn ($row) => (float) $row['amount'] > 0);
            if ($allocations !== []) {
                $isCustomer = $party instanceof Customer;
                $model = $isCustomer ? new SalesInvoice : new PurchaseInvoice;
                $ids = array_column($allocations, 'invoice_id');
                // Serialize concurrent manual allocations to the same invoices.
                $model->newQuery()->where($isCustomer ? 'customer_id' : 'company_id', $party->id)
                    ->whereKey(array_map('intval', $ids))->orderBy('id')->lockForUpdate()->get(['id']);
                $open = collect($this->openInvoices($party))->keyBy('id');

                $total = 0;
                $byInvoice = [];
                foreach ($allocations as $allocation) {
                    $id = $allocation['invoice_id'];
                    $cents = (int) round((float) $allocation['amount'] * 100);
                    $total += $cents;
                    $byInvoice[$id] = ($byInvoice[$id] ?? 0) + $cents;
                    if ($allocation['invoice_type'] !== $model->getMorphClass()
                        || ! $open->has($id)
                        || $byInvoice[$id] > (int) round($open[$id]['outstanding'] * 100)) {
                        throw ValidationException::withMessages([
                            'allocations' => 'An invoice is no longer open for this party or the allocation exceeds its balance. Refresh the invoice amounts and try again.',
                        ]);
                    }
                }
                if ($total > (int) round((float) $data['amount'] * 100)) {
                    throw ValidationException::withMessages(['allocations' => 'Allocated amount exceeds the payment amount.']);
                }
            }

            return $this->record($party, $data, $allocations);
        }, 3);
    }

    /**
     * Manual receipt (customer) or payment (supplier) with optional
     * invoice allocations: [['invoice_type' => ..., 'invoice_id' => ..., 'amount' => ...]].
     */
    public function record(Customer|Company $party, array $data, array $allocations = []): Payment
    {
        return DB::transaction(function () use ($party, $data, $allocations) {
            $direction = $party instanceof Customer ? Payment::DIRECTION_IN : Payment::DIRECTION_OUT;
            $treasury = app(TreasuryService::class);
            $account = null;
            if ($treasury->live() || ! empty($data['financial_account_id'])) {
                $treasury->assertDate($data['payment_date']);
                if ($data['method'] === 'adjustment') $treasury->fail('Use the authorized correction workflow for non-cash adjustments.');
                $account = $treasury->account((int) ($data['financial_account_id'] ?? 0), Auth::user(), $data['method']);
            }

            $payment = Payment::create([
                'payment_number' => $this->numbers->next($direction === 'in' ? 'payment_in' : 'payment_out'),
                'party_type' => $party->getMorphClass(),
                'party_id' => $party->getKey(),
                'direction' => $direction,
                'method' => $data['method'],
                'amount' => $data['amount'],
                'payment_date' => $data['payment_date'],
                'bank_name' => $data['bank_name'] ?? null,
                'cheque_number' => $data['cheque_number'] ?? null,
                'cheque_date' => $data['cheque_date'] ?? null,
                'reference_no' => $data['reference_no'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($allocations as $allocation) {
                if ((float) ($allocation['amount'] ?? 0) <= 0) {
                    continue;
                }
                $payment->allocations()->create([
                    'invoice_type' => $allocation['invoice_type'],
                    'invoice_id' => $allocation['invoice_id'],
                    'amount' => $allocation['amount'],
                ]);
            }

            // Receipt reduces receivable (credit); supplier payment reduces payable (debit).
            $this->ledger->post(
                $party,
                $direction === 'in' ? 'receipt' : 'payment',
                $data['payment_date'],
                $direction === 'in' ? 0 : (float) $data['amount'],
                $direction === 'in' ? (float) $data['amount'] : 0,
                $payment,
                ucfirst($direction === 'in' ? 'Receipt' : 'Payment')." {$payment->payment_number}"
                    .(! empty($data['notes']) ? " — {$data['notes']}" : ''),
            );

            if ($account) {
                $physical = $data['_verified_cash_paisa'] ?? Paisa::from($data['amount']);
                if ($physical > 0) $treasury->entry($account, $direction === 'in' ? 'receipt' : 'supplier_payment', 'payment', $payment->id,
                    $physical * ($direction === 'in' ? 1 : -1), $data['payment_date'], Auth::user(), $data['reference_no'] ?? null);
            }
            if ($direction === 'in') {
                $ids = collect($allocations)->where('invoice_type', (new SalesInvoice)->getMorphClass())->pluck('invoice_id')->unique()->all();
                foreach (SalesInvoice::whereKey($ids)->orderBy('id')->get() as $sale) app(CommissionService::class)->recalculate($sale);
            }

            return $payment;
        });
    }

    /**
     * Cash invoices settle themselves: create the matching payment,
     * allocation, and ledger entry when the invoice posts.
     */
    public function createAutoSettlement(SalesInvoice|PurchaseInvoice $invoice, Customer|Company $party): Payment
    {
        $payment = $this->record($party, [
            'method' => 'cash',
            'amount' => (float) $invoice->total_amount,
            'payment_date' => $invoice->invoice_date,
            'notes' => "Cash settlement of {$invoice->invoice_number}",
            'financial_account_id' => $invoice instanceof PurchaseInvoice ? $invoice->financial_account_id : null,
        ], [[
            'invoice_type' => $invoice->getMorphClass(),
            'invoice_id' => $invoice->id,
            'amount' => (float) $invoice->total_amount,
        ]]);

        return $payment;
    }

    public function reverseAutoSettlement(SalesInvoice|PurchaseInvoice $invoice, Customer|Company $party): void
    {
        $payments = Payment::where('party_type', $party->getMorphClass())
            ->where('party_id', $party->getKey())
            ->where('status', 'completed')
            ->whereHas('allocations', function ($q) use ($invoice) {
                $q->where('invoice_type', $invoice->getMorphClass())
                    ->where('invoice_id', $invoice->id);
            })
            ->where('notes', 'like', 'Cash settlement%')
            ->get();

        foreach ($payments as $payment) {
            $this->cancel($payment);
        }
    }

    public function cancel(Payment $payment, ?FinanceWorkItem $correction = null): void
    {
        DB::transaction(function () use ($payment, $correction) {
            $invoiceIds = $payment->allocations()->where('invoice_type', (new SalesInvoice)->getMorphClass())->pluck('invoice_id');
            SalesInvoice::whereKey($invoiceIds->all())->orderBy('id')->lockForUpdate()->get(['id']);
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($payment->status === 'cancelled') {
                return;
            }
            foreach (SalesInvoice::whereKey($invoiceIds->all())->get() as $invoice) {
                app(FinanceApprovalService::class)->assertUnconsumed($invoice);
            }
            $reported = DB::table('delivery_collections')->where('payment_id', $payment->id)->where('shortage_paisa', '>', 0)->lockForUpdate()->first();
            if ($reported) {
                if ($correction?->kind !== 'shortage_receipt_reverse' || $correction->status !== 'approved'
                    || (int) ($correction->payload['collection_id'] ?? 0) !== (int) $reported->id
                    || app(FinanceApprovalService::class)->shortageBalance($reported) !== (int) $reported->shortage_paisa) {
                    app(TreasuryService::class)->fail('A shortage-backed receipt needs a matching approved correction and no prior employee repayments.');
                }
            }
            if (DB::table('delivery_collections as c')->join('finance_work_events as e', 'e.source_id', '=', 'c.id')
                ->where('c.payment_id', $payment->id)->where('e.source_type', 'collection')->where('e.action', 'opening_collection')->exists()) {
                app(TreasuryService::class)->fail('The receipt is linked to a locked opening collection; correct it with Finance before reversal.');
            }

            $payment->update(['status' => 'cancelled']);

            $isIn = $payment->direction === Payment::DIRECTION_IN;
            $this->ledger->post(
                $payment->party,
                'adjustment',
                now()->toDateString(),
                $isIn ? (float) $payment->amount : 0,
                $isIn ? 0 : (float) $payment->amount,
                $payment,
                "Cancellation of {$payment->payment_number}",
            );
            $treasury = app(TreasuryService::class);
            foreach (DB::table('treasury_entries')->where('source_type', 'payment')->where('source_id', $payment->id)->whereNull('reverses_id')->orderBy('account_id')->get() as $entry) {
                $account = $treasury->account((int) $entry->account_id, Auth::user());
                $treasury->entry($account, 'reversal', 'payment', $payment->id, -(int) $entry->paisa,
                    now('Asia/Karachi')->toDateString(), Auth::user(), $entry->reference, (int) $entry->id);
            }
            foreach (SalesInvoice::whereKey($invoiceIds->all())->orderBy('id')->get() as $sale) app(CommissionService::class)->recalculate($sale);
        }, 3);
    }
}
