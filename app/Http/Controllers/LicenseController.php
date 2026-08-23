<?php

namespace App\Http\Controllers;

use App\Models\License;
use App\Services\LicenseService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class LicenseController extends Controller
{
    public function __construct(private LicenseService $license) {}

    /**
     * Super-Admin-only management page: current status + the full key history.
     */
    public function index()
    {
        $keys = License::with('activatedBy:id,name')
            ->orderByDesc('activated_at')
            ->get()
            ->map(fn (License $lic) => [
                'id' => $lic->id,
                'key' => $lic->key,
                'expires_at' => $lic->expires_at->toIso8601String(),
                'activated_at' => $lic->activated_at->toIso8601String(),
                'activated_by' => $lic->activatedBy?->name,
                'notes' => $lic->notes,
            ]);

        return Inertia::render('admin/license/index', [
            'keys' => $keys,
            'status' => [
                'expires_at' => $this->license->currentExpiry()?->toIso8601String(),
                'days_remaining' => $this->license->daysRemaining(),
                'valid' => $this->license->isValid(),
            ],
        ]);
    }

    /**
     * Activate a new key. Expiry defaults to +1 month; an explicit future date
     * may be supplied.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'expires_at' => ['nullable', 'date', 'after:now'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $license = $this->license->activate(
            isset($data['expires_at']) ? Carbon::parse($data['expires_at']) : null,
            $request->user(),
            $data['notes'] ?? null,
        );

        return back()->with('success', "License activated — key {$license->key}, valid until {$license->expires_at->format('d M Y')}.");
    }

    /**
     * The standalone "system inactive" screen shown to gated users. No permission
     * gate: it must be reachable precisely while the system is locked.
     */
    public function locked()
    {
        return Inertia::render('license/locked');
    }
}
