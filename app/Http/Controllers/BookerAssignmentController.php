<?php

namespace App\Http\Controllers;

use App\Models\BookerAssignmentLog;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;

/**
 * Admin audit of every customer↔booker assignment change (append-only log).
 */
class BookerAssignmentController extends Controller
{
    public function index(Request $request)
    {
        $logs = BookerAssignmentLog::query()
            ->with(['customer:id,name', 'booker:id,name', 'changedBy:id,name'])
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->booker_id, fn ($q, $id) => $q->where('booker_id', $id))
            ->when($request->action, fn ($q, $action) => $q->where('action', $action))
            ->when($request->from, fn ($q, $from) => $q->whereDate('created_at', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('created_at', '<=', $to))
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        $logs->through(fn (BookerAssignmentLog $log) => [
            'id' => $log->id,
            'customer' => $log->customer?->name,
            'booker' => $log->booker?->name,
            'action' => $log->action,
            'changed_by' => $log->changedBy?->name,
            'note' => $log->note,
            'created_at' => $log->created_at?->toDateTimeString(),
        ]);

        return Inertia::render('admin/booker-assignments/index', [
            'logs' => $logs,
            'filters' => $request->only('customer_id', 'booker_id', 'action', 'from', 'to'),
            'customers' => Customer::orderBy('name')->get(['id', 'name']),
            'bookers' => User::role('Booker')->orderBy('name')->get(['id', 'name']),
        ]);
    }
}
