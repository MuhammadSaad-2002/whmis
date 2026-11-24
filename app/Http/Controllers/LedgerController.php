<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Customer;
use App\Services\FinancialPositionPdfCharts;
use App\Services\LedgerService;
use App\Services\ReportPdfRenderer;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class LedgerController extends Controller
{
    public function __construct(private readonly LedgerService $ledger) {}

    public function customer(Request $request, Customer $customer)
    {
        [$from, $to] = $this->range($request);

        return Inertia::render('ledger/party', [
            'party' => $customer->only(['id', 'name', 'city', 'phone', 'credit_limit']),
            'partyType' => 'customer',
            'statement' => $this->ledger->statement($customer, $from, $to),
            'aging' => $this->ledger->aging($customer),
            'outstanding' => $this->ledger->outstanding($customer),
            'filters' => $request->only('from', 'to'),
        ]);
    }

    public function company(Request $request, Company $company)
    {
        [$from, $to] = $this->range($request);

        return Inertia::render('ledger/party', [
            'party' => $company->only(['id', 'name', 'city', 'phone', 'credit_limit']),
            'partyType' => 'company',
            'statement' => $this->ledger->statement($company, $from, $to),
            'aging' => $this->ledger->aging($company),
            'outstanding' => $this->ledger->outstanding($company),
            'filters' => $request->only('from', 'to'),
        ]);
    }

    public function customerStatementPdf(Request $request, Customer $customer, ReportPdfRenderer $pdf)
    {
        [$from, $to] = $this->range($request);

        return $pdf->renderView('pdf.statement', [
            'party' => $customer,
            'partyLabel' => 'Customer',
            'statement' => $this->ledger->statement($customer, $from, $to),
            'aging' => $this->ledger->aging($customer),
            'from' => $from,
            'to' => $to,
        ], 'portrait')->stream("statement-{$customer->id}.pdf");
    }

    public function companyStatementPdf(Request $request, Company $company, ReportPdfRenderer $pdf)
    {
        [$from, $to] = $this->range($request);

        return $pdf->renderView('pdf.statement', [
            'party' => $company,
            'partyLabel' => 'Supplier',
            'statement' => $this->ledger->statement($company, $from, $to),
            'aging' => $this->ledger->aging($company),
            'from' => $from,
            'to' => $to,
        ], 'portrait')->stream("statement-{$company->id}.pdf");
    }

    /** Consolidated receivables + payables + payments log with totals. */
    public function position(Request $request)
    {
        [$from, $to, $asOf] = $this->positionRange($request);

        return Inertia::render('ledger/position', [
            'data' => fn () => $this->ledger->financialPosition($from, $to, $asOf),
            'filters' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'asOf' => $asOf->toDateString(),
            'paymentParties' => fn () => $request->user()->can('payments.view') && $request->user()->can('payments.manage')
                ? [
                    'customer' => Customer::active()->orderBy('name')->get(['id', 'name']),
                    'company' => Company::active()->orderBy('name')->get(['id', 'name']),
                ]
                : null,
        ]);
    }

    public function positionPdf(Request $request, FinancialPositionPdfCharts $charts)
    {
        [$from, $to, $asOf] = $this->positionRange($request);
        $data = $this->ledger->financialPosition($from, $to, $asOf);

        return Pdf::loadView('pdf.financial-position', [
            'data' => $data,
            'charts' => $charts->build($data),
            'asOf' => $asOf,
            'from' => $from,
            'to' => $to,
        ])->setPaper('a4', 'landscape')->stream('financial-position.pdf');
    }

    private function positionRange(Request $request): array
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $asOf = Carbon::today('Asia/Karachi');
        $to = isset($filters['to']) ? Carbon::parse($filters['to'], $asOf->timezone) : $asOf->copy();
        $from = isset($filters['from']) ? Carbon::parse($filters['from'], $asOf->timezone) : $to->copy()->subYearNoOverflow()->addDay();
        if ($from->gt($to)) {
            throw ValidationException::withMessages(['to' => 'The end date must be on or after the start date.']);
        }

        return [$from, $to, $asOf];
    }

    private function range(Request $request): array
    {
        return [
            $request->from ? Carbon::parse($request->from) : null,
            $request->to ? Carbon::parse($request->to) : null,
        ];
    }
}
