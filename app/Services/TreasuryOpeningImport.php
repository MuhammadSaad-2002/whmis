<?php

namespace App\Services;

use App\Models\{FinanceWorkItem, Payment, PurchaseInvoice, SalesInvoice, User};
use App\Support\Paisa;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Validator;

class TreasuryOpeningImport
{
    public function __construct(private TreasuryService $treasury) {}

    public function parse(UploadedFile $file): array
    {
        $header = ['type','reference','date','invoice_id','salesman_id','method','amount','payment_id','included_in_opening','employee_id','role','opening_account_id'];
        $handle = fopen($file->getRealPath(), 'r');
        if (! $handle) $this->treasury->fail('Unable to read the opening CSV.');
        try {
            $columns = fgetcsv($handle, 0, ',', '"', '');
            if (is_array($columns)) $columns[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $columns[0]);
            if ($columns !== $header) $this->treasury->fail('Opening CSV header must be: '.implode(',', $header));
            $rows = [];
            while (($fields = fgetcsv($handle, 0, ',', '"', '')) !== false) {
                if ($fields === [null]) continue;
                if (count($fields) !== count($header) || count($rows) >= 500) $this->treasury->fail('Use the expected columns and at most 500 opening rows.');
                $rows[] = array_map(fn ($v) => trim((string) $v) ?: null, array_combine($header, $fields));
            }
        } finally {
            fclose($handle);
        }
        return Validator::make(['rows' => $rows], [
            'rows' => 'array', 'rows.*.type' => 'required|in:collection,refund,supplier_outstanding,commission_due,cash_shortage', 'rows.*.reference' => 'required|string|distinct|max:125',
            'rows.*.date' => 'required|date_format:Y-m-d', 'rows.*.invoice_id' => 'required|integer|min:1', 'rows.*.salesman_id' => 'nullable|integer|min:1',
            'rows.*.method' => 'nullable|in:cash,online', 'rows.*.amount' => 'required|numeric|decimal:0,2|gt:0|max:999999999999',
            'rows.*.payment_id' => 'nullable|integer|distinct|min:1', 'rows.*.included_in_opening' => 'nullable|in:yes,no',
            'rows.*.employee_id' => 'nullable|integer|min:1', 'rows.*.role' => 'nullable|in:booker,salesman',
            'rows.*.opening_account_id' => 'nullable|integer|min:1',
        ])->validate()['rows'];
    }

