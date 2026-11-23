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

    public function handle(Request $request, Closure $next, string $ability): Response
    {
        $user = $request->user();
        $gate = Gate::forUser($user);
        $decision = $gate->inspect($ability);

        // phpMyAdmin grants bypass Spatie's model events. The sidebar reads the
        // database grants, while the Gate can still have the previous cache.
        if ($decision->denied() && $user?->getAllPermissions()->contains(
            fn ($permission) => $permission->name === $ability && $permission->guard_name === 'web',
        )) {
            $this->permissions->forgetCachedPermissions();
            $decision = $gate->inspect($ability);
        }

        $decision->authorize();

        return $next($request);
    }
}
