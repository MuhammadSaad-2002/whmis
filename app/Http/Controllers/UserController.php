<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;

class UserController extends Controller
{
    public function index(Request $request)
    {
        // Super Admin accounts and the Super Admin role are invisible to everyone
        // who is not themselves a Super Admin.
        $actorIsSuper = $request->user()->hasRole('Super Admin');

        $users = User::query()
            ->with('roles:id,name')
            ->when($request->search, function ($q, $search) {
                $q->where(fn ($w) => $w
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%"));
            })
            ->when(! $actorIsSuper, fn ($q) => $q->whereDoesntHave(
                'roles', fn ($r) => $r->where('name', 'Super Admin'),
            ))
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('admin/users/index', [
            'users' => $users,
            'roles' => Role::when(! $actorIsSuper, fn ($q) => $q->where('name', '!=', 'Super Admin'))
                ->orderBy('name')->pluck('name'),
            'filters' => $request->only('search'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::defaults()],
            'is_active' => ['boolean'],
            'roles' => ['array'],
            'roles.*' => ['string', 'exists:roles,name'],
        ]);

        if ($this->actorAssigningForbiddenSuperAdmin($request, $data['roles'] ?? [])) {
            return back()->with('error', 'You are not allowed to assign the Super Admin role.');
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'is_active' => $data['is_active'] ?? true,
        ]);
        $user->syncRoles($data['roles'] ?? []);

        return back()->with('success', 'User created.');
    }

    public function update(Request $request, User $user)
    {
        abort_if($this->actorCannotTouchSuperAdmin($request, $user), 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'is_active' => ['boolean'],
            'roles' => ['array'],
            'roles.*' => ['string', 'exists:roles,name'],
        ]);

        if ($this->actorAssigningForbiddenSuperAdmin($request, $data['roles'] ?? [])) {
            return back()->with('error', 'You are not allowed to assign the Super Admin role.');
        }

        // Don't let the last Super Admin lock the system out of itself.
        if ($this->wouldOrphanSuperAdmin($user, $data['roles'] ?? [])) {
            return back()->with('error', 'Cannot remove the Super Admin role from the last Super Admin.');
        }

        $user->update([
            'name' => $data['name'],
            'email' => $data['email'],
            'is_active' => $data['is_active'] ?? $user->is_active,
        ]);
        $user->syncRoles($data['roles'] ?? []);

        return back()->with('success', 'User updated.');
    }

    public function password(Request $request, User $user)
    {
        abort_if($this->actorCannotTouchSuperAdmin($request, $user), 403);

        $request->validate([
            'password' => ['required', 'confirmed', Password::defaults()],
        ]);

        $user->update(['password' => $request->password]);

        return back()->with('success', "Password reset for {$user->name}.");
    }

    public function toggle(Request $request, User $user)
    {
        abort_if($this->actorCannotTouchSuperAdmin($request, $user), 403);

        if ($user->id === auth()->id()) {
            return back()->with('error', 'You cannot deactivate your own account.');
        }

        if ($user->is_active && $this->isLastSuperAdmin($user)) {
            return back()->with('error', 'Cannot deactivate the last Super Admin.');
        }

        $user->update(['is_active' => ! $user->is_active]);

        return back()->with('success', $user->is_active ? 'User activated.' : 'User deactivated.');
    }

    public function destroy(Request $request, User $user)
    {
        abort_if($this->actorCannotTouchSuperAdmin($request, $user), 403);

        if ($user->id === auth()->id()) {
            return back()->with('error', 'You cannot delete your own account.');
        }

        if ($this->isLastSuperAdmin($user)) {
            return back()->with('error', 'Cannot delete the last Super Admin.');
        }

        $user->delete();

        return back()->with('success', 'User deleted.');
    }

    /**
     * A non-Super-Admin may not view or act on a Super Admin account. The user
     * list already hides them, but the routes are id-addressable — block direct hits.
     */
    private function actorCannotTouchSuperAdmin(Request $request, User $target): bool
    {
        return $target->hasRole('Super Admin') && ! $request->user()->hasRole('Super Admin');
    }

    /**
     * Only a Super Admin may grant the Super Admin role.
     *
     * @param  array<int, string>  $newRoles
     */
    private function actorAssigningForbiddenSuperAdmin(Request $request, array $newRoles): bool
    {
        return in_array('Super Admin', $newRoles, true) && ! $request->user()->hasRole('Super Admin');
    }

    private function isLastSuperAdmin(User $user): bool
    {
        return $user->hasRole('Super Admin')
            && User::role('Super Admin')->where('id', '!=', $user->id)->doesntExist();
    }

    /**
     * @param  array<int, string>  $newRoles
     */
    private function wouldOrphanSuperAdmin(User $user, array $newRoles): bool
    {
        return $user->hasRole('Super Admin')
            && ! in_array('Super Admin', $newRoles, true)
            && User::role('Super Admin')->where('id', '!=', $user->id)->doesntExist();
    }
}
