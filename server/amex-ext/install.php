<?php
// Amex Offer Auto-Adder -- anonymous install ping receiver.
// Records: random client UUID (generated in the extension, not tied to any
// identity), extension version, browser, and timestamp. No personal data,
// no Amex data. Dedupes by UUID so reinstalls/updates do not double-count.

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$DATA_DIR = '/var/www/amex-ext-data';
$LOG  = $DATA_DIR . '/installs.log';    // one JSON line per unique install
$SEEN = $DATA_DIR . '/seen_uuids.txt';  // dedupe set

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) { http_response_code(400); exit; }

// Sanitize / whitelist fields.
$uuid    = preg_replace('/[^a-f0-9-]/i', '', substr((string)($body['id'] ?? ''), 0, 40));
$version = preg_replace('/[^0-9.]/', '', substr((string)($body['version'] ?? ''), 0, 16));
$browser = preg_replace('/[^a-zA-Z]/', '', substr((string)($body['browser'] ?? ''), 0, 16));
$event   = preg_replace('/[^a-zA-Z_]/', '', substr((string)($body['event'] ?? 'install'), 0, 16));
if ($uuid === '') { http_response_code(400); exit; }

// Dedupe by UUID (only count first install per client).
$seen = file_exists($SEEN) ? file($SEEN, FILE_IGNORE_NEW_LINES) : [];
$isNew = !in_array($uuid, $seen, true);

if ($isNew) {
    file_put_contents($SEEN, $uuid . "\n", FILE_APPEND | LOCK_EX);
    $rec = array(
        'ts'      => gmdate('c'),
        'uuid'    => $uuid,
        'version' => $version,
        'browser' => $browser ? $browser : 'unknown',
        'event'   => $event,
        'country' => isset($_SERVER['HTTP_CF_IPCOUNTRY']) ? $_SERVER['HTTP_CF_IPCOUNTRY'] : '',
    );
    file_put_contents($LOG, json_encode($rec) . "\n", FILE_APPEND | LOCK_EX);
}

http_response_code(204); // no content
