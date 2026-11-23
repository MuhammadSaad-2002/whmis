<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerDeliverySchedule extends Model
{
    protected $fillable = ['booking_days', 'delivery_days', 'salesman_id', 'delivery_enabled_at'];

    protected $casts = ['booking_days' => 'array', 'delivery_days' => 'array', 'delivery_enabled_at' => 'datetime'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
