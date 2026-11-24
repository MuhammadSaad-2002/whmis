<?php

namespace App\Exports;

use App\Support\MoneyDisplay;
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
use PhpOffice\PhpSpreadsheet\RichText\RichText;
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
        if ($value instanceof RichText || (is_string($value) && str_starts_with($value, '='))) {
            $cell->setValueExplicit($value instanceof RichText ? $value->getPlainText() : $value, DataType::TYPE_STRING);

            return true;
        }

        return parent::bindValue($cell, $value);
    }

    public function styles(Worksheet $sheet): void
    {
        $last = Coordinate::stringFromColumnIndex(count($this->columns));
        $headingCount = count($this->headings());
        $header = $this->sectionTitle === null ? 1 : $headingCount;
        for ($i = 1; $i <= $header - 3; $i++) {
            $range = "A{$i}:{$last}{$i}";
            $sheet->mergeCells($range)->getStyle($range)->getAlignment()->setWrapText(true);
            $sheet->getRowDimension($i)->setRowHeight($i === 1 ? 18 : 28);
        }

        foreach ([['columns' => $this->columns, 'rows' => $this->rows, 'totals' => $this->totals], ...$this->sections] as $section) {
            $dataEnd = $header + count($section['rows']);
            $hasTotals = $section['totals'] !== [];
            $total = $dataEnd + (int) $hasTotals;
            $sectionLast = Coordinate::stringFromColumnIndex(count($section['columns']));
            $firstHeading = $this->sectionTitle !== null || $header !== 1 ? $header - 1 : $header;
            $sheet->getStyle("A{$firstHeading}:{$sectionLast}{$header}")->getFont()->setBold(true);
            if ($hasTotals) $sheet->getStyle("A{$total}:{$sectionLast}{$total}")->getFont()->setBold(true);
            foreach ($section['columns'] as $index => $column) {
                $letter = Coordinate::stringFromColumnIndex($index + 1);
                if (($column['wrap'] ?? false) && $section['rows'] !== []) {
                    $sheet->getColumnDimension($letter)->setAutoSize(false)->setWidth(36);
                    $sheet->getStyle($letter.($header + 1).":{$letter}{$dataEnd}")->getAlignment()->setWrapText(true);
                }
                if (($column['format'] ?? null) === 'money') {
                    if ($dataEnd > $header) {
                        $sheet->getStyle($letter.($header + 1).":{$letter}{$dataEnd}")->getNumberFormat()->setFormatCode('#,##0.00');
                    }
                    if ($column['final'] ?? false) {
                        foreach ($section['rows'] as $rowIndex => $row) {
                            $this->styleTotal($sheet, $letter.($header + $rowIndex + 1), $row[$column['key']] ?? null);
                        }
                    }
                    $value = $section['totals'][$column['key']] ?? null;
                    if ($hasTotals) $this->styleTotal($sheet, "{$letter}{$total}", $value);
                }
            }
            $header = $total + 3;
        }
    }

    private function styleTotal(Worksheet $sheet, string $cell, mixed $value): void
    {
        if (! is_numeric($value)) return;
        // The cell remains numeric for Excel formulas and sorting.
        $sheet->getStyle($cell)->getNumberFormat()
            ->setFormatCode(str_contains(MoneyDisplay::total($value), '.') ? '#,##0.00' : '#,##0');
    }

    private function tableRows(array $columns, array $rows, array $totals): array
    {
        $keys = array_column($columns, 'key');

        $data = array_map(fn ($row) => array_map(static function ($column) use ($row) {
            $value = $row[$column['key']] ?? '';
            if (($column['wrap'] ?? false) && is_string($value) && $value !== '') {
                // Mark free text so Excel keeps numeric-looking remarks verbatim.
                $text = new RichText;
                $text->createText($value);

                return $text;
            }

            return $value;
        }, $columns), $rows);

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
