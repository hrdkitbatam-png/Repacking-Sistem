<?php

namespace Database\Seeders;

use App\Models\Packer;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        foreach (
            [
                ['code' => 'PCK-001', 'name' => 'Default Packer', 'station' => 'A1'],
                ['code' => 'PCK-002', 'name' => 'Packer Two',     'station' => 'A2'],
                ['code' => 'PCK-003', 'name' => 'Packer Three',   'station' => 'B1'],
            ] as $seed
        ) {
            Packer::query()->updateOrCreate(
                ['code' => $seed['code']],
                $seed + ['active' => true],
            );
        }
    }
}
