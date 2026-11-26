<?php

namespace App\Http\Controllers;

use App\Models\BookerAssignmentLog;
use App\Models\Customer;
use App\Models\User;
use App\Services\CustomerLicenseFiles;
use App\Services\LedgerService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomerController extends Controller
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly CustomerLicenseFiles $licenseFiles,
    ) {}

    public function index(Request $request)
    {
        $customers = $this->visibleCustomers($request->user())
            ->when($request->search, function ($q, $search) {
                $q->where(fn ($w) => $w
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('owner_name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('city', 'like', "%{$search}%"));
            })
            ->when($request->city, fn ($q, $city) => $q->where('city', $city))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->withSum('ledgerEntries as debit_sum', 'debit')
            ->withSum('ledgerEntries as credit_sum', 'credit')
            ->with('bookers:id')
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        $canViewLicense = $request->user()->can('view-customer-license');
        $customers->through(function (Customer $customer) use ($canViewLicense) {
            $customer->setAttribute('booker_ids', $customer->bookers->pluck('id')->values());
            $customer->unsetRelation('bookers');

            return $customer->toArray() + ($canViewLicense ? [
                'drug_license' => [
                    'number' => $customer->drug_license_no,
                    'expires_on' => $customer->drug_license_expires_on?->toDateString(),
                    'has_file' => filled($customer->drug_license_path),
                ],
            ] : []);
        });

        return Inertia::render('customers/index', [
            'customers' => $customers,
            'cities' => Customer::whereNotNull('city')->distinct()->orderBy('city')->pluck('city'),
            'bookers' => User::role('Booker')->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'city', 'status'),
            'canViewLicense' => $canViewLicense,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $openingBalance = (float) ($data['opening_balance'] ?? 0);
        $bookerIds = $data['booker_ids'] ?? [];
        $file = $data['drug_license_file'] ?? null;
        unset($data['opening_balance'], $data['booker_ids'], $data['drug_license_file']);

        $customer = $this->licenseFiles->saveCustomer($data, null, $file);
        $this->syncBookers($request, $customer, $bookerIds);

        if ($openingBalance != 0.0) {
            $this->ledger->post(
                $customer,
                'opening',
                now()->toDateString(),
                max($openingBalance, 0),
                max(-$openingBalance, 0),
                null,
                'Opening balance',
            );
        }

        return back()->with('success', 'Customer created.');
    }

    public function update(Request $request, Customer $customer)
    {
        abort_unless($this->visibleCustomers($request->user())->whereKey($customer->id)->exists(), 404);
        $data = $this->validated($request);
        $bookerIds = $data['booker_ids'] ?? [];
        $file = $data['drug_license_file'] ?? null;
        unset($data['opening_balance'], $data['booker_ids'], $data['drug_license_file']);
        $customer = $this->licenseFiles->saveCustomer($data, $customer, $file);
        $this->syncBookers($request, $customer, $bookerIds);

        return back()->with('success', 'Customer updated.');
    }

    public function downloadLicense(Request $request, Customer $customer): StreamedResponse
    {
        abort_unless($this->visibleCustomers($request->user())->whereKey($customer->id)->exists(), 404);

        return $this->licenseFiles->download($customer);
    }

    /**
     * Reconcile a customer's assigned bookers and append an audit-log row for
     * every booker added (assigned) or removed (unassigned). Pivot sync() fires
     * no model events, so we log the diff explicitly here.
     */
    private function syncBookers(Request $request, Customer $customer, array $bookerIds): void
    {
        $bookerIds = collect($bookerIds)->map(fn ($id) => (int) $id)->unique();
        $before = $customer->bookers()->pluck('users.id');

        $customer->bookers()->sync(
            $bookerIds->mapWithKeys(fn ($id) => [$id => ['assigned_by' => $request->user()->id]])->all()
        );

        $added = $bookerIds->diff($before);
        $removed = $before->diff($bookerIds);

        foreach ($added->merge($removed) as $bookerId) {
            BookerAssignmentLog::create([
                'customer_id' => $customer->id,
                'booker_id' => $bookerId,
                'action' => $added->contains($bookerId) ? 'assigned' : 'unassigned',
                'changed_by' => $request->user()->id,
            ]);
        }
    }

    public function import(Request $request)
    {
        $request->validate(['file' => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:10240']]);

        $import = new \App\Imports\CustomersImport;
        \Maatwebsite\Excel\Facades\Excel::import($import, $request->file('file'));

        $summary = "Import finished: {$import->created} created, {$import->updated} updated.";
        if ($import->errors !== []) {
            $details = collect($import->errors)
                ->map(fn ($message, $row) => "Row {$row}: {$message}")
                ->take(10)
                ->implode(' ');

            return back()->with('error', "{$summary} ".count($import->errors)." rows skipped — {$details}");
        }

        return back()->with('success', $summary);
    }

    public function template()
    {
        return \Maatwebsite\Excel\Facades\Excel::download(
            new \App\Exports\TemplateExport(\App\Imports\CustomersImport::headings()),
            'customers-import-template.xlsx',
        );
    }

    public function destroy(Request $request, Customer $customer)
    {
        abort_unless($this->visibleCustomers($request->user())->whereKey($customer->id)->exists(), 404);

        if ($customer->salesInvoices()->exists() || $customer->ledgerEntries()->exists()) {
            return back()->with('error', 'Cannot delete: customer has transactions. Mark them inactive instead.');
        }

        $customer->delete();

        return back()->with('success', 'Customer deleted.');
    }

    private function visibleCustomers(User $user): Builder
    {
        return Customer::query()->when(! $user->can('dashboard.view_all'), fn ($query) => $query->forBooker($user->id));
    }

    private function validated(Request $request): array
    {
        if ($request->hasAny(['drug_license_no', 'drug_license_expires_on', 'drug_license_file'])) {
            Gate::authorize('view-customer-license');
        }

        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'drug_license_no' => ['nullable', 'string', 'max:100'],
            'drug_license_expires_on' => ['nullable', 'date_format:Y-m-d'],
            'drug_license_file' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:10240'],
            'registration_no' => ['nullable', 'string', 'max:100'],
            'ntn' => ['nullable', 'string', 'max:100'],
            'strn' => ['nullable', 'string', 'max:100'],
            'owner_name' => ['nullable', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'cnic' => ['nullable', 'string', 'max:50'],
            'phone' => ['nullable', 'string', 'max:50'],
            'whatsapp' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'website' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:100'],
            'credit_limit' => ['nullable', 'numeric', 'min:0'],
            'payment_terms' => ['nullable', 'string', 'max:255'],
            'credit_days' => ['nullable', 'integer', 'min:0'],
            'booker_id' => ['nullable', 'exists:users,id'],
            'booker_ids' => ['nullable', 'array'],
            'booker_ids.*' => ['integer', 'exists:users,id'],
            'status' => ['required', 'in:active,inactive'],
            'notes' => ['nullable', 'string'],
            'opening_balance' => ['nullable', 'numeric'],
        ]);
    }
}
