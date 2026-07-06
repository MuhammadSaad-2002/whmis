<?php

namespace App\Http\Controllers;

use App\Exports\ReportExport;
use App\Models\Company;
use App\Models\Customer;
use App\Services\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Maatwebsite\Excel\Facades\Excel;

class ReportController extends Controller
{
    public function __construct(private readonly ReportService $reports) {}

    public function index()
    {
        $catalog = collect(ReportService::catalog())
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
        $filters = $request->only('from', 'to', 'customer_id', 'company_id', 'expiry_window', 'order');
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
                'filters' => $filters,
                'columns' => $data['columns'],
                'rows' => $data['rows'],
                'totals' => $data['totals'] ?? [],
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
            'filterValues' => $filters + [
                'from' => $filters['from'] ?? now()->startOfMonth()->toDateString(),
                'to' => $filters['to'] ?? now()->toDateString(),
            ],
            'options' => [
                'customers' => in_array('customer', $meta['filters'])
                    ? Customer::active()->orderBy('name')->get(['id', 'name']) : [],
                'suppliers' => in_array('supplier', $meta['filters'])
                    ? Company::active()->orderBy('name')->get(['id', 'name']) : [],
            ],
        ]);
    }
}
