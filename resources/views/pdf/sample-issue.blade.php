<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $issue->issue_number }}</title>
    @include('pdf.partials.style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <div class="meta">Sample Issue (Free of Cost)</div>
            </td>
            <td style="text-align: right;">
                <h1>{{ $issue->issue_number }}</h1>
                <div class="meta">
                    Date: {{ $issue->issue_date->format('d M Y') }}<br>
                    Status: <span class="badge">{{ strtoupper($issue->status) }}</span>
                </div>
            </td>
        </tr>
    </table>

    <table style="width:100%; margin-bottom: 8px;">
        <tr>
            <td>
                <h2>Customer</h2>
                <strong>{{ $issue->customer->name }}</strong><br>
                <span class="meta">
                    {{ $issue->customer->address }}<br>
                    @if($issue->customer->phone) Phone: {{ $issue->customer->phone }}<br> @endif
                    @if($issue->recipient_name) Recipient / Doctor: {{ $issue->recipient_name }}<br> @endif
                    @if($issue->representative_name) Representative: {{ $issue->representative_name }} @endif
                </span>
            </td>
            <td style="text-align:right;" class="meta">
                Warehouse: {{ $issue->warehouse->name }}
            </td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                <th>#</th><th>Product</th><th class="num">Qty</th><th>Remarks</th>
            </tr>
        </thead>
        <tbody>
            @foreach($issue->items as $i => $item)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td>{{ $item->product->name }}</td>
                    <td class="num">{{ number_format((float) $item->quantity, 0) }}</td>
                    <td>{{ $item->remarks }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="totals">
        <tr class="grand"><td>Total Qty</td><td class="num">{{ number_format((float) $issue->total_quantity, 0) }}</td></tr>
        <tr><td class="muted">Charge to Customer</td><td class="num muted">Rs 0.00 (free sample)</td></tr>
    </table>

    @if($issue->notes)
        <p style="margin-top: 10px;" class="meta">Notes: {{ $issue->notes }}</p>
    @endif

    @include('pdf.partials.footer')
</body>
</html>
