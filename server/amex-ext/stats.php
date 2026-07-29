<?php
// Amex Offer Auto-Adder -- install stats (token-protected).
// Usage: https://buza.dev/api/amex-ext/stats.php?token=YOUR_TOKEN

// Token is read from a config file kept outside the web root (same one the
// /admin dashboard uses), so there's a single source of truth and no secret
// committed to the repo.
$DATA_DIR = '/var/www/amex-ext-data';
$cfg = @include $DATA_DIR . '/config.php';
$TOKEN = is_array($cfg) && isset($cfg['admin_pw']) ? $cfg['admin_pw'] : '';
$LOG = $DATA_DIR . '/installs.log';

$given = isset($_GET['token']) ? $_GET['token'] : '';
if (!hash_equals($TOKEN, (string)$given)) { http_response_code(403); echo 'forbidden'; exit; }

header('Content-Type: application/json');

$total = 0;
$byVersion = array();
$byBrowser = array();
$byDay = array();
$byCountry = array();
$recent = array();

if (file_exists($LOG)) {
    $lines = file($LOG, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $r = json_decode($line, true);
        if (!is_array($r)) continue;
        $total++;
        $v = isset($r['version']) ? $r['version'] : '?';
        $b = isset($r['browser']) ? $r['browser'] : '?';
        $c = isset($r['country']) && $r['country'] !== '' ? $r['country'] : '?';
        $day = isset($r['ts']) ? substr($r['ts'], 0, 10) : '?';
        $byVersion[$v] = (isset($byVersion[$v]) ? $byVersion[$v] : 0) + 1;
        $byBrowser[$b] = (isset($byBrowser[$b]) ? $byBrowser[$b] : 0) + 1;
        $byCountry[$c] = (isset($byCountry[$c]) ? $byCountry[$c] : 0) + 1;
        $byDay[$day]   = (isset($byDay[$day]) ? $byDay[$day] : 0) + 1;
    }
    $recent = array_slice($lines, -15);
}

echo json_encode(array(
    'total_installs' => $total,
    'by_browser'     => $byBrowser,
    'by_version'     => $byVersion,
    'by_country'     => $byCountry,
    'by_day'         => $byDay,
    'recent'         => array_map('json_decode', $recent),
), JSON_PRETTY_PRINT);
