<?php

namespace App\Services;

use Illuminate\Support\Collection;

class ReportVisualizationService
{
    // Print-safe counterparts of the web chart colors in resources/css/app.css.
    private const SALES_COLOR = '#234968';

    private const PROFIT_COLOR = '#087568';

    private const RECEIPTS_COLOR = '#684ab4';

    private const NEGATIVE_COLOR = '#b4232a';

    private const GRID_COLOR = '#d3e0e8';

    private const LABEL_COLOR = '#263b4d';

    /**
     * Report-specific ranked chart definitions shared by Inertia and PDF exports.
     * The first metric is the default metric used in PDFs.
     */
    private const RANKED = [
        'hr-payroll' => ['labelKey' => 'name', 'metrics' => [
            ['key' => 'net_pay', 'label' => 'Net Salary', 'format' => 'money'],
            ['key' => 'expense', 'label' => 'Salary Expense', 'format' => 'money'],
            ['key' => 'due', 'label' => 'Unpaid Salary', 'format' => 'money'],
        ]],
        'hr-balances' => ['labelKey' => 'name', 'metrics' => [
            ['key' => 'payable', 'label' => 'Salary Payable', 'format' => 'money'],
            ['key' => 'advance', 'label' => 'Recoverable Advances', 'format' => 'money'],
        ]],
        'hr-bookers' => ['labelKey' => 'name', 'metrics' => [
            ['key' => 'net_sales', 'label' => 'Net Sales', 'format' => 'money'],
            ['key' => 'collections', 'label' => 'Actual Allocated Receipts', 'format' => 'money'],
        ]],
        'hr-attendance' => ['labelKey' => 'name', 'metrics' => [
            ['key' => 'overtime', 'label' => 'Overtime Hours', 'format' => 'qty'],
        ]],
        'hr-leave' => ['labelKey' => 'type', 'metrics' => [
            ['key' => 'used', 'label' => 'Approved Days by Leave Type', 'format' => 'qty'],
            ['key' => 'remaining', 'label' => 'Remaining Days by Leave Type', 'format' => 'qty'],
        ]],
        'hr-ledger' => ['labelKey' => 'kind', 'metrics' => [
            ['key' => 'expense', 'label' => 'Expense by Transaction Type', 'format' => 'money'],
            ['key' => 'cash_out', 'label' => 'Net Cash Out by Transaction Type', 'format' => 'money'],
        ]],
        CustomerReceiptReport::KEY => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'received', 'label' => 'Actual Received by Customer', 'format' => 'money'],
            ['key' => 'by_method', 'valueKey' => 'received', 'labelKey' => 'method', 'label' => 'Actual Received by Method', 'format' => 'money'],
        ]],
        'sales-register' => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'net_amount', 'label' => 'Net Sales', 'format' => 'money'],
            ['key' => 'received', 'label' => 'Actual Received', 'format' => 'money'],
            ['key' => 'outstanding', 'label' => 'Outstanding Now', 'format' => 'money'],
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
        SupplierPurchaseValueReport::KEY => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'purchase_value', 'label' => 'Purchase Value', 'format' => 'money'],
            ['key' => 'net_units', 'label' => 'Net Units Incl. Bonus', 'format' => 'qty'],
        ]],
        'all-time-purchases-stock' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'available', 'label' => 'Available Now', 'format' => 'qty'],
            ['key' => 'purchased', 'label' => 'Net Purchased', 'format' => 'qty'],
            ['key' => 'sold', 'label' => 'Net Sold', 'format' => 'qty'],
            ['key' => 'on_hold', 'label' => 'On Hold (Drafts)', 'format' => 'qty'],
            ['key' => 'on_hand', 'label' => 'Stock on Hand', 'format' => 'qty'],
        ]],
        'product-sales-daily' => ['labelKey' => 'product', 'metrics' => [
            ['key' => 'revenue', 'label' => 'Net Revenue', 'format' => 'money'],
            ['key' => 'profit', 'label' => 'Net Profit', 'format' => 'money'],
            ['key' => 'cost', 'label' => 'Net COGS', 'format' => 'money'],
            ['key' => 'qty', 'label' => 'Net Quantity', 'format' => 'qty'],
        ]],
        'customer-sales' => ['labelKey' => 'customer', 'metrics' => [
            ['key' => 'net_revenue', 'label' => 'Net Revenue', 'format' => 'money'],
            ['key' => 'received', 'label' => 'Actual Received in Period', 'format' => 'money'],
            ['key' => 'net_profit', 'label' => 'Net Profit', 'format' => 'money'],
            ['key' => 'outstanding', 'label' => 'Current Ledger Balance', 'format' => 'money'],
        ]],
        'booker-sales' => ['labelKey' => 'booker', 'metrics' => [
            ['key' => 'net_revenue', 'label' => 'Net Revenue', 'format' => 'money'],
            ['key' => 'received', 'label' => 'Actual Allocated Receipts', 'format' => 'money'],
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

    public function pdfCharts(string $key, array $report, ?string $metricKey = null, string $order = 'desc', int $limit = 10): array
    {
        $charts = [];

        if (! empty($report['chart'])) {
            $hasReceipts = collect($report['chart'])->contains(fn ($point) => array_key_exists('received', $point));
            $charts[] = [
                'title' => 'Sales and Profit Trend',
                'subtitle' => $hasReceipts ? 'Net sales, net profit, and actual receipts by payment date' : 'Net sales and net profit over time',
                ...$this->trendPlot($report['chart'], $hasReceipts),
            ];
        }

        $definition = $this->definition($key);
        if ($definition && ! empty($report['rows'])) {
            $metric = collect($definition['metrics'])->firstWhere('key', $metricKey) ?? $definition['metrics'][0];
            $valueKey = $metric['valueKey'] ?? $metric['key'];
            $labelKey = $metric['labelKey'] ?? $definition['labelKey'];
            $limit = $limit === 5 ? 5 : 10;
            $ascending = $order === 'asc';
            $ranked = collect($report['rows'])
                ->filter(fn (array $row) => is_numeric($row[$valueKey] ?? null))
                ->groupBy(fn (array $row) => trim((string) ($row[$labelKey] ?? '')) ?: 'Other')
                ->map(fn (Collection $group, string|int $label) => [
                    'label' => (string) $label,
                    'value' => round($group->sum($valueKey), 2),
                ])
                ->sortBy('value', descending: ! $ascending)
                ->take($limit)
                ->values()
                ->all();

            if ($ranked !== []) {
                $charts[] = [
                    'title' => ($ascending ? 'Bottom ' : 'Top ').$limit.' by '.$metric['label'],
                    'subtitle' => 'Ranked from the filtered report rows',
                    'bars' => $this->rankedBars($ranked, $metric['format']),
                ];
            }
        }

        return $charts;
    }

    public function printView(array $view): array
    {
        $colors = ReportChartData::COLORS;
        $chart = ['title' => $view['title'], 'subtitle' => $view['description']];
        if ($view['kind'] === 'donut') {
            $sum = array_sum(array_column(array_column($view['points'], 'values'), 0));
            $parts = [$this->svgOpen(240, 240)];
            $angle = -M_PI / 2;
            $legend = [];
            foreach ($view['points'] as $index => $point) {
                $value = $point['values'][0];
                $share = $value / $sum;
                $color = $colors[$index];
                $legend[] = ['label' => $point['label'], 'color' => $color, 'value' => $this->formatValue($value, $view['unit']), 'share' => number_format($share * 100, 1).'%'];
                if ($share >= 1) {
                    $parts[] = "<circle cx=\"120\" cy=\"120\" r=\"91\" fill=\"none\" stroke=\"{$color}\" stroke-width=\"36\"/>";

                    continue;
                }
                $end = $angle + $share * 2 * M_PI;
                [$x1, $y1, $x2, $y2] = array_map(fn ($coordinate) => round($coordinate, 5), [
                    120 + cos($angle) * 91, 120 + sin($angle) * 91, 120 + cos($end) * 91, 120 + sin($end) * 91,
                ]);
                $large = $share > 0.5 ? 1 : 0;
                $parts[] = "<path d=\"M {$x1} {$y1} A 91 91 0 {$large} 1 {$x2} {$y2}\" fill=\"none\" stroke=\"{$color}\" stroke-width=\"36\"/>";
                $angle = $end;
            }
            $parts[] = '</svg>';

            return $chart + ['ring' => $this->svgDataUri(implode('', $parts)), 'legend' => $legend, 'total' => $this->formatValue($sum, $view['unit'])];
        }

        $width = 760;
        $left = 64;
        $plotWidth = 678;
        $top = 16;
        $plotHeight = 142;
        $stacked = $view['kind'] === 'stacked';
        $line = $view['kind'] === 'line';
        $points = $view['points'];
        $count = count($points);
        $values = array_merge(...array_column($points, 'values'));
        $min = min(0, ...$values);
        $max = $stacked ? max(array_map(fn ($point) => array_sum($point['values']), $points)) : max(0, ...$values);
        $step = 10 ** floor(log10(($max - $min) / 4));
        $step *= min(array_filter([1, 2, 5, 10], fn ($multiple) => $multiple * $step >= ($max - $min) / 4));
        $min = floor($min / $step) * $step;
        $max = ceil($max / $step) * $step;
        $y = fn ($value) => round($top + ($max - $value) / ($max - $min) * $plotHeight, 3);
        $slot = $plotWidth / $count;
        $x = fn ($index) => round($left + ($index + 0.5) * $slot, 3);
        $parts = [$this->svgOpen($width, 196)];
        $labels = [];
        $ticks = (int) round(($max - $min) / $step);
        for ($tick = 0; $tick <= $ticks; $tick++) {
            $value = round($min + $tick * $step, 8);
            $sy = $y($value);
            $color = $value == 0 ? self::LABEL_COLOR : self::GRID_COLOR;
            $parts[] = "<line x1=\"{$left}\" x2=\"742\" y1=\"{$sy}\" y2=\"{$sy}\" stroke=\"{$color}\"/>";
            $labels[] = $this->plotLabel($this->compactValue($value), 0, $sy - 7, $width);
        }
        $keyLabels = [];
        $numericAxis = $count <= 6 && collect($points)->contains(fn ($point) => mb_strlen($point['label']) > 13);
        $labelStep = max(1, (int) ceil($count / 8));
        $seriesCount = count($view['labels']);
        foreach ($points as $index => $point) {
            if ($numericAxis) {
                $keyLabels[] = ($index + 1).'. '.$point['label'];
            }
            if ($index === $count - 1 || ($index % $labelStep === 0 && $count - 1 - $index >= $labelStep)) {
                $labels[] = $this->plotLabel($numericAxis ? (string) ($index + 1) : $point['label'], $x($index), 166, $width, center: true);
            }
            if ($line) {
                continue;
            }
            $barWidth = min(26, $slot * 0.72 / ($stacked ? 1 : $seriesCount));
            $running = 0;
            foreach ($point['values'] as $i => $value) {
                $start = $stacked ? $running : 0;
                $end = $start + $value;
                $running = $end;
                $bx = round($x($index) + ($stacked ? -$barWidth / 2 : ($i - $seriesCount / 2) * $barWidth), 3);
                $by = min($y($start), $y($end));
                $barHeight = abs($y($start) - $y($end));
                $fill = $colors[$i];
                $parts[] = "<rect x=\"{$bx}\" y=\"{$by}\" width=\"{$barWidth}\" height=\"{$barHeight}\" fill=\"{$fill}\"/>";
            }
        }
        if ($line) {
            foreach ($view['labels'] as $i => $label) {
                $color = $colors[$i];
                $coordinates = [];
                foreach ($points as $index => $point) {
                    $cx = $x($index);
                    $cy = $y($point['values'][$i]);
                    $coordinates[] = "{$cx},{$cy}";
                    $parts[] = "<circle cx=\"{$cx}\" cy=\"{$cy}\" r=\"3\" fill=\"{$color}\"/>";
                }
                $parts[] = '<polyline points="'.implode(' ', $coordinates).'" fill="none" stroke="'.$color.'" stroke-width="2.5"/>';
            }
        }
        $parts[] = '</svg>';

        return $chart + [
            'image' => $this->svgDataUri(implode('', $parts)), 'height_per_width' => 196 / $width, 'labels' => $labels,
            'seriesLegend' => array_map(fn ($i, $label) => ['label' => $label, 'color' => $colors[$i]], array_keys($view['labels']), $view['labels']),
            'units' => $view['unit'] === 'money' ? 'PKR' : null,
            'keyLabels' => $keyLabels,
        ];
    }

    private function rankedBars(array $rows, string $format): array
    {
        $values = array_column($rows, 'value');
        $min = min(0, ...$values);
        $max = max(0, ...$values);
        $span = ($max - $min) ?: 1;

        return array_map(fn (array $row) => [
            'label' => $row['label'],
            'value' => $this->formatValue($row['value'], $format),
            'start' => round((min(0, $row['value']) - $min) / $span * 100, 3),
            'width' => round(abs($row['value']) / $span * 100, 3),
            'zero' => $min < 0 && $max > 0 ? round(-$min / $span * 100, 3) : null,
            'color' => $row['value'] < 0 ? self::NEGATIVE_COLOR : self::SALES_COLOR,
        ], $rows);
    }

    private function trendPlot(array $points, bool $hasReceipts): array
    {
        $series = [
            ['key' => 'sales', 'label' => 'Net Sales', 'color' => self::SALES_COLOR, 'dash' => ''],
            ['key' => 'profit', 'label' => 'Net Profit', 'color' => self::PROFIT_COLOR, 'dash' => ' stroke-dasharray="6 4"'],
        ];
        if ($hasReceipts) {
            $series[] = ['key' => 'received', 'label' => 'Actual Receipts', 'color' => self::RECEIPTS_COLOR, 'dash' => ' stroke-dasharray="2 4"'];
        }
        $width = 760;
        $height = 220;
        $left = 64;
        $top = 15;
        $plotWidth = 660;
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
        $labels = [];

        for ($step = 0; $step <= 4; $step++) {
            $gridY = $top + ($step / 4) * $plotHeight;
            $gridValue = $max - ($step / 4) * $range;
            $parts[] = "<line x1=\"{$left}\" y1=\"{$gridY}\" x2=\"".($left + $plotWidth)."\" y2=\"{$gridY}\" stroke=\"".self::GRID_COLOR.'" stroke-width="1"/>';
            $labels[] = $this->plotLabel($this->compactValue($gridValue), 0, $gridY - 7, $width);
        }

        foreach ($series as $item) {
            $coordinates = [];
            foreach ($points as $index => $point) {
                $coordinates[] = round($x($index), 1).','.round($y((float) ($point[$item['key']] ?? 0)), 1);
            }
            $parts[] = '<polyline points="'.implode(' ', $coordinates).'" fill="none" stroke="'.$item['color'].'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'.$item['dash'].'/>';
            foreach ($coordinates as $coordinate) {
                [$cx, $cy] = explode(',', $coordinate);
                $parts[] = "<circle cx=\"{$cx}\" cy=\"{$cy}\" r=\"3\" fill=\"{$item['color']}\"/>";
            }
        }

        // Leave room for the larger labels without dropping any plotted data.
        $labelStep = max(1, (int) ceil($count / 10));
        foreach ($points as $index => $point) {
            if ($index !== $count - 1 && ($index % $labelStep !== 0 || $count - 1 - $index < $labelStep)) {
                continue;
            }
            $labels[] = $this->plotLabel($this->truncate((string) ($point['label'] ?? ''), 9), $x($index), 151, $width, center: true);
        }

        $legendX = $hasReceipts ? 314 : 474;
        foreach ($series as $index => $item) {
            $lx = $legendX + $index * 130;
            $parts[] = "<rect x=\"{$lx}\" y=\"184\" width=\"12\" height=\"12\" rx=\"2\" fill=\"{$item['color']}\"/>";
            $labels[] = $this->plotLabel($item['label'], $lx + 18, 184, $width);
        }
        $parts[] = '</svg>';

        return ['image' => $this->svgDataUri(implode('', $parts)), 'height_per_width' => $height / $width, 'labels' => $labels];
    }

    /** Keep chart labels as selectable PDF text in the document font. */
    private function plotLabel(string $text, float $x, float $y, int $width, bool $center = false, string $color = self::LABEL_COLOR, bool $bold = false): array
    {
        $centerWidth = 72;

        return [
            'text' => $text,
            'x' => round(($x - ($center ? $centerWidth / 2 : 0)) / $width * 100, 4),
            'y_per_plot_width' => $y / $width,
            'width' => $center ? round($centerWidth / $width * 100, 4) : null,
            'color' => $color,
            'bold' => $bold,
        ];
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

        return rtrim(rtrim(number_format($value, 2, '.', ','), '0'), '.');
    }

    private function truncate(string $value, int $length): string
    {
        return mb_strlen($value) > $length ? mb_substr($value, 0, $length - 1).'…' : $value;
    }
}
