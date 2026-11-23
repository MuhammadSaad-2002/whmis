<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use OwenIt\Auditing\Auditable as AuditableTrait;
use OwenIt\Auditing\Contracts\Auditable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements Auditable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use AuditableTrait, HasFactory, HasRoles, Notifiable;

    /** UI entry points for modules that expose suppliers or purchasing details. */
    public const SUPPLIER_MODULE_PERMISSIONS = [
        'suppliers.view', 'suppliers.manage', 'products.manage', 'products.view_cost',
        'dashboard.executive', 'dashboard.view_all', 'purchases.view', 'sales.view',
        'samples.view', 'loans.view', 'returns.view', 'incentives.view', 'bookings.convert',
        'inventory.view', 'payments.view', 'ledger.view', 'reports.view', 'audit.view',
    ];

    public function isFieldBooker(): bool
    {
        // A field Booker stays restricted even if extra operational grants have
        // been assigned. Admin roles keep their existing operational access.
        return $this->hasRole('Booker') && ! $this->hasAnyRole(['Admin', 'Super Admin']);
    }

    public function canViewSupplierDetails(): bool
    {
        return ! $this->isFieldBooker();
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'is_active',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Attributes never written to the audit trail.
     *
     * @var array<int, string>
     */
    protected $auditExclude = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    /** Customers this user (as a booker) is assigned to. */
    public function assignedCustomers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'booker_customer', 'booker_id', 'customer_id')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }
}
