<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CollectionFollowUp extends Model
{
    public const UPDATED_AT = null;
    protected $guarded = [];
    protected function casts(): array
    {
        return ['promised_date' => 'date:Y-m-d', 'next_follow_up' => 'date:Y-m-d', 'promised_amount' => 'decimal:2'];
    }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
