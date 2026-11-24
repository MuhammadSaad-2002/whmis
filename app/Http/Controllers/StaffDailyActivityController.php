<?php

namespace App\Http\Controllers;

use App\Services\StaffDailyActivity;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class StaffDailyActivityController extends Controller
{
    public function __invoke(Request $request, StaffDailyActivity $activity): Response
    {
        $today = now(StaffDailyActivity::TIMEZONE)->toDateString();
        $filters = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:'.$today],
            'role' => ['nullable', Rule::in(StaffDailyActivity::ROLES)],
            'staff_id' => ['nullable', 'integer', 'min:1'],
        ]);
        $date = $filters['date'] ?? $today;

        return Inertia::render('operations/staff-activity', [
            'date' => $date,
            'today' => $today,
            ...$activity->forDate($date, $filters['role'] ?? null, isset($filters['staff_id']) ? (int) $filters['staff_id'] : null),
            'canViewCommissions' => $request->user()->can('manage-employee-commissions'),
        ]);
    }
}
