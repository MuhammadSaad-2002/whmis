<?php

namespace App\Http\Middleware;

use App\Services\LicenseService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hard licensing gate. When the system's license is expired or was never
 * activated, every authenticated user EXCEPT a Super Admin is redirected to the
 * "contact your administrator" locked screen — so the vendor (Super Admin) can
 * always log in and reactivate, and the install can never permanently brick
 * itself. The locked page and logout are always allowed through to avoid loops.
 */
class EnsureLicensed
{
    public function __construct(private LicenseService $license) {}

    public function handle(Request $request, Closure $next): Response
    {
        // Always let the escape hatches through, whatever the license state.
        if ($request->routeIs('license.locked', 'logout')) {
            return $next($request);
        }

        $user = $request->user();

        // Guests are handled by `auth`; Super Admin is the vendor and is never gated.
        if ($user === null || $user->hasRole('Super Admin') || $this->license->isValid()) {
            return $next($request);
        }

        return redirect()->route('license.locked');
    }
}
