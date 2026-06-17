/**
 * デモ録画オーケストレーター
 * -----------------------------------------------------------------------------
 * 営業支援ツールを起動し、ダッシュボードをブラウザで操作する一連の流れ
 * （KPI確認 → 企業リスト → 文面 → フォーム自動送信の実行 → 結果・履歴・KPI更新）
 * を Playwright の動画録画機能でキャプチャし、mp4 に変換して出力する。
 *
 * 使い方:  node scripts/demo-run.js
 * 出力:    demo.mp4 / shots/*.png
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 4188;
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(ROOT, 'shots');
const VIDDIR = path.join(ROOT, 'data', 'video');
const OUT = path.join(ROOT, 'demo.mp4');

function chromePath() {
  for (const c of [
    path.join(ROOT, '.chrome/chrome-linux64/chrome'),
    path.join(ROOT, '..', 'form-sales-demo/.chrome/chrome-linux64/chrome'),
  ]) if (fs.existsSync(c)) return c;
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // DBを初期化してクリーンな状態から開始
  const dbPath = path.join(ROOT, 'data', 'db.json');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  for (const d of [SHOTS, VIDDIR]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

  // サーバー起動（同一プロセス内）
  process.env.PORT = String(PORT);
  const { app } = require('../server');
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  console.log('サーバー起動:', BASE);

  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: VIDDIR, size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage();
  let n = 0;
  const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`) }); };

  // 1) ダッシュボード（初期）
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(1500); await shot('dashboard-initial');

  // 2) 企業リスト
  await page.click('[data-view="companies"]'); await sleep(1200); await shot('companies');

  // 3) 文面テンプレート
  await page.click('[data-view="templates"]'); await sleep(1200); await shot('templates');

  // 4) フォーム送信画面
  await page.click('[data-view="send"]'); await sleep(1200); await shot('send-form');

  // 5) 送信を実行（全社が未送信なので初期選択のまま実行）
  await page.click('#btn-run-send');
  // 送信完了（結果カード出現）を待つ
  await page.waitForSelector('#send-results .res-item', { timeout: 120000 });
  await sleep(1500); await shot('send-results');

  // 6) 履歴（スクショ付き）
  await page.click('[data-view="history"]'); await sleep(1500); await shot('history');

  // 7) フォローアップのステータス更新（接続/アポ獲得）→ KPIに反映
  await page.click('[data-view="companies"]'); await sleep(800);
  // 各変更でテーブルが再描画されるため、その都度セレクタを取り直す
  await page.locator('tbody tr').nth(0).locator('select[data-status]').selectOption('接続');
  await sleep(900);
  await page.locator('tbody tr').nth(2).locator('select[data-status]').selectOption('アポ獲得');
  await sleep(900); await shot('companies-updated');

  // 8) ダッシュボードに戻りKPI更新を確認
  await page.click('[data-view="dashboard"]'); await sleep(1800); await shot('dashboard-final');

  await ctx.close(); // 動画ファイルを確定
  await browser.close();
  server.close();

  // 録画(webm)をmp4へ変換
  const webm = fs.readdirSync(VIDDIR).find((f) => f.endsWith('.webm'));
  if (webm) {
    const ffmpeg = require(path.join(ROOT, '..', 'form-sales-demo/node_modules/@ffmpeg-installer/ffmpeg')).path;
    const r = spawnSync(ffmpeg, ['-y', '-i', path.join(VIDDIR, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=1280:-2', OUT], { encoding: 'utf8' });
    if (r.status === 0) console.log(`\n✅ 動画を出力: ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB)`);
    else console.error('ffmpeg失敗:', r.stderr?.slice(-600));
  }
  console.log(`スクリーンショット: ${SHOTS} (${n}枚)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
