<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DispatchEventItem extends Model
{
    public $timestamps = false;
    protected $guarded = [];
    protected function casts(): array { return ['quantity' => 'decimal:2']; }
}
