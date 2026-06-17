/**
 * デモ実行オーケストレーター
 *   ローカル疑似企業サイト起動 → 2社のフォームへ自動入力・送信 → mp4 出力
 *
 * 使い方:  node run-demo.js
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const { createServer } = require('./src/server');
const { runOn } = require('./src/auto-submit');
const { Recorder } = require('./src/recorder');

const PORT = 4178;
const CHROME = path.join(__dirname, '.chrome/chrome-linux64/chrome');
const FRAMES = path.join(__dirname, 'frames');
const OUT = path.join(__dirname, 'demo.mp4');
const FPS = 12;

async function main() {
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/profile.json')));

  // 1) 疑似企業サイト起動
  const server = await new Promise((resolve) => {
    const s = createServer().listen(PORT, () => resolve(s));
  });
  console.log(`疑似企業サイト起動: http://localhost:${PORT}`);

  // 2) ブラウザ起動
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const recorder = new Recorder(page, FRAMES, FPS);

  // 3) 2社のフォームへ自動送信
  await runOn(page, `http://localhost:${PORT}/company-a`, profile, recorder, '企業A');
  await runOn(page, `http://localhost:${PORT}/company-b`, profile, recorder, '企業B');

  await browser.close();
  server.close();
  console.log(`\n収集フレーム数: ${recorder.frameCount}`);

  // 4) ffmpeg で mp4 へエンコード
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
  const args = [
    '-y', '-framerate', String(FPS),
    '-i', path.join(FRAMES, '%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-vf', 'scale=1280:-2',
    OUT,
  ];
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('ffmpeg失敗:', r.stderr?.slice(-800));
    process.exit(1);
  }
  const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
  console.log(`\n✅ 動画を出力しました: ${OUT} (${mb} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
