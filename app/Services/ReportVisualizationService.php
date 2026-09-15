<?php

namespace App\Services;

use Illuminate\Support\Collection;

class ReportVisualizationService
{
    /**
     * Report-specific ranked chart definitions shared by Inertia and PDF exports.
     * The first metric is the default metric used in PDFs.
     */
    private const RANKED = [
        'sales-register' => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'net_amount', 'label' => 'Net Sales', 'format' => 'money'],
            ['key' => 'net_profit', 'label' => 'Net Profit', 'format' => 'money'],
            ['key' => 'returns', 'label' => 'Returns', 'format' => 'money'],
        ]],
        'product-sales' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'net_revenue', 'label' => 'Net Revenue', 'format' => 'money'],
            ['key' => 'net_profit', 'label' => 'Net Profit', 'format' => 'money'],
            ['key' => 'net_cost', 'label' => 'Net COGS', 'format' => 'money'],
            ['key' => 'net_qty', 'label' => 'Net Quantity', 'format' => 'qty'],
        ]],
        'all-time-product-cogs' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'net_qty_sold', 'label' => 'Net Quantity Sold', 'format' => 'qty'],
            ['key' => 'net_cogs', 'label' => 'Net COGS', 'format' => 'money'],
            ['key' => 'gross_cogs', 'label' => 'Gross COGS', 'format' => 'money'],
        ]],
        'product-sales-daily' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'revenue', 'label' => 'Net Revenue', 'format' => 'money'],
            ['key' => 'profit', 'label' => 'Net Profit', 'format' => 'money'],
            ['key' => 'cost', 'label' => 'Net COGS', 'format' => 'money'],
            ['key' => 'qty', 'label' => 'Net Quantity', 'format' => 'qty'],
        ]],
        'customer-sales' => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'net_revenue', 'label' => 'Net Revenue', 'format' => 'money'],
            ['key' => 'net_profit', 'label' => 'Net Profit', 'format' => 'money'],
            ['key' => 'outstanding', 'label' => 'Outstanding', 'format' => 'money'],
        ]],
        'booker-sales' => ['labelKey' => 'booker', 'metrics' => [
            ['key' => 'net_revenue', 'label' => 'Net Revenue', 'format' => 'money'],
            ['key' => 'net_profit', 'label' => 'Net Profit', 'format' => 'money'],
            ['key' => 'invoices', 'label' => 'Invoices', 'format' => 'qty'],
        ]],
        'incentives-given' => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'value_given', 'label' => 'Incentive Value', 'format' => 'money'],
            ['key' => 'bonus_qty', 'label' => 'Bonus Units', 'format' => 'qty'],
            ['key' => 'discount', 'label' => 'Discount', 'format' => 'money'],
        ]],
        'purchase-register' => ['labelKey' => 'company', 'metrics' => [
            ['key' => 'total_amount', 'label' => 'Purchases', 'format' => 'money'],
            ['key' => 'total_margin', 'label' => 'Expected Margin', 'format' => 'money'],
        ]],
        'supplier-purchases' => ['labelKey' => 'supplier', 'metrics' => [
            ['key' => 'total', 'label' => 'Purchases', 'format' => 'money'],
            ['key' => 'margin', 'label' => 'Expected Margin', 'format' => 'money'],
            ['key' => 'invoices', 'label' => 'Invoices', 'format' => 'qty'],
        ]],
        'bonus-analysis' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'received', 'label' => 'Bonus Received', 'format' => 'qty'],
            ['key' => 'given', 'label' => 'Bonus Given', 'format' => 'qty'],
            ['key' => 'net', 'label' => 'Net Kept', 'format' => 'qty'],
        ]],
        'stock-position' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'value', 'label' => 'Value at Cost', 'format' => 'money'],
            ['key' => 'stock', 'label' => 'Available Quantity', 'format' => 'qty'],
        ]],
        'expiry' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'value', 'label' => 'Value at Cost', 'format' => 'money'],
            ['key' => 'qty', 'label' => 'Expiring Quantity', 'format' => 'qty'],
        ]],
        'sample-stock' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'qty', 'label' => 'Sample Quantity', 'format' => 'qty'],
        ]],
        'sample-movement' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'closing', 'label' => 'Closing Quantity', 'format' => 'qty'],
            ['key' => 'received', 'label' => 'Received', 'format' => 'qty'],
            ['key' => 'issued', 'label' => 'Issued', 'format' => 'qty'],
        ]],
        'stock-movement' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'closing', 'label' => 'Closing Quantity', 'format' => 'qty'],
            ['key' => 'purchased', 'label' => 'Purchased', 'format' => 'qty'],
            ['key' => 'billed', 'label' => 'Billed', 'format' => 'qty'],
            ['key' => 'value', 'label' => 'Value at Cost', 'format' => 'money'],
        ]],
        'slow-fast-moving' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'sold', 'label' => 'Quantity Sold', 'format' => 'qty'],
            ['key' => 'stock', 'label' => 'Current Stock', 'format' => 'qty'],
        ]],
        'outstanding' => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'balance', 'label' => 'Outstanding Balance', 'format' => 'money'],
            ['key' => 'over_90', 'label' => 'Over 90 Days', 'format' => 'money'],
            ['key' => 'current', 'label' => '0-30 Days', 'format' => 'money'],
        ]],
        'supplier-payables' => ['labelKey' => 'supplier', 'metrics' => [
            ['key' => 'balance', 'label' => 'Supplier Payable', 'format' => 'money'],
        ]],
        'sample-issue-product' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'qty', 'label' => 'Quantity Issued', 'format' => 'qty'],
            ['key' => 'cost', 'label' => 'Cost Value', 'format' => 'money'],
        ]],
        'sample-issue-recipient' => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'qty', 'label' => 'Quantity Issued', 'format' => 'qty'],
            ['key' => 'cost', 'label' => 'Cost Value', 'format' => 'money'],
            ['key' => 'issues', 'label' => 'Issues', 'format' => 'qty'],
        ]],
        'stock-on-loan' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'outstanding', 'label' => 'Outstanding Units', 'format' => 'qty'],
            ['key' => 'loaned', 'label' => 'Loaned Units', 'format' => 'qty'],
            ['key' => 'returned', 'label' => 'Returned Units', 'format' => 'qty'],
        ]],
    ];

    public function definition(string $key): ?array
    {
        return self::RANKED[$key] ?? null;
    }

    /** @return array<int, array{title: string, subtitle: string, image: string}> */
    public function pdfCharts(string $key, array $report): array
    {
        $charts = [];

        if (! empty($report['chart'])) {
            $charts[] = [
                'title' => 'Sales and Profit Trend',
                'subtitle' => 'Net sales and net profit over time',
                'image' => $this->trendSvgDataUri($report['chart']),
            ];
        }

        $definition = $this->definition($key);
        if ($definition && ! empty($report['rows'])) {
            $metric = $definition['metrics'][0];
            $ranked = collect($report['rows'])
                ->groupBy(fn (array $row) => (string) ($row[$definition['labelKey']] ?? 'Other'))
                ->map(fn (Collection $group, string $label) => [
                    'label' => $label,
                    'value' => (float) $group->sum($metric['key']),
                ])
                ->sortByDesc('value')
                ->take(10)
                ->values()
                ->all();

            if ($ranked !== []) {
                $charts[] = [
                    'title' => 'Top 10 by '.$metric['label'],
                    'subtitle' => 'Ranked from the filtered report rows',
                    'image' => $this->rankedSvgDataUri($ranked, $metric['format']),
                ];
            }
        }

        return $charts;
    }

    private function rankedSvgDataUri(array $rows, string $format): string
    {
        $width = 760;
        $rowHeight = 31;
        $height = 30 + count($rows) * $rowHeight;
        $barStart = 250;
        $barMax = 360;
        $max = max(1.0, ...array_map(fn (array $row) => abs((float) $row['value']), $rows));
        $parts = [$this->svgOpen($width, $height)];

        foreach ($rows as $index => $row) {
            $value = (float) $row['value'];
            $y = 12 + $index * $rowHeight;
            $barWidth = max(1, (int) round(abs($value) / $max * $barMax));
            $color = $value < 0 ? '#dc2626' : '#2563eb';
            $label = $this->escape($this->truncate((string) $row['label'], 35));
            $formatted = $this->escape($this->formatValue($value, $format));

            $parts[] = '<text x="0" y="'.($y + 13)."\" font-size=\"11\" fill=\"#374151\">{$label}</text>";
            $parts[] = "<rect x=\"{$barStart}\" y=\"{$y}\" width=\"{$barMax}\" height=\"18\" rx=\"3\" fill=\"#e5e7eb\"/>";
            $parts[] = "<rect x=\"{$barStart}\" y=\"{$y}\" width=\"{$barWidth}\" height=\"18\" rx=\"3\" fill=\"{$color}\"/>";
            $parts[] = '<text x="625" y="'.($y + 13)."\" font-size=\"11\" font-weight=\"bold\" fill=\"{$color}\">{$formatted}</text>";
        }

        $parts[] = '</svg>';

        return $this->svgDataUri(implode('', $parts));
    }

    private function trendSvgDataUri(array $points): string
    {
        $series = [
            ['key' => 'sales', 'label' => 'Net Sales', 'color' => '#2563eb'],
            ['key' => 'profit', 'label' => 'Net Profit', 'color' => '#16a34a'],
        ];
        $width = 760;
        $height = 205;
        $left = 64;
        $top = 15;
        $plotWidth = 670;
        $plotHeight = 125;
        $values = collect($points)->flatMap(fn (array $point) => collect($series)->map(
            fn (array $item) => (float) ($point[$item['key']] ?? 0),
        ));
        $min = min(0.0, (float) $values->min());
        $max = max(0.0, (float) $values->max());
        if ($min === $max) {
            $max = $min + 1;
        }
        $range = $max - $min;
        $count = count($points);
        $x = fn (int $index) => $left + ($count > 1 ? ($index / ($count - 1)) * $plotWidth : $plotWidth / 2);
        $y = fn (float $value) => $top + (($max - $value) / $range) * $plotHeight;
        $parts = [$this->svgOpen($width, $height)];

        for ($step = 0; $step <= 4; $step++) {
            $gridY = $top + ($step / 4) * $plotHeight;
            $gridValue = $max - ($step / 4) * $range;
            $parts[] = "<line x1=\"{$left}\" y1=\"{$gridY}\" x2=\"".($left + $plotWidth)."\" y2=\"{$gridY}\" stroke=\"#e5e7eb\" stroke-width=\"1\"/>";
            $parts[] = '<text x="0" y="'.($gridY + 4).'" font-size="9" fill="#6b7280">'.$this->escape($this->compactValue($gridValue)).'</text>';
        }

        foreach ($series as $item) {
            $coordinates = [];
            foreach ($points as $index => $point) {
                $coordinates[] = round($x($index), 1).','.round($y((float) ($point[$item['key']] ?? 0)), 1);
            }
            $parts[] = '<polyline points="'.implode(' ', $coordinates).'" fill="none" stroke="'.$item['color'].'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
            foreach ($coordinates as $coordinate) {
                [$cx, $cy] = explode(',', $coordinate);
                $parts[] = "<circle cx=\"{$cx}\" cy=\"{$cy}\" r=\"3\" fill=\"{$item['color']}\"/>";
            }
        }

        foreach ($points as $index => $point) {
            $label = $this->escape($this->truncate((string) ($point['label'] ?? ''), 9));
            $parts[] = '<text x="'.round($x($index), 1).'" y="158" text-anchor="middle" font-size="8" fill="#6b7280">'.$label.'</text>';
        }

        $legendX = 500;
        foreach ($series as $index => $item) {
            $lx = $legendX + $index * 115;
            $parts[] = "<rect x=\"{$lx}\" y=\"180\" width=\"10\" height=\"10\" rx=\"2\" fill=\"{$item['color']}\"/>";
            $parts[] = '<text x="'.($lx + 15).'" y="189" font-size="10" fill="#374151">'.$item['label'].'</text>';
        }
        $parts[] = '</svg>';

        return $this->svgDataUri(implode('', $parts));
    }

    private function svgOpen(int $width, int $height): string
    {
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{$width}\" height=\"{$height}\" viewBox=\"0 0 {$width} {$height}\"><rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>";
    }

    private function svgDataUri(string $svg): string
    {
        return 'data:image/svg+xml;base64,'.base64_encode($svg);
    }

    private function formatValue(float $value, string $format): string
    {
        if ($format === 'qty') {
            return rtrim(rtrim(number_format($value, 2, '.', ','), '0'), '.');
        }

        return 'Rs '.number_format($value, 2);
    }

    private function compactValue(float $value): string
    {
        $absolute = abs($value);
        if ($absolute >= 1_000_000) {
            return number_format($value / 1_000_000, 1).'m';
        }
        if ($absolute >= 1_000) {
            return number_format($value / 1_000, 1).'k';
        }

        return number_format($value, 0);
    }

    private function truncate(string $value, int $length): string
    {
        return mb_strlen($value) > $length ? mb_substr($value, 0, $length - 1).'…' : $value;
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
}
