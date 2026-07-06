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
                <div class="meta">Purchase Invoice</div>
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
                <h2>Supplier</h2>
                <strong>{{ $invoice->company->name }}</strong><br>
                <span class="meta">
                    {{ $invoice->company->address }}<br>
                    @if($invoice->company->phone) Phone: {{ $invoice->company->phone }}<br> @endif
                    @if($invoice->company->ntn_number) NTN: {{ $invoice->company->ntn_number }} @endif
                </span>
            </td>
            <td style="text-align:right;" class="meta">
                @if($invoice->supplier_invoice_number) Supplier Inv #: {{ $invoice->supplier_invoice_number }}<br> @endif
                Type: {{ ucfirst($invoice->purchase_type) }}<br>
                Warehouse: {{ $invoice->warehouse->name }}
            </td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                <th>#</th><th>Product</th><th>Batch</th><th>Expiry</th>
                <th class="num">Qty</th><th class="num">Bonus</th><th class="num">Rate</th>
                <th class="num">Disc</th><th class="num">GST</th><th class="num">Net</th><th class="num">Margin</th>
            </tr>
        </thead>
        <tbody>
            @foreach($invoice->items as $i => $item)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td>{{ $item->product->name }}</td>
                    <td>{{ $item->batch_number }}</td>
                    <td>{{ $item->expiry_date?->format('m/Y') }}</td>
                    <td class="num">{{ number_format((float) $item->quantity, 0) }}</td>
                    <td class="num">{{ number_format((float) $item->bonus_quantity, 0) }}</td>
                    <td class="num">{{ number_format((float) $item->purchase_rate, 2) }}</td>
                    <td class="num">{{ number_format((float) $item->discount_amount, 2) }}</td>
                    <td class="num">{{ number_format((float) $item->gst_amount, 2) }}</td>
                    <td class="num">{{ number_format((float) $item->net_amount, 2) }}</td>
                    <td class="num">{{ number_format((float) $item->margin, 2) }}</td>
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
        <tr><td class="muted">Expected Margin</td><td class="num muted">{{ number_format((float) $invoice->total_margin, 2) }} ({{ number_format((float) $invoice->margin_percent, 1) }}%)</td></tr>
    </table>

    @if($invoice->notes)
        <p style="margin-top: 10px;" class="meta">Notes: {{ $invoice->notes }}</p>
    @endif

    <div class="footer">
        Generated {{ now()->format('d M Y H:i') }} · {{ config('app.name') }}
    </div>
</body>
</html>
