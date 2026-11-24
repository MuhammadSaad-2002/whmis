<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\SalesInvoice;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Read-side cash and bank reporting, distinct from revenue and invoice settlement. */
class CustomerReceiptReport
{
    public const KEY = 'customer-receipts';

    public const NOTE = 'Actual receipts exclude unverified reports, applied credits and shortages. Detail rows show the exact tender for audit; posted receipts may differ due to whole-rupee settlement rounding. Historical completed receipts are counted once.';

    private function completed(?Carbon $from = null, ?Carbon $to = null): Builder
    {
        return DB::table('payments as p')
            ->where('p.party_type', 'customer')
            ->where('p.direction', Payment::DIRECTION_IN)
            ->where('p.status', 'completed')
            ->whereNotIn('p.method', ['adjustment'])
            ->when($from, fn ($q) => $q->where('p.payment_date', '>=', $from->toDateString()))
            ->when($to, fn ($q) => $q->where('p.payment_date', '<', $to->copy()->addDay()->toDateString()));
    }

    private function shortages(): Builder
    {
        return DB::table('delivery_collections')->whereNotNull('payment_id')->whereNotNull('recorded_at')->where('shortage_paisa', '>', 0);
    }

    private function actualAmount(string $amount): string
    {
        $difference = "$amount - COALESCE(shortages.paisa, 0) / 100.0";

        return "CASE WHEN $difference > 0 THEN ROUND($difference, 2) ELSE 0 END";
    }

    private function tender(): string
    {
        return 'COALESCE(p.tendered_paisa / 100.0, '.$this->actualAmount('p.amount').')';
    }

    private function receipts(?Carbon $from = null, ?Carbon $to = null): Builder
    {
        return $this->completed($from, $to)
            ->leftJoinSub($this->shortages()->selectRaw('payment_id, SUM(shortage_paisa) AS paisa')->groupBy('payment_id'),
                'shortages', 'shortages.payment_id', '=', 'p.id');
    }

    public function total(Carbon $from, Carbon $to): float
    {
        return (float) $this->receipts($from, $to)->selectRaw('ROUND(COALESCE(SUM('.$this->tender().'), 0), 0) AS received')->value('received');
    }

    public function byDay(Carbon $from, Carbon $to): Collection
    {
        return $this->receipts($from, $to)->selectRaw('DATE(p.payment_date) AS receipt_day, ROUND(SUM('.$this->tender().'), 2) AS received')
            ->groupBy('receipt_day')->pluck('received', 'receipt_day');
    }

    public function byCustomer(Carbon $from, Carbon $to): Collection
    {
        return $this->receipts($from, $to)->selectRaw('p.party_id, ROUND(SUM('.$this->tender().'), 2) AS received')
            ->groupBy('p.party_id')->pluck('received', 'party_id');
    }

    /** A receipt can have several allocations; subtract its shortage only on the affected invoice. */
    private function allocated(?Carbon $from = null, ?Carbon $to = null, ?array $invoiceIds = null): Builder
    {
        $allocations = $this->completed($from, $to)
            ->join('payment_allocations as a', 'a.payment_id', '=', 'p.id')
            ->where('a.invoice_type', (new SalesInvoice)->getMorphClass())
            ->when($invoiceIds !== null, fn ($q) => $q->whereIntegerInRaw('a.invoice_id', $invoiceIds))
            ->selectRaw('p.id AS payment_id, a.invoice_id, SUM(a.amount) AS amount, MAX(p.tendered_paisa) AS tendered_paisa')
            ->groupBy('p.id', 'a.invoice_id');

        $allAllocations = DB::table('payment_allocations')->where('invoice_type', (new SalesInvoice)->getMorphClass())
            ->selectRaw('payment_id, SUM(amount) AS amount')->groupBy('payment_id');

        return DB::query()->fromSub($allocations, 'allocated')
            ->joinSub($allAllocations, 'all_allocations', 'all_allocations.payment_id', '=', 'allocated.payment_id')
            ->leftJoinSub($this->shortages()->selectRaw('payment_id, SUM(shortage_paisa) AS paisa')->groupBy('payment_id'),
                'all_shortages', 'all_shortages.payment_id', '=', 'allocated.payment_id')
            ->leftJoinSub($this->shortages()->selectRaw('payment_id, sales_invoice_id, SUM(shortage_paisa) AS paisa')->groupBy('payment_id', 'sales_invoice_id'),
                'shortages', fn ($join) => $join->on('shortages.payment_id', '=', 'allocated.payment_id')
                    ->on('shortages.sales_invoice_id', '=', 'allocated.invoice_id'));
    }

