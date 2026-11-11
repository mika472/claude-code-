const FPS = 30, DURATION = +document.body.dataset.duration;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = x => 1 - Math.pow(1 - x, 3);
const scenes = [...document.querySelectorAll('.scene')].map(el => ({
  el, s: +el.dataset.s, e: +el.dataset.e, fin: +(el.dataset.fin ?? 0.35),
  bg: el.dataset.bg, img: el.querySelector('.bg img'), last: -1, dir: null, n: 0,
}));

// 1文字ずつのアニメーション用に分割
document.querySelectorAll('.split').forEach(el => {
  const st = +(el.dataset.stagger || 0.04), d = +(el.dataset.d || 0); let i = 0;
  const walk = n => [...n.childNodes].forEach(c => {
    if (c.nodeType === 3) {
      const f = document.createDocumentFragment();
      [...c.textContent].forEach(ch => {
        if (!ch.trim()) { f.append(ch); return; }
        const s = document.createElement('span');
        s.className = 'ch'; s.textContent = ch; s.dataset.a = 'charIn';
        s.dataset.d = (d + i++ * st).toFixed(3); s.dataset.dur = el.dataset.dur || '0.6';
        f.append(s);
      });
      c.replaceWith(f);
    } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
  });
  walk(el);
});

// data-a / data-x を絶対時刻のCSSアニメーションに変換
document.querySelectorAll('[data-a],[data-x]').forEach(el => {
  const s = +el.closest('.scene').dataset.s, list = [];
  if (el.dataset.a) {
    const ease = el.dataset.ease || 'cubic-bezier(.16,1,.3,1)';
    list.push(`${el.dataset.a} ${el.dataset.dur || 0.75}s ${ease} ${(s + +(el.dataset.d || 0)).toFixed(3)}s ${el.dataset.iter || 1} both`);
  }
  if (el.dataset.x) list.push(`${el.dataset.xa || 'outUp'} .45s cubic-bezier(.5,0,.75,0) ${(s + +el.dataset.x).toFixed(3)}s 1 forwards`);
  el.style.animation = list.join(',');
});

const counters = [...document.querySelectorAll('[data-count]')].map(el => ({
  el, s: +el.closest('.scene').dataset.s, from: +el.dataset.from, to: +el.dataset.to,
  dec: +el.dataset.dec, cs: +el.dataset.cs, cd: +el.dataset.cd,
}));
const black = document.getElementById('black');
let anims = [];

async function init() {
  const text = document.body.innerText;
  const fonts = ['400 20px "Noto Sans JP"', '500 20px "Noto Sans JP"', '700 20px "Noto Sans JP"', '900 20px "Noto Sans JP"',
    '600 20px "Inter"', '800 20px "Inter"', '900 20px "Inter"', '600 20px "Shippori Mincho B1"', '800 20px "Shippori Mincho B1"'];
  await Promise.all(fonts.map(f => document.fonts.load(f, text)));
  await document.fonts.ready;
  anims = document.getAnimations();
  anims.forEach(a => a.pause());
}

async function seek(t) {
  anims.forEach(a => { a.currentTime = t * 1000; });
  const waits = [];
  scenes.forEach((sc, i) => {
    const next = scenes[i + 1];
    const until = next ? next.s + next.fin : Infinity;
    const on = t >= sc.s && t < until;
    sc.el.style.visibility = on ? 'visible' : 'hidden';
    if (!on) { sc.el.style.opacity = 0; return; }
    sc.el.style.opacity = sc.fin ? clamp((t - sc.s) / sc.fin) : 1;
    sc.el.style.setProperty('--p', clamp((t - sc.s) / (sc.e - sc.s)).toFixed(4));
    if (sc.bg && sc.img && sc.dir) {
      const idx = clamp(Math.floor((t - sc.s) * FPS) + 1, 1, sc.n || 1);
      if (idx !== sc.last) {
        sc.last = idx;
        sc.img.src = `.cache/frames/${sc.dir}/${String(idx).padStart(4, '0')}.jpg`;
        waits.push(sc.img.decode().catch(() => {}));
      }
    }
  });
  counters.forEach(c => {
    const v = c.from + (c.to - c.from) * easeOut(clamp((t - c.s - c.cs) / c.cd));
    c.el.textContent = v.toLocaleString('en-US', { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
  });
  black.style.opacity = clamp((t - (DURATION - 0.7)) / 0.6);
  await Promise.all(waits);
}

window.__ready = init().then(() => seek(0));
window.seek = seek;
// 背景クリップの必要尺（次シーンのフェード分を含む）を返す／連番フレームの場所を受け取る
window.__bgNeeds = () => scenes.map((sc, i) => ({ i, bg: sc.bg || null, len: sc.e - sc.s + (scenes[i + 1] ? scenes[i + 1].fin : 0) }));
window.__setFrames = list => list.forEach(f => { scenes[f.i].dir = f.dir; scenes[f.i].n = f.n; });

// ブラウザで直接開いたときの簡易プレビュー（?render なしの場合）
if (!location.search.includes('render')) {
  window.__ready.then(() => {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    const st = document.getElementById('stage');
    st.style.transformOrigin = '0 0'; st.style.transform = `scale(${k})`;
    const audio = new Audio(document.body.dataset.bgm); let t0 = null;
    const loop = now => { if (t0 === null) t0 = now; const t = ((now - t0) / 1000) % DURATION; seek(t); requestAnimationFrame(loop); };
    addEventListener('click', () => { t0 = null; audio.currentTime = 0; audio.play(); }, { once: true });
    requestAnimationFrame(loop);
  });
}
