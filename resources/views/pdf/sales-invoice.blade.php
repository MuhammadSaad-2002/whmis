<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $invoice->invoice_number }}</title>
    @include('pdf.partials.document-style')
    <style>
        table.items td.item-rate { white-space: nowrap; }
    </style>
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

    @include('pdf.partials.sale-booking-lines', ['document' => $invoice, 'isSale' => true])
    @include('pdf.partials.sale-booking-totals', ['document' => $invoice, 'isSale' => true])

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
