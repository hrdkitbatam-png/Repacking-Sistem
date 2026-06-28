<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name', 'username', 'password', 'role', 'role_id', 'packer_code', 'is_active',
    ];

    protected $hidden = [
        'password', 'remember_token',
    ];

    protected $with = ['roleRelation'];

    protected function casts(): array
    {
        return [
            'password'   => 'hashed',
            'is_active'  => 'boolean',
        ];
    }

    public function roleRelation()
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function isAdmin():  bool { return $this->role === 'admin'; }
    public function isCs():    bool { return $this->role === 'cs'; }
    public function isPacker(): bool { return $this->role === 'packer'; }
}
