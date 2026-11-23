<table class="items @if(count($columns) > 8) compact @endif">
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
                    <td colspan="{{ count($columns) }}" style="font-weight: bold; background: #dff4ee; text-transform: uppercase;">
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
                        @elseif(($column['format'] ?? '') === 'date')
                            {{ $value ? \Illuminate\Support\Carbon::parse($value)->format('d M Y') : '' }}
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
                    <td class="{{ ($column['align'] ?? '') === 'right' ? 'num' : '' }} {{ is_numeric($value) && (float) $value < 0 ? 'negative-value' : '' }}" style="font-weight: bold; border-top: 1.5px solid #10243a;">
                        {{ is_numeric($value) && ($column['format'] ?? '') === 'money' ? number_format((float) $value, 2) : $value }}
                    </td>
                @endforeach
            </tr>
        @endif
    </tbody>
</table>
