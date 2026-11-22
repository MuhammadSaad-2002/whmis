<?php

namespace App\Console\Commands;

use App\Services\SystemHealthService;
use Illuminate\Console\Command;

class SystemDoctor extends Command
{
    protected $signature = 'whmis:doctor {--json : Machine-readable readiness results}';
    protected $description = 'Read-only checks for missing migrations, workflow schema, permissions and frontend assets';

    public function handle(SystemHealthService $health): int
    {
        $checks = $health->checks();
        if ($this->option('json')) $this->line(json_encode($checks, JSON_PRETTY_PRINT));
        else $this->table(['Check', 'Status', 'Details'], array_map(fn ($c) => [$c['name'], $c['ok'] ? 'PASS' : 'FAIL', $c['detail']], $checks));
        return collect($checks)->contains(fn ($c) => ! $c['ok']) ? self::FAILURE : self::SUCCESS;
    }
}
