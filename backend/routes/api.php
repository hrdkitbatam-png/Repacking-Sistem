<?php

use App\Http\Controllers\Api\PackerController;
use App\Http\Controllers\Api\PackingVideoController;
use Illuminate\Support\Facades\Route;

Route::prefix('packing-videos')->group(function () {
    Route::get('/',                 [PackingVideoController::class, 'index']);
    Route::post('/',                [PackingVideoController::class, 'store']);
    Route::get('by-order/{orderId}',[PackingVideoController::class, 'byOrder']);
    Route::get('{packingVideo}/stream', [PackingVideoController::class, 'stream']);
    Route::get('{packingVideo}',    [PackingVideoController::class, 'show']);
    Route::delete('{packingVideo}', [PackingVideoController::class, 'destroy']);
});

Route::get('packers', [PackerController::class, 'index']);

Route::get('health', fn () => response()->json(['ok' => true]));
