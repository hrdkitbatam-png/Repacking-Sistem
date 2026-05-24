# Packer Sistem — End-to-End Video Recording & Management System

Hands-free, barcode-driven packaging video recording for high-volume omnichannel retail (10,000+ orders/day) with aggressive H.265 storage efficiency.

## Architecture

```
┌────────────────────┐    raw blob     ┌──────────────────┐    H.265     ┌────────────┐
│  Packer Interface  │ ──────────────▶ │  Laravel API     │ ───────────▶ │   MinIO    │
│  (React + Vite)    │                 │  + Queue Worker  │              │  (S3 API)  │
│  Barcode Scanner   │                 │  + FFmpeg        │              └────────────┘
└────────────────────┘                 └──────────────────┘                     ▲
                                                │                                │
                                                ▼                                │
                                        ┌──────────────┐                         │
                                        │  PostgreSQL  │                         │
                                        │  (metadata)  │                         │
                                        └──────────────┘                         │
                                                ▲                                │
                                                │                         stream │
                                       ┌────────────────┐                        │
                                       │  CS Dashboard  │ ───────────────────────┘
                                       │  (React)       │
                                       └────────────────┘
```

## Repository Layout

```
.
├── .cursorrules                # Project-wide AI guidelines
├── docker-compose.yml          # PostgreSQL + MinIO + Redis (queue) services
├── backend/                    # Laravel REST API + FFmpeg workers
│   ├── app/
│   │   ├── Http/Controllers/Api/
│   │   ├── Jobs/CompressAndUploadVideo.php
│   │   ├── Models/
│   │   └── Services/MinioService.php
│   ├── database/migrations/
│   ├── routes/api.php
│   └── .env.example
└── frontend/                   # React + Vite + TailwindCSS SPA
    ├── src/
    │   ├── hooks/useBarcodeScanner.js
    │   ├── hooks/useVideoRecorder.js
    │   ├── pages/PackerInterface.jsx
    │   ├── pages/CSDashboard.jsx
    │   └── api/client.js
    └── package.json
```

## Quick Start

### 1. Boot infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on `5432` (db: `packer`, user: `packer`, pass: `packer`)
- **MinIO** on `9000` (S3 API) and `9001` (console) — default `minioadmin:minioadmin`
- **Redis** on `6379` (Laravel queue)

Create the MinIO bucket once:

```bash
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker compose exec minio mc mb local/packer-videos
docker compose exec minio mc anonymous set download local/packer-videos
```

### 2. Backend (Laravel)

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve --host=0.0.0.0 --port=8000
```

In a second terminal, start the queue worker (handles FFmpeg compression + MinIO upload):

```bash
cd backend
php artisan queue:work --queue=video-compression --tries=3 --timeout=600
```

**Requirements:** PHP 8.2+, Composer, `ffmpeg` available in `$PATH`
(`brew install ffmpeg` on macOS; `apt install ffmpeg` on Debian/Ubuntu).

### 3. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

- `/` — Packer Interface (full-screen, barcode-driven)
- `/dashboard` — Customer Service Dashboard

## Barcode-driven Recording State Machine

| Current State | Scanner Event             | Action                                                    | Next State |
|---------------|---------------------------|-----------------------------------------------------------|------------|
| `IDLE`        | Scan Barcode A            | Start recording for A                                     | `RECORDING(A)` |
| `RECORDING(A)`| Scan Barcode A again      | Stop & save A                                             | `CONFIRMED(A)` |
| `RECORDING(A)`| Scan **different** B      | Stop & save A, immediately start recording for B          | `RECORDING(B)` |
| `CONFIRMED(A)`| Scan Barcode A again      | Discard A, re-record A from scratch                       | `RECORDING(A)` |
| `CONFIRMED(A)`| Scan **different** B      | Start recording for B                                     | `RECORDING(B)` |

The scanner is treated as a USB keyboard. The frontend listens globally on
`keydown`, buffers characters with a 50 ms inter-key timeout, and commits on
`Enter` (matching the default suffix of every commercial barcode scanner).

## Storage Policy

The local Laravel server is **strictly a pass-through**. After FFmpeg finishes
H.265 transcoding and the file lands in MinIO, the temporary file is deleted in
the same job's `finally` block to keep SSD usage flat regardless of volume.

## API Surface

| Method | Path                                      | Purpose                                  |
|--------|-------------------------------------------|------------------------------------------|
| POST   | `/api/packing-videos`                     | Upload raw recording (multipart blob)    |
| GET    | `/api/packing-videos`                     | Paginated list, supports `?search=`      |
| GET    | `/api/packing-videos/{id}`                | Fetch single record                      |
| GET    | `/api/packing-videos/by-order/{order_id}` | Fetch by Order ID / Resi                 |
| DELETE | `/api/packing-videos/{id}`                | Remove record + temp + MinIO object      |
| GET    | `/api/packers`                            | List active packers (for UI dropdown)    |
| GET    | `/api/health`                             | Liveness probe                           |

All endpoints return JSON. CORS is enabled for the Vite dev origin (set
`FRONTEND_URL` in `backend/.env` to override).

## Database Schema

```
packers
  id (pk), code (uniq), name, station, active, timestamps

packing_videos
  id (pk),
  order_id              -- INDEXED for instant CS search
  packer_id             -- FK packers.id (null on packer delete)
  status                -- enum: pending_upload | uploaded_raw |
                        --        compressing | available | failed
  raw_path              -- ephemeral local path (cleared after MinIO upload)
  minio_object_key
  minio_url
  mime_type, raw_size_bytes, compressed_size_bytes, duration_seconds
  recorded_at, uploaded_at, compressed_at
  error_message
  timestamps
  indexes: (order_id), (status, created_at), (packer_id)
```

## Storage / Compression Pipeline (sequence)

```
Packer scans → MediaRecorder produces WebM blob
            → POST /api/packing-videos (multipart)
            → PackingVideoController::store
                  ├─ stream-writes file to storage/app/tmp-videos/raw/<ulid>.webm
                  ├─ inserts packing_videos row (status=uploaded_raw)
                  └─ dispatches CompressAndUploadVideo(videoId) onto "video-compression" queue
            → HTTP 201 returned immediately (UI free for next barcode)

Worker:    php artisan queue:work --queue=video-compression
            → CompressAndUploadVideo::handle
                  ├─ status=compressing
                  ├─ FFmpeg: libx265 CRF=28 preset=veryfast, hvc1 tag, +faststart
                  ├─ stream-uploads compressed .mp4 to MinIO bucket
                  ├─ status=available, fills minio_url + sizes
                  └─ finally{}: rm raw, rm compressed, clear raw_path
```

The `finally` block is the enforcement point for the **`storage_policy`** from
`.cursorrules`: regardless of success, exception, or retry, no permanent
video data is left on the Laravel host.

## Production Tuning Notes

- For 10k orders/day (~7 videos/minute average, with bursty peaks):
  - Run 2–4 `queue:work --queue=video-compression` workers per CPU core.
  - Bump `FFMPEG_PRESET` to `fast` or `medium` when you have spare CPU — every
    step down the preset ladder cuts file size noticeably.
  - Use a `nginx` reverse proxy in front of MinIO and point
    `MINIO_PUBLIC_URL` at it so the dashboard streams via your CDN.
- The `packing_videos.order_id` btree handles prefix-matched `ILIKE 'ABC%'`
  searches in sub-millisecond time even at tens of millions of rows.
