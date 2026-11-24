<?php

namespace App\Http\Controllers;

use App\Models\{Booking, BookerVisit, Customer};
use App\Services\DeliveryCollectionService;
use App\Services\FieldDeliveryOverview;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class BookerWorkdayController extends Controller
{
    public function index(Request $request, DeliveryCollectionService $collections, FieldDeliveryOverview $fieldDeliveries)
    {
        $data = $request->validate([
            'date' => 'nullable|date_format:Y-m-d', 'search' => 'nullable|string|max:100', 'planned' => 'nullable|boolean',
            'filter' => 'nullable|in:all,planned,due,ordered,none', 'sort' => 'nullable|in:name,balance,recent',
            'size' => 'nullable|integer|in:12,24,36,48,60',
        ]);
        $today = now('Asia/Karachi')->toDateString();
        $date = $data['date'] ?? $today;
        $actor = $request->user();
        $booker = $actor->can('bookings.create');
        abort_unless($booker || $actor->is_active, 403);
        $salesman = $actor->can('dispatch.assigned') && $actor->is_active;
        $actorId = $actor->id;
        $filter = $data['filter'] ?? (! empty($data['planned']) ? 'planned' : 'all');
        $sort = $data['sort'] ?? 'name';
        $size = (int) ($data['size'] ?? 12);
        $search = trim($data['search'] ?? '');

        $assignedDeliveries = $salesman ? $fieldDeliveries->forDay($actorId, $date, $today) : null;
        $visits = $booker ? BookerVisit::where('booker_id', $actorId)->whereDate('visit_date', $date)
            ->whereHas('customer', fn ($query) => $query->active()->forBooker($actorId)) : null;

        $directory = null;
        if ($booker) {
            $lastBooking = Booking::whereColumn('customer_id', 'customers.id')->where('booker_id', $actorId)
                ->whereNotIn('status', ['cancelled', 'rejected'])->latest('id')->limit(1);
            $assigned = Customer::active()->forBooker($actorId)->select('customers.id', 'customers.name', 'customers.city')
                ->withSum('ledgerEntries as account_balance', DB::raw('debit - credit'))
                ->addSelect([
                    'last_booking_id' => (clone $lastBooking)->select('id'),
                    'last_booking_date' => (clone $lastBooking)->select('booking_date'),
                    'visit_id' => (clone $visits)->whereColumn('booker_visits.customer_id', 'customers.id')->select('id')->limit(1),
                ]);
            if ($assignedDeliveries) {
                $assigned->addSelect(['delivery_id' => $fieldDeliveries->uncompleted(clone $assignedDeliveries)
                    ->whereColumn('sales_invoices.customer_id', 'customers.id')->select('d.id')->limit(1)]);
            } else {
                $assigned->selectRaw('NULL AS delivery_id');
            }
            $directory = DB::query()->fromSub($assigned->toBase(), 'directory');
        }

        return Inertia::render('booker/workday', [
            'today' => $today,
            'filters' => ['date' => $date, 'search' => $search, 'filter' => $filter, 'sort' => $sort, 'size' => $size],
            'deliveries' => fn () => $assignedDeliveries ? $this->deliveries($fieldDeliveries->ordered(clone $assignedDeliveries), $collections, $actorId) : null,
            'activeDeliveries' => fn () => $assignedDeliveries ? $fieldDeliveries->uncompleted(clone $assignedDeliveries)->count() : 0,
            'visits' => fn () => $visits ? (clone $visits)->with(['customer' => fn ($query) => $query
                ->select('id', 'name', 'city', 'address')->withSum('ledgerEntries as account_balance', DB::raw('debit - credit'))])
                ->orderBy('id')->paginate(12, ['*'], 'visit_page')->withQueryString() : null,
            'customers' => fn () => $directory ? $this->customers($directory, $visits, $filter, $sort, $search, $size) : null,
            'bookerStats' => fn () => $booker ? $this->bookerStats($actorId, $date, $directory, $visits) : null,
            'pendingDeliveries' => fn () => $assignedDeliveries ? (clone $assignedDeliveries)->whereNotIn('d.status', ['delivered', 'closed'])->count() : 0,
            'collections' => fn () => $salesman ? $this->collections($actorId, $date) : null,
        ]);
    }

    private function customers(Builder $directory, EloquentBuilder $visits, string $filter, string $sort, string $search, int $size): LengthAwarePaginator
    {
        $query = clone $directory;
        if ($search !== '') {
            $query->where(fn ($rows) => $rows->where('name', 'like', '%'.$search.'%')->orWhere('city', 'like', '%'.$search.'%'));
        }
        match ($filter) {
            'planned' => $query->where(fn ($rows) => $rows->whereNotNull('visit_id')->orWhereNotNull('delivery_id')),
            'due' => $query->where('account_balance', '>', 0),
            'ordered' => $query->whereNotNull('last_booking_id'),
            'none' => $query->whereNull('last_booking_id'),
            default => null,
        };
        $query->orderByRaw('CASE WHEN visit_id IS NOT NULL OR delivery_id IS NOT NULL THEN 0 ELSE 1 END');
        match ($sort) {
            'balance' => $query->orderByRaw('COALESCE(account_balance, 0) DESC'),
            'recent' => $query->orderByDesc('last_booking_date'),
            default => null,
        };
        $customers = $query->orderBy('name')->orderBy('id')->paginate($size)->withQueryString();
        $dayVisits = (clone $visits)->whereIn('id', $customers->pluck('visit_id')->filter())->get(['id', 'outcome', 'notes'])->keyBy('id');
        $last = Booking::whereIn('id', $customers->pluck('last_booking_id')->filter())->get(['id', 'booking_number', 'booking_date', 'status'])->keyBy('id');

        return $customers->through(fn ($customer) => [
            'id' => $customer->id, 'name' => $customer->name, 'city' => $customer->city, 'account_balance' => $customer->account_balance,
            'has_delivery' => (bool) $customer->delivery_id, 'visit' => $dayVisits->get($customer->visit_id), 'last_booking' => $last->get($customer->last_booking_id),
        ]);
    }

    private function bookerStats(int $actorId, string $date, Builder $directory, EloquentBuilder $visits): array
    {
        $counts = (clone $directory)->selectRaw('COUNT(*) as total,
            SUM(CASE WHEN visit_id IS NOT NULL OR delivery_id IS NOT NULL THEN 1 ELSE 0 END) as planned,
            SUM(CASE WHEN account_balance > 0 THEN 1 ELSE 0 END) as due,
            SUM(CASE WHEN account_balance > 0 THEN account_balance ELSE 0 END) as due_amount,
            COUNT(last_booking_id) as ordered')->first();
        $start = Carbon::parse($date, 'Asia/Karachi')->startOfDay();
        $storageTime = config('app.timezone');
        $orders = Booking::where('booker_id', $actorId)->whereNotIn('status', ['cancelled', 'rejected'])
            ->where('created_at', '>=', $start->copy()->setTimezone($storageTime)->toDateTimeString())
            ->where('created_at', '<', $start->copy()->addDay()->setTimezone($storageTime)->toDateTimeString())
            ->whereHas('customer', fn ($customer) => $customer->active()->forBooker($actorId))->count();

        return [
            'all' => (int) $counts->total, 'planned' => (int) $counts->planned, 'due' => (int) $counts->due,
            'dueAmount' => (float) $counts->due_amount, 'ordered' => (int) $counts->ordered, 'none' => (int) $counts->total - (int) $counts->ordered,
            'completedVisits' => (clone $visits)->where('outcome', '!=', 'planned')->count(), 'orders' => $orders,
        ];
    }

    private function deliveries(EloquentBuilder $routes, DeliveryCollectionService $collections, int $actorId): LengthAwarePaginator
    {
        return $routes->with('customer:id,name,city,address,phone')->paginate(20, ['*'], 'delivery_page')->withQueryString()
            ->through(function ($invoice) use ($collections, $actorId) {
                $pending = (int) $invoice->pending_collection_paisa;
                $remaining = $collections->remainingPaisa($invoice->outstanding, $pending);
                $canCollect = $remaining > 0 && (int) $invoice->assigned_to === $actorId && in_array($invoice->dispatch_status, ['partial', 'delivered'], true);

                return [
                    'id' => $invoice->id, 'invoice_number' => $invoice->invoice_number,
                    'customer' => $invoice->customer, 'total_amount' => $invoice->total_amount, 'paid_amount' => $invoice->paid_amount,
                    'outstanding' => $invoice->outstanding, 'planned_date' => $invoice->planned_date, 'delivery_status' => $invoice->dispatch_status,
                    'is_complete' => (bool) $invoice->is_complete,
                    'can_collect' => $canCollect, 'collectible_paisa' => $canCollect ? $remaining : 0,
                    'pending_paisa' => $pending,
                ];
            });
    }

    private function collectionReports(int $actorId, string $date): Builder
    {
        return DB::table('delivery_collections as report')->join('collection_days as day', 'day.id', '=', 'report.collection_day_id')
            ->where('day.salesman_id', $actorId)->where('report.reporter_id', $actorId)->where('day.business_date', $date);
    }

    private function collections(int $actorId, string $date): array
    {
        $reports = $this->collectionReports($actorId, $date);
        $stats = (clone $reports)->selectRaw("SUM(CASE WHEN report.method = 'cash' THEN report.reported_paisa ELSE 0 END) AS cash,
            SUM(CASE WHEN report.method = 'online' THEN report.reported_paisa ELSE 0 END) AS online,
            SUM(CASE WHEN report.recorded_at IS NULL AND report.reported_paisa > 0 THEN 1 ELSE 0 END) AS pending,
            COUNT(CASE WHEN report.reported_paisa > 0 THEN 1 END) AS entry_count,
            MAX(CASE WHEN day.submitted_at IS NULL THEN day.id ELSE NULL END) AS open_day")->first();
        return [
            'cash' => (int) $stats->cash, 'online' => (int) $stats->online, 'pending' => (int) $stats->pending,
            'entryCount' => (int) $stats->entry_count, 'openDay' => $stats->open_day ? (int) $stats->open_day : null,
            'entries' => $reports->where('report.reported_paisa', '>', 0)->join('sales_invoices as sales', 'sales.id', '=', 'report.sales_invoice_id')
                ->join('customers as customer', 'customer.id', '=', 'sales.customer_id')->leftJoin('payments as payment', 'payment.id', '=', 'report.payment_id')
                ->orderByDesc('report.id')->limit(8)->get(['report.id', 'sales.invoice_number', 'customer.name as customer',
                    'report.method', 'report.reported_paisa', 'report.recorded_at', 'payment.status as payment_status']),
        ];
    }

    public function visit(Request $request, Customer $customer)
    {
        abort_unless(Customer::active()->forBooker($request->user()->id)->whereKey($customer->id)->exists(), 403);
        $data = $request->validate([
            'visit_date' => 'required|date_format:Y-m-d', 'outcome' => 'required|in:planned,visited,no_order,closed',
            'notes' => 'nullable|string|max:1000',
        ]);
        if ($data['outcome'] !== 'planned' && $data['visit_date'] > now('Asia/Karachi')->toDateString()) {
            return back()->withErrors(['visit_date' => 'Future visits can only be planned.']);
        }
        DB::transaction(function () use ($customer, $request, $data) {
            $visit = BookerVisit::updateOrCreate(['booker_id' => $request->user()->id, 'customer_id' => $customer->id, 'visit_date' => $data['visit_date']],
                ['outcome' => $data['outcome'], 'notes' => $data['notes'] ?? null]);
            AuditLogger::action($customer, 'booker_visit', ['visit_id' => $visit->id, 'booker_id' => $request->user()->id, 'outcome' => $data['outcome']]);
        });
        return back()->with('success', 'Visit updated.');
    }
}
