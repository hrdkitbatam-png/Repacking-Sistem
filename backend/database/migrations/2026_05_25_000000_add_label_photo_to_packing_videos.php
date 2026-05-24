<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packing_videos', function (Blueprint $table) {
            $table->string('label_path')->nullable()->after('minio_url')->comment('Label photo in MinIO');
        });
    }

    public function down(): void
    {
        Schema::table('packing_videos', function (Blueprint $table) {
            $table->dropColumn('label_path');
        });
    }
};
