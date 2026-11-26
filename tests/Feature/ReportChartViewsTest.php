<?php

namespace Tests\Feature;

use App\Services\ReportChartData;
use App\Services\ReportPdfRenderer;
use App\Services\ReportVisualizationService;
use Tests\TestCase;

class ReportChartViewsTest extends TestCase
{
    public function test_receipt_mix_and_timeline_use_posted_tender_by_payment_date(): void
    {
        [$mix, $trend] = app(ReportChartData::class)->build('customer-receipts', ['rows' => [
            ['method' => 'Cash', 'payment_date' => '2026-11-23', 'received' => 75, 'settled' => 100, 'shortage' => 25],
            ['method' => 'Bank Transfer', 'payment_date' => '2026-11-21', 'received' => 200, 'settled' => 200, 'shortage' => 0],
            ['method' => 'Cash', 'payment_date' => '2026-11-23', 'received' => 25, 'settled' => 25, 'shortage' => 0],
        ]]);

        $this->assertSame('donut', $mix['kind']);
        $this->assertSame(['Bank Transfer', 'Cash'], array_column($mix['points'], 'label'));
        $this->assertEquals([[200], [100]], array_column($mix['points'], 'values'));
        $this->assertSame('line', $trend['kind']);
        $this->assertSame(['21 Nov', '22 Nov', '23 Nov'], array_column($trend['points'], 'label'));
        $this->assertEquals([[200], [0], [100]], array_column($trend['points'], 'values'));
    }

    public function test_aging_uses_buckets_instead_of_signed_ledger_balances(): void
    {
        [$mix, $aging] = app(ReportChartData::class)->build('outstanding', ['rows' => [
            ['customer' => 'A', 'balance' => 80, 'current' => 50, 'd31_60' => 30, 'd61_90' => 0, 'over_90' => 0],
            ['customer' => 'B', 'balance' => -20, 'current' => 0, 'd31_60' => 0, 'd61_90' => 0, 'over_90' => 0],
        ]]);

        $this->assertEquals([[50], [30]], array_column($mix['points'], 'values'));
        $this->assertSame('stacked', $aging['kind']);
        $this->assertEquals([50, 30, 0, 0], $aging['points'][0]['values']);
    }

    public function test_pie_groups_keep_the_tail_without_relabeling_negative_values(): void
    {
        $service = app(ReportChartData::class);
        $rows = array_map(fn ($number) => ['supplier' => 'Supplier '.$number, 'balance' => $number * 100], range(1, 10));
        $rows[] = ['supplier' => 'Advance', 'balance' => -500];
        [$view] = $service->build('supplier-payables', ['rows' => $rows]);
        $this->assertCount(7, $view['points']);
        $this->assertSame('4 remaining groups', $view['points'][6]['label']);
        $this->assertEquals(5500, array_sum(array_column(array_column($view['points'], 'values'), 0)));

        [$margin] = $service->build('product-sales', ['rows' => [
            ['product' => 'Returned item', 'supplier' => 'Supplier', 'revenue' => -20, 'net_revenue' => -20, 'net_cost' => -15, 'net_profit' => -5],
        ]]);
        $this->assertSame('column', $margin['kind']);
        $this->assertEquals([-20, -15, -5], $margin['points'][0]['values']);
        $this->assertCount(1, $service->build('product-sales', ['rows' => [['revenue' => -20, 'net_revenue' => -20]]]));
        $this->assertSame([], $service->build('product-sales', ['rows' => []]));
    }

    public function test_supplier_trend_uses_only_supplier_lines_instead_of_full_invoice_totals(): void
    {
        [$view] = app(ReportChartData::class)->build('supplier-purchase-value', [
            'rows' => [['product' => 'P', 'qty_sold' => 3, 'purchase_value' => 100]],
            'sections' => [['rows' => [
                ['invoice_date' => '2026-11-22', 'purchase_value' => 100, 'net_sale_value' => 150, 'invoice_total' => 1000],
            ]]],
        ]);

        $this->assertEquals([[100, 150]], array_column($view['points'], 'values'));
    }

    public function test_new_graphs_and_tables_render_on_separate_pdf_pages(): void
    {
        $service = app(ReportChartData::class);
        $print = app(ReportVisualizationService::class);
        $graphViews = [
            ...$service->build('customer-receipts', ['rows' => [
                ['method' => 'Cash', 'payment_date' => '2026-11-21', 'received' => 800],
                ['method' => 'Bank Transfer', 'payment_date' => '2026-11-23', 'received' => 1800],
            ]]),
            ...$service->build('product-sales', ['rows' => [
                ['product' => 'A product with a long name', 'net_revenue' => 1000, 'net_cost' => 200, 'net_profit' => 800],
                ['product' => 'Returned product with a long name', 'net_revenue' => -200, 'net_cost' => -100, 'net_profit' => -100],
            ]]),
        ];
        foreach ($graphViews as $view) {
            $chart = $print->printView($view);
            $image = $chart['ring'] ?? $chart['image'];
            $this->assertStringStartsWith('data:image/svg+xml;base64,', $image);
            $pdf = app(ReportPdfRenderer::class)->render([
                'title' => 'Report', 'filters' => [], 'columns' => [['key' => 'item', 'label' => 'Item']],
                'rows' => [['item' => 'Table only']], 'totals' => [], 'charts' => [$chart], 'separateChartPage' => true,
            ], 'landscape');
            $this->assertSame(2, $pdf->getDomPDF()->getCanvas()->get_page_count());
        }
    }
}
