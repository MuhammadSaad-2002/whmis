<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class PayrollItem extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'payroll_items';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['snapshot' => 'array'];
    }

    public function employee() { return $this->belongsTo(Employee::class); }
    public function payroll() { return $this->belongsTo(Payroll::class); }
    public function transactions() { return $this->hasMany(HrTransaction::class); }
}
