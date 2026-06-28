<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReturVideo extends Model
{
    protected $table = 'retur_videos';

    protected $fillable = [
        'order_id', 'packer_id', 'status',
        'raw_path', 'minio_object_key', 'minio_url', 'mime_type',
        'raw_size_bytes', 'compressed_size_bytes',
        'keterangan',
        'recorded_at', 'uploaded_at', 'compressed_at',
        'error_message',
    ];

    public function packer()
    {
        return $this->belongsTo(Packer::class);
    }

    public function scopeSearch($query, ?string $term)
    {
        return $term ? $query->where('order_id', 'like', "%{$term}%") : $query;
    }
}
