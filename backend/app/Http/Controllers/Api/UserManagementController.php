<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Packer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserManagementController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(User::latest()->paginate(25));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:100',
            'username'    => 'required|string|max:32|unique:users,username',
            'password'    => 'required|string|min:6',
            'role'        => 'required|in:admin,cs,packer',
            'packer_code' => 'nullable|string|max:32',
        ]);

        // If role is packer and packer_code is not provided, auto-create packer record
        if ($data['role'] === 'packer') {
            if (empty($data['packer_code'])) {
                $data['packer_code'] = 'PKR' . strtoupper(substr($data['username'], 0, 3));
            }
            Packer::firstOrCreate(
                ['code' => $data['packer_code']],
                ['name' => $data['name'], 'is_active' => true]
            );
        }

        $user = User::create($data);

        return response()->json($user, 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'sometimes|string|max:100',
            'username'    => 'sometimes|string|max:32|unique:users,username,' . $user->id,
            'password'    => 'nullable|string|min:6',
            'role'        => 'sometimes|in:admin,cs,packer',
            'packer_code' => 'nullable|string|max:32',
            'is_active'   => 'sometimes|boolean',
        ]);

        if (! empty($data['password'])) {
            $data['password'] = bcrypt($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);

        // Sync Packer record
        if ($user->role === 'packer' && $user->packer_code) {
            Packer::updateOrCreate(
                ['code' => $user->packer_code],
                ['name' => $user->name, 'active' => $user->is_active]
            );
        } else {
            // If role changed away from packer, remove packer record
            if ($user->packer_code) {
                Packer::where('code', $user->packer_code)->delete();
            }
        }

        return response()->json($user);
    }

    public function destroy(User $user): JsonResponse
    {
        // Also delete associated Packer record
        if ($user->packer_code) {
            Packer::where('code', $user->packer_code)->delete();
        }
        $user->tokens()->delete();
        $user->delete();
        return response()->json(['message' => 'User deleted']);
    }
}
