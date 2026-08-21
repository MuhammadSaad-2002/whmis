<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $receipt->receipt_number }}</title>
    @include('pdf.partials.style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <h1>MP Sub Office</h1>
                <div class="meta">Sample Receipt (Free of Cost)</div>
            </td>
            <td style="text-align: right;">
                <h1>{{ $receipt->receipt_number }}</h1>
                <div class="meta">
                    Date: {{ $receipt->receipt_date->format('d M Y') }}<br>
                    Status: <span class="badge">{{ strtoupper($receipt->status) }}</span>
                </div>
            </td>
        </tr>
    </table>

    <table style="width:100%; margin-bottom: 8px;">
        <tr>
            <td>
                <h2>Supplier</h2>
                <strong>{{ $receipt->company->name }}</strong><br>
                <span class="meta">
                    {{ $receipt->company->address }}<br>
                    @if($receipt->company->phone) Phone: {{ $receipt->company->phone }}<br> @endif
                    @if($receipt->company->ntn_number) NTN: {{ $receipt->company->ntn_number }} @endif
                </span>
            </td>
            <td style="text-align:right;" class="meta">
                Warehouse: {{ $receipt->warehouse->name }}
            </td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                <th>#</th><th>Product</th><th>Batch</th><th>Expiry</th>
                <th class="num">Sample Qty</th><th>Remarks</th>
            </tr>
        </thead>
        <tbody>
            @foreach($receipt->items as $i => $item)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td>{{ $item->product->name }}</td>
                    <td>{{ $item->batch_number }}</td>
                    <td>{{ $item->expiry_date?->format('m/Y') }}</td>
                    <td class="num">{{ number_format((float) $item->quantity, 0) }}</td>
                    <td>{{ $item->remarks }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="totals">
        <tr class="grand"><td>Total Sample Qty</td><td class="num">{{ number_format((float) $receipt->total_quantity, 0) }}</td></tr>
        <tr><td class="muted">Value</td><td class="num muted">Rs 0.00 (free of cost)</td></tr>
    </table>

    @if($receipt->notes)
        <p style="margin-top: 10px;" class="meta">Notes: {{ $receipt->notes }}</p>
    @endif

    @include('pdf.partials.footer')
</body>
</html>
