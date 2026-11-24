<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\LicenseService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        [$message, $author] = str(Inspiring::quotes()->random())->explode('-');
        $user = $request->user();
        $canViewSupplierDetails = $user?->canViewSupplierDetails() ?? false;
        $permissions = $user?->getAllPermissions()->pluck('name')
            ->diff(['commission.self'])
            ->when(! $user?->can('manage-employee-commissions'), fn ($names) => $names->diff(['commission.manage', 'commission.waive']));

        return array_merge(parent::share($request), [
            ...parent::share($request),
            'name' => config('branding.product_name', 'Tradentra'),
            'quote' => ['message' => trim($message), 'author' => trim($author)],
            'auth' => [
                'user' => $user,
                'permissions' => $permissions?->when(! $canViewSupplierDetails, fn ($names) => $names->diff(User::SUPPLIER_MODULE_PERMISSIONS))->values() ?? [],
                'roles' => $user?->getRoleNames() ?? [],
                'canViewSupplierDetails' => $canViewSupplierDetails,
                'canManageOwnAccount' => $user?->can('manage-own-account') ?? false,
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
            ],
            'license' => app(LicenseService::class)->sharePayload($request->user()),
            ...($user && $request->routeIs('payments.index','ledger.position','purchases.create','purchases.edit','hr.index') ? [
                'treasuryPayment' => function () use ($user) {
                    $treasury = app(\App\Services\TreasuryService::class);
                    $required = $treasury->live();
                    return ['required' => $required, 'accounts' => $required ? $treasury->options($user) : []];
                },
            ] : []),
        ]);
    }
}
