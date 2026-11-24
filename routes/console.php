<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('whmis:check-alerts')->dailyAt('08:00');
Schedule::command('whmis:generate-delivery-plan')->everyThirtyMinutes()->withoutOverlapping();
Schedule::call(fn () => app(\App\Services\CommissionService::class)->resumeExpiredHolds())
    ->name('commission-recovery-hold-expiry')->dailyAt('00:10')->timezone('Asia/Karachi')->withoutOverlapping();
