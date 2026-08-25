<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Product;
use App\Models\StockLoan;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\NumberSeriesService;
use App\Services\StockLoanPostingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use RuntimeException;

class StockLoanController extends Controller
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly StockLoanPostingService $posting,
    ) {}

    public function index(Request $request, string $direction)
    {
        abort_unless(in_array($direction, ['in', 'out'], true), 404);

        $loans = StockLoan::query()
            ->where('direction', $direction)
            ->with([
                'company:id,name',
                'requestedBy:id,name', 'receivedBy:id,name',
                'requestReceivedBy:id,name', 'handedOverBy:id,name',
            ])
            ->when($request->search, fn ($q, $search) => $q->where('loan_number', 'like', "%{$search}%"))
            ->when($request->company_id, fn ($q, $id) => $q->where('company_id', $id))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->user_id, fn ($q, $id) => $q->where(fn ($w) => $w
                ->where('requested_by_id', $id)->orWhere('received_by_id', $id)
                ->orWhere('request_received_by_id', $id)->orWhere('handed_over_by_id', $id)))
            ->when($request->product_id, fn ($q, $id) => $q->whereHas('items', fn ($i) => $i->where('product_id', $id)))
            ->when($request->from, fn ($q, $from) => $q->whereDate('loan_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('loan_date', '<=', $to))
            ->withCount('items')
            ->latest('loan_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        // Outstanding = posted, not-yet-fully-returned units.
        $scope = StockLoan::where('direction', $direction);
        $summary = [
            'loaned' => (float) (clone $scope)->sum('total_quantity'),
            'returned' => (float) (clone $scope)->sum('returned_quantity'),
            'outstanding' => (float) (clone $scope)
                ->whereIn('status', [StockLoan::STATUS_LOANED, StockLoan::STATUS_PARTIALLY_RETURNED])
                ->get()->sum(fn ($l) => $l->outstandingQuantity()),
        ];

        return Inertia::render('loans/index', [
            'direction' => $direction,
            'loans' => $loans,
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'users' => $this->userOptions(),
            'summary' => $summary,
            'filters' => $request->only('search', 'company_id', 'status', 'user_id', 'product_id', 'from', 'to'),
        ]);
    }

    public function create(string $direction)
    {
        abort_unless(in_array($direction, ['in', 'out'], true), 404);

        return Inertia::render('loans/form', [
            'direction' => $direction,
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'users' => $this->userOptions(),
            'warehouse' => Warehouse::default()->only(['id', 'name']),
            'loan' => null,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        if ($name = $this->duplicateProductName($data['items'])) {
            return back()->with('error', "{$name} appears on more than one line — combine it into a single line.");
        }

        try {
            $loan = DB::transaction(function () use ($request, $data) {
                $manual = ! empty($data['loan_number']);
                $series = $data['direction'] === StockLoan::DIRECTION_IN ? 'loan_in' : 'loan_out';

                $loan = StockLoan::create($this->headerAttributes($data) + [
                    'loan_number' => $manual ? $data['loan_number'] : $this->numbers->next($series),
                    'manual_number' => $manual,
                    'status' => StockLoan::STATUS_PENDING,
                    'created_by' => $request->user()->id,
                ]);
                $this->syncItems($loan, $data['items']);

                return $loan;
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('loans.edit', $loan)
            ->with('success', "Draft {$loan->loan_number} saved.");
    }

    public function edit(StockLoan $loan)
    {
        $loan->load(['items.product:id,name,generic_name', 'company:id,name']);

        return Inertia::render('loans/form', [
            'direction' => $loan->direction,
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'users' => $this->userOptions(),
            'warehouse' => $loan->warehouse->only(['id', 'name']),
            'loan' => $loan,
        ]);
    }

    public function update(Request $request, StockLoan $loan)
    {
        if (! $loan->isEditable()) {
            return back()->with('error', 'Only pending stock loans can be edited.');
        }

        $data = $this->validated($request, $loan);

        if ($name = $this->duplicateProductName($data['items'])) {
            return back()->with('error', "{$name} appears on more than one line — combine it into a single line.");
        }

        try {
            DB::transaction(function () use ($loan, $data) {
                if (! empty($data['loan_number']) && $data['loan_number'] !== $loan->loan_number) {
                    $loan->loan_number = $data['loan_number'];
                    $loan->manual_number = true;
                }
                // direction is fixed once created; never re-key it from the payload.
                $loan->fill(collect($this->headerAttributes($data))->except('direction')->all())->save();
                $loan->items()->delete();
                $this->syncItems($loan, $data['items']);
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Draft updated.');
    }

    public function post(StockLoan $loan)
    {
        try {
            $this->posting->post($loan);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($loan, 'posted', ['loan_number' => $loan->loan_number]);

        return back()->with('success', "Stock loan {$loan->loan_number} posted.");
    }

    public function recordReturn(Request $request, StockLoan $loan)
    {
        $data = $request->validate([
            'returns' => ['required', 'array', 'min:1'],
            'returns.*.item_id' => ['required', 'integer'],
            'returns.*.quantity' => ['required', 'numeric', 'min:0'],
        ]);

        $itemIds = $loan->items()->pluck('id')->all();
        $lineReturns = [];
        foreach ($data['returns'] as $row) {
            if (in_array((int) $row['item_id'], $itemIds, true)) {
                $lineReturns[(int) $row['item_id']] = (float) $row['quantity'];
            }
        }

        try {
            $this->posting->recordReturn($loan, $lineReturns);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($loan, 'returned', ['loan_number' => $loan->loan_number]);

        return back()->with('success', "Return recorded for {$loan->loan_number}.");
    }

    public function cancel(StockLoan $loan)
    {
        try {
            $this->posting->cancel($loan);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($loan, 'cancelled', ['loan_number' => $loan->loan_number]);

        return back()->with('success', "Stock loan {$loan->loan_number} cancelled.");
    }

    public function close(StockLoan $loan)
    {
        try {
            $this->posting->close($loan);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($loan, 'closed', ['loan_number' => $loan->loan_number]);

        return back()->with('success', "Stock loan {$loan->loan_number} closed.");
    }

    public function destroy(StockLoan $loan)
    {
        if (! $loan->isEditable()) {
            return back()->with('error', 'Only pending stock loans can be deleted.');
        }

        $loan->delete();

        return redirect()
            ->route('loans.index', $loan->direction)
            ->with('success', 'Draft deleted.');
    }

    /** All active users — the picklist for every people field. */
    private function userOptions()
    {
        return User::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']);
    }

    private function validated(Request $request, ?StockLoan $existing = null): array
    {
        $direction = $existing?->direction ?? $request->input('direction');
        $isOut = $direction === StockLoan::DIRECTION_OUT;

        return $request->validate([
            'loan_number' => [
                'nullable', 'string', 'max:50',
                Rule::unique('stock_loans', 'loan_number')->ignore($existing?->id),
            ],
            'direction' => ['required', Rule::in([StockLoan::DIRECTION_IN, StockLoan::DIRECTION_OUT])],
            'company_id' => ['required', 'exists:companies,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'loan_date' => ['required', 'date'],
            'requested_by_id' => ['nullable', 'exists:users,id'],
            'received_by_id' => ['nullable', 'exists:users,id'],
            // Only Loan Stock Out captures who received the request / handed the stock over.
            'request_received_by_id' => [Rule::requiredIf($isOut), 'nullable', 'exists:users,id'],
            'handed_over_by_id' => [Rule::requiredIf($isOut), 'nullable', 'exists:users,id'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.batch_number' => ['nullable', 'string', 'max:100'],
            'items.*.expiry_date' => ['nullable', 'date'],
            'items.*.quantity' => ['required', 'numeric', 'min:1'],
            'items.*.remarks' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function headerAttributes(array $data): array
    {
        return collect($data)->only([
            'direction', 'company_id', 'warehouse_id', 'loan_date', 'notes',
            'requested_by_id', 'received_by_id', 'request_received_by_id', 'handed_over_by_id',
        ])->map(fn ($v) => $v === '' ? null : $v)->all();
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

    private function syncItems(StockLoan $loan, array $items): void
    {
        $totalQty = 0.0;

        foreach (array_values($items) as $index => $item) {
            $loan->items()->create([
                'product_id' => $item['product_id'],
                'batch_number' => $item['batch_number'] ?? null,
                'expiry_date' => $item['expiry_date'] ?? null,
                'quantity' => $item['quantity'],
                'remarks' => $item['remarks'] ?? null,
                'sort_order' => $index,
            ]);

            $totalQty += (float) $item['quantity'];
        }

        $loan->update(['total_quantity' => round($totalQty, 2)]);
    }
}
