<?php

namespace App\Http\Controllers;

use App\Models\{Customer, Dispatch, User};
use App\Services\{DeliveryPlanningService, OperationsAccess, ReportPdfRenderer};
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class DeliveryPlanningController extends Controller
{
    public function index(Request $request, DeliveryPlanningService $planning)
    {
        $search = $request->validate(['search' => 'nullable|string|max:100'])['search'] ?? '';
        $customers = Customer::active()->select('id', 'name', 'city', 'booker_id')
            ->with(['deliverySchedule:id,customer_id,booking_days,delivery_days,salesman_id',
                'deliverySchedule.salesman:id,name', 'bookers:id,name', 'primaryBooker:id,name'])
            ->orderBy('name')->orderBy('id')->get()->map(fn (Customer $customer) => [
                ...$customer->only(['id', 'name', 'city']),
                'bookers' => $customer->bookers->pluck('name', 'id')->union(
                    $customer->primaryBooker ? [$customer->primaryBooker->id => $customer->primaryBooker->name] : [],
                )->values(),
                'booking_days' => $customer->deliverySchedule?->booking_days ?? [],
                'delivery_days' => $customer->deliverySchedule?->delivery_days ?? [],
                'salesman_id' => $customer->deliverySchedule?->salesman_id,
                'salesman_name' => $customer->deliverySchedule?->salesman?->name,
            ]);

        return Inertia::render('operations/delivery-schedules', [
            'customers' => $customers,
            'salesmen' => $planning->activeSalesmen()->orderBy('name')->get(['id', 'name']),
            'search' => $search,
            'today' => now('Asia/Karachi')->toDateString(),
        ]);
    }

    public function update(Request $request, Customer $customer, DeliveryPlanningService $planning)
    {
        abort_unless($customer->status === 'active', 404);
        $data = $request->validate($this->scheduleRules());
        $planning->save($customer, $data, $request->user());

        return back()->with('success', 'Customer schedule saved.');
    }

    public function updateMany(Request $request, DeliveryPlanningService $planning)
    {
        $data = $request->validate([
            'schedules' => 'required|array|min:1|max:500',
            'schedules.*.customer_id' => 'required|integer|min:1|distinct',
            ...$this->scheduleRules('schedules.*.'),
        ]);
        $count = $planning->saveMany($data['schedules'], $request->user());

        return back()->with('success', "{$count} ".($count === 1 ? 'schedule' : 'schedules').' saved.');
    }

    public function history(Customer $customer)
    {
        $history = DB::table('customer_salesman_history')->where('customer_id', $customer->id)
            ->orderByDesc('id')->simplePaginate(20, ['id', 'previous_salesman_id', 'previous_salesman_name',
                'salesman_id', 'salesman_name', 'changed_by_name', 'changed_at'])
            ->through(function ($entry) {
                $entry->changed_at = Carbon::parse($entry->changed_at)->setTimezone('Asia/Karachi')->format('d M Y, H:i');

                return $entry;
            });

        return response()->json($history)->header('Cache-Control', 'private, no-store');
    }

    private function scheduleRules(string $prefix = ''): array
    {
        return [
            $prefix.'salesman_id' => 'nullable|integer|min:1',
            $prefix.'booking_days' => 'present|array|max:7',
            $prefix.'booking_days.*' => 'integer|between:1,7'.($prefix === '' ? '|distinct' : ''),
            $prefix.'delivery_days' => 'present|array|max:7',
            $prefix.'delivery_days.*' => 'integer|between:1,7'.($prefix === '' ? '|distinct' : ''),
        ];
    }

    public function generate(DeliveryPlanningService $planning)
    {
        $counts = $planning->generate();

        return back()->with('success', "Added {$counts['visits']} booking visit(s) and {$counts['dispatches']} delivery task(s).");
    }

    public function sheet(Request $request, OperationsAccess $access, ReportPdfRenderer $pdf)
    {
        $data = $request->validate(['date' => 'required|date_format:Y-m-d', 'assignee_id' => 'required|integer']);
        $access->validateAssignee($data['assignee_id'], ['dispatch.view', 'dispatch.assigned'], $request->user());
        $staff = User::findOrFail($data['assignee_id']);
        $dispatches = Dispatch::where('assigned_to', $staff->id)->where('planned_date', $data['date'])
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted'))
            ->with([
                'invoice:id,customer_id,invoice_number,total_amount,mp_inv_ref',
                'invoice.customer:id,name,city',
                'events' => fn ($events) => $events->where('action', 'delivered')->whereNotNull('receiver_name')
                    ->select('id', 'dispatch_id', 'receiver_name'),
            ])
            ->orderBy('id')->get();
        $verifiedPayments = $request->user()->can('payments.view') && $dispatches->isNotEmpty()
            ? DB::table('delivery_collections as collection')
                ->join('collection_days as day', 'day.id', '=', 'collection.collection_day_id')
                ->join('payments as payment', 'payment.id', '=', 'collection.payment_id')
                ->where('day.business_date', $data['date'])->where('day.salesman_id', $staff->id)
                ->whereIn('collection.sales_invoice_id', $dispatches->pluck('sales_invoice_id'))
                ->whereNotNull('collection.recorded_at')->where('collection.verified_paisa', '>', 0)
                ->where('payment.status', 'completed')->where('payment.direction', 'in')
                ->groupBy('collection.sales_invoice_id')
                ->selectRaw('collection.sales_invoice_id, SUM(collection.verified_paisa) as total_paisa')
                ->pluck('total_paisa', 'sales_invoice_id')
            : collect();
        $stops = $dispatches->groupBy(fn ($dispatch) => $dispatch->invoice->customer_id)
            ->sortBy(fn ($group) => strtolower(
                ($group->first()->invoice->customer?->city ?? '').'|'.($group->first()->invoice->customer?->name ?? '')
            ))->values();

        return $pdf->renderView('pdf.daily-delivery-sheet', [
            'staff' => $staff, 'date' => Carbon::parse($data['date'], 'Asia/Karachi'), 'stops' => $stops,
            'invoiceCount' => $dispatches->count(), 'verifiedPayments' => $verifiedPayments,
        ], 'landscape')->stream('delivery-sheet-'.$data['date'].'.pdf');
    }
}
