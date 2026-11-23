<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStrictNullComparison;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Generic xlsx export for any ReportService dataset.
 */
class ReportExport extends DefaultValueBinder implements FromArray, ShouldAutoSize, WithCustomValueBinder, WithHeadings, WithStrictNullComparison, WithStyles
{
    public function __construct(
        private readonly array $columns,
        private readonly array $rows,
        private readonly array $totals = [],
        private readonly array $sections = [],
        private readonly ?string $sectionTitle = null,
        private readonly ?string $context = null,
        private readonly array $notes = [],
    ) {}

    public function headings(): array
    {
        $headings = array_column($this->columns, 'label');
        if ($this->sectionTitle === null) return $headings;

        $intro = $this->context === null ? [] : [[$this->context]];

        return [...$intro, ...array_map(fn ($note) => [$note], $this->notes), [], [$this->sectionTitle], $headings];
    }

    public function array(): array
    {
        $data = $this->tableRows($this->columns, $this->rows, $this->totals);
        foreach ($this->sections as $section) {
            $data[] = [null];
            $data[] = [$section['title']];
            $data[] = array_column($section['columns'], 'label');
            array_push($data, ...$this->tableRows($section['columns'], $section['rows'], $section['totals']));
        }
        return $data;
    }

    public function bindValue(Cell $cell, mixed $value): bool
    {
        // Report fields are data, never spreadsheet formulas.
        if (is_string($value) && str_starts_with($value, '=')) {
            $cell->setValueExplicit($value, DataType::TYPE_STRING);

            return true;
        }

        return parent::bindValue($cell, $value);
    }

    public function styles(Worksheet $sheet): void
    {
        if ($this->sectionTitle === null) return;

        $last = Coordinate::stringFromColumnIndex(count($this->columns));
        $headingCount = count($this->headings());
        for ($i = 1; $i <= $headingCount - 3; $i++) {
            $range = "A{$i}:{$last}{$i}";
            $sheet->mergeCells($range)->getStyle($range)->getAlignment()->setWrapText(true);
            $sheet->getRowDimension($i)->setRowHeight($i === 1 ? 18 : 28);
        }

        $header = $headingCount;
        foreach ([['columns' => $this->columns, 'rows' => $this->rows, 'totals' => $this->totals], ...$this->sections] as $section) {
            $total = $header + count($section['rows']) + (int) ($section['totals'] !== []);
            $sheet->getStyle('A'.($header - 1).":{$last}{$header}")->getFont()->setBold(true);
            $sheet->getStyle("A{$total}:{$last}{$total}")->getFont()->setBold(true);
            foreach ($section['columns'] as $index => $column) {
                if (($column['format'] ?? null) !== 'money' || $total === $header) continue;
                $letter = Coordinate::stringFromColumnIndex($index + 1);
                $sheet->getStyle($letter.($header + 1).":{$letter}{$total}")->getNumberFormat()->setFormatCode('#,##0.00');
            }
            $header = $total + 3;
        }
    }

    private function tableRows(array $columns, array $rows, array $totals): array
    {
        $keys = array_column($columns, 'key');

        $data = array_map(
            fn ($row) => array_map(fn ($key) => $row[$key] ?? '', $keys),
            $rows,
        );

        if ($totals !== []) {
            $data[] = array_map(function ($key, $index) use ($totals) {
                if (isset($totals[$key])) {
                    return $totals[$key];
                }

                return $index === 0 ? 'TOTAL' : '';
            }, $keys, array_keys($keys));
        }

        return $data;
    }
}
