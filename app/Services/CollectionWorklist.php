<?php

namespace App\Services;

use App\Support\Paisa;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class CollectionWorklist
{
    public const AGING = ['not_due', 'days_1_30', 'days_31_60', 'days_61_90', 'days_90_plus'];

    public const FLAGS = ['promised', 'broken', 'no_follow_up'];

    private const DUE = 'COALESCE(sales_invoices.due_date, sales_invoices.invoice_date)';

    public function __construct(private readonly InvoiceBalanceService $balances) {}

    public function base(Carbon $today): Builder
    {
        $activity = DB::table('collection_follow_ups')->selectRaw(
            "sales_invoice_id, MAX(id) AS latest_id, MAX(CASE WHEN outcome = 'promised' THEN id END) AS promise_id"
        )->groupBy('sales_invoice_id');
        $due = self::DUE;
        $date = fn (int $days) => $today->copy()->subDays($days)->toDateString();

        $open = $this->balances->openSales()
            ->leftJoin('customers as c', 'c.id', '=', 'sales_invoices.customer_id')
            ->leftJoinSub($activity, 'activity', 'activity.sales_invoice_id', '=', 'sales_invoices.id')
            ->leftJoin('collection_follow_ups as latest', 'latest.id', '=', 'activity.latest_id')
            ->leftJoin('collection_follow_ups as promise', 'promise.id', '=', 'activity.promise_id')
            ->select([
                'sales_invoices.id', 'sales_invoices.invoice_number', 'sales_invoices.invoice_date',
                'sales_invoices.due_date', 'sales_invoices.total_amount', 'sales_invoices.customer_id',
                'c.name as customer_name', 'c.city as customer_city', 'c.phone as customer_phone', 'c.deleted_at as archived_at',
                'latest.id as follow_up_id', 'latest.outcome as outcome', 'latest.created_at as last_contact_at',
                'latest.next_follow_up', 'promise.promised_amount', 'promise.promised_date',
            ])
            ->selectRaw("$due AS due_on, COALESCE(paid.total, 0) AS paid_amount, COALESCE(credited.total, 0) AS return_credit,
                COALESCE(applied.paisa, 0) / 100.0 AS applied_credit, ".InvoiceBalanceService::DUE_SQL.' AS outstanding')
            ->selectRaw("CASE WHEN $due >= ? THEN 'not_due' WHEN $due >= ? THEN 'days_1_30'
                WHEN $due >= ? THEN 'days_31_60' WHEN $due >= ? THEN 'days_61_90' ELSE 'days_90_plus' END AS aging_bucket",
                [$date(0), $date(30), $date(60), $date(90)])
            ->selectRaw("CASE WHEN latest.id IS NULL THEN 'no_follow_up'
                WHEN promise.promised_date < ? THEN 'broken' WHEN promise.promised_date IS NOT NULL THEN 'promised' END AS flag", [$date(0)]);

        return DB::query()->fromSub($open->toBase(), 'open_invoices');
    }

    public function filtered(Builder $open, array $filters, Carbon $today): Builder
    {
        $search = trim((string) ($filters['search'] ?? ''));

        return (clone $open)
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('invoice_number', 'like', "%{$search}%")
                ->orWhere('customer_name', 'like', "%{$search}%")))
            ->when($filters['flag'] ?? null, fn ($q, $flag) => $q->where('flag', $flag))
            ->when($filters['bucket'] ?? null, fn ($q, $bucket) => match ($bucket) {
                'overdue' => $q->where('aging_bucket', '!=', 'not_due'),
                'follow_up' => $q->where('next_follow_up', '<=', $today->toDateString()),
                'all' => $q,
                default => $q->where('aging_bucket', $bucket),
            });
    }

    public function ordered(Builder $rows, array $filters): Builder
    {
        return $rows->when(($filters['sort'] ?? '') === 'balance', fn ($q) => $q->orderByDesc('outstanding'))
            ->orderBy('due_on')->orderBy('id');
    }

    public function summary(Builder $open): array
    {
        return $this->summarise($this->aggregate(clone $open)->selectRaw('COUNT(DISTINCT customer_id) AS customers')->first());
    }

    /** In customer view, paginate customers so one group is never split across pages. */
    public function page(Builder $open, Builder $filtered, array $filters): array
    {
        if (($filters['view'] ?? '') === 'invoice') {
            return ['invoices' => $this->ordered(clone $filtered, $filters)->paginate(20)->withQueryString()
                ->through($this->invoice(...)), 'customers' => []];
        }

        $page = (clone $filtered)->select('customer_id')->selectRaw('MIN(due_on) AS oldest_due, SUM(outstanding) AS shown')
            ->groupBy('customer_id')
            ->when(($filters['sort'] ?? '') === 'balance', fn ($q) => $q->orderByDesc('shown'))
            ->orderBy('oldest_due')->orderBy('customer_id')->paginate(10)->withQueryString();
        $ids = $page->pluck('customer_id');
        $profiles = $ids->isEmpty() ? collect() : $this->aggregate((clone $open)->whereIn('customer_id', $ids))
            ->addSelect('customer_id')->groupBy('customer_id')->get()->keyBy('customer_id');
        $rows = $ids->isEmpty() ? collect() : $this->ordered((clone $filtered)->whereIn('customer_id', $ids), $filters)->get()
            ->map($this->invoice(...))->groupBy('customer_id');

        return [
            'invoices' => array_replace($page->toArray(), ['data' => $rows->collapse()->values()]),
            'customers' => $ids->map(fn ($id) => ['id' => (int) $id] + $this->summarise($profiles->get($id)))->all(),
        ];
    }

    private function aggregate(Builder $query): Builder
    {
        $query->selectRaw("COUNT(*) AS invoices, COALESCE(SUM(outstanding), 0) AS outstanding, MIN(due_on) AS oldest_due,
            MAX(last_contact_at) AS last_contact_at, COALESCE(SUM(CASE WHEN flag = 'promised' THEN promised_amount ELSE 0 END), 0) AS promised_amount,
            COALESCE(SUM(CASE WHEN aging_bucket <> 'not_due' THEN outstanding ELSE 0 END), 0) AS overdue");
        foreach (self::AGING as $i => $bucket) {
            $query->selectRaw("COUNT(CASE WHEN aging_bucket = ? THEN 1 END) AS bucket_count_{$i},
                COALESCE(SUM(CASE WHEN aging_bucket = ? THEN outstanding ELSE 0 END), 0) AS bucket_amount_{$i}", [$bucket, $bucket]);
        }
        foreach (self::FLAGS as $i => $flag) {
            $query->selectRaw("COUNT(CASE WHEN flag = ? THEN 1 END) AS flag_count_{$i}", [$flag]);
        }

        return $query;
    }

    private function summarise(?object $row): array
    {
        $data = [
            'invoices' => (int) ($row->invoices ?? 0),
            'customers' => (int) ($row->customers ?? 0),
            'outstanding' => (float) ($row->outstanding ?? 0),
            'overdue' => (float) ($row->overdue ?? 0),
            'oldest_due' => $row->oldest_due ?? null,
            'last_contact_at' => $this->contactDate($row->last_contact_at ?? null),
            'promised_amount' => (float) ($row->promised_amount ?? 0),
        ];
        foreach (self::AGING as $i => $bucket) {
            $data['aging'][$bucket] = ['count' => (int) ($row->{"bucket_count_{$i}"} ?? 0), 'amount' => (float) ($row->{"bucket_amount_{$i}"} ?? 0)];
        }
        foreach (self::FLAGS as $i => $flag) {
            $data['flags'][$flag] = (int) ($row->{"flag_count_{$i}"} ?? 0);
        }

        return $data;
    }

    public function invoice(object $row): array
    {
        return [
            'id' => (int) $row->id, 'invoice_number' => $row->invoice_number, 'due_on' => $row->due_on,
            'invoice_date' => $row->invoice_date, 'due_date' => $row->due_date,
            'total_amount' => (float) $row->total_amount, 'paid_amount' => (float) $row->paid_amount,
            'return_credit' => (float) $row->return_credit, 'applied_credit' => (float) $row->applied_credit,
            'outstanding' => (float) $row->outstanding, 'aging_bucket' => $row->aging_bucket, 'flag' => $row->flag,
            'customer_id' => (int) $row->customer_id,
            'customer' => ['name' => $row->customer_name, 'city' => $row->customer_city, 'phone' => $row->customer_phone, 'archived' => $row->archived_at !== null],
            'follow_up' => $row->follow_up_id ? ['outcome' => $row->outcome, 'next_follow_up' => $row->next_follow_up, 'created_at' => $this->contactDate($row->last_contact_at)] : null,
            'promise' => $row->promised_date ? ['amount' => (float) $row->promised_amount, 'date' => $row->promised_date] : null,
        ];
    }

    private function contactDate(?string $timestamp): ?string
    {
        return $timestamp === null ? null : Carbon::parse($timestamp, config('app.timezone'))->setTimezone('Asia/Karachi')->toDateString();
    }

    public function exportRows(Builder $filtered, array $filters, Carbon $today): iterable
    {
        foreach ($this->ordered(clone $filtered, $filters)->cursor() as $row) {
            yield [
                'invoice' => $row->invoice_number, 'customer' => $row->customer_name, 'due' => $row->due_on,
                'days_overdue' => max(0, (int) Carbon::parse($row->due_on, 'Asia/Karachi')->diffInDays($today, false)),
                'total' => (float) $row->total_amount, 'paid' => (float) $row->paid_amount,
                'returns' => (float) $row->return_credit, 'credit' => (float) $row->applied_credit,
                'outstanding' => Paisa::from($row->outstanding) / 100,
            ];
        }
    }
}
