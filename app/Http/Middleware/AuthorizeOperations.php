<?php

namespace App\Http\Middleware;

use App\Support\PermissionCheck;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthorizeOperations
{
    public function __construct(private readonly PermissionCheck $permissions) {}

    public function handle(Request $request, Closure $next, string ...$abilities): Response
    {
        $user = $request->user();
        abort_unless($user && $this->permissions->allowsAny($user, $abilities), 403);

        return $next($request);
    }
}
