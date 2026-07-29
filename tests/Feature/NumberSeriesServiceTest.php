<?php

namespace Tests\Feature;

use App\Models\NumberSeries;
use App\Services\NumberSeriesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NumberSeriesServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): NumberSeriesService
    {
        return app(NumberSeriesService::class);
    }

    public function test_it_creates_a_missing_series_on_demand(): void
    {
        // Empty table — simulates a live DB where the seeder never ran.
        $this->assertDatabaseCount('number_series', 0);

        $number = $this->service()->next('purchase_invoice');

        $this->assertSame('PI-'.now()->format('Y').'-0001', $number);
        $this->assertDatabaseHas('number_series', ['doc_type' => 'purchase_invoice', 'prefix' => 'PI']);
    }

    public function test_it_increments_on_each_call(): void
    {
        $year = now()->format('Y');

        $this->assertSame("SI-{$year}-0001", $this->service()->next('sales_invoice'));
        $this->assertSame("SI-{$year}-0002", $this->service()->next('sales_invoice'));
        $this->assertSame("SI-{$year}-0003", $this->service()->next('sales_invoice'));
    }

    public function test_it_falls_back_to_an_uppercase_prefix_for_an_unmapped_type(): void
    {
        $number = $this->service()->next('quotation');

        $this->assertSame('QUOTATION-'.now()->format('Y').'-0001', $number);
    }

    public function test_an_existing_seeded_row_is_respected(): void
    {
        NumberSeries::create([
            'doc_type' => 'booking',
            'prefix' => 'BK',
            'next_number' => 42,
            'padding' => 4,
            'yearly' => true,
        ]);

        $this->assertSame('BK-'.now()->format('Y').'-0042', $this->service()->next('booking'));
    }
}
