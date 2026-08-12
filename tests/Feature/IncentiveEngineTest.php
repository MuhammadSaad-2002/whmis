<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Models\User;
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

    public function test_single_open_ended_slab_repeats_bonus(): void
    {
        // "Every 10 → 1 bonus" as a single open-ended slab: 45 qty -> 4 bonus.
        $rule = $this->rule(['rule_type' => 'slab_bonus', 'slabs' => [
            ['min_qty' => 10, 'max_qty' => null, 'bonus_qty' => 1],
        ]]);

        $this->assertEquals(['bonus_qty' => 4.0], $this->engine->effect($rule, 45, 100));
        $this->assertEquals(['bonus_qty' => 1.0], $this->engine->effect($rule, 10, 100));
        $this->assertEquals(['bonus_qty' => 0.0], $this->engine->effect($rule, 5, 100));
    }

    public function test_multi_range_slab_stays_tiered_not_repeating(): void
    {
        // Two explicit ranges must NOT repeat — 25 stays in the 20–29 tier (2).
        $rule = $this->rule(['rule_type' => 'slab_bonus', 'slabs' => [
            ['min_qty' => 10, 'max_qty' => 19, 'bonus_qty' => 1],
            ['min_qty' => 20, 'max_qty' => 29, 'bonus_qty' => 2],
        ]]);

        $this->assertEquals(['bonus_qty' => 2.0], $this->engine->effect($rule, 25, 100));
        $this->assertEquals(['bonus_qty' => 1.0], $this->engine->effect($rule, 15, 100));
    }

    public function test_lookup_rules_endpoint_returns_recompute_params(): void
    {
        $this->actingAs(User::factory()->create());
        $this->rule(['rule_type' => 'slab_bonus', 'product_id' => $this->product->id, 'slabs' => [
            ['min_qty' => 10, 'max_qty' => null, 'bonus_qty' => 1],
        ]]);

        $response = $this->getJson(route('lookup.rules', [
            'product_id' => $this->product->id, 'qty' => 45, 'price' => 100,
        ]));

        $response->assertOk()->assertJsonFragment([
            'rule_type' => 'slab_bonus',
            'slabs' => [['min_qty' => 10, 'max_qty' => null, 'bonus_qty' => 1]],
        ]);
        // Effect at qty 45 confirms the repeating slab is computed server-side.
        $this->assertEquals(4.0, $response->json('0.effect.bonus_qty'));
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

    public function test_combine_sums_bonuses_and_combines_discounts(): void
    {
        $qtyBonus = $this->rule(['rule_type' => 'qty_bonus', 'base_qty' => 10, 'bonus_qty' => 2, 'product_id' => $this->product->id]);
        $slabBonus = $this->rule(['rule_type' => 'slab_bonus', 'product_id' => $this->product->id, 'slabs' => [
            ['min_qty' => 10, 'max_qty' => null, 'bonus_qty' => 1],
        ]]);
        $percent = $this->rule(['rule_type' => 'percent_discount', 'value' => 10, 'product_id' => $this->product->id]);
        $fixed = $this->rule(['rule_type' => 'fixed_discount', 'value' => 150, 'product_id' => $this->product->id]);

        // 20 units @ 100 -> gross 2000. qty_bonus: 20/10*2=4, slab: 20/10*1=2 => 6 bonus.
        // Discounts: 10% of 2000 = 200, plus fixed 150 => 350.
        $result = $this->engine->combine(
            $this->product->id, $this->customer->id, 20, 100,
            [$qtyBonus->id, $slabBonus->id, $percent->id, $fixed->id],
        );

        $this->assertEquals(6.0, $result['bonus_qty']);
        $this->assertEquals(350.0, $result['incentive_discount']);
        $this->assertEquals(100.0, $result['trade_price']);
        $this->assertCount(4, $result['breakdown']);
    }

    public function test_combine_keeps_only_one_rule_per_type(): void
    {
        // The winner is deterministic by priority (higher first).
        $winner = $this->rule(['name' => 'Priority 25%', 'rule_type' => 'percent_discount', 'value' => 25, 'product_id' => $this->product->id, 'priority' => 100]);
        $loser = $this->rule(['name' => 'Low 10%', 'rule_type' => 'percent_discount', 'value' => 10, 'product_id' => $this->product->id, 'priority' => 1]);

        $result = $this->engine->combine(
            $this->product->id, $this->customer->id, 10, 100, [$loser->id, $winner->id],
        );

        // Two of the same type requested -> only one survives (25% of 1000 = 250).
        $this->assertCount(1, $result['breakdown']);
        $this->assertEquals($winner->id, $result['breakdown'][0]['rule_id']);
        $this->assertEquals(250.0, $result['incentive_discount']);
    }

    public function test_combine_drops_rules_that_no_longer_apply(): void
    {
        $good = $this->rule(['rule_type' => 'percent_discount', 'value' => 10, 'product_id' => $this->product->id]);
        $bigOnly = $this->rule(['rule_type' => 'fixed_discount', 'value' => 500, 'product_id' => $this->product->id, 'min_qty' => 100]);

        // qty 10 is below the fixed rule's min_qty 100, so it is silently dropped.
        $result = $this->engine->combine(
            $this->product->id, $this->customer->id, 10, 100, [$good->id, $bigOnly->id],
        );

        $this->assertCount(1, $result['breakdown']);
        $this->assertEquals(100.0, $result['incentive_discount']);
    }

    public function test_combine_price_override_sets_rate_and_value_given(): void
    {
        $override = $this->rule(['rule_type' => 'price_override', 'value' => 92.5, 'product_id' => $this->product->id]);

        // Base price 100, override 92.5, qty 10 -> concession = (100-92.5)*10 = 75.
        $result = $this->engine->combine(
            $this->product->id, $this->customer->id, 10, 100, [$override->id],
        );

        $this->assertEquals(92.5, $result['trade_price']);
        $this->assertEquals(75.0, $result['breakdown'][0]['value_given']);
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
