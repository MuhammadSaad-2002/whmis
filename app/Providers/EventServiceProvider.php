<?php

namespace App\Providers;

use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

/**
 * Writes authentication events (login, logout, failed login) to the audit trail
 * so the Audit Log shows who signed in and when, alongside data-change audits.
 */
class EventServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Event::listen(Login::class, function (Login $event) {
            $this->record('login', $event->user);
        });

        Event::listen(Logout::class, function (Logout $event) {
            $this->record('logout', $event->user);
        });

        Event::listen(Failed::class, function (Failed $event) {
            $this->record('login_failed', $event->user, [
                'email' => $event->credentials['email'] ?? null,
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $newValues
     */
    private function record(string $event, mixed $user, array $newValues = []): void
    {
        if (! config('audit.enabled', true)) {
            return;
        }

        $auditModel = config('audit.implementation', \OwenIt\Auditing\Models\Audit::class);
        $request = request();

        $auditModel::create([
            'user_type' => $user ? 'user' : null,
            'user_id' => $user?->getKey(),
            'event' => $event,
            'auditable_type' => $user ? 'user' : null,
            'auditable_id' => $user?->getKey(),
            'old_values' => [],
            'new_values' => $newValues,
            'url' => $request->fullUrl(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'tags' => 'auth',
        ]);
    }
}
