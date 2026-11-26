.report-chart { margin: 12px 0 16px; padding: {{ \App\Services\ReportPdfRenderer::CHART_PADDING }}pt; border: {{ \App\Services\ReportPdfRenderer::CHART_BORDER }}pt solid #d3e0e8; border-radius: 6px; page-break-inside: avoid; }
.report-chart h2 { margin: 0 0 3px; font-size: 15px; }
.report-chart .chart-meta { margin-bottom: 7px; font-size: 11px; color: #3e5367; }
.report-chart img { display: block; width: 100%; height: auto; }
.report-plot { position: relative; }
.report-plot-fixed img { position: absolute; top: 0; left: 0; }
.report-plot-label { position: absolute; font-size: 13px; line-height: 1.15; white-space: nowrap; }
.report-bars { width: 100%; border-collapse: collapse; table-layout: fixed; }
.report-bars td { padding: 4pt 5pt; border-bottom: .5pt solid #e3ebf1; font-size: 10pt; line-height: 1.2; vertical-align: middle; }
.report-bars tr:last-child td { border-bottom: 0; }
.report-bars .bar-label { width: 34%; color: #263b4d; overflow-wrap: break-word; }
.report-bars .bar-cell { width: 47%; }
.report-bars .bar-value { width: 19%; font-weight: bold; text-align: right; white-space: nowrap; }
.report-bars .bar-track { position: relative; height: 9pt; background: #edf2f5; }
.report-bars .bar-zero { position: absolute; z-index: 1; top: -1pt; height: 11pt; width: .6pt; background: #54697a; }
.report-bars .bar-fill { position: absolute; top: 0; height: 9pt; }
.report-ring { width: 100%; table-layout: fixed; border-collapse: collapse; }
.report-ring > tbody > tr > td { vertical-align: middle; }
.report-ring .report-ring-plot { width: 35%; text-align: center; }
.report-ring-art { position: relative; width: 145pt; height: 145pt; margin: 0 auto; }
.report-ring .report-ring-art img { position: absolute; top: 0; left: 0; width: 145pt; height: 145pt; }
.report-ring-total { margin: 3pt 0 5pt; font-size: 10pt; font-weight: bold; }
.report-ring-legend { width: 65%; padding: 0 6pt; }
.report-ring-legend table { width: 100%; border-collapse: collapse; }
.report-ring-legend td { border-bottom: .5pt solid #e3ebf1; padding: 6pt 4pt; font-size: 10pt; overflow-wrap: break-word; }
.report-ring-legend tr:last-child td { border-bottom: 0; }
.report-ring-value { width: 1%; text-align: right; white-space: nowrap; font-weight: bold; }
.report-swatch { display: inline-block; width: 7pt; height: 7pt; margin-right: 4pt; }
.report-series-legend, .report-chart-keys { color: #263b4d; font-size: 9.5pt; }
.report-series-legend > span { display: inline-block; white-space: nowrap; margin: 1pt 8pt 3pt 0; }
.report-chart-keys { margin-top: 4pt; padding-top: 4pt; border-top: .5pt solid #e3ebf1; }
.report-chart-keys > div { display: inline-block; width: 47%; vertical-align: top; margin: 1pt 2pt; overflow-wrap: break-word; }
