<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

class ImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->actingAs(User::where('email', 'admin@whmis.local')->firstOrFail());
    }

    /** Write a real xlsx to a temp path and wrap it as an upload. */
    private function makeXlsxUpload(array $rows, string $name): UploadedFile
    {
        $export = new class($rows) implements FromArray
        {
            public function __construct(private readonly array $rows) {}

            public function array(): array
            {
                return $this->rows;
            }
        };

        $relative = 'test-imports/'.$name;
        Excel::store($export, $relative, 'local');
        $path = storage_path('app/private/'.$relative);
        if (! file_exists($path)) {
            $path = storage_path('app/'.$relative);
        }

        return new UploadedFile($path, $name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
    }

    public function test_products_import_creates_updates_and_reports_bad_rows(): void
    {
        Company::create(['name' => 'Getz Pharma']);
        Product::create(['name' => 'Panadol 500mg', 'company_id' => 1, 'trade_price' => 50]);

        $file = $this->makeXlsxUpload([
            ['name', 'generic_name', 'supplier', 'category', 'pack_size', 'barcode', 'sku', 'purchase_price', 'trade_price', 'retail_price', 'mrp', 'gst_percent', 'default_discount_percent', 'min_stock', 'reorder_level'],
            // Update: existing product gets new trade price.
            ['Panadol 500mg', 'Paracetamol', 'Getz Pharma', 'Analgesic', '10x10', '', '', 80, 100, 120, 130, 0, 0, 0, 50],
            // Create: new product + new supplier on the fly.
            ['Augmentin 625mg', 'Co-Amoxiclav', 'GSK', 'Antibiotic', '1x6', '', '', 250, 300, 350, 380, 0, 0, 0, 20],
            // Bad row: missing supplier.
            ['Orphan Med', '', '', '', '', '', '', 10, 12, 15, 16, 0, 0, 0, 0],
            // Bad row: non-numeric price.
            ['Broken Med', '', 'GSK', '', '', '', '', 'abc', 12, 15, 16, 0, 0, 0, 0],
        ], 'products.xlsx');

        $response = $this->post(route('products.import'), ['file' => $file]);

        $response->assertRedirect()->assertSessionHas('error'); // errors present → summary in error flash
        $error = session('error');
        $this->assertStringContainsString('1 created, 1 updated', $error);
        $this->assertStringContainsString('Row 4: Missing supplier.', $error);
        $this->assertStringContainsString('Row 5', $error);

        $this->assertEqualsWithDelta(100.0, (float) Product::where('name', 'Panadol 500mg')->first()->trade_price, 0.01);
        $this->assertNotNull(Product::where('name', 'Augmentin 625mg')->first());
        $this->assertNotNull(Company::where('name', 'GSK')->first());
        $this->assertNull(Product::where('name', 'Orphan Med')->first());
        $this->assertSame(2, Product::count());
    }

    public function test_customers_import_and_clean_run_flashes_success(): void
    {
        $file = $this->makeXlsxUpload([
            ['name', 'owner_name', 'phone', 'whatsapp', 'email', 'city', 'region', 'address', 'drug_license_no', 'ntn', 'strn', 'cnic', 'credit_limit', 'credit_days'],
            ['City Pharmacy', 'Ali Raza', '0300-1234567', '', '', 'Lahore', '', '', 'DL-991', '', '', '', 50000, 30],
        ], 'customers.xlsx');

        $this->post(route('customers.import'), ['file' => $file])
            ->assertRedirect()
            ->assertSessionHas('success');

        $customer = \App\Models\Customer::where('name', 'City Pharmacy')->firstOrFail();
        $this->assertSame('Lahore', $customer->city);
        $this->assertEqualsWithDelta(50000.0, (float) $customer->credit_limit, 0.01);
    }

    public function test_template_downloads_and_permission_enforced(): void
    {
        $this->get(route('products.template'))
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $booker = User::factory()->create();
        $booker->assignRole('Booker'); // products.view only, no manage
        $this->actingAs($booker);
        $this->post(route('products.import'), [])->assertForbidden();
    }
}
