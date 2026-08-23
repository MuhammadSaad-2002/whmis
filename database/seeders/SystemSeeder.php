<?php

namespace Database\Seeders;

use App\Models\License;
use App\Models\NumberSeries;
use App\Models\Warehouse;
use App\Services\LicenseService;
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

        // Seed an initial one-month license so a fresh/upgraded install is not
        // instantly locked out. Renewals are issued from the License screen.
        if (License::count() === 0) {
            app(LicenseService::class)->activate(notes: 'Initial license (seeded).');
        }
    }
}
