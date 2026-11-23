<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@include('pdf.partials.font')
body { font-family: 'Instrument Sans', 'DejaVu Sans', sans-serif; font-size: 11px; color:#172033; } h1 { font-size:22px; } table { width:100%; border-collapse:collapse; margin-top:18px; } td,th { border-bottom:1px solid #ddd; padding:9px; text-align:left; } .amount {text-align:right;} .muted {color:#667085;} .total {font-weight:bold;background:#f1f5f9;}
</style></head><body>
<h1>Salary Payslip</h1><p>{{ $item->payroll->number }} · {{ $item->payroll->period->format('F Y') }} · {{ strtoupper($item->payroll->status) }}</p>
@php $s=$item->snapshot; @endphp
<h2>{{ $s['employee_name'] }}</h2><p>{{ $s['employee_number'] }}</p>
<p class="muted">Calendar days: {{ $s['calendar_days'] }} · Employed days: {{ $s['eligible_days'] }} · Unpaid days: {{ $s['unpaid_days'] }}</p>
<table><thead><tr><th>Description</th><th class="amount">PKR</th></tr></thead><tbody>
@foreach(['Monthly basic'=>$s['basic'],'Monthly allowances'=>$s['allowances'],'Unpaid-day deduction (included in proration)'=>$s['unpaid_deduction'],'Salary after proration and absence'=>$item->base,'Overtime'=>$item->overtime,'Bonus'=>$item->bonus,'Commission'=>$item->commission,'Other deductions'=>$item->deductions,'Advance recovery'=>$item->recovery] as $label=>$value)
<tr><td>{{ $label }}</td><td class="amount">{{ number_format($value,2) }}</td></tr>
@endforeach
<tr class="total"><td>Net Salary</td><td class="amount">{{ number_format($item->net_pay,2) }}</td></tr>
<tr><td>Current Unpaid Balance</td><td class="amount">{{ number_format($due,2) }}</td></tr>
</tbody></table><p>{{ $item->notes }}</p><p class="muted">Posting date: {{ $item->payroll->posting_date?->format('d M Y') }}. A payslip records salary entitlement; payments are recorded separately.</p>
</body></html>
