<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Dispatch extends Model
{
    protected $guarded = [];
    public function events() { return $this->hasMany(DispatchEvent::class)->orderBy('id'); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
}
