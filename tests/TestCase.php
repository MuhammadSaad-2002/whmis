<?php

namespace Tests;

use App\Models\License;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Schema;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Mirror production (SystemSeeder seeds an initial license): make the test
        // environment licensed by default so the EnsureLicensed gate doesn't lock
        // out every HTTP test. Tests that exercise the unlicensed/expired state
        // (LicenseTest) clear this in their own setUp.
        if (Schema::hasTable('licenses') && License::count() === 0) {
            License::create([
                'key' => 'WHMIS-TEST-0000-0000',
                'expires_at' => now()->addYear(),
                'activated_at' => now(),
            ]);
        }
    }
}
