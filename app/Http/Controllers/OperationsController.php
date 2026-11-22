<?php

namespace App\Http\Controllers;

use App\Models\{CollectionFollowUp, Dispatch, SalesInvoice};
use App\Services\{CollectionService, DispatchService, InvoiceBalanceService, OperationsAccess};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class OperationsController extends Controller
{
    public function dispatches(Request $request)
    {
        $filters = $request->validate(['search' => 'nullable|string|max:100', 'status' => 'nullable|in:untracked,pending,picking,packed,dispatched,partial,delivered,failed,closed']);
        $invoices = SalesInvoice::query()->where('sales_invoices.status', 'posted')
            ->leftJoin('dispatches', 'dispatches.sales_invoice_id', '=', 'sales_invoices.id')
            ->with('customer:id,name,city')->select('sales_invoices.id', 'invoice_number', 'invoice_date', 'customer_id')
            ->selectRaw("COALESCE(dispatches.status, 'untracked') as dispatch_status")
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($q) => $q->where('invoice_number', 'like', "%{$s}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$s}%"))))
            ->when($filters['status'] ?? null, fn ($q, $s) => $s === 'untracked'
                ? $q->whereNull('dispatches.status')
                : $q->where('dispatches.status', $s))
            ->orderByDesc('sales_invoices.id')->paginate(20)->withQueryString();
        return Inertia::render('operations/dispatch-index', ['invoices' => $invoices, 'filters' => $filters]);
    }

    public function dispatch(Request $request, SalesInvoice $sale, DispatchService $service)
    {
        abort_if($sale->status === 'draft', 404);
        return Inertia::render('operations/dispatch', [
            'invoice' => $sale->only(['id', 'invoice_number', 'status']) + ['customer' => $sale->customer?->name],
            'dispatch' => Dispatch::where('sales_invoice_id', $sale->id)->with(['assignee:id,name', 'events.creator:id,name', 'events.assignee:id,name', 'events.items'])->first(),
            'items' => $service->progress($sale),
            'staff' => app(OperationsAccess::class)->staff('dispatch.view', $request->user())->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function dispatchAction(Request $request, SalesInvoice $sale, DispatchService $service)
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['assign', 'picking', 'packed', 'dispatched', 'delivered', 'failed', 'correct_delivery', 'close_returned'])],
            'request_key' => 'required|uuid', 'assigned_to' => 'nullable|integer',
            'receiver_name' => 'nullable|string|max:150', 'notes' => 'nullable|string|max:1000',
            'items' => 'nullable|array', 'items.*.sales_invoice_item_id' => 'required|integer|distinct',
            'items.*.quantity' => 'required|numeric|decimal:0,2|min:0|max:999999999999',
        ]);
        $service->record($sale, $data, $request->user());
        return back()->with('success', 'Delivery activity recorded.');
    }

    public function collections(Request $request, InvoiceBalanceService $balances)
    {
        $today = now('Asia/Karachi')->toDateString();
        $filters = $request->validate(['search' => 'nullable|string|max:100', 'bucket' => 'nullable|in:all,overdue,follow_up']);
        $query = $balances->openSales()->with('customer:id,name,city')
            ->addSelect(['last_follow_up_id' => CollectionFollowUp::select('id')->whereColumn('sales_invoice_id', 'sales_invoices.id')->latest('id')->limit(1)])
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($q) => $q->where('invoice_number', 'like', "%{$s}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$s}%"))))
            ->when(($filters['bucket'] ?? 'all') === 'overdue', fn ($q) => $q->whereRaw('COALESCE(due_date, invoice_date) < ?', [$today]))
            ->when(($filters['bucket'] ?? 'all') === 'follow_up', fn ($q) => $q->whereExists(fn ($s) => $s->selectRaw('1')->from('collection_follow_ups as f')
                ->whereColumn('f.sales_invoice_id', 'sales_invoices.id')->whereDate('f.next_follow_up', '<=', $today)
                ->whereRaw('f.id = (SELECT MAX(f2.id) FROM collection_follow_ups f2 WHERE f2.sales_invoice_id = sales_invoices.id)')));
        $invoices = $query->orderByRaw('COALESCE(due_date, invoice_date)')->orderBy('sales_invoices.id')->paginate(20)->withQueryString();
        $followUps = CollectionFollowUp::with('assignee:id,name')->whereIn('id', $invoices->pluck('last_follow_up_id')->filter())->get()->keyBy('id');
        $invoices->through(fn ($invoice) => $invoice->only(['id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'paid_amount', 'return_credit', 'outstanding'])
            + ['customer' => $invoice->customer, 'follow_up' => $followUps->get($invoice->last_follow_up_id)]);
        return Inertia::render('operations/collections', ['invoices' => $invoices, 'filters' => $filters]);
    }

    public function collection(Request $request, SalesInvoice $sale, InvoiceBalanceService $balances)
    {
        abort_if($sale->status === 'draft', 404);
        $balance = $balances->sales()->where('sales_invoices.id', $sale->id)->first();
        return Inertia::render('operations/collection', [
            'invoice' => $sale->only(['id', 'invoice_number', 'status', 'total_amount']) + [
                'customer' => $sale->customer?->name, 'customer_id' => $sale->customer_id,
                'outstanding' => (float) ($balance?->outstanding ?? 0),
                'paid_amount' => (float) ($balance?->paid_amount ?? 0), 'return_credit' => (float) ($balance?->return_credit ?? 0),
            ],
            'history' => CollectionFollowUp::where('sales_invoice_id', $sale->id)->with(['assignee:id,name', 'creator:id,name'])->latest('id')->get(),
            'staff' => app(OperationsAccess::class)->staff('collections.view', $request->user())->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function followUp(Request $request, SalesInvoice $sale, CollectionService $service)
    {
        $today = now('Asia/Karachi')->toDateString();
        $data = $request->validate([
            'assigned_to' => 'nullable|integer', 'outcome' => 'required|in:contacted,promised,unreachable,disputed',
            'promised_date' => 'nullable|required_if:outcome,promised|date_format:Y-m-d|after_or_equal:'.$today,
            'promised_amount' => 'nullable|required_if:outcome,promised|numeric|decimal:0,2|gt:0|max:999999999999',
            'next_follow_up' => 'required|date_format:Y-m-d|after_or_equal:'.$today, 'notes' => 'required|string|max:1000',
        ]);
        $service->followUp($sale, $data, $request->user());
        return back()->with('success', 'Collection follow-up saved. Record actual receipts in Payments.');
    }
}
