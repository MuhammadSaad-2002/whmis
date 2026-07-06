<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PaymentService
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly LedgerService $ledger,
    ) {}

    /**
     * Manual receipt (customer) or payment (supplier) with optional
     * invoice allocations: [['invoice_type' => ..., 'invoice_id' => ..., 'amount' => ...]].
     */
    public function record(Customer|Company $party, array $data, array $allocations = []): Payment
    {
        return DB::transaction(function () use ($party, $data, $allocations) {
            $direction = $party instanceof Customer ? Payment::DIRECTION_IN : Payment::DIRECTION_OUT;

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

    public function cancel(Payment $payment): void
    {
        DB::transaction(function () use ($payment) {
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($payment->status === 'cancelled') {
                return;
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
        });
    }
}
