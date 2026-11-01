<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class EmployeeSalary extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'employee_salaries';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['effective_from' => 'date:Y-m-d', 'basic' => 'decimal:2', 'allowances' => 'decimal:2', 'overtime_rate' => 'decimal:2', 'sales_target' => 'decimal:2'];
    }
}
