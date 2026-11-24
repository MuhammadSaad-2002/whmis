<?php

namespace App\Http\Controllers;

use App\Exports\ReportExport;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Services\ReportPdfRenderer;
use App\Services\ReportService;
use App\Services\ReportVisualizationService;
use App\Services\SupplierPurchaseValueReport;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Inertia\Inertia;
use Maatwebsite\Excel\Facades\Excel;

class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly ReportVisualizationService $visualizations,
    ) {}

    public function index()
    {
        $catalog = collect(ReportService::catalogFor(auth()->user()))
            ->map(fn ($meta, $key) => $meta + ['key' => $key])
            ->groupBy('category')
            ->map(fn ($group) => $group->values());

        return Inertia::render('reports/index', ['catalog' => $catalog]);
    }

    public function show(Request $request, string $key)
    {
        $catalog = ReportService::catalog();
        abort_unless(isset($catalog[$key]), 404);

        $meta = $catalog[$key];
        abort_unless(! isset($meta['permission']) || $request->user()->can($meta['permission']), 403);
        $filters = $request->only('from', 'to', 'customer_id', 'company_id', 'product_id', 'direction', 'expiry_window', 'order');
        $supplierPurchaseValue = $key === SupplierPurchaseValueReport::KEY;
        if ($supplierPurchaseValue) {
            $filters = $request->validate(['company_id' => 'nullable|integer|exists:companies,id']);
        }
        $data = $this->reports->build($key, $filters);

        if ($request->format === 'xlsx') {
            return Excel::download(
                new ReportExport(
                    $data['columns'], $data['rows'], $data['totals'] ?? [],
                    $data['sections'] ?? [], $data['section_title'] ?? null,
                    $data['context'] ?? null, $data['notes'] ?? [],
                ),
                "{$key}-".now()->format('Y-m-d').'.xlsx',
            );
        }

        if ($request->format === 'pdf') {
            return app(ReportPdfRenderer::class)->render([
                'title' => $meta['title'],
                'filters' => in_array('date_range', $meta['filters'], true) ? $filters : Arr::except($filters, ['from', 'to']),
                'columns' => $data['columns'],
                'rows' => $data['rows'],
                'totals' => $data['totals'] ?? [],
                'groupBy' => $data['group_by'] ?? null,
                'charts' => $this->visualizations->pdfCharts($key, $data),
                'sections' => $data['sections'] ?? [],
                'sectionTitle' => $data['section_title'] ?? null,
                'context' => isset($data['supplier_name']) ? $data['period_label'] : ($data['context'] ?? null),
                'headerLabel' => $data['supplier_name'] ?? null,
                'notes' => $data['notes'] ?? [],
            ], $supplierPurchaseValue ? 'landscape' : null)->stream("{$key}.pdf");
        }

        $today = now();
        $defaultDates = ['from' => $today->copy()->startOfMonth()->toDateString(), 'to' => $today->toDateString()];

        return Inertia::render('reports/show', [
            'report' => [
                'key' => $key,
                'title' => $meta['title'],
                'description' => $meta['description'],
                'filters' => $meta['filters'],
            ],
            'columns' => $data['columns'],
            'rows' => $data['rows'],
            'totals' => $data['totals'] ?? [],
            'chart' => $data['chart'] ?? null,
            'visualization' => $this->visualizations->definition($key),
            'groupBy' => $data['group_by'] ?? null,
            'sections' => $data['sections'] ?? [],
            'sectionTitle' => $data['section_title'] ?? null,
            'context' => $data['context'] ?? null,
            'notes' => $data['notes'] ?? [],
            'filterValues' => $filters + $defaultDates,
            'defaultDates' => $defaultDates,
            'options' => [
                'customers' => in_array('customer', $meta['filters'])
                    ? Customer::active()->orderBy('name')->get(['id', 'name']) : [],
                'suppliers' => in_array('supplier', $meta['filters'])
                    ? ($supplierPurchaseValue ? Company::withTrashed() : Company::active())->orderBy('name')->get(['id', 'name']) : [],
                'products' => in_array('product', $meta['filters'])
                    ? Product::orderBy('name')->get(['id', 'name']) : [],
            ],
        ]);
    }
}
