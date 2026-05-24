<?php

namespace App\Console\Commands;

use App\Models\PackingVideo;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PruneExpiredVideos extends Command
{
    protected $signature   = 'videos:prune {--days=30 : Retention days}';
    protected $description = 'Delete videos older than retention period';

    public function handle(): int
    {
        $days   = (int) $this->option('days');
        $cutoff = now()->subDays($days);

        $this->info("Pruning videos older than {$days} days...");
        $videos = PackingVideo::where('created_at', '<', $cutoff)->get();

        $deleted = 0; $freed = 0;
        foreach ($videos as $v) {
            if ($v->minio_object_key) {
                try { Storage::disk('minio')->delete($v->minio_object_key); } catch (\Exception $e) {}
            }
            if ($v->raw_path) {
                try { Storage::disk(config('video.temp_disk'))->delete($v->raw_path); } catch (\Exception $e) {}
            }
            $freed += ($v->compressed_size_bytes ?? $v->raw_size_bytes ?? 0);
            $v->delete();
            $deleted++;
        }

        $this->info("Pruned {$deleted} videos, freed ~" . round($freed/1024/1024,1) . " MB.");
        return 0;
    }
}
