<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('packers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();   // e.g. "PCK-001"
            $table->string('name', 120);
            $table->string('station', 40)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packers');
    }
};
