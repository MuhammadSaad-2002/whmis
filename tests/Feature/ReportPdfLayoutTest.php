<?php

namespace Tests\Feature;

use App\Services\ReportPdfRenderer;
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

    private function baselines(string $pdf, string $text): array
    {
        $encoded = preg_quote(mb_convert_encoding($text, 'UTF-16BE', 'UTF-8'), '~');
        preg_match_all('~BT [\d.]+ ([\d.]+) Td [^\r\n]*'.$encoded.'~', $pdf, $matches);

        return array_map('floatval', $matches[1]);
    }
}
