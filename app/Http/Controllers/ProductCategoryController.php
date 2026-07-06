<?php

namespace App\Http\Controllers;

use App\Models\ProductCategory;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ProductCategoryController extends Controller
{
    public function index(Request $request)
    {
        $categories = ProductCategory::query()
            ->withCount('products')
            ->when($request->search, fn ($q, $search) => $q->where('name', 'like', "%{$search}%"))
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('categories/index', [
            'categories' => $categories,
            'filters' => $request->only('search'),
        ]);
    }

    public function store(Request $request)
    {
        ProductCategory::create($request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:product_categories,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]));

        return back()->with('success', 'Category created.');
    }

    public function update(Request $request, ProductCategory $category)
    {
        $category->update($request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:product_categories,name,'.$category->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]));

        return back()->with('success', 'Category updated.');
    }

    public function destroy(ProductCategory $category)
    {
        if ($category->products()->exists()) {
            return back()->with('error', 'Cannot delete: category has products.');
        }

        $category->delete();

        return back()->with('success', 'Category deleted.');
    }
}
