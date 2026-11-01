<?php

namespace App\Services;

use App\Models\{BookerAssignmentLog, Customer, Employee, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BookerAssignmentService
{
    public function assign(Employee $employee, array $customerIds, User $actor): void
    {
        DB::transaction(function () use ($employee, $customerIds, $actor) {
            $employee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();
            $booker = $employee->user;
            if (! $employee->is_booker || ! $booker || ! $booker->is_active || ! $booker->hasRole('Booker')) {
                throw ValidationException::withMessages(['customer_ids' => 'Link this employee to an active Booker login first.']);
            }
            $selected = collect($customerIds)->map(fn ($id) => (int) $id)->unique();
            $customers = Customer::where(fn ($q) => $q->whereIn('id', $selected)->orWhere(fn ($q) => $q->forBooker($booker->id)))
                ->orderBy('id')->lockForUpdate()->get();
            if ($selected->diff($customers->pluck('id'))->isNotEmpty()) {
                throw ValidationException::withMessages(['customer_ids' => 'A selected customer is no longer available. Refresh and try again.']);
            }
            foreach ($customers as $customer) {
                if ($customer->booker_id === $booker->id && ! $selected->contains($customer->id)) {
                    throw ValidationException::withMessages(['customer_ids' => 'Change the primary Booker in Customers before removing their access.']);
                }
                $before = $customer->booker_id === $booker->id || $customer->bookers()->where('users.id', $booker->id)->exists();
                $after = $selected->contains($customer->id);
                if ($before === $after) continue;
                if ($after) {
                    if ($customer->status !== 'active') throw ValidationException::withMessages(['customer_ids' => 'Only active customers can be newly assigned.']);
                    $customer->bookers()->syncWithoutDetaching([$booker->id => ['assigned_by' => $actor->id]]);
                } else {
                    $customer->bookers()->detach($booker->id);
                }
                BookerAssignmentLog::create([
                    'customer_id' => $customer->id, 'booker_id' => $booker->id,
                    'action' => $after ? 'assigned' : 'unassigned', 'changed_by' => $actor->id,
                    'note' => 'Employee profile customer assignment',
                ]);
            }
        });
    }
}
