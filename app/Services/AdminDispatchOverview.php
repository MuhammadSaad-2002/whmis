<?php

namespace App\Services;

use App\Models\{Customer, SalesInvoice};
use Illuminate\Database\Eloquent\Builder;

/** Read models for the Admin dispatch pipeline; no delivery transitions are performed here. */
class AdminDispatchOverview
{
    public const STAGES = [
        'untracked' => ['untracked'],
        'pending' => ['pending'],
        'picking' => ['picking'],
        'packed' => ['packed'],
        'dispatched' => ['dispatched', 'partial'],
        'delivered' => ['delivered'],
        'failed' => ['failed', 'closed'],
    ];

    public function query(array $filters): Builder
    {
        return SalesInvoice::query()->where('sales_invoices.status', 'posted')
            ->leftJoin('dispatches', 'dispatches.sales_invoice_id', '=', 'sales_invoices.id')
            ->when($filters['assignee_id'] ?? null, fn ($q, $id) => $q->where('dispatches.assigned_to', $id))
            ->when($filters['date'] ?? null, fn ($q, $date) => $q->where('dispatches.planned_date', $date))
            ->when($filters['search'] ?? null, fn ($q, $search) => $q->where(fn ($s) => $s->where('invoice_number', 'like', '%'.$search.'%')
                ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', '%'.$search.'%'))));
    }

    public function forStatuses(Builder $query, array $statuses): Builder
    {
        return $statuses === ['untracked']
            ? $query->whereNull('dispatches.status')
            : $query->whereIn('dispatches.status', $statuses);
    }

    public function rows(Builder $query): Builder
    {
        return $query->leftJoin('users as delivery_staff', 'delivery_staff.id', '=', 'dispatches.assigned_to')
            ->select('sales_invoices.id', 'sales_invoices.invoice_number', 'sales_invoices.invoice_date', 'sales_invoices.customer_id', 'sales_invoices.total_amount')
            ->addSelect('dispatches.planned_date', 'dispatches.updated_at as last_activity_at', 'delivery_staff.name as assignee')
            ->selectRaw("COALESCE(dispatches.status, 'untracked') as dispatch_status")
            ->with('customer:id,name,city')->withCount('items')->withCasts(['last_activity_at' => 'datetime']);
    }

    public function ordered(Builder $query, array $filters): Builder
    {
        $sort = $filters['sort'] ?? 'activity';
        $direction = $filters['dir'] ?? ($sort === 'customer' ? 'asc' : 'desc');
        $column = match ($sort) {
            'number' => 'sales_invoices.invoice_number',
            'date' => 'sales_invoices.invoice_date',
            'value' => 'sales_invoices.total_amount',
            'customer' => Customer::select('name')->whereColumn('customers.id', 'sales_invoices.customer_id'),
            default => 'dispatches.updated_at',
        };

        if ($sort === 'activity') $query->orderByRaw('CASE WHEN dispatches.updated_at IS NULL THEN 1 ELSE 0 END');

        return $query->orderBy($column, $direction)->orderByDesc('sales_invoices.id');
    }

    public function pipeline(Builder $query, string $today): array
    {
        $totals = (clone $query)->selectRaw("COALESCE(dispatches.status, 'untracked') as dispatch_status,
            COUNT(*) as invoice_count, SUM(sales_invoices.total_amount) as value,
            SUM(CASE WHEN dispatches.planned_date < ? AND dispatches.status NOT IN ('delivered','closed') THEN 1 ELSE 0 END) AS overdue_count", [$today])
            ->groupBy('dispatches.status')->toBase()->get()->keyBy('dispatch_status');

        return collect(self::STAGES)->map(function ($statuses) use ($totals) {
            $rows = $totals->only($statuses);

            return ['count' => (int) $rows->sum('invoice_count'), 'value' => (float) $rows->sum('value'), 'overdue' => (int) $rows->sum('overdue_count')];
        })->all();
    }

    public function board(Builder $query, array $filters): array
    {
        $stages = self::STAGES;
        if ($selected = ($filters['stage'] ?? null)) {
            $stages = [$selected => self::STAGES[$selected]];
        } elseif ($status = ($filters['status'] ?? null)) {
            $stages = collect(self::STAGES)->filter(fn ($statuses) => in_array($status, $statuses, true))
                ->map(fn () => [$status])->all();
        }

        return collect($stages)->map(fn ($statuses) => $this->ordered($this->forStatuses($this->rows(clone $query), $statuses), [])
            ->paginate(8, ['*'], 'board_page', 1))->all();
    }
}
