<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductCategory;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $products = Product::query()
            ->with(['company:id,name', 'category:id,name'])
            ->withSum('batches as stock', 'qty_available')
            ->when($request->search, function ($q, $search) {
                $q->where(fn ($w) => $w
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('generic_name', 'like', "%{$search}%")
                    ->orWhere('barcode', $search)
                    ->orWhere('sku', $search));
            })
            ->when($request->company_id, fn ($q, $id) => $q->where('company_id', $id))
            ->when($request->category_id, fn ($q, $id) => $q->where('category_id', $id))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('products/index', [
            'products' => $products,
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'categories' => ProductCategory::orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'company_id', 'category_id', 'status'),
        ]);
    }

    public function store(Request $request)
    {
        Product::create($this->validated($request));

        return back()->with('success', 'Product created.');
    }

    public function update(Request $request, Product $product)
    {
        $product->update($this->validated($request));

        return back()->with('success', 'Product updated.');
    }

    public function import(Request $request)
    {
        $request->validate(['file' => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:10240']]);

        $import = new \App\Imports\ProductsImport;
        \Maatwebsite\Excel\Facades\Excel::import($import, $request->file('file'));

        $summary = "Import finished: {$import->created} created, {$import->updated} updated.";
        if ($import->errors !== []) {
            $details = collect($import->errors)
                ->map(fn ($message, $row) => "Row {$row}: {$message}")
                ->take(10)
                ->implode(' ');

            return back()->with('error', "{$summary} ".count($import->errors)." rows skipped — {$details}");
        }

        return back()->with('success', $summary);
    }

    public function template()
    {
        return \Maatwebsite\Excel\Facades\Excel::download(
            new \App\Exports\TemplateExport(\App\Imports\ProductsImport::headings()),
            'products-import-template.xlsx',
        );
    }

    public function destroy(Product $product)
    {
        if ($product->batches()->exists()) {
            return back()->with('error', 'Cannot delete: product has stock history. Mark it inactive instead.');
        }

        $product->delete();

        return back()->with('success', 'Product deleted.');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'generic_name' => ['nullable', 'string', 'max:255'],
            'brand_name' => ['nullable', 'string', 'max:255'],
            'company_id' => ['required', 'exists:companies,id'],
            'category_id' => ['nullable', 'exists:product_categories,id'],
            'product_type' => ['nullable', 'string', 'max:100'],
            'sku' => ['nullable', 'string', 'max:100'],
            'barcode' => ['nullable', 'string', 'max:100'],
            'pack_size' => ['nullable', 'string', 'max:100'],
            'purchase_price' => ['nullable', 'numeric', 'min:0'],
            'trade_price' => ['nullable', 'numeric', 'min:0'],
            'retail_price' => ['nullable', 'numeric', 'min:0'],
            'mrp' => ['nullable', 'numeric', 'min:0'],
            'tax_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'default_discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'min_stock' => ['nullable', 'numeric', 'min:0'],
            'reorder_level' => ['nullable', 'numeric', 'min:0'],
            'status' => ['required', 'in:active,inactive'],
            'notes' => ['nullable', 'string'],
        ]);
    }
}
