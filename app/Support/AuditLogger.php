<?php

namespace App\Support;

use Illuminate\Support\Facades\Event;
use OwenIt\Auditing\Contracts\Auditable;
use OwenIt\Auditing\Events\AuditCustom;

/**
 * Records a clearly-labelled action audit (e.g. "posted", "cancelled") on top of
 * the automatic create/update/delete trail. The model must be Auditable.
 */
class AuditLogger
{
    /**
     * @param  array<string, mixed>  $new
     * @param  array<string, mixed>  $old
     */
    public static function action(Auditable $model, string $event, array $new = [], array $old = []): void
    {
        $model->auditEvent = $event;
        $model->isCustomEvent = true;
        $model->auditCustomOld = $old;
        $model->auditCustomNew = $new;

        Event::dispatch(new AuditCustom($model));
    }
}
