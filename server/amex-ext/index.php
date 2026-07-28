<?php
// Amex Offer Auto-Adder -- install analytics dashboard (password-protected).
// Single self-contained page: login form -> visual stats.

session_start();

// Password is read from a config file kept OUTSIDE the web root so it's never
// committed or served. See /var/www/amex-ext-data/config.php.
$DATA_DIR = '/var/www/amex-ext-data';
$cfg = @include $DATA_DIR . '/config.php';
$TOKEN = is_array($cfg) && isset($cfg['admin_pw']) ? $cfg['admin_pw'] : '';
$LOG = $DATA_DIR . '/installs.log';

// ---- Auth ------------------------------------------------------------------
if (isset($_POST['token'])) {
    if (hash_equals($TOKEN, (string)$_POST['token'])) {
        $_SESSION['amex_auth'] = true;
    } else {
        $_SESSION['amex_auth'] = false;
        $loginError = 'Incorrect password.';
    }
    // Avoid resubmission on refresh.
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}
$authed = !empty($_SESSION['amex_auth']);

// ---- Login page ------------------------------------------------------------
if (!$authed) {
    ?>
<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amex Ext — Stats</title>
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0b1220;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8eef7}
  .card{background:#131c2e;padding:32px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);width:300px}
  h1{margin:0 0 4px;font-size:18px}
  p{margin:0 0 20px;color:#8aa0c0;font-size:13px}
  input{width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #2a3a55;
    background:#0d1526;color:#fff;font-size:14px}
  button{width:100%;margin-top:12px;padding:11px;border:0;border-radius:8px;background:#006fcf;
    color:#fff;font-weight:700;font-size:14px;cursor:pointer}
  .err{color:#ff7a7a;font-size:12px;margin-top:10px}
</style></head><body>
  <form class="card" method="post">
    <h1>Amex Offer Auto-Adder</h1>
    <p>Install analytics</p>
    <input type="password" name="token" placeholder="Access token" autofocus>
    <button type="submit">View stats</button>
    <?php if (!empty($loginError)) echo '<div class="err">'.htmlspecialchars($loginError).'</div>'; ?>
  </form>
</body></html>
    <?php
    exit;
}

// ---- Aggregate -------------------------------------------------------------
$total = 0; $byVersion = []; $byBrowser = []; $byDay = []; $byCountry = []; $recent = [];
if (file_exists($LOG)) {
    $lines = file($LOG, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $r = json_decode($line, true);
        if (!is_array($r)) continue;
        $total++;
        $v = $r['version'] ?? '?'; $b = $r['browser'] ?? '?';
        $c = (!empty($r['country'])) ? $r['country'] : '?';
        $day = isset($r['ts']) ? substr($r['ts'],0,10) : '?';
        $byVersion[$v]=($byVersion[$v]??0)+1;
        $byBrowser[$b]=($byBrowser[$b]??0)+1;
        $byCountry[$c]=($byCountry[$c]??0)+1;
        $byDay[$day]=($byDay[$day]??0)+1;
    }
    $recent = array_reverse(array_slice($lines, -20));
}
arsort($byVersion); arsort($byBrowser); arsort($byCountry); ksort($byDay);

// Last 14 days for the chart.
$days = []; $counts = [];
for ($i = 13; $i >= 0; $i--) {
    $d = gmdate('Y-m-d', time() - $i*86400);
    $days[] = $d; $counts[] = $byDay[$d] ?? 0;
}
$maxCount = max(1, max($counts));

function bars($map, $total) {
    $out = '';
    foreach ($map as $k => $n) {
        $pct = $total ? round($n*100/$total) : 0;
        $out .= '<div class="row"><span class="k">'.htmlspecialchars($k).'</span>'
             .  '<span class="bar"><span style="width:'.$pct.'%"></span></span>'
             .  '<span class="n">'.$n.'</span></div>';
    }
    return $out ?: '<div class="muted">No data yet.</div>';
}
?>
<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amex Ext — Install Stats</title>
<style>
  :root{--bg:#0b1220;--card:#131c2e;--line:#233047;--txt:#e8eef7;--muted:#8aa0c0;--accent:#006fcf}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:var(--txt)}
  header{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--line)}
  header h1{font-size:16px;margin:0}
  header a{color:var(--muted);font-size:13px;text-decoration:none}
  .wrap{max-width:900px;margin:0 auto;padding:24px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
  .stat{background:var(--card);border-radius:12px;padding:18px}
  .stat .big{font-size:30px;font-weight:800;color:var(--accent)}
  .stat .lbl{font-size:12px;color:var(--muted);margin-top:4px}
  .panel{background:var(--card);border-radius:12px;padding:18px;margin-bottom:16px}
  .panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin:0 0 14px}
  .row{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px}
  .row .k{width:90px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .row .bar{flex:1;background:#0d1526;border-radius:6px;height:16px;overflow:hidden}
  .row .bar span{display:block;height:100%;background:var(--accent)}
  .row .n{width:44px;text-align:right;flex:none;color:var(--muted)}
  .chart{display:flex;align-items:flex-end;gap:6px;height:120px}
  .chart .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px}
  .chart .col .b{width:100%;background:var(--accent);border-radius:4px 4px 0 0;min-height:2px}
  .chart .col .d{font-size:9px;color:var(--muted);white-space:nowrap}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600}
  .muted{color:var(--muted);font-size:12px}
  @media(max-width:640px){.grid{grid-template-columns:repeat(2,1fr)}.row .k{width:70px}}
</style></head><body>
<header>
  <h1>Amex Offer Auto-Adder · Install Stats</h1>
  <a href="?logout=1">Log out</a>
</header>
<div class="wrap">
  <div class="grid">
    <div class="stat"><div class="big"><?=$total?></div><div class="lbl">Total installs</div></div>
    <div class="stat"><div class="big"><?=array_sum(array_slice($counts,-7))?></div><div class="lbl">Last 7 days</div></div>
    <div class="stat"><div class="big"><?=end($counts)?></div><div class="lbl">Today</div></div>
    <div class="stat"><div class="big"><?=count($byCountry) - (isset($byCountry['?'])?1:0)?></div><div class="lbl">Countries</div></div>
  </div>

  <div class="panel">
    <h2>Installs · last 14 days</h2>
    <div class="chart">
      <?php foreach ($days as $i=>$d): $h = round($counts[$i]*100/$maxCount); ?>
        <div class="col" title="<?=$d?>: <?=$counts[$i]?>">
          <div class="b" style="height:<?=$h?>%"></div>
          <div class="d"><?=substr($d,5)?></div>
        </div>
      <?php endforeach; ?>
    </div>
  </div>

  <div class="panel">
    <h2>By browser</h2>
    <?=bars($byBrowser, $total)?>
  </div>
  <div class="panel">
    <h2>By version</h2>
    <?=bars($byVersion, $total)?>
  </div>
  <div class="panel">
    <h2>By country</h2>
    <?=bars($byCountry, $total)?>
  </div>

  <div class="panel">
    <h2>Recent installs</h2>
    <table>
      <tr><th>When (UTC)</th><th>Browser</th><th>Version</th><th>Country</th></tr>
      <?php foreach ($recent as $line): $r=json_decode($line,true); if(!is_array($r))continue; ?>
        <tr>
          <td><?=htmlspecialchars($r['ts']??'')?></td>
          <td><?=htmlspecialchars($r['browser']??'')?></td>
          <td><?=htmlspecialchars($r['version']??'')?></td>
          <td><?=htmlspecialchars($r['country']??'')?></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$recent): ?><tr><td colspan="4" class="muted">No installs yet.</td></tr><?php endif; ?>
    </table>
  </div>
</div>
</body></html>
