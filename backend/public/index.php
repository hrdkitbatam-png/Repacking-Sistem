<?php

// PHP 8.5 menandai sejumlah konstanta PDO::MYSQL_ATTR_* sebagai deprecated dan
// `php artisan serve` (built-in PHP server) menulis pesan "Deprecated: ..."
// LANGSUNG ke response body, sehingga merusak parsing JSON di sisi frontend.
// Kita arahkan semua error ke stderr dan sembunyikan E_DEPRECATED.
ini_set('display_errors', 'stderr');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/../vendor/autoload.php';

/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
