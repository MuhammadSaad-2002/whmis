<?php

namespace App\Services;

use App\Models\{Booking, Dispatch, Employee, FinanceWorkItem, SalesInvoice, User};
use App\Support\Paisa;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class CommissionService
{
    public const VERIFIED_BASIS = 'collected';

    public function __construct(private InvoiceBalanceService $balances, private TreasuryService $treasury) {}

    public function verifiedCollections(): Builder
    {
        return DB::table('delivery_collections as c')->join('payments as p', 'p.id', '=', 'c.payment_id')
            ->whereNotNull('c.recorded_at')->where('p.status', 'completed')
            ->selectRaw('COALESCE(SUM(c.verified_paisa), 0) AS total');
    }

    public function snapshot(SalesInvoice $invoice): void
    {
        if (! $this->treasury->live()) return;
        $booking = $invoice->booking;
        $source = $booking ? 'booking' : 'direct';
        $key = $source.':'.($booking?->id ?? $invoice->id);
        $date = now('Asia/Karachi')->toDateString();
        $booker = $booking?->booker_id ?? $invoice->booker_id;
        $salesman = $invoice->isPosted()
            ? Dispatch::where('sales_invoice_id', $invoice->id)->value('assigned_to')
            : app(DeliveryPlanningService::class)->assignmentDefaults($invoice)['assigned_to'];
        $linked = Employee::whereIn('user_id', array_filter([$booker, $salesman]))->pluck('id', 'user_id');
        $rules = [];
        $snapshots = ['date' => $date, 'approved_lines' => [], 'salesman_percent' => []];
        foreach (['booker' => $booker, 'salesman' => $salesman] as $role => $user) {
            $scopes = array_values(array_filter([$booking ? "booking:{$booking->id}" : null, isset($linked[$user]) ? "employee:{$linked[$user]}" : null, 'default']));
            $latest = DB::table('commission_rules')->where('role', $role)->where('source', $source)->whereIn('scope', $scopes)
                ->where('effective_from', '<=', $date)->latest('effective_from')->latest('id')->get()->unique('scope')->keyBy('scope');
            foreach ($scopes as $scope) {
                if ($latest->has($scope)) {
                    $rules[$role] = (array) $latest[$scope];
                    break;
                }
            }
            if ($role === 'salesman' && ($rules[$role]['mode'] ?? null) === 'percent' && str_starts_with($rules[$role]['scope'], 'employee:')) {
                $rules[$role] = isset($latest['default']) && $latest['default']->mode === 'percent' ? (array) $latest['default']
                    : array_replace($rules[$role], ['scope' => 'default', 'rate' => 0]);
            }
        }
        $snapshots['salesman_percent'] = DB::table('commission_rules')->where('role', 'salesman')->where('source', $source)
            ->where('scope', 'like', 'employee:%')->where('effective_from', '<=', $date)
            ->latest('effective_from')->latest('id')->get()->unique('scope')->keyBy('scope')->all();
        if (! isset($rules['salesman']) && $snapshots['salesman_percent'] !== []) {
            $rules['salesman'] = ['scope' => 'default', 'mode' => 'percent', 'rate' => 0, 'basis' => 'invoice', 'dispatch_share_bp' => 0];
        }
        if ($booking) {
            $snapshots['approved_lines'] = $booking->items()->get()->keyBy('product_id')->map(fn ($item) => [
                'quantity' => (float) $item->quantity, 'paisa' => max(0, Paisa::from($item->net_amount) - Paisa::from($item->gst_amount)),
            ])->all();
        }
        $original = $booking ? array_sum(array_column($snapshots['approved_lines'], 'paisa')) : $this->invoiceValue($invoice);

        DB::table('commission_scopes')->insertOrIgnore([
            'source_key' => $key, 'booking_id' => $booking?->id, 'booker_id' => $booker, 'original_salesman_id' => $salesman,
            'original_paisa' => $original, 'rules' => json_encode($rules, JSON_THROW_ON_ERROR),
            'snapshots' => json_encode($snapshots, JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function recalculate(SalesInvoice $invoice): void
    {
        $key = $invoice->booking_id ? "booking:{$invoice->booking_id}" : "direct:{$invoice->id}";
        $scope = DB::table('commission_scopes')->where('source_key', $key)->lockForUpdate()->first();
        if (! $scope) {
            $this->recalculateOpening($invoice);
            return;
        }
        $rules = json_decode($scope->rules, true, flags: JSON_THROW_ON_ERROR);
        $snapshots = json_decode($scope->snapshots, true, flags: JSON_THROW_ON_ERROR);
        $usesCollections = collect($rules)->contains('basis', self::VERIFIED_BASIS)
            || collect($snapshots['salesman_percent'] ?? [])->contains('basis', self::VERIFIED_BASIS);
        $booking = $scope->booking_id ? Booking::findOrFail($scope->booking_id) : null;
        $invoices = $booking ? $booking->salesInvoices()->orderBy('id')->get() : collect([$invoice->fresh()]);
        $candidates = [];
        $readyBooking = ! $booking || $booking->status === Booking::STATUS_CONVERTED;
        $origins = Employee::whereNotNull('user_id')->pluck('id', 'user_id');
        foreach ($invoices as $sale) {
            if ($sale->status === SalesInvoice::STATUS_CANCELLED) continue;
            $facts = $this->facts($sale, $snapshots['approved_lines'] ?? [], $usesCollections);
            if (! $facts['ready'] && $facts['value'] > 0) $readyBooking = false;
            foreach ($rules as $role => $rule) {
                if ($rule['mode'] === 'off') continue;
                $base = $rule['basis'] === 'booking' && $booking ? $facts['booking_base'] : $facts['value'];
                if ($base <= 0) continue;
                $weights = [];
                if ($role === 'booker' && $origins->has($scope->booker_id)) {
                    $weights[(int) $origins[$scope->booker_id]] = $base;
                } elseif ($role === 'salesman') {
                    $approvedShare = DB::table('finance_work_items')->where('kind','commission_share')->where('status','posted')->where('payload->invoice_id', $sale->id)->latest('id')->value('payload');
                    $share = $approvedShare ? (int) json_decode($approvedShare, true, flags: JSON_THROW_ON_ERROR)['share_bp'] : (int) $rule['dispatch_share_bp'];
                    $weights = $this->salesmanWeights($facts, $origins, (int) $scope->original_salesman_id, $share, $base);
                    if (! $weights && ! $facts['ready'] && $origins->has($scope->original_salesman_id)) $weights[(int) $origins[$scope->original_salesman_id]] = $base;
                }
                if (! $weights) continue;
                $candidates[$role][] = ['invoice' => $sale->id, 'weights' => $weights, 'base' => $base, 'facts' => $facts];
            }
        }

        $desired = [];
        foreach ($candidates as $role => $rows) {
            $rule = $rules[$role];
            $fixed = $rule['mode'] !== 'percent';
            $original = (int) $scope->original_paisa;
            $allValue = array_sum(array_column($rows, 'base'));
            $fixedCap = (int) $rule['rate'];
            $cumulativeBase = 0;
            $allocated = 0;
            foreach ($rows as $row) {
                $facts = $row['facts'];
                $keyPrefix = $row['invoice'].':'.$role.':';
                $cumulativeBase += $row['base'];
                $usesVerified = [];
                if ($fixed) {
                    $denominator = $rule['mode'] === 'full_fixed' ? $allValue : $original;
                    $totalThrough = $denominator > 0 ? min($fixedCap, $this->scaled($fixedCap, $cumulativeBase, $denominator)) : 0;
                    $amounts = $this->allocate($totalThrough - $allocated, $row['weights']);
                    $allocated = $totalThrough;
                } else {
                    $parts = $this->allocate($row['base'], $row['weights']);
                    $receiptParts = $this->allocate($facts['verified'], $row['weights']);
                    $amounts = [];
                    foreach ($parts as $employee => $part) {
                        $override = $role === 'salesman' ? ($snapshots['salesman_percent']['employee:'.$employee] ?? null) : null;
                        $effective = $override && $override['mode'] === 'percent' && ! str_starts_with($rule['scope'], 'booking:') ? $override : $rule;
                        $usesVerified[$employee] = $effective['basis'] === self::VERIFIED_BASIS;
                        $amounts[$employee] = $this->scaled($usesVerified[$employee] ? ($receiptParts[$employee] ?? 0) : $part, (int) $effective['rate'], 10000);
                    }
                }
                foreach ($amounts as $employee => $amount) {
                    if (! $employee) continue;
                    $collected = $fixed ? $rule['basis'] === self::VERIFIED_BASIS : $usesVerified[$employee];
                    if ($fixed && $collected) $amount = $this->scaled($amount, $facts['verified'], $facts['due_total']);
                    $due = $facts['ready'] && ($rule['mode'] !== 'full_fixed' || $readyBooking);
                    $desired[$keyPrefix.$employee] = ['sales_invoice_id' => $row['invoice'], 'employee_id' => $employee,
                        'role' => $role, 'calculated_paisa' => $amount, 'earned_paisa' => $due ? $amount : 0,
                        'accrued_paisa' => $collected ? $amount : $this->scaled($amount, min($facts['paid'], $facts['due_total']), $facts['due_total']),
                        'state' => $due ? 'due' : ($facts['settled'] ? 'pending_delivery' : 'pending')];
                }
            }
        }
        $existing = DB::table('commission_awards')->where('commission_scope_id', $scope->id)->get()
            ->keyBy(fn ($r) => $r->sales_invoice_id.':'.$r->role.':'.$r->employee_id);
        $employees = collect($desired)->pluck('employee_id')->merge($existing->pluck('employee_id'))->unique()->sort()->values();
        Employee::whereKey($employees->all())->orderBy('id')->lockForUpdate()->get(['id']);
        foreach ($existing as $key => $award) {
            if (! isset($desired[$key])) $desired[$key] = ['sales_invoice_id' => $award->sales_invoice_id, 'role' => $award->role,
                'employee_id' => $award->employee_id, 'calculated_paisa' => 0, 'earned_paisa' => 0, 'accrued_paisa' => 0, 'state' => 'adjusted'];
        }
        foreach ($desired as $key => $row) {
            $prior = $existing[$key] ?? null;
            if ($prior) {
                $id = $prior->id;
                DB::table('commission_awards')->where('id', $id)->update($row + ['updated_at' => now()]);
            } else {
                $id = DB::table('commission_awards')->insertGetId($row + ['commission_scope_id' => $scope->id, 'created_at' => now(), 'updated_at' => now()]);
            }
            $change = $row['earned_paisa'] - (int) ($prior->earned_paisa ?? 0);
            if (! $change) continue;
            $this->reconcileAward($row['employee_id'], $id, $change);
        }
        foreach ($employees as $employee) $this->offset($employee);
    }

    public function invoiceValue(SalesInvoice $invoice): int
    {
        $taxless = Paisa::from($invoice->subtotal) - Paisa::from($invoice->item_discount_total);
        $taxableWithTax = $taxless + Paisa::from($invoice->item_gst_total);
        return max(0, $taxless - ($taxableWithTax > 0 ? $this->scaled(Paisa::from($invoice->discount_amount), $taxless, $taxableWithTax) : 0));
    }

    public function totals(?\Illuminate\Support\Carbon $from = null, ?\Illuminate\Support\Carbon $to = null): array
    {
        $row = DB::table('commission_entries')->when($from, fn ($q) => $q->where('business_date', '>=', $from->toDateString()))
            ->when($to, fn ($q) => $q->where('business_date', '<=', $to->toDateString()))
            ->selectRaw('SUM(expense_paisa) expense, SUM(payable_paisa) payable, SUM(recovery_paisa) recovery, SUM(cash_out_paisa) cash_out')->first();
        return array_map(fn ($paisa) => (int) $paisa / 100, (array) $row);
    }

    public function importOpening(FinanceWorkItem $opening, SalesInvoice $invoice, Employee $employee, array $row, int $amount): void
    {
        $snapshot = $this->facts($invoice, []);
        if ($snapshot['value'] <= 0) $this->treasury->fail('An opening commission requires a positive retained invoice value.');
        $scope = DB::table('commission_scopes')->insertGetId([
            'source_key' => 'opening:'.$invoice->id.':'.$employee->id.':'.$row['role'],
            'rules' => json_encode(['opening' => true, 'cap' => $amount, 'basis' => $snapshot['value']], JSON_THROW_ON_ERROR),
            'snapshots' => json_encode(['reference' => $row['reference']], JSON_THROW_ON_ERROR),
            'original_paisa' => $snapshot['value'], 'created_at' => now(), 'updated_at' => now(),
        ]);
        $award = DB::table('commission_awards')->insertGetId(['commission_scope_id'=>$scope,'sales_invoice_id'=>$invoice->id,
            'employee_id'=>$employee->id,'role'=>$row['role'],'state'=>'due','calculated_paisa'=>$amount,'accrued_paisa'=>$amount,
            'earned_paisa'=>$amount,'created_at'=>now(),'updated_at'=>now()]);
        $this->entry($employee->id, $award, 'opening', 0, $amount, 0, 0, 'Verified pre-Treasury commission payable', $opening);
    }

    private function recalculateOpening(SalesInvoice $invoice): void
    {
        $awards = DB::table('commission_awards as a')->join('commission_scopes as s','s.id','=','a.commission_scope_id')
            ->where('a.sales_invoice_id', $invoice->id)->where('s.source_key', 'like', 'opening:%')->get(['a.*','s.rules']);
        if ($awards->isEmpty()) return;
        Employee::whereKey($awards->pluck('employee_id')->unique()->all())->orderBy('id')->lockForUpdate()->get(['id']);
        $facts = $this->facts($invoice->fresh(), []);
        foreach ($awards as $award) {
            $rules = json_decode($award->rules, true, flags: JSON_THROW_ON_ERROR);
            $calculated = $invoice->isPosted() ? $this->scaled((int) $rules['cap'], min((int) $rules['basis'], $facts['value']), (int) $rules['basis']) : 0;
            $earned = $facts['settled'] ? $calculated : 0;
            DB::table('commission_awards')->where('id', $award->id)->update([
                'calculated_paisa' => $calculated, 'earned_paisa' => $earned, 'accrued_paisa' => $earned,
                'state' => $earned ? 'due' : ($calculated ? 'pending' : 'adjusted'), 'updated_at' => now(),
            ]);
            $this->reconcileAward($award->employee_id, $award->id, $earned - (int) $award->earned_paisa);
            $this->offset($award->employee_id);
        }
    }

    private function reconcileAward(int $employee, int $award, int $change): void
    {
        if (! $change) return;
        $ledger = DB::table('commission_entries')->where('commission_award_id', $award);
        $recover = $change < 0 ? max(0, -$change - (int) (clone $ledger)->sum('payable_paisa'))
            : -min($change, (int) (clone $ledger)->sum('recovery_paisa'));
        $this->entry($employee, $award, $recover > 0 ? 'recovery_created' : 'entitlement', $change, $change + $recover, $recover, 0,
            'Recomputed from invoice settlement, fulfillment and retained sales');
    }

    private function facts(SalesInvoice $invoice, array $approved, bool $usesCollections = false): array
    {
        $original = $this->invoiceValue($invoice);
        $dispatch = Dispatch::where('sales_invoice_id', $invoice->id)->first();
        $lineGross = $invoice->items->mapWithKeys(fn ($item) => [$item->id => max(0, Paisa::from($item->net_amount) - Paisa::from($item->gst_amount))])->all();
        $lineValues = $this->allocate($original, $lineGross);
        $delivered = $returned = [];
        $events = $dispatch ? DB::table('dispatch_event_items as line')->join('dispatch_events as e', 'e.id', '=', 'line.dispatch_event_id')
            ->where('e.dispatch_id', $dispatch->id)->whereIn('e.action', ['delivered', 'correct_delivery'])
            ->orderBy('e.id')->get(['e.created_by', 'e.assigned_to', 'line.sales_invoice_item_id', 'line.quantity']) : collect();
        foreach ($events as $event) {
            $id = $event->sales_invoice_item_id;
            $q = Paisa::from($event->quantity);
            // On custody-tracked deliveries, assigned_to is the confirmed stock holder;
            // created_by can be the Admin verifying that Salesman's activity on the board.
            if ($q > 0) $delivered[$id][] = ['user' => (int) ($dispatch->custody_required ? ($event->assigned_to ?? $event->created_by) : $event->created_by), 'units' => $q];
            else $this->trimUnits($delivered[$id], -$q);
        }
        $returns = $invoice->postedReturns()->with('items')->get();
        foreach ($returns as $return) foreach ($return->items as $line) {
            $id = $line->sales_invoice_item_id;
            $returned[$id]['total'] = ($returned[$id]['total'] ?? 0) + Paisa::from($line->quantity);
            $returned[$id]['billed'] = ($returned[$id]['billed'] ?? 0) + Paisa::from($line->quantity) - Paisa::from($line->bonus_quantity);
        }
        $value = $bookingBase = 0;
        $weights = [];
        $fulfilled = true;
        foreach ($invoice->items as $line) {
            $units = Paisa::from($line->quantity);
            $billed = max(0, $units - ($returned[$line->id]['billed'] ?? 0));
            $required = max(0, $units + Paisa::from($line->bonus_quantity) - ($returned[$line->id]['total'] ?? 0));
            $lineValue = $units > 0 ? $this->scaled($lineValues[$line->id] ?? 0, $billed, $units) : 0;
            $value += $lineValue;
            $ref = $approved[$line->product_id] ?? null;
            $bookingBase += $ref && $ref['quantity'] > 0 ? min($lineValue, $this->scaled($ref['paisa'], $billed, Paisa::from($ref['quantity']))) : $lineValue;
            $history = $delivered[$line->id] ?? [];
            $this->trimUnits($history, max(0, array_sum(array_column($history, 'units')) - $required));
            $actual = array_sum(array_column($history, 'units'));
            $fulfilled = $fulfilled && $actual >= $required;
            $lineWeight = [];
            foreach ($history as $event) $lineWeight[$event['user']] = ($lineWeight[$event['user']] ?? 0) + $event['units'];
            foreach ($this->allocate($required > 0 ? $this->scaled($lineValue, $actual, $required) : 0, $lineWeight) as $user => $share) $weights[$user] = ($weights[$user] ?? 0) + $share;
        }
        $balance = $invoice->isPosted() ? $this->balances->sales()->whereKey($invoice->id)->first() : null;
        $settled = $balance && Paisa::from($balance->outstanding) <= 0;
        $ready = $settled && $fulfilled && ($dispatch?->status === 'delivered' || $value === 0);
        $due = max(0, Paisa::from($invoice->total_amount) - Paisa::from($balance?->return_credit));
        $verified = $balance && $usesCollections ? (int) $this->verifiedCollections()->where('c.sales_invoice_id', $invoice->id)->first()->total : 0;
        return ['value' => $value, 'booking_base' => $bookingBase, 'weights' => $weights, 'settled' => $settled, 'ready' => $ready,
            'paid' => Paisa::from($balance?->paid_amount) + Paisa::from($balance?->applied_credit),
            'verified' => min($verified, $due), 'due_total' => $due];
    }

    private function salesmanWeights(array $facts, Collection $employees, int $original, int $dispatchShare, int $base): array
    {
        $weights = [];
        foreach ($facts['weights'] as $user => $value) {
            $dispatchValue = $employees->has($original) ? $this->scaled($value, $dispatchShare, 10000) : 0;
            if ($dispatchValue) $weights[$original] = ($weights[$original] ?? 0) + $dispatchValue;
            $weights[$user] = ($weights[$user] ?? 0) + $value - $dispatchValue;
        }
        // Keep unlinked performers in the denominator; don't award their share to another employee.
        if ($base > array_sum($weights)) $weights[$original] = ($weights[$original] ?? 0) + $base - array_sum($weights);
        $out = [];
        foreach ($weights as $user => $weight) $out[$employees[$user] ?? 0] = ($out[$employees[$user] ?? 0] ?? 0) + $weight;
        return $out;
    }

    private function trimUnits(?array &$history, int $cut): void
    {
        $history ??= [];
        while ($cut > 0 && $history !== []) {
            $index = array_key_last($history);
            $take = min($cut, $history[$index]['units']);
            $history[$index]['units'] -= $take;
            $cut -= $take;
            if ($history[$index]['units'] === 0) array_pop($history);
        }
    }

    private function scaled(int $amount, int $part, int $whole): int
    {
        if ($whole <= 0 || $part <= 0 || $amount <= 0) return 0;
        // Integer half-up rounding without multiplying two potentially large paisa values.
        $result = intdiv($amount, $whole) * $part;
        $unit = $amount % $whole;
        $unitQuotient = $remainder = 0;
        while ($part > 0) {
            if ($part % 2) {
                $remainder += $unit;
                $result += $unitQuotient + intdiv($remainder, $whole);
                $remainder %= $whole;
            }
            $part = intdiv($part, 2);
            if (! $part) break;
            $unit *= 2;
            $unitQuotient = $unitQuotient * 2 + intdiv($unit, $whole);
            $unit %= $whole;
        }
        return $result + (int) ($remainder >= intdiv($whole, 2) + $whole % 2);
    }

    private function allocate(int $amount, array $weights): array
    {
        ksort($weights);
        $total = array_sum($weights);
        if ($total <= 0) return [];
        $sum = $used = 0;
        $parts = [];
        foreach ($weights as $key => $weight) {
            $sum += $weight;
            $through = $this->scaled($amount, $sum, $total);
            $parts[$key] = $through - $used;
            $used = $through;
        }
        return $parts;
    }

    private function entry(int $employee, ?int $award, string $kind, int $expense, int $payable, int $recovery, int $cash, string $reason, ?FinanceWorkItem $approval = null): void
    {
        DB::table('commission_entries')->insert(['employee_id' => $employee, 'commission_award_id' => $award,
            'kind' => $kind, 'expense_paisa' => $expense, 'payable_paisa' => $payable, 'recovery_paisa' => $recovery, 'cash_out_paisa' => $cash,
            'reason' => $reason, 'finance_work_item_id' => $approval?->id, 'business_date' => $approval?->payload['date'] ?? now('Asia/Karachi')->toDateString(),
            'actor_id' => Auth::id(), 'created_at' => now()]);
    }

    public function payoutAward(int $employee, int $award, int $amount): object
    {
        $row = DB::table('commission_awards as a')->join('sales_invoices as i', 'i.id', '=', 'a.sales_invoice_id')
            ->where('a.employee_id', $employee)->where('a.id', $award)->first(['i.invoice_number', 'a.role']);
        if (! $row || $amount > (int) $this->balances($employee, 'payable_paisa', $award)->sum('balance')) {
            $this->treasury->fail('The payout exceeds the live balance for this employee and invoice award.');
        }

        return $row;
    }

    private function balances(int $employee, string $column, ?int $award = null): Collection
    {
        return DB::table('commission_entries')->where('employee_id', $employee)->whereNotNull('commission_award_id')
            ->when($award !== null, fn ($query) => $query->where('commission_award_id', $award))
            ->selectRaw("commission_award_id, SUM({$column}) AS balance")->groupBy('commission_award_id')
            ->havingRaw("SUM({$column}) > 0")->orderBy('commission_award_id')->get();
    }

    private function offset(int $employee): void
    {
        if (DB::table('commission_employee_controls')->where('employee_id', $employee)->value('hold_recovery')) return;
        $recoveries = $this->balances($employee, 'recovery_paisa');
        foreach ($this->balances($employee, 'payable_paisa') as $award) {
            $due = (int) $award->balance;
            foreach ($recoveries as $recovery) {
                if ($due <= 0) break;
                $amount = min($due, (int) $recovery->balance);
                if ($amount <= 0) continue;
                $this->entry($employee, $award->commission_award_id, 'offset_payable', 0, -$amount, 0, 0, "Offset recovery #{$recovery->commission_award_id}");
                $this->entry($employee, $recovery->commission_award_id, 'offset_recovery', 0, 0, -$amount, 0, "Recovered from commission #{$award->commission_award_id}");
                $due -= $amount;
                $recovery->balance -= $amount;
            }
        }
    }

    public function postEmployeeAction(FinanceWorkItem $item, User $actor, ?string $reference): void
    {
        $employee = Employee::whereKey($item->payload['employee_id'])->lockForUpdate()->firstOrFail();
        abort_if($employee->user_id === $actor->id, 403);
        $kind = $item->kind;
        if (in_array($kind, ['recovery_hold','recovery_resume'], true)) {
            DB::table('commission_employee_controls')->updateOrInsert(['employee_id' => $employee->id], ['hold_recovery' => $kind === 'recovery_hold']);
            if ($kind === 'recovery_resume') $this->offset($employee->id);
            return;
        }
        $this->offset($employee->id);
        $isPay = $kind === 'commission_payout';
        $award = $isPay && isset($item->payload['award_id']) ? (int) $item->payload['award_id'] : null;
        $balances = $this->balances($employee->id, $isPay ? 'payable_paisa' : 'recovery_paisa', $award);
        $amount = (int) $item->amount_paisa;
        if ($amount > $balances->sum('balance')) $this->treasury->fail('Amount exceeds the live employee balance.');
        if (in_array($kind, ['commission_payout','recovery_repayment'], true)) {
            if (! trim($reference ?? '')) $this->treasury->fail('Enter the completed transaction reference.');
            $account = $this->treasury->account((int) ($item->payload['account_id'] ?? 0), $actor);
            $this->treasury->entry($account, $kind, 'approval', $item->id, $isPay ? -$amount : $amount, $item->payload['date'], $actor, $reference);
        }
        foreach ($balances as $balance) {
            if (! $amount) break;
            $take = min($amount, (int) $balance->balance);
            $this->entry($employee->id, $balance->commission_award_id, $kind, $kind === 'recovery_waiver' ? $take : 0,
                $isPay ? -$take : 0, $isPay ? 0 : -$take, $isPay ? $take : ($kind === 'recovery_repayment' ? -$take : 0),
                substr($item->payload['notes'], 0, 250), $item);
            $amount -= $take;
        }
    }
}
