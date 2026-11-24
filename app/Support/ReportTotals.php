<?php

namespace App\Support;

final class ReportTotals
{
    /** Round aggregate money only, after computing it from the unrounded report rows. */
    public static function roundMoney(array $report): array
    {
        foreach ($report['columns'] ?? [] as $column) {
            $key = $column['key'];
            if (($column['format'] ?? null) !== 'money') continue;
            if (is_numeric($report['totals'][$key] ?? null)) {
                $report['totals'][$key] = Paisa::roundToRupee(Paisa::from($report['totals'][$key])) / 100;
            }
            if ($column['final'] ?? false) {
                foreach ($report['rows'] as &$row) {
                    if (is_numeric($row[$key] ?? null)) $row[$key] = Paisa::roundToRupee(Paisa::from($row[$key])) / 100;
                }
                unset($row);
            }
        }
        foreach ($report['sections'] ?? [] as $index => $section) {
            $report['sections'][$index] = self::roundMoney($section);
        }

        return $report;
    }
}
