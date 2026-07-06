<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\SystemAlert;
use Illuminate\Support\Collection;

/**
 * Sends SystemAlerts to users holding a permission, skipping anyone who
 * already has an UNREAD alert of the same type for the same entity.
 */
class AlertService
{
    public function send(string $permission, SystemAlert $alert): int
    {
        $sent = 0;

        foreach ($this->recipients($permission) as $user) {
            $duplicate = $user->notifications()
                ->whereNull('read_at')
                ->where('data->type', $alert->type)
                ->when($alert->entity, fn ($q) => $q->where('data->entity', $alert->entity))
                ->exists();

            if (! $duplicate) {
                $user->notify($alert);
                $sent++;
            }
        }

        return $sent;
    }

    /** @return Collection<int, User> */
    public function recipients(string $permission): Collection
    {
        return User::permission($permission)->get();
    }
}
