<?php

return [

    /*
    |--------------------------------------------------------------------------
    | FFmpeg binary
    |--------------------------------------------------------------------------
    | Absolute path to the ffmpeg binary. On most systems just `ffmpeg` is
    | sufficient since it is resolved via $PATH.
    */
    'ffmpeg_binary' => env('FFMPEG_BINARY', 'ffmpeg'),

    /*
    |--------------------------------------------------------------------------
    | H.265 / libx265 encoder settings
    |--------------------------------------------------------------------------
    | CRF (Constant Rate Factor) is the primary quality knob — 0 is lossless,
    | 28 is the libx265 default, and ~32 is "still decent" archive quality.
    | The preset trades encoding speed for compression efficiency.
    */
    'crf'    => (int) env('FFMPEG_CRF', 28),
    'preset' => env('FFMPEG_PRESET', 'veryfast'),

    /*
    |--------------------------------------------------------------------------
    | Audio handling
    |--------------------------------------------------------------------------
    | Packaging videos rarely need high-fidelity audio. AAC @ 64k saves
    | meaningful storage for 10,000+ daily videos.
    */
    'audio_codec'   => 'aac',
    'audio_bitrate' => '64k',

    /*
    |--------------------------------------------------------------------------
    | Local working directory
    |--------------------------------------------------------------------------
    | All raw uploads land here briefly. Both raw and compressed copies are
    | deleted in the job's `finally` block once the file is in MinIO.
    */
    'temp_disk' => 'tmp_videos',

    /*
    |--------------------------------------------------------------------------
    | MinIO public base URL
    |--------------------------------------------------------------------------
    | Used to construct the streamable playback URL that the CS Dashboard
    | hands to the HTML <video> element. Should be reachable from the CS
    | operator's browser (proxy MinIO through your CDN in production).
    */
    'minio_public_url' => rtrim(env('MINIO_PUBLIC_URL', env('MINIO_ENDPOINT', 'http://127.0.0.1:9000')), '/'),
    'minio_bucket'     => env('MINIO_BUCKET', 'packer-videos'),

    /*
    |--------------------------------------------------------------------------
    | Upload constraints
    |--------------------------------------------------------------------------
    */
    'max_upload_mb' => (int) env('VIDEO_MAX_UPLOAD_MB', 512),
];
