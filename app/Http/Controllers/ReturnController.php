<?php

namespace App\Http\Controllers;

use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\PurchaseReturnItem;
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
        $query = SalesReturn::query()
            ->with(['customer:id,name,city', 'invoice:id,invoice_number'])
            ->when($request->search, function ($q, $search) {
                $q->where('return_number', 'like', "%{$search}%")
                    ->orWhereHas('invoice', fn ($i) => $i->where('invoice_number', 'like', "%{$search}%"));
            })
            ->when($request->from, fn ($q, $from) => $q->whereDate('return_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('return_date', '<=', $to));

        // Net credit issued = posted returns only (cancelled are reversed).
        $posted = (clone $query)->where('status', SalesReturn::STATUS_POSTED);

        $returns = $query->latest('return_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('returns/sales-index', [
            'returns' => $returns,
            'filters' => $request->only('search', 'from', 'to'),
            'summary' => [
                'total' => round((float) (clone $posted)->sum('total_amount'), 2),
                'count' => (clone $posted)->count(),
            ],
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

    public function salesShow(SalesReturn $salesReturn)
    {
        $salesReturn->load([
            'customer:id,name,city',
            'warehouse:id,name',
            'invoice:id,invoice_number,invoice_date,total_amount',
            'items.product:id,name',
            'items.batch:id,batch_number',
            'creator:id,name',
            'cancelledBy:id,name',
        ]);

        return Inertia::render('returns/sales-show', [
            'salesReturn' => $salesReturn,
        ]);
    }

    public function salesCancel(SalesReturn $salesReturn)
    {
        try {
            $this->returns->cancelSalesReturn($salesReturn);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Return {$salesReturn->return_number} cancelled — stock withdrawn, credit note reversed.");
    }

    public function purchaseIndex(Request $request)
    {
        $query = PurchaseReturn::query()
            ->with('company:id,name')
            ->when($request->search, fn ($q, $search) => $q->where('return_number', 'like', "%{$search}%"))
            ->when($request->from, fn ($q, $from) => $q->whereDate('return_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('return_date', '<=', $to));

        $summaryTotal = round((float) (clone $query)->sum('total_amount'), 2);
        $summaryCount = (clone $query)->count();

        $returns = $query->latest('return_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('returns/purchase-index', [
            'returns' => $returns,
            'filters' => $request->only('search', 'from', 'to'),
            'summary' => [
                'total' => $summaryTotal,
                'count' => $summaryCount,
            ],
        ]);
    }

    public function purchaseCreate()
    {
        return Inertia::render('returns/purchase-form', [
            'warehouse' => Warehouse::default()->only(['id', 'name']),
        ]);
    }

    public function purchaseStore(Request $request)
    {
        $data = $request->validate([
            'purchase_invoice_id' => ['required', 'exists:purchase_invoices,id'],
            'return_date' => ['required', 'date'],
            'reason' => ['nullable', 'string', 'max:255'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.purchase_invoice_item_id' => ['required', 'integer'],
            'lines.*.quantity' => ['required', 'numeric', 'min:0'],
        ]);

        try {
            $return = $this->returns->createPurchaseReturn(
                PurchaseInvoice::findOrFail($data['purchase_invoice_id']),
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

        $sale->load(['items.product.company', 'items.batch', 'customer:id,name']);

        $returned = SalesReturnItem::query()
            ->whereIn('sales_invoice_item_id', $sale->items->pluck('id'))
            ->whereHas('salesReturn', fn ($q) => $q->where('status', SalesReturn::STATUS_POSTED))
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
                    'company' => $item->product->company?->name,
                    'batch_number' => $item->batch?->batch_number,
                    'batch_id' => $item->batch_id,
                    'sold_qty' => (float) $item->quantity,
                    'already_returned' => $alreadyReturned,
                    'returnable' => (float) $item->quantity - $alreadyReturned,
                    'unit_refund' => $unitRefund,
                ];
            })->values(),
        ]);
    }

    /** Posted purchase invoices matching a search, for the purchase-return picker. */
    public function lookupPurchaseInvoices(Request $request)
    {
        $query = trim((string) $request->q);

        $invoices = PurchaseInvoice::query()
            ->with('company:id,name')
            ->where('status', 'posted')
            ->when($query, function ($q) use ($query) {
                $q->where(fn ($w) => $w
                    ->where('invoice_number', 'like', "%{$query}%")
                    ->orWhereHas('company', fn ($c) => $c->where('name', 'like', "%{$query}%")));
            })
            ->latest('invoice_date')->latest('id')
            ->limit(15)
            ->get(['id', 'invoice_number', 'company_id', 'invoice_date', 'total_amount']);

        return response()->json($invoices->map(fn ($invoice) => [
            'id' => $invoice->id,
            'invoice_number' => $invoice->invoice_number,
            'supplier' => $invoice->company?->name,
            'invoice_date' => $invoice->invoice_date->toDateString(),
            'total_amount' => (float) $invoice->total_amount,
        ]));
    }

    /** Purchase-invoice lines with returnable quantities, for the purchase-return form. */
    public function lookupPurchaseReturnable(PurchaseInvoice $purchase)
    {
        abort_unless($purchase->isPosted(), 422, 'Invoice is not posted.');

        $purchase->load(['items.product.company', 'items.batch', 'company:id,name']);

        $returned = PurchaseReturnItem::query()
            ->whereIn('purchase_invoice_item_id', $purchase->items->pluck('id'))
            ->selectRaw('purchase_invoice_item_id, SUM(quantity) as total')
            ->groupBy('purchase_invoice_item_id')
            ->pluck('total', 'purchase_invoice_item_id');

        return response()->json([
            'invoice' => [
                'id' => $purchase->id,
                'invoice_number' => $purchase->invoice_number,
                'supplier' => $purchase->company->name,
                'invoice_date' => $purchase->invoice_date->toDateString(),
            ],
            'lines' => $purchase->items
                ->filter(fn ($item) => $item->batch_id) // only lines with a batch can be returned
                ->map(function ($item) use ($returned) {
                    $alreadyReturned = (float) ($returned[$item->id] ?? 0);
                    // Never offer more than is physically in stock in the batch.
                    $returnable = min(
                        (float) $item->quantity - $alreadyReturned,
                        (float) ($item->batch?->qty_available ?? 0),
                    );

                    return [
                        'purchase_invoice_item_id' => $item->id,
                        'product' => $item->product->name,
                        'company' => $item->product->company?->name,
                        'batch_number' => $item->batch?->batch_number,
                        'batch_id' => $item->batch_id,
                        'purchased_qty' => (float) $item->quantity,
                        'already_returned' => $alreadyReturned,
                        'returnable' => max(0, $returnable),
                        'rate' => (float) $item->purchase_rate,
                    ];
                })->values(),
        ]);
    }
}
