<style>
    @include('pdf.partials.font')
    @page { margin: {{ \App\Services\ReportPdfRenderer::PAGE_MARGINS }}; }
    /* Keep the page frame margins; reset the document body and its children only. */
    body, body * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Instrument Sans', 'DejaVu Sans', sans-serif; font-size: 10pt; line-height: 1.35; color: #10243a; }
    h1 { font-size: 16pt; line-height: 1.2; margin-bottom: 2pt; }
    h2 { font-size: 12pt; line-height: 1.25; color: #234968; margin-bottom: 4pt; page-break-after: avoid; }
    .meta, .muted { color: #496175; }
    .meta { font-size: 9pt; line-height: 1.4; }
    .header { width: 100%; border-bottom: 2px solid #087568; margin-bottom: 10pt; padding-bottom: 8pt; page-break-inside: avoid; }
    .header td { vertical-align: top; }
    .document-title { margin: 3pt 0 2pt; }
    .document-info { width: 100%; margin-bottom: 10pt; page-break-inside: avoid; }
    .document-info td { vertical-align: top; }
    .document-section { margin-top: 12pt; }
    .document-note { margin-top: 10pt; overflow-wrap: break-word; }
    .document-callout { margin-top: 10pt; padding: 6pt 8pt; border: 1px solid #d3e0e8; background: #f4f8fa; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 8pt; }
    table.items thead { display: table-header-group; }
    table.items tr { page-break-inside: avoid; }
    table.items th, table.items td { border: 1px solid #d3e0e8; padding: 4pt 5pt; vertical-align: top; overflow-wrap: break-word; }
    table.items th { background: #edf3f6; font-size: 8.5pt; line-height: 1.2; text-transform: uppercase; text-align: left; }
    table.items th.num, .num { text-align: right; font-variant-numeric: tabular-nums; }
    .subtotal { background: #edf3f6; font-weight: bold; }
    table.totals { width: 260pt; border-collapse: collapse; margin: 10pt 0 0 auto; page-break-inside: avoid; }
    table.totals td { padding: 3pt 5pt; }
    table.totals .grand td { border-top: 1pt solid #10243a; background: #edf3f6; font-weight: bold; font-size: 11pt; }
    .badge { display: inline-block; border: 1px solid #d3e0e8; background: #edf3f6; border-radius: 3pt; padding: 0 4pt; font-size: 8.5pt; text-transform: uppercase; }
</style>
