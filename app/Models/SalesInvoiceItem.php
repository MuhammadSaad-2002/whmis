<?php

namespace App\Models;

use App\Support\Paisa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesInvoiceItem extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:2',
            'bonus_quantity' => 'decimal:2',
            'trade_price' => 'decimal:2',
            'discount_percent' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'incentive_discount' => 'decimal:2',
            'gst_percent' => 'decimal:2',
            'gst_amount' => 'decimal:2',
            'net_amount' => 'decimal:2',
            'cost_amount' => 'decimal:4',
            'profit' => 'decimal:2',
            'profit_percent' => 'decimal:2',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(SalesInvoice::class, 'sales_invoice_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function appliedRule(): BelongsTo
    {
        return $this->belongsTo(IncentiveRule::class, 'applied_rule_id');
    }

    public function incentives(): HasMany
    {
        return $this->hasMany(SalesInvoiceItemIncentive::class)->orderBy('sort_order');
    }

    /** Match the saved line total even when a split booking rounded individual awards differently. */
    public function allocatedIncentiveDiscounts(): array
    {
        $discounts = $this->incentives->filter(fn ($award) => in_array($award->rule_type, ['percent_discount', 'fixed_discount'], true));
        $total = Paisa::from($this->incentive_discount);
        $weights = $discounts->map(fn ($award) => Paisa::from($award->discount_amount));
        $sum = $weights->sum();
        $running = $allocated = 0;
        $amounts = [];

        foreach ($discounts as $index => $award) {
            $running += $weights[$index];
            $next = $sum ? (int) round($total * ($running / $sum)) : $total;
            $amounts[$award->id] = ($next - $allocated) / 100;
            $allocated = $next;
        }

        return $amounts;
    }
}
