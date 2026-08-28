<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Executive Summary</title>
    @include('pdf.partials.style')
    <style>
        .kpi-grid { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .kpi-grid td { width: 25%; border: 1px solid #ddd; padding: 8px; vertical-align: top; }
        .kpi-grid .label { font-size: 8px; text-transform: uppercase; color: #777; }
        .kpi-grid .value { font-size: 14px; font-weight: bold; }
        .kpi-grid .delta { font-size: 8px; color: #555; }
        .section { margin-top: 16px; }
        .two-col { width: 100%; border-collapse: collapse; }
        .two-col > tbody > tr > td { width: 50%; vertical-align: top; padding: 0; }
        .two-col > tbody > tr > td:first-child { padding-right: 8px; }
    </style>
</head>
<body>
    @php
        $rs = fn ($v) => 'Rs '.number_format((float) $v, 2);
        $sign = fn ($d) => $d === null ? '—' : (($d >= 0 ? '▲ ' : '▼ ').abs($d).'% vs prev');
    @endphp

    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <div class="meta">Executive Summary</div>
            </td>
            <td style="text-align: right;" class="meta">
                Period: {{ $filterValues['from'] }} — {{ $filterValues['to'] }}<br>
                Generated {{ now()->format('d M Y H:i') }}
            </td>
        </tr>
    </table>

    <h2>Performance · this period</h2>
    <table class="kpi-grid">
        <tr>
            <td><div class="label">Sales</div><div class="value">{{ $rs($kpis['sales']) }}</div><div class="delta">{{ $sign($kpis['sales_delta']) }}</div></td>
            <td><div class="label">Gross Profit</div><div class="value">{{ $rs($kpis['profit']) }}</div><div class="delta">{{ $sign($kpis['profit_delta']) }}</div></td>
            <td><div class="label">Margin</div><div class="value">{{ $kpis['margin_pct'] }}%</div><div class="delta">prev {{ $kpis['prev_margin_pct'] }}%</div></td>
            <td><div class="label">Purchases</div><div class="value">{{ $rs($kpis['purchases']) }}</div><div class="delta">{{ $sign($kpis['purchases_delta']) }}</div></td>
        </tr>
    </table>

    <h2 style="margin-top:14px;">Financial position · as of now</h2>
    <table class="kpi-grid">
        <tr>
            <td><div class="label">Receivable</div><div class="value">{{ $rs($financials['receivable']) }}</div></td>
            <td><div class="label">Payable</div><div class="value">{{ $rs($financials['payable']) }}</div></td>
            <td><div class="label">Net Position</div><div class="value">{{ $rs($financials['net_position']) }}</div></td>
            <td><div class="label">Inventory (cost)</div><div class="value">{{ $rs($financials['inventory_value']) }}</div></td>
        </tr>
    </table>

    <table class="two-col section">
        <tr>
            <td>
                <h2>Receivables Aging</h2>
                <table class="items">
                    <thead><tr><th>Bucket (days)</th><th class="num">Amount</th></tr></thead>
                    <tbody>
                        @foreach($aging as $slice)
                            <tr><td>{{ $slice['label'] }}</td><td class="num">{{ number_format((float) $slice['value'], 2) }}</td></tr>
                        @endforeach
                    </tbody>
                </table>
            </td>
            <td>
                <h2>Stock on Loan · outstanding {{ number_format((float) $stockOnLoan['outstanding'], 2) }}</h2>
                <table class="items">
                    <thead><tr><th>Dir</th><th>Product</th><th class="num">Out</th></tr></thead>
                    <tbody>
                        @forelse($stockOnLoan['rows'] as $row)
                            <tr><td>{{ $row['direction'] }}</td><td>{{ $row['product'] }}</td><td class="num">{{ number_format((float) $row['outstanding'], 2) }}</td></tr>
                        @empty
                            <tr><td colspan="3" class="muted">No stock currently on loan.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </td>
        </tr>
    </table>

    <table class="two-col section">
        <tr>
            <td>
                <h2>Top Products by Net Revenue · period</h2>
                <table class="items">
                    <thead><tr><th>Product</th><th class="num">Net Revenue</th></tr></thead>
                    <tbody>
                        @forelse($topProducts as $row)
                            <tr><td>{{ $row['label'] }}</td><td class="num">{{ number_format((float) $row['value'], 2) }}</td></tr>
                        @empty
                            <tr><td colspan="2" class="muted">No sales in this period.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </td>
            <td>
                <h2>Sales by Supplier · period</h2>
                <table class="items">
                    <thead><tr><th>Supplier</th><th class="num">Net Revenue</th></tr></thead>
                    <tbody>
                        @forelse($salesBySupplier as $row)
                            <tr><td>{{ $row['label'] }}</td><td class="num">{{ number_format((float) $row['value'], 2) }}</td></tr>
                        @empty
                            <tr><td colspan="2" class="muted">No sales in this period.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </td>
        </tr>
    </table>

    <div class="section">
        <h2>Top Debtors · as of now</h2>
        <table class="items">
            <thead><tr><th>Customer</th><th>City</th><th class="num">Balance</th><th class="num">90+ Days</th></tr></thead>
            <tbody>
                @forelse($topDebtors as $row)
                    <tr>
                        <td>{{ $row['customer'] }}</td>
                        <td>{{ $row['city'] }}</td>
                        <td class="num">{{ number_format((float) $row['balance'], 2) }}</td>
                        <td class="num">{{ number_format((float) $row['over_90'], 2) }}</td>
                    </tr>
                @empty
                    <tr><td colspan="4" class="muted">Nothing outstanding.</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

    @include('pdf.partials.footer')
</body>
</html>
