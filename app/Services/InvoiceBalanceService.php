<?php

namespace App\Services;

use App\Models\{PaymentAllocation, SalesInvoice, SalesReturn};
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/** Shared invoice-allocation balance, distinct from unallocated party credit. */
class InvoiceBalanceService
{
    public const DUE_SQL = 'ROUND(sales_invoices.total_amount - COALESCE(paid.total, 0) - COALESCE(credited.total, 0) - COALESCE(applied.paisa, 0) / 100.0, 2)';

    public function sales(): Builder
    {
        $paid = PaymentAllocation::query()->where('invoice_type', (new SalesInvoice)->getMorphClass())
            ->whereHas('payment', fn ($q) => $q->where('status', 'completed'))
            ->selectRaw('invoice_id, SUM(amount) as total')->groupBy('invoice_id');
        $credits = SalesReturn::query()->where('status', 'posted')
            ->selectRaw('sales_invoice_id, SUM(total_amount) as total')->groupBy('sales_invoice_id');
        $cast = in_array(DB::getDriverName(), ['mysql', 'mariadb'], true) ? 'UNSIGNED' : 'INTEGER';
        $applied = DB::table('finance_work_items')->where('kind', 'credit_apply')->where('status', 'posted')
            ->selectRaw("CAST(JSON_EXTRACT(payload, '$.target_id') AS {$cast}) AS target_id, SUM(amount_paisa) AS paisa")
            ->groupBy('target_id');

        return SalesInvoice::query()->where('sales_invoices.status', 'posted')
            ->leftJoinSub($paid, 'paid', 'paid.invoice_id', '=', 'sales_invoices.id')
            ->leftJoinSub($credits, 'credited', 'credited.sales_invoice_id', '=', 'sales_invoices.id')
            ->leftJoinSub($applied, 'applied', 'applied.target_id', '=', 'sales_invoices.id')
            ->select('sales_invoices.*')
            ->selectRaw('COALESCE(paid.total, 0) as paid_amount, COALESCE(credited.total, 0) as return_credit')
            ->selectRaw('COALESCE(applied.paisa, 0) / 100.0 as applied_credit')
            ->selectRaw(self::DUE_SQL.' as outstanding');
    }

    public function openSales(): Builder
    {
        return $this->sales()->whereRaw(self::DUE_SQL.' > 0');
    }
}
