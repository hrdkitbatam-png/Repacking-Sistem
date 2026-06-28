<?php

namespace App\Jobs;

use App\Enums\VideoStatus;
use App\Models\ReturVideo;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class UploadReturVideo implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 300;

    public function __construct(public int $videoId)
    {
        $this->onQueue('repack-queue');
    }

    public function handle(): void
    {
        $video = ReturVideo::query()->find($this->videoId);
        if (! $video) {
            Log::warning('UploadReturVideo: video row vanished', ['id' => $this->videoId]);
            return;
        }

        $tmpDisk = Storage::disk(config('video.temp_disk'));
        if (! $video->raw_path || ! $tmpDisk->exists($video->raw_path)) {
            $this->fail($video, 'Raw file missing: ' . $video->raw_path);
            return;
        }

        $rawAbsolute = $tmpDisk->path($video->raw_path);
        $rawExt      = strtolower(pathinfo($video->raw_path, PATHINFO_EXTENSION)) ?: 'webm';

        $video->update([
            'status'        => VideoStatus::Compressing,
            'error_message' => null,
        ]);

        try {
            $now       = now();
            $packerCode = optional($video->packer)->code ?: 'unknown';
            $safeOrder  = preg_replace('/[^A-Za-z0-9_\-]/', '_', $video->order_id);
            $objectKey = sprintf(
                '%s/%s/%s/%s/%s-%d.%s',
                $now->format('Y'), $now->format('m'), $now->format('d'),
                $packerCode, $safeOrder, $now->getTimestamp(),
                ltrim($rawExt, '.'),
            );

            $mimeType = $video->mime_type ?? 'video/webm';
            $returDisk = Storage::disk('retur_minio');
            $returDisk->put($objectKey, fopen($rawAbsolute, 'rb'), [
                'visibility'  => 'public',
                'ContentType' => $mimeType,
            ]);

            $bucket  = config('video.retur_minio_bucket', 'retur-videos');
            $baseUrl = rtrim(config('video.retur_minio_public_url', ''), '/');
            $publicUrl = $baseUrl . '/' . $bucket . '/' . ltrim($objectKey, '/');

            $video->update([
                'status'                => VideoStatus::Available,
                'minio_object_key'      => $objectKey,
                'minio_url'             => $publicUrl,
                'mime_type'             => $mimeType,
                'compressed_size_bytes' => @filesize($rawAbsolute) ?: null,
                'uploaded_at'           => now(),
                'compressed_at'         => now(),
                'error_message'         => null,
            ]);

            Log::info('Retur video uploaded', [
                'id'         => $video->id,
                'order_id'   => $video->order_id,
                'object_key' => $objectKey,
            ]);
        } catch (\Throwable $e) {
            Log::error('UploadReturVideo failed', ['id' => $video->id, 'error' => $e->getMessage()]);
            $this->fail($video, $e->getMessage());
            throw $e;
        } finally {
            if (is_file($rawAbsolute)) @unlink($rawAbsolute);
            if ($video->exists) {
                $video->forceFill(['raw_path' => null])->saveQuietly();
            }
        }
    }

    private function fail(ReturVideo $video, string $message): void
    {
        $video->forceFill([
            'status'        => VideoStatus::Failed,
            'error_message' => substr($message, 0, 2000),
        ])->saveQuietly();
    }
}
