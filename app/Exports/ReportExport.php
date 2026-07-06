<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;

/**
 * Generic xlsx export for any ReportService dataset.
 */
class ReportExport implements FromArray, ShouldAutoSize, WithHeadings
{
    public function __construct(
        private readonly array $columns,
        private readonly array $rows,
        private readonly array $totals = [],
    ) {}

    public function headings(): array
    {
        return array_column($this->columns, 'label');
    }

    public function array(): array
    {
        $keys = array_column($this->columns, 'key');

        $data = array_map(
            fn ($row) => array_map(fn ($key) => $row[$key] ?? '', $keys),
            $this->rows,
        );

        if ($this->totals !== []) {
            $data[] = array_map(function ($key, $index) {
                if (isset($this->totals[$key])) {
                    return $this->totals[$key];
                }

                return $index === 0 ? 'TOTAL' : '';
            }, $keys, array_keys($keys));
        }

        return $data;
    }
}
