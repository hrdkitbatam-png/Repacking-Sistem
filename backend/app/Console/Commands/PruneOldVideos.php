<?php

namespace App\Console\Commands;

use App\Models\PackingVideo;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PruneOldVideos extends Command
{
    protected $signature = 'videos:prune {--days=14 : Delete videos older than this many days}';
    protected $description = 'Delete packing videos older than N days from DB + MinIO + temp storage';

    public function handle(): int
    {
        $days = (int) $this->option('days');
        $cutoff = now()->subDays($days);

        $this->info("Pruning videos older than {$days} days (before {$cutoff->toDateString()})...");

        $videos = PackingVideo::where('created_at', '<', $cutoff)->limit(200)->get();

        if ($videos->isEmpty()) {
            $this->info('No videos to prune.');
            return 0;
        }

        $deleted = 0;
        $totalRawBytes = 0;
        $totalMinioBytes = 0;

        foreach ($videos as $video) {
            // Delete from MinIO
            if ($video->minio_object_key) {
                try {
                    Storage::disk('minio')->delete($video->minio_object_key);
                } catch (\Exception $e) {
                    $this->warn("  MinIO delete failed for {$video->order_id}: {$e->getMessage()}");
                }
            }

            // Delete raw temp file
            if ($video->raw_path) {
                $disk = Storage::disk(config('video.temp_disk'));
                if ($disk->exists($video->raw_path)) {
                    $totalRawBytes += $disk->size($video->raw_path);
                    $disk->delete($video->raw_path);
                }
            }

            // Delete label photo
            if ($video->label_path) {
                $disk = Storage::disk(config('video.temp_disk'));
                if ($disk->exists($video->label_path)) {
                    $disk->delete($video->label_path);
                }
            }

            $totalMinioBytes += $video->compressed_size_bytes ?? 0;
            $video->delete();
            $deleted++;
        }

        $freed = round(($totalRawBytes + $totalMinioBytes) / 1048576, 1);
        $this->info("✅ Pruned {$deleted} videos, freed ~{$freed} MB");

        return 0;
    }
}
