<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $invoice->invoice_number }}</title>
    @include('pdf.partials.document-style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <h2 class="document-title">Sales Invoice</h2>
                <div class="meta">
                    @if($invoice->booking)
                        Booking #: {{ $invoice->booking->booking_number }}
                        <br>Booking Date: {{ $invoice->booking->booking_date->format('d M Y') }}
                        @if($invoice->booking->booker)<br>Booked by: {{ $invoice->booking->booker->name }}@endif
                    @endif
                </div>
            </td>
            <td style="text-align: right;">
                <h1>{{ $invoice->invoice_number }}</h1>
                <div class="meta">
                    Sale #: {{ $invoice->invoice_number }}<br>
                    Sale Date: {{ $invoice->invoice_date->format('d M Y') }}
                    @if($invoice->due_date) <br>Due: {{ $invoice->due_date->format('d M Y') }} @endif
                </div>
            </td>
        </tr>
    </table>

    <table class="document-info">
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
                    <td>
                        <strong>{{ $item->product->name }}</strong>
                        @if($item->product->company)<br><span class="meta">{{ $item->product->company->name }}</span>@endif
                        @if($item->relationLoaded('incentives') && $item->incentives->isNotEmpty())
                            <br><span class="meta">Incentives:
                            {{ $item->incentives->map(fn ($inc) => $inc->rule_name . ((float) $inc->value_given > 0 ? ' (Rs ' . number_format((float) $inc->value_given, 2) . ')' : ''))->implode(', ') }}
                            </span>
                        @endif
                    </td>
                    <td>{{ $item->batch?->batch_number ?? 'FIFO' }}</td>
                    <td class="num">{{ number_format((float) $item->quantity, 0) }}</td>
                    <td class="num">{{ number_format((float) $item->bonus_quantity, 0) }}</td>
                    <td class="num">{{ number_format((float) $item->trade_price, 2) }}</td>
                    @php
                        $lineGross = (float) $item->quantity * (float) $item->trade_price;
                        $discPct = $lineGross > 0 ? round((float) $item->discount_amount / $lineGross * 100, 2) : 0;
                    @endphp
                    <td class="num">{{ number_format((float) $item->discount_amount, 2) }}@if((float) $item->discount_amount > 0) ({{ rtrim(rtrim(number_format($discPct, 2, '.', ''), '0'), '.') }}%)@endif</td>
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
        <div class="document-callout">
            <strong>Sale Base Terms:</strong> {{ $invoice->sale_terms }}
        </div>
    @endif

    @if($invoice->notes)
        <p class="meta document-note">Notes: {{ $invoice->notes }}</p>
    @endif

</body>
</html>
