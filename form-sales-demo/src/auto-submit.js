/**
 * 自動フォーム送信エンジン（Playwright）
 * 1. 対象ページを開く
 * 2. フォーム内の入力欄を検出（detectFields）
 * 3. フィールドマッピングエンジンで「どこに何を入れるか」を決定
 * 4. 検出結果を画面上にハイライト表示（解析の可視化）
 * 5. 人間らしい速度で入力し、同意チェック→送信
 * 6. 全工程のフレームを収集（録画用）
 */
const path = require('path');
const fs = require('fs');
const { buildFillPlan } = require('./field-mapper');

/** ページ内の入力欄を、ラベル文言込みで抽出する */
async function detectFields(page) {
  return await page.$$eval('form input, form select, form textarea', (els) => {
    function labelFor(el) {
      // 1) <label for=id>  2) 親<label>  3) 直前のラベル要素
      if (el.id) {
        const l = document.querySelector(`label[for="${el.id}"]`);
        if (l) return l.innerText;
      }
      const wrap = el.closest('label');
      if (wrap) return wrap.innerText;
      const field = el.closest('.field, .row > div, div, p');
      if (field) {
        const l = field.querySelector('label');
        if (l) return l.innerText;
      }
      return '';
    }
    let i = 0;
    return els
      .filter(el => !['hidden', 'submit', 'button'].includes(el.type))
      .map(el => {
        el.setAttribute('data-af', String(i)); // 一意セレクタ用の目印
        const out = {
          selector: `[data-af="${i}"]`,
          tag: el.tagName.toLowerCase(),
          type: (el.type || '').toLowerCase(),
          name: el.name || '',
          id: el.id || '',
          placeholder: el.placeholder || '',
          label: (labelFor(el) || '').replace(/\s+/g, ' ').trim(),
          options: el.tagName.toLowerCase() === 'select'
            ? Array.from(el.options).map(o => ({ value: o.value, label: o.textContent.trim() }))
            : [],
        };
        i++;
        return out;
      });
  });
}

/** 解析結果を画面に可視化（緑の枠＋意味ラベル） */
async function highlight(page, plan) {
  await page.evaluate((plan) => {
    document.querySelectorAll('.__afbadge').forEach(n => n.remove());
    for (const p of plan) {
      const el = document.querySelector(p.selector);
      if (!el) continue;
      el.style.outline = '2px solid #2f9e44';
      el.style.outlineOffset = '2px';
      el.style.transition = 'background .3s';
      el.style.background = '#eafbef';
      const r = el.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.className = '__afbadge';
      badge.textContent = p.meaning;
      Object.assign(badge.style, {
        position: 'absolute',
        left: (window.scrollX + r.right - 4) + 'px',
        top: (window.scrollY + r.top - 10) + 'px',
        transform: 'translateX(-100%)',
        background: '#2f9e44', color: '#fff', font: '11px sans-serif',
        padding: '2px 7px', borderRadius: '10px', zIndex: 9999, whiteSpace: 'nowrap',
        boxShadow: '0 1px 4px rgba(0,0,0,.25)',
      });
      document.body.appendChild(badge);
    }
  }, plan);
}

/** 自動入力＋送信を実行。recorder.snap() で随時フレームを収集 */
async function runOn(page, url, profile, recorder, label) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await recorder.hold(0.6);

  const fields = await detectFields(page);
  const plan = buildFillPlan(fields, profile);
  console.log(`\n[${label}] 検出フィールド数=${fields.length} / 自動入力対象=${plan.length}`);
  plan.forEach(p => console.log(`   ・${p.label}  →  ${p.meaning}`));

  // 解析の可視化
  await highlight(page, plan);
  await recorder.hold(1.2);

  // 入力（人間らしい速度・フォーカス遷移）
  for (const p of plan) {
    const el = page.locator(p.selector);
    await el.scrollIntoViewIfNeeded();
    if (p.kind === 'fill') {
      await el.click();
      await recorder.snap();
      // 人間らしく数文字ずつ入力し、その都度フレームを収集（タイピングの可視化）
      const text = String(p.value);
      for (let i = 0; i < text.length; i += 2) {
        await el.pressSequentially(text.slice(i, i + 2), { delay: 15 });
        await recorder.snap();
      }
    } else if (p.kind === 'select') {
      await el.selectOption(String(p.value)).catch(async () => {
        await el.selectOption({ label: String(p.value) });
      });
    } else if (p.kind === 'check') {
      await el.check();
    }
    await recorder.snap();
  }

  await recorder.hold(0.8);
  // 送信
  await page.locator('form button[type="submit"], form button').first().click();
  await page.waitForLoadState('networkidle');
  await recorder.hold(1.6);
  console.log(`[${label}] 送信完了 → ${page.url()}`);
}

module.exports = { detectFields, runOn };
