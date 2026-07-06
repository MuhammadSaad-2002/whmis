<?php

// Temporary deployment diagnostic. Plain PHP (no framework, no 8.2 syntax) so
// it runs even when the app is broken or in maintenance mode. Reveals the most
// common cPanel first-deploy problems. DELETE THIS FILE once the site is up.

header('Content-Type: text/plain; charset=utf-8');

$base = dirname(__DIR__);
$ok = static function ($cond, $yes, $no) {
    return $cond ? $yes : $no;
};

echo "WHMIS deployment check\n";
echo "======================\n";
echo 'PHP version       : ' . PHP_VERSION . "\n";
echo 'PHP >= 8.2        : ' . $ok(version_compare(PHP_VERSION, '8.2.0', '>='), 'OK', 'TOO OLD — set 8.2/8.3 in cPanel MultiPHP Manager') . "\n";
echo 'Document root      : ' . __DIR__ . "\n";
echo 'App root           : ' . $base . "\n";
echo 'vendor/autoload.php: ' . $ok(is_file($base . '/vendor/autoload.php'), 'present', 'MISSING — code not fully deployed') . "\n";
echo '.env file          : ' . $ok(is_file($base . '/.env'), 'present', 'MISSING — create it with APP_KEY + DB creds') . "\n";
echo 'storage writable   : ' . $ok(is_writable($base . '/storage'), 'yes', 'NO — set storage/ to 775') . "\n";
echo 'bootstrap/cache    : ' . $ok(is_writable($base . '/bootstrap/cache'), 'writable', 'NOT writable — set to 775') . "\n";
echo 'maintenance flag   : ' . $ok(is_file($base . '/storage/framework/maintenance.php'), 'ON — delete storage/framework/maintenance.php', 'off') . "\n";

// Required PHP extensions for this app.
$exts = ['pdo_mysql', 'mbstring', 'openssl', 'xml', 'ctype', 'zip', 'gd', 'bcmath', 'fileinfo', 'tokenizer'];
$missing = array_values(array_filter($exts, static fn ($e) => ! extension_loaded($e)));
echo 'PHP extensions     : ' . ($missing ? 'MISSING ' . implode(', ', $missing) : 'all present') . "\n";

// Can we reach the DB using the .env values? (best-effort, no secrets printed)
$envPath = $base . '/.env';
if (is_file($envPath) && extension_loaded('pdo_mysql')) {
    $env = [];
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $env[trim($k)] = trim($v, " \"'");
    }
    $host = $env['DB_HOST'] ?? '127.0.0.1';
    $port = $env['DB_PORT'] ?? '3306';
    $name = $env['DB_DATABASE'] ?? '';
    try {
        $pdo = new PDO("mysql:host={$host};port={$port};dbname={$name}", $env['DB_USERNAME'] ?? '', $env['DB_PASSWORD'] ?? '', [PDO::ATTR_TIMEOUT => 4]);
        $tables = (int) $pdo->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn();
        echo 'Database connect   : OK (' . $tables . ' tables — expect 39 after importing production-seed.sql)' . "\n";
    } catch (Throwable $e) {
        echo 'Database connect   : FAILED — ' . $e->getMessage() . "\n";
    }
} else {
    echo "Database connect   : skipped (.env or pdo_mysql missing)\n";
}

echo "\nWhen everything above is OK, delete public/ping.php.\n";
