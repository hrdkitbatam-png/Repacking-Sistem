<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('retur_videos', function (Blueprint $table) {
            $table->id();
            $table->string('order_id', 64);
            $table->foreignId('packer_id')->nullable()->constrained('packers')->nullOnDelete();
            $table->string('status', 32)->default('pending_upload');
            $table->string('raw_path')->nullable();
            $table->string('minio_object_key')->nullable();
            $table->string('minio_url')->nullable();
            $table->string('mime_type', 64)->nullable();
            $table->unsignedBigInteger('raw_size_bytes')->nullable();
            $table->unsignedBigInteger('compressed_size_bytes')->nullable();
            $table->string('keterangan')->nullable(); // notes for retur processing team
            $table->timestamp('recorded_at')->nullable();
            $table->timestamp('uploaded_at')->nullable();
            $table->timestamp('compressed_at')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index('order_id', 'retur_videos_order_id_idx');
            $table->index(['status', 'created_at'], 'retur_videos_status_created_idx');
            $table->index('packer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('retur_videos');
    }
};
