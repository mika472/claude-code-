/**
 * フォーム自動送信エンジン
 * -----------------------------------------------------------------------------
 * 1社分のお問い合わせフォームを開き、入力欄を解析（field-mapper）して
 * 「どこに何を入れるか」を決定 → 自動入力 → 送信し、結果とスクリーンショットを返す。
 *
 * 録画用のフレーム収集は持たず、結果記録（成功/失敗・検出項目・送信後URL・画面キャプチャ）
 * に特化している。複数社へ連続送信する際はブラウザを使い回す。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { buildFillPlan } = require('./field-mapper');

const SHOTS_DIR = path.join(__dirname, '..', 'data', 'screenshots');

/** Chrome バイナリの場所を解決（本ツール内 → 既存デモ の順で探索） */
function resolveChrome() {
  const candidates = [
    path.join(__dirname, '..', '.chrome', 'chrome-linux64', 'chrome'),
    path.join(__dirname, '..', '..', 'form-sales-demo', '.chrome', 'chrome-linux64', 'chrome'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null; // playwright 同梱版にフォールバック
}

let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  const executablePath = resolveChrome();
  _browser = await chromium.launch({
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return _browser;
}

async function closeBrowser() {
  if (_browser) { await _browser.close().catch(() => {}); _browser = null; }
}

/** フォーム内の入力欄をラベル込みで抽出 */
async function detectFields(page) {
  return await page.$$eval('form input, form select, form textarea', (els) => {
    function labelFor(el) {
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
      .filter((el) => !['hidden', 'submit', 'button'].includes(el.type))
      .map((el) => {
        el.setAttribute('data-af', String(i));
        const out = {
          selector: `[data-af="${i}"]`,
          tag: el.tagName.toLowerCase(),
          type: (el.type || '').toLowerCase(),
          name: el.name || '',
          id: el.id || '',
          placeholder: el.placeholder || '',
          label: (labelFor(el) || '').replace(/\s+/g, ' ').trim(),
          options:
            el.tagName.toLowerCase() === 'select'
              ? Array.from(el.options).map((o) => ({ value: o.value, label: o.textContent.trim() }))
              : [],
        };
        i++;
        return out;
      });
  });
}

/**
 * 1社へ自動送信する。
 * @param {string} url        送信先フォームURL（絶対URL）
 * @param {object} profile    送信に使う値（会社名・氏名・件名・本文・preferredCategory 等）
 * @param {object} opts       { shotId?: スクショ保存名, dryRun?: 送信ボタンを押さない }
 * @returns {object} 送信結果
 */
async function sendToForm(url, profile, opts = {}) {
  const { shotId, dryRun = false } = opts;
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const result = {
    ok: false,
    url,
    detectedCount: 0,
    filledCount: 0,
    filled: [],
    finalUrl: null,
    screenshot: null,
    error: null,
  };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const fields = await detectFields(page);
    const plan = buildFillPlan(fields, profile);
    result.detectedCount = fields.length;
    result.filledCount = plan.length;
    result.filled = plan.map((p) => ({ label: p.label, meaning: p.meaning }));

    for (const p of plan) {
      const el = page.locator(p.selector);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      if (p.kind === 'fill') {
        await el.fill(String(p.value));
      } else if (p.kind === 'select') {
        await el.selectOption(String(p.value)).catch(async () => {
          await el.selectOption({ label: String(p.value) }).catch(() => {});
        });
      } else if (p.kind === 'check') {
        await el.check().catch(() => {});
      }
    }

    if (shotId) {
      if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
      const file = path.join(SHOTS_DIR, `${shotId}.png`);
      await page.screenshot({ path: file, fullPage: true });
      result.screenshot = `${shotId}.png`;
    }

    if (!dryRun) {
      await page.locator('form button[type="submit"], form button').first().click();
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      result.finalUrl = page.url();
    }
    result.ok = true;
  } catch (e) {
    result.error = e.message || String(e);
  } finally {
    await page.close().catch(() => {});
  }
  return result;
}

module.exports = { sendToForm, closeBrowser, SHOTS_DIR };
