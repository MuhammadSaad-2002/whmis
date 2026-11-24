<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DispatchEvent extends Model
{
    public const UPDATED_AT = null;
    protected $guarded = [];
    public function items() { return $this->hasMany(DispatchEventItem::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
    public function pickupLines() { return $this->hasMany(DispatchPickupLine::class); }
}
