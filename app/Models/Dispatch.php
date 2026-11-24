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

    public function isHistoricalDelivery(): bool
    {
        // Also recognize the original status-only import, which had no assignee or timestamps.
        return $this->status === 'delivered' && ($this->historical_delivered_at !== null || (! $this->custody_required
            && $this->assigned_to === null && $this->planned_date === null && $this->created_at === null));
    }
}
