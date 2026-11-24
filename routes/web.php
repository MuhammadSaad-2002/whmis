<?php

use App\Http\Controllers\AuditController;
use App\Http\Controllers\BookerAssignmentController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\CommissionController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\IncentiveRuleController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DistributionFinanceController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\LedgerController;
use App\Http\Controllers\LicenseController;
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
use App\Http\Controllers\SampleIssueController;
use App\Http\Controllers\SampleReceiptController;
use App\Http\Controllers\StaffDailyActivityController;
use App\Http\Controllers\StockLoanController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\AuthorizeOperations;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Spatie\Permission\Middleware\RoleMiddleware;

Route::get('/', fn () => redirect()->route('workspace'))->name('home');

Route::middleware(['auth', 'licensed'])->group(function () {
    Route::get('staff-activity', StaffDailyActivityController::class)->middleware(RoleMiddleware::class.':Super Admin')->name('staff-activity.index');
    Route::get('hr/my-profile', [\App\Http\Controllers\HrController::class, 'selfProfile'])->middleware('can:hr.self.view')->name('hr.self');
    Route::get('hr/employees/{employee}', [\App\Http\Controllers\HrController::class, 'employee'])->middleware('can:employees.view')->name('hr.employee');
    Route::put('hr/employees/{employee}/customers', [\App\Http\Controllers\HrController::class, 'assignCustomers'])->middleware(['can:employees.view', 'can:bookers.assign'])->name('hr.employee.customers');
    Route::get('booker/workday', [\App\Http\Controllers\BookerWorkdayController::class, 'index'])->middleware(AuthorizeOperations::class.':bookings.create,dispatch.assigned')->name('booker.workday');
    Route::put('booker/customers/{customer}/visit', [\App\Http\Controllers\BookerWorkdayController::class, 'visit'])->middleware('can:bookings.create')->name('booker.visit');
    Route::middleware(AuthorizeOperations::class.':dispatch.plan')->group(function () {
        Route::get('dispatch/schedules', [\App\Http\Controllers\DeliveryPlanningController::class, 'index'])->name('dispatch.schedules');
        Route::put('dispatch/schedules', [\App\Http\Controllers\DeliveryPlanningController::class, 'updateMany'])->name('dispatch.schedules.bulk-update');
        Route::get('dispatch/schedules/{customer}/history', [\App\Http\Controllers\DeliveryPlanningController::class, 'history'])->name('dispatch.schedules.history');
        Route::put('dispatch/schedules/{customer}', [\App\Http\Controllers\DeliveryPlanningController::class, 'update'])->name('dispatch.schedules.update');
        Route::post('dispatch/generate-plan', [\App\Http\Controllers\DeliveryPlanningController::class, 'generate'])->name('dispatch.schedules.generate');
        Route::get('dispatch/daily-sheet', [\App\Http\Controllers\DeliveryPlanningController::class, 'sheet'])->name('dispatch.sheet');
    });
    Route::get('dispatch', [\App\Http\Controllers\OperationsController::class, 'dispatches'])->middleware(AuthorizeOperations::class.':dispatch.view,dispatch.assigned')->name('dispatch.index');
    Route::get('dispatch/pick-list', [\App\Http\Controllers\OperationsController::class, 'dispatchPickList'])->middleware(AuthorizeOperations::class.':dispatch.view')->name('dispatch.pick-list');
    Route::get('dispatch/{sale}/preview', [\App\Http\Controllers\OperationsController::class, 'dispatchPreview'])->middleware(AuthorizeOperations::class.':dispatch.view')->name('dispatch.preview');
    Route::get('dispatch/{sale}/move-options', [\App\Http\Controllers\OperationsController::class, 'dispatchMoveOptions'])->middleware(AuthorizeOperations::class.':dispatch.manage')->name('dispatch.move-options');
    Route::get('my-collections', [DistributionFinanceController::class, 'daily'])->middleware('can:dispatch.assigned')->name('distribution.my-collections');
    Route::post('dispatch/{sale}/collection', [DistributionFinanceController::class, 'report'])->middleware('can:dispatch.assigned')->name('distribution.report');
    Route::post('my-collections/{id}/submit', [DistributionFinanceController::class, 'submit'])->middleware('can:dispatch.assigned')->name('distribution.submit');
    Route::get('dispatch/{sale}/picking-pdf', [\App\Http\Controllers\OperationsController::class, 'dispatchPickingPdf'])->middleware(AuthorizeOperations::class.':dispatch.view,dispatch.assigned')->name('dispatch.picking-pdf');
    Route::get('dispatch/{sale}', [\App\Http\Controllers\OperationsController::class, 'dispatch'])->middleware(AuthorizeOperations::class.':dispatch.view,dispatch.assigned')->name('dispatch.show');
    Route::post('dispatch/{sale}/events', [\App\Http\Controllers\OperationsController::class, 'dispatchAction'])->middleware(AuthorizeOperations::class.':dispatch.manage,dispatch.assigned')->name('dispatch.record');
    Route::get('collections', [\App\Http\Controllers\OperationsController::class, 'collections'])->middleware(AuthorizeOperations::class.':collections.view')->name('collections.index');
    Route::get('collections/export.csv', [\App\Http\Controllers\OperationsController::class, 'collectionsCsv'])->middleware(AuthorizeOperations::class.':collections.view')->name('collections.csv');
    Route::get('collections/print.pdf', [\App\Http\Controllers\OperationsController::class, 'collectionsPdf'])->middleware(AuthorizeOperations::class.':collections.view')->name('collections.pdf');
    Route::controller(DistributionFinanceController::class)->group(function () {
        Route::middleware(AuthorizeOperations::class.':distribution.reconcile')->group(function () {
            Route::get('daily-reconciliation', 'daily')->name('distribution.reconcile');
            Route::post('daily-reconciliation/{id}/count', 'countCash');
            Route::post('daily-reconciliation/{id}/close', 'close');
            // Separate middleware checks preserve the requirement to hold both grants.
            Route::post('daily-reconciliation/{id}/post-matching-cash', 'recordMatchingCash')
                ->middleware(AuthorizeOperations::class.':payments.manage')->name('distribution.post-matching-cash');
            Route::post('daily-reconciliation/collection/{id}', 'record')
                ->middleware(AuthorizeOperations::class.':payments.manage');
        });
        Route::middleware(AuthorizeOperations::class.':treasury.view')->group(function () {
            Route::get('treasury', 'treasury')->name('treasury.index');
            Route::get('treasury/accounts/{id}/csv', 'accountExport');
        });
        Route::post('treasury/accounts', 'saveAccount')->middleware(AuthorizeOperations::class.':treasury.manage');
        Route::post('treasury/limits', 'limits')->middleware(AuthorizeOperations::class.':treasury.manage');
        Route::middleware(AuthorizeOperations::class.':finance.review')->group(function () {
            Route::get('finance-approvals', 'approvals')->name('finance.approvals');
            Route::get('finance-approvals/{id}/evidence', 'evidence');
            Route::get('finance-reversals/{kind}/{id}', 'reversalPreview')->whereIn('kind', ['receipt', 'return']);
        });
        Route::post('finance-approvals', 'createApproval')->middleware(AuthorizeOperations::class.':finance.request');
        Route::get('finance-approvals/options', 'approvalOptions')->middleware([
            AuthorizeOperations::class.':finance.request', AuthorizeOperations::class.':finance.review',
        ])->name('finance.approvals.options');
        Route::get('finance-approvals/share-preview', 'approvalSharePreview')->middleware([
            AuthorizeOperations::class.':finance.request', AuthorizeOperations::class.':finance.review',
        ])->name('finance.approvals.share-preview');
        Route::post('finance-approvals/{id}/approve', 'approve')->middleware(AuthorizeOperations::class.':finance.approve');
        Route::post('finance-approvals/{id}/post', 'postApproval')->middleware(AuthorizeOperations::class.':finance.post');
        Route::post('finance-approvals/{id}/withdraw', 'withdraw')->middleware(AuthorizeOperations::class.':finance.request');
    });
    Route::middleware('can:manage-employee-commissions')->group(function () {
        Route::get('commissions', [CommissionController::class, 'index'])->name('commissions.index');
        Route::post('commissions/rules', [CommissionController::class, 'store']);
    });
    Route::get('collections/{sale}', [\App\Http\Controllers\OperationsController::class, 'collection'])->middleware(AuthorizeOperations::class.':collections.view')->name('collections.show');
    Route::post('collections/{sale}/follow-ups', [\App\Http\Controllers\OperationsController::class, 'followUp'])->middleware(AuthorizeOperations::class.':collections.manage')->name('collections.follow-up');
    Route::get('system/health', fn (\App\Services\SystemHealthService $health) => \Inertia\Inertia::render('operations/health', ['checks' => $health->checks()]))->middleware(AuthorizeOperations::class.':system.health')->name('system.health');
    Route::post('hr/employees', [\App\Http\Controllers\HrController::class, 'saveEmployee'])->middleware('can:employees.manage')->name('hr.employees.store');
    Route::put('hr/employees/{employee}', [\App\Http\Controllers\HrController::class, 'saveEmployee'])->middleware('can:employees.manage')->name('hr.employees.update');
    Route::post('hr/employees/{employee}/salary', [\App\Http\Controllers\HrController::class, 'salary'])->middleware('can:hr.payroll.manage')->name('hr.salary');
    Route::post('hr/attendance', [\App\Http\Controllers\HrController::class, 'attendance'])->middleware('can:hr.attendance.manage')->name('hr.attendance');
    Route::delete('hr/attendance/{attendance}', [\App\Http\Controllers\HrController::class, 'removeAttendance'])->middleware('can:hr.attendance.manage')->name('hr.attendance.delete');
    Route::post('hr/leave', [\App\Http\Controllers\HrController::class, 'leave'])->name('hr.leave');
    Route::post('hr/leave/{leave}/decision', [\App\Http\Controllers\HrController::class, 'leaveDecision'])->middleware('can:hr.leave.approve')->name('hr.leave.decision');
    Route::post('hr/settings/{type}', [\App\Http\Controllers\HrController::class, 'setting'])->middleware('can:hr.settings.manage')->name('hr.setting');
    Route::post('hr/payroll', [\App\Http\Controllers\HrController::class, 'generate'])->middleware('can:hr.payroll.manage')->name('hr.payroll.generate');
    Route::get('hr/payroll/{payroll}', [\App\Http\Controllers\HrController::class, 'payroll'])->middleware('can:hr.payroll.view')->name('hr.payroll');
    Route::post('hr/payroll/{payroll}/{action}', [\App\Http\Controllers\HrController::class, 'payrollAction'])->middleware('can:hr.payroll.view')->name('hr.payroll.action');
    Route::put('hr/payslips/{item}', [\App\Http\Controllers\HrController::class, 'adjust'])->middleware('can:hr.payroll.manage')->name('hr.payroll.adjust');
    Route::get('hr/payslips/{item}/pdf', [\App\Http\Controllers\HrController::class, 'payslip'])->name('hr.payslip');
    Route::post('hr/finance', [\App\Http\Controllers\HrController::class, 'cash'])->middleware('can:hr.payroll.pay')->name('hr.cash');
    Route::post('hr/finance/{transaction}/reverse', [\App\Http\Controllers\HrController::class, 'reverse'])->middleware('can:hr.payroll.cancel')->name('hr.cash.reverse');
    Route::get('hr/{section}', [\App\Http\Controllers\HrController::class, 'index'])->name('hr.index');
    // Licensing "system inactive" screen — self-exempted inside EnsureLicensed so
    // gated users can actually reach it (must stay reachable while locked).
    Route::get('license/locked', [LicenseController::class, 'locked'])->name('license.locked');

    // Tabbed workspace shell: hosts every page as an in-app browser tab.
    Route::get('workspace', function (Request $request) {
        $user = $request->user();
        $scope = [
            $request->session()->getId(),
            $user->getAuthIdentifier(),
            $user->getAllPermissions()->pluck('name')->sort()->values()->all(),
            $user->canViewSupplierDetails(),
            $user->can('manage-employee-commissions'),
        ];

        return Inertia::render('workspace/index', [
            // Expose an opaque storage scope. The session ID itself is a credential.
            'tabScope' => hash_hmac('sha256', json_encode($scope, JSON_THROW_ON_ERROR), config('app.key')),
            'searchableReports' => fn () => $user->can('global-search.use') && $user->can('reports.view') && $user->can('view-supplier-details')
                ? collect(ReportService::catalogFor($user))->map(fn ($meta, $key) => [
                    'title' => $meta['title'],
                    'url' => route('reports.show', ['key' => $key], false),
                    'category' => $meta['category'],
                ])->values()->all()
                : [],
        ]);
    })->middleware('cache.headers:no_store')->name('workspace');

    Route::get('dashboard', DashboardController::class)
        ->middleware('can:dashboard.view')->name('dashboard');
    Route::get('dashboard/executive/pdf', [DashboardController::class, 'exportPdf'])
        ->middleware(['can:dashboard.executive', 'can:view-supplier-details'])->name('dashboard.executive.pdf');

    // Master data
    Route::resource('suppliers', CompanyController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->parameters(['suppliers' => 'company'])
        ->middleware(['can:suppliers.view', 'can:view-supplier-details']);
    Route::resource('categories', ProductCategoryController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->parameters(['categories' => 'category'])
        ->middleware('can:categories.view');
    Route::resource('products', ProductController::class)
        ->only(['index'])
        ->middleware('can:products.view');
    Route::resource('products', ProductController::class)
        ->only(['store', 'update', 'destroy'])
        ->middleware(['can:products.view', 'can:products.manage', 'can:view-supplier-details']);
    Route::post('products-import', [ProductController::class, 'import'])
        ->middleware(['can:products.manage', 'can:view-supplier-details'])->name('products.import');
    Route::get('products-import/template', [ProductController::class, 'template'])
        ->middleware(['can:products.manage', 'can:view-supplier-details'])->name('products.template');
    Route::resource('customers', CustomerController::class)
        ->only(['index', 'store', 'update', 'destroy'])
        ->middleware('can:customers.view');
    Route::post('customers-import', [CustomerController::class, 'import'])
        ->middleware('can:customers.manage')->name('customers.import');
    Route::get('customers-import/template', [CustomerController::class, 'template'])
        ->middleware('can:customers.manage')->name('customers.template');

    // Purchases
    Route::middleware(['can:purchases.view', 'can:view-supplier-details'])->group(function () {
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
    Route::middleware(['can:sales.view', 'can:view-supplier-details'])->group(function () {
        Route::get('sales', [SalesInvoiceController::class, 'index'])->name('sales.index');
        Route::get('sales/export', [SalesInvoiceController::class, 'exportList'])->name('sales.export');
        Route::get('sales/list/pdf', [SalesInvoiceController::class, 'printList'])->name('sales.list.pdf');
        Route::post('sales/post-selected', [SalesInvoiceController::class, 'postSelected'])
            ->middleware('can:sales.post')->name('sales.post-selected');
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
        Route::get('sales/{sale}/summary', [SalesInvoiceController::class, 'summary'])->name('sales.summary');
        Route::get('sales/{sale}/preview', [SalesInvoiceController::class, 'preview'])->name('sales.preview');
        Route::get('sales/{sale}/net-position/print', [SalesInvoiceController::class, 'netPositionPdf'])->name('sales.net-position');
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
            ->middleware(['can:bookings.convert', 'can:view-supplier-details'])->name('bookings.convert');
        Route::post('bookings/{booking}/close-remainder', [BookingController::class, 'closeRemainder'])
            ->middleware(['can:bookings.convert', 'can:view-supplier-details'])->name('bookings.close-remainder');
    });

    // Samples — free-of-charge stock in (receipts) and out (issues), segregated
    // from normal trade. No money, no ledger; separate from bonus.
    Route::middleware(['can:samples.view', 'can:view-supplier-details'])->prefix('samples')->group(function () {
        // Sample receipts (FOC stock in from a supplier)
        Route::get('receipts', [SampleReceiptController::class, 'index'])->name('samples.receipts.index');
        Route::get('receipts/create', [SampleReceiptController::class, 'create'])
            ->middleware('can:samples.receive')->name('samples.receipts.create');
        Route::post('receipts', [SampleReceiptController::class, 'store'])
            ->middleware('can:samples.receive')->name('samples.receipts.store');
        Route::get('receipts/{receipt}', [SampleReceiptController::class, 'edit'])->name('samples.receipts.edit');
        Route::put('receipts/{receipt}', [SampleReceiptController::class, 'update'])
            ->middleware('can:samples.receive')->name('samples.receipts.update');
        Route::delete('receipts/{receipt}', [SampleReceiptController::class, 'destroy'])
            ->middleware('can:samples.receive')->name('samples.receipts.destroy');
        Route::post('receipts/{receipt}/post', [SampleReceiptController::class, 'post'])
            ->middleware('can:samples.post')->name('samples.receipts.post');
        Route::post('receipts/{receipt}/cancel', [SampleReceiptController::class, 'cancel'])
            ->middleware('can:samples.cancel')->name('samples.receipts.cancel');
        Route::get('receipts/{receipt}/print', [SampleReceiptController::class, 'print'])->name('samples.receipts.print');

        // Sample issues (FOC stock out to a customer)
        Route::get('issues', [SampleIssueController::class, 'index'])->name('samples.issues.index');
        Route::get('issues/create', [SampleIssueController::class, 'create'])
            ->middleware('can:samples.issue')->name('samples.issues.create');
        Route::post('issues', [SampleIssueController::class, 'store'])
            ->middleware('can:samples.issue')->name('samples.issues.store');
        Route::get('issues/{issue}', [SampleIssueController::class, 'edit'])->name('samples.issues.edit');
        Route::put('issues/{issue}', [SampleIssueController::class, 'update'])
            ->middleware('can:samples.issue')->name('samples.issues.update');
        Route::delete('issues/{issue}', [SampleIssueController::class, 'destroy'])
            ->middleware('can:samples.issue')->name('samples.issues.destroy');
        Route::post('issues/{issue}/post', [SampleIssueController::class, 'post'])
            ->middleware('can:samples.post')->name('samples.issues.post');
        Route::post('issues/{issue}/cancel', [SampleIssueController::class, 'cancel'])
            ->middleware('can:samples.cancel')->name('samples.issues.cancel');
        Route::get('issues/{issue}/print', [SampleIssueController::class, 'print'])->name('samples.issues.print');
    });

    // Stock loans — products received on loan (in) or loaned out (out). No money,
    // segregated stock. Literal in/out routes precede the {loan} model binding.
    Route::middleware(['can:loans.view', 'can:view-supplier-details'])->prefix('loans')->group(function () {
        Route::get('{direction}', [StockLoanController::class, 'index'])
            ->whereIn('direction', ['in', 'out'])->name('loans.index');
        Route::get('{direction}/create', [StockLoanController::class, 'create'])
            ->whereIn('direction', ['in', 'out'])
            ->middleware('can:loans.create')->name('loans.create');
        Route::post('/', [StockLoanController::class, 'store'])
            ->middleware('can:loans.create')->name('loans.store');
        Route::get('{loan}/edit', [StockLoanController::class, 'edit'])
            ->whereNumber('loan')->name('loans.edit');
        Route::put('{loan}', [StockLoanController::class, 'update'])
            ->whereNumber('loan')->middleware('can:loans.create')->name('loans.update');
        Route::delete('{loan}', [StockLoanController::class, 'destroy'])
            ->whereNumber('loan')->middleware('can:loans.create')->name('loans.destroy');
        Route::post('{loan}/post', [StockLoanController::class, 'post'])
            ->whereNumber('loan')->middleware('can:loans.post')->name('loans.post');
        Route::post('{loan}/return', [StockLoanController::class, 'recordReturn'])
            ->whereNumber('loan')->middleware('can:loans.return')->name('loans.return');
        Route::post('{loan}/cancel', [StockLoanController::class, 'cancel'])
            ->whereNumber('loan')->middleware('can:loans.cancel')->name('loans.cancel');
        Route::post('{loan}/close', [StockLoanController::class, 'close'])
            ->whereNumber('loan')->middleware('can:loans.cancel')->name('loans.close');
    });

    // Returns
    Route::middleware(['can:returns.view', 'can:view-supplier-details'])->prefix('returns')->group(function () {
        Route::get('sales', [ReturnController::class, 'salesIndex'])->name('returns.sales.index');
        Route::get('sales/create', [ReturnController::class, 'salesCreate'])
            ->middleware('can:returns.manage')->name('returns.sales.create');
        Route::post('sales', [ReturnController::class, 'salesStore'])
            ->middleware('can:returns.manage')->name('returns.sales.store');
        Route::get('sales/{salesReturn}', [ReturnController::class, 'salesShow'])->name('returns.sales.show');
        Route::post('sales/{salesReturn}/cancel', [ReturnController::class, 'salesCancel'])
            ->middleware('can:returns.manage')->name('returns.sales.cancel');
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
        ->middleware(['can:incentives.view', 'can:view-supplier-details']);

    // Inventory
    Route::middleware(['can:inventory.view', 'can:view-supplier-details'])->group(function () {
        Route::get('inventory', [InventoryController::class, 'index'])->name('inventory.index');
        Route::get('inventory/batches', [InventoryController::class, 'batches'])->name('inventory.batches');
        Route::get('inventory/movements', [InventoryController::class, 'movements'])->name('inventory.movements');
        Route::post('inventory/adjustments', [InventoryController::class, 'storeAdjustment'])
            ->middleware('can:inventory.adjust')->name('inventory.adjustments.store');
    });

    // Payments & ledger
    Route::middleware(['can:payments.view', 'can:view-supplier-details'])->group(function () {
        Route::get('payments', [PaymentController::class, 'index'])->name('payments.index');
        Route::post('payments', [PaymentController::class, 'store'])
            ->middleware('can:payments.manage')->name('payments.store');
        Route::post('payments/{payment}/cancel', [PaymentController::class, 'cancel'])
            ->middleware('can:payments.manage')->name('payments.cancel');
    });

    Route::middleware(['can:ledger.view', 'can:view-supplier-details'])->group(function () {
        Route::get('ledger/position', [LedgerController::class, 'position'])->name('ledger.position');
        Route::get('ledger/position/pdf', [LedgerController::class, 'positionPdf'])->name('ledger.position.pdf');
        Route::get('ledger/customers/{customer}', [LedgerController::class, 'customer'])->name('ledger.customer');
        Route::get('ledger/customers/{customer}/pdf', [LedgerController::class, 'customerStatementPdf'])->name('ledger.customer.pdf');
        Route::get('ledger/suppliers/{company}', [LedgerController::class, 'company'])->name('ledger.supplier');
        Route::get('ledger/suppliers/{company}/pdf', [LedgerController::class, 'companyStatementPdf'])->name('ledger.supplier.pdf');
    });

    // Reports
    Route::middleware(['can:reports.view', 'can:view-supplier-details'])->group(function () {
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
    // Licensing (Super Admin only via license.view/license.manage — hidden from Admins).
    Route::middleware('can:license.view')->group(function () {
        Route::get('license', [LicenseController::class, 'index'])->name('license.index');
        Route::post('license', [LicenseController::class, 'store'])
            ->middleware('can:license.manage')->name('license.store');
    });
    Route::get('audit-log', [AuditController::class, 'index'])
        ->middleware(['can:audit.view', 'can:view-supplier-details'])->name('audit.index');
    Route::get('booker-assignments', [BookerAssignmentController::class, 'index'])
        ->middleware(['can:audit.view', 'can:view-supplier-details'])->name('booker-assignments.index');

    // Notifications (bell)
    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('notifications/{id}/read', [NotificationController::class, 'markRead'])->name('notifications.read');
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');

    // JSON lookups for the keyboard grid and forms
    Route::prefix('lookup')->group(function () {
        Route::get('products', [LookupController::class, 'products'])->name('lookup.products');
        Route::get('products/{product}/batches', [LookupController::class, 'batches'])->name('lookup.batches');
        Route::get('products/{product}/all-batches', [LookupController::class, 'allBatches'])
            ->middleware('can:view-supplier-details')->name('lookup.all-batches');
        Route::get('open-invoices', [LookupController::class, 'openInvoices'])->name('lookup.open-invoices');
        Route::get('rules', [LookupController::class, 'rules'])->name('lookup.rules');
    });
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
