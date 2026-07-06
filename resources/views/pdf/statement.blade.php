<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Statement — {{ $party->name }}</title>
    @include('pdf.partials.style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <h1>{{ config('app.name') }}</h1>
                <div class="meta">{{ $partyLabel }} Account Statement</div>
            </td>
            <td style="text-align: right;">
                <h1>{{ $party->name }}</h1>
                <div class="meta">
                    @if($party->phone) Phone: {{ $party->phone }}<br> @endif
                    Period:
                    {{ $from?->format('d M Y') ?? 'Beginning' }} — {{ $to?->format('d M Y') ?? now()->format('d M Y') }}
                </div>
            </td>
        </tr>
    </table>

    @php $isCustomer = $partyLabel === 'Customer'; $sign = $isCustomer ? 1 : -1; @endphp

    <table class="items">
        <thead>
            <tr>
                <th>Date</th><th>Type</th><th>Description</th>
                <th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td colspan="5"><strong>Opening Balance</strong></td>
                <td class="num"><strong>{{ number_format($sign * $statement['opening_balance'], 2) }}</strong></td>
            </tr>
            @foreach($statement['rows'] as $row)
                <tr>
                    <td>{{ \Illuminate\Support\Carbon::parse($row['date'])->format('d M Y') }}</td>
                    <td>{{ ucfirst(str_replace('_', ' ', $row['type'])) }}</td>
                    <td>{{ $row['description'] }}</td>
                    <td class="num">{{ $row['debit'] > 0 ? number_format($row['debit'], 2) : '' }}</td>
                    <td class="num">{{ $row['credit'] > 0 ? number_format($row['credit'], 2) : '' }}</td>
                    <td class="num">{{ number_format($sign * $row['balance'], 2) }}</td>
                </tr>
            @endforeach
            <tr>
                <td colspan="5"><strong>Closing Balance</strong></td>
                <td class="num"><strong>{{ number_format($sign * $statement['closing_balance'], 2) }}</strong></td>
            </tr>
        </tbody>
    </table>

    <h2 style="margin-top: 14px;">Aging</h2>
    <table class="items" style="width: 60%;">
        <thead>
            <tr>
                <th class="num">Current (0–30)</th><th class="num">31–60</th>
                <th class="num">61–90</th><th class="num">Over 90</th><th class="num">Total Due</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="num">{{ number_format($aging['current'], 2) }}</td>
                <td class="num">{{ number_format($aging['31_60'], 2) }}</td>
                <td class="num">{{ number_format($aging['61_90'], 2) }}</td>
                <td class="num">{{ number_format($aging['over_90'], 2) }}</td>
                <td class="num"><strong>{{ number_format($aging['total'], 2) }}</strong></td>
            </tr>
        </tbody>
    </table>

    <div class="footer">
        Generated {{ now()->format('d M Y H:i') }} · {{ config('app.name') }}
    </div>
</body>
</html>
