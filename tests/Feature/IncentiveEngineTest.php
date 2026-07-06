<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Services\IncentiveEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncentiveEngineTest extends TestCase
{
    use RefreshDatabase;

    private IncentiveEngine $engine;

    private Company $company;

    private Customer $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = app(IncentiveEngine::class);
        $this->company = Company::create(['name' => 'Getz Pharma']);
        $this->customer = Customer::create(['name' => 'City Pharmacy']);
        $this->product = Product::create([
            'name' => 'Panadol', 'company_id' => $this->company->id, 'trade_price' => 100,
        ]);
    }

    private function rule(array $attributes): IncentiveRule
    {
        return IncentiveRule::create($attributes + ['name' => 'Rule', 'active' => true]);
    }

    public function test_proportional_qty_bonus_repeats_per_base_quantity(): void
    {
        $rule = $this->rule(['rule_type' => 'qty_bonus', 'base_qty' => 10, 'bonus_qty' => 2]);

        // 25 on a 10+2 deal -> two full slabs -> 4 bonus
        $this->assertEquals(['bonus_qty' => 4.0], $this->engine->effect($rule, 25, 100));
        $this->assertEquals(['bonus_qty' => 0.0], $this->engine->effect($rule, 9, 100));
    }

    public function test_slab_bonus_picks_highest_matching_slab(): void
    {
        $rule = $this->rule(['rule_type' => 'slab_bonus', 'slabs' => [
            ['min_qty' => 10, 'max_qty' => 49, 'bonus_qty' => 1],
            ['min_qty' => 50, 'max_qty' => null, 'bonus_qty' => 8],
        ]]);

        $this->assertEquals(['bonus_qty' => 1.0], $this->engine->effect($rule, 20, 100));
        $this->assertEquals(['bonus_qty' => 8.0], $this->engine->effect($rule, 60, 100));
        $this->assertEquals(['bonus_qty' => 0.0], $this->engine->effect($rule, 5, 100));
    }

    public function test_discount_and_price_override_effects(): void
    {
        $percent = $this->rule(['rule_type' => 'percent_discount', 'value' => 10]);
        $fixed = $this->rule(['rule_type' => 'fixed_discount', 'value' => 150]);
        $override = $this->rule(['rule_type' => 'price_override', 'value' => 92.5]);

        $this->assertEquals(['discount_percent' => 10.0], $this->engine->effect($percent, 10, 100));
        $this->assertEquals(['discount_amount' => 150.0], $this->engine->effect($fixed, 10, 100));
        $this->assertEquals(['trade_price' => 92.5], $this->engine->effect($override, 10, 100));
    }

    public function test_customer_specific_rule_beats_product_and_company_rules(): void
    {
        $this->rule(['name' => 'Company-wide', 'rule_type' => 'percent_discount', 'value' => 5, 'company_id' => $this->company->id]);
        $this->rule(['name' => 'Product-wide', 'rule_type' => 'percent_discount', 'value' => 8, 'product_id' => $this->product->id]);
        $this->rule(['name' => 'Customer deal', 'rule_type' => 'percent_discount', 'value' => 15, 'customer_id' => $this->customer->id, 'product_id' => $this->product->id]);

        $resolved = $this->engine->resolve($this->product->id, $this->customer->id, 10, 100);
        $this->assertSame('Customer deal', $resolved['rule']->name);

        // Without the customer context, the product rule wins.
        $resolved = $this->engine->resolve($this->product->id, null, 10, 100);
        $this->assertSame('Product-wide', $resolved['rule']->name);

        $ordered = $this->engine->applicable($this->product->id, $this->customer->id, 10);
        $this->assertSame(['Customer deal', 'Product-wide', 'Company-wide'], $ordered->pluck('name')->all());
    }

    public function test_date_window_and_min_qty_gate_rules(): void
    {
        $this->rule(['name' => 'Expired', 'rule_type' => 'percent_discount', 'value' => 10,
            'date_from' => now()->subMonths(2)->toDateString(), 'date_to' => now()->subMonth()->toDateString()]);
        $this->rule(['name' => 'Big orders only', 'rule_type' => 'percent_discount', 'value' => 20, 'min_qty' => 100]);
        $this->rule(['name' => 'Inactive', 'rule_type' => 'percent_discount', 'value' => 30, 'active' => false]);

        $this->assertCount(0, $this->engine->applicable($this->product->id, null, 10));
        $this->assertSame(
            ['Big orders only'],
            $this->engine->applicable($this->product->id, null, 150)->pluck('name')->all(),
        );
    }

    public function test_rules_scoped_to_other_entities_do_not_match(): void
    {
        $otherCompany = Company::create(['name' => 'Other Co']);
        $otherProduct = Product::create(['name' => 'Other Med', 'company_id' => $otherCompany->id]);
        $otherCustomer = Customer::create(['name' => 'Other Pharmacy']);

        $this->rule(['rule_type' => 'percent_discount', 'value' => 10, 'product_id' => $otherProduct->id]);
        $this->rule(['rule_type' => 'percent_discount', 'value' => 10, 'company_id' => $otherCompany->id]);
        $this->rule(['rule_type' => 'percent_discount', 'value' => 10, 'customer_id' => $otherCustomer->id]);

        $this->assertCount(0, $this->engine->applicable($this->product->id, $this->customer->id, 10));
    }
}
