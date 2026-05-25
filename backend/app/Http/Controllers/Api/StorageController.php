<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class StorageController extends Controller
{
    public function status(): JsonResponse
    {
        $minioPath = '/data/minio';
        $total = disk_total_space($minioPath);
        $free = disk_free_space($minioPath);
        $used = $total - $free;

        // Also check DB count
        $videoCount = \App\Models\PackingVideo::count();
        $totalBytes = \App\Models\PackingVideo::sum('compressed_size_bytes') ?? 0;

        return response()->json([
            'disk' => [
                'total_gb'     => round($total / 1073741824, 1),
                'used_gb'      => round($used / 1073741824, 1),
                'free_gb'      => round($free / 1073741824, 1),
                'percent_used' => $total > 0 ? round(($used / $total) * 100, 1) : 0,
            ],
            'database' => [
                'video_count'       => $videoCount,
                'total_size_gb'     => round($totalBytes / 1073741824, 2),
            ],
            'retention_days' => 30,
        ]);
    }
}
