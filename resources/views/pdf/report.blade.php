<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $title }}</title>
    @include('pdf.partials.style', [
        'pageMargins' => \App\Services\ReportPdfRenderer::PAGE_MARGINS,
    ])
    <style>
        body { padding: 0; }
        @include('pdf.partials.report-chart-style')
        table.items thead { display: table-header-group; }
        table.items.compact th { padding: 2px 3px; font-size: 7px; }
        table.items.compact td { padding: 2px 3px; font-size: 7.5px; }
        @if(!empty($readable))
            body { font-size: 10pt; }
            .document-title { margin: 3pt 0; font-size: 14pt; }
            table.items th, table.items.compact th { font-size: 8.5pt; }
            table.items th.num { text-align: right; }
            table.items.compact td { font-size: 9pt; }
        @endif
        .negative-guide { margin: 8px 0; padding: 6px 8px; border-left: 3px solid #dc2626; background: #fff7f7; color: #7f1d1d; font-size: 8.5px; line-height: 1.45; }
        .negative-value { color: #b91c1c; font-weight: bold; }
        .section-title { margin-top: 14px; page-break-after: avoid; }
        .chart-table-break { page-break-before: always; }
        .report-summary { page-break-inside: avoid; }
        .report-summary table.items th:first-child { width: 70%; }
        .report-summary table.items tbody tr:last-child td { font-weight: bold; background: #e1f4f0; }
        .report-notes { margin: 8px 0; }
        .report-scope {
            display: inline-block;
            margin: 5px 0 2px;
            padding: 4px 8px;
            background: #e1f4f0;
            border-left: 3px solid #087568;
            color: #075b50;
            font-size: 12px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    @php $separateCharts = !empty($separateChartPage) && !empty($charts); @endphp
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                @if(!empty($readable))
                    <h2 class="document-title">{{ $title }}</h2>
                @else
                    <div class="meta">{{ $title }} · {{ count($rows) }} rows</div>
                @endif
                @if(!empty($headerLabel))
                    <div class="report-scope">{{ $headerLabel }}</div>
                @endif
                @if(!empty($context))
                    <div class="meta">{{ $context }}</div>
                @endif
            </td>
            <td style="text-align: right;" class="meta">
                @if(!empty($filters['from']) || !empty($filters['to']))
                    Period: {{ $filters['from'] ?? '…' }} — {{ $filters['to'] ?? '…' }}<br>
                @endif
                Generated {{ $generatedAt ?? now('Asia/Karachi')->format('d M Y H:i') }} PKT
            </td>
        </tr>
    </table>

    @if($separateCharts)
        @include('pdf.partials.report-charts')
        <div class="chart-table-break">
            <h2 class="document-title">{{ $title }} — Details</h2>
            @if(!empty($headerLabel))<p class="meta">{{ $headerLabel }}</p>@endif
        </div>
    @endif

    @if(!empty($notes))
        <div class="meta report-notes">
            @foreach($notes as $note)<p>{{ $note }}</p>@endforeach
        </div>
    @endif

    @php
        $hasNegativeRows = function ($tableRows, $tableColumns) {
            $textKeys = array_column(array_filter($tableColumns, fn ($column) => $column['wrap'] ?? false), 'key');

            return collect($tableRows)->contains(fn ($row) => collect($row)->except($textKeys)
                ->contains(fn ($value) => is_numeric($value) && (float) $value < 0));
        };
        $hasNegativeValues = $hasNegativeRows($rows, $columns)
            || collect($totals)->contains(fn ($value) => is_numeric($value) && (float) $value < 0)
            || collect($sections ?? [])->contains(
                fn ($section) => $hasNegativeRows($section['rows'], $section['columns'])
            );
    @endphp
    @if($hasNegativeValues)
        <div class="negative-guide">
            <strong>Why values may be negative:</strong>
            @if(!empty($negativeGuide))
                {{ $negativeGuide }}
            @else
                negative sales or revenue means returns exceed sales in the selected data;
                negative profit means net costs and return effects exceed net revenue;
                negative quantity means returns or outbound movement exceed incoming quantity;
                and a negative balance generally represents an advance or credit balance.
            @endif
        </div>
    @endif

    @unless($separateCharts)
        @include('pdf.partials.report-charts')
    @endunless

    @if(!empty($sectionTitle))
        <h2 class="section-title">{{ $sectionTitle }}</h2>
    @endif
    @include('pdf.partials.report-table')
    @foreach($sections ?? [] as $section)
        <div @if($section['keep_together'] ?? false) class="report-summary" @endif>
            <h2 class="section-title">{{ $section['title'] }}</h2>
            @include('pdf.partials.report-table', [
                'columns' => $section['columns'],
                'rows' => $section['rows'],
                'totals' => $section['totals'],
                'groupBy' => $section['group_by'] ?? null,
            ])
        </div>
    @endforeach

</body>
</html>
