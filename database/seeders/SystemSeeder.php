<?php

namespace Database\Seeders;

use App\Models\NumberSeries;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class SystemSeeder extends Seeder
{
    public function run(): void
    {
        Warehouse::firstOrCreate(
            ['code' => 'MAIN'],
            ['name' => 'Main Warehouse', 'is_default' => true, 'status' => 'active']
        );

        $series = [
            'purchase_invoice' => 'PI',
            'sales_invoice' => 'SI',
            'payment_in' => 'RCV',
            'payment_out' => 'PAY',
            'stock_adjustment' => 'ADJ',
            'booking' => 'BK',
            'sales_return' => 'SR',
            'purchase_return' => 'PR',
        ];

        foreach ($series as $docType => $prefix) {
            NumberSeries::firstOrCreate(
                ['doc_type' => $docType],
                ['prefix' => $prefix, 'next_number' => 1, 'padding' => 4, 'yearly' => true]
            );
        }
    }
}
