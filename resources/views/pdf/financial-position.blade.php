<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Financial Position</title>
    @include('pdf.partials.style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <h1>MP Sub Office</h1>
                <div class="meta">Financial Position — Receivables &amp; Payables</div>
            </td>
            <td style="text-align: right;">
                <div class="meta">
                    Period: {{ $from->format('d M Y') }} — {{ $to->format('d M Y') }}<br>
                    Generated: {{ now()->format('d M Y') }}
                </div>
            </td>
        </tr>
    </table>

    @php $t = $data['totals']; @endphp

    <table class="items" style="width: 70%; margin-bottom: 12px;">
        <thead>
            <tr>
                <th class="num">Due from Customers</th>
                <th class="num">Owed to Suppliers</th>
                <th class="num">Net Position</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="num">{{ number_format($t['total_receivable'], 2) }}</td>
                <td class="num">{{ number_format($t['total_payable'], 2) }}</td>
                <td class="num"><strong>{{ number_format($t['net'], 2) }}</strong></td>
            </tr>
        </tbody>
    </table>

    <h2>Receivables — Due from Customers</h2>
    <table class="items">
        <thead>
            <tr>
                <th>Customer</th><th>City</th>
                <th class="num">Balance</th><th class="num">Current</th><th class="num">31–60</th>
                <th class="num">61–90</th><th class="num">90+</th><th class="num">Received (period)</th>
            </tr>
        </thead>
        <tbody>
            @forelse($data['receivables'] as $c)
                <tr>
                    <td>{{ $c['name'] }}@if($c['balance'] == 0) <em>(settled)</em>@endif</td>
                    <td>{{ $c['city'] ?? '—' }}</td>
                    <td class="num">{{ number_format($c['balance'], 2) }}</td>
                    <td class="num">{{ $c['aging'] ? number_format($c['aging']['current'], 2) : '—' }}</td>
                    <td class="num">{{ $c['aging'] ? number_format($c['aging']['31_60'], 2) : '—' }}</td>
                    <td class="num">{{ $c['aging'] ? number_format($c['aging']['61_90'], 2) : '—' }}</td>
                    <td class="num">{{ $c['aging'] ? number_format($c['aging']['over_90'], 2) : '—' }}</td>
                    <td class="num">{{ $c['paid'] ? number_format($c['paid'], 2) : '—' }}</td>
                </tr>
            @empty
                <tr><td colspan="8">No outstanding receivables.</td></tr>
            @endforelse
        </tbody>
        <tfoot>
            <tr>
                <td colspan="2"><strong>Total</strong></td>
                <td class="num"><strong>{{ number_format($t['total_receivable'], 2) }}</strong></td>
                <td class="num" colspan="4"></td>
                <td class="num"><strong>{{ number_format($t['received'], 2) }}</strong></td>
            </tr>
        </tfoot>
    </table>

    <h2 style="margin-top: 14px;">Payables — Owed to Suppliers</h2>
    <table class="items">
        <thead>
            <tr>
                <th>Supplier</th><th>City</th>
                <th class="num">Balance</th><th class="num">Current</th><th class="num">31–60</th>
                <th class="num">61–90</th><th class="num">90+</th><th class="num">Paid (period)</th>
            </tr>
        </thead>
        <tbody>
            @forelse($data['payables'] as $s)
                <tr>
                    <td>{{ $s['name'] }}@if($s['balance'] == 0) <em>(settled)</em>@endif</td>
                    <td>{{ $s['city'] ?? '—' }}</td>
                    <td class="num">{{ number_format($s['balance'], 2) }}</td>
                    <td class="num">{{ $s['aging'] ? number_format($s['aging']['current'], 2) : '—' }}</td>
                    <td class="num">{{ $s['aging'] ? number_format($s['aging']['31_60'], 2) : '—' }}</td>
                    <td class="num">{{ $s['aging'] ? number_format($s['aging']['61_90'], 2) : '—' }}</td>
                    <td class="num">{{ $s['aging'] ? number_format($s['aging']['over_90'], 2) : '—' }}</td>
                    <td class="num">{{ $s['paid'] ? number_format($s['paid'], 2) : '—' }}</td>
                </tr>
            @empty
                <tr><td colspan="8">Nothing owed to suppliers.</td></tr>
            @endforelse
        </tbody>
        <tfoot>
            <tr>
                <td colspan="2"><strong>Total</strong></td>
                <td class="num"><strong>{{ number_format($t['total_payable'], 2) }}</strong></td>
                <td class="num" colspan="4"></td>
                <td class="num"><strong>{{ number_format($t['paid'], 2) }}</strong></td>
            </tr>
        </tfoot>
    </table>

    <h2 style="margin-top: 14px;">Payments Log</h2>
    <table class="items">
        <thead>
            <tr>
                <th>Date</th><th>Ref #</th><th>Type</th><th>Party</th><th>Method</th><th class="num">Amount</th>
            </tr>
        </thead>
        <tbody>
            @forelse($data['payments'] as $p)
                <tr>
                    <td>{{ \Illuminate\Support\Carbon::parse($p['date'])->format('d M Y') }}</td>
                    <td>{{ $p['number'] }}</td>
                    <td>{{ $p['direction'] === 'in' ? 'Receipt' : 'Payment' }}</td>
                    <td>{{ $p['party_name'] ?? '—' }}</td>
                    <td>{{ ucfirst($p['method']) }}</td>
                    <td class="num">{{ ($p['direction'] === 'in' ? '+' : '−') }} {{ number_format($p['amount'], 2) }}</td>
                </tr>
            @empty
                <tr><td colspan="6">No payments recorded in this period.</td></tr>
            @endforelse
        </tbody>
    </table>

    @include('pdf.partials.footer')
</body>
</html>
