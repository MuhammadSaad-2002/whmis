<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NumberSeries extends Model
{
    protected $guarded = [];

    protected $table = 'number_series';

    /**
     * Canonical doc_type => prefix defaults. Single source of truth for both the
     * seeder and the on-demand self-heal in NumberSeriesService.
     *
     * @var array<string, string>
     */
    public const DEFAULTS = [
        'purchase_invoice' => 'PI',
        'sales_invoice' => 'SI',
        'payment_in' => 'RCV',
        'payment_out' => 'PAY',
        'stock_adjustment' => 'ADJ',
        'booking' => 'BK',
        'sales_return' => 'SR',
        'purchase_return' => 'PR',
    ];
}
