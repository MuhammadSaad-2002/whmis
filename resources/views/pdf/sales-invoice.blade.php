<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $invoice->invoice_number }}</title>
    @include('pdf.partials.style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <h1>{{ config('app.name') }}</h1>
                <div class="meta">Sales Invoice</div>
            </td>
            <td style="text-align: right;">
                <h1>{{ $invoice->invoice_number }}</h1>
                <div class="meta">
                    Date: {{ $invoice->invoice_date->format('d M Y') }}<br>
                    @if($invoice->due_date) Due: {{ $invoice->due_date->format('d M Y') }}<br> @endif
                    Status: <span class="badge">{{ strtoupper($invoice->status) }}</span>
                </div>
            </td>
        </tr>
    </table>

    <table style="width:100%; margin-bottom: 8px;">
        <tr>
            <td>
                <h2>Bill To</h2>
                <strong>{{ $invoice->customer->name }}</strong><br>
                <span class="meta">
                    {{ $invoice->customer->address }} {{ $invoice->customer->city }}<br>
                    @if($invoice->customer->phone) Phone: {{ $invoice->customer->phone }}<br> @endif
                    @if($invoice->customer->drug_license_no) Drug License: {{ $invoice->customer->drug_license_no }} @endif
                </span>
            </td>
            <td style="text-align:right;" class="meta">
                Type: {{ ucwords(str_replace('_', ' ', $invoice->sale_type)) }}<br>
                Warehouse: {{ $invoice->warehouse->name }}
            </td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                <th>#</th><th>Product</th><th>Batch</th>
                <th class="num">Qty</th><th class="num">Bonus</th><th class="num">Price</th>
                <th class="num">Disc</th><th class="num">GST</th><th class="num">Net</th>
            </tr>
        </thead>
        <tbody>
            @foreach($invoice->items as $i => $item)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td>{{ $item->product->name }}</td>
                    <td>{{ $item->batch?->batch_number ?? 'FIFO' }}</td>
                    <td class="num">{{ number_format((float) $item->quantity, 0) }}</td>
                    <td class="num">{{ number_format((float) $item->bonus_quantity, 0) }}</td>
                    <td class="num">{{ number_format((float) $item->trade_price, 2) }}</td>
                    <td class="num">{{ number_format((float) $item->discount_amount, 2) }}</td>
                    <td class="num">{{ number_format((float) $item->gst_amount, 2) }}</td>
                    <td class="num">{{ number_format((float) $item->net_amount, 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="totals">
        <tr><td>Subtotal</td><td class="num">{{ number_format((float) $invoice->subtotal, 2) }}</td></tr>
        <tr><td>Item Discounts</td><td class="num">-{{ number_format((float) $invoice->item_discount_total, 2) }}</td></tr>
        <tr><td>Item GST</td><td class="num">+{{ number_format((float) $invoice->item_gst_total, 2) }}</td></tr>
        @if((float) $invoice->discount_amount > 0)
            <tr><td>Invoice Discount</td><td class="num">-{{ number_format((float) $invoice->discount_amount, 2) }}</td></tr>
        @endif
        @if((float) $invoice->gst_amount > 0)
            <tr><td>Invoice GST</td><td class="num">+{{ number_format((float) $invoice->gst_amount, 2) }}</td></tr>
        @endif
        <tr class="grand"><td>Total (Rs)</td><td class="num">{{ number_format((float) $invoice->total_amount, 2) }}</td></tr>
    </table>

    @if($invoice->sale_terms)
        <div style="margin-top: 10px; padding: 6px 8px; border: 1px solid #999;">
            <strong>Sale Base Terms:</strong> {{ $invoice->sale_terms }}
        </div>
    @endif

    @if($invoice->notes)
        <p style="margin-top: 10px;" class="meta">Notes: {{ $invoice->notes }}</p>
    @endif

    <div class="footer">
        Generated {{ now()->format('d M Y H:i') }} · {{ config('app.name') }}
    </div>
</body>
</html>
