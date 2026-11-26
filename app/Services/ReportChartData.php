<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/** Additional perspectives on existing report rows. Never changes report calculations. */
class ReportChartData
{
    public const COLORS = ['#21567f', '#087568', '#965211', '#6a4da1', '#a33558', '#40596b', '#677824'];

    private const PAYMENT_BASIS = 'Sales and receipts use different dates and are not a settlement ratio.';

    private const AGES = ['current' => '0–30 days', 'd31_60' => '31–60 days', 'd61_90' => '61–90 days', 'over_90' => 'Over 90 days'];

    public function build(string $report, array $data): array
    {
        $charts = [];
        $rows = collect($data['rows'] ?? []);

        foreach ($this->definitions($report) as $id => $definition) {
            [$kind, $title, $unit, $fields, $group, $description, $source] = $definition;
            $input = $source === 'invoices' ? collect($data['sections'][0]['rows'] ?? []) : $rows;
            if ($source === 'payables') {
                $input = $input->where('balance', '>', 0);
            }

            $labels = array_values($fields);
            if ($group === null) {
                $points = [];
                foreach ($fields as $field => $label) {
                    $points[] = ['label' => $label, 'values' => [round($input->sum($field), 2)]];
                }
                $labels = [$title];
            } elseif ($kind === 'line' || $source === 'chronological') {
                [$points, $interval] = $this->timeline($input, $group, $fields, $source === 'chronological');
                $description = trim($description.' '.$interval);
            } else {
                $points = $input->groupBy(fn (array $row) => $this->groupLabel($row, $group))
                    ->map(fn (Collection $groupRows, $label) => ['label' => (string) $label, 'values' => $this->values($groupRows, $fields)])
                    ->values()->all();
            }

            if ($kind === 'donut') {
                // Signed movements are not parts of a whole. Never turn a negative into a slice.
                if (collect($points)->contains(fn ($point) => $point['values'][0] < 0)) {
                    continue;
                }
                $points = array_values(array_filter($points, fn ($point) => $point['values'][0] > 0));
                if ($group !== null) {
                    usort($points, fn ($a, $b) => $b['values'][0] <=> $a['values'][0]);
                    if (count($points) > 7) {
                        $remaining = array_splice($points, 6);
                        $points[] = ['label' => count($remaining).' remaining groups', 'values' => [round(array_sum(array_column(array_column($remaining, 'values'), 0)), 2)]];
                    }
                }
            } elseif (in_array($kind, ['column', 'stacked'], true) && $group !== null && $source !== 'chronological') {
                $score = fn ($point) => $kind === 'stacked' ? array_sum($point['values']) : $this->magnitude($point);
                usort($points, fn ($a, $b) => $score($b) <=> $score($a));
                if (count($points) > 6) {
                    $points = array_slice($points, 0, 6);
                    $description = trim($description.' Showing the six groups with the largest values.');
                }
            }

            if ($input->isEmpty() || ! collect($points)->contains(fn ($point) => $this->magnitude($point) > 0)) {
                continue;
            }
            if ($kind === 'stacked' && collect($points)->contains(fn ($point) => min($point['values']) < 0)) {
                $kind = 'column';
            }
            $charts[] = compact('id', 'kind', 'title', 'unit', 'labels', 'description', 'points');
        }

        return $charts;
    }

    private function label(mixed $label): string
    {
        $label = trim((string) $label);

        return $label === '' ? 'Unspecified' : $label;
    }

    private function groupLabel(array $row, string $group): string
    {
        [$field, $fallback] = array_pad(explode('|', $group, 2), 2, null);
        $value = $row[$field] ?? null;

        return $this->label(trim((string) $value) === '' && $fallback !== null ? ($row[$fallback] ?? null) : $value);
    }

    private function magnitude(array $point): float
    {
        return max(array_map('abs', $point['values']));
    }

    private function values(Collection $rows, array $fields): array
    {
        return array_map(fn ($field) => $field === '#' ? $rows->count() : round($rows->sum($field), 2), array_keys($fields));
    }

