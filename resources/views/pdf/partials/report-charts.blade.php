@foreach($charts ?? [] as $chart)
    <div class="report-chart">
        <h2>{{ $chart['title'] }}</h2>
        <div class="chart-meta">{{ $chart['subtitle'] }}</div>
        @php $plotHeight = isset($chart['height_per_width']) ? round($chart['height_per_width'] * $chartPlotWidth, 3) : null; @endphp
        <div class="report-plot @if($plotHeight !== null) report-plot-fixed @endif" @if($plotHeight !== null) style="height: {{ $plotHeight }}pt;" @endif>
            <img src="{{ $chart['image'] }}" alt="{{ $chart['title'] }}">
            @foreach($chart['labels'] ?? [] as $label)
                <span class="report-plot-label" style="left: {{ $label['x'] }}%; top: {{ round($label['y_per_plot_width'] * $chartPlotWidth, 3) }}pt; color: {{ $label['color'] }}; @if($label['width'] !== null) width: {{ $label['width'] }}%; text-align: center; @endif @if($label['bold']) font-weight: bold; @endif">{{ $label['text'] }}</span>
            @endforeach
        </div>
    </div>
@endforeach
