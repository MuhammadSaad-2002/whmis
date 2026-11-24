<?php

namespace App\Services;

use Illuminate\Support\Facades\{DB, Schema};
use Spatie\Permission\Models\{Permission, Role};
use Throwable;

/** Read-only readiness checks; safe to run before or after a deployment. */
class SystemHealthService
{
    public function checks(): array
    {
        $checks = [];
        $check = function (string $name, callable $run) use (&$checks) {
            try { [$ok, $detail] = $run(); }
            catch (Throwable) { $ok = false; $detail = 'Check failed. Inspect the server log and database connection.'; }
            $checks[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail];
        };
        $check('Database connection', fn () => [DB::connection()->getPdo() !== null, 'Database is reachable.']);
        $check('Database migrations', function () {
            $migrator = app('migrator');
            $pending = array_diff(array_keys($migrator->getMigrationFiles(database_path('migrations'))), $migrator->getRepository()->getRan());
            return [count($pending) === 0, $pending ? 'Pending: '.implode(', ', $pending) : 'All application migrations are registered.'];
        });
        $check('Workflow schema', function () {
            $required = ['employees' => ['is_booker', 'user_id'], 'booker_customer' => ['booker_id', 'customer_id'],
                'booker_assignment_logs' => ['changed_by'], 'bookings' => ['submitted_at', 'last_edited_at'],
                'dispatches' => ['status', 'assigned_to', 'planned_date', 'pickup_confirmed_at'], 'dispatch_events' => ['request_key'],
                'booking_invoice_lines' => ['booking_item_id', 'quantity'], 'sale_batch_allocations' => ['batch_id', 'quantity'],
                'delivery_collections' => ['reported_paisa','verified_paisa'], 'treasury_entries' => ['account_id','source_key'],
                'commission_entries' => ['employee_id','payable_paisa','recovery_paisa'],
                'customer_delivery_schedules' => ['booking_days', 'delivery_days', 'salesman_id', 'delivery_enabled_at'],
                'dispatch_event_items' => ['quantity'], 'collection_follow_ups' => ['next_follow_up'], 'booker_visits' => ['visit_date']];
            $missing = [];
            foreach ($required as $table => $columns) {
                foreach ($columns as $column) if (! Schema::hasColumn($table, $column)) $missing[] = "{$table}.{$column}";
            }
            return [! $missing, $missing ? 'Missing: '.implode(', ', $missing) : 'Booker, HR and operations columns are available.'];
        });
        $check('Operations permissions', function () {
            $names = [...\Database\Seeders\DistributionPermissionSeeder::PERMISSIONS,
                ...\Database\Seeders\DistributionPermissionSeeder::FINANCE_PERMISSIONS, 'bookers.assign', 'commission.manage'];
            $missing = array_diff($names, Permission::where('guard_name', 'web')->pluck('name')->all());
            $root = Role::where('name', 'Super Admin')->where('guard_name', 'web')->first();
            $ungranted = array_diff($names, $root?->permissions->pluck('name')->all() ?? []);
            $salesmanReady = Role::where('name', 'Salesman')->where('guard_name', 'web')
                ->whereHas('permissions', fn ($q) => $q->where('name', 'dispatch.assigned'))->exists();
            $ok = ! $missing && ! $ungranted && $salesmanReady;
            return [$ok, $ok ? 'Operations and Salesman permissions are present.' : 'Run the additive operations permission seed and reset the permission cache.'];
        });
        $check('Compiled frontend', function () {
            $path = public_path('build/manifest.json');
            $manifest = is_file($path) ? json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR) : [];
            $missing = ! isset($manifest['resources/js/app.tsx']);
            foreach ($manifest as $entry) {
                foreach (array_merge([$entry['file']], $entry['css'] ?? []) as $file) {
                    if (! is_file(public_path('build/'.$file))) $missing = true;
                }
            }
            return [! $missing, $missing ? 'Build or deploy public/build, including all manifest assets.' : 'Manifest and compiled assets exist.'];
        });
        $check('Writable application directories', fn () => [is_writable(storage_path()) && is_writable(base_path('bootstrap/cache')),
            'storage and bootstrap/cache must be writable by PHP.']);
        return $checks;
    }
}
