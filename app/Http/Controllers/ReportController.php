<?php

namespace App\Http\Controllers;

use App\Exports\ReportExport;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Services\CustomerReceiptReport;
use App\Services\ReportChartData;
use App\Services\ReportPdfRenderer;
use App\Services\ReportService;
use App\Services\ReportVisualizationService;
use App\Services\SupplierPurchaseValueReport;
use App\Support\ReportTotals;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Inertia\Inertia;
use Maatwebsite\Excel\Facades\Excel;

class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly ReportVisualizationService $visualizations,
        private readonly ReportChartData $chartData,
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
        if ($key === CustomerReceiptReport::KEY) {
            $filters = $request->validate([
                'from' => 'nullable|date_format:Y-m-d',
                'to' => ['nullable', 'date_format:Y-m-d', ...($request->filled('from') ? ['after_or_equal:from'] : [])],
                'customer_id' => 'nullable|integer|exists:customers,id',
            ]);
        }
        $data = $this->reports->build($key, $filters);
        if ($request->format !== 'pdf') {
            $data = ReportTotals::roundMoney($data);
        }

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

        $today = now('Asia/Karachi');
        $defaultDates = ['from' => $today->copy()->startOfMonth()->toDateString(), 'to' => $today->toDateString()];
        $hasDates = in_array('date_range', $meta['filters'], true);
        $appliedFilters = Arr::except($filters, ['from', 'to']);
        if ($hasDates) {
            foreach ($defaultDates as $field => $default) {
                $appliedFilters[$field] = ($filters[$field] ?? null) ?: $default;
            }
        }

        if ($request->format === 'pdf') {
            $chartPreferences = $request->validate([
                'chart_metric' => 'nullable|string|max:40',
                'chart_order' => 'nullable|in:asc,desc',
                'chart_limit' => 'nullable|in:5,10',
                'chart_view' => 'nullable|string|max:48',
            ]);
            $chartView = $chartPreferences['chart_view'] ?? null;
            $charts = $this->visualizations->pdfCharts(
                $key, $data, $chartPreferences['chart_metric'] ?? null,
                $chartPreferences['chart_order'] ?? 'desc', (int) ($chartPreferences['chart_limit'] ?? 10),
            );
            if ($chartView !== null || $charts === []) {
                $views = $this->chartData->build($key, $data);
                $selected = collect($views)->firstWhere('id', $chartView) ?? ($charts === [] ? ($views[0] ?? null) : null);
                if ($selected !== null) {
                    $charts = [$this->visualizations->printView($selected)];
                }
            }
            $scopes = array_filter([
                isset($filters['company_id']) && ! $supplierPurchaseValue && in_array('supplier', $meta['filters'], true)
                    ? Company::withTrashed()->find($filters['company_id'])?->name : null,
                isset($filters['customer_id']) && in_array('customer', $meta['filters'], true)
                    ? Customer::withTrashed()->find($filters['customer_id'])?->name : null,
                isset($filters['product_id']) && in_array('product', $meta['filters'], true)
                    ? Product::find($filters['product_id'])?->name : null,
            ]);

            return app(ReportPdfRenderer::class)->render([
                'title' => $meta['title'],
                'filters' => $appliedFilters,
                'columns' => $data['columns'],
                'rows' => $data['rows'],
                'totals' => $data['totals'] ?? [],
                'groupBy' => $data['group_by'] ?? null,
                'charts' => $charts,
                'separateChartPage' => true,
                'readable' => true,
                'sections' => $data['sections'] ?? [],
                'sectionTitle' => $data['section_title'] ?? null,
                'context' => isset($data['supplier_name']) ? $data['period_label'] : ($data['context'] ?? null),
                'headerLabel' => $data['supplier_name'] ?? implode(' · ', $scopes),
                'notes' => $data['notes'] ?? [],
            ], $supplierPurchaseValue ? 'landscape' : null)->stream("{$key}.pdf");
        }

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
            'chartViews' => fn () => $this->chartData->build($key, $data),
            'chartColors' => ReportChartData::COLORS,
            'visualization' => $this->visualizations->definition($key),
            'groupBy' => $data['group_by'] ?? null,
            'sections' => $data['sections'] ?? [],
            'sectionTitle' => $data['section_title'] ?? null,
            'context' => $data['context'] ?? null,
            'notes' => $data['notes'] ?? [],
            'filterValues' => $appliedFilters,
            'defaultDates' => $defaultDates,
            'options' => fn () => [
                'customers' => in_array('customer', $meta['filters'])
                    ? ($key === CustomerReceiptReport::KEY ? Customer::withTrashed() : Customer::active())->orderBy('name')->get(['id', 'name']) : [],
                'suppliers' => in_array('supplier', $meta['filters'])
                    ? ($supplierPurchaseValue ? Company::withTrashed() : Company::active())->orderBy('name')->get(['id', 'name']) : [],
                'products' => in_array('product', $meta['filters'])
                    ? Product::orderBy('name')->get(['id', 'name']) : [],
            ],
        ]);
    }
}
