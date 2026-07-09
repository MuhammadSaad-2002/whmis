<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\PaymentAllocation;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\Warehouse;
use App\Services\IncentiveEngine;
use Illuminate\Http\Request;

/**
 * JSON lookups used by the keyboard grid (F2 product search) and forms.
 */
class LookupController extends Controller
{
    public function products(Request $request)
    {
        $warehouseId = (int) ($request->warehouse_id ?: Warehouse::default()->id);
        $query = trim((string) $request->q);

        $products = Product::query()
            ->active()
            ->with('company:id,name')
            ->withSum(
                ['batches as stock' => fn ($q) => $q->where('warehouse_id', $warehouseId)],
                'qty_available',
            )
            ->when($query, function ($q) use ($query) {
                $q->where(fn ($w) => $w
                    ->where('name', 'like', "%{$query}%")
                    ->orWhere('generic_name', 'like', "%{$query}%")
                    ->orWhere('barcode', $query)
                    ->orWhere('sku', $query));
            })
            ->when($request->company_id, fn ($q, $id) => $q->where('company_id', $id))
            ->orderBy('name')
            ->limit(20)
            ->get();

        return response()->json($products->map(fn (Product $product) => [
            'id' => $product->id,
            'name' => $product->name,
            'generic_name' => $product->generic_name,
            'company' => $product->company?->name,
            'pack_size' => $product->pack_size,
            'purchase_price' => (float) $product->purchase_price,
            'trade_price' => (float) $product->trade_price,
            'retail_price' => (float) $product->retail_price,
            'tax_percent' => (float) $product->tax_percent,
            'default_discount_percent' => (float) $product->default_discount_percent,
            'stock' => (float) ($product->stock ?? 0),
        ]));
    }

    public function batches(Request $request, Product $product)
    {
        $warehouseId = (int) ($request->warehouse_id ?: Warehouse::default()->id);

        $batches = $product->batches()
            ->where('warehouse_id', $warehouseId)
            ->inStock()
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC')
            ->orderBy('id')
            ->get();

        return response()->json($batches->map(fn ($batch) => [
            'id' => $batch->id,
            'batch_number' => $batch->batch_number,
            'expiry_date' => $batch->expiry_date?->toDateString(),
            'qty_available' => (float) $batch->qty_available,
            'trade_price' => (float) $batch->trade_price,
            'retail_price' => (float) $batch->retail_price,
        ]));
    }

    /**
     * Every batch of a product (incl. out-of-stock), most-recently received
     * first — powers the purchase restock dropdown and latest-price prefill.
     */
    public function allBatches(Request $request, Product $product)
    {
        $warehouseId = (int) ($request->warehouse_id ?: Warehouse::default()->id);

        $batches = $product->batches()
            ->where('warehouse_id', $warehouseId)
            ->orderByDesc('id')
            ->get();

        return response()->json($batches->map(fn ($batch) => [
            'id' => $batch->id,
            'batch_number' => $batch->batch_number,
            'expiry_date' => $batch->expiry_date?->toDateString(),
            'qty_available' => (float) $batch->qty_available,
            'purchase_rate' => (float) $batch->purchase_rate,
            'trade_price' => (float) $batch->trade_price,
            'retail_price' => (float) $batch->retail_price,
        ]));
    }

    /**
     * Applicable incentive rules for a grid line — powers the F4 picker.
     */
    public function rules(Request $request, IncentiveEngine $engine)
    {
        $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'qty' => ['nullable', 'numeric', 'min:0'],
        ]);

        $qty = (float) ($request->qty ?: 0);
        $price = (float) ($request->price ?: 0);

        $rules = $engine->applicable(
            (int) $request->product_id,
            $request->customer_id ? (int) $request->customer_id : null,
            $qty,
        );

        return response()->json($rules->map(fn (IncentiveRule $rule) => [
            'id' => $rule->id,
            'name' => $rule->name,
            'rule_type' => $rule->rule_type,
            'summary' => $rule->summary(),
            'scope' => implode(' · ', array_filter([
                $rule->customer_id ? 'This customer' : null,
                $rule->product_id ? 'This product' : null,
                $rule->company_id ? 'Company-wide' : null,
            ])) ?: 'All customers & products',
            // Rule parameters so the client can recompute the bonus live as qty changes.
            'base_qty' => (float) $rule->base_qty,
            'bonus_qty' => (float) $rule->bonus_qty,
            'slabs' => $rule->slabs ?? [],
            'value' => (float) $rule->value,
            'effect' => $engine->effect($rule, $qty, $price),
        ])->values());
    }

    /**
     * Posted, not-fully-allocated invoices for a party — used when
     * allocating a receipt/payment.
     */
    public function openInvoices(Request $request)
    {
        $request->validate([
            'party_type' => ['required', 'in:customer,company'],
            'party_id' => ['required', 'integer'],
        ]);

        if ($request->party_type === 'customer') {
            Customer::findOrFail($request->party_id);
            $invoices = SalesInvoice::where('customer_id', $request->party_id)
                ->where('status', 'posted')
                ->orderBy('invoice_date')
                ->get(['id', 'invoice_number', 'invoice_date', 'total_amount']);
            $morph = 'sales_invoice';
        } else {
            Company::findOrFail($request->party_id);
            $invoices = PurchaseInvoice::where('company_id', $request->party_id)
                ->where('status', 'posted')
                ->orderBy('invoice_date')
                ->get(['id', 'invoice_number', 'invoice_date', 'total_amount']);
            $morph = 'purchase_invoice';
        }

        $allocated = PaymentAllocation::where('invoice_type', $morph)
            ->whereIn('invoice_id', $invoices->pluck('id'))
            ->whereHas('payment', fn ($q) => $q->where('status', 'completed'))
            ->selectRaw('invoice_id, SUM(amount) as total')
            ->groupBy('invoice_id')
            ->pluck('total', 'invoice_id');

        return response()->json(
            $invoices
                ->map(fn ($invoice) => [
                    'id' => $invoice->id,
                    'invoice_type' => $morph,
                    'invoice_number' => $invoice->invoice_number,
                    'invoice_date' => $invoice->invoice_date->toDateString(),
                    'total_amount' => (float) $invoice->total_amount,
                    'outstanding' => round((float) $invoice->total_amount - (float) ($allocated[$invoice->id] ?? 0), 2),
                ])
                ->filter(fn ($row) => $row['outstanding'] > 0)
                ->values(),
        );
    }
}
