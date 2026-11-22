<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Spatie\Permission\Models\Role;

class ProvisionSystem extends Command
{
    protected $signature = 'whmis:provision';
    protected $description = 'Provision a fresh installation or add upgrade permissions without resetting existing role grants';

    public function handle(): int
    {
        $classes = Role::exists()
            ? [\Database\Seeders\SystemSeeder::class, \Database\Seeders\HrPermissionSeeder::class, \Database\Seeders\DistributionPermissionSeeder::class]
            : [\Database\Seeders\DatabaseSeeder::class];
        foreach ($classes as $class) {
            if ($this->call('db:seed', ['--class' => $class, '--force' => true]) !== 0) return self::FAILURE;
        }
        return self::SUCCESS;
    }
}