    private function timeline(Collection $rows, string $field, array $fields, bool $monthly): array
    {
        // The monthly profit report already supplies an ordered, gap-free series with human-readable month labels.
        if ($field === 'month') {
            return [$rows->map(fn ($row) => ['label' => $row[$field], 'values' => $this->values(collect([$row]), $fields)])->all(), ''];
        }
        $dates = $rows->filter(fn ($row) => is_string($row[$field] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $row[$field]))->sortBy($field)->values();
        if ($dates->isEmpty()) {
            return [[], ''];
        }

        $first = Carbon::parse($dates->first()[$field]);
        $last = Carbon::parse($dates->last()[$field]);
        $days = $first->diffInDays($last);
        [$mode, $format, $subtitle] = match (true) {
            $days > 365 * 3 => ['year', 'Y', 'Grouped by year.'],
            $monthly || $days > 90 => ['month', "M 'y", 'Grouped by month.'],
            $days > 30 => ['week', 'd M', 'Grouped by week (starting Monday).'],
            default => ['day', 'd M', 'Grouped by day.'],
        };

        $grouped = $dates->groupBy(fn ($row) => $this->periodStart(Carbon::parse($row[$field]), $mode)->toDateString());
        $start = $this->periodStart($first, $mode);
        $end = $this->periodStart($last, $mode);
        // Cap long historical ranges without exploding the payload on sparse data.
        if ($mode === 'year' && $end->year - $start->year > 35) {
            $start = $end->copy()->subYears(35);
            $subtitle .= ' Showing the latest 36 years.';
        }
        $points = [];
        for ($date = $start->copy(); $date->lte($end); $date->addUnit($mode)) {
            $points[] = ['label' => $date->format($format), 'values' => $this->values($grouped->get($date->toDateString(), collect()), $fields)];
        }

        return [$points, $subtitle];
    }

    private function periodStart(Carbon $date, string $mode): Carbon
    {
        return match ($mode) {
            'year' => $date->startOfYear(),
            'month' => $date->startOfMonth(),
            'week' => $date->startOfWeek(Carbon::MONDAY),
            default => $date->startOfDay(),
        };
    }

