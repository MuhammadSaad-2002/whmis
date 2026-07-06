<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesInvoice;
use App\Models\Warehouse;
use App\Services\InvoicePostingService;
use App\Services\MarginCalculator;
use App\Services\NumberSeriesService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use RuntimeException;

class SalesInvoiceController extends Controller
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly InvoicePostingService $posting,
    ) {}

    public function index(Request $request)
    {
        $invoices = SalesInvoice::query()
            ->with('customer:id,name,city')
            ->when($request->search, fn ($q, $search) => $q->where('invoice_number', 'like', "%{$search}%"))
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->sale_type, fn ($q, $type) => $q->where('sale_type', $type))
            ->when($request->from, fn ($q, $from) => $q->whereDate('invoice_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('invoice_date', '<=', $to))
            ->latest('invoice_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('sales/index', [
            'invoices' => $invoices,
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'customer_id', 'status', 'sale_type', 'from', 'to'),
        ]);
    }

    public function create()
    {
        return Inertia::render('sales/form', [
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name', 'city', 'credit_limit']),
            'warehouse' => Warehouse::default()->only(['id', 'name']),
            'invoice' => null,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        if ($name = $this->duplicateProductName($data['items'])) {
            return back()->with('error', "{$name} appears on more than one line — combine it into a single line.");
        }

        try {
            $invoice = DB::transaction(function () use ($data) {
                $manual = ! empty($data['invoice_number']);

                $invoice = SalesInvoice::create($this->headerAttributes($data) + [
                    'invoice_number' => $manual ? $data['invoice_number'] : $this->numbers->next('sales_invoice'),
                    'manual_number' => $manual,
                    'created_by' => $data['user_id'],
                ]);
                $this->syncItems($invoice, $data['items']);

                return $invoice;
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('sales.edit', $invoice)
            ->with('success', "Draft {$invoice->invoice_number} saved.");
    }

    public function edit(SalesInvoice $sale)
    {
        $sale->load(['items.product:id,name,generic_name', 'items.batch:id,batch_number,expiry_date', 'items.appliedRule:id,name', 'customer:id,name,city,credit_limit']);

        return Inertia::render('sales/form', [
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name', 'city', 'credit_limit']),
            'warehouse' => $sale->warehouse->only(['id', 'name']),
            'invoice' => $sale,
        ]);
    }

    public function update(Request $request, SalesInvoice $sale)
    {
        if (! $sale->isDraft()) {
            return back()->with('error', 'Only draft invoices can be edited.');
        }

        $data = $this->validated($request, $sale);

        if ($name = $this->duplicateProductName($data['items'])) {
            return back()->with('error', "{$name} appears on more than one line — combine it into a single line.");
        }

        try {
            DB::transaction(function () use ($sale, $data) {
                if (! empty($data['invoice_number']) && $data['invoice_number'] !== $sale->invoice_number) {
                    $sale->invoice_number = $data['invoice_number'];
                    $sale->manual_number = true;
                }
                $sale->fill($this->headerAttributes($data))->save();
                $sale->items()->delete();
                $this->syncItems($sale, $data['items']);
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Draft updated.');
    }

    public function post(SalesInvoice $sale)
    {
        try {
            $this->posting->postSale($sale);
        } catch (\App\Exceptions\CreditLimitExceededException $e) {
            app(\App\Services\AlertService::class)->send('sales.post', new \App\Notifications\SystemAlert(
                'credit_limit',
                'Credit limit blocked a sale',
                $e->getMessage(),
                route('ledger.customer', $sale->customer_id, false),
                "customer:{$sale->customer_id}",
            ));

            return back()->with('error', $e->getMessage());
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Invoice {$sale->invoice_number} posted. Stock dispatched.");
    }

    public function cancel(SalesInvoice $sale)
    {
        try {
            $this->posting->cancelSale($sale);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Invoice {$sale->invoice_number} cancelled.");
    }

    public function destroy(SalesInvoice $sale)
    {
        if (! $sale->isDraft()) {
            return back()->with('error', 'Only draft invoices can be deleted.');
        }

        $sale->delete();

        return redirect()->route('sales.index')->with('success', 'Draft deleted.');
    }

    public function print(SalesInvoice $sale)
    {
        $sale->load(['items.product', 'items.batch', 'customer', 'warehouse']);

        return Pdf::loadView('pdf.sales-invoice', ['invoice' => $sale])
            ->setPaper('a4')
            ->stream("{$sale->invoice_number}.pdf");
    }

    private function validated(Request $request, ?SalesInvoice $existing = null): array
    {
        return $request->validate([
            'invoice_number' => [
                'nullable', 'string', 'max:50',
                Rule::unique('sales_invoices', 'invoice_number')->ignore($existing?->id),
            ],
            'customer_id' => ['required', 'exists:customers,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'invoice_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date'],
            'sale_type' => ['required', 'in:cash,credit,sale_base,booking,direct'],
            'sale_terms' => ['nullable', 'string', 'max:2000', 'required_if:sale_type,sale_base'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'gst_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.batch_number' => ['nullable', 'string', 'max:100'],
            'items.*.applied_rule_id' => ['nullable', 'exists:incentive_rules,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.bonus_quantity' => ['nullable', 'numeric', 'min:0'],
            'items.*.trade_price' => ['required', 'numeric', 'min:0'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.gst_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.remarks' => ['nullable', 'string', 'max:255'],
        ]) + ['user_id' => $request->user()->id];
    }

    private function headerAttributes(array $data): array
    {
        return collect($data)->only([
            'customer_id', 'warehouse_id', 'invoice_date', 'due_date',
            'sale_type', 'sale_terms', 'discount_percent', 'gst_percent', 'notes',
        ])->map(fn ($v) => $v ?? null)->all();
    }

    /** Name of the first product that appears on more than one line, or null. */
    private function duplicateProductName(array $items): ?string
    {
        foreach (array_count_values(array_column($items, 'product_id')) as $id => $count) {
            if ($count > 1) {
                return Product::whereKey($id)->value('name') ?? "Product #{$id}";
            }
        }

        return null;
    }

    private function syncItems(SalesInvoice $invoice, array $items): void
    {
        $payload = array_map(fn ($item) => [
            'product_id' => $item['product_id'],
            'batch_id' => $this->resolveBatchId($invoice, $item),
            'quantity' => $item['quantity'],
            'bonus_quantity' => $item['bonus_quantity'] ?? 0,
            'applied_rule_id' => $item['applied_rule_id'] ?? null,
            'trade_price' => $item['trade_price'],
            'discount_percent' => $item['discount_percent'] ?? 0,
            'gst_percent' => $item['gst_percent'] ?? 0,
            'remarks' => $item['remarks'] ?? null,
        ], array_values($items));

        $computed = MarginCalculator::computeSalesItems($payload, [
            'discount_percent' => (float) ($invoice->discount_percent ?? 0),
            'gst_percent' => (float) ($invoice->gst_percent ?? 0),
        ]);

        foreach ($computed['items'] as $item) {
            $invoice->items()->create($item);
        }

        $invoice->update($computed['totals']);
    }

    /**
     * A manually typed batch number resolves to the matching in-stock batch
     * (earliest expiry first, mirroring FIFO). Blank = auto FIFO at posting.
     */
    private function resolveBatchId(SalesInvoice $invoice, array $item): ?int
    {
        $batchNumber = trim((string) ($item['batch_number'] ?? ''));
        if ($batchNumber === '') {
            return null;
        }

        $batchId = \App\Models\Batch::query()
            ->where('product_id', $item['product_id'])
            ->where('warehouse_id', $invoice->warehouse_id)
            ->whereRaw('LOWER(batch_number) = ?', [mb_strtolower($batchNumber)])
            ->where('qty_available', '>', 0)
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC')
            ->orderBy('id')
            ->value('id');

        if (! $batchId) {
            $product = \App\Models\Product::whereKey($item['product_id'])->value('name');
            throw new RuntimeException(
                "Batch \"{$batchNumber}\" not found in stock for {$product}. Leave blank for Auto (FIFO) or check the batch number.",
            );
        }

        return (int) $batchId;
    }
}
