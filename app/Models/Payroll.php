<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Payroll extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'payrolls';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['period' => 'date:Y-m-d', 'active_period' => 'date:Y-m-d', 'posting_date' => 'date:Y-m-d'];
    }

    public function items() { return $this->hasMany(PayrollItem::class); }
}
