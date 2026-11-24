<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Builder;

class FieldDeliveryOverview
{
    public function __construct(private readonly DeliveryCollectionService $collections) {}

    public function forDay(int $actorId, string $date, string $today): Builder
    {
        [$complete, $bindings] = $this->completion();

        return $this->collections->invoiceBalances()->join('dispatches as d', 'd.sales_invoice_id', '=', 'sales_invoices.id')
            ->addSelect('d.planned_date', 'd.status as dispatch_status', 'd.assigned_to', 'd.historical_delivered_at')
            ->selectRaw("{$complete} as is_complete", $bindings)
            ->where(fn ($rows) => $rows->where('d.assigned_to', $actorId)->orWhere('d.handover_to_id', $actorId))
            ->where(function ($rows) use ($date, $today) {
                $rows->where('d.planned_date', $date);
                if ($date === $today) {
                    $rows->orWhere(fn ($carryover) => $this->uncompleted($carryover)
                        ->where(fn ($dates) => $dates->where('d.planned_date', '<', $date)->orWhereNull('d.planned_date')));
                }
            });
    }

    public function uncompleted(Builder $query): Builder
    {
        [$complete, $bindings] = $this->completion();

        return $query->whereRaw("({$complete}) = 0", $bindings);
    }

    public function ordered(Builder $query): Builder
    {
        return $query->orderBy('is_complete')
            ->orderByRaw("CASE WHEN d.status = 'delivered' THEN 1 ELSE 0 END")
            ->orderByRaw('CASE WHEN d.planned_date IS NULL THEN 1 ELSE 0 END')
            ->orderBy('d.planned_date')->orderBy('d.id');
    }

    private function completion(): array
    {
        // A reported collection is not a posted receipt. Keep it visible while Finance still needs to verify it.
        $pending = $this->collections->pendingReportsForInvoice()->selectRaw('1')->where('reported_paisa', '>', 0);
        $settled = '('.InvoiceBalanceService::DUE_SQL.") <= 0 AND NOT EXISTS ({$pending->toSql()})";

        return ["CASE WHEN d.status = 'closed' OR (d.status = 'delivered' AND (d.historical_delivered_at IS NOT NULL OR ({$settled}))) THEN 1 ELSE 0 END", $pending->getBindings()];
    }
}
