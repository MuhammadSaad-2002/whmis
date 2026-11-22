<?php

namespace App\Http\Controllers;

use App\Models\{Booking, BookerVisit, Customer};
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class BookerWorkdayController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate(['date' => 'nullable|date_format:Y-m-d', 'search' => 'nullable|string|max:100']);
        $date = $data['date'] ?? now('Asia/Karachi')->toDateString();
        $customers = Customer::active()->forBooker($request->user()->id)
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%{$s}%")->orWhere('city', 'like', "%{$s}%")))
            ->select('id', 'name', 'city')
            ->withSum('ledgerEntries as account_balance', DB::raw('debit - credit'))
            ->addSelect(['last_booking_id' => Booking::select('id')->whereColumn('customer_id', 'customers.id')
                ->where('booker_id', $request->user()->id)->whereNotIn('status', ['cancelled', 'rejected'])->latest('id')->limit(1)])
            ->orderBy('name')->paginate(12)->withQueryString();
        $visits = BookerVisit::where('booker_id', $request->user()->id)->whereDate('visit_date', $date)->whereIn('customer_id', $customers->pluck('id'))->get()->keyBy('customer_id');
        $last = Booking::whereIn('id', $customers->pluck('last_booking_id')->filter())->get(['id', 'booking_number', 'booking_date', 'status'])->keyBy('id');
        $customers->through(fn ($c) => $c->toArray() + ['visit' => $visits->get($c->id), 'last_booking' => $last->get($c->last_booking_id)]);
        return Inertia::render('booker/workday', ['customers' => $customers, 'filters' => ['date' => $date, 'search' => $data['search'] ?? '']]);
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
