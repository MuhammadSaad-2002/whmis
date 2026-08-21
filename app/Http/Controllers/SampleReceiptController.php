<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Product;
use App\Models\SampleReceipt;
use App\Models\Warehouse;
use App\Services\NumberSeriesService;
use App\Services\SamplePostingService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use RuntimeException;

class SampleReceiptController extends Controller
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly SamplePostingService $posting,
    ) {}

    public function index(Request $request)
    {
        $receipts = SampleReceipt::query()
            ->with('company:id,name')
            ->when($request->search, fn ($q, $search) => $q->where('receipt_number', 'like', "%{$search}%"))
            ->when($request->company_id, fn ($q, $id) => $q->where('company_id', $id))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->from, fn ($q, $from) => $q->whereDate('receipt_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('receipt_date', '<=', $to))
            ->latest('receipt_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('samples/receipts/index', [
            'receipts' => $receipts,
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'company_id', 'status', 'from', 'to'),
        ]);
    }

    public function create()
    {
        return Inertia::render('samples/receipts/form', [
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'warehouse' => Warehouse::default()->only(['id', 'name']),
            'receipt' => null,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        try {
            $receipt = DB::transaction(function () use ($data) {
                $manual = ! empty($data['receipt_number']);

                $receipt = SampleReceipt::create($this->headerAttributes($data) + [
                    'receipt_number' => $manual ? $data['receipt_number'] : $this->numbers->next('sample_receipt'),
                    'manual_number' => $manual,
                    'created_by' => $data['user_id'],
                ]);
                $this->syncItems($receipt, $data['items']);

                return $receipt;
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('samples.receipts.edit', $receipt)
            ->with('success', "Draft {$receipt->receipt_number} saved.");
    }

    public function edit(SampleReceipt $receipt)
    {
        $receipt->load(['items.product:id,name,generic_name', 'company:id,name']);

        return Inertia::render('samples/receipts/form', [
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'warehouse' => $receipt->warehouse->only(['id', 'name']),
            'receipt' => $receipt,
        ]);
    }

    public function update(Request $request, SampleReceipt $receipt)
    {
        if (! $receipt->isDraft()) {
            return back()->with('error', 'Only draft sample receipts can be edited.');
        }

        $data = $this->validated($request, $receipt);

        try {
            DB::transaction(function () use ($receipt, $data) {
                if (! empty($data['receipt_number']) && $data['receipt_number'] !== $receipt->receipt_number) {
                    $receipt->receipt_number = $data['receipt_number'];
                    $receipt->manual_number = true;
                }
                $receipt->fill($this->headerAttributes($data))->save();
                $receipt->items()->delete();
                $this->syncItems($receipt, $data['items']);
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Draft updated.');
    }

    public function post(SampleReceipt $receipt)
    {
        try {
            $this->posting->postReceipt($receipt);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($receipt, 'posted', ['receipt_number' => $receipt->receipt_number]);

        return back()->with('success', "Sample receipt {$receipt->receipt_number} posted. Sample stock received.");
    }

    public function cancel(SampleReceipt $receipt)
    {
        try {
            $this->posting->cancelReceipt($receipt);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($receipt, 'cancelled', ['receipt_number' => $receipt->receipt_number]);

        return back()->with('success', "Sample receipt {$receipt->receipt_number} cancelled.");
    }

    public function destroy(SampleReceipt $receipt)
    {
        if (! $receipt->isDraft()) {
            return back()->with('error', 'Only draft sample receipts can be deleted.');
        }

        $receipt->delete();

        return redirect()->route('samples.receipts.index')->with('success', 'Draft deleted.');
    }

    public function print(SampleReceipt $receipt)
    {
        $receipt->load(['items.product', 'company', 'warehouse']);

        return Pdf::loadView('pdf.sample-receipt', ['receipt' => $receipt])
            ->setPaper('a4')
            ->stream("{$receipt->receipt_number}.pdf");
    }

    private function validated(Request $request, ?SampleReceipt $existing = null): array
    {
        return $request->validate([
            'receipt_number' => [
                'nullable', 'string', 'max:50',
                Rule::unique('sample_receipts', 'receipt_number')->ignore($existing?->id),
            ],
            'company_id' => ['required', 'exists:companies,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'receipt_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.batch_number' => ['nullable', 'string', 'max:100'],
            'items.*.expiry_date' => ['nullable', 'date'],
            'items.*.quantity' => ['required', 'numeric', 'min:1'],
            'items.*.remarks' => ['nullable', 'string', 'max:255'],
        ]) + ['user_id' => $request->user()->id];
    }

    private function headerAttributes(array $data): array
    {
        return collect($data)->only([
            'company_id', 'warehouse_id', 'receipt_date', 'notes',
        ])->map(fn ($v) => $v ?? null)->all();
    }

    private function syncItems(SampleReceipt $receipt, array $items): void
    {
        $totalQty = 0.0;

        foreach (array_values($items) as $index => $item) {
            $receipt->items()->create([
                'product_id' => $item['product_id'],
                'batch_number' => $item['batch_number'] ?? null,
                'expiry_date' => $item['expiry_date'] ?? null,
                'quantity' => $item['quantity'],
                'remarks' => $item['remarks'] ?? null,
                'sort_order' => $index,
            ]);

            $totalQty += (float) $item['quantity'];
        }

        $receipt->update(['total_quantity' => round($totalQty, 2)]);
    }
}
