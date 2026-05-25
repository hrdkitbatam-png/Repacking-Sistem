<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Role::orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:64|unique:roles,name',
            'permissions' => 'nullable|array',
        ]);

        $role = Role::create($data);

        return response()->json($role, 201);
    }

    public function show(Role $role): JsonResponse
    {
        return response()->json($role);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $data = $request->validate([
            'name' => "sometimes|string|max:64|unique:roles,name,{$role->id}",
            'permissions' => 'nullable|array',
        ]);

        $role->update($data);

        return response()->json($role);
    }

    public function destroy(Role $role): JsonResponse
    {
        $role->delete();
        return response()->json(['message' => 'Role deleted']);
    }
}
