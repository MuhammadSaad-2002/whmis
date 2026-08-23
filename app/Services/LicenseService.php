<?php

namespace App\Services;

use App\Models\License;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Single source of truth for whether the system is licensed. The effective
 * expiry is the furthest-out expiry across all issued keys, so a renewal is
 * just a new key with a later date. Super Admin is never gated by any of this
 * (see EnsureLicensed) — this service only reports status.
 */
class LicenseService
{
    /**
     * The furthest-out expiry across all keys, or null if none has ever been issued.
     */
    public function currentExpiry(): ?CarbonImmutable
    {
        $max = License::max('expires_at');

        return $max ? CarbonImmutable::parse($max) : null;
    }

    public function isValid(): bool
    {
        $expiry = $this->currentExpiry();

        return $expiry !== null && $expiry->isFuture();
    }

    /**
     * Whole days until expiry (0 on the last day, negative once expired), or
     * null if no key was ever issued.
     */
    public function daysRemaining(): ?int
    {
        $expiry = $this->currentExpiry();

        return $expiry === null ? null : (int) floor(now()->diffInDays($expiry, false));
    }

    /**
     * Issue a new activation key. Row-locked in a transaction (mirrors
     * NumberSeriesService) so two concurrent activations never collide on key.
     */
    public function activate(?Carbon $expiresAt = null, ?User $actor = null, ?string $notes = null): License
    {
        return DB::transaction(function () use ($expiresAt, $actor, $notes) {
            return License::create([
                'key' => $this->generateKey(),
                'expires_at' => $expiresAt ?? now()->addMonth(),
                'activated_at' => now(),
                'activated_by' => $actor?->id,
                'notes' => $notes,
            ]);
        });
    }

    /**
     * Shared Inertia payload consumed by the client (locked page never renders
     * here — the middleware redirects first). `show_warning` encodes the rule:
     * the 5-day countdown banner is for Admin users only, never Super Admin.
     *
     * @return array{expires_at: ?string, days_remaining: ?int, valid: bool, show_warning: bool}
     */
    public function sharePayload(?User $user): array
    {
        $expiry = $this->currentExpiry();
        $valid = $this->isValid();
        $days = $this->daysRemaining();

        $showWarning = $user !== null
            && $valid
            && $days !== null
            && $days <= 5
            && $user->hasRole('Admin')
            && ! $user->hasRole('Super Admin');

        return [
            'expires_at' => $expiry?->toIso8601String(),
            'days_remaining' => $days,
            'valid' => $valid,
            'show_warning' => $showWarning,
        ];
    }

    private function generateKey(): string
    {
        $body = collect(range(1, 3))
            ->map(fn () => Str::upper(Str::random(4)))
            ->implode('-');

        return "WHMIS-{$body}";
    }
}
