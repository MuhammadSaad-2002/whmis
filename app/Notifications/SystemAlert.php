<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * One database notification for every alert type (§20): low_stock, expiry,
 * overdue_invoice, booking_pending, credit_limit. `entity` (e.g. "batch:12")
 * is used to dedup unread alerts about the same thing.
 */
class SystemAlert extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $type,
        public readonly string $title,
        public readonly string $message,
        public readonly ?string $url = null,
        public readonly ?string $entity = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => $this->type,
            'title' => $this->title,
            'message' => $this->message,
            'url' => $this->url,
            'entity' => $this->entity,
        ];
    }
}
