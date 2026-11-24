<?php

namespace Tests\Feature;

use App\Exports\ReportExport;
use App\Support\MoneyDisplay;
use App\Support\Paisa;
use App\Support\ReportTotals;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
use Tests\TestCase;

class MoneyDisplayTest extends TestCase
{
    public function test_signed_rupee_rounding_preserves_rows_and_applies_to_money_aggregates(): void
    {
        $this->assertSame(124900, Paisa::roundToRupee(124949));
        $this->assertSame(125000, Paisa::roundToRupee(124950));
        $this->assertSame(-125000, Paisa::roundToRupee(-124950));

        $report = ReportTotals::roundMoney([
            'columns' => [
                ['key' => 'received', 'format' => 'money'],
                ['key' => 'due', 'format' => 'money'],
                ['key' => 'quantity', 'format' => 'number'],
            ],
            'rows' => [['received' => 0.25], ['received' => 0.25]],
            'totals' => ['received' => 0.50, 'due' => -1.50, 'quantity' => 2.50],
        ]);

        $this->assertSame([['received' => 0.25], ['received' => 0.25]], $report['rows']);
        $this->assertSame(['received' => 1, 'due' => -2, 'quantity' => 2.50], $report['totals']);
    }

    public function test_only_zero_paisa_are_hidden_in_totals(): void
    {
        $this->assertSame('1,250', MoneyDisplay::total('1250.00'));
        $this->assertSame('1,250.50', MoneyDisplay::total('1250.50'));
        $this->assertSame('-1,250', MoneyDisplay::total('-1250.00'));
        $this->assertSame('-1,250.01', MoneyDisplay::total('-1250.01'));
        $this->assertSame('0', MoneyDisplay::total(0));
    }

    public function test_pdf_table_preserves_detail_precision_and_formats_final_amounts(): void
    {
        $columns = [
            ['key' => 'label', 'label' => 'Details'],
            ['key' => 'amount', 'label' => 'Amount', 'format' => 'money'],
            ['key' => 'net', 'label' => 'Net', 'format' => 'money', 'final' => true],
        ];
        $html = view('pdf.partials.report-table', [
            'columns' => $columns,
            'rows' => [['label' => 'Row', 'amount' => 731, 'net' => 231]],
            'totals' => ['amount' => 731, 'net' => 231.5],
        ])->render();

        $this->assertMatchesRegularExpression('~>\s*731\.00\s*</td>~', $html);
        $this->assertMatchesRegularExpression('~>\s*731\s*</td>~', $html);
        $this->assertMatchesRegularExpression('~>\s*231\s*</td>~', $html);
        $this->assertMatchesRegularExpression('~>\s*231\.50\s*</td>~', $html);
    }

    public function test_excel_totals_stay_numeric_and_detail_rows_keep_two_decimals(): void
    {
        $columns = [
            ['key' => 'label', 'label' => 'Label'],
            ['key' => 'amount', 'label' => 'Amount', 'format' => 'money'],
            ['key' => 'net', 'label' => 'Net', 'format' => 'money'],
        ];
        $export = new ReportExport($columns, [['label' => 'First line', 'amount' => 1000, 'net' => 20.50]],
            ['amount' => 1000, 'net' => 20.50], [[
                'title' => 'Summary', 'columns' => [$columns[0], $columns[1] + ['final' => true]],
                'rows' => [['label' => 'Grand Total', 'amount' => 1000], ['label' => 'Other Total', 'amount' => 20.50]], 'totals' => [],
            ]]);

        $file = tmpfile();
        try {
            fwrite($file, Excel::raw($export, \Maatwebsite\Excel\Excel::XLSX));
            $sheet = (new Xlsx)->load(stream_get_meta_data($file)['uri'])->getActiveSheet();
            $this->assertSame('1,000.00', $sheet->getCell('B2')->getFormattedValue());
            $this->assertSame('1,000', $sheet->getCell('B3')->getFormattedValue());
            $this->assertSame(1000, $sheet->getCell('B3')->getValue());
            $this->assertSame('20.50', $sheet->getCell('C3')->getFormattedValue());
            $this->assertSame(20.5, $sheet->getCell('C3')->getValue());
            $this->assertSame('1,000', $sheet->getCell('B7')->getFormattedValue());
            $this->assertSame('20.50', $sheet->getCell('B8')->getFormattedValue());
        } finally {
            fclose($file);
        }
    }

    public function test_invoice_prints_keep_subtotals_and_strip_zero_paisa_from_the_grand_total(): void
    {
        $party = (object) ['name' => 'Test party', 'address' => null, 'city' => null, 'phone' => null, 'drug_license_no' => null, 'ntn_number' => null];
        $invoice = (object) [
            'invoice_number' => 'TEST-1', 'booking' => null, 'invoice_date' => now(), 'due_date' => null, 'status' => 'posted',
            'customer' => $party, 'company' => $party, 'warehouse' => (object) ['name' => 'Main'], 'sale_type' => 'credit',
            'purchase_type' => 'credit', 'supplier_invoice_number' => null, 'items' => [], 'subtotal' => '1250.00',
            'item_discount_total' => 0, 'item_gst_total' => 0, 'discount_amount' => 0, 'gst_amount' => 0,
            'total_amount' => '1250.00', 'total_margin' => 0, 'margin_percent' => 0, 'sale_terms' => null, 'notes' => null,
        ];
        foreach (['pdf.sales-invoice', 'pdf.purchase-invoice'] as $template) {
            $invoice->total_amount = '1250.00';
            $html = view($template, compact('invoice'))->render();
            $this->assertStringContainsString('Subtotal</td><td class="num">1,250.00</td>', $html);
            $this->assertStringContainsString('Total (Rs)</td><td class="num">1,250</td>', $html);

            $invoice->total_amount = '1250.50';
            $this->assertStringContainsString('Total (Rs)</td><td class="num">1,250.50</td>', view($template, compact('invoice'))->render());
        }
    }
}
