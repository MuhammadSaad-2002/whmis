<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Customer extends Model implements AuditableContract
{
    use Auditable, SoftDeletes;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'credit_limit' => 'decimal:2',
        ];
    }

    public function salesInvoices(): HasMany
    {
        return $this->hasMany(SalesInvoice::class);
    }

    public function ledgerEntries(): MorphMany
    {
        return $this->morphMany(LedgerEntry::class, 'party');
    }

    /** The single booker credited with this customer's sales (reporting). */
    public function primaryBooker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'booker_id');
    }

    /** All bookers who may see/book this customer (primary is also synced here). */
    public function bookers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'booker_customer', 'customer_id', 'booker_id')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /** Customers this booker owns: primary booker OR present in the pivot. */
    public function scopeForBooker($query, int $bookerId)
    {
        return $query->where(fn ($w) => $w
            ->where('booker_id', $bookerId)
            ->orWhereHas('bookers', fn ($b) => $b->where('users.id', $bookerId)));
    }

    /** Receivable balance: debit - credit. */
    public function outstandingBalance(): float
    {
        return (float) $this->ledgerEntries()
            ->selectRaw('COALESCE(SUM(debit - credit), 0) as balance')
            ->value('balance');
    }
}
