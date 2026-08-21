<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\SampleIssue;
use App\Models\Warehouse;
use App\Services\NumberSeriesService;
use App\Services\SamplePostingService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use RuntimeException;

class SampleIssueController extends Controller
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly SamplePostingService $posting,
    ) {}

    public function index(Request $request)
    {
        $issues = SampleIssue::query()
            ->with('customer:id,name,city')
            ->when($request->search, fn ($q, $search) => $q->where('issue_number', 'like', "%{$search}%"))
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->from, fn ($q, $from) => $q->whereDate('issue_date', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('issue_date', '<=', $to))
            ->latest('issue_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('samples/issues/index', [
            'issues' => $issues,
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'customer_id', 'status', 'from', 'to'),
        ]);
    }

    public function create()
    {
        return Inertia::render('samples/issues/form', [
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name', 'city']),
            'warehouse' => Warehouse::default()->only(['id', 'name']),
            'issue' => null,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        try {
            $issue = DB::transaction(function () use ($data) {
                $manual = ! empty($data['issue_number']);

                $issue = SampleIssue::create($this->headerAttributes($data) + [
                    'issue_number' => $manual ? $data['issue_number'] : $this->numbers->next('sample_issue'),
                    'manual_number' => $manual,
                    'created_by' => $data['user_id'],
                ]);
                $this->syncItems($issue, $data['items']);

                return $issue;
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('samples.issues.edit', $issue)
            ->with('success', "Draft {$issue->issue_number} saved.");
    }

    public function edit(SampleIssue $issue)
    {
        $issue->load([
            'items.product:id,name,generic_name',
            'items.batch:id,batch_number,expiry_date,is_sample',
            'customer:id,name,city',
        ]);

        return Inertia::render('samples/issues/form', [
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name', 'city']),
            'warehouse' => $issue->warehouse->only(['id', 'name']),
            'issue' => $issue,
        ]);
    }

    public function update(Request $request, SampleIssue $issue)
    {
        if (! $issue->isDraft()) {
            return back()->with('error', 'Only draft sample issues can be edited.');
        }

        $data = $this->validated($request, $issue);

        try {
            DB::transaction(function () use ($issue, $data) {
                if (! empty($data['issue_number']) && $data['issue_number'] !== $issue->issue_number) {
                    $issue->issue_number = $data['issue_number'];
                    $issue->manual_number = true;
                }
                $issue->fill($this->headerAttributes($data))->save();
                $issue->items()->delete();
                $this->syncItems($issue, $data['items']);
            });
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Draft updated.');
    }

    public function post(SampleIssue $issue)
    {
        try {
            $this->posting->postIssue($issue);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($issue, 'posted', ['issue_number' => $issue->issue_number]);

        return back()->with('success', "Sample issue {$issue->issue_number} posted. Samples dispatched.");
    }

    public function cancel(SampleIssue $issue)
    {
        try {
            $this->posting->cancelIssue($issue);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        \App\Support\AuditLogger::action($issue, 'cancelled', ['issue_number' => $issue->issue_number]);

        return back()->with('success', "Sample issue {$issue->issue_number} cancelled.");
    }

    public function destroy(SampleIssue $issue)
    {
        if (! $issue->isDraft()) {
            return back()->with('error', 'Only draft sample issues can be deleted.');
        }

        $issue->delete();

        return redirect()->route('samples.issues.index')->with('success', 'Draft deleted.');
    }

    public function print(SampleIssue $issue)
    {
        $issue->load(['items.product', 'items.batch', 'customer', 'warehouse']);

        return Pdf::loadView('pdf.sample-issue', ['issue' => $issue])
            ->setPaper('a4')
            ->stream("{$issue->issue_number}.pdf");
    }

    private function validated(Request $request, ?SampleIssue $existing = null): array
    {
        return $request->validate([
            'issue_number' => [
                'nullable', 'string', 'max:50',
                Rule::unique('sample_issues', 'issue_number')->ignore($existing?->id),
            ],
            'customer_id' => ['required', 'exists:customers,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'issue_date' => ['required', 'date'],
            'recipient_name' => ['nullable', 'string', 'max:150'],
            'representative_name' => ['nullable', 'string', 'max:150'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.batch_id' => ['nullable', 'integer', 'exists:batches,id'],
            'items.*.quantity' => ['required', 'numeric', 'min:1'],
            'items.*.remarks' => ['nullable', 'string', 'max:255'],
        ]) + ['user_id' => $request->user()->id];
    }

    private function headerAttributes(array $data): array
    {
        return collect($data)->only([
            'customer_id', 'warehouse_id', 'issue_date',
            'recipient_name', 'representative_name', 'notes',
        ])->map(fn ($v) => $v ?? null)->all();
    }

    private function syncItems(SampleIssue $issue, array $items): void
    {
        $totalQty = 0.0;

        foreach (array_values($items) as $index => $item) {
            $issue->items()->create([
                'product_id' => $item['product_id'],
                'batch_id' => $item['batch_id'] ?? null,
                'quantity' => $item['quantity'],
                'remarks' => $item['remarks'] ?? null,
                'sort_order' => $index,
            ]);

            $totalQty += (float) $item['quantity'];
        }

        $issue->update(['total_quantity' => round($totalQty, 2)]);
    }
}
