<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Daily Delivery Sheet</title>
    @include('pdf.partials.style')
    <style>
        @page { margin: 16px 20px 48px; }
        body { padding: 0; font-size: 9px; }
        .header { margin-bottom: 8px; padding-bottom: 6px; }
        table.items th, table.items td { padding: 3px 5px; vertical-align: top; }
        table.items td { line-height: 1.25; }
        .address { font-size: 8px; color: #496175; }
        .status { color: #496175; font-size: 8px; }
        .row-number { width: 24px; }
        .signatures { page-break-inside: avoid; margin-top: 16px; width: 100%; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                @include('pdf.partials.header')
                <div class="meta"><strong>Daily Delivery Sheet</strong> · {{ $staff->name }}</div>
            </td>
            <td class="meta" style="text-align: right;">
                {{ $date->format('l, d M Y') }}<br>
                {{ $stops->count() }} stop(s) · {{ $invoiceCount }} invoice(s)
            </td>
        </tr>
    </table>
    <table class="items">
        <thead><tr><th class="row-number">#</th><th>Customer / delivery address</th><th>Invoice / status</th><th style="width: 23%;">Receiver / remarks</th></tr></thead>
        <tbody>
            @forelse($stops as $stop)
                @php
                    $customer = $stop->first()->invoice->customer;
                    $stopNumber = $loop->iteration;
                    $place = collect([$customer?->address, $customer?->city])->filter()->implode(' · ');
                    $contact = collect([$customer?->contact_person, $customer?->phone])->filter()->implode(' · ');
                @endphp
                @foreach($stop->chunk(12) as $deliveries)
                <tr>
                    <td>{{ $stopNumber }}</td>
                    <td>
                        <strong>{{ $customer?->name ?? 'Customer #'.$stop->first()->invoice->customer_id }}</strong>
                        @if($loop->first)
                            <div class="address">{{ collect([$place, $contact])->filter()->implode(' · ') }}</div>
                        @else
                            <div class="address">Continued</div>
                        @endif
                    </td>
                    <td>
                        @foreach($deliveries as $delivery)
                            <div>{{ $delivery->invoice->invoice_number }} <span class="status">· {{ ucfirst($delivery->status) }}</span></div>
                        @endforeach
                    </td>
                    <td></td>
                </tr>
                @endforeach
            @empty
                <tr><td colspan="4">No invoices planned for this staff member on this date.</td></tr>
            @endforelse
        </tbody>
    </table>
    <table class="signatures"><tr><td>Prepared by: ____________________</td><td>Salesman signature: ____________________</td></tr></table>
</body>
</html>
