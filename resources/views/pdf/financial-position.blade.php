<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Financial Position</title>
    @include('pdf.partials.style')
    <style>
        @page { margin: 18px 0 2.2cm 0; }
        body { padding-top: 0; }
        .page-footer { width: 95.7% !important; }
        .page-footer .pageno:before { content: counter(page); }
        .summary, .figures, .figure-labels { width: 100%; table-layout: fixed; border-collapse: collapse; }
        .summary td { border: 1px solid #d3e0e8; padding: 7px 10px; background: #f4f8fa; }
        .summary strong { font-size: 15px; }
        .figures { margin-top: 8px; page-break-inside: avoid; }
        .figures > tbody > tr > td { vertical-align: top; width: 50%; }
        .figure-left { padding-right: 4px; }
        .figure-right { padding-left: 4px; }
        .figure { padding: 8px; border: 1px solid #d3e0e8; border-radius: 5px; }
        .figure h2 { margin-bottom: 3px; font-size: 14px; }
        .figure .meta { font-size: 11px; color: #3e5367; }
        .figure img { display: block; width: 100%; height: auto; margin: 4px 0 2px; }
        .figure img.mix-image { margin: 8px 0 4px; }
        .figure-labels td { text-align: center; vertical-align: top; font-size: 11px; color: #263b4d; }
        .dot { display: inline-block; width: 6px; height: 6px; }
        .details { page-break-before: always; }
        .details h2 { page-break-after: avoid; }
        .details thead { display: table-header-group; }
        .details table.items th.num { text-align: right; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <div class="meta">Financial Position — Charts &amp; Summary</div>
            </td>
            <td style="text-align: right;">
                <div class="meta">
                    Balances as of: {{ $asOf->format('d M Y') }}<br>
                    Activity period: {{ $from->format('d M Y') }} — {{ $to->format('d M Y') }}
                </div>
            </td>
        </tr>
    </table>

    @php $t = $data['totals']; @endphp
    <table class="summary" role="presentation">
        <tr>
            <td><span class="meta">Due from Customers</span><br><strong>Rs {{ number_format($t['total_receivable'], 2) }}</strong></td>
            <td><span class="meta">Owed to Suppliers</span><br><strong>Rs {{ number_format($t['total_payable'], 2) }}</strong></td>
            <td><span class="meta">Net Position</span><br><strong>Rs {{ number_format($t['net'], 2) }}</strong></td>
        </tr>
    </table>

    <table class="figures" role="presentation"><tbody><tr>
        <td class="figure-left">
            <div class="figure">
                <h2>Position Bridge</h2>
                <div class="meta">How trade and employee balances build the net position (Rs)</div>
                <img src="{{ $charts['bridge'] }}" alt="Position Bridge waterfall chart">
                <table class="figure-labels" role="presentation"><tr>
                    @foreach($charts['bridgeLabels'] as $label)
                        <td>{{ $label['label'] }}<br><strong>{{ number_format($label['amount'], 2) }}</strong></td>
                    @endforeach
                </tr></table>
            </div>
        </td>
        <td class="figure-right">
            <div class="figure">
                <h2>Aging: Receivables vs Payables</h2>
                <div class="meta">
                    <span class="dot" style="background: #0c9484;"></span> Receivable
                    &nbsp;&nbsp;<span class="dot" style="background: #c84a51;"></span> Payable
                    &nbsp;·&nbsp; Age in days
                </div>
                <img src="{{ $charts['aging'] }}" alt="Receivables and payables by age">
                <table class="figure-labels" role="presentation"><tr>
                    @foreach($charts['agingLabels'] as $label)
                        <td>{{ $label }}</td>
                    @endforeach
                </tr></table>
            </div>
        </td>
    </tr></tbody></table>

    <table class="figures" role="presentation"><tbody><tr>
        <td class="figure-left">
            @include('pdf.partials.financial-aging-mix', ['title' => 'Receivables Aging Mix', 'mix' => $charts['receivables']])
        </td>
        <td class="figure-right">
            @include('pdf.partials.financial-aging-mix', ['title' => 'Payables Aging Mix', 'mix' => $charts['payables']])
        </td>
    </tr></tbody></table>

    <div class="meta" style="margin-top: 10px;">
        Employee salary payable: {{ number_format($t['employee_payable'], 2) }} · Employee advances: {{ number_format($t['employee_advances'], 2) }}<br>
        Period payroll expense: {{ number_format($t['payroll_expense'], 2) }} · Employee cash out: {{ number_format($t['employee_cash_out'], 2) }} · Combined net cash flow: {{ number_format($t['net_cash_flow'], 2) }}
    </div>

    <div class="details">
    <table class="header" role="presentation">
        <tr>
            <td><h1>Financial Position — Detailed Tables</h1></td>
            <td class="meta" style="text-align: right;">
                Activity period: {{ $from->format('d M Y') }} — {{ $to->format('d M Y') }}
            </td>
        </tr>
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
    </div>

    @include('pdf.partials.footer')
</body>
</html>
