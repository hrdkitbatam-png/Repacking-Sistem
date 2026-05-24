<?php

namespace App\Models;

use App\Enums\VideoStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackingVideo extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id',
        'packer_id',
        'status',
        'raw_path',
        'minio_object_key',
        'minio_url',
        'mime_type',
        'raw_size_bytes',
        'compressed_size_bytes',
        'duration_seconds',
        'recorded_at',
        'uploaded_at',
        'compressed_at',
        'error_message',
    ];

    protected $casts = [
        'status'                => VideoStatus::class,
        'recorded_at'           => 'datetime',
        'uploaded_at'           => 'datetime',
        'compressed_at'         => 'datetime',
        'raw_size_bytes'        => 'integer',
        'compressed_size_bytes' => 'integer',
        'duration_seconds'      => 'integer',
    ];

    protected $appends = ['status_label'];

    public function packer(): BelongsTo
    {
        return $this->belongsTo(Packer::class);
    }

    public function getStatusLabelAttribute(): string
    {
        return $this->status instanceof VideoStatus
            ? $this->status->label()
            : (string) $this->status;
    }

    /**
     * Lightweight scope used by the CS Dashboard search box.
     * Postgres `ILIKE` is index-friendly when combined with the
     * `packing_videos_order_id_idx` btree on `order_id`.
     */
    public function scopeSearch($query, ?string $term)
    {
        $term = trim((string) $term);
        if ($term === '') {
            return $query;
        }
        return $query->where('order_id', 'ILIKE', $term.'%');
    }
}
