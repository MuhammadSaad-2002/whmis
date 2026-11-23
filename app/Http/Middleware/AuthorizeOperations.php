<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpFoundation\Response;

class AuthorizeOperations
{
    public function __construct(private readonly PermissionRegistrar $permissions) {}

    public function handle(Request $request, Closure $next, string ...$abilities): Response
    {
        $user = $request->user();
        $gate = Gate::forUser($user);
        $allowed = $gate->any($abilities);

        // phpMyAdmin grants bypass Spatie's model events. The sidebar reads the
        // database grants, while the Gate can still have the previous cache.
        if (! $allowed && $user?->getAllPermissions()->contains(
            fn ($permission) => in_array($permission->name, $abilities, true) && $permission->guard_name === 'web',
        )) {
            $this->permissions->forgetCachedPermissions();
            $allowed = $gate->any($abilities);
        }

        abort_unless($allowed, 403);

        return $next($request);
    }
}
