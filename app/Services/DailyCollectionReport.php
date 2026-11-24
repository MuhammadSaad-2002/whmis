<?php

namespace App\Services;

use App\Support\Paisa;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/** Builds a read-only, business-date PDF from the same scoped reports as the screen. */
class DailyCollectionReport
{
    public function amounts(object $row): array
    {
        $posted = $row->recorded_at !== null && $row->payment_status === 'completed';
        $received = $posted ? (int) $row->verified_paisa : 0;
        $shortage = $posted ? (int) $row->shortage_paisa : 0;

        return ['actual_received_paisa' => $received, 'invoice_settled_paisa' => $received + $shortage];
    }

    public function data(string $date, bool $finance, Collection $days, Collection $rows, ?string $salesman): array
    {
        $businessDate = Carbon::parse($date, 'Asia/Karachi')->format('d M Y');
        $rowsByDay = $rows->groupBy('collection_day_id');
        $summary = [];
        $sections = [];
        $totals = ['day' => 'TOTAL', 'reported' => 0, 'cash' => 0, 'counted' => 0, 'received' => 0, 'posted' => 0, 'variance' => 0, 'pending' => 0];
        $allCounted = $days->isNotEmpty();
        foreach ($days as $day) {
            $reports = $rowsByDay->get($day->id, collect());
            $cash = $reports->where('method', 'cash')->sum('reported_paisa');
            $counted = $day->counted_cash_paisa ?? ($day->closed_at ? 0 : null);
            $group = $day->salesman.($day->revision > 1 ? ' · Supplement '.($day->revision - 1) : '');
            $values = [
                'day' => $group, 'status' => $day->closed_at ? 'Closed' : ($day->submitted_at ? 'Submitted' : 'Not submitted'),
                'reported' => (int) $reports->sum('reported_paisa'), 'cash' => (int) $cash, 'counted' => $counted,
                'received' => (int) $reports->sum('actual_received_paisa'), 'posted' => (int) $reports->sum('invoice_settled_paisa'),
                'variance' => $counted === null ? null : $counted - $cash,
                'pending' => $reports->whereNull('recorded_at')->count(),
            ];
            foreach (['reported', 'cash', 'counted', 'received', 'posted', 'variance', 'pending'] as $key) $totals[$key] += $values[$key] ?? 0;
            $allCounted = $allCounted && $counted !== null;
            $summary[] = $this->rupees($values, ['reported', 'cash', 'counted', 'received', 'posted', 'variance']);

            $details = $reports->map(fn ($row) => [
                'invoice' => $row->invoice_number.' · '.match ($row->method) { 'cash' => 'Cash', 'online' => 'Bank transfer', default => 'No payment' }
                    .($row->created_at ? "\n".$this->time($row->created_at) : ''),
                'customer' => $row->customer, 'total' => $row->total_amount,
                'previous' => Paisa::rupees((int) $row->previous_paid_paisa), 'reported' => Paisa::rupees((int) $row->reported_paisa),
                'received' => Paisa::rupees($row->actual_received_paisa), 'settled' => Paisa::rupees($row->invoice_settled_paisa),
                'outstanding' => max(0, (float) $row->outstanding),
                'review' => $this->review($row, $finance),
            ]);
            $sections[] = [
                'title' => $group.($day->variance_note ? ' · Variance note recorded' : ''),
                'columns' => [
                    ['key' => 'invoice', 'label' => 'Invoice / method'], ['key' => 'customer', 'label' => 'Customer'],
                    ...$this->moneyColumns(['total' => 'Invoice total', 'previous' => 'Previously paid', 'reported' => 'Reported',
                        'received' => 'Actual received', 'settled' => 'Invoice settled', 'outstanding' => 'Outstanding']),
                    ['key' => 'review', 'label' => 'Status / receipt', 'wrap' => true],
                ],
                'rows' => $details->all(), 'totals' => [],
            ];
        }
        if (! $allCounted) $totals['counted'] = $totals['variance'] = null;
        $notes = [
            'Amounts in PKR. Reported collections are not payments until verified and posted.',
            'Actual received excludes shortages and reversed receipts. Invoice settlement can include an approved shortage. The selected day is the salesman’s reporting day, not necessarily the receipt payment date.',
            'Cash variance = counted cash less reported cash. An em dash means cash was not counted.',
            ...$days->filter(fn ($day) => $day->variance_note)->map(fn ($day) => $day->salesman.': '.$day->variance_note)->values()->all(),
        ];
        if ($rows->isEmpty()) $notes[] = 'No collections reported for this selection.';

        return [
            'title' => $finance ? 'Daily Payment Reconciliation' : 'Daily Collection Summary',
            'context' => 'Business date: '.$businessDate.' (PKT) · '.($salesman ?? 'All salesmen').' · '.$rows->count().' collection report(s)',
            'sectionTitle' => 'Collection and cash summary', 'notes' => $notes, 'readable' => true,
            'negativeGuide' => 'A negative cash variance means the physical count was lower than reported cash.',
            'columns' => [
                ['key' => 'day', 'label' => 'Salesman / submission'], ['key' => 'status', 'label' => 'Status'],
                ...$this->moneyColumns(['reported' => 'Reported', 'cash' => 'Reported cash', 'counted' => 'Counted cash',
                    'received' => 'Actual received', 'posted' => 'Invoice settled', 'variance' => 'Cash variance']),
                ['key' => 'pending', 'label' => 'Pending', 'align' => 'right'],
            ],
            'rows' => $summary, 'totals' => $summary ? $this->rupees($totals, ['reported', 'cash', 'counted', 'received', 'posted', 'variance']) : [],
            'sections' => $sections,
        ];
    }

    private function moneyColumns(array $keys): array
    {
        return collect($keys)->map(fn ($label, $key) => ['key' => $key, 'label' => $label, 'align' => 'right', 'format' => 'money'])->values()->all();
    }

    private function rupees(array $values, array $keys): array
    {
        foreach ($keys as $key) $values[$key] = $values[$key] === null ? '—' : Paisa::rupees((int) $values[$key]);

        return $values;
    }

    private function review(object $row, bool $finance): string
    {
        $status = match (true) {
            $row->recorded_at === null => 'Pending', $row->payment_status === 'cancelled' => 'Reversed',
            $row->payment_status === 'completed' => 'Posted', $row->method === 'none' => 'Confirmed without payment', default => 'Reviewed without posting',
        };
        $reference = $finance && $row->payment_number ? $row->posted_reference : $row->reference;

        return implode("\n", array_filter([
            $status.($row->payment_number ? ' · '.$row->payment_number : ''),
            $reference ? 'Ref: '.$reference : null,
            $finance && $row->recorded_at ? 'Reviewed'.($row->reviewer ? ' by '.$row->reviewer : '').' · '.$this->time($row->recorded_at, true) : null,
            $row->shortage_paisa ? 'Employee shortage: Rs '.number_format((int) $row->shortage_paisa / 100, 2) : null,
            $row->review_note,
        ], fn ($value) => $value !== null && $value !== ''));
    }

    private function time(string $date, bool $includeDate = false): string
    {
        return Carbon::parse($date)->setTimezone('Asia/Karachi')->format($includeDate ? 'd M Y, g:i a' : 'g:i a').' PKT';
    }
}
