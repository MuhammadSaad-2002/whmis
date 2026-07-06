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

    /** Outstanding receivables overview with aging per customer. */
    public function outstanding()
    {
        $customers = Customer::active()
            ->withSum('ledgerEntries as debit_sum', 'debit')
            ->withSum('ledgerEntries as credit_sum', 'credit')
            ->orderBy('name')
            ->get()
            ->map(function (Customer $customer) {
                $balance = round((float) $customer->debit_sum - (float) $customer->credit_sum, 2);

                return [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'city' => $customer->city,
                    'phone' => $customer->phone,
                    'credit_limit' => (float) $customer->credit_limit,
                    'balance' => $balance,
                    'aging' => $balance > 0 ? $this->ledger->aging($customer) : null,
                ];
            })
            ->filter(fn ($row) => $row['balance'] != 0.0)
            ->values();

        return Inertia::render('ledger/outstanding', ['customers' => $customers]);
    }

    private function range(Request $request): array
    {
        return [
            $request->from ? Carbon::parse($request->from) : null,
            $request->to ? Carbon::parse($request->to) : null,
        ];
    }
}
