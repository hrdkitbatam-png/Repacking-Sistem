<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Packer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserManagementController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            User::with('roleRelation:id,name,permissions')->latest()->paginate(25)
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:100',
            'username'    => 'required|string|max:32|unique:users,username',
            'password'    => 'required|string|min:6',
            'role_id'     => 'required|exists:roles,id',
            'packer_code' => 'nullable|string|max:32',
        ]);

        $role = \App\Models\Role::find($data['role_id']);
        $data['role'] = $role->name;

        // If role is packer and packer_code is not provided, auto-create packer record
        if ($role->name === 'packer') {
            if (empty($data['packer_code'])) {
                $data['packer_code'] = 'PKR' . strtoupper(substr($data['username'], 0, 3));
            }
            Packer::firstOrCreate(
                ['code' => $data['packer_code']],
                ['name' => $data['name'], 'active' => true]
            );
        }

        $user = User::create($data);
        AuditLog::log(request()->user()->id, 'create_user', "Created user {$user->name} (@{$user->username}) with role {$role->name}");

        return response()->json($user->load('roleRelation:id,name,permissions'), 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'sometimes|string|max:100',
            'username'    => 'sometimes|string|max:32|unique:users,username,' . $user->id,
            'password'    => 'nullable|string|min:6',
            'role_id'     => 'sometimes|exists:roles,id',
            'packer_code' => 'nullable|string|max:32',
            'is_active'   => 'sometimes|boolean',
        ]);

        if (! empty($data['password'])) {
            $data['password'] = bcrypt($data['password']);
        } else {
            unset($data['password']);
        }

        if (isset($data['role_id'])) {
            $role = \App\Models\Role::find($data['role_id']);
            $data['role'] = $role->name;
        }

        $user->update($data);
        AuditLog::log(request()->user()->id, 'update_user', "Updated user {$user->name} (@{$user->username})");

        // Sync Packer record
        if ($user->role === 'packer' && $user->packer_code) {
            Packer::updateOrCreate(
                ['code' => $user->packer_code],
                ['name' => $user->name, 'active' => $user->is_active]
            );
        } else {
            if ($user->packer_code) {
                Packer::where('code', $user->packer_code)->delete();
            }
        }

        return response()->json($user->load('roleRelation:id,name,permissions'));
    }

    public function destroy(User $user): JsonResponse
    {
        $adminUser = request()->user();
        if ($user->packer_code) {
            Packer::where('code', $user->packer_code)->delete();
        }
        $user->tokens()->delete();
        AuditLog::log($adminUser->id, 'delete_user', "Deleted user {$user->name} (@{$user->username})");
        $user->delete();
        return response()->json(['message' => 'User deleted']);
    }
}
