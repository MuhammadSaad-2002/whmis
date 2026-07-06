<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\Warehouse;
use App\Services\InvoicePostingService;
use App\Services\MarginCalculator;
use App\Services\NumberSeriesService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use RuntimeException;

class PurchaseInvoiceController extends Controller
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly InvoicePostingService $posting,
    ) {}

    public function index(Request $request)
    {
        $invoices = PurchaseInvoice::query()
            ->with('company:id,name')
            ->when($request->search, function ($q, $search) {
                $q->where(fn ($w) => $w
                    ->where('invoice_number', 'like', "%{$search}%")
                    ->orWhere('supplier_invoice_number', 'like', "%{$search}%"));
            })
            ->when($request->company_id, fn ($q, $id) => $q->where('company_id', $id))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->from, fn ($q, $from) => $q->whereDate('invoice_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('invoice_date', '<=', $to))
            ->latest('invoice_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('purchases/index', [
            'invoices' => $invoices,
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'company_id', 'status', 'from', 'to'),
        ]);
    }

    public function create()
    {
        return Inertia::render('purchases/form', [
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
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

        $invoice = DB::transaction(function () use ($data) {
            $invoice = PurchaseInvoice::create($this->headerAttributes($data) + [
                'invoice_number' => $this->numbers->next('purchase_invoice'),
                'created_by' => $data['user_id'],
            ]);
            $this->syncItems($invoice, $data['items']);

            return $invoice;
        });

        return redirect()
            ->route('purchases.edit', $invoice)
            ->with('success', "Draft {$invoice->invoice_number} saved.");
    }

    public function edit(PurchaseInvoice $purchase)
    {
        $purchase->load(['items.product:id,name,generic_name', 'company:id,name']);

        return Inertia::render('purchases/form', [
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'warehouse' => $purchase->warehouse->only(['id', 'name']),
            'invoice' => $purchase,
        ]);
    }

    public function update(Request $request, PurchaseInvoice $purchase)
    {
        if (! $purchase->isDraft()) {
            return back()->with('error', 'Only draft invoices can be edited.');
        }

        $data = $this->validated($request);

        if ($name = $this->duplicateProductName($data['items'])) {
            return back()->with('error', "{$name} appears on more than one line — combine it into a single line.");
        }

        DB::transaction(function () use ($purchase, $data) {
            $purchase->update($this->headerAttributes($data));
            $purchase->items()->delete();
            $this->syncItems($purchase, $data['items']);
        });

        return back()->with('success', 'Draft updated.');
    }

    public function post(PurchaseInvoice $purchase)
    {
        try {
            $this->posting->postPurchase($purchase);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Invoice {$purchase->invoice_number} posted. Stock received.");
    }

    public function cancel(PurchaseInvoice $purchase)
    {
        try {
            $this->posting->cancelPurchase($purchase);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Invoice {$purchase->invoice_number} cancelled.");
    }

    public function destroy(PurchaseInvoice $purchase)
    {
        if (! $purchase->isDraft()) {
            return back()->with('error', 'Only draft invoices can be deleted.');
        }

        $purchase->delete();

        return redirect()->route('purchases.index')->with('success', 'Draft deleted.');
    }

    public function duplicate(PurchaseInvoice $purchase)
    {
        $copy = DB::transaction(function () use ($purchase) {
            $copy = $purchase->replicate([
                'status', 'posted_at', 'posted_by', 'supplier_invoice_number',
            ]);
            $copy->invoice_number = $this->numbers->next('purchase_invoice');
            $copy->status = PurchaseInvoice::STATUS_DRAFT;
            $copy->invoice_date = now()->toDateString();
            $copy->created_by = auth()->id();
            $copy->save();

            foreach ($purchase->items as $item) {
                $itemCopy = $item->replicate(['batch_id']);
                $itemCopy->purchase_invoice_id = $copy->id;
                $itemCopy->save();
            }

            return $copy;
        });

        return redirect()
            ->route('purchases.edit', $copy)
            ->with('success', "Duplicated as {$copy->invoice_number}.");
    }

    public function print(PurchaseInvoice $purchase)
    {
        $purchase->load(['items.product', 'company', 'warehouse']);

        return Pdf::loadView('pdf.purchase-invoice', ['invoice' => $purchase])
            ->setPaper('a4')
            ->stream("{$purchase->invoice_number}.pdf");
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'supplier_invoice_number' => ['nullable', 'string', 'max:100'],
            'invoice_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date'],
            'purchase_type' => ['required', 'in:cash,credit'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'gst_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.batch_number' => ['nullable', 'string', 'max:100'],
            'items.*.expiry_date' => ['nullable', 'date'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.bonus_quantity' => ['nullable', 'numeric', 'min:0'],
            'items.*.purchase_rate' => ['required', 'numeric', 'min:0'],
            'items.*.trade_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.retail_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.gst_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.remarks' => ['nullable', 'string', 'max:255'],
        ]) + ['user_id' => $request->user()->id];
    }

    private function headerAttributes(array $data): array
    {
        return collect($data)->only([
            'company_id', 'warehouse_id', 'supplier_invoice_number', 'invoice_date',
            'due_date', 'purchase_type', 'discount_percent', 'gst_percent', 'notes',
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

    /**
     * Store draft items with computed display amounts and header totals.
     * Posting recomputes everything authoritatively.
     */
    private function syncItems(PurchaseInvoice $invoice, array $items): void
    {
        $lines = [];
        $totalMargin = 0.0;

        foreach (array_values($items) as $index => $item) {
            $line = MarginCalculator::purchaseLine($item + ['discount_amount' => null, 'gst_amount' => null]);

            $invoice->items()->create([
                'product_id' => $item['product_id'],
                'batch_number' => $item['batch_number'] ?? null,
                'expiry_date' => $item['expiry_date'] ?? null,
                'quantity' => $item['quantity'],
                'bonus_quantity' => $item['bonus_quantity'] ?? 0,
                'purchase_rate' => $item['purchase_rate'],
                'trade_price' => $item['trade_price'] ?? 0,
                'retail_price' => $item['retail_price'] ?? 0,
                'discount_percent' => $item['discount_percent'] ?? 0,
                'discount_amount' => $line['discount_amount'],
                'gst_percent' => $item['gst_percent'] ?? 0,
                'gst_amount' => $line['gst_amount'],
                'net_amount' => $line['net_amount'],
                'margin' => $line['margin'],
                'margin_percent' => $line['margin_percent'],
                'remarks' => $item['remarks'] ?? null,
                'sort_order' => $index,
            ]);

            $lines[] = $line;
            $totalMargin += $line['margin'];
        }

        $totals = MarginCalculator::invoiceTotals($lines, [
            'discount_percent' => (float) ($invoice->discount_percent ?? 0),
            'gst_percent' => (float) ($invoice->gst_percent ?? 0),
        ]);

        $invoice->update($totals + [
            'total_margin' => round($totalMargin, 2),
            'margin_percent' => $totals['total_amount'] > 0
                ? round($totalMargin / $totals['total_amount'] * 100, 2)
                : 0,
        ]);
    }
}
