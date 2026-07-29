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

        foreach (NumberSeries::DEFAULTS as $docType => $prefix) {
            NumberSeries::firstOrCreate(
                ['doc_type' => $docType],
                ['prefix' => $prefix, 'next_number' => 1, 'padding' => 4, 'yearly' => true]
            );
        }
    }
}
