<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinancialAccount extends Model
{
    protected $guarded = [];

    protected function casts(): array { return ['active' => 'boolean']; }

    public function operators() { return $this->belongsToMany(User::class, 'financial_account_users', 'account_id'); }
}
