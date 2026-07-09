<?php

use App\Http\Controllers\AuditController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\IncentiveRuleController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\LedgerController;
use App\Http\Controllers\LookupController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\ProductCategoryController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PurchaseInvoiceController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ReturnController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SalesInvoiceController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect()->route('dashboard'))->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', DashboardController::class)
        ->middleware('can:dashboard.view')->name('dashboard');

    // Master data
    Route::resource('suppliers', CompanyController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->parameters(['suppliers' => 'company'])
        ->middleware('can:suppliers.view');
    Route::resource('categories', ProductCategoryController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->parameters(['categories' => 'category'])
        ->middleware('can:categories.view');
    Route::resource('products', ProductController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->middleware('can:products.view');
    Route::post('products-import', [ProductController::class, 'import'])
        ->middleware('can:products.manage')->name('products.import');
    Route::get('products-import/template', [ProductController::class, 'template'])
        ->middleware('can:products.manage')->name('products.template');
    Route::resource('customers', CustomerController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->middleware('can:customers.view');
    Route::post('customers-import', [CustomerController::class, 'import'])
        ->middleware('can:customers.manage')->name('customers.import');
    Route::get('customers-import/template', [CustomerController::class, 'template'])
        ->middleware('can:customers.manage')->name('customers.template');

    // Purchases
    Route::middleware('can:purchases.view')->group(function () {
        Route::get('purchases', [PurchaseInvoiceController::class, 'index'])->name('purchases.index');
        Route::get('purchases/create', [PurchaseInvoiceController::class, 'create'])
            ->middleware('can:purchases.create')->name('purchases.create');
        Route::post('purchases', [PurchaseInvoiceController::class, 'store'])
            ->middleware('can:purchases.create')->name('purchases.store');
        Route::get('purchases/{purchase}', [PurchaseInvoiceController::class, 'edit'])->name('purchases.edit');
        Route::put('purchases/{purchase}', [PurchaseInvoiceController::class, 'update'])
            ->middleware('can:purchases.create')->name('purchases.update');
        Route::delete('purchases/{purchase}', [PurchaseInvoiceController::class, 'destroy'])
            ->middleware('can:purchases.create')->name('purchases.destroy');
        Route::post('purchases/{purchase}/post', [PurchaseInvoiceController::class, 'post'])
            ->middleware('can:purchases.post')->name('purchases.post');
        Route::post('purchases/{purchase}/cancel', [PurchaseInvoiceController::class, 'cancel'])
            ->middleware('can:purchases.cancel')->name('purchases.cancel');
        Route::post('purchases/{purchase}/duplicate', [PurchaseInvoiceController::class, 'duplicate'])
            ->middleware('can:purchases.create')->name('purchases.duplicate');
        Route::get('purchases/{purchase}/print', [PurchaseInvoiceController::class, 'print'])->name('purchases.print');
    });

    // Sales
    Route::middleware('can:sales.view')->group(function () {
        Route::get('sales', [SalesInvoiceController::class, 'index'])->name('sales.index');
        Route::get('sales/create', [SalesInvoiceController::class, 'create'])
            ->middleware('can:sales.create')->name('sales.create');
        Route::post('sales', [SalesInvoiceController::class, 'store'])
            ->middleware('can:sales.create')->name('sales.store');
        Route::get('sales/{sale}', [SalesInvoiceController::class, 'edit'])->name('sales.edit');
        Route::put('sales/{sale}', [SalesInvoiceController::class, 'update'])
            ->middleware('can:sales.create')->name('sales.update');
        Route::delete('sales/{sale}', [SalesInvoiceController::class, 'destroy'])
            ->middleware('can:sales.create')->name('sales.destroy');
        Route::post('sales/{sale}/post', [SalesInvoiceController::class, 'post'])
            ->middleware('can:sales.post')->name('sales.post');
        Route::post('sales/{sale}/cancel', [SalesInvoiceController::class, 'cancel'])
            ->middleware('can:sales.cancel')->name('sales.cancel');
        Route::get('sales/{sale}/print', [SalesInvoiceController::class, 'print'])->name('sales.print');
    });

    // Bookings
    Route::middleware('can:bookings.view')->group(function () {
        Route::get('bookings', [BookingController::class, 'index'])->name('bookings.index');
        Route::get('bookings/create', [BookingController::class, 'create'])
            ->middleware('can:bookings.create')->name('bookings.create');
        Route::post('bookings', [BookingController::class, 'store'])
            ->middleware('can:bookings.create')->name('bookings.store');
        Route::get('bookings/{booking}', [BookingController::class, 'edit'])->name('bookings.edit');
        Route::put('bookings/{booking}', [BookingController::class, 'update'])
            ->middleware('can:bookings.create')->name('bookings.update');
        Route::post('bookings/{booking}/submit', [BookingController::class, 'submit'])
            ->middleware('can:bookings.create')->name('bookings.submit');
        Route::post('bookings/{booking}/approve', [BookingController::class, 'approve'])
            ->middleware('can:bookings.approve')->name('bookings.approve');
        Route::post('bookings/{booking}/reject', [BookingController::class, 'reject'])
            ->middleware('can:bookings.approve')->name('bookings.reject');
        Route::post('bookings/{booking}/cancel', [BookingController::class, 'cancel'])->name('bookings.cancel');
        Route::post('bookings/{booking}/convert', [BookingController::class, 'convert'])
            ->middleware('can:bookings.convert')->name('bookings.convert');
    });

    // Returns
    Route::middleware('can:returns.view')->prefix('returns')->group(function () {
        Route::get('sales', [ReturnController::class, 'salesIndex'])->name('returns.sales.index');
        Route::get('sales/create', [ReturnController::class, 'salesCreate'])
            ->middleware('can:returns.manage')->name('returns.sales.create');
        Route::post('sales', [ReturnController::class, 'salesStore'])
            ->middleware('can:returns.manage')->name('returns.sales.store');
        Route::get('purchases', [ReturnController::class, 'purchaseIndex'])->name('returns.purchases.index');
        Route::get('purchases/create', [ReturnController::class, 'purchaseCreate'])
            ->middleware('can:returns.manage')->name('returns.purchases.create');
        Route::post('purchases', [ReturnController::class, 'purchaseStore'])
            ->middleware('can:returns.manage')->name('returns.purchases.store');
        Route::get('lookup/invoices', [ReturnController::class, 'lookupInvoices'])->name('returns.lookup.invoices');
        Route::get('lookup/invoices/{sale}/returnable', [ReturnController::class, 'lookupReturnable'])->name('returns.lookup.returnable');
        Route::get('lookup/purchase-invoices', [ReturnController::class, 'lookupPurchaseInvoices'])->name('returns.lookup.purchase-invoices');
        Route::get('lookup/purchase-invoices/{purchase}/returnable', [ReturnController::class, 'lookupPurchaseReturnable'])->name('returns.lookup.purchase-returnable');
    });

    // Incentive rules
    Route::resource('incentives', IncentiveRuleController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->parameters(['incentives' => 'incentive'])
        ->middleware('can:incentives.view');

    // Inventory
    Route::middleware('can:inventory.view')->group(function () {
        Route::get('inventory', [InventoryController::class, 'index'])->name('inventory.index');
        Route::get('inventory/batches', [InventoryController::class, 'batches'])->name('inventory.batches');
        Route::get('inventory/movements', [InventoryController::class, 'movements'])->name('inventory.movements');
        Route::post('inventory/adjustments', [InventoryController::class, 'storeAdjustment'])
            ->middleware('can:inventory.adjust')->name('inventory.adjustments.store');
    });

    // Payments & ledger
    Route::middleware('can:payments.view')->group(function () {
        Route::get('payments', [PaymentController::class, 'index'])->name('payments.index');
        Route::post('payments', [PaymentController::class, 'store'])
            ->middleware('can:payments.manage')->name('payments.store');
        Route::post('payments/{payment}/cancel', [PaymentController::class, 'cancel'])
            ->middleware('can:payments.manage')->name('payments.cancel');
    });

    Route::middleware('can:ledger.view')->group(function () {
        Route::get('ledger/outstanding', [LedgerController::class, 'outstanding'])->name('ledger.outstanding');
        Route::get('ledger/customers/{customer}', [LedgerController::class, 'customer'])->name('ledger.customer');
        Route::get('ledger/customers/{customer}/pdf', [LedgerController::class, 'customerStatementPdf'])->name('ledger.customer.pdf');
        Route::get('ledger/suppliers/{company}', [LedgerController::class, 'company'])->name('ledger.supplier');
        Route::get('ledger/suppliers/{company}/pdf', [LedgerController::class, 'companyStatementPdf'])->name('ledger.supplier.pdf');
    });

    // Reports
    Route::middleware('can:reports.view')->group(function () {
        Route::get('reports', [ReportController::class, 'index'])->name('reports.index');
        Route::get('reports/{key}', [ReportController::class, 'show'])->name('reports.show');
    });

    // Administration: users, roles & permissions, audit trail
    Route::middleware('can:users.manage')->group(function () {
        Route::resource('users', UserController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::put('users/{user}/password', [UserController::class, 'password'])->name('users.password');
        Route::post('users/{user}/toggle', [UserController::class, 'toggle'])->name('users.toggle');
    });
    Route::middleware('can:roles.manage')->group(function () {
        Route::resource('roles', RoleController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::get('permissions', [PermissionController::class, 'index'])->name('permissions.index');
    });
    Route::get('audit-log', [AuditController::class, 'index'])
        ->middleware('can:audit.view')->name('audit.index');

    // Notifications (bell)
    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('notifications/{id}/read', [NotificationController::class, 'markRead'])->name('notifications.read');
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');

    // JSON lookups for the keyboard grid and forms
    Route::prefix('lookup')->group(function () {
        Route::get('products', [LookupController::class, 'products'])->name('lookup.products');
        Route::get('products/{product}/batches', [LookupController::class, 'batches'])->name('lookup.batches');
        Route::get('products/{product}/all-batches', [LookupController::class, 'allBatches'])->name('lookup.all-batches');
        Route::get('open-invoices', [LookupController::class, 'openInvoices'])->name('lookup.open-invoices');
        Route::get('rules', [LookupController::class, 'rules'])->name('lookup.rules');
    });
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
