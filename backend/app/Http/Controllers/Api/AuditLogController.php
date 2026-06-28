<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['nullable', 'integer'],
            'action'  => ['nullable', 'string', 'max:64'],
            'from'    => ['nullable', 'date'],
            'to'      => ['nullable', 'date'],
            'per_page'=> ['nullable', 'integer', 'min:1', 'max:200'],
            'page'    => ['nullable', 'integer', 'min:1'],
        ]);

        $perPage = $validated['per_page'] ?? 50;

        $query = AuditLog::query()
            ->with('user:id,name,username')
            ->when($validated['user_id'] ?? null, fn ($q, $uid) => $q->where('user_id', $uid))
            ->when($validated['action'] ?? null, fn ($q, $a) => $q->where('action', $a))
            ->when($validated['from'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($validated['to'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->latest();

        return response()->json($query->paginate($perPage));
    }

    public function actions(): JsonResponse
    {
        $actions = AuditLog::query()
            ->select('action')
            ->distinct()
            ->orderBy('action')
            ->pluck('action');

        return response()->json($actions);
    }
}
