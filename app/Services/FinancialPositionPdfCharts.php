<?php

namespace App\Services;

/** Print-only charts built from the same balances and aging as the page. */
class FinancialPositionPdfCharts
{
    private const BUCKETS = ['current' => 'Current', '31_60' => '31–60', '61_90' => '61–90', 'over_90' => '90+'];

    private const COLORS = ['#9bddd4', '#0c9484', '#c47b0c', '#c84a51'];

    public function build(array $data): array
    {
        $t = $data['totals'];
        $ar = $t['total_receivable'];
        $ap = $t['total_payable'];
        $net = $t['net'];
        $trade = $ar - $ap;
        $withAdvances = $trade + $t['employee_advances'];
        $bridge = [
            ['Receivables', 0, $ar, '#0c9484'],
            ['Payables', $ar, $trade, '#c84a51'],
            ['Staff advances', $trade, $withAdvances, '#507992'],
            ['Salary payable', $withAdvances, $net, '#507992'],
            ['Net position', 0, $net, $net < 0 ? '#c84a51' : '#0c9484'],
        ];
        $receivables = $this->buckets($data['receivables']);
        $payables = $this->buckets($data['payables']);
        $aging = array_map(
            fn ($ar, $ap) => [[0, $ar, '#0c9484'], [0, $ap, '#c84a51']],
            array_values($receivables),
            array_values($payables)
        );

        return [
            'bridge' => $this->bars(array_map(fn ($row) => [array_slice($row, 1)], $bridge)),
            'bridgeLabels' => array_map(fn ($row) => ['label' => $row[0], 'amount' => round($row[2] - $row[1], 2)], $bridge),
            'aging' => $this->bars($aging),
            'agingLabels' => array_values(self::BUCKETS),
            'receivables' => $this->mix($receivables),
            'payables' => $this->mix($payables),
        ];
    }

    private function buckets(array $parties): array
    {
        $totals = array_fill_keys(array_keys(self::BUCKETS), 0);
        foreach ($parties as $party) {
            foreach ($totals as $key => $value) {
                $totals[$key] = $value + ($party['aging'][$key] ?? 0);
            }
        }

        return array_map(fn ($value) => round($value, 2), $totals);
    }

    /** SVG contains shapes only; PDF labels stay native, selectable text. */
    private function bars(array $groups): string
    {
        $width = 456;
        $height = 158;
        $points = [0];
        foreach ($groups as $bars) {
            foreach ($bars as [$from, $to]) {
                $points[] = $from;
                $points[] = $to;
            }
        }
        $max = max(0, ...$points);
        $min = min(0, ...$points);
        $range = $max - $min ?: 1;
        $y = fn ($value) => 7 + ($max - $value) * ($height - 15) / $range;
        $html = [];
        for ($i = 0; $i < 5; $i++) {
            $line = 7 + $i * ($height - 15) / 4;
            $html[] = sprintf('<path d="M 0 %g H %g" fill="none" stroke="#e4ebef"/>', $line, $width);
        }
        $html[] = sprintf('<path d="M 0 %.3F H %g" fill="none" stroke="#8195a4"/>', $y(0), $width);
        $groupWidth = $width / count($groups);
        foreach ($groups as $index => $bars) {
            $center = ($index + 0.5) * $groupWidth;
            $barWidth = count($bars) === 1 ? 48 : 24;
            $gap = 5;
            $start = $center - (count($bars) * ($barWidth + $gap) - $gap) / 2;
            foreach ($bars as $i => [$from, $to, $color]) {
                $top = $y(max($from, $to));
                $barHeight = abs($y($from) - $y($to));
                if ($barHeight == 0 && count($bars) > 1) {
                    continue;
                }
                $html[] = sprintf(
                    '<rect x="%.3F" y="%.3F" width="%d" height="%.3F" rx="2" fill="%s"/>',
                    $start + $i * ($barWidth + $gap), $top, $barWidth, max(1, $barHeight), $color
                );
            }
        }

        return $this->svg($width, $height, implode('', $html));
    }

    private function mix(array $values): array
    {
        $total = array_sum($values);
        $rows = [];
        $segments = '<rect width="456" height="12" rx="2" fill="#e4ebef"/>';
        $offset = 0;
        foreach (array_keys(self::BUCKETS) as $i => $key) {
            $value = $values[$key];
            $share = $total > 0 ? $value / $total : 0;
            $rows[] = ['label' => self::BUCKETS[$key], 'value' => $value, 'share' => $share, 'color' => self::COLORS[$i]];
            if ($share > 0) {
                $segments .= sprintf('<rect x="%.3F" width="%.3F" height="12" fill="%s"/>', $offset, $share * 456, self::COLORS[$i]);
                $offset += $share * 456;
            }
        }

        return ['image' => $this->svg(456, 12, $segments), 'rows' => $rows];
    }

    private function svg(int $width, int $height, string $shapes): string
    {
        return 'data:image/svg+xml;base64,'.base64_encode(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{$width}\" height=\"{$height}\" viewBox=\"0 0 {$width} {$height}\">{$shapes}</svg>"
        );
    }
}
