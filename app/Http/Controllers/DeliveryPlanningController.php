<?php

namespace App\Http\Controllers;

use App\Models\{Customer, Dispatch, User};
use App\Services\{DeliveryPlanningService, OperationsAccess};
use Barryvdh\DomPDF\Facade\Pdf;
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
            ->with(['deliverySchedule', 'bookers:id,name', 'primaryBooker:id,name'])
            ->when($search !== '', fn ($query) => $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")->orWhere('city', 'like', "%{$search}%")))
            ->orderBy('name')->orderBy('id')->paginate(12)->withQueryString();

        return Inertia::render('operations/delivery-schedules', [
            'customers' => $customers,
            'salesmen' => $planning->activeSalesmen()->orderBy('name')->get(['id', 'name']),
            'search' => $search,
        ]);
    }

    public function update(Request $request, Customer $customer, DeliveryPlanningService $planning)
    {
        abort_unless($customer->status === 'active', 404);
        $data = $request->validate([
            'salesman_id' => 'nullable|integer',
            'booking_days' => 'present|array|max:7', 'booking_days.*' => 'integer|between:1,7|distinct',
            'delivery_days' => 'present|array|max:7', 'delivery_days.*' => 'integer|between:1,7|distinct',
        ]);
        $planning->save($customer, $data);

        return back()->with('success', 'Customer schedule saved.');
    }

    public function generate(DeliveryPlanningService $planning)
    {
        $counts = $planning->generate();

        return back()->with('success', "Added {$counts['visits']} booking visit(s) and {$counts['dispatches']} delivery task(s).");
    }

    public function sheet(Request $request, OperationsAccess $access)
    {
        $data = $request->validate(['date' => 'required|date_format:Y-m-d', 'assignee_id' => 'required|integer']);
        $access->validateAssignee($data['assignee_id'], ['dispatch.view', 'dispatch.assigned'], $request->user());
        $staff = User::findOrFail($data['assignee_id']);
        $dispatches = Dispatch::where('assigned_to', $staff->id)->where('planned_date', $data['date'])
            ->whereHas('invoice', fn ($q) => $q->where('status', 'posted'))
            ->with([
                'invoice:id,customer_id,invoice_number,total_amount',
                'invoice.customer:id,name,address,city',
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

        return Pdf::loadView('pdf.daily-delivery-sheet', [
            'staff' => $staff, 'date' => Carbon::parse($data['date'], 'Asia/Karachi'), 'stops' => $stops,
            'invoiceCount' => $dispatches->count(), 'verifiedPayments' => $verifiedPayments,
        ])->setPaper('a4')->stream('delivery-sheet-'.$data['date'].'.pdf');
    }
}
