<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;

/** Empty sheet with just the expected import headings. */
class TemplateExport implements FromArray, ShouldAutoSize, WithHeadings
{
    public function __construct(private readonly array $headings) {}

    public function headings(): array
    {
        return $this->headings;
    }

    public function array(): array
    {
        return [];
    }
}
