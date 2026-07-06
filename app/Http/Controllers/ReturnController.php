<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\PurchaseReturn;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\SalesReturnItem;
use App\Models\Warehouse;
use App\Services\ReturnService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use RuntimeException;

class ReturnController extends Controller
{
    public function __construct(private readonly ReturnService $returns) {}

    public function salesIndex(Request $request)
    {
        $returns = SalesReturn::query()
            ->with(['customer:id,name,city', 'invoice:id,invoice_number'])
            ->when($request->search, function ($q, $search) {
                $q->where('return_number', 'like', "%{$search}%")
                    ->orWhereHas('invoice', fn ($i) => $i->where('invoice_number', 'like', "%{$search}%"));
            })
            ->when($request->from, fn ($q, $from) => $q->whereDate('return_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('return_date', '<=', $to))
            ->latest('return_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('returns/sales-index', [
            'returns' => $returns,
            'filters' => $request->only('search', 'from', 'to'),
        ]);
    }

    public function salesCreate()
    {
        return Inertia::render('returns/sales-form', [
            'warehouse' => Warehouse::default()->only(['id', 'name']),
        ]);
    }

    public function salesStore(Request $request)
    {
        $data = $request->validate([
            'sales_invoice_id' => ['required', 'exists:sales_invoices,id'],
            'return_date' => ['required', 'date'],
            'reason' => ['nullable', 'string', 'max:255'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.sales_invoice_item_id' => ['required', 'integer'],
            'lines.*.quantity' => ['required', 'numeric', 'min:0'],
        ]);

        try {
            $return = $this->returns->createSalesReturn(
                SalesInvoice::findOrFail($data['sales_invoice_id']),
                $data['lines'],
                $data['return_date'],
                $data['reason'] ?? null,
            );
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('returns.sales.index')
            ->with('success', "Return {$return->return_number} posted — stock restored, credit note issued.");
    }

    public function purchaseIndex(Request $request)
    {
        $returns = PurchaseReturn::query()
            ->with('company:id,name')
            ->when($request->search, fn ($q, $search) => $q->where('return_number', 'like', "%{$search}%"))
            ->when($request->from, fn ($q, $from) => $q->whereDate('return_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('return_date', '<=', $to))
            ->latest('return_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('returns/purchase-index', [
            'returns' => $returns,
            'filters' => $request->only('search', 'from', 'to'),
        ]);
    }

    public function purchaseCreate()
    {
        return Inertia::render('returns/purchase-form', [
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'warehouse' => Warehouse::default()->only(['id', 'name']),
        ]);
    }

    public function purchaseStore(Request $request)
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'return_date' => ['required', 'date'],
            'reason' => ['nullable', 'string', 'max:255'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.batch_id' => ['required', 'exists:batches,id'],
            'lines.*.quantity' => ['required', 'numeric', 'min:0'],
            'lines.*.rate' => ['nullable', 'numeric', 'min:0'],
        ]);

        try {
            $return = $this->returns->createPurchaseReturn(
                Company::findOrFail($data['company_id']),
                (int) $data['warehouse_id'],
                $data['lines'],
                $data['return_date'],
                $data['reason'] ?? null,
            );
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('returns.purchases.index')
            ->with('success', "Return {$return->return_number} posted — stock withdrawn, debit note issued.");
    }

    /** Posted invoices matching a search, for the sales-return picker. */
    public function lookupInvoices(Request $request)
    {
        $query = trim((string) $request->q);

        $invoices = SalesInvoice::query()
            ->with('customer:id,name,city')
            ->where('status', 'posted')
            ->when($query, function ($q) use ($query) {
                $q->where(fn ($w) => $w
                    ->where('invoice_number', 'like', "%{$query}%")
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$query}%")));
            })
            ->latest('invoice_date')->latest('id')
            ->limit(15)
            ->get(['id', 'invoice_number', 'customer_id', 'invoice_date', 'total_amount']);

        return response()->json($invoices->map(fn ($invoice) => [
            'id' => $invoice->id,
            'invoice_number' => $invoice->invoice_number,
            'customer' => $invoice->customer?->name,
            'city' => $invoice->customer?->city,
            'invoice_date' => $invoice->invoice_date->toDateString(),
            'total_amount' => (float) $invoice->total_amount,
        ]));
    }

    /** Invoice lines with returnable quantities, for the sales-return form. */
    public function lookupReturnable(SalesInvoice $sale)
    {
        abort_unless($sale->isPosted(), 422, 'Invoice is not posted.');

        $returned = SalesReturnItem::query()
            ->whereIn('sales_invoice_item_id', $sale->items->pluck('id'))
            ->selectRaw('sales_invoice_item_id, SUM(quantity) as total')
            ->groupBy('sales_invoice_item_id')
            ->pluck('total', 'sales_invoice_item_id');

        return response()->json([
            'invoice' => [
                'id' => $sale->id,
                'invoice_number' => $sale->invoice_number,
                'customer' => $sale->customer->name,
                'invoice_date' => $sale->invoice_date->toDateString(),
            ],
            'lines' => $sale->items->map(function ($item) use ($returned) {
                $alreadyReturned = (float) ($returned[$item->id] ?? 0);
                $unitRefund = (float) $item->quantity > 0
                    ? round((float) $item->net_amount / (float) $item->quantity, 4)
                    : 0;

                return [
                    'sales_invoice_item_id' => $item->id,
                    'product' => $item->product->name,
                    'sold_qty' => (float) $item->quantity,
                    'already_returned' => $alreadyReturned,
                    'returnable' => (float) $item->quantity - $alreadyReturned,
                    'unit_refund' => $unitRefund,
                ];
            })->values(),
        ]);
    }
}
