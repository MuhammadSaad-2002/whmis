<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use Inertia\Inertia;

class PermissionController extends Controller
{
    public function index()
    {
        $permissions = Permission::with('roles:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn (Permission $permission) => [
                'name' => $permission->name,
                'module' => explode('.', $permission->name)[0],
                'roles' => $permission->roles->pluck('name'),
            ]);

        return Inertia::render('admin/permissions/index', [
            'groups' => $permissions->groupBy('module'),
        ]);
    }
}
