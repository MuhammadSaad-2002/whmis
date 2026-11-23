<?php

namespace App\Services;

use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use Illuminate\Database\Eloquent\Builder;

/** Shared list, filters, and export read model; does not post or recalculate invoices. */
class SalesInvoiceList
{
    public const STATUSES = ['draft', 'posted', 'returned', 'zero', 'cancelled'];

    public const SORTS = ['invoice', 'customer', 'date', 'type', 'total', 'returns', 'net', 'profit', 'margin'];

    public const PAGE_SIZES = [10, 15, 25, 50];

    private const RETURNS = 'COALESCE(returned.amount, 0)';

    private const NET = '(sales_invoices.total_amount - '.self::RETURNS.')';

    private const PROFIT = '(sales_invoices.total_profit - '.self::RETURNS.' + COALESCE(returned.cost, 0))';

    private const POSTED_PROFIT = "CASE WHEN sales_invoices.status = 'posted' THEN ROUND(".self::PROFIT.', 2) END';

    private const MARGIN = '100.0 * ('.self::POSTED_PROFIT.') / NULLIF(ROUND('.self::NET.', 2), 0)';

    public function query(array $filters): Builder
    {
        $returned = SalesReturn::where('status', SalesReturn::STATUS_POSTED)
            ->selectRaw('sales_invoice_id, SUM(total_amount) as amount, SUM(total_cost) as cost, COUNT(*) as return_count')
            ->groupBy('sales_invoice_id');

        return SalesInvoice::query()
            ->leftJoin('customers as list_customer', 'list_customer.id', '=', 'sales_invoices.customer_id')
            ->leftJoinSub($returned, 'returned', 'returned.sales_invoice_id', '=', 'sales_invoices.id')
            ->with('customer:id,name,city')
            ->select('sales_invoices.*')
            ->selectRaw(self::RETURNS.' AS returned_amount, COALESCE(returned.return_count, 0) AS posted_return_count,
                ROUND('.self::NET.', 2) AS net_amount, '.self::POSTED_PROFIT.' AS net_profit, '.self::MARGIN.' AS margin')
            ->when($filters['search'] ?? null, fn ($q, $search) => $q->where(function ($query) use ($search) {
                $query->where('sales_invoices.invoice_number', 'like', "%{$search}%")
                    ->orWhere('list_customer.name', 'like', "%{$search}%");
            }))
            ->when($filters['customer_id'] ?? null, fn ($q, $id) => $q->where('sales_invoices.customer_id', $id))
            ->when($filters['sale_type'] ?? null, fn ($q, $type) => $q->where('sales_invoices.sale_type', $type))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->whereDate('sales_invoices.invoice_date', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->whereDate('sales_invoices.invoice_date', '<=', $to));
    }

    public function filterStatus(Builder $query, ?string $status): Builder
    {
        return match ($status) {
            'returned' => $query->where('returned.return_count', '>', 0),
            'zero' => $query->whereRaw('('.self::POSTED_PROFIT.') = 0'),
            'draft', 'posted', 'cancelled' => $query->where('sales_invoices.status', $status),
            default => $query,
        };
    }

    public function sort(Builder $query, array $filters): Builder
    {
        $column = match ($filters['sort'] ?? null) {
            'invoice' => 'sales_invoices.invoice_number', 'customer' => 'list_customer.name',
            'type' => 'sales_invoices.sale_type', 'total' => 'sales_invoices.total_amount',
            'returns' => 'returned_amount', 'net' => 'net_amount', 'profit' => 'net_profit',
            'margin' => 'margin', default => 'sales_invoices.invoice_date',
        };

        return $query->orderBy($column, $filters['direction'] ?? 'desc')->orderByDesc('sales_invoices.id');
    }

    public function counts(Builder $query): array
    {
        $row = (clone $query)->toBase()->select([])->selectRaw(
            "COUNT(*) AS total, SUM(CASE WHEN sales_invoices.status = 'draft' THEN 1 ELSE 0 END) AS drafts,
            SUM(CASE WHEN sales_invoices.status = 'posted' THEN 1 ELSE 0 END) AS posted,
            SUM(CASE WHEN sales_invoices.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            SUM(CASE WHEN returned.return_count > 0 THEN 1 ELSE 0 END) AS returned,
            SUM(CASE WHEN (".self::POSTED_PROFIT.') = 0 THEN 1 ELSE 0 END) AS zero'
        )->first();

        return ['all' => (int) $row->total, 'draft' => (int) $row->drafts, 'posted' => (int) $row->posted,
            'cancelled' => (int) $row->cancelled, 'returned' => (int) $row->returned, 'zero' => (int) $row->zero];
    }

    public function summary(Builder $query): array
    {
        $row = (clone $query)->toBase()->select([])->selectRaw(
            "SUM(sales_invoices.total_amount) AS gross,
            SUM(".self::RETURNS.") AS returned_total,
            SUM(CASE WHEN sales_invoices.status = 'posted' THEN sales_invoices.total_profit ELSE 0 END) AS gross_profit,
            SUM(COALESCE(returned.cost, 0)) AS returned_cost,
            SUM(CASE WHEN sales_invoices.status = 'posted' THEN ".self::NET." ELSE 0 END) AS posted_net,
            SUM(CASE WHEN sales_invoices.status = 'draft' THEN sales_invoices.total_amount ELSE 0 END) AS drafts_total,
            SUM(CASE WHEN sales_invoices.status = 'draft' THEN 1 ELSE 0 END) AS drafts_count,
            SUM(CASE WHEN returned.return_count > 0 THEN 1 ELSE 0 END) AS returned_count"
        )->first();
        $gross = round((float) $row->gross, 2);
        $returns = round((float) $row->returned_total, 2);
        $grossProfit = round((float) $row->gross_profit, 2);
        $netProfit = round($grossProfit - ($returns - (float) $row->returned_cost), 2);
        $postedNet = (float) $row->posted_net;

        return [
            'gross' => $gross, 'returns' => $returns, 'net' => round($gross - $returns, 2),
            'gross_profit' => $grossProfit, 'net_profit' => $netProfit,
            'margin' => $postedNet == 0 ? null : round($netProfit * 100 / $postedNet, 2),
            'drafts_total' => round((float) $row->drafts_total, 2), 'drafts_count' => (int) $row->drafts_count,
            'returned_count' => (int) $row->returned_count,
        ];
    }
}
