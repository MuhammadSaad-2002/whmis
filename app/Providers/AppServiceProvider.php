<?php

namespace App\Providers;

use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Payment;
use App\Models\Permission;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\Role;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\StockAdjustment;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Relation::enforceMorphMap([
            'customer' => Customer::class,
            'company' => Company::class,
            'product' => Product::class,
            'sales_invoice' => SalesInvoice::class,
            'purchase_invoice' => PurchaseInvoice::class,
            'stock_adjustment' => StockAdjustment::class,
            'payment' => Payment::class,
            'user' => User::class,
            'booking' => Booking::class,
            'incentive_rule' => IncentiveRule::class,
            'sales_return' => SalesReturn::class,
            'purchase_return' => PurchaseReturn::class,
            'role' => Role::class,
            'permission' => Permission::class,
        ]);
    }
}
