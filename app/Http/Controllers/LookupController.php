<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Models\Warehouse;
use App\Services\IncentiveEngine;
use App\Services\LedgerService;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * JSON lookups used by the keyboard grid (F2 product search) and forms.
 */
class LookupController extends Controller
{
    public function products(Request $request)
    {
        $warehouseId = (int) ($request->warehouse_id ?: Warehouse::default()->id);
        $query = trim((string) $request->q);
        $showSupplier = $request->user()->canViewSupplierDetails();

        $products = Product::query()
            ->visibleTo($request->user())
            ->active()
            ->when($showSupplier, fn ($q) => $q->with('company:id,name'))
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
            ->when($showSupplier && $request->company_id, fn ($q) => $q->where('company_id', $request->company_id))
            ->orderBy('name')
            ->limit(20)
            ->get();

        // Purchase price (cost) is hidden from roles without products.view_cost
        // (e.g. Bookers) — the key is simply omitted from the payload.
        $showCost = $showSupplier && $request->user()->can('products.view_cost');

        return response()->json($products->map(function (Product $product) use ($showCost, $showSupplier) {
            $row = [
                'id' => $product->id,
                'name' => $product->name,
                'generic_name' => $product->generic_name,
                'pack_size' => $product->pack_size,
                'trade_price' => (float) $product->trade_price,
                'retail_price' => (float) $product->retail_price,
                'tax_percent' => (float) $product->tax_percent,
                'default_discount_percent' => (float) $product->default_discount_percent,
                'stock' => (float) ($product->stock ?? 0),
            ];

            if ($showSupplier) {
                $row['company'] = $product->company?->name;
            }
            if ($showCost) {
                $row['purchase_price'] = (float) $product->purchase_price;
            }

            return $row;
        }));
    }

    public function batches(Request $request, Product $product)
    {
        abort_unless($product->isVisibleTo($request->user()), 404);

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
            'product_id' => ['required', Rule::exists('products', 'id')
                ->when($request->user()->isFieldBooker(), fn ($rule) => $rule->where('visible_to_bookers', true)->withoutTrashed())],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'qty' => ['nullable', 'numeric', 'min:0'],
            'date' => ['nullable', 'date'],
        ]);

        $qty = (float) ($request->qty ?: 0);
        $price = (float) ($request->price ?: 0);
        $date = $request->date ? Carbon::parse($request->date) : null;
        $showSupplier = $request->user()->canViewSupplierDetails();

        $rules = $engine->available(
            (int) $request->product_id,
            $request->customer_id ? (int) $request->customer_id : null,
            $date,
        );

        return response()->json($rules->map(function (IncentiveRule $rule) use ($engine, $qty, $price, $showSupplier) {
            $eligible = $engine->meetsMinimumQuantity($rule, $qty);
            $minQty = $rule->min_qty !== null ? (float) $rule->min_qty : null;

            return [
                'id' => $rule->id,
                'name' => $rule->name,
                'rule_type' => $rule->rule_type,
                'summary' => $rule->summary(),
                'scope' => implode(' · ', array_filter([
                    $rule->customer_id ? 'This customer' : null,
                    $rule->product_id ? 'This product' : null,
                    $showSupplier && $rule->company_id ? 'Company-wide' : null,
                ])) ?: ($showSupplier ? 'All customers & products' : 'Available offer'),
                // Rule parameters so the client can recompute the bonus live as qty changes.
                'base_qty' => (float) $rule->base_qty,
                'bonus_qty' => (float) $rule->bonus_qty,
                'slabs' => $rule->slabs ?? [],
                'value' => (float) $rule->value,
                'min_qty' => $minQty,
                'eligible' => $eligible,
                'eligibility_label' => $eligible || $minQty === null ? null : 'Minimum qty '.$this->formatQty($minQty),
                'effect' => $eligible ? $engine->effect($rule, $qty, $price) : [],
            ];
        })->values());
    }

    private function formatQty(float $qty): string
    {
        return rtrim(rtrim(number_format($qty, 2), '0'), '.');
    }

    /**
     * Posted, not-fully-allocated invoices for a party — used when
     * allocating a receipt/payment.
     */
    public function openInvoices(Request $request, PaymentService $payments, LedgerService $ledger)
    {
        $request->validate([
            'party_type' => ['required', 'in:customer,company'],
            'party_id' => ['required', 'integer'],
        ]);

        abort_unless(
            $request->user()->canViewSupplierDetails()
            && ($request->user()->can('payments.view') || $request->user()->can('ledger.view')),
            403
        );

        $party = $request->party_type === 'customer'
            ? Customer::findOrFail($request->party_id)
            : Company::findOrFail($request->party_id);

        $invoices = $payments->openInvoices($party);

        return response()->json($request->boolean('with_balance') ? [
            'invoices' => $invoices,
            'balance' => $ledger->outstanding($party),
        ] : $invoices)->header('Cache-Control', 'private, no-store');
    }
}
