<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Spatie\Permission\PermissionRegistrar;

class PermissionCheck
{
    public function __construct(private readonly PermissionRegistrar $permissions) {}

    public function allowsAny(User $user, array $abilities): bool
    {
        $gate = Gate::forUser($user);
        if ($gate->any($abilities)) {
            return true;
        }

        // phpMyAdmin skips Spatie's cache invalidation. Retry only for a saved grant.
        if (! $user->getAllPermissions()->contains(
            fn ($permission) => $permission->guard_name === 'web' && in_array($permission->name, $abilities, true),
        )) {
            return false;
        }

        $this->permissions->forgetCachedPermissions();

        return $gate->any($abilities);
    }
}