    /** Called only from the locked opening batch after independent approval. */
    public function apply(FinanceWorkItem $opening, User $actor): void
    {
        $cutover = $opening->payload['date'];
        $rows = $opening->payload['imports'] ?? [];
        $openingAmounts = [];
        SalesInvoice::whereKey(collect($rows)->where('type', '!=', 'supplier_outstanding')->pluck('invoice_id')->map(fn ($x) => (int) $x)->all())
            ->orderBy('id')->lockForUpdate()->get(['id']);
        foreach ($rows as $row) {
            $type = $row['type'];
            $amount = Paisa::from($row['amount']);
            if ($row['date'] >= $cutover) $this->treasury->fail("Opening item {$row['reference']} is not pre-Treasury.");
            if ($type === 'supplier_outstanding') {
                $invoice = PurchaseInvoice::where('status', 'posted')->findOrFail($row['invoice_id']);
                $open = collect(app(PaymentService::class)->openInvoices($invoice->company))->firstWhere('id', $invoice->id);
                if ($amount !== Paisa::from($open['outstanding'] ?? 0)) $this->treasury->fail('Opening supplier amount must match the existing unsettled invoice.');
                $this->treasury->event('approval', $opening->id, 'supplier_matched', $actor, $row);
                continue;
            }
            $invoice = SalesInvoice::findOrFail($row['invoice_id']);
            if ($invoice->invoice_date->toDateString() >= $cutover) $this->treasury->fail('Opening items must refer to pre-Treasury invoices.');
            if ($type === 'commission_due') {
                $employee = \App\Models\Employee::whereKey((int) $row['employee_id'])->lockForUpdate()->first();
                if (! $employee || ! $row['role'] || ! $invoice->isPosted() || (float) app(InvoiceBalanceService::class)->sales()->whereKey($invoice->id)->value('outstanding') > 0
                    || DB::table('commission_awards')->where('sales_invoice_id',$invoice->id)->where('role',$row['role'])->where('employee_id',$employee->id)->exists()) {
                    $this->treasury->fail('An opening commission needs a unique employee, role, and fully settled historical invoice.');
                }
                app(CommissionService::class)->importOpening($opening, $invoice, $employee, $row, $amount);
                continue;
            }
            if ($type === 'refund') {
                if ($amount > app(FinanceApprovalService::class)->refundable($invoice)) $this->treasury->fail('Opening refund exceeds the invoice-linked credit.');
                $refund = FinanceWorkItem::create(['kind' => 'refund', 'status' => 'pending', 'request_key' => (string) Str::uuid(),
                    'created_by' => $opening->created_by, 'amount_paisa' => $amount, 'evidence_path' => $opening->evidence_path,
                    'payload' => ['date' => $cutover, 'invoice_id' => $invoice->id, 'customer_id' => $invoice->customer_id,
                        'opening_id' => $opening->id, 'notes' => 'Opening refund payable · '.$row['reference']]]);
                $this->treasury->event('approval', $refund->id, 'opening_refund', $actor, $row);
                continue;
            }
            if (! $invoice->isPosted() || ! $row['salesman_id'] || ! $row['method']) $this->treasury->fail('Opening collections need a posted invoice, Salesman and payment method.');
            $reporter = User::findOrFail($row['salesman_id']);
            abort_unless($reporter->hasRole('Salesman'), 422);
            $payment = ! empty($row['payment_id']) ? Payment::where('status', 'completed')->where('direction', 'in')->findOrFail($row['payment_id']) : null;
            $paymentTotal = $payment ? Paisa::from($invoice->paymentAllocations()->where('payment_id', $payment->id)->sum('amount')) : 0;
            if (($type === 'cash_shortage' && (! $payment || $row['method'] !== 'cash' || $paymentTotal < $amount))
                || ($payment && ($payment->payment_date->toDateString() >= $cutover || ($type !== 'cash_shortage' && $paymentTotal !== $amount)))) {
                $this->treasury->fail('The identified historical payment does not match that invoice and amount.');
            }
            if ($payment && DB::table('delivery_collections')->where('payment_id', $payment->id)->exists()) $this->treasury->fail('The historical payment is already linked to another collection.');
            $day = DB::table('collection_days')->where('salesman_id',$reporter->id)->where('business_date',$row['date'])->orderByDesc('revision')->first();
            $id = DB::table('collection_days')->insertGetId(['salesman_id' => $reporter->id, 'business_date' => $row['date'],
                'revision' => ($day->revision ?? 0) + 1, 'submitted_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            $included = $row['included_in_opening'] === 'yes';
            if ($included) {
                $accountId = (int) ($row['opening_account_id'] ?? 0);
                $account = \App\Models\FinancialAccount::find($accountId);
                $openingAmounts[$accountId] = ($openingAmounts[$accountId] ?? 0) + $amount;
                if (! $account || $openingAmounts[$accountId] > (int) $account->opening_paisa
                    || (($account->kind === 'bank') !== ($row['method'] === 'online'))
                    || ($account->kind === 'custody' && (int) $account->custodian_id !== $reporter->id)) {
                    $this->treasury->fail('Collections included in opening must match the method, custodian and available opening balance for their account.');
                }
            }
            $id = DB::table('delivery_collections')->insertGetId(['collection_day_id' => $id, 'sales_invoice_id' => $invoice->id,
                'reporter_id' => $reporter->id, 'request_key' => (string) Str::uuid(), 'method' => $row['method'], 'reference' => $row['reference'],
                'reported_paisa' => $amount, 'previous_paid_paisa' => Paisa::from($invoice->paymentAllocations()->whereHas('payment', fn ($q) => $q->where('status','completed'))->sum('amount')),
                'payment_id' => $payment?->id, 'included_in_opening' => $included, 'created_at' => now(),
                'shortage_paisa' => $type === 'cash_shortage' ? $amount : 0,
                'verified_paisa' => $type === 'cash_shortage' ? 0 : null, 'recorded_at' => $type === 'cash_shortage' ? now() : null,
                'reviewer_id' => $type === 'cash_shortage' ? $actor->id : null,
                'review_note' => $type === 'cash_shortage' ? 'Approved outstanding shortage at Treasury opening' : null]);
            if ($type === 'cash_shortage') DB::table('collection_days')->where('id', DB::table('delivery_collections')->where('id', $id)->value('collection_day_id'))
                ->update(['closed_at'=>now(), 'closed_by'=>$actor->id, 'variance_note'=>'Opening outstanding shortage']);
            $this->treasury->event('collection', $id, 'opening_collection', $actor, ['opening_id' => $opening->id] + $row);
        }
    }
}
