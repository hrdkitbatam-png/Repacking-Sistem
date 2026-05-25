<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PackerController;
use App\Http\Controllers\Api\PackingVideoController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\UserManagementController;
use App\Http\Controllers\Api\StorageController;
use Illuminate\Support\Facades\Route;

// Public
Route::post('login',  [AuthController::class, 'login']);
Route::get('health',  fn () => response()->json(['ok' => true]));

// Authenticated
Route::middleware('auth:sanctum')->group(function () {
    Route::get('me',            [AuthController::class, 'me']);
    Route::post('logout',       [AuthController::class, 'logout']);

    // Packing videos
    Route::prefix('packing-videos')->group(function () {
        Route::get('/',                  [PackingVideoController::class, 'index']);
        Route::post('/',                 [PackingVideoController::class, 'store']);
        Route::get('by-order/{orderId}', [PackingVideoController::class, 'byOrder']);
        Route::get('{packingVideo}/stream', [PackingVideoController::class, 'stream']);
        Route::get('{packingVideo}/label',  [PackingVideoController::class, 'label']);
        Route::post('{packingVideo}/retry', [PackingVideoController::class, 'retry']);
        Route::get('{packingVideo}',     [PackingVideoController::class, 'show']);
        Route::delete('{packingVideo}',  [PackingVideoController::class, 'destroy']);
    });

    // Packers
    Route::get('packers', [PackerController::class, 'index']);

    // User management (admin only via middleware in controller OR here)
    Route::prefix('users')->group(function () {
        Route::get('/',     [UserManagementController::class, 'index']);
        Route::post('/',    [UserManagementController::class, 'store']);
        Route::put('{user}',    [UserManagementController::class, 'update']);
        Route::delete('{user}', [UserManagementController::class, 'destroy']);
    });

    // Roles management
    Route::apiResource('roles', RoleController::class);

    // Storage status
    Route::get('storage/status', [StorageController::class, 'status']);
});
