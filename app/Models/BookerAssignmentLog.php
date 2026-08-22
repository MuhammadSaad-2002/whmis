<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only log row: one per customer↔booker assign / unassign. Never updated.
 */
class BookerAssignmentLog extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function booker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'booker_id');
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
