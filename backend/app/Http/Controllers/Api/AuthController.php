<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('username', $data['username'])->where('is_active', true)->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['username' => 'Invalid credentials or account inactive.']);
        }

        $token = $user->createToken('packer-app')->plainTextToken;

        AuditLog::log($user->id, 'login', "{$user->name} logged in");

        return response()->json([
            'user'  => $this->userData($user),
            'token' => $token,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('roleRelation');
        return response()->json(['user' => $this->userData($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        AuditLog::log($user->id, 'logout', "{$user->name} logged out");
        $user->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out']);
    }

    private function userData(User $user): array
    {
        $role = $user->roleRelation;
        return [
            'id'          => $user->id,
            'name'        => $user->name,
            'username'    => $user->username,
            'role'        => $role?->name ?? $user->role,
            'role_id'     => $user->role_id,
            'permissions' => $role?->permissions ?? [],
            'packer_code' => $user->packer_code,
            'is_active'   => $user->is_active,
        ];
    }
}
