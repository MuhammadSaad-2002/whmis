<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class HrLeaveType extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'hr_leave_types';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_paid' => 'boolean', 'is_active' => 'boolean'];
    }
}
