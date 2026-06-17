/**
 * デモ録画オーケストレーター（採用支援ツール）
 * -----------------------------------------------------------------------------
 * ダッシュボード → AI求人作成 → 求人一覧 → 応募者管理（ステータス更新・AI返信生成）
 * → 会社情報 の一連の操作を Playwright で録画し、mp4 とスクショを出力する。
 *
 * 使い方:  node scripts/demo-run.js
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// playwright / ffmpeg は他プロジェクトの node_modules を再利用（再DL回避）
const { chromium } = require(require.resolve('playwright', { paths: [
  path.join(ROOT, 'node_modules'), path.join(ROOT, '..', 'sales-tool', 'node_modules'),
  path.join(ROOT, '..', 'form-sales-demo', 'node_modules')] }));

const PORT = 4198;
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
  const dbPath = path.join(ROOT, 'data', 'db.json');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  for (const d of [SHOTS, VIDDIR]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

  process.env.PORT = String(PORT);
  const { app } = require('../server');
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  console.log('サーバー起動:', BASE);

  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: VIDDIR, size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage();
  let n = 0;
  const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`) }); };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(1400); await shot('dashboard');

  // AI求人作成
  await page.click('[data-view="generate"]'); await sleep(900);
  await page.fill('#g-title', '保育士（パート）');
  await page.selectOption('#g-industry', '保育');
  await page.selectOption('#g-emp', 'アルバイト・パート');
  await page.fill('#g-location', '東京都杉並区（最寄駅徒歩5分）');
  await page.fill('#g-salary', '時給1,300円〜1,500円');
  await page.fill('#g-appeal', '扶養内勤務OK, 週3日から相談可, ブランク歓迎, 残業なし');
  await sleep(600); await shot('generate-input');
  await page.click('#btn-generate');
  await page.waitForSelector('#gen-result:not(.hidden)', { timeout: 30000 });
  await sleep(1200); await shot('generate-result');
  await page.click('#btn-save-job');
  await page.waitForSelector('#view-jobs:not(.hidden)', { timeout: 10000 });
  await sleep(1200); await shot('jobs');

  // 求人本文を展開
  const toggle = await page.$('#job-list [data-toggle]');
  if (toggle) { await toggle.click(); await sleep(1000); await shot('job-body'); }

  // 応募者管理 → ステータス更新
  await page.click('[data-view="applicants"]'); await sleep(1000); await shot('applicants');
  const sel = await page.$('#applicant-table select[data-astatus]');
  if (sel) { await sel.selectOption('内定'); await sleep(900); await shot('applicant-status'); }

  // AI返信文面生成
  const replyBtn = await page.$('#applicant-table [data-reply]');
  if (replyBtn) {
    await replyBtn.click(); await sleep(700);
    await page.selectOption('#rep-kind', 'interview');
    await page.click('#rep-gen');
    await page.waitForSelector('#rep-body', { timeout: 30000 });
    await sleep(1200); await shot('reply-generated');
    await page.click('#modal-close'); await sleep(500);
  }

  // ダッシュボードに戻りKPI更新を確認
  await page.click('[data-view="dashboard"]'); await sleep(1600); await shot('dashboard-final');

  await ctx.close();
  await browser.close();
  server.close();

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
