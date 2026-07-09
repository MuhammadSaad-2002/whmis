<?php

namespace App\Models;

use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;
use Spatie\Permission\Models\Permission as SpatiePermission;

/**
 * App Permission model — extends spatie's so it can be audited and morph-mapped.
 * Registered via config/permission.php and the morph map.
 */
class Permission extends SpatiePermission implements AuditableContract
{
    use Auditable;
}
