<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $title }}</title>
    @include('pdf.partials.style', [
        'pageMargins' => '18pt '.\App\Services\ReportPdfRenderer::SIDE_MARGIN.'pt '.\App\Services\ReportPdfRenderer::BOTTOM_MARGIN.'pt',
    ])
    <style>
        body { padding: 0; }
        .report-chart { margin: 12px 0 16px; padding: 10px; border: 1px solid #d3e0e8; border-radius: 6px; page-break-inside: avoid; }
        .report-chart h2 { margin: 0 0 2px; }
        .report-chart .chart-meta { margin-bottom: 7px; font-size: 8.5px; color: #496175; }
        .report-chart img { display: block; width: 100%; height: auto; }
        table.items.compact th { padding: 3px 3px; font-size: 7px; }
        table.items.compact td { padding: 3px 3px; font-size: 7.5px; }
        .negative-guide { margin: 8px 0; padding: 6px 8px; border-left: 3px solid #dc2626; background: #fff7f7; color: #7f1d1d; font-size: 8.5px; line-height: 1.45; }
        .negative-value { color: #b91c1c; font-weight: bold; }
        .section-title { margin-top: 14px; page-break-after: avoid; }
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
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <div class="meta">{{ $title }} · {{ count($rows) }} rows</div>
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

    @if(!empty($notes))
        <div class="meta report-notes">
            @foreach($notes as $note)<p>{{ $note }}</p>@endforeach
        </div>
    @endif

    @php
        $hasNegativeValues = collect($rows)->contains(
            fn ($row) => collect($row)->contains(fn ($value) => is_numeric($value) && (float) $value < 0)
        ) || collect($totals)->contains(fn ($value) => is_numeric($value) && (float) $value < 0)
            || collect($sections ?? [])->contains(fn ($section) => collect($section['rows'])->contains(
                fn ($row) => collect($row)->contains(fn ($value) => is_numeric($value) && (float) $value < 0)
            ));
    @endphp
    @if($hasNegativeValues)
        <div class="negative-guide">
            <strong>Why values may be negative:</strong>
            negative sales or revenue means returns exceed sales in the selected data;
            negative profit means net costs and return effects exceed net revenue;
            negative quantity means returns or outbound movement exceed incoming quantity;
            and a negative balance generally represents an advance or credit balance.
        </div>
    @endif

    @if(!empty($charts))
        @foreach($charts as $chart)
            <div class="report-chart">
                <h2>{{ $chart['title'] }}</h2>
                <div class="chart-meta">{{ $chart['subtitle'] }}</div>
                <img src="{{ $chart['image'] }}" alt="{{ $chart['title'] }}">
            </div>
        @endforeach
    @endif

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
