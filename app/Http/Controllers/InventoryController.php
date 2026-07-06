<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\Warehouse;
use App\Services\InventoryService;
use App\Services\NumberSeriesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use RuntimeException;

class InventoryController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly NumberSeriesService $numbers,
    ) {}

    /** Product-wise stock position with value at effective cost. */
    public function index(Request $request)
    {
        $products = Product::query()
            ->with('company:id,name')
            ->withSum('batches as stock', 'qty_available')
            ->withSum('batches as reserved', 'qty_reserved')
            ->addSelect([
                'stock_value' => Batch::selectRaw('COALESCE(SUM(qty_available * effective_cost), 0)')
                    ->whereColumn('batches.product_id', 'products.id'),
            ])
            ->when($request->search, function ($q, $search) {
                $q->where(fn ($w) => $w
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('generic_name', 'like', "%{$search}%"));
            })
            ->when($request->company_id, fn ($q, $id) => $q->where('company_id', $id))
            ->when($request->boolean('low_stock'), function ($q) {
                $q->havingRaw('COALESCE(stock, 0) <= reorder_level')->where('reorder_level', '>', 0);
            })
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('inventory/index', [
            'products' => $products,
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'company_id', 'low_stock'),
            'totals' => [
                'inventory_value' => (float) Batch::selectRaw('COALESCE(SUM(qty_available * effective_cost), 0) as v')->value('v'),
            ],
        ]);
    }

    /** Batch-wise view with expiry filters. */
    public function batches(Request $request)
    {
        $batches = Batch::query()
            ->with(['product:id,name,company_id', 'product.company:id,name', 'warehouse:id,name'])
            ->when($request->search, function ($q, $search) {
                $q->where('batch_number', 'like', "%{$search}%")
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', "%{$search}%"));
            })
            ->when($request->boolean('in_stock', true), fn ($q) => $q->where('qty_available', '>', 0))
            ->when($request->expiry, function ($q, $window) {
                match ($window) {
                    'expired' => $q->whereDate('expiry_date', '<', now()),
                    '30' => $q->whereBetween('expiry_date', [now(), now()->addDays(30)]),
                    '90' => $q->whereBetween('expiry_date', [now(), now()->addDays(90)]),
                    '180' => $q->whereBetween('expiry_date', [now(), now()->addDays(180)]),
                    default => null,
                };
            })
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('inventory/batches', [
            'batches' => $batches,
            'filters' => $request->only('search', 'expiry', 'in_stock'),
        ]);
    }

    /** Movement history for auditing stock. */
    public function movements(Request $request)
    {
        $movements = \App\Models\StockMovement::query()
            ->with(['product:id,name', 'batch:id,batch_number', 'user:id,name'])
            ->when($request->product_id, fn ($q, $id) => $q->where('product_id', $id))
            ->when($request->type, fn ($q, $type) => $q->where('type', $type))
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('inventory/movements', [
            'movements' => $movements,
            'filters' => $request->only('product_id', 'type'),
        ]);
    }

    public function storeAdjustment(Request $request)
    {
        $data = $request->validate([
            'batch_id' => ['required', 'exists:batches,id'],
            'type' => ['required', 'in:increase,decrease,damage,expired,recount'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'adjustment_date' => ['required', 'date'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $batch = Batch::findOrFail($data['batch_id']);
        // decrease/damage/expired remove stock; increase/recount add.
        $signed = in_array($data['type'], ['increase', 'recount'])
            ? (float) $data['quantity']
            : -(float) $data['quantity'];

        try {
            DB::transaction(function () use ($batch, $data, $signed) {
                $adjustment = StockAdjustment::create([
                    'adjustment_number' => $this->numbers->next('stock_adjustment'),
                    'batch_id' => $batch->id,
                    'warehouse_id' => $batch->warehouse_id,
                    'type' => $data['type'],
                    'quantity' => $signed,
                    'adjustment_date' => $data['adjustment_date'],
                    'reason' => $data['reason'] ?? null,
                    'created_by' => auth()->id(),
                ]);

                $movementType = match ($data['type']) {
                    'damage' => 'damage',
                    'expired' => 'expired',
                    default => $signed >= 0 ? 'adjustment_in' : 'adjustment_out',
                };

                $this->inventory->adjust($batch, $signed, $movementType, $adjustment, $data['reason'] ?? null);
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Stock adjusted.');
    }
}
