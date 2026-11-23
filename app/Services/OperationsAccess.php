<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

class OperationsAccess
{
    public function staff(string|array $permission, User $actor): Builder
    {
        return User::query()->where('is_active', true)
            ->where(fn ($q) => $q->whereHas('permissions', fn ($p) => $p->whereIn('name', (array) $permission)->where('guard_name', 'web'))
                ->orWhereHas('roles.permissions', fn ($p) => $p->whereIn('name', (array) $permission)->where('guard_name', 'web')))
            ->when(! $actor->hasRole('Super Admin'), fn ($q) => $q->whereDoesntHave('roles', fn ($r) => $r->where('name', 'Super Admin')));
    }

    public function validateAssignee(?int $id, string|array $permission, User $actor): void
    {
        if ($id && ! $this->staff($permission, $actor)->whereKey($id)->exists()) {
            throw ValidationException::withMessages(['assigned_to' => 'Choose an active staff member with access to this workflow.']);
        }
    }
}
