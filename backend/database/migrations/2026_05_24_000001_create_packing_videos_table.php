<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('packing_videos', function (Blueprint $table) {
            $table->id();

            // Hot lookup column for CS Dashboard search — indexed for instant
            // O(log n) lookups even with millions of rows.
            $table->string('order_id', 64);

            $table->foreignId('packer_id')
                ->nullable()
                ->constrained('packers')
                ->nullOnDelete();

            // Lifecycle status — see App\Enums\VideoStatus for canonical values:
            //   pending_upload | uploaded_raw | compressing | available | failed
            $table->string('status', 32)->default('pending_upload');

            $table->string('raw_path')->nullable();          // temp local path (relative to tmp_videos disk)
            $table->string('minio_object_key')->nullable();  // final MinIO key
            $table->string('minio_url')->nullable();         // public/streamable URL
            $table->string('mime_type', 64)->nullable();
            $table->unsignedBigInteger('raw_size_bytes')->nullable();
            $table->unsignedBigInteger('compressed_size_bytes')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();

            $table->timestamp('recorded_at')->nullable();
            $table->timestamp('uploaded_at')->nullable();
            $table->timestamp('compressed_at')->nullable();

            $table->text('error_message')->nullable();

            $table->timestamps();

            // Primary CS lookup path — sub-millisecond search by Order ID / Resi.
            $table->index('order_id', 'packing_videos_order_id_idx');
            $table->index(['status', 'created_at'], 'packing_videos_status_created_idx');
            $table->index('packer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packing_videos');
    }
};
