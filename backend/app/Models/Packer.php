<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Packer extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'station',
        'active',
    ];

    protected $casts = [
        'active' => 'boolean',
    ];

    public function videos(): HasMany
    {
        return $this->hasMany(PackingVideo::class);
    }
}
