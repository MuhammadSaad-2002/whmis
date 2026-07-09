<?php

namespace App\Support;

use App\Models\Batch;
use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Collection;

/**
 * Rewrites reference-id values inside audit old/new value bags to human names
 * (e.g. customer_id 5 → "City Pharmacy", created_by 3 → "Ahmed Raza").
 *
 * Built once from a page of audits so referenced records are batch-loaded — a
 * handful of queries total, no N+1. Unknown/deleted ids fall back to "#<id>".
 */
class AuditReferenceResolver
{
    /**
     * Foreign-key column => [model class, display attribute].
     *
     * @var array<string, array{0: class-string, 1: string}>
     */
    private const MAP = [
        'customer_id' => [Customer::class, 'name'],
        'company_id' => [Company::class, 'name'],
        'product_id' => [Product::class, 'name'],
        'warehouse_id' => [Warehouse::class, 'name'],
        'category_id' => [ProductCategory::class, 'name'],
        'batch_id' => [Batch::class, 'batch_number'],
        'sales_invoice_id' => [SalesInvoice::class, 'invoice_number'],
        'purchase_invoice_id' => [PurchaseInvoice::class, 'invoice_number'],
        'booking_id' => [Booking::class, 'booking_number'],
        'incentive_rule_id' => [IncentiveRule::class, 'name'],
        'created_by' => [User::class, 'name'],
        'updated_by' => [User::class, 'name'],
        'approved_by' => [User::class, 'name'],
        'booker_id' => [User::class, 'name'],
        'user_id' => [User::class, 'name'],
    ];

    /** @var array<string, array<string, string>> column => [id => name] */
    private array $names = [];

    /**
     * @param  Collection<int, object>  $audits
     */
    public function __construct(Collection $audits)
    {
        // Collect the ids referenced by each mapped column across the page.
        $idsByColumn = [];
        foreach ($audits as $audit) {
            foreach ([$audit->old_values ?? [], $audit->new_values ?? []] as $bag) {
                foreach ((array) $bag as $column => $value) {
                    if (isset(self::MAP[$column]) && $value !== null && $value !== '') {
                        $idsByColumn[$column][(string) $value] = $value;
                    }
                }
            }
        }

        // Batch-load display names per model, sharing one query across columns
        // that point at the same model (e.g. all the *_by user columns).
        foreach ($idsByColumn as $column => $ids) {
            [$model, $display] = self::MAP[$column];
            $this->names[$column] = $model::whereIn('id', array_values($ids))
                ->pluck($display, 'id')
                ->mapWithKeys(fn ($name, $id) => [(string) $id => (string) $name])
                ->all();
        }
    }

    /**
     * Return the value bag with mapped reference ids replaced by display names.
     *
     * @param  array<string, mixed>|null  $values
     * @return array<string, mixed>
     */
    public function apply(?array $values): array
    {
        $values = $values ?? [];

        foreach ($values as $column => $value) {
            if (! isset(self::MAP[$column]) || $value === null || $value === '') {
                continue;
            }
            $values[$column] = $this->names[$column][(string) $value] ?? "#{$value}";
        }

        return $values;
    }
}
