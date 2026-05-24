<?php

namespace App\Services;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;

/**
 * Thin wrapper around the `minio` S3 disk that centralizes object key
 * conventions and public URL building. Keeps controllers / jobs free of
 * storage-specific knowledge.
 */
class MinioService
{
    public function disk(): Filesystem
    {
        return Storage::disk('minio');
    }

    /**
     * Build a deterministic, time-partitioned object key for a recording.
     * Example: 2026/05/24/PCK-001/ORDER-42-1716540000.mp4
     */
    public function buildObjectKey(string $orderId, ?string $packerCode = null, string $extension = 'mp4'): string
    {
        $now    = now();
        $packer = $packerCode ?: 'unknown';
        $safe   = preg_replace('/[^A-Za-z0-9_\-]/', '_', $orderId);

        return sprintf(
            '%s/%s/%s/%s/%s-%d.%s',
            $now->format('Y'),
            $now->format('m'),
            $now->format('d'),
            $packer,
            $safe,
            $now->getTimestamp(),
            ltrim($extension, '.'),
        );
    }

    /**
     * Streams a local file into MinIO using a file handle so we never load
     * the full payload (potentially hundreds of MB) into memory.
     */
    public function uploadFromLocalPath(string $absoluteLocalPath, string $objectKey, string $mimeType = 'video/mp4'): void
    {
        $stream = fopen($absoluteLocalPath, 'rb');
        if ($stream === false) {
            throw new \RuntimeException("Unable to open file for upload: {$absoluteLocalPath}");
        }

        try {
            $this->disk()->writeStream($objectKey, $stream, [
                'visibility'  => 'public',
                'ContentType' => $mimeType,
            ]);
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }

    /**
     * Public URL the <video> tag in the CS Dashboard will load.
     * We deliberately do NOT use Storage::url() because that returns a
     * temporary signed URL by default — public bucket policy is preferred
     * for the streaming use case.
     */
    public function publicUrl(string $objectKey): string
    {
        $base   = rtrim(config('video.minio_public_url'), '/');
        $bucket = config('video.minio_bucket');

        return sprintf('%s/%s/%s', $base, $bucket, ltrim($objectKey, '/'));
    }
}
