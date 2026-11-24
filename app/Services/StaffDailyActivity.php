<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Employee;
use App\Models\User;
use App\Support\Paisa;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StaffDailyActivity
{
    public const TIMEZONE = 'Asia/Karachi';

    public const ROLES = ['Booker', 'Salesman'];

    public function forDate(string $date, ?string $role = null, ?int $staffId = null): array
    {
        $day = CarbonImmutable::parse($date, self::TIMEZONE)->startOfDay();
        $start = $day->setTimezone(config('app.timezone'))->toDateTimeString();
        $end = $day->addDay()->setTimezone(config('app.timezone'))->toDateTimeString();

        $staff = User::role($role ?? self::ROLES)->where('is_active', true)
            ->with('roles:id,name')->orderBy('name')->orderBy('id')->get(['id', 'name']);
        $employees = Employee::query()->whereIn('user_id', $staff->modelKeys())->get(['id', 'name', 'user_id'])->toBase()->keyBy('user_id');
        $staff = $staff->sortBy(fn (User $user) => $employees->get($user->id)?->name ?? $user->name, SORT_NATURAL | SORT_FLAG_CASE);
        $staffId = $staff->contains('id', $staffId) ? $staffId : null;
        $report = [
            'filters' => ['role' => $role, 'staff_id' => $staffId],
            'staffOptions' => $staff->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $employees->get($user->id)?->name ?? $user->name,
            ])->values(),
        ];
        if ($staffId !== null) {
            $staff = $staff->where('id', $staffId);
        }
        $ids = $staff->modelKeys();
        if ($ids === []) {
            return $report + ['staff' => [], 'invoiceTotals' => ['sale_count' => 0, 'sale_paisa' => 0, 'delivery_count' => 0]];
        }

        $employeeIds = $employees->only($ids)->pluck('id');
        $bookings = DB::table('bookings')->whereIn('booker_id', $ids)
            ->where('created_at', '>=', $start)->where('created_at', '<', $end)
            ->whereNotIn('status', [Booking::STATUS_CANCELLED, Booking::STATUS_REJECTED])
            ->groupBy('booker_id')->selectRaw('booker_id, COUNT(*) AS booking_count, SUM(total_amount) AS booking_value')
            ->get()->keyBy('booker_id');

        $posted = DB::table('sales_invoices')->where('sales_invoices.status', 'posted')
            ->where('sales_invoices.posted_at', '>=', $start)->where('sales_invoices.posted_at', '<', $end);
        // One invoice counts only once per person even if they filled both roles.
        $credited = (clone $posted)->whereIn('booker_id', $ids)->selectRaw('id AS invoice_id, booker_id AS user_id, total_amount')
            ->union((clone $posted)->leftJoin('dispatches as d', 'd.sales_invoice_id', '=', 'sales_invoices.id')
                ->whereIn(DB::raw('COALESCE(d.original_assignee_id, sales_invoices.planned_salesman_id)'), $ids)
                ->selectRaw('sales_invoices.id AS invoice_id, COALESCE(d.original_assignee_id, sales_invoices.planned_salesman_id) AS user_id, sales_invoices.total_amount'));
        $sales = DB::query()->fromSub($credited, 'credited')->groupBy('user_id')
            ->selectRaw('user_id, COUNT(*) AS sale_count, SUM(total_amount) AS sale_value')->get()->keyBy('user_id');
        // More than one employee can receive credit for the same invoice.
        $uniqueSales = DB::query()->fromSub($credited, 'credited')->select('invoice_id', 'total_amount')->distinct();
        $saleTotals = DB::query()->fromSub($uniqueSales, 'invoices')->selectRaw('COUNT(*) AS sale_count, SUM(total_amount) AS sale_value')->first();

        $deliveryActor = 'COALESCE(e.assigned_to, e.created_by)';
        $deliveryEvents = DB::table('dispatch_events as e')->join('dispatches as d', 'd.id', '=', 'e.dispatch_id')
            ->join('dispatch_event_items as line', 'line.dispatch_event_id', '=', 'e.id')
            ->whereIn('e.action', ['delivered', 'correct_delivery'])->whereIn(DB::raw($deliveryActor), $ids)
            ->where('e.created_at', '>=', $start)->where('e.created_at', '<', $end);
        $deliveryCount = (clone $deliveryEvents)->where('e.action', 'delivered')->distinct()->count('d.sales_invoice_id');
        $deliveries = $deliveryEvents->groupByRaw($deliveryActor)
            ->selectRaw("$deliveryActor AS user_id, COUNT(DISTINCT CASE WHEN e.action = 'delivered' THEN d.sales_invoice_id END) AS delivery_count,
                SUM(CASE WHEN e.action = 'delivered' THEN line.quantity ELSE 0 END) AS delivered_units,
                SUM(CASE WHEN e.action = 'correct_delivery' THEN -line.quantity ELSE 0 END) AS corrected_units")
            ->get()->keyBy('user_id');

        $collections = $this->collections($ids, $date, $start, $end);
        $calculated = DB::table('commission_awards as a')->joinSub((clone $posted)->select('id'), 'posted', 'posted.id', '=', 'a.sales_invoice_id')
            ->whereIn('a.employee_id', $employeeIds)->groupBy('a.employee_id')
            ->selectRaw('a.employee_id, SUM(a.calculated_paisa) AS calculated')->pluck('calculated', 'employee_id');
        $ledger = DB::table('commission_entries')->whereIn('employee_id', $employeeIds)->where('business_date', '<=', $date)
            ->groupBy('employee_id')->selectRaw("employee_id, SUM(payable_paisa) AS payout_due,
                SUM(CASE WHEN kind IN ('entitlement', 'recovery_created') AND business_date = ? THEN expense_paisa ELSE 0 END) AS earned,
                SUM(CASE WHEN kind = 'commission_payout' AND business_date = ? THEN cash_out_paisa ELSE 0 END) AS paid,
                SUM(CASE WHEN kind = 'commission_payout' THEN cash_out_paisa ELSE 0 END) AS paid_to_date", [$date, $date])
            ->get()->keyBy('employee_id');

        $rows = $staff->map(function (User $user) use ($employees, $bookings, $sales, $deliveries, $collections, $calculated, $ledger) {
            $id = $user->id;
            $employee = $employees->get($id);
            $employeeId = $employee?->id;
            $booking = $bookings->get($id);
            $sale = $sales->get($id);
            $delivery = $deliveries->get($id);
            $collection = $collections->get($id);
            $entry = $ledger->get($employeeId);

            return [
                'id' => $id,
                'name' => $employee?->name ?? $user->name,
                'login_name' => $employee && strcasecmp($employee->name, $user->name) !== 0 ? $user->name : null,
                'roles' => $user->roles->pluck('name')->intersect(self::ROLES)->sort()->values(),
                'employee_id' => $employeeId,
                'booking_count' => (int) ($booking->booking_count ?? 0),
                'booking_paisa' => Paisa::from($booking->booking_value ?? 0),
                'sale_count' => (int) ($sale->sale_count ?? 0),
                'sale_paisa' => Paisa::from($sale->sale_value ?? 0),
                'delivery_count' => (int) ($delivery->delivery_count ?? 0),
                'delivered_units' => (float) ($delivery->delivered_units ?? 0),
                'corrected_units' => (float) ($delivery->corrected_units ?? 0),
                'reported_paisa' => (int) ($collection->reported ?? 0),
                'submitted_paisa' => (int) ($collection->submitted ?? 0),
                'verified_paisa' => (int) ($collection->verified ?? 0),
                'commission' => $employeeId === null ? null : [
                    'calculated_paisa' => (int) $calculated->get($employeeId, 0),
                    'earned_paisa' => (int) ($entry->earned ?? 0),
                    'paid_paisa' => (int) ($entry->paid ?? 0),
                    'paid_to_date_paisa' => (int) ($entry->paid_to_date ?? 0),
                    'payout_due_paisa' => (int) ($entry->payout_due ?? 0),
                ],
            ];
        })->values();

        return $report + ['staff' => $rows, 'invoiceTotals' => [
            'sale_count' => (int) $saleTotals->sale_count,
            'sale_paisa' => Paisa::from($saleTotals->sale_value),
            'delivery_count' => $deliveryCount,
        ]];
    }

    private function collections(array $ids, string $date, string $start, string $end): Collection
    {
        return DB::table('collection_days as cd')->join('delivery_collections as c', 'c.collection_day_id', '=', 'cd.id')
            ->leftJoin('payments as p', 'p.id', '=', 'c.payment_id')
            ->whereIn('cd.salesman_id', $ids)
            ->where(fn ($q) => $q->where('cd.business_date', $date)
                ->orWhere(fn ($q) => $q->where('cd.submitted_at', '>=', $start)->where('cd.submitted_at', '<', $end))
                ->orWhere(fn ($q) => $q->where('c.recorded_at', '>=', $start)->where('c.recorded_at', '<', $end)))
            ->groupBy('cd.salesman_id')
            ->selectRaw("cd.salesman_id, SUM(CASE WHEN cd.business_date = ? THEN c.reported_paisa ELSE 0 END) AS reported,
                SUM(CASE WHEN cd.submitted_at >= ? AND cd.submitted_at < ? THEN c.reported_paisa ELSE 0 END) AS submitted,
                SUM(CASE WHEN c.recorded_at >= ? AND c.recorded_at < ? AND p.status = 'completed' THEN c.verified_paisa ELSE 0 END) AS verified",
                [$date, $start, $end, $start, $end])
            ->get()->keyBy('salesman_id');
    }
}
