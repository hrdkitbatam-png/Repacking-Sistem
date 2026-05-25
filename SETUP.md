# Packer-Sistem — Setup Guide (From Zero to Production)

> Dual-webcam packing video recording system with H.265 compression and live PiP overlay.

---

## 📋 Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 22.04 | Ubuntu 24.04 |
| **PHP** | 8.2+ (CLI + FPM) | 8.3 |
| **PostgreSQL** | 14+ | 16 |
| **Redis** | 6+ | 7 |
| **Node.js** | 18+ | 22 |
| **FFmpeg** | 4.4+ (with libx265) | 6.0+ |
| **MinIO** | Latest | Latest |
| **Nginx** | 1.18+ | 1.24+ |
| **Git** | 2.x | 2.x |
| **Composer** | 2.x | 2.x |
| **npm** | 9+ | 10+ |

---

## 1. Clone Repository

```bash
git clone git@github.com:hrdkitbatam-png/Packer-Sistem.git
cd Packer-Sistem
```

---

## 2. Backend Setup

### 2.1 PHP Dependencies

```bash
cd backend
composer install
```

### 2.2 Environment Configuration

```bash
cp .env.example .env
nano .env
```

Key settings:

```env
APP_URL=http://localhost:8011
APP_TIMEZONE=Asia/Jakarta

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5433
DB_DATABASE=packer_sistem
DB_USERNAME=packer
DB_PASSWORD=your_password_here

REDIS_HOST=127.0.0.1
REDIS_PORT=6380
REDIS_PASSWORD=null

MINIO_KEY=minioadmin
MINIO_SECRET=minioadmin
MINIO_BUCKET=packer-videos
MINIO_REGION=us-east-1
MINIO_PUBLIC_URL=https://packer.kingslee.my.id/minio
MINIO_ENDPOINT=http://localhost:9002

FFMPEG_BINARY=ffmpeg
FFMPEG_CRF=30
FFMPEG_PRESET=medium

VIDEO_TEMP_DISK=tmp_videos
VIDEO_MAX_UPLOAD_MB=512

QUEUE_CONNECTION=redis
```

### 2.3 Database Setup

```bash
# Create PostgreSQL database
sudo -u postgres psql
CREATE USER packer WITH PASSWORD 'your_password';
CREATE DATABASE packer_sistem OWNER packer;
GRANT ALL PRIVILEGES ON DATABASE packer_sistem TO packer;
\q

# Run migrations
php8.2 artisan migrate --force
```

### 2.4 Seed Data

```bash
php8.2 artisan tinker --execute="
// Create roles
App\Models\Role::create(['name'=>'Admin','permissions'=>['dashboard','packer_interface','users','roles','packers','packing_videos']]);
App\Models\Role::create(['name'=>'CS','permissions'=>['dashboard','packing_videos']]);
App\Models\Role::create(['name'=>'Packer','permissions'=>['packer_interface']]);

// Create admin
App\Models\User::create(['name'=>'Admin','username'=>'admin','password'=>bcrypt('password'),'role'=>'admin','is_active'=>true]);

// Create packers
\$names = [['Budi Santoso','budi'],['Agus Hermawan','agus'],['Dimas Pratama','dimas'],['Rizky Fauzi','rizky'],['Eko Saputro','eko']];
foreach(\$names as \$i => \$p) {
    \$code = 'PKR'.str_pad(\$i+1,3,'0',STR_PAD_LEFT);
    App\Models\User::create(['name'=>\$p[0],'username'=>\$p[1],'password'=>bcrypt('password'),'role'=>'packer','packer_code'=>\$code,'is_active'=>true]);
    App\Models\Packer::create(['code'=>\$code,'name'=>\$p[0],'station'=>'Stasiun '.(\$i+1),'active'=>true]);
}
"
```

### 2.5 Start Backend

```bash
# Must use php8.2 (Laravel 11 requires PHP 8.2+)
nohup php8.2 artisan serve --host=0.0.0.0 --port=8011 > /tmp/packer-api.log 2>&1 &
```

---

## 3. Queue Worker

### 3.1 Start Worker

```bash
cd backend
nohup php8.2 artisan queue:work --queue=video-compression --sleep=2 --tries=2 --timeout=600 > /tmp/queue-worker.log 2>&1 &
```

### 3.2 Supervisor (Production)

```ini
# /etc/supervisor/conf.d/packer-worker.conf
[program:packer-worker]
command=php8.2 /path/to/Packer-Sistem/backend/artisan queue:work --queue=video-compression --sleep=2 --tries=2 --timeout=600
directory=/path/to/Packer-Sistem/backend
user=www-data
autostart=true
autorestart=true
numprocs=1
```

---

## 4. Frontend Setup

### 4.1 Install & Build

```bash
cd frontend
npm install

# Production build
npm run build

# Or dev server
npm run dev -- --host 0.0.0.0 --port 5174
```

### 4.2 Environment

```bash
# frontend/.env
VITE_API_BASE_URL=https://packer.kingslee.my.id
```

---

## 5. Nginx Configuration

