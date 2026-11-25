<?php

namespace Tests\Feature;

use App\Services\ReportPdfRenderer;
use App\Services\ReportVisualizationService;
use Barryvdh\DomPDF\Facade\Pdf;
use Tests\TestCase;

class ReportPdfLayoutTest extends TestCase
{
    public function test_report_body_and_numbered_footers_stay_separate_in_both_orientations(): void
    {
        config(['branding.footer' => 'Report Footer Check']);

        foreach ([5, 9] as $columnCount) {
            $columns = array_map(fn ($i) => ['key' => 'c'.$i, 'label' => 'Column '.$i], range(1, $columnCount));
            $rows = array_map(fn ($i) => ['c1' => sprintf('Body Row %03d', $i)], range(1, 155));
            $document = app(ReportPdfRenderer::class)->render([
                'title' => 'Footer Layout', 'filters' => [], 'columns' => $columns, 'rows' => $rows, 'totals' => [],
            ]);
            $dompdf = $document->getDomPDF();
            $canvas = $dompdf->getCanvas();
            $pages = $canvas->get_page_count();

            $this->assertGreaterThan(1, $pages);
            $this->assertSame($columnCount > 6, $canvas->get_width() > $canvas->get_height());
            $this->assertEquals(ReportPdfRenderer::BOTTOM_MARGIN, $dompdf->getCss()->get_page_styles()['base']->margin_bottom);

            // Dompdf's uncompressed PDF stores text drawing commands with
            // coordinates measured upward from the bottom of the paper.
            $pdf = $document->output(['compress' => false]);
            $this->assertTrue(str_contains($pdf, '/InstrumentSans-Regular'), 'Report embeds Instrument Sans.');
            $rowsInPdf = $this->baselines($pdf, 'Body Row');
            $footersInPdf = $this->baselines($pdf, 'Report Footer Check');
            $this->assertCount(count($rows), $rowsInPdf);
            $this->assertCount($pages, $footersInPdf);
            $this->assertGreaterThan(20, min($rowsInPdf) - max($footersInPdf));
            for ($page = 1; $page <= $pages; $page++) {
                $this->assertCount(1, $this->baselines($pdf, "Page {$page} / {$pages}"));
            }
        }
    }

    public function test_trend_labels_render_in_the_pdf_chart_area(): void
    {
        $charts = app(ReportVisualizationService::class)->pdfCharts('profit-by-month', [
            'chart' => [['label' => 'January', 'sales' => 100, 'profit' => 20], ['label' => 'February', 'sales' => 120, 'profit' => 40]],
        ]);
        $pdf = app(ReportPdfRenderer::class)->render([
            'title' => 'Trend Layout', 'filters' => [], 'columns' => [['key' => 'label', 'label' => 'Breakdown']],
            'rows' => [['label' => 'Table Row']], 'totals' => [], 'charts' => $charts,
        ])->output(['compress' => false]);

        $title = $this->baselines($pdf, 'Sales and Profit Trend');
        $table = $this->baselines($pdf, 'Table Row');
        $this->assertCount(1, $title);
        $this->assertCount(1, $table);
        foreach (['January', 'February', 'Net Sales', 'Net Profit'] as $label) {
            $positions = $this->baselines($pdf, $label);
            $this->assertCount(1, $positions);
            $this->assertGreaterThan($table[0], $positions[0]);
            $this->assertLessThan($title[0], $positions[0]);
        }
    }

    public function test_item_rows_are_compact_in_document_and_readable_report_pdfs(): void
    {
        $styles = view('pdf.partials.document-style')->render();
        $document = Pdf::loadHTML(<<<HTML
            <html><head>{$styles}</head><body>
                <table class="items"><tbody>
                    <tr><td>First item</td></tr><tr><td>Second item</td></tr>
                </tbody></table>
            </body></html>
            HTML)->setPaper('a4')->output(['compress' => false]);
        $reportData = [
            'title' => 'Table Density', 'filters' => [], 'readable' => true,
            'columns' => [['key' => 'item', 'label' => 'Product']],
            'rows' => [['item' => 'First item'], ['item' => 'Second item']], 'totals' => [],
        ];
        $renderer = app(ReportPdfRenderer::class);
        $report = $renderer->render($reportData)->output(['compress' => false]);
        $reportData['columns'] = [...$reportData['columns'], ...array_map(
            fn ($i) => ['key' => 'c'.$i, 'label' => 'Column '.$i], range(1, 8),
        )];
        $wideReport = $renderer->render($reportData)->output(['compress' => false]);

        foreach ([[$document, 22.5], [$report, 22.5], [$wideReport, 18.5]] as [$pdf, $maxSpacing]) {
            $first = $this->baselines($pdf, 'First item');
            $second = $this->baselines($pdf, 'Second item');
            $this->assertCount(1, $first);
            $this->assertCount(1, $second);
            $this->assertGreaterThan(12, $first[0] - $second[0]);
            $this->assertLessThanOrEqual($maxSpacing, $first[0] - $second[0]);
        }
    }

    private function baselines(string $pdf, string $text): array
    {
        $encoded = preg_quote(mb_convert_encoding($text, 'UTF-16BE', 'UTF-8'), '~');
        preg_match_all('~BT [\d.]+ ([\d.]+) Td [^\r\n]*'.$encoded.'~', $pdf, $matches);

        return array_map('floatval', $matches[1]);
    }
}
