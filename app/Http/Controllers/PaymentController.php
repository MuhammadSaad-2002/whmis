<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class PaymentController extends Controller
{
    public function __construct(private readonly PaymentService $payments) {}

    public function index(Request $request)
    {
        $payments = Payment::query()
            ->with('party')
            ->when($request->direction, fn ($q, $direction) => $q->where('direction', $direction))
            ->when($request->method, fn ($q, $method) => $q->where('method', $method))
            ->when($request->search, fn ($q, $search) => $q->where('payment_number', 'like', "%{$search}%"))
            ->when($request->from, fn ($q, $from) => $q->whereDate('payment_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('payment_date', '<=', $to))
            ->latest('payment_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('payments/index', [
            'payments' => $payments,
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name']),
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('direction', 'method', 'search', 'from', 'to'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'party_type' => ['required', 'in:customer,company'],
            'party_id' => ['required', 'integer'],
            'method' => ['required', 'in:cash,bank,cheque,online,adjustment'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'payment_date' => ['required', 'date'],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'cheque_number' => ['nullable', 'string', 'max:100'],
            'cheque_date' => ['nullable', 'date'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:500'],
            'allocations' => ['nullable', 'array'],
            'allocations.*.invoice_type' => ['required_with:allocations', 'in:sales_invoice,purchase_invoice'],
            'allocations.*.invoice_id' => ['required_with:allocations', 'integer'],
            'allocations.*.amount' => ['required_with:allocations', 'numeric', 'min:0'],
        ]);

        $party = $data['party_type'] === 'customer'
            ? Customer::findOrFail($data['party_id'])
            : Company::findOrFail($data['party_id']);

        $allocations = $data['allocations'] ?? [];
        $allocatedTotal = array_sum(array_column($allocations, 'amount'));
        if ($allocatedTotal > (float) $data['amount'] + 0.01) {
            return back()->with('error', 'Allocated amount exceeds the payment amount.');
        }

        $payment = $this->payments->record($party, $data, $allocations);

        return back()->with('success', "{$payment->payment_number} recorded.");
    }

    public function cancel(Payment $payment)
    {
        if ($payment->status === 'cancelled') {
            return back()->with('error', 'Payment is already cancelled.');
        }

        $this->payments->cancel($payment);

        return back()->with('success', "{$payment->payment_number} cancelled and reversed.");
    }
}
