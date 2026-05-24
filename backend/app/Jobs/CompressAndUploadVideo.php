<?php

namespace App\Jobs;

use App\Enums\VideoStatus;
use App\Models\PackingVideo;
use App\Services\MinioService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

/**
 * Runs in the queue worker (queue: "video-compression"):
 *
 *   1. Locate raw temp file written by VideoUploadController.
 *   2. Transcode to H.265 (libx265) + AAC into a sibling .mp4 file.
 *   3. Stream the compressed file into MinIO.
 *   4. Update the DB row with the public URL + size + status="available".
 *   5. ALWAYS delete both temp files in `finally` (storage_policy enforcement).
 */
class CompressAndUploadVideo implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Bounded retries to avoid burning CPU on a permanently broken file. */
    public int $tries   = 3;
    public int $timeout = 600;       // 10 min — generous for slow H.265 encodes

    public function __construct(public int $videoId)
    {
        $this->onQueue('video-compression');
    }

    public function handle(MinioService $minio): void
    {
        /** @var PackingVideo|null $video */
        $video = PackingVideo::query()->find($this->videoId);
        if (! $video) {
            Log::warning('CompressAndUploadVideo: video row vanished', ['id' => $this->videoId]);
            return;
        }

        $tmpDisk = Storage::disk(config('video.temp_disk'));
        if (! $video->raw_path || ! $tmpDisk->exists($video->raw_path)) {
            $this->fail($video, 'Raw file missing on disk: '.$video->raw_path);
            return;
        }

        $rawAbsolute        = $tmpDisk->path($video->raw_path);
        $compressedAbsolute = $this->compressedPathFor($rawAbsolute);

        $video->update([
            'status'        => VideoStatus::Compressing,
            'error_message' => null,
        ]);

        try {
            $this->runFfmpeg($rawAbsolute, $compressedAbsolute, $video);

            $objectKey = $minio->buildObjectKey(
                $video->order_id,
                optional($video->packer)->code,
                'mp4',
            );

            $minio->uploadFromLocalPath($compressedAbsolute, $objectKey, 'video/mp4');

            $video->update([
                'status'                => VideoStatus::Available,
                'minio_object_key'      => $objectKey,
                'minio_url'             => $minio->publicUrl($objectKey),
                'mime_type'             => 'video/mp4',
                'compressed_size_bytes' => @filesize($compressedAbsolute) ?: null,
                'uploaded_at'           => now(),
                'compressed_at'         => now(),
                'error_message'         => null,
            ]);

            Log::info('Video compressed + uploaded', [
                'id'               => $video->id,
                'order_id'         => $video->order_id,
                'raw_bytes'        => $video->raw_size_bytes,
                'compressed_bytes' => $video->compressed_size_bytes,
                'object_key'       => $objectKey,
            ]);
        } catch (\Throwable $e) {
            Log::error('CompressAndUploadVideo failed', [
                'id'    => $video->id,
                'error' => $e->getMessage(),
            ]);
            $this->fail($video, $e->getMessage());
            throw $e; // let Laravel retry/backoff
        } finally {
            // Storage policy: local server is strictly a pass-through.
            // Both raw and compressed temp files MUST go regardless of outcome.
            $this->safeDelete($rawAbsolute);
            $this->safeDelete($compressedAbsolute);
            // Also reset the DB pointer so we don't ever try to use a path
            // that no longer exists.
            if ($video->exists) {
                $video->forceFill(['raw_path' => null])->saveQuietly();
            }
        }
    }

    /** Build the `<raw>.h265.mp4` sibling path for the compressed output. */
    private function compressedPathFor(string $rawAbsolute): string
    {
        $dir  = dirname($rawAbsolute);
        $name = pathinfo($rawAbsolute, PATHINFO_FILENAME);
        return $dir.DIRECTORY_SEPARATOR.$name.'.h265.mp4';
    }

    private function runFfmpeg(string $input, string $output, PackingVideo $video): void
    {
        // Build overlay text: timestamp + order ID + packer
        // Colons in time must be escaped as \: for FFmpeg filter parser
        $ts     = str_replace(':', '\\:', ($video->recorded_at ?? now())->format('Y-m-d H:i:s'));
        $resi   = $video->order_id;
        $packer = optional($video->packer)->code ?? '-';

        // drawtext: timestamp top-left, order|packer below it
        // Colons in time must be escaped as \: for FFmpeg filter parser
        $drawText = sprintf(
            "drawtext=text='%s':fontsize=22:fontcolor=white:box=1:boxcolor=black@0.5:x=12:y=12," .
            "drawtext=text='%s':fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.5:x=12:y=42",
            $ts,
            "{$resi} | {$packer}",
        );

        $cmd = [
            config('video.ffmpeg_binary'),
            '-y',
            '-i', $input,
            '-vf', $drawText,
            '-c:v', 'libx265',
            '-preset', config('video.preset'),
            '-crf', (string) config('video.crf'),
            '-tag:v', 'hvc1',
            '-c:a', config('video.audio_codec'),
            '-b:a', config('video.audio_bitrate'),
            '-movflags', '+faststart',
            $output,
        ];

        $process = new Process($cmd);
        $process->setTimeout($this->timeout);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new \RuntimeException(
                'FFmpeg exited with code '.$process->getExitCode().': '.$process->getErrorOutput()
            );
        }

        if (! is_file($output) || filesize($output) === 0) {
            throw new \RuntimeException('FFmpeg produced empty output file.');
        }
    }

    private function fail(PackingVideo $video, string $message): void
    {
        $video->forceFill([
            'status'        => VideoStatus::Failed,
            'error_message' => substr($message, 0, 2000),
        ])->saveQuietly();
    }

    private function safeDelete(string $path): void
    {
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
