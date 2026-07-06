<?php

namespace App\Http\Controllers;

use App\Models\Company;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CompanyController extends Controller
{
    public function index(Request $request)
    {
        $companies = Company::query()
            ->withCount('products')
            ->when($request->search, function ($q, $search) {
                $q->where(fn ($w) => $w
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('contact_person', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%"));
            })
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('suppliers/index', [
            'companies' => $companies,
            'filters' => $request->only('search', 'status'),
        ]);
    }

    public function store(Request $request)
    {
        Company::create($this->validated($request));

        return back()->with('success', 'Company created.');
    }

    public function update(Request $request, Company $company)
    {
        $company->update($this->validated($request));

        return back()->with('success', 'Company updated.');
    }

    public function destroy(Company $company)
    {
        if ($company->purchaseInvoices()->exists()) {
            return back()->with('error', 'Cannot delete: company has purchase invoices. Mark it inactive instead.');
        }

        $company->delete();

        return back()->with('success', 'Company deleted.');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'whatsapp' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:100'],
            'gst_number' => ['nullable', 'string', 'max:100'],
            'ntn_number' => ['nullable', 'string', 'max:100'],
            'payment_terms' => ['nullable', 'string', 'max:255'],
            'credit_days' => ['nullable', 'integer', 'min:0'],
            'credit_limit' => ['nullable', 'numeric', 'min:0'],
            'status' => ['required', 'in:active,inactive'],
            'notes' => ['nullable', 'string'],
        ]);
    }
}
