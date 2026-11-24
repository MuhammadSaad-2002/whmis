<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $invoice->invoice_number }} — Net Position</title>
    @include('pdf.partials.document-style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <h2 class="document-title">Sale — Net / Final Position</h2>
            </td>
            <td style="text-align: right;">
                <h1>{{ $invoice->invoice_number }}</h1>
                <div class="meta">Sale Date: {{ $invoice->invoice_date->format('d M Y') }}</div>
            </td>
        </tr>
    </table>

    <table class="document-info">
        <tr>
            <td>
                <h2>Bill To</h2>
                <strong>{{ $invoice->customer->name }}</strong><br>
                <span class="meta">{{ $invoice->customer->address }} {{ $invoice->customer->city }}</span>
            </td>
            <td style="text-align:right;" class="meta">
                Type: {{ ucwords(str_replace('_', ' ', $invoice->sale_type)) }}<br>
                Warehouse: {{ $invoice->warehouse->name }}
            </td>
        </tr>
    </table>

    <h2>Return History</h2>
    <table class="items">
        <thead>
            <tr>
                <th>Return #</th><th>Date</th><th>Status</th>
                <th class="num">Qty</th><th class="num">Discount</th><th class="num">Tax</th><th class="num">Credit</th>
            </tr>
        </thead>
        <tbody>
            @forelse($position['returns'] as $return)
                <tr>
                    <td>{{ $return['return_number'] }}</td>
                    <td>{{ \Illuminate\Support\Carbon::parse($return['date'])->format('d M Y') }}</td>
                    <td>{{ ucfirst($return['status']) }}</td>
                    <td class="num">{{ number_format($return['qty'], 2) }}</td>
                    <td class="num">{{ number_format($return['discount'], 2) }}</td>
                    <td class="num">{{ number_format($return['tax'], 2) }}</td>
                    <td class="num">{{ number_format($return['amount'], 2) }}</td>
                </tr>
            @empty
                <tr><td colspan="7" class="muted" style="text-align:center;">No returns against this invoice.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2 class="document-section">Net / Final Position</h2>
    <table class="items">
        <thead>
            <tr>
                <th></th><th class="num">Original</th><th class="num">Returned</th><th class="num">Net</th>
            </tr>
        </thead>
        <tbody>
            @php
                $lines = [
                    'Amount' => 'amount', 'Stock Qty (Incl. Bonus)' => 'qty', 'Discount' => 'discount',
                    'Tax (GST)' => 'tax', 'Receivable' => 'receivable',
                ];
            @endphp
            @foreach($lines as $label => $key)
                <tr>
                    <td><strong>{{ $label }}</strong></td>
                    <td class="num">{{ number_format($position['original'][$key], 2) }}</td>
                    <td class="num">{{ $position['returned'][$key] ? '- '.number_format($position['returned'][$key], 2) : '—' }}</td>
                    <td class="num"><strong>{{ number_format($position['net'][$key], 2) }}</strong></td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="totals">
        <tr><td>Net Receivable</td><td class="num">{{ \App\Support\MoneyDisplay::roundedTotal($position['net']['receivable']) }}</td></tr>
        <tr><td>Amount Received
            @if(fmod($position['actual_received'], 1) !== 0.0)
                <span class="meta">(actual: Rs {{ number_format($position['actual_received'], 2) }})</span>
            @endif
        </td><td class="num">-{{ \App\Support\MoneyDisplay::roundedTotal($position['actual_received']) }}</td></tr>
        @if($position['noncash_settlement'] > 0)
            <tr><td>Non-cash Settlement</td><td class="num">-{{ \App\Support\MoneyDisplay::total($position['noncash_settlement']) }}</td></tr>
        @endif
        @if($position['applied_credit'] > 0)
            <tr><td>Applied Customer Credit</td><td class="num">-{{ \App\Support\MoneyDisplay::total($position['applied_credit']) }}</td></tr>
        @endif
        @if($position['refund_due'] > 0)
            <tr class="grand"><td>Refund Due (Rs)</td><td class="num">{{ \App\Support\MoneyDisplay::roundedTotal($position['refund_due']) }}</td></tr>
        @else
            <tr class="grand"><td>Final Outstanding (Rs)</td><td class="num">{{ \App\Support\MoneyDisplay::roundedTotal($position['final_outstanding']) }}</td></tr>
        @endif
    </table>

    <p class="meta document-note">
        This statement reflects the invoice net of valid (non-cancelled) returns as of {{ now()->format('d M Y') }}.
        The original Sales Invoice remains the primary record.
        Summary amounts are rounded to whole rupees.
    </p>

</body>
</html>
