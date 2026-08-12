<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Customer;
use App\Services\LedgerService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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

    public function customerStatementPdf(Request $request, Customer $customer)
    {
        [$from, $to] = $this->range($request);

        return Pdf::loadView('pdf.statement', [
            'party' => $customer,
            'partyLabel' => 'Customer',
            'statement' => $this->ledger->statement($customer, $from, $to),
            'aging' => $this->ledger->aging($customer),
            'from' => $from,
            'to' => $to,
        ])->setPaper('a4')->stream("statement-{$customer->id}.pdf");
    }

    public function companyStatementPdf(Request $request, Company $company)
    {
        [$from, $to] = $this->range($request);

        return Pdf::loadView('pdf.statement', [
            'party' => $company,
            'partyLabel' => 'Supplier',
            'statement' => $this->ledger->statement($company, $from, $to),
            'aging' => $this->ledger->aging($company),
            'from' => $from,
            'to' => $to,
        ])->setPaper('a4')->stream("statement-{$company->id}.pdf");
    }

    /** Consolidated receivables + payables + payments log with totals. */
    public function position(Request $request)
    {
        [$from, $to] = $this->range($request);

        return Inertia::render('ledger/position', [
            'data' => $this->ledger->financialPosition($from, $to),
            'filters' => $request->only('from', 'to'),
        ]);
    }

    public function positionPdf(Request $request)
    {
        [$from, $to] = $this->range($request);

        return Pdf::loadView('pdf.financial-position', [
            'data' => $this->ledger->financialPosition($from, $to),
            'from' => $from ?? Carbon::now()->startOfMonth(),
            'to' => $to ?? Carbon::now(),
        ])->setPaper('a4', 'landscape')->stream('financial-position.pdf');
    }

    private function range(Request $request): array
    {
        return [
            $request->from ? Carbon::parse($request->from) : null,
            $request->to ? Carbon::parse($request->to) : null,
        ];
    }
}
