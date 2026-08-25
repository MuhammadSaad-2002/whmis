<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

/**
 * A stock loan — products received on loan (direction = in) or loaned out
 * (direction = out). Zero money: no ledger, receivable, or revenue. Only
 * physical stock moves and is kept segregated from sellable inventory.
 */
class StockLoan extends Model implements AuditableContract
{
    use Auditable;

    public const DIRECTION_IN = 'in';
    public const DIRECTION_OUT = 'out';

    public const STATUS_PENDING = 'pending';                       // saved draft, not yet posted
    public const STATUS_LOANED = 'loaned';                         // posted, nothing returned
    public const STATUS_PARTIALLY_RETURNED = 'partially_returned'; // some units back
    public const STATUS_RETURNED = 'returned';                     // all units back
    public const STATUS_CLOSED = 'closed';                         // settled/written off (manual)
    public const STATUS_CANCELLED = 'cancelled';                   // reversed

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'loan_date' => 'date',
            'posted_at' => 'datetime',
            'closed_at' => 'datetime',
            'manual_number' => 'boolean',
            'total_quantity' => 'decimal:2',
            'returned_quantity' => 'decimal:2',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(StockLoanItem::class)->orderBy('sort_order');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_id');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by_id');
    }

    public function requestReceivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'request_received_by_id');
    }

    public function handedOverBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handed_over_by_id');
    }

    public function isIn(): bool
    {
        return $this->direction === self::DIRECTION_IN;
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    /** Only a pending (draft) loan can be edited. */
    public function isEditable(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    /** Posted and not yet fully settled — returns may still be recorded. */
    public function isActive(): bool
    {
        return in_array($this->status, [self::STATUS_LOANED, self::STATUS_PARTIALLY_RETURNED], true);
    }

    public function outstandingQuantity(): float
    {
        return max(0, (float) $this->total_quantity - (float) $this->returned_quantity);
    }
}
