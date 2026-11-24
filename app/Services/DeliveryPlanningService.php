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

    /** Active invoice override first, then the customer's default; no weekdays means the next available day is today. */
    public function assignmentDefaults(SalesInvoice $invoice): array
    {
        $schedule = CustomerDeliverySchedule::where('customer_id', $invoice->customer_id)->first();
        $candidates = array_values(array_unique(array_filter([(int) $invoice->planned_salesman_id, (int) $schedule?->salesman_id])));
        $active = $this->activeSalesmen()->whereKey($candidates)->pluck('id')->flip();
        $salesman = collect($candidates)->first(fn ($id) => $active->has($id));
        $date = $this->nextDate(Carbon::today('Asia/Karachi'), $schedule?->delivery_days ?? []);

        return ['assigned_to' => $salesman, 'planned_date' => $salesman ? $date : null];
    }

    private function nextDate(Carbon $from, array $days): string
    {
        $date = $from->copy();
        for ($i = 0; $days && $i < 7 && ! in_array($date->isoWeekday(), $days, true); $i++) $date->addDay();

        return $date->toDateString();
    }

    /** Activate operational work under the invoice lock, without moving warehouse stock. */
    public function activateInvoice(SalesInvoice $invoice): void
    {
        $defaults = $this->assignmentDefaults($invoice);
        Dispatch::create($defaults + ['sales_invoice_id' => $invoice->id, 'custody_required' => true,
            'original_assignee_id' => $defaults['assigned_to'], 'status' => 'pending']);
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
                'delivery_enabled_at' => $salesman ? ($schedule->delivery_enabled_at ?? now()) : null,
            ]);
            $schedule->save();
            AuditLogger::action($customer, 'delivery_schedule_updated', [
                'salesman_id' => $salesman, 'booking_days' => $bookingDays, 'delivery_days' => $deliveryDays,
            ]);
        });
        if ($salesman) $this->planOpenInvoices(Carbon::today('Asia/Karachi'), $customer->id);
    }

    /** Generate today's PKT visits and schedule new, eligible posted invoices. Safe to repeat. */
    public function generate(): array
    {
        $today = Carbon::today('Asia/Karachi');
        $count = ['visits' => 0, 'dispatches' => 0];
        $activeBookers = User::where('is_active', true)
            ->whereHas('roles', fn ($roles) => $roles->where('name', 'Booker')->where('guard_name', 'web'))
            ->pluck('id')->flip();

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

        $count['dispatches'] = $this->planOpenInvoices($today);

        return $count;
    }

    private function planOpenInvoices(Carbon $today, ?int $customerId = null): int
    {
        $count = 0;
        SalesInvoice::query()->where('sales_invoices.status', SalesInvoice::STATUS_POSTED)
            ->whereNotNull('sales_invoices.posted_at')
            ->when($customerId, fn ($q) => $q->where('sales_invoices.customer_id', $customerId))
            ->join('customer_delivery_schedules as schedule', 'schedule.customer_id', '=', 'sales_invoices.customer_id')
            ->where(fn ($q) => $q->whereColumn('sales_invoices.posted_at', '>=', 'schedule.delivery_enabled_at')
                ->orWhereExists(fn ($rows) => $rows->selectRaw('1')->from('dispatches')->whereColumn('dispatches.sales_invoice_id', 'sales_invoices.id')
                    ->where('custody_required', true)->whereNull('assigned_to')->whereNull('original_assignee_id')))
            ->whereIn('schedule.salesman_id', $this->activeSalesmen()->select('users.id'))
            ->whereHas('customer', fn ($customer) => $customer->active())
            ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('dispatches')
                ->whereColumn('dispatches.sales_invoice_id', 'sales_invoices.id')
                ->where(fn ($rows) => $rows->whereNotNull('assigned_to')->orWhereNotNull('original_assignee_id')
                    ->orWhere('custody_required', false)->orWhere('status', '!=', 'pending')))
            ->select('sales_invoices.id')
            ->chunkById(100, function ($invoices) use (&$count, $today) {
                foreach ($invoices as $invoice) {
                    $count += (int) $this->planInvoice($invoice->id, $today);
                }
            }, 'sales_invoices.id', 'id');

        return $count;
    }

    private function planInvoice(int $id, Carbon $today): bool
    {
        return DB::transaction(function () use ($id, $today) {
            $invoice = SalesInvoice::whereKey($id)->lockForUpdate()->first();
            $dispatch = Dispatch::where('sales_invoice_id', $id)->first();
            if (! $invoice?->isPosted() || ! $invoice->posted_at || ($dispatch && (! $dispatch->custody_required || $dispatch->assigned_to
                || $dispatch->original_assignee_id || $dispatch->status !== 'pending'))) return false;

            $customer = Customer::active()->whereKey($invoice->customer_id)->first();
            $schedule = $customer?->deliverySchedule()->lockForUpdate()->first();
            if (! $schedule?->salesman_id
                || (! $dispatch && (! $schedule->delivery_enabled_at || $invoice->posted_at->lt($schedule->delivery_enabled_at)))
                || ! $this->activeSalesmen()->whereKey($schedule->salesman_id)->exists()
                || array_sum(array_column($this->dispatch->progress($invoice), 'remaining')) <= 0) return false;

            $date = $today->copy()->max($invoice->posted_at->copy()->setTimezone('Asia/Karachi')->startOfDay());
            ($dispatch ?? new Dispatch)->fill([
                'sales_invoice_id' => $id, 'assigned_to' => $schedule->salesman_id,
                'original_assignee_id' => $schedule->salesman_id,
                'planned_date' => $this->nextDate($date, $schedule->delivery_days ?? []), 'status' => 'pending',
            ])->save();

            return true;
        });
    }

    private function days(array $days): array
    {
        $days = array_values(array_unique(array_map('intval', $days)));
        sort($days);
        return $days;
    }
}
