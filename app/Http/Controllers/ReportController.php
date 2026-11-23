<?php

namespace App\Http\Controllers;

use App\Exports\ReportExport;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Services\ReportService;
use App\Services\ReportVisualizationService;
use Barryvdh\DomPDF\Facade\Pdf;
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
        $catalog = collect(ReportService::catalog())
            ->filter(fn ($meta) => ! isset($meta['permission']) || auth()->user()->can($meta['permission']))
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
        $data = $this->reports->build($key, $filters);

        if ($request->format === 'xlsx') {
            return Excel::download(
                new ReportExport($data['columns'], $data['rows'], $data['totals'] ?? []),
                "{$key}-".now()->format('Y-m-d').'.xlsx',
            );
        }

        if ($request->format === 'pdf') {
            return Pdf::loadView('pdf.report', [
                'title' => $meta['title'],
                'filters' => in_array('date_range', $meta['filters'], true) ? $filters : Arr::except($filters, ['from', 'to']),
                'columns' => $data['columns'],
                'rows' => $data['rows'],
                'totals' => $data['totals'] ?? [],
                'groupBy' => $data['group_by'] ?? null,
                'charts' => $this->visualizations->pdfCharts($key, $data),
            ])->setPaper('a4', count($data['columns']) > 6 ? 'landscape' : 'portrait')
                ->stream("{$key}.pdf");
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
            'visualization' => $this->visualizations->definition($key),
            'groupBy' => $data['group_by'] ?? null,
            'filterValues' => $filters + [
                'from' => $filters['from'] ?? now()->startOfMonth()->toDateString(),
                'to' => $filters['to'] ?? now()->toDateString(),
            ],
            'options' => [
                'customers' => in_array('customer', $meta['filters'])
                    ? Customer::active()->orderBy('name')->get(['id', 'name']) : [],
                'suppliers' => in_array('supplier', $meta['filters'])
                    ? Company::active()->orderBy('name')->get(['id', 'name']) : [],
                'products' => in_array('product', $meta['filters'])
                    ? Product::orderBy('name')->get(['id', 'name']) : [],
            ],
        ]);
    }
}
