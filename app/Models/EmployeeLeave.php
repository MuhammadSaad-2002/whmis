<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class EmployeeLeave extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'employee_leaves';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['from_date' => 'date:Y-m-d', 'to_date' => 'date:Y-m-d', 'is_paid' => 'boolean'];
    }

    public function employee() { return $this->belongsTo(Employee::class); }
    public function leaveType() { return $this->belongsTo(HrLeaveType::class); }
}
