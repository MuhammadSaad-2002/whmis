<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $title }}</title>
    @include('pdf.partials.style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <h1>{{ config('app.name') }}</h1>
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

    <table class="items">
        <thead>
            <tr>
                @foreach($columns as $column)
                    <th @if(($column['align'] ?? '') === 'right') class="num" @endif>{{ $column['label'] }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @foreach($rows as $row)
                <tr>
                    @foreach($columns as $column)
                        @php $value = $row[$column['key']] ?? ''; @endphp
                        <td @if(($column['align'] ?? '') === 'right') class="num" @endif>
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
                        <td class="{{ ($column['align'] ?? '') === 'right' ? 'num' : '' }}" style="font-weight: bold; border-top: 1.5px solid #1a1a1a;">
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
