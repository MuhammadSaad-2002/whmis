@foreach($charts ?? [] as $chart)
    <div class="report-chart">
        <h2>{{ $chart['title'] }}</h2>
        @if(!empty($chart['subtitle']))<div class="chart-meta">{{ $chart['subtitle'] }}</div>@endif
        @if(!empty($chart['ring']))
            <table class="report-ring">
                <tr>
                    <td class="report-ring-plot">
                        <div class="report-ring-art"><img src="{{ $chart['ring'] }}" alt="{{ $chart['title'] }}"></div>
                        <div class="report-ring-total">Total shown: {{ $chart['total'] }}</div>
                    </td>
                    <td class="report-ring-legend">
                        <table>
                            @foreach($chart['legend'] as $item)
                                <tr>
                                    <td><span class="report-swatch" style="background: {{ $item['color'] }};"></span>{{ $item['label'] }}</td>
                                    <td class="report-ring-value">{{ $item['value'] }}</td>
                                    <td class="report-ring-value">{{ $item['share'] }}</td>
                                </tr>
                            @endforeach
                        </table>
                    </td>
                </tr>
            </table>
        @elseif(!empty($chart['bars']))
            <table class="report-bars">
                <tbody>
                @foreach($chart['bars'] as $bar)
                    <tr>
                        <td class="bar-label">{{ $bar['label'] }}</td>
                        <td class="bar-cell">
                            <div class="bar-track">
                                @if($bar['zero'] !== null)
                                    <span class="bar-zero" style="left: {{ $bar['zero'] }}%;"></span>
                                @endif
                                @if($bar['width'] > 0)
                                    <span class="bar-fill" style="left: {{ $bar['start'] }}%; width: {{ $bar['width'] }}%; background: {{ $bar['color'] }};"></span>
                                @endif
                            </div>
                        </td>
                        <td class="bar-value" style="color: {{ $bar['color'] }};">{{ $bar['value'] }}</td>
                    </tr>
                @endforeach
                </tbody>
            </table>
        @else
            @if(!empty($chart['units']))<div class="chart-meta">{{ $chart['units'] }}</div>@endif
            @php $plotHeight = isset($chart['height_per_width']) ? round($chart['height_per_width'] * $chartPlotWidth, 3) : null; @endphp
            <div class="report-plot @if($plotHeight !== null) report-plot-fixed @endif" @if($plotHeight !== null) style="height: {{ $plotHeight }}pt;" @endif>
                <img src="{{ $chart['image'] }}" alt="{{ $chart['title'] }}">
                @foreach($chart['labels'] ?? [] as $label)
                    <span class="report-plot-label" style="left: {{ $label['x'] }}%; top: {{ round($label['y_per_plot_width'] * $chartPlotWidth, 3) }}pt; color: {{ $label['color'] }}; @if($label['width'] !== null) width: {{ $label['width'] }}%; text-align: center; @endif @if($label['bold']) font-weight: bold; @endif">{{ $label['text'] }}</span>
                @endforeach
            </div>
            @if(!empty($chart['seriesLegend']))
                <div class="report-series-legend">
                    @foreach($chart['seriesLegend'] as $item)
                        <span><span class="report-swatch" style="background: {{ $item['color'] }};"></span>{{ $item['label'] }}</span>
                    @endforeach
                </div>
            @endif
            @if(!empty($chart['keyLabels']))
                <div class="report-chart-keys">
                    @foreach($chart['keyLabels'] as $label)<div>{{ $label }}</div>@endforeach
                </div>
            @endif
        @endif
    </div>
@endforeach
