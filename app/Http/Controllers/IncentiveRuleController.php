<?php

namespace App\Http\Controllers;

use App\Models\BookingItem;
use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Models\SalesInvoiceItem;
use Illuminate\Http\Request;
use Inertia\Inertia;

class IncentiveRuleController extends Controller
{
    public function index(Request $request)
    {
        $rules = IncentiveRule::query()
            ->with(['product:id,name', 'company:id,name', 'customer:id,name'])
            ->when($request->search, fn ($q, $search) => $q->where('name', 'like', "%{$search}%"))
            ->when($request->rule_type, fn ($q, $type) => $q->where('rule_type', $type))
            ->when($request->filled('active'), fn ($q) => $q->where('active', $request->boolean('active')))
            ->orderByDesc('active')->orderByDesc('priority')->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        $rules->getCollection()->transform(function (IncentiveRule $rule) {
            $rule->setAttribute('summary', $rule->summary());

            return $rule;
        });

        return Inertia::render('incentives/index', [
            'rules' => $rules,
            'products' => Product::active()->orderBy('name')->get(['id', 'name']),
            'companies' => Company::active()->orderBy('name')->get(['id', 'name']),
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'rule_type', 'active'),
        ]);
    }

    public function store(Request $request)
    {
        IncentiveRule::create($this->validated($request));

        return back()->with('success', 'Incentive rule created.');
    }

    public function update(Request $request, IncentiveRule $incentive)
    {
        $incentive->update($this->validated($request));

        return back()->with('success', 'Incentive rule updated.');
    }

    public function destroy(IncentiveRule $incentive)
    {
        $used = SalesInvoiceItem::where('applied_rule_id', $incentive->id)->exists()
            || BookingItem::where('applied_rule_id', $incentive->id)->exists();

        if ($used) {
            $incentive->update(['active' => false]);

            return back()->with('error', 'Rule is referenced by invoices/bookings — deactivated instead of deleted.');
        }

        $incentive->delete();

        return back()->with('success', 'Incentive rule deleted.');
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'rule_type' => ['required', 'in:qty_bonus,slab_bonus,percent_discount,fixed_discount,price_override'],
            'product_id' => ['nullable', 'exists:products,id'],
            'company_id' => ['nullable', 'exists:companies,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'base_qty' => ['nullable', 'numeric', 'gt:0', 'required_if:rule_type,qty_bonus'],
            'bonus_qty' => ['nullable', 'numeric', 'gt:0', 'required_if:rule_type,qty_bonus'],
            'slabs' => ['nullable', 'array', 'required_if:rule_type,slab_bonus'],
            'slabs.*.min_qty' => ['required_with:slabs', 'numeric', 'min:0'],
            'slabs.*.max_qty' => ['nullable', 'numeric', 'gt:0'],
            'slabs.*.bonus_qty' => ['required_with:slabs', 'numeric', 'min:0'],
            'value' => ['nullable', 'numeric', 'min:0', 'required_if:rule_type,percent_discount,fixed_discount,price_override'],
            'min_qty' => ['nullable', 'numeric', 'min:0'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'priority' => ['nullable', 'integer'],
            'active' => ['boolean'],
        ]);

        if (($data['rule_type'] ?? '') === 'percent_discount' && (float) ($data['value'] ?? 0) > 100) {
            abort(422, 'Percent discount cannot exceed 100.');
        }

        return $data + ['priority' => $data['priority'] ?? 0];
    }
}
