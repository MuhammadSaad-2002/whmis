<?php

namespace App\Services;

use App\Models\{Company, SalesInvoice, SalesReturnItem};
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/** All-time snapshot of posted sales and return credits grouped by product supplier. */
class SupplierPurchaseValueReport
{
    public const KEY = 'supplier-purchase-value';

    public function build(?int $supplierId): array
    {
        $today = Carbon::today('Asia/Karachi')->toDateString();
        $products = [];
        $invoices = [];
        $posted = SalesInvoice::where('status', SalesInvoice::STATUS_POSTED)
            ->whereDate('invoice_date', '<=', $today)
            ->when($supplierId, fn ($query) => $query->whereHas('items', fn ($items) => $items
                ->whereHas('product', fn ($product) => $product->withTrashed()->where('company_id', $supplierId))))
            ->with([
                'customer' => fn ($query) => $query->withTrashed()->select('id', 'name'),
                'items:id,sales_invoice_id,product_id,quantity,bonus_quantity,net_amount,cost_amount,sort_order',
                'items.product' => fn ($query) => $query->withTrashed()->select('id', 'name', 'company_id'),
                'items.product.company' => fn ($query) => $query->withTrashed()->select('id', 'name'),
            ])->select('id', 'customer_id', 'invoice_number', 'invoice_date', 'total_amount');

        $posted->chunkById(250, function (Collection $sales) use ($supplierId, $today, &$products, &$invoices) {
            $returns = SalesReturnItem::query()
                ->join('sales_returns as posted_return', 'posted_return.id', '=', 'sales_return_items.sales_return_id')
                ->whereIn('posted_return.sales_invoice_id', $sales->modelKeys())
                ->where('posted_return.status', 'posted')
                ->whereDate('posted_return.return_date', '<=', $today)
                ->selectRaw('sales_invoice_item_id, SUM(quantity) as qty, SUM(net_amount) as credit, SUM(cost_amount) as cost')
                ->groupBy('sales_invoice_item_id')->get()->keyBy('sales_invoice_item_id');

            foreach ($sales as $sale) {
                $bySupplier = [];
                $total = $this->minor($sale->total_amount);
                $items = $sale->items->sortBy('id');
                $weights = $items->mapWithKeys(fn ($item) => [$item->id => $this->minor($item->net_amount)]);
                $totalWeight = $weights->sum();
                // Normally the net line amounts are the invoice base. If a
                // legacy invoice has no line amounts, prefer quantities.
                if ($totalWeight === 0) {
                    $weights = $items->mapWithKeys(fn ($item) => [$item->id => $this->minor($item->quantity)]);
                    $totalWeight = $weights->sum();
                }

                $weightToDate = $invoiceShare = $rawCostToDate = $allocatedCost = 0;
                foreach ($items as $item) {
                    $returned = $returns->get($item->id);
                    $companyId = $item->product?->company_id;
                    $company = $item->product?->company?->name ?? 'No supplier';

                    // Allocate the stored invoice total (including header discount
                    // and GST) before filtering out other suppliers. Cumulative
                    // rounding assigns any final paisa once, not once per group.
                    $weightToDate += $weights[$item->id];
                    $share = $totalWeight !== 0
                        ? (int) round($total * ($weightToDate / $totalWeight))
                        : $total;
                    $netSale = $share - $invoiceShare - $this->minor($returned?->credit ?? 0);
                    $invoiceShare = $share;

                    // Cost is captured at posting for billed + bonus units.
                    // Keep its four decimals until assigning each line its cents.
                    $rawCostToDate += $this->minor($item->cost_amount, 10000) - $this->minor($returned?->cost ?? 0, 10000);
                    $costToDate = (int) round($rawCostToDate / 100);
                    $cost = $costToDate - $allocatedCost;
                    $allocatedCost = $costToDate;

                    if ($supplierId !== null && (int) $companyId !== $supplierId) continue;

                    $products[$item->product_id] ??= [
                        'product' => $item->product?->name ?? 'Product #'.$item->product_id,
                        'supplier' => $company,
                        'qty_sold' => 0, 'bonus_qty' => 0, 'returned_qty' => 0, 'net_units' => 0, 'purchase_value' => 0,
                    ];
                    $product = &$products[$item->product_id];
                    $sold = $this->minor($item->quantity);
                    $bonus = $this->minor($item->bonus_quantity);
                    $returnedQty = $this->minor($returned?->qty ?? 0);
                    $product['qty_sold'] += $sold;
                    $product['bonus_qty'] += $bonus;
                    $product['returned_qty'] += $returnedQty;
                    $product['net_units'] += $sold + $bonus - $returnedQty;
                    $product['purchase_value'] += $cost;
                    unset($product);

                    $supplierKey = $companyId ?? 0;
                    $bySupplier[$supplierKey] ??= [
                        'invoice_number' => $sale->invoice_number, 'invoice_date' => $sale->invoice_date->toDateString(),
                        'customer' => $sale->customer?->name ?? 'Customer #'.$sale->customer_id, 'supplier' => $company,
                        'purchase_value' => 0, 'invoice_total' => $total, 'net_sale_value' => 0,
                    ];
                    $bySupplier[$supplierKey]['purchase_value'] += $cost;
                    $bySupplier[$supplierKey]['net_sale_value'] += $netSale;
                }
                foreach ($bySupplier as $row) $invoices[] = $row;
            }
        });

        $productKeys = ['qty_sold', 'bonus_qty', 'returned_qty', 'net_units', 'purchase_value'];
        $invoiceKeys = ['purchase_value', 'net_sale_value'];
        $products = collect($products)->sortBy([['supplier', 'asc'], ['product', 'asc']])->values();
        $invoices = collect($invoices)->sortBy([['supplier', 'asc'], ['invoice_date', 'asc'], ['invoice_number', 'asc']])->values();
        $supplierName = $supplierId === null ? null : (Company::withTrashed()->find($supplierId)?->name ?? 'Selected supplier');
        $periodLabel = 'All time through '.Carbon::parse($today)->format('d M Y').' (PKT)';
        $supplierColumn = $supplierId === null ? [['key' => 'supplier', 'label' => 'Supplier']] : [];
        $invoiceTotals = $this->totals($invoices, $invoiceKeys);
        $grossProfit = ($this->minor($invoiceTotals['net_sale_value']) - $this->minor($invoiceTotals['purchase_value'])) / 100;

        return [
            'section_title' => 'Products by Supplier',
            'context' => ($supplierName ?? 'All suppliers').' · '.$periodLabel,
            'supplier_name' => $supplierName,
            'period_label' => $periodLabel,
            'notes' => [
                'Purchase Value is the posted cost of sold and bonus units, less the cost reversed by posted returns.',
                'Net Sale Value includes only the supplier’s lines, their share of invoice discount and tax, less posted return credits. The full invoice total is shown for reference and is not added across suppliers.',
                'Gross Profit is Net Sale Value less Purchase Value, before operating expenses.',
            ],
            'columns' => [
                ['key' => 'product', 'label' => 'Product'], ...$supplierColumn,
                $this->column('qty_sold', 'Qty Sold', 'qty'), $this->column('bonus_qty', 'Bonus Qty', 'qty'),
                $this->column('returned_qty', 'Qty Returned', 'qty'), $this->column('net_units', 'Net Units Incl. Bonus', 'qty'),
                $this->column('purchase_value', 'Purchase Value', 'money'),
            ],
            'rows' => $this->displayRows($products, $productKeys),
            'totals' => $this->totals($products, $productKeys),
            'sections' => [[
                'title' => 'Sales Invoices by Supplier',
                'columns' => [
                    ['key' => 'invoice_number', 'label' => 'Sale Inv #'],
                    ['key' => 'invoice_date', 'label' => 'Sale Date', 'format' => 'date'],
                    ['key' => 'customer', 'label' => 'Customer'], ...$supplierColumn,
                    $this->column('purchase_value', 'Purchase Value', 'money'),
                    $this->column('invoice_total', 'Full Invoice Total', 'money'),
                    $this->column('net_sale_value', 'Net Sale Value', 'money'),
                ],
                'rows' => $this->displayRows($invoices, [...$invoiceKeys, 'invoice_total']),
                'totals' => $invoiceTotals,
            ], [
                'title' => 'Summary',
                'keep_together' => true,
                'columns' => [
                    ['key' => 'metric', 'label' => 'Metric'],
                    $this->column('amount', 'Amount (Rs)', 'money'),
                ],
                'rows' => [
                    ['metric' => 'Total Purchase Value', 'amount' => $invoiceTotals['purchase_value']],
                    ['metric' => 'Total Net Sale Value', 'amount' => $invoiceTotals['net_sale_value']],
                    ['metric' => 'Gross Profit', 'amount' => $grossProfit],
                ],
                'totals' => [],
            ]],
        ];
    }

    private function minor(mixed $value, int $scale = 100): int
    {
        return (int) round((float) $value * $scale);
    }

    private function column(string $key, string $label, string $format): array
    {
        return ['key' => $key, 'label' => $label, 'format' => $format, 'align' => 'right'];
    }

    private function displayRows(Collection $rows, array $scaled): array
    {
        return $rows->map(function (array $row) use ($scaled) {
            foreach ($scaled as $key) $row[$key] /= 100;

            return $row;
        })->all();
    }

    private function totals(Collection $rows, array $keys): array
    {
        return array_combine($keys, array_map(fn ($key) => $rows->sum($key) / 100, $keys));
    }
}
