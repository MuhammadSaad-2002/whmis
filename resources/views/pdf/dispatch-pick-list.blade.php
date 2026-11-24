<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Dispatch Picking List</title>
    @include('pdf.partials.document-style')
    <style>
        table.items { margin-bottom: 12pt; }
    </style>
</head>
<body>
    <table class="header"><tr><td>
        @include('pdf.partials.header')
        <h2 class="document-title">Dispatch Picking List</h2>
        <div class="meta">Quantities include bonus units</div>
    </td></tr></table>
    @if($truncated)<p>Showing the first 30 invoices. Narrow the date or assignee filter for a smaller pick list.</p>@endif
    @forelse($orders as $order)
        @php($invoice = $order['invoice'])
        <table class="items">
            <thead>
                <tr><th colspan="4">{{ $invoice->invoice_number }} · {{ $invoice->customer?->name ?? 'Customer' }}{{ $invoice->planned_date ? ' · Planned '.$invoice->planned_date : '' }}</th></tr>
                <tr><th>Product</th><th>Batch</th><th>Expiry</th><th class="num">To pick</th></tr>
            </thead>
            <tbody>
                @forelse($order['lines'] as $line)
                    <tr>
                        <td>{{ $line['product'] }}</td><td>{{ $line['batch'] ?: '—' }}</td><td>{{ $line['expiry'] ?: '—' }}</td>
                        <td class="num">{{ rtrim(rtrim(number_format($line['quantity'], 2), '0'), '.') }}</td>
                    </tr>
                @empty
                    <tr><td colspan="4">No units remaining to pick.</td></tr>
                @endforelse
            </tbody>
        </table>
    @empty
        <p>No invoices are waiting for pickup in this selection.</p>
    @endforelse
</body>
</html>
