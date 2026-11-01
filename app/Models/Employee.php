<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Employee extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'employees';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['joining_date' => 'date:Y-m-d', 'leaving_date' => 'date:Y-m-d', 'weekly_off_days' => 'array', 'is_booker' => 'boolean'];
    }

    public function user() { return $this->belongsTo(User::class); }
    public function department() { return $this->belongsTo(HrDepartment::class); }
    public function designation() { return $this->belongsTo(HrDesignation::class); }
    public function manager() { return $this->belongsTo(self::class, 'manager_id'); }
    public function salaries() { return $this->hasMany(EmployeeSalary::class)->orderByDesc('effective_from'); }
    public function transactions() { return $this->hasMany(HrTransaction::class); }
}
