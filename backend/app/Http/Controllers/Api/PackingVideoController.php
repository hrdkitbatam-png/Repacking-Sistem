<?php

namespace App\Http\Controllers\Api;

use App\Enums\VideoStatus;
use App\Http\Controllers\Controller;
use App\Jobs\CompressAndUploadVideo;
use App\Models\Packer;
use App\Models\PackingVideo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PackingVideoController extends Controller
{
    /**
     * GET /api/packing-videos
     *
     * Paginated, searchable listing for the CS Dashboard. The `order_id`
     * column is indexed (see migration), so search-by-Resi stays sub-ms even
     * with millions of rows.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search'  => ['nullable', 'string', 'max:64'],
            'status'  => ['nullable', 'string'],
            'per_page'=> ['nullable', 'integer', 'min:1', 'max:200'],
            'page'    => ['nullable', 'integer', 'min:1'],
        ]);

        $perPage = $validated['per_page'] ?? 25;

        $query = PackingVideo::query()
            ->with('packer:id,code,name')
            ->search($validated['search'] ?? null)
            ->when($validated['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->latest('id');

        return response()->json($query->paginate($perPage));
    }

    /**
     * GET /api/packing-videos/{id}
     */
    public function show(PackingVideo $packingVideo): JsonResponse
    {
        return response()->json($packingVideo->load('packer:id,code,name'));
    }

    /**
     * GET /api/packing-videos/by-order/{orderId}
     *
     * Convenience endpoint for the Packer Interface: after a recording is
     * finalized, the UI polls this to display "Available" once the queue
     * worker finishes.
     */
    public function byOrder(string $orderId): JsonResponse
    {
        $row = PackingVideo::query()
            ->with('packer:id,code,name')
            ->where('order_id', $orderId)
            ->latest('id')
            ->first();

        if (! $row) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json($row);
    }

    /**
     * POST /api/packing-videos
     *
     * Accepts the raw WebM/MP4 blob from the Packer Interface. We write it
     * to the `tmp_videos` disk and dispatch CompressAndUploadVideo. The HTTP
     * response returns immediately — actual compression happens in a worker.
     *
     * Multipart fields:
     *   - order_id     (string, required)  — barcode/Resi
     *   - packer_code  (string, optional)  — links to packers.code
     *   - recorded_at  (ISO 8601, optional)
     *   - video        (file, required)    — recorded blob
     *   - label_photo  (file, optional)    — snapshot dari kamera label
     */
    public function store(Request $request): JsonResponse
    {
        $maxKb = config('video.max_upload_mb') * 1024;

        $validated = $request->validate([
            'order_id'    => ['required', 'string', 'max:64'],
            'packer_code' => ['nullable', 'string', 'max:32'],
            'recorded_at' => ['nullable', 'date'],
            'video'       => ['required', 'file', "max:{$maxKb}"],
            'label_photo' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ]);

        $packer = null;
        if (! empty($validated['packer_code'])) {
            $packer = Packer::query()->where('code', $validated['packer_code'])->first();
        }

        $file      = $request->file('video');
        $extension = strtolower($file->getClientOriginalExtension() ?: 'webm');
        $filename  = sprintf('%s-%s.%s', Str::ulid(), Str::slug($validated['order_id']), $extension);

        // Stream the upload directly to disk — no in-memory buffering.
        $relativeRawPath = $file->storeAs('raw', $filename, ['disk' => config('video.temp_disk')]);

        $video = PackingVideo::query()->create([
            'order_id'       => $validated['order_id'],
            'packer_id'      => $packer?->id,
            'status'         => VideoStatus::UploadedRaw,
            'raw_path'       => $relativeRawPath,
            'mime_type'      => $file->getClientMimeType(),
            'raw_size_bytes' => $file->getSize(),
            'recorded_at'    => $validated['recorded_at'] ?? now(),
            'uploaded_at'    => now(),
        ]);

        // Save label photo if provided (from dual webcam setup)
        if ($request->hasFile('label_photo')) {
            $labelFile = $request->file('label_photo');
            $labelExt  = $labelFile->getClientOriginalExtension() ?: 'jpg';
            $labelPath = sprintf('labels/%s-%s.%s', Str::ulid(), Str::slug($validated['order_id']), $labelExt);
            $labelFile->storeAs(dirname($labelPath), basename($labelPath), ['disk' => config('video.temp_disk')]);
            $video->update(['label_path' => $labelPath]);
        }

        // Dispatch FFmpeg work asynchronously so the Packer UI is freed
        // to start the next recording immediately.
        CompressAndUploadVideo::dispatch($video->id);

        return response()->json($video->fresh('packer'), 201);
    }

    /**
     * GET /api/packing-videos/{id}/stream
     *
     * Streams the compressed video from MinIO with credentials (no public bucket needed).
     */
    public function stream(PackingVideo $packingVideo)
    {
        if (! $packingVideo->minio_object_key || $packingVideo->status !== VideoStatus::Available) {
            return response()->json(['message' => 'Video not available yet'], 404);
        }

        try {
            return Storage::disk('minio')->response($packingVideo->minio_object_key);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Video file not found'], 404);
        }
    }

    /**
     * GET /api/packing-videos/{id}/label
     *
     * Download label photo.
     */
    public function label(PackingVideo $packingVideo)
    {
        if (! $packingVideo->label_path) {
            return response()->json(['message' => 'No label photo'], 404);
        }

        $disk = Storage::disk(config('video.temp_disk'));
        if (! $disk->exists($packingVideo->label_path)) {
            return response()->json(['message' => 'Label file not found'], 404);
        }

        return $disk->response($packingVideo->label_path);
    }

    /**
     * DELETE /api/packing-videos/{id}
     * (Optional, but useful for the dashboard's "remove" flow.)
     */
    public function destroy(PackingVideo $packingVideo): JsonResponse
    {
        if ($packingVideo->raw_path) {
            $disk = Storage::disk(config('video.temp_disk'));
            if ($disk->exists($packingVideo->raw_path)) {
                $disk->delete($packingVideo->raw_path);
            }
        }
        if ($packingVideo->minio_object_key) {
            Storage::disk('minio')->delete($packingVideo->minio_object_key);
        }
        $packingVideo->delete();

        return response()->json(['deleted' => true]);
    }
}
