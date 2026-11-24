<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Daily Delivery Sheet</title>
    @include('pdf.partials.document-style')
    <style>
        table.items { table-layout: fixed; }
        table.items .write-in { height: 22pt; }
        table.items .stop-number { padding-right: 2pt; padding-left: 2pt; }
        .signatures { page-break-inside: avoid; margin-top: 12pt; width: 100%; }
        .signatures td { width: 50%; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <h2 class="document-title">Daily Delivery Sheet</h2>
                <div class="meta">{{ $staff->name }}</div>
            </td>
            <td class="meta" style="text-align: right;">
                {{ $date->format('l, d M Y') }}<br>
                {{ $stops->count() }} stop(s) · {{ $invoiceCount }} invoice(s)<br>
                Amounts in PKR
            </td>
        </tr>
    </table>
    <table class="items">
        <thead><tr>
            <th style="width: 4%;">#</th>
            <th style="width: 13%;">Sales Inv #</th>
            <th style="width: 17%;">Customer Name</th>
            <th style="width: 25%;">Customer Address</th>
            <th class="num" style="width: 11%;">Total Amount</th>
            <th style="width: 17%;">Receiver / Remarks</th>
            <th class="num" style="width: 13%;">Payment Received</th>
        </tr></thead>
        <tbody>
            @forelse($stops as $stop)
                @php
                    $customer = $stop->first()->invoice->customer;
                    $stopNumber = $loop->iteration;
                    $address = trim((string) $customer?->address);
                    $city = trim((string) $customer?->city);
                    $cityInAddress = $city !== '' && preg_match('/\b'.preg_quote($city, '/').'\b/iu', $address);
                    $place = implode(' · ', array_filter([$address, $cityInAddress ? '' : $city]));
                @endphp
                @foreach($stop as $delivery)
                @php
                    $receiver = $delivery->events->last()?->receiver_name;
                    $received = (int) $verifiedPayments->get($delivery->sales_invoice_id, 0);
                @endphp
                <tr>
                    <td class="stop-number">{{ $loop->first ? $stopNumber : '' }}</td>
                    <td><strong>{{ $delivery->invoice->invoice_number }}</strong></td>
                    <td><strong>{{ $customer?->name ?? 'Customer #'.$delivery->invoice->customer_id }}</strong></td>
                    <td>{{ $place ?: '—' }}</td>
                    <td class="num">{{ number_format($delivery->invoice->total_amount, 2) }}</td>
                    <td class="write-in">{{ $receiver }}</td>
                    <td class="num write-in">
                        @if($received > 0)
                            {{ number_format($received / 100, 2) }}
                            <div class="meta">Verified</div>
                        @endif
                    </td>
                </tr>
                @endforeach
            @empty
                <tr><td colspan="7">No invoices planned for this staff member on this date.</td></tr>
            @endforelse
        </tbody>
    </table>
    <table class="signatures"><tr><td>Prepared by: ____________________</td><td>Salesman signature: ____________________</td></tr></table>
</body>
</html>
