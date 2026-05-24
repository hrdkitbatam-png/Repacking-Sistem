<?php

return [
    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [
        'local' => [
            'driver' => 'local',
            'root'   => storage_path('app/private'),
            'serve'  => true,
            'throw'  => false,
        ],

        'public' => [
            'driver' => 'local',
            'root'   => storage_path('app/public'),
            'url'    => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw'  => false,
        ],

        // Working directory for raw + compressed temp files before MinIO upload.
        // Anything written here is considered ephemeral and MUST be cleaned up
        // by the CompressAndUploadVideo job. See storage_policy in .cursorrules.
        'tmp_videos' => [
            'driver' => 'local',
            'root'   => storage_path('app/tmp-videos'),
            'throw'  => true,
        ],

        // S3-compatible MinIO bucket — final destination for every recording.
        'minio' => [
            'driver'   => 's3',
            'key'      => env('MINIO_KEY'),
            'secret'   => env('MINIO_SECRET'),
            'region'   => env('MINIO_REGION', 'us-east-1'),
            'bucket'   => env('MINIO_BUCKET', 'packer-videos'),
            'endpoint' => env('MINIO_ENDPOINT', 'http://127.0.0.1:9000'),
            'use_path_style_endpoint' => true,
            'throw'  => true,
        ],
    ],

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],
];