    private function allocatedTender(): string
    {
        $allocated = $this->actualAmount('allocated.amount');
        $total = '(all_allocations.amount - COALESCE(all_shortages.paisa, 0) / 100.0)';
        $tender = '(allocated.tendered_paisa / 100.0)';

        // Do not attribute more than the actual tender when settlement rounded up.
        return "CASE WHEN $total > $tender THEN $allocated * $tender / $total ELSE $allocated END";
    }

    public function byInvoice(array $invoiceIds): Collection
    {
        if ($invoiceIds === []) return collect();

        return $this->allocated(invoiceIds: $invoiceIds)
            ->selectRaw('allocated.invoice_id, ROUND(SUM('.$this->allocatedTender().'), 2) AS received')
            ->groupBy('allocated.invoice_id')->pluck('received', 'invoice_id');
    }

    public function byBooker(Carbon $from, Carbon $to, bool $customerFallback): Collection
    {
        $booker = $customerFallback ? 'COALESCE(i.booker_id, c.booker_id, 0)' : 'COALESCE(i.booker_id, 0)';
        $query = $this->allocated($from, $to)->join('sales_invoices as i', 'i.id', '=', 'allocated.invoice_id')
            ->where('i.status', 'posted');
        if ($customerFallback) $query->leftJoin('customers as c', 'c.id', '=', 'i.customer_id');

        return $query->selectRaw("$booker AS receipt_booker_id, ROUND(SUM(".$this->allocatedTender().'), 2) AS received')
            ->groupBy('receipt_booker_id')->pluck('received', 'receipt_booker_id');
    }

    public function build(Carbon $from, Carbon $to, ?int $customer): array
    {
        $rows = $this->receipts($from, $to)->leftJoin('customers as c', 'c.id', '=', 'p.party_id')
            ->when($customer, fn ($q) => $q->where('p.party_id', $customer))
            ->orderBy('p.payment_date')->orderBy('p.id')
            ->select('p.payment_number', 'c.name AS customer', 'p.method', 'p.amount AS settled')
            ->selectRaw('DATE(p.payment_date) AS payment_date, COALESCE(shortages.paisa, 0) AS shortage_paisa, '.$this->tender().' AS received')
            ->get()->map(fn ($row) => [
                'payment_number' => $row->payment_number, 'payment_date' => $row->payment_date, 'customer' => $row->customer,
                'method' => match ($row->method) { 'online' => 'Online Transfer', 'bank' => 'Bank Transfer', default => ucfirst($row->method) },
                'settled' => (float) $row->settled,
                'shortage' => (int) $row->shortage_paisa / 100,
                'received' => (float) $row->received,
            ]);

        return [
            'columns' => [
                ['key' => 'payment_number', 'label' => 'Receipt #'],
                ['key' => 'payment_date', 'label' => 'Payment Date (PKT)', 'format' => 'date'],
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'method', 'label' => 'Method'],
                ['key' => 'settled', 'label' => 'Receipt Posted', 'format' => 'money', 'align' => 'right'],
                ['key' => 'shortage', 'label' => 'Employee Shortage', 'format' => 'money', 'align' => 'right'],
                ['key' => 'received', 'label' => 'Actual Received', 'format' => 'money', 'align' => 'right'],
            ],
            'rows' => $rows->all(),
            'totals' => [
                'settled' => round($rows->sum('settled'), 2),
                'shortage' => round($rows->sum('shortage'), 2),
                'received' => round($rows->sum('received'), 2),
            ],
            'notes' => [self::NOTE],
        ];
    }
}
