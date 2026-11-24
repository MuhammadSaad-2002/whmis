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
use Illuminate\Validation\Rule;
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
        $sorts = ['product' => 'products.name', 'available' => 'stock', 'reserved' => 'reserved',
            'reorder' => 'products.reorder_level', 'value' => 'stock_value'];
        $filters = $request->validate([
            'search' => 'nullable|string|max:120', 'company_id' => 'nullable|integer|min:1',
            'sort' => ['nullable', Rule::in(['supplier', ...array_keys($sorts)])],
            'direction' => 'nullable|in:asc,desc', 'per_page' => 'nullable|in:10,20,25,50',
        ]);
        $lowOnly = $request->boolean('low_stock');
        $lowStock = 'products.reorder_level > 0 AND COALESCE(balances.stock, 0) <= products.reorder_level';
        $balances = Batch::query()->select('product_id')->selectRaw('SUM(qty_available) as stock, SUM(qty_reserved) as reserved,
            SUM(qty_available * effective_cost) as stock_value')->groupBy('product_id');
        $base = Product::query()->leftJoinSub($balances, 'balances', 'balances.product_id', '=', 'products.id')
            ->with('company:id,name')
            ->select('products.*', 'balances.stock', 'balances.reserved')
            ->selectRaw("COALESCE(balances.stock_value, 0) AS stock_value, CASE WHEN {$lowStock} THEN 1 ELSE 0 END AS is_low_stock")
            ->when(($filters['search'] ?? '') !== '', function ($q) use ($filters) {
                $search = $filters['search'];
                $q->where(fn ($w) => $w
                    ->where('products.name', 'like', "%{$search}%")
                    ->orWhere('products.generic_name', 'like', "%{$search}%"));
            })
            ->when($filters['company_id'] ?? null, fn ($q, $id) => $q->where('products.company_id', $id));
        $query = (clone $base)->when($lowOnly, fn ($q) => $q->whereRaw($lowStock));
        $sort = ($filters['sort'] ?? null) === 'supplier'
            ? Company::query()->select('name')->whereColumn('companies.id', 'products.company_id')
            : $sorts[$filters['sort'] ?? 'product'];

        return Inertia::render('inventory/index', [
            'products' => fn () => (clone $query)->orderBy($sort, $filters['direction'] ?? 'asc')->orderBy('products.id')
                ->paginate((int) ($filters['per_page'] ?? 20))->withQueryString(),
            'companies' => fn () => Company::active()->orderBy('name')->get(['id', 'name']),
            'filters' => array_replace($filters, ['low_stock' => $lowOnly]),
            'totals' => fn () => [
                'inventory_value' => (float) Batch::selectRaw('COALESCE(SUM(qty_available * effective_cost), 0) as v')->value('v'),
            ],
            'summary' => function () use ($base, $lowStock, $lowOnly) {
                $matched = $lowOnly ? $lowStock : '1 = 1';
                $summary = (clone $base)->toBase()->select([])->selectRaw("COUNT(*) AS all_count,
                    SUM(CASE WHEN {$lowStock} THEN 1 ELSE 0 END) AS low_count,
                    SUM(CASE WHEN {$matched} THEN COALESCE(balances.stock, 0) ELSE 0 END) AS available,
                    SUM(CASE WHEN {$matched} THEN COALESCE(balances.reserved, 0) ELSE 0 END) AS reserved,
                    SUM(CASE WHEN {$matched} THEN COALESCE(balances.stock_value, 0) ELSE 0 END) AS stock_value")->first();

                return ['all' => (int) $summary->all_count, 'low' => (int) $summary->low_count,
                    'available' => (float) $summary->available, 'reserved' => (float) $summary->reserved, 'stock_value' => (float) $summary->stock_value];
            },
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
