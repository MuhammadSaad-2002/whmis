<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Dispatch extends Model
{
    protected $guarded = [];
    public function invoice() { return $this->belongsTo(SalesInvoice::class, 'sales_invoice_id'); }
    public function events() { return $this->hasMany(DispatchEvent::class)->orderBy('id'); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
    public function originalAssignee() { return $this->belongsTo(User::class, 'original_assignee_id'); }
    public function custodian() { return $this->belongsTo(User::class, 'custodian_id'); }
}
