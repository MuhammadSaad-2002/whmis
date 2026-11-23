<?php

namespace App\Console\Commands;

use App\Services\DeliveryPlanningService;
use Illuminate\Console\Command;

class GenerateDeliveryPlan extends Command
{
    protected $signature = 'whmis:generate-delivery-plan';

    protected $description = 'Create scheduled Booker visits and delivery tasks for eligible posted invoices';

    public function handle(DeliveryPlanningService $planning): int
    {
        $result = $planning->generate();
        $this->info("Planned {$result['visits']} booking visit(s) and {$result['dispatches']} delivery task(s).");

        return self::SUCCESS;
    }
}
