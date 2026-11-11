// HTMLの動画を1フレームずつ撮影し、ffmpegでBGM付きMP4に書き出す。
//   node render.mjs <name>                 … 全編を書き出し（out/ 以下。ファイル名は <body data-out>）
//   node render.mjs <name> --stills [秒,秒] … 確認用の静止画（.cache/stills/<name>）
//   <name> = training | course | mylabo | overview
// 事前準備: npm i（フォント）。背景フレームは assets/*.mp4 から自動生成（.cache/frames）
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = dirname(fileURLToPath(import.meta.url));
const NAME = process.argv[2];
if (!NAME || !existsSync(join(ROOT, `${NAME}.html`))) { console.error('usage: node render.mjs <training|course|mylabo|overview> [--stills [t,t]]'); process.exit(1); }
const FPS = 30, WORKERS = 4, CLIP_SEC = 5.0;

const browser = await chromium.launch();
let frames = null, meta = null;
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(ROOT, `${NAME}.html`)).href + '?render');
  await page.evaluate(() => window.__ready);
  if (!frames) {
    // 背景クリップを各シーンの尺に合わせて滑らかに引き伸ばし、連番JPEGにする
    meta = await page.evaluate(() => ({ ...document.body.dataset, needs: window.__bgNeeds() }));
    frames = meta.needs.filter(n => n.bg).map(n => {
      const k = Math.max(1, Math.ceil((n.len + 0.2) / CLIP_SEC * 20) / 20).toFixed(2);
      const key = `${n.bg}@${k}`, dir = join(ROOT, '.cache', 'frames', key);
      if (!existsSync(dir) || readdirSync(dir).length === 0) {
        mkdirSync(dir, { recursive: true });
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(ROOT, 'assets', `${n.bg}.mp4`), '-vf',
          `setpts=${k}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1,scale=1920:1080:flags=lanczos`,
          '-q:v', '3', join(dir, '%04d.jpg')]);
      }
      return { i: n.i, dir: key, n: readdirSync(dir).length };
    });
  }
  await page.evaluate(f => window.__setFrames(f), frames);
  return page;
};

const first = await open();
const DURATION = +meta.duration, TOTAL = Math.round(FPS * DURATION);

if (process.argv.includes('--stills')) {
  const dir = join(ROOT, '.cache', 'stills', NAME);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const arg = process.argv[process.argv.indexOf('--stills') + 1];
  const scenes = await first.evaluate(() => [...document.querySelectorAll('.scene')].map(s => +s.dataset.e - 0.5));
  for (const t of arg ? arg.split(',').map(Number) : scenes) {
    await first.evaluate(t => window.seek(t), t);
    await first.screenshot({ path: join(dir, `t${t.toFixed(1).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 80 });
  }
  await browser.close();
  process.exit(0);
}

const fdir = join(ROOT, '.cache', 'render', NAME);
rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir, { recursive: true });
let done = 0;
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const page = w === 0 ? first : await open();
  for (let f = w; f < TOTAL; f += WORKERS) {
    await page.evaluate(t => window.seek(t), f / FPS);
    await page.screenshot({ path: join(fdir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 96 });
    if (++done % 400 === 0) console.log(`${NAME} ${done}/${TOTAL}`);
  }
}));
await browser.close();

const OUT = join(ROOT, 'out', `${meta.out}.mp4`);
mkdirSync(dirname(OUT), { recursive: true });
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(fdir, '%05d.jpg'),
  '-ss', String(meta.bgmSs || 0), '-i', join(ROOT, meta.bgm),
  '-af', `afade=t=in:d=0.4,afade=t=out:st=${DURATION - 1.6}:d=1.6,loudnorm=I=-15:TP=-1.5`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '192k', '-t', String(DURATION), OUT], { stdio: 'inherit' });
ff.on('exit', code => { console.log(code === 0 ? `done: ${OUT}` : `ffmpeg failed: ${code}`); process.exit(code); });
