<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookerVisit extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['visit_date' => 'date:Y-m-d']; }
    public function customer() { return $this->belongsTo(Customer::class); }
}
