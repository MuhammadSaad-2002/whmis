<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $invoice->invoice_number }} — Net Position</title>
    @include('pdf.partials.style')
</head>
<body>
    @php
        $statusLabel = [
            'posted_no_returns' => 'Posted — No Returns',
            'partially_returned' => 'Partially Returned',
            'fully_returned' => 'Fully Returned',
        ][$position['status']] ?? 'Posted';
    @endphp

    <table class="header">
        <tr>
            <td>
                <h1>MP Sub Office</h1>
                <div class="meta">Sale — Net / Final Position</div>
            </td>
            <td style="text-align: right;">
                <h1>{{ $invoice->invoice_number }}</h1>
                <div class="meta">
                    Sale Date: {{ $invoice->invoice_date->format('d M Y') }}<br>
                    Status: <span class="badge">{{ $statusLabel }}</span>
                </div>
            </td>
        </tr>
    </table>

    <table style="width:100%; margin-bottom: 8px;">
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

    <h2 style="margin-top: 14px;">Net / Final Position</h2>
    <table class="items">
        <thead>
            <tr>
                <th></th><th class="num">Original</th><th class="num">Returned</th><th class="num">Net</th>
            </tr>
        </thead>
        <tbody>
            @php
                $lines = [
                    'Amount' => 'amount', 'Quantity' => 'qty', 'Discount' => 'discount',
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
        <tr><td>Net Receivable</td><td class="num">{{ number_format($position['net']['receivable'], 2) }}</td></tr>
        <tr><td>Amount Received</td><td class="num">-{{ number_format($position['payments'], 2) }}</td></tr>
        @if($position['refund_due'] > 0)
            <tr class="grand"><td>Refund Due (Rs)</td><td class="num">{{ number_format($position['refund_due'], 2) }}</td></tr>
        @else
            <tr class="grand"><td>Final Outstanding (Rs)</td><td class="num">{{ number_format($position['final_outstanding'], 2) }}</td></tr>
        @endif
    </table>

    <p class="meta" style="margin-top: 14px;">
        This statement reflects the invoice net of valid (non-cancelled) returns as of {{ now()->format('d M Y') }}.
        The original Sales Invoice remains the primary record.
    </p>

    @include('pdf.partials.footer')
</body>
</html>
