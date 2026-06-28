<?php

namespace App\Http\Controllers\Api;

use App\Enums\VideoStatus;
use App\Http\Controllers\Controller;
use App\Jobs\UploadReturVideo;
use App\Models\AuditLog;
use App\Models\Packer;
use App\Models\ReturVideo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ReturVideoController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search'  => ['nullable', 'string', 'max:64'],
            'per_page'=> ['nullable', 'integer', 'min:1', 'max:200'],
            'page'    => ['nullable', 'integer', 'min:1'],
        ]);

        $perPage = $validated['per_page'] ?? 25;

        $query = ReturVideo::query()
            ->with('packer:id,code,name')
            ->search($validated['search'] ?? null)
            ->latest('id');

        return response()->json($query->paginate($perPage));
    }

    public function show(ReturVideo $returVideo): JsonResponse
    {
        return response()->json($returVideo->load('packer:id,code,name'));
    }

    public function byOrder(string $orderId): JsonResponse
    {
        $row = ReturVideo::query()
            ->with('packer:id,code,name')
            ->where('order_id', $orderId)
            ->latest('id')
            ->first();

        if (! $row) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($row);
    }

    public function store(Request $request): JsonResponse
    {
        $maxKb = config('video.max_upload_mb') * 1024;

        $validated = $request->validate([
            'order_id'    => ['required', 'string', 'max:64'],
            'packer_code' => ['nullable', 'string', 'max:32'],
            'recorded_at' => ['nullable', 'date'],
            'keterangan'  => ['nullable', 'string', 'max:500'],
            'video'       => ['required', 'file', "max:{$maxKb}"],
        ]);

        $packer = null;
        if (! empty($validated['packer_code'])) {
            $packer = Packer::query()->where('code', $validated['packer_code'])->first();
        }

        $file      = $request->file('video');
        $extension = strtolower($file->getClientOriginalExtension() ?: 'webm');
        $filename  = sprintf('retur-%s-%s.%s', Str::ulid(), Str::slug($validated['order_id']), $extension);

        $relativeRawPath = $file->storeAs('raw', $filename, ['disk' => config('video.temp_disk')]);

        $video = ReturVideo::query()->create([
            'order_id'       => $validated['order_id'],
            'packer_id'      => $packer?->id,
            'status'         => VideoStatus::UploadedRaw,
            'raw_path'       => $relativeRawPath,
            'mime_type'      => $file->getClientMimeType(),
            'raw_size_bytes' => $file->getSize(),
            'keterangan'     => $validated['keterangan'] ?? null,
            'recorded_at'    => $validated['recorded_at'] ?? now(),
            'uploaded_at'    => now(),
        ]);

        UploadReturVideo::dispatch($video->id);
        AuditLog::log(request()->user()->id, 'upload_retur', "Uploaded retur video for order {$validated['order_id']}", ['order_id' => $validated['order_id']]);

        return response()->json($video->fresh('packer'), 201);
    }

    public function destroy(ReturVideo $returVideo): JsonResponse
    {
        if ($returVideo->raw_path) {
            $disk = Storage::disk(config('video.temp_disk'));
            if ($disk->exists($returVideo->raw_path)) {
                $disk->delete($returVideo->raw_path);
            }
        }
        if ($returVideo->minio_object_key) {
            Storage::disk('minio')->delete($returVideo->minio_object_key);
        }
        $returVideo->delete();

        return response()->json(['deleted' => true]);
    }
}
