<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

class OperationsAccess
{
    public function staff(string $permission, User $actor): Builder
    {
        return User::query()->where('is_active', true)
            ->where(fn ($q) => $q->whereHas('permissions', fn ($p) => $p->where('name', $permission))
                ->orWhereHas('roles.permissions', fn ($p) => $p->where('name', $permission)))
            ->when(! $actor->hasRole('Super Admin'), fn ($q) => $q->whereDoesntHave('roles', fn ($r) => $r->where('name', 'Super Admin')));
    }

    public function validateAssignee(?int $id, string $permission, User $actor): void
    {
        if ($id && ! $this->staff($permission, $actor)->whereKey($id)->exists()) {
            throw ValidationException::withMessages(['assigned_to' => 'Choose an active staff member with access to this workflow.']);
        }
    }
}
