<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Barryvdh\DomPDF\PDF as PdfDocument;
use Dompdf\Canvas;
use Dompdf\FontMetrics;

class ReportPdfRenderer
{
    public const SIDE_MARGIN = 18;
    public const BOTTOM_MARGIN = 48;

    public function render(array $data, ?string $orientation = null): PdfDocument
    {
        $generatedAt = now('Asia/Karachi')->format('d M Y H:i');
        $widest = max([
            count($data['columns']),
            ...array_map(fn ($section) => count($section['columns']), $data['sections'] ?? []),
        ]);
        $document = Pdf::loadView('pdf.report', $data + ['generatedAt' => $generatedAt])
            ->setPaper('a4', $orientation ?? ($widest > 6 ? 'landscape' : 'portrait'));
        $document->render();

        // Draw outside the content area after pagination. A fixed HTML footer
        // is positioned relative to the content box, where it covers table rows.
        $credit = (string) config('branding.footer');
        $document->getDomPDF()->getCanvas()->page_script(
            static function (int $page, int $count, Canvas $canvas, FontMetrics $fonts) use ($credit, $generatedAt): void {
                $left = self::SIDE_MARGIN;
                $right = $canvas->get_width() - self::SIDE_MARGIN;
                $ruleY = $canvas->get_height() - 31;
                $font = $fonts->getFont('DejaVu Sans') ?? $fonts->getFont('Helvetica');
                $size = 8;
                $color = [0.29, 0.36, 0.42];
                $label = "Generated {$generatedAt} PKT · Page {$page} / {$count}";
                $labelX = $right - $fonts->getTextWidth($label, $font, $size);
                $maxCreditWidth = $labelX - $left - 10;
                $displayCredit = $credit;
                while ($fonts->getTextWidth($displayCredit, $font, $size) > $maxCreditWidth && mb_strlen($displayCredit) > 1) {
                    $displayCredit = mb_substr($displayCredit, 0, -2).'…';
                }

                $canvas->line($left, $ruleY, $right, $ruleY, [0.82, 0.86, 0.89], 0.5);
                $canvas->text($left, $ruleY + 6, $displayCredit, $font, $size, $color);
                $canvas->text($labelX, $ruleY + 6, $label, $font, $size, $color);
            }
        );

        return $document;
    }
}
