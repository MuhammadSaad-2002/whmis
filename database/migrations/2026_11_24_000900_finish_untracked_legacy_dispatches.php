<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('dispatches', 'historical_delivered_at')) {
            Schema::table('dispatches', fn (Blueprint $table) => $table->timestamp('historical_delivered_at')->nullable());
        }

        DB::transaction(function () {
            $numbers = array_map(fn (int $number) => sprintf('SI-2026-%04d', $number), range(1, 28));
            $invoices = DB::table('sales_invoices')->where('status', 'posted')->whereIn('invoice_number', $numbers);
            $ids = (clone $invoices)->orderBy('id')->lockForUpdate()->pluck('id');
            $markedAt = now();

            // Preserve the existing assignment, timestamps, and events. Never close actual custody or a real delivery.
            DB::table('dispatches')->whereIn('sales_invoice_id', $ids)
                ->whereIn('status', ['pending', 'picking'])->where('custody_required', false)
                ->whereNull(['custodian_id', 'handover_to_id', 'pickup_confirmed_at', 'historical_delivered_at'])
                ->whereNotExists(fn ($events) => $events->selectRaw('1')->from('dispatch_events')
                    ->whereColumn('dispatch_id', 'dispatches.id')->whereNotIn('action', ['assign', 'picking']))
                ->whereNotExists(fn ($collections) => $collections->selectRaw('1')->from('delivery_collections')
                    ->whereColumn('sales_invoice_id', 'dispatches.sales_invoice_id'))
                ->update(['status' => 'delivered', 'historical_delivered_at' => $markedAt]);

            DB::table('dispatches')->insertUsing(['sales_invoice_id', 'status', 'custody_required', 'historical_delivered_at'],
                $invoices->whereIn('id', $ids)->whereNotExists(fn ($dispatch) => $dispatch->selectRaw('1')->from('dispatches')
                    ->whereColumn('sales_invoice_id', 'sales_invoices.id'))
                    ->selectRaw("sales_invoices.id, 'delivered', 0, ?", [$markedAt]));
        }, 3);
    }

    public function down(): void
    {
        // Do not reopen delivered invoices or discard how they were marked.
    }
};
