<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $booking->booking_number }}</title>
    @include('pdf.partials.document-style')
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <h2 class="document-title">Booking Order</h2>
                <span class="meta">Not a sales invoice</span>
            </td>
            <td style="text-align:right;">
                <h1>{{ $booking->booking_number }}</h1>
                <div class="meta">Booking Date: {{ $booking->booking_date->format('d M Y') }}<br>
                    Status: {{ ucfirst(str_replace('_', ' ', $booking->status)) }}
                </div>
            </td>
        </tr>
    </table>
    <table class="document-info">
        <tr>
            <td>
                <h2>Customer</h2>
                <strong>{{ $booking->customer?->name }}</strong><br>
                <span class="meta">{{ $booking->customer?->address }} {{ $booking->customer?->city }}</span>
            </td>
            <td class="meta" style="text-align:right;">
                @if($booking->booker) Booked by: {{ $booking->booker->name }}<br>@endif
                Warehouse: {{ $booking->warehouse?->name }}
            </td>
        </tr>
    </table>
    @include('pdf.partials.sale-booking-lines', ['document' => $booking, 'isSale' => false])
    @include('pdf.partials.sale-booking-totals', ['document' => $booking, 'isSale' => false])
    @if($booking->notes)
        <p class="meta document-note">Notes: {{ $booking->notes }}</p>
    @endif
</body>
</html>
