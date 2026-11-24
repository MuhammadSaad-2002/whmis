<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Services\TreasuryService;
use App\Support\Paisa;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class CommissionController
{
    public function index(Request $request)
    {
        $employees = Employee::orderBy('name')->get(['id','name','employee_number']);
        $selected = $employees->firstWhere('id', (int) $request->input('employee_id', $employees->first()?->id));
        abort_if($request->filled('employee_id') && ! $selected, 404);
        $awards = DB::table('commission_awards as a')->join('sales_invoices as i', 'i.id', '=', 'a.sales_invoice_id')
            ->where('a.employee_id', $selected?->id ?? 0);
        $entries = DB::table('commission_entries')->where('employee_id', $selected?->id ?? 0);
        $totals = [
            'calculated' => (clone $awards)->sum('a.calculated_paisa'), 'accrued' => (clone $awards)->sum('a.accrued_paisa'),
            'pending' => (clone $awards)->selectRaw('COALESCE(SUM(a.calculated_paisa - a.earned_paisa), 0) AS pending')->first()->pending,
            'earned' => (clone $awards)->sum('a.earned_paisa'), 'paid' => (clone $entries)->where('kind', 'commission_payout')->sum('cash_out_paisa'),
            'recovery' => (clone $entries)->sum('recovery_paisa'), 'recovered' => -(clone $entries)->whereIn('kind', ['offset_recovery','recovery_repayment'])->sum('recovery_paisa'),
            'payable' => (clone $entries)->sum('payable_paisa'),
        ];
        return Inertia::render('operations/commissions', [
            'employee' => $selected, 'employees' => $employees, 'manage' => true, 'totals' => $totals,
            'awards' => $awards->latest('a.id')->select('a.*','i.invoice_number')
                ->selectSub(DB::table('commission_entries')->whereColumn('commission_award_id','a.id')->selectRaw('COALESCE(SUM(payable_paisa),0)'), 'payable_paisa')
                ->selectSub(DB::table('commission_entries')->whereColumn('commission_award_id','a.id')->where('kind','commission_payout')->selectRaw('COALESCE(SUM(cash_out_paisa),0)'), 'paid_paisa')
                ->paginate(25, ['*'], 'awards')->withQueryString(),
            'entries' => $entries->latest('id')->paginate(20, ['*'], 'entries')->withQueryString(),
            'rules' => DB::table('commission_rules')->orderByDesc('effective_from')->orderByDesc('id')->paginate(20, ['*'], 'rules')->withQueryString(),
            'hold' => $selected ? (bool) DB::table('commission_employee_controls')->where('employee_id', $selected->id)->value('hold_recovery') : false,
        ]);
    }

    public function store(Request $request, TreasuryService $treasury)
    {
        $data = $request->validate([
            'source' => 'required|in:booking,direct', 'role' => 'required|in:booker,salesman', 'employee_id' => 'nullable|integer|exists:employees,id',
            'booking_id' => 'nullable|integer|exists:bookings,id', 'basis' => 'required|in:booking,invoice',
            'mode' => 'required|in:off,percent,proportional,full_fixed', 'rate' => 'required|numeric|decimal:0,2|min:0|max:999999999999',
            'effective_from' => 'required|date_format:Y-m-d', 'dispatch_share' => 'nullable|numeric|decimal:0,2|min:0|max:100',
        ]);
        if (($data['mode'] === 'percent' && (float) $data['rate'] > 100) || ($data['source'] === 'direct' && $data['basis'] !== 'invoice')
            || (! empty($data['booking_id']) && (! empty($data['employee_id']) || $data['source'] !== 'booking'))
            || ($data['effective_from'] < now('Asia/Karachi')->toDateString())) {
            throw ValidationException::withMessages(['rate' => 'Check the source, scope, rate and date. Rate versions cannot be backdated.']);
        }
        $scope = ! empty($data['booking_id']) ? 'booking:'.$data['booking_id'] : (! empty($data['employee_id']) ? 'employee:'.$data['employee_id'] : 'default');
        DB::transaction(function () use ($request, $data, $scope, $treasury) {
            $id = DB::table('commission_rules')->insertOrIgnore([
                'scope' => $scope, 'role' => $data['role'], 'source' => $data['source'], 'basis' => $data['basis'], 'mode' => $data['mode'],
                'rate' => Paisa::from($data['rate']), 'effective_from' => $data['effective_from'], 'dispatch_share_bp' => Paisa::from($data['dispatch_share'] ?? 0),
                'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
            ]);
            if (! $id) throw ValidationException::withMessages(['effective_from' => 'A rule version already exists for that effective date; choose a later date.']);
            $treasury->event('commission_rule', (int) DB::getPdo()->lastInsertId(), 'configured', $request->user(), $data);
        }, 3);
        return back()->with('success', 'Rate version saved for new commission snapshots.');
    }
}
