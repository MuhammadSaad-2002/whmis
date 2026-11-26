<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CustomerLicenseTest extends TestCase
{
    use RefreshDatabase;

    private const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF";

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        Storage::fake('local');
    }

    public function test_customer_manager_can_upload_view_and_download_a_license(): void
    {
        $this->actingAs(User::role('Super Admin')->firstOrFail());
        $this->post(route('customers.store'), [
            'name' => 'Test Pharmacy',
            'status' => 'active',
            'drug_license_no' => 'DL-123',
            'drug_license_expires_on' => '2027-04-30',
            'drug_license_file' => UploadedFile::fake()->createWithContent('license.pdf', self::PDF),
        ])->assertRedirect()->assertSessionHasNoErrors();
        $customer = Customer::firstOrFail();
        $this->assertSame('DL-123', $customer->drug_license_no);
        $this->assertSame('2027-04-30', $customer->drug_license_expires_on->toDateString());
        $this->assertStringStartsWith('customer-licenses/', $customer->drug_license_path);
        Storage::disk('local')->assertExists($customer->drug_license_path);

        $this->get(route('customers.index'))->assertInertia(fn (Assert $page) => $page
            ->where('canViewLicense', true)
            ->where('customers.data.0.drug_license.number', 'DL-123')
            ->where('customers.data.0.drug_license.expires_on', '2027-04-30')
            ->where('customers.data.0.drug_license.has_file', true)
            ->missing('customers.data.0.drug_license_path'));
        $this->assertArrayNotHasKey('drug_license_expires_on', $customer->toArray());

        $download = $this->get(route('customers.license.download', $customer))
            ->assertDownload("customer-{$customer->id}-licence.pdf")
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('no-store', $download->headers->get('Cache-Control'));
        $this->assertSame(self::PDF, $download->streamedContent());
    }

    public function test_an_edit_without_an_upload_keeps_the_file_and_an_upload_can_replace_it(): void
    {
        $this->actingAs(User::role('Super Admin')->firstOrFail());
        Storage::disk('local')->put('customer-licenses/old.pdf', self::PDF);
        $customer = Customer::create([
            'name' => 'Test Pharmacy', 'status' => 'active', 'drug_license_path' => 'customer-licenses/old.pdf',
            'drug_license_expires_on' => '2027-04-30',
        ]);

        $this->put(route('customers.update', $customer), [
            'name' => 'Test Pharmacy', 'status' => 'active', 'drug_license_expires_on' => '2028-05-01',
        ])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame('customer-licenses/old.pdf', $customer->refresh()->drug_license_path);
        $this->assertSame('2028-05-01', $customer->drug_license_expires_on->toDateString());

        $this->post(route('customers.update', $customer), [
            '_method' => 'PUT', 'name' => 'Test Pharmacy', 'status' => 'active',
            'drug_license_file' => UploadedFile::fake()->image('licence.png'),
        ])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertStringEndsWith('.png', $customer->refresh()->drug_license_path);
        Storage::disk('local')->assertExists($customer->drug_license_path);
        Storage::disk('local')->assertMissing('customer-licenses/old.pdf');
    }

    public function test_bookers_neither_receive_license_details_nor_download_or_change_them(): void
    {
        $booker = User::factory()->create();
        $booker->assignRole('Booker');
        $customer = Customer::create([
            'name' => 'Assigned Pharmacy', 'status' => 'active', 'booker_id' => $booker->id,
            'drug_license_no' => 'DL-SECRET', 'drug_license_expires_on' => '2027-04-30', 'drug_license_path' => 'customer-licenses/private.pdf',
        ]);

        $this->actingAs($booker)->get(route('customers.index'))->assertInertia(fn (Assert $page) => $page
            ->where('canViewLicense', false)->where('customers.data.0.id', $customer->id)
            ->missing('customers.data.0.drug_license')->missing('customers.data.0.drug_license_no')
            ->missing('customers.data.0.drug_license_expires_on')->missing('customers.data.0.drug_license_path'));
        $this->put(route('customers.update', $customer), ['name' => 'Unauthorized name', 'status' => 'active'])->assertForbidden();
        $this->get(route('customers.license.download', $customer))->assertForbidden();

        $booker->givePermissionTo('customers.manage');
        $this->put(route('customers.update', $customer), [
            'name' => 'Assigned Pharmacy', 'status' => 'active', 'drug_license_expires_on' => '2028-05-01',
        ])->assertForbidden();
        $this->post(route('customers.store'), [
            'name' => 'Unauthorized license', 'status' => 'active',
            'drug_license_file' => UploadedFile::fake()->createWithContent('license.pdf', self::PDF),
        ])->assertForbidden();
        $this->get(route('customers.license.download', $customer))->assertForbidden();
        $this->assertSame('2027-04-30', $customer->refresh()->drug_license_expires_on->toDateString());
    }

    public function test_invalid_files_and_dates_are_rejected_and_no_attachment_returns_not_found(): void
    {
        $this->actingAs(User::role('Super Admin')->firstOrFail());
        $html = UploadedFile::fake()->createWithContent('content.html', '<html><body>Text</body></html>');
        // Use a real upload wrapper so validation inspects the file contents,
        // rather than the fake upload's MIME type derived from its filename.
        $disguised = new UploadedFile($html->getPathname(), 'fake.pdf', 'application/pdf', null, true);
        $this->post(route('customers.store'), [
            'name' => 'Invalid', 'status' => 'active', 'drug_license_expires_on' => '2027-02-30',
            'drug_license_file' => $disguised,
        ])->assertSessionHasErrors(['drug_license_expires_on', 'drug_license_file']);
        $this->post(route('customers.store'), [
            'name' => 'Too large', 'status' => 'active',
            'drug_license_file' => UploadedFile::fake()->create('big.pdf', 10241, 'application/pdf'),
        ])->assertSessionHasErrors('drug_license_file');
        $this->assertSame([], Storage::disk('local')->allFiles('customer-licenses'));
        $this->assertDatabaseCount('customers', 0);
        $customer = Customer::create(['name' => 'No attachment', 'status' => 'active']);
        $this->get(route('customers.license.download', $customer))->assertNotFound();
    }

    public function test_license_downloads_and_changes_respect_customer_scope(): void
    {
        $staff = User::factory()->create();
        $staff->givePermissionTo(['customers.view', 'customers.manage']);
        Storage::disk('local')->put('customer-licenses/example.pdf', self::PDF);
        $unassigned = Customer::create(['name' => 'Not assigned', 'status' => 'active', 'drug_license_path' => 'customer-licenses/example.pdf']);
        $assigned = Customer::create([
            'name' => 'Assigned', 'status' => 'active', 'booker_id' => $staff->id, 'drug_license_path' => 'customer-licenses/example.pdf',
        ]);

        $this->actingAs($staff)->get(route('customers.license.download', $unassigned))->assertNotFound();
        $this->put(route('customers.update', $unassigned), [
            'name' => 'Not assigned', 'status' => 'active', 'drug_license_expires_on' => '2027-04-30',
        ])->assertNotFound();
        $this->get(route('customers.license.download', $assigned))->assertDownload();
    }
}
