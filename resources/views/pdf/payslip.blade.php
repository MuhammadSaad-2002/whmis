<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Salary Payslip — {{ $item->payroll->number }}</title>
    @include('pdf.partials.document-style')
</head>
<body>
    <table class="header"><tr>
        <td>
            @include('pdf.partials.header')
            <h2 class="document-title">Salary Payslip</h2>
        </td>
        <td style="text-align: right;">
            <h1>{{ $item->payroll->number }}</h1>
            <div class="meta">{{ $item->payroll->period->format('F Y') }}<br>
                Status: <span class="badge">{{ strtoupper($item->payroll->status) }}</span>
            </div>
        </td>
    </tr></table>

    @php $s = $item->snapshot; @endphp
    <table class="document-info"><tr>
        <td>
            <h2>Employee</h2>
            <strong>{{ $s['employee_name'] }}</strong><br>
            <span class="meta">{{ $s['employee_number'] }}</span>
        </td>
        <td class="meta" style="text-align: right;">
            Calendar days: {{ $s['calendar_days'] }}<br>
            Employed days: {{ $s['eligible_days'] }}<br>
            Unpaid days: {{ $s['unpaid_days'] }}
        </td>
    </tr></table>

    <table class="items">
        <thead><tr><th>Description</th><th class="num">PKR</th></tr></thead>
        <tbody>
            @foreach(['Monthly basic' => $s['basic'], 'Monthly allowances' => $s['allowances'], 'Unpaid-day deduction (included in proration)' => $s['unpaid_deduction'], 'Salary after proration and absence' => $item->base, 'Overtime' => $item->overtime, 'Bonus' => $item->bonus, 'Commission' => $item->commission, 'Other deductions' => $item->deductions, 'Advance recovery' => $item->recovery] as $label => $value)
                <tr><td>{{ $label }}</td><td class="num">{{ number_format($value, 2) }}</td></tr>
            @endforeach
            <tr class="subtotal"><td>Net Salary</td><td class="num">{{ number_format($item->net_pay, 2) }}</td></tr>
            <tr><td>Current Unpaid Balance</td><td class="num">{{ number_format($due, 2) }}</td></tr>
        </tbody>
    </table>

    @if($item->notes)<p class="meta document-note">{{ $item->notes }}</p>@endif
    <p class="meta document-note">Posting date: {{ $item->payroll->posting_date?->format('d M Y') }}. A payslip records salary entitlement; payments are recorded separately.</p>
</body>
</html>
