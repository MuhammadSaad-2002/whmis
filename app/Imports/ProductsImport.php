<?php

namespace App\Imports;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductCategory;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

/**
 * Upserts products by (name, supplier). Suppliers/categories are matched by
 * name (created if missing). Collects per-row errors instead of aborting.
 */
class ProductsImport implements ToCollection, WithHeadingRow
{
    public int $created = 0;

    public int $updated = 0;

    /** @var array<int, string> row number => message */
    public array $errors = [];

    public static function headings(): array
    {
        return [
            'name', 'generic_name', 'supplier', 'category', 'pack_size', 'barcode', 'sku',
            'purchase_price', 'trade_price', 'retail_price', 'mrp', 'gst_percent',
            'default_discount_percent', 'min_stock', 'reorder_level',
        ];
    }

    public function collection(Collection $rows): void
    {
        foreach ($rows as $index => $row) {
            $rowNumber = $index + 2; // heading row is 1

            $name = trim((string) ($row['name'] ?? ''));
            $supplierName = trim((string) ($row['supplier'] ?? ''));

            if ($name === '') {
                $this->errors[$rowNumber] = 'Missing product name.';

                continue;
            }
            if ($supplierName === '') {
                $this->errors[$rowNumber] = 'Missing supplier.';

                continue;
            }

            foreach (['purchase_price', 'trade_price', 'retail_price', 'mrp', 'gst_percent', 'default_discount_percent', 'min_stock', 'reorder_level'] as $numeric) {
                $value = $row[$numeric] ?? null;
                if ($value !== null && $value !== '' && ! is_numeric($value)) {
                    $this->errors[$rowNumber] = "Column {$numeric} must be a number, got \"{$value}\".";

                    continue 2;
                }
            }

            $company = Company::firstOrCreate(['name' => $supplierName], ['status' => 'active']);
            $categoryName = trim((string) ($row['category'] ?? ''));
            $category = $categoryName !== '' ? ProductCategory::firstOrCreate(['name' => $categoryName]) : null;

            $attributes = array_filter([
                'generic_name' => trim((string) ($row['generic_name'] ?? '')) ?: null,
                'pack_size' => trim((string) ($row['pack_size'] ?? '')) ?: null,
                'barcode' => trim((string) ($row['barcode'] ?? '')) ?: null,
                'sku' => trim((string) ($row['sku'] ?? '')) ?: null,
            ], fn ($v) => $v !== null) + [
                'category_id' => $category?->id,
                'purchase_price' => (float) ($row['purchase_price'] ?? 0),
                'trade_price' => (float) ($row['trade_price'] ?? 0),
                'retail_price' => (float) ($row['retail_price'] ?? 0),
                'mrp' => (float) ($row['mrp'] ?? 0),
                'tax_percent' => (float) ($row['gst_percent'] ?? 0),
                'default_discount_percent' => (float) ($row['default_discount_percent'] ?? 0),
                'min_stock' => (float) ($row['min_stock'] ?? 0),
                'reorder_level' => (float) ($row['reorder_level'] ?? 0),
                'status' => 'active',
            ];

            $product = Product::withTrashed()
                ->where('name', $name)
                ->where('company_id', $company->id)
                ->first();

            if ($product) {
                if ($product->trashed()) {
                    $product->restore();
                }
                $product->update($attributes);
                $this->updated++;
            } else {
                Product::create($attributes + ['name' => $name, 'company_id' => $company->id]);
                $this->created++;
            }
        }
    }
}
