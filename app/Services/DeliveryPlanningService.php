<?php

namespace App\Services;

use App\Models\{BookerVisit, Customer, CustomerDeliverySchedule, Dispatch, SalesInvoice, User};
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Creates operational tasks. It does not create orders, post invoices, or move stock. */
class DeliveryPlanningService
{
    public function __construct(private readonly DispatchService $dispatch) {}

    public function salesmen(): Builder
    {
        return User::whereHas('roles', fn ($roles) => $roles->where('name', 'Salesman')->where('guard_name', 'web'));
    }

    public function activeSalesmen(): Builder
    {
        return $this->salesmen()->where('is_active', true)
            ->where(fn ($query) => $query
                ->whereHas('permissions', fn ($p) => $p->where('name', 'dispatch.assigned')->where('guard_name', 'web'))
                ->orWhereHas('roles.permissions', fn ($p) => $p->where('name', 'dispatch.assigned')->where('guard_name', 'web')));
    }

    public function save(Customer $customer, array $data): void
    {
        $bookingDays = $this->days($data['booking_days'] ?? []);
        $deliveryDays = $this->days($data['delivery_days'] ?? []);
        $salesman = $data['salesman_id'] ?? null;
        if (($salesman && ! $this->activeSalesmen()->whereKey($salesman)->exists()) || ($deliveryDays && ! $salesman)) {
            throw ValidationException::withMessages(['salesman_id' => 'Choose an active Salesman to schedule deliveries.']);
        }

        DB::transaction(function () use ($customer, $bookingDays, $deliveryDays, $salesman) {
            $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
            $schedule = $customer->deliverySchedule()->firstOrNew();
            $schedule->fill([
                'booking_days' => $bookingDays, 'delivery_days' => $deliveryDays, 'salesman_id' => $salesman,
                'delivery_enabled_at' => $deliveryDays ? ($schedule->delivery_enabled_at ?? now()) : null,
            ]);
            $schedule->save();
            AuditLogger::action($customer, 'delivery_schedule_updated', [
                'salesman_id' => $salesman, 'booking_days' => $bookingDays, 'delivery_days' => $deliveryDays,
            ]);
        });
    }

    /** Generate today's PKT visits and schedule new, eligible posted invoices. Safe to repeat. */
    public function generate(): array
    {
        $today = Carbon::today('Asia/Karachi');
        $count = ['visits' => 0, 'dispatches' => 0];
        $activeBookers = User::where('is_active', true)
            ->whereHas('roles', fn ($roles) => $roles->where('name', 'Booker')->where('guard_name', 'web'))
            ->pluck('id')->flip();
        $activeSalesmen = $this->activeSalesmen()->pluck('id');

        CustomerDeliverySchedule::whereHas('customer', fn ($customer) => $customer->active())
            ->with(['customer:id,booker_id', 'customer.bookers:id'])
            ->chunkById(100, function ($schedules) use (&$count, $today, $activeBookers) {
                foreach ($schedules as $schedule) {
                    if (! in_array($today->isoWeekday(), $schedule->booking_days, true) || ! $schedule->customer) continue;
                    $members = $schedule->customer->bookers->pluck('id')->push($schedule->customer->booker_id)->unique();
                    foreach ($members->filter(fn ($booker) => $booker && $activeBookers->has($booker)) as $booker) {
                        $visit = BookerVisit::firstOrCreate(
                            ['booker_id' => $booker, 'customer_id' => $schedule->customer_id, 'visit_date' => $today->toDateString()],
                            ['outcome' => 'planned'],
                        );
                        $count['visits'] += (int) $visit->wasRecentlyCreated;
                    }
                }
            });

        SalesInvoice::query()->where('sales_invoices.status', SalesInvoice::STATUS_POSTED)
            ->whereNotNull('sales_invoices.posted_at')
            ->join('customer_delivery_schedules as schedule', 'schedule.customer_id', '=', 'sales_invoices.customer_id')
            ->whereColumn('sales_invoices.posted_at', '>=', 'schedule.delivery_enabled_at')
            ->whereIn('schedule.salesman_id', $activeSalesmen)
            ->whereHas('customer', fn ($customer) => $customer->active())
            ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('dispatches')
                ->whereColumn('dispatches.sales_invoice_id', 'sales_invoices.id'))
            ->select('sales_invoices.id')
            ->chunkById(100, function ($invoices) use (&$count, $today) {
                foreach ($invoices as $invoice) {
                    $count['dispatches'] += (int) $this->planInvoice($invoice->id, $today);
                }
            }, 'sales_invoices.id', 'id');

        return $count;
    }

    private function planInvoice(int $id, Carbon $today): bool
    {
        return DB::transaction(function () use ($id, $today) {
            $invoice = SalesInvoice::whereKey($id)->lockForUpdate()->first();
            if (! $invoice?->isPosted() || ! $invoice->posted_at || Dispatch::where('sales_invoice_id', $id)->exists()) return false;

            $customer = Customer::active()->whereKey($invoice->customer_id)->first();
            $schedule = $customer?->deliverySchedule()->lockForUpdate()->first();
            if (! $schedule?->delivery_enabled_at || ! $schedule->delivery_days || ! $schedule->salesman_id
                || $invoice->posted_at->lt($schedule->delivery_enabled_at)
                || ! $this->activeSalesmen()->whereKey($schedule->salesman_id)->exists()
                || array_sum(array_column($this->dispatch->progress($invoice), 'remaining')) <= 0) return false;

            $date = $today->copy()->max($invoice->posted_at->copy()->setTimezone('Asia/Karachi')->startOfDay());
            for ($i = 0; $i < 7; $i++, $date->addDay()) {
                if (! in_array($date->isoWeekday(), $schedule->delivery_days, true)) continue;
                Dispatch::create([
                    'sales_invoice_id' => $id, 'assigned_to' => $schedule->salesman_id,
                    'planned_date' => $date->toDateString(), 'status' => 'pending',
                ]);

                return true;
            }

            return false;
        });
    }

    private function days(array $days): array
    {
        $days = array_values(array_unique(array_map('intval', $days)));
        sort($days);
        return $days;
    }
}
