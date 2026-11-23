<div class="figure">
    <h2>{{ $title }}</h2>
    <div class="meta">Share of positive balances by age</div>
    <img class="mix-image" src="{{ $mix['image'] }}" alt="{{ $title }}">
    <table class="figure-labels">
        <tr>
            @foreach($mix['rows'] as $row)
                <td>
                    <span class="dot" style="background: {{ $row['color'] }};"></span> {{ $row['label'] }}<br>
                    <strong>{{ number_format($row['value'], 2) }}</strong>
                    <span class="meta">({{ number_format($row['share'] * 100) }}%)</span>
                </td>
            @endforeach
        </tr>
    </table>
</div>
