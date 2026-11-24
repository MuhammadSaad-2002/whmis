.report-chart { margin: 12px 0 16px; padding: {{ \App\Services\ReportPdfRenderer::CHART_PADDING }}pt; border: {{ \App\Services\ReportPdfRenderer::CHART_BORDER }}pt solid #d3e0e8; border-radius: 6px; page-break-inside: avoid; }
.report-chart h2 { margin: 0 0 3px; font-size: 15px; }
.report-chart .chart-meta { margin-bottom: 7px; font-size: 11px; color: #3e5367; }
.report-chart img { display: block; width: 100%; height: auto; }
.report-plot { position: relative; }
.report-plot-fixed img { position: absolute; top: 0; left: 0; }
.report-plot-label { position: absolute; font-size: 13px; line-height: 1.15; white-space: nowrap; }