```nginx
# /etc/nginx/sites-enabled/packer-sistem
server {
    listen 1085;
    server_name packer.kingslee.my.id;
    include /etc/nginx/mime.types;
    client_max_body_size 500m;

    # API proxy
    location ^~ /api/ {
        proxy_pass http://localhost:8011;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # MinIO proxy
    location ^~ /minio/ {
        proxy_pass http://localhost:9002/;
        proxy_set_header Host $host;
    }

    # Static frontend files
    root /var/www/packer-sistem;

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /assets {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 5.1 Deploy Frontend

```bash
# After npm run build
sudo cp -r frontend/dist/* /var/www/packer-sistem/
sudo chown -R www-data:www-data /var/www/packer-sistem
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. MinIO Setup

### 6.1 Install & Run

```bash
# Download MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio

# Run MinIO
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
  nohup ./minio server /data --console-address :9001 --address :9002 > /tmp/minio.log 2>&1 &
```

### 6.2 Create Bucket & Set Public Policy

```bash
# Install mc client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc

# Configure
./mc alias set local http://localhost:9002 minioadmin minioadmin --api s3v4

# Create bucket
./mc mb local/packer-videos

# Set public-read
./mc anonymous set download local/packer-videos
```

---

## 7. FFmpeg Installation

```bash
# Ubuntu
sudo apt install ffmpeg

# Verify libx265 support
ffmpeg -codecs 2>/dev/null | grep hevc
# Should show: DEV.LS hevc  H.265 / HEVC
```

### 7.1 PHP FFmpeg Extension (optional)

```bash
sudo apt install php8.2-ffmpeg
```

---

## 8. All Services & Ports

| Service | Port | Command |
|---------|------|---------|
| Backend API | 8011 | `php8.2 artisan serve --port=8011` |
| Queue Worker | — | `php8.2 artisan queue:work ...` |
| Vite Dev | 5174 | `npm run dev -- --port 5174` |
| MinIO | 9002 | `minio server /data --address :9002` |
| MinIO Console | 9001 | Web UI for MinIO |
| PostgreSQL | 5433 | System service |
| Redis | 6380 | System service |
| Nginx | 1085 | System service |
| Public URL | 443 | packer.kingslee.my.id → Nginx :1085 |

### 8.1 Quick Start All

```bash
#!/bin/bash
# start-all.sh

echo "Starting Packer-Sistem..."

# Backend
cd /path/to/Packer-Sistem/backend
nohup php8.2 artisan serve --host=0.0.0.0 --port=8011 > /tmp/packer-api.log 2>&1 &
echo "  ✅ Backend :8011"

# Queue Worker
nohup php8.2 artisan queue:work --queue=video-compression --sleep=2 --tries=2 --timeout=600 > /tmp/queue-worker.log 2>&1 &
echo "  ✅ Queue Worker"

# Frontend (dev)
cd /path/to/Packer-Sistem/frontend
nohup npm run dev -- --host 0.0.0.0 --port 5174 > /tmp/vite-packer.log 2>&1 &
echo "  ✅ Vite :5174"

echo "Done! Access: https://packer.kingslee.my.id"
```

---

## 9. Login Credentials (Default Seed)

```
Username: admin     Password: password    Role: Admin (full access)
Username: budi      Password: password    Role: Packer (PKR001)
Username: agus      Password: password    Role: Packer (PKR002)
Username: dimas     Password: password    Role: Packer (PKR003)
Username: rizky     Password: password    Role: Packer (PKR004)
Username: eko       Password: password    Role: Packer (PKR005)
```

---

## 10. Storage Calculation

```
Setting: 360p, 10fps, 200kbps recording → H.265 medium CRF 30
Per video (10 min):     ~1.5 MB
Per video (5 min):      ~0.8 MB
2,000 orders/day:       ~2 GB
14 days retention:      ~28 GB
Server 98GB free:       ✅ ~50 days buffer
```

### 10.1 Auto-Cleanup (Scheduler)

```php
// routes/console.php
use App\Models\PackingVideo;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schedule;

Schedule::call(function () {
    // Delete videos older than 14 days
    $cutoff = now()->subDays(14);
    $videos = PackingVideo::where('created_at', '<', $cutoff)->limit(50)->get();

    foreach ($videos as $video) {
        if ($video->minio_object_key) {
            Storage::disk('minio')->delete($video->minio_object_key);
        }
        if ($video->raw_path) {
            Storage::disk(config('video.temp_disk'))->delete($video->raw_path);
        }
        $video->delete();
    }
})->everyThirtyMinutes();
```

---

## 11. Troubleshooting

| Problem | Solution |
|---------|----------|
| `PHP 8.2 required` | Use `php8.2` binary explicitly |
| `Queue jobs stuck` | Clear jobs: `php8.2 artisan queue:clear video-compression --force` |
| `FFmpeg not found` | `sudo apt install ffmpeg` |
| `libx265 missing` | `sudo apt install libx265-dev` |
| `MinIO 403` | Set bucket policy: `mc anonymous set download` |
| `Video won't play` | Check MinIO bucket is public, check CORS |
| `Label camera timeout` | Only 1 camera available — normal, PiP hidden |
| `Blank page` | Hard refresh (Ctrl+Shift+R), check Vite is running |
| `Upload 500` | Check worker log, FFmpeg codec support |
| `Port conflict` | `ss -tlnp \| grep <port>` to check, kill old processes |
