<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $title }}</title>
    @include('pdf.partials.style')
    <style>
        .report-chart { margin: 12px 0 16px; padding: 10px; border: 1px solid #d8dee8; border-radius: 6px; page-break-inside: avoid; }
        .report-chart h2 { margin: 0 0 2px; color: #1f2937; }
        .report-chart .chart-meta { margin-bottom: 7px; font-size: 8.5px; color: #6b7280; }
        .report-chart img { display: block; width: 100%; height: auto; }
        .negative-guide { margin: 8px 0; padding: 6px 8px; border-left: 3px solid #dc2626; background: #fff7f7; color: #7f1d1d; font-size: 8.5px; line-height: 1.45; }
        .negative-value { color: #b91c1c; font-weight: bold; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <div class="meta">{{ $title }} · {{ count($rows) }} rows</div>
            </td>
            <td style="text-align: right;" class="meta">
                @if(!empty($filters['from']) || !empty($filters['to']))
                    Period: {{ $filters['from'] ?? '…' }} — {{ $filters['to'] ?? '…' }}<br>
                @endif
                Generated {{ now()->format('d M Y H:i') }}
            </td>
        </tr>
    </table>

    @php
        $hasNegativeValues = collect($rows)->contains(
            fn ($row) => collect($row)->contains(fn ($value) => is_numeric($value) && (float) $value < 0)
        ) || collect($totals)->contains(fn ($value) => is_numeric($value) && (float) $value < 0);
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

    <table class="items" @if(!empty($charts)) style="page-break-before: always;" @endif>
        <thead>
            <tr>
                @foreach($columns as $column)
                    <th @if(($column['align'] ?? '') === 'right') class="num" @endif>{{ $column['label'] }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @foreach($rows as $index => $row)
                @if(!empty($groupBy) && ($index === 0 || ($rows[$index - 1][$groupBy] ?? null) !== ($row[$groupBy] ?? null)))
                    <tr>
                        <td colspan="{{ count($columns) }}" style="font-weight: bold; background: #eef2f7; text-transform: uppercase;">
                            {{ $row[$groupBy] ?? 'Other' }}
                        </td>
                    </tr>
                @endif
                <tr>
                    @foreach($columns as $column)
                        @php $value = $row[$column['key']] ?? ''; @endphp
                        <td class="{{ ($column['align'] ?? '') === 'right' ? 'num' : '' }} {{ is_numeric($value) && (float) $value < 0 ? 'negative-value' : '' }}">
                            @if(in_array($column['format'] ?? '', ['money']))
                                {{ is_numeric($value) ? number_format((float) $value, 2) : $value }}
                            @elseif(($column['format'] ?? '') === 'pct')
                                {{ $value }}%
                            @else
                                {{ $value }}
                            @endif
                        </td>
                    @endforeach
                </tr>
            @endforeach
            @if($totals !== [])
                <tr>
                    @foreach($columns as $index => $column)
                        @php $value = $totals[$column['key']] ?? ($index === 0 ? 'TOTAL' : ''); @endphp
                        <td class="{{ ($column['align'] ?? '') === 'right' ? 'num' : '' }} {{ is_numeric($value) && (float) $value < 0 ? 'negative-value' : '' }}" style="font-weight: bold; border-top: 1.5px solid #1a1a1a;">
                            {{ is_numeric($value) && ($column['format'] ?? '') === 'money' ? number_format((float) $value, 2) : $value }}
                        </td>
                    @endforeach
                </tr>
            @endif
        </tbody>
    </table>

    @include('pdf.partials.footer')
</body>
</html>
