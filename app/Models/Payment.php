<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Payment extends Model implements AuditableContract
{
    use Auditable;

    public const DIRECTION_IN = 'in';   // receipt from customer
    public const DIRECTION_OUT = 'out'; // payment to supplier

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'payment_date' => 'date',
            'cheque_date' => 'date',
            'amount' => 'decimal:2',
        ];
    }

    public function party(): MorphTo
    {
        return $this->morphTo();
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
