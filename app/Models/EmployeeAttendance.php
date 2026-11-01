<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class EmployeeAttendance extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'employee_attendances';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'overtime_hours' => 'decimal:2'];
    }
}
