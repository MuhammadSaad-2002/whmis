<?php

namespace App\Models;

use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;
use Spatie\Permission\Models\Role as SpatieRole;

/**
 * App Role model — extends spatie's so role create/update/delete is audited.
 * Registered via config/permission.php and the morph map.
 */
class Role extends SpatieRole implements AuditableContract
{
    use Auditable;
}
