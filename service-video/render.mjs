// index.html を1フレームずつ撮影し、ffmpegでBGM付きMP4に書き出す。
//   node render.mjs            … 全編を書き出し（out/milee-growth-service-intro.mp4）
//   node render.mjs --stills   … 確認用の静止画だけ書き出し（.cache/stills）
// 事前準備: npm i / 背景フレームは assets/clip*.mp4 から自動生成（.cache/frames）
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = dirname(fileURLToPath(import.meta.url));
const FPS = 30, DURATION = 78.5, TOTAL = Math.round(FPS * DURATION), WORKERS = 4;
const STRETCH = { clip1: 1.0, clip2: 1.45, clip3: 1.4, clip4: 1.48, clip5: 1.12 };
const OUT = join(ROOT, 'out', 'milee-growth-service-intro.mp4');

// 背景クリップをシーン尺に合わせて滑らかに引き伸ばし、連番JPEGにする
const frames = {};
for (const [clip, k] of Object.entries(STRETCH)) {
  const dir = join(ROOT, '.cache', 'frames', clip);
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    mkdirSync(dir, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ROOT, 'assets', `${clip}.mp4`), '-vf',
      `setpts=${k}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1,scale=1920:1080:flags=lanczos`,
      '-q:v', '3', join(dir, '%04d.jpg')]);
  }
  frames[clip] = readdirSync(dir).length;
}

const browser = await chromium.launch();
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript(f => { window.__frames = f; }, frames);
  await page.goto(pathToFileURL(join(ROOT, 'index.html')).href + '?render');
  await page.evaluate(() => window.__ready);
  return page;
};

if (process.argv.includes('--stills')) {
  const dir = join(ROOT, '.cache', 'stills');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const page = await open();
  const arg = process.argv[process.argv.indexOf('--stills') + 1];
  const times = arg ? arg.split(',').map(Number) : [3.8, 11.5, 17.8, 21.4, 25.2, 31.8, 38.6, 43.2, 48.6, 54.0, 61.2, 66.8, 72.2, 77.2];
  for (const t of times) {
    await page.evaluate(t => window.seek(t), t);
    await page.screenshot({ path: join(dir, `t${t.toFixed(1).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 80 });
  }
  await browser.close();
  process.exit(0);
}

const fdir = join(ROOT, '.cache', 'render');
rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir, { recursive: true });
let done = 0;
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const page = await open();
  for (let f = w; f < TOTAL; f += WORKERS) {
    await page.evaluate(t => window.seek(t), f / FPS);
    await page.screenshot({ path: join(fdir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 96 });
    if (++done % 300 === 0) console.log(`${done}/${TOTAL}`);
  }
}));
await browser.close();

mkdirSync(dirname(OUT), { recursive: true });
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(fdir, '%05d.jpg'),
  '-i', join(ROOT, 'assets', 'bgm.mp3'),
  '-af', `afade=t=in:d=0.4,afade=t=out:st=${DURATION - 1.6}:d=1.6,loudnorm=I=-15:TP=-1.5`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '192k', '-t', String(DURATION), OUT], { stdio: 'inherit' });
ff.on('exit', code => { console.log(code === 0 ? `done: ${OUT}` : `ffmpeg failed: ${code}`); process.exit(code); });
