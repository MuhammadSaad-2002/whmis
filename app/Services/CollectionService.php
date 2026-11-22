<?php

namespace App\Services;

use App\Models\{CollectionFollowUp, SalesInvoice, User};
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CollectionService
{
    public function followUp(SalesInvoice $invoice, array $data, User $actor): void
    {
        DB::transaction(function () use ($invoice, $data, $actor) {
            $invoice = SalesInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $balance = app(InvoiceBalanceService::class)->openSales()->where('sales_invoices.id', $invoice->id)->first();
            if (! $balance) throw ValidationException::withMessages(['outcome' => 'This invoice has no collectible balance. Refresh the worklist.']);
            app(OperationsAccess::class)->validateAssignee($data['assigned_to'] ?? null, 'collections.view', $actor);
            if ($data['outcome'] === 'promised' && (float) $data['promised_amount'] > (float) $balance->outstanding) {
                throw ValidationException::withMessages(['promised_amount' => 'The promise exceeds the current invoice balance.']);
            }
            $followUp = CollectionFollowUp::create([
                'sales_invoice_id' => $invoice->id, 'assigned_to' => $data['assigned_to'] ?? null,
                'outcome' => $data['outcome'], 'next_follow_up' => $data['next_follow_up'], 'notes' => $data['notes'],
                'promised_date' => $data['outcome'] === 'promised' ? $data['promised_date'] : null,
                'promised_amount' => $data['outcome'] === 'promised' ? $data['promised_amount'] : null,
                'created_by' => $actor->id,
            ]);
            AuditLogger::action($invoice, 'collection_follow_up', ['follow_up_id' => $followUp->id, 'outcome' => $data['outcome']]);
        });
    }
}
