<?php

namespace App\Imports;

use App\Models\Customer;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

/**
 * Upserts pharmacy customers by name. Collects per-row errors.
 */
class CustomersImport implements ToCollection, WithHeadingRow
{
    public int $created = 0;

    public int $updated = 0;

    /** @var array<int, string> */
    public array $errors = [];

    public static function headings(): array
    {
        return [
            'name', 'owner_name', 'phone', 'whatsapp', 'email', 'city', 'region', 'address',
            'drug_license_no', 'ntn', 'strn', 'cnic', 'credit_limit', 'credit_days',
        ];
    }

    public function collection(Collection $rows): void
    {
        foreach ($rows as $index => $row) {
            $rowNumber = $index + 2;

            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                $this->errors[$rowNumber] = 'Missing pharmacy name.';

                continue;
            }

            foreach (['credit_limit', 'credit_days'] as $numeric) {
                $value = $row[$numeric] ?? null;
                if ($value !== null && $value !== '' && ! is_numeric($value)) {
                    $this->errors[$rowNumber] = "Column {$numeric} must be a number, got \"{$value}\".";

                    continue 2;
                }
            }

            $attributes = [
                'owner_name' => trim((string) ($row['owner_name'] ?? '')) ?: null,
                'phone' => trim((string) ($row['phone'] ?? '')) ?: null,
                'whatsapp' => trim((string) ($row['whatsapp'] ?? '')) ?: null,
                'email' => trim((string) ($row['email'] ?? '')) ?: null,
                'city' => trim((string) ($row['city'] ?? '')) ?: null,
                'region' => trim((string) ($row['region'] ?? '')) ?: null,
                'address' => trim((string) ($row['address'] ?? '')) ?: null,
                'drug_license_no' => trim((string) ($row['drug_license_no'] ?? '')) ?: null,
                'ntn' => trim((string) ($row['ntn'] ?? '')) ?: null,
                'strn' => trim((string) ($row['strn'] ?? '')) ?: null,
                'cnic' => trim((string) ($row['cnic'] ?? '')) ?: null,
                'credit_limit' => (float) ($row['credit_limit'] ?? 0),
                'credit_days' => (int) ($row['credit_days'] ?? 0),
                'status' => 'active',
            ];

            $customer = Customer::withTrashed()->where('name', $name)->first();

            if ($customer) {
                if ($customer->trashed()) {
                    $customer->restore();
                }
                $customer->update($attributes);
                $this->updated++;
            } else {
                Customer::create($attributes + ['name' => $name]);
                $this->created++;
            }
        }
    }
}
