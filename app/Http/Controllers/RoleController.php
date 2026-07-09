<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use App\Models\Role;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class RoleController extends Controller
{
    public function index()
    {
        $roles = Role::with('permissions:id,name')
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'users_count' => $role->users_count,
                'permissions' => $role->permissions->pluck('name'),
            ]);

        return Inertia::render('admin/roles/index', [
            'roles' => $roles,
            'permissionGroups' => $this->groupedPermissions(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $role = Role::create(['name' => $data['name'], 'guard_name' => 'web']);
        $role->syncPermissions($data['permissions'] ?? []);
        AuditLogger::action($role, 'permissions_synced', ['permissions' => $data['permissions'] ?? []]);

        return back()->with('success', 'Role created.');
    }

    public function update(Request $request, Role $role)
    {
        $data = $this->validated($request, $role);

        $role->update(['name' => $data['name']]);
        $role->syncPermissions($data['permissions'] ?? []);
        AuditLogger::action($role, 'permissions_synced', ['permissions' => $data['permissions'] ?? []]);

        return back()->with('success', 'Role updated.');
    }

    public function destroy(Role $role)
    {
        if ($role->name === 'Super Admin') {
            return back()->with('error', 'The Super Admin role cannot be deleted.');
        }

        if ($role->users()->exists()) {
            return back()->with('error', 'Cannot delete a role that still has users assigned.');
        }

        $role->delete();

        return back()->with('success', 'Role deleted.');
    }

    /**
     * @return array<string, string>
     */
    private function validated(Request $request, ?Role $role = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('roles', 'name')->ignore($role?->id)],
            'permissions' => ['array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);
    }

    /**
     * Permission catalog grouped by module (the part before the first dot).
     *
     * @return array<string, array<int, string>>
     */
    private function groupedPermissions(): array
    {
        return Permission::orderBy('name')
            ->pluck('name')
            ->groupBy(fn (string $name) => explode('.', $name)[0])
            ->map(fn ($names) => $names->values())
            ->toArray();
    }
}
