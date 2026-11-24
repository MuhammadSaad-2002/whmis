<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinanceWorkItem extends Model
{
    protected $guarded = [];

    protected function casts(): array { return ['payload' => 'array']; }
}
