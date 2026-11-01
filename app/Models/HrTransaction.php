<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class HrTransaction extends Model implements AuditableContract
{
    use Auditable;

    protected $table = 'hr_transactions';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'expense' => 'decimal:2', 'payable' => 'decimal:2', 'advance' => 'decimal:2', 'cash_out' => 'decimal:2'];
    }

    public function employee() { return $this->belongsTo(Employee::class); }
    public function reversal() { return $this->hasOne(self::class, 'reverses_id'); }
    public function payrollItem() { return $this->belongsTo(PayrollItem::class); }
}