    private function definitions(string $report): array
    {
        $line = fn ($title, $group, $fields, $unit = 'money', $description = '', $source = null) => ['line', $title, $unit, $fields, $group, $description, $source];
        $column = fn ($title, $group, $fields, $unit = 'money', $description = '', $source = null) => ['column', $title, $unit, $fields, $group, $description, $source];
        $stacked = fn ($title, $group, $fields, $unit = 'money', $description = '', $source = null) => ['stacked', $title, $unit, $fields, $group, $description, $source];
        $share = fn ($title, $group, $field, $unit = 'money', $description = '', $source = null) => ['donut', $title, $unit, is_array($field) ? $field : [$field => $title], $group, $description, $source];

        return match ($report) {
            'sales-register' => [
                'sales-over-time' => $line('Sales & returns over time', 'invoice_date', ['net_amount' => 'Net sales', 'returns' => 'Returns'], description: 'By original invoice date; returns follow the report’s invoice scope.'),
                'invoice-types' => $share('Invoice mix by sale type', 'sale_type', '#', 'qty', 'Share of posted invoices by count, not value.'),
            ],
            'product-sales' => [
                'product-margin' => $column('Revenue, cost & profit', 'product', ['net_revenue' => 'Net revenue', 'net_cost' => 'Net cost', 'net_profit' => 'Net profit']),
                'supplier-sales' => $share('Gross revenue by supplier', 'supplier', 'revenue', description: 'Before return credits.'),
            ],
            'all-time-product-cogs' => [
                'cost-after-returns' => $column('Cost before & after returns', 'product', ['gross_cogs' => 'Gross COGS', 'return_cogs' => 'Return COGS', 'net_cogs' => 'Net COGS']),
                'sold-and-bonus' => $column('Sold, bonus & returned units', 'product', ['qty_sold' => 'Units billed', 'bonus_given' => 'Bonus given', 'qty_returned' => 'Billed returns', 'bonus_returned' => 'Bonus returned'], 'qty'),
            ],
            SupplierPurchaseValueReport::KEY => [
                'supplier-invoice-trend' => $line('Purchase value & sales over time', 'invoice_date', ['purchase_value' => 'Purchase value', 'net_sale_value' => 'Net sale value'], description: 'The values cover the supplier’s invoice lines only, including return adjustments.', source: 'invoices'),
                'supplier-units' => $column('Units billed, given & returned', 'product', ['qty_sold' => 'Units billed', 'bonus_qty' => 'Bonus units', 'returned_qty' => 'Returned units'], 'qty'),
            ],
            'product-sales-daily' => [
                'daily-profit' => $line('Revenue, cost & profit over time', 'date', ['revenue' => 'Net revenue', 'cost' => 'Net cost', 'profit' => 'Net profit']),
                'daily-units' => $line('Sales & bonus volume over time', 'date', ['qty' => 'Net billed units', 'bonus' => 'Net bonus units'], 'qty'),
            ],
            'customer-sales' => [
                'sales-and-receipts' => $column('Customer sales vs. receipts', 'customer', ['net_revenue' => 'Net sales', 'received' => 'Actual receipts'], description: self::PAYMENT_BASIS),
                'city-mix' => $share('Invoices by city', 'city', 'invoices', 'qty'),
            ],
            'booker-sales' => [
                'booker-receipts' => $column('Booker sales vs. receipts', 'booker', ['net_revenue' => 'Net sales', 'received' => 'Actual allocated receipts'], description: self::PAYMENT_BASIS),
                'booker-invoice-mix' => $share('Invoice volume by booker', 'booker', 'invoices', 'qty'),
            ],
            'incentives-given' => [
                'incentive-mix' => $share('Incentive use by type', 'type', 'times', 'qty', 'Share of rule applications, not invoices or money.'),
                'incentive-rules' => $column('Incentive value by rule', 'rule', ['value_given' => 'Total incentive value', 'discount' => 'Discount component']),
            ],
            'purchase-register' => [
                'purchasing-trend' => $line('Purchase activity over time', 'invoice_date', ['total_amount' => 'Posted purchases', 'total_margin' => 'Expected margin']),
                'supplier-spend' => $share('Purchase value by supplier', 'company', 'total_amount'),
            ],
            'supplier-purchases' => [
                'supplier-mix' => $share('Purchase value by supplier', 'supplier', 'total'),
                'supplier-margin' => $column('Purchases vs. expected margin', 'supplier', ['total' => 'Purchase value', 'margin' => 'Expected margin']),
            ],
            'bonus-analysis' => [
                'bonus-flow' => $column('Bonus received vs. given', 'product', ['received' => 'Received', 'given' => 'Given', 'net' => 'Net kept'], 'qty'),
                'bonus-received-mix' => $share('Bonus received by product', 'product', 'received', 'qty'),
            ],
            'stock-position' => [
                'stock-value-mix' => $share('Stock value by supplier', 'supplier', 'value'),
                'stock-volume-mix' => $share('Available stock by supplier', 'supplier', 'stock', 'qty'),
            ],
            'all-time-purchases-stock' => [
                'purchase-vs-sale' => $column('Purchased vs. sold', 'product', ['purchased' => 'Net purchased', 'sold' => 'Net sold'], 'qty'),
                'stock-and-drafts' => $column('Stock vs. draft demand', 'product', ['on_hand' => 'On hand', 'available' => 'Available', 'on_hold' => 'Draft sales demand'], 'qty', 'These measures overlap: draft demand is not deducted again from available stock.'),
            ],
            'stock-movement' => [
                'stock-in-out' => $column('Purchases, sales & bonus units', 'product', ['purchased' => 'Purchased in', 'bonus_in' => 'Bonus in', 'billed' => 'Billed out', 'bonus_out' => 'Bonus out'], 'qty'),
                'opening-closing' => $column('Opening vs. closing stock', 'product', ['opening' => 'Opening stock', 'closing' => 'Closing stock'], 'qty'),
            ],
            'expiry' => [
                'expiry-units' => $column('Stock by expiry period', 'expiry_date', ['qty' => 'Units in stock'], 'qty', source: 'chronological'),
                'expiry-exposure' => $column('Value by expiry period', 'expiry_date', ['value' => 'Value at cost'], source: 'chronological'),
            ],
            'sample-stock' => [
                'sample-supplier-mix' => $share('Sample stock by supplier', 'supplier', 'qty', 'qty'),
                'sample-expiry' => $column('Sample stock by expiry period', 'expiry_date', ['qty' => 'Samples in stock'], 'qty', 'Only dated batches are plotted.', 'chronological'),
            ],
            'sample-movement' => [
                'sample-in-out' => $column('Samples received vs. issued', 'product', ['received' => 'Received', 'issued' => 'Issued', 'adjustments' => 'Adjustments'], 'qty'),
                'sample-balances' => $column('Opening vs. closing samples', 'product', ['opening' => 'Opening stock', 'closing' => 'Closing stock'], 'qty'),
            ],
            'sample-issue-product' => [
                'issued-supplier-mix' => $share('Sample units issued by supplier', 'supplier', 'qty', 'qty'),
                'issued-cost-mix' => $share('Cost of issues by supplier', 'supplier', 'cost', description: 'Issues drawn from sample stock have zero cost.'),
            ],
            'sample-issue-recipient' => [
                'recipient-issue-mix' => $share('Sample units by recipient', 'recipient|customer', 'qty', 'qty', 'Uses the customer when no separate recipient was entered.'),
                'recipient-activity' => $column('Issue activity by customer', 'customer', ['issues' => 'Issue count', 'qty' => 'Units issued'], 'qty', 'Issue counts and units are separate measures.'),
            ],
            'slow-fast-moving' => [
                'sales-vs-stock' => $column('Sales volume vs. current stock', 'product', ['sold' => 'Units sold in period', 'stock' => 'Current stock'], 'qty'),
                'stock-concentration' => $share('Current stock by product', 'product', 'stock', 'qty'),
            ],
            'stock-on-loan' => [
                'loan-direction' => $column('Loans and returns by direction', 'direction', ['loaned' => 'Loaned', 'returned' => 'Returned', 'outstanding' => 'Outstanding'], 'qty', 'In and out represent different obligations.'),
                'loan-partner-mix' => $share('Outstanding units by partner', 'supplier', 'outstanding', 'qty', 'Outstanding loan-in and loan-out units are not netted.'),
            ],
            'outstanding' => [
                'aging-mix' => $share('Receivable aging mix', null, self::AGES, description: 'Aging buckets cover amounts due, not customer credits.'),
                'customer-aging' => $stacked('Aging by customer', 'customer', self::AGES),
            ],
            CustomerReceiptReport::KEY => [
                'receipt-method-mix' => $share('Actual receipts by method', 'method', 'received', description: 'Posted tender only; employee shortages and unverified collections are excluded.'),
                'receipts-over-time' => $line('Actual receipts over time', 'payment_date', ['received' => 'Actual received'], description: 'Based on the payment date (PKT).'),
            ],
            'supplier-payables' => [
                'payable-mix' => $share('Payable share by supplier', 'supplier', 'balance', description: 'Positive amounts owed only. Supplier advances are not part of the total shown here.', source: 'payables'),
            ],
            'profit-by-month' => [
                'profit-stages' => $line('Profit after business expenses', 'month', ['profit' => 'Net profit', 'profit_after_staff' => 'After payroll & commission', 'operating_profit' => 'Operating profit']),
                'expense-trends' => $stacked('Monthly expense breakdown', 'month', ['payroll_expense' => 'Payroll', 'commission_expense' => 'Commission', 'operating_expenses' => 'Treasury expenses'], source: 'chronological'),
            ],
            'hr-employees' => [
                'department-mix' => $share('Employees by department', 'department', '#', 'qty'),
                'employment-mix' => $share('Employees by employment status', 'status', '#', 'qty'),
            ],
            'hr-attendance' => [
                'attendance-mix' => $share('Attendance by status', 'status', '#', 'qty', 'Counts recorded attendance entries, not unique employees.'),
                'overtime-trend' => $line('Overtime over time', 'date', ['overtime' => 'Overtime hours'], 'qty'),
            ],
            'hr-leave' => [
                'leave-balances' => $column('Leave allowance, usage & remaining days', 'type', ['allowance' => 'Allowance', 'used' => 'Approved days', 'remaining' => 'Remaining days'], 'qty'),
                'leave-mix' => $share('Approved leave by type', 'type', 'used', 'qty'),
            ],
            'hr-payroll' => [
                'payroll-trend' => $column('Payroll by period', 'period', ['expense' => 'Salary expense', 'net_pay' => 'Net salary', 'due' => 'Current unpaid salary'], source: 'chronological'),
                'payroll-components' => $column('Payroll additions & deductions', null, ['base' => 'Prorated salary', 'overtime' => 'Overtime', 'bonus' => 'Bonus', 'commission' => 'Commission', 'deductions' => 'Other deductions', 'recovery' => 'Advance recovery']),
            ],
            'hr-balances' => [
                'employee-balances' => $column('Salary payable vs. recoverable advances', 'name', ['payable' => 'Salary payable', 'advance' => 'Recoverable advances']),
            ],
            'hr-ledger' => [
                'hr-ledger-trend' => $line('Staff expenses & cash out over time', 'date', ['expense' => 'Expenses', 'cash_out' => 'Net cash out']),
                'hr-ledger-types' => $share('Ledger entries by type', 'kind', '#', 'qty'),
            ],
            'hr-bookers' => [
                'booker-targets' => $column('Booker sales vs. targets', 'name', ['net_sales' => 'Net sales', 'target' => 'Target (full months)']),
                'employee-booker-receipts' => $column('Booker sales vs. receipts', 'name', ['net_sales' => 'Net sales', 'collections' => 'Actual allocated receipts'], description: self::PAYMENT_BASIS),
            ],
            'hr-operating-profit' => [
                'profit-components' => $column('From net sales to profit after payroll', null, ['sales' => 'Net sales', 'cost' => 'Net COGS', 'contribution' => 'Sales contribution', 'payroll' => 'Payroll expense', 'profit' => 'Profit after payroll']),
                'hr-cost-mix' => $share('COGS and payroll mix', null, ['cost' => 'Net COGS', 'payroll' => 'Payroll expense'], description: 'Only costs included in this report. Other operating expenses are excluded.'),
            ],
            default => [],
        };
    }
}
