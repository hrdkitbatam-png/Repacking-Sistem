<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = [
        'user_id', 'action', 'description', 'metadata', 'ip_address',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** Quick static logger */
    public static function log(
        ?int $userId,
        string $action,
        ?string $description = null,
        ?array $metadata = null,
    ): self {
        return self::create([
            'user_id'     => $userId,
            'action'      => $action,
            'description' => $description,
            'metadata'    => $metadata,
            'ip_address'  => request()?->ip(),
        ]);
    }
}
