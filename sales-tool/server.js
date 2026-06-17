/**
 * 営業支援ツール — APIサーバー
 * -----------------------------------------------------------------------------
 * - 静的ダッシュボード（public/）の配信
 * - 企業リスト / 文面テンプレート / 送信者プロフィール の CRUD
 * - フォーム自動送信の実行（/api/send）と送信履歴・KPIの集計
 * - デモ用の疑似企業サイト（/targets/*）
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('./src/db');
const { mockTargets } = require('./src/mock-targets');
const { sendToForm, SHOTS_DIR } = require('./src/sender');

const PORT = process.env.PORT || 4180;
const app = express();
app.use(express.json({ limit: '1mb' }));

// ---- デモ用 疑似企業サイト ----
app.use('/targets', mockTargets());

// ---- 静的ダッシュボード ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(SHOTS_DIR));

// =============================================================================
// プロフィール（送信者情報）
// =============================================================================
app.get('/api/profile', (req, res) => res.json(db.read().profile));
app.put('/api/profile', (req, res) => {
  const data = db.read();
  data.profile = { ...data.profile, ...req.body };
  db.write(data);
  res.json(data.profile);
});

// =============================================================================
// 文面テンプレート
// =============================================================================
app.get('/api/templates', (req, res) => res.json(db.read().templates));
app.post('/api/templates', (req, res) => {
  const data = db.read();
  const t = {
    id: db.id('tpl'),
    name: req.body.name || '無題のテンプレート',
    subject: req.body.subject || '',
    message: req.body.message || '',
    preferredCategory: req.body.preferredCategory || ['その他', 'other'],
    createdAt: new Date().toISOString(),
  };
  data.templates.push(t);
  db.write(data);
  res.status(201).json(t);
});
app.put('/api/templates/:id', (req, res) => {
  const data = db.read();
  const t = data.templates.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  Object.assign(t, {
    name: req.body.name ?? t.name,
    subject: req.body.subject ?? t.subject,
    message: req.body.message ?? t.message,
    preferredCategory: req.body.preferredCategory ?? t.preferredCategory,
  });
  db.write(data);
  res.json(t);
});
app.delete('/api/templates/:id', (req, res) => {
  const data = db.read();
  data.templates = data.templates.filter((x) => x.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// =============================================================================
// 企業リスト（軽量CRM/SFA）
// =============================================================================
const STATUSES = ['未送信', '送信済', '送信失敗', '接続', 'アポ獲得', '見送り'];

app.get('/api/companies', (req, res) => res.json(db.read().companies));
app.post('/api/companies', (req, res) => {
  const data = db.read();
  const c = {
    id: db.id('cmp'),
    name: req.body.name || '',
    industry: req.body.industry || '',
    formUrl: req.body.formUrl || '',
    contactPerson: req.body.contactPerson || '',
    tel: req.body.tel || '',
    note: req.body.note || '',
    status: STATUSES.includes(req.body.status) ? req.body.status : '未送信',
    lastSentAt: null,
    createdAt: new Date().toISOString(),
  };
  data.companies.push(c);
  db.write(data);
  res.status(201).json(c);
});
app.put('/api/companies/:id', (req, res) => {
  const data = db.read();
  const c = data.companies.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  for (const k of ['name', 'industry', 'formUrl', 'contactPerson', 'tel', 'note']) {
    if (req.body[k] !== undefined) c[k] = req.body[k];
  }
  if (req.body.status && STATUSES.includes(req.body.status)) c.status = req.body.status;
  db.write(data);
  res.json(c);
});
app.delete('/api/companies/:id', (req, res) => {
  const data = db.read();
  data.companies = data.companies.filter((x) => x.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

/**
 * 一括インポート（CSV/TSV風のテキスト貼り付け）
 * 各行: 会社名,業種,フォームURL,担当者,電話  （カンマ or タブ区切り）
 */
app.post('/api/companies/import', (req, res) => {
  const text = String(req.body.text || '');
  const data = db.read();
  let added = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/[\t,]/).map((s) => s.trim());
    if (!cols[0]) continue;
    data.companies.push({
      id: db.id('cmp'),
      name: cols[0],
      industry: cols[1] || '',
      formUrl: cols[2] || '',
      contactPerson: cols[3] || '',
      tel: cols[4] || '',
      note: '',
      status: '未送信',
      lastSentAt: null,
      createdAt: new Date().toISOString(),
    });
    added++;
  }
  db.write(data);
  res.json({ added, total: data.companies.length });
});

// =============================================================================
// 送信履歴
// =============================================================================
app.get('/api/sends', (req, res) => {
  const sends = db.read().sends.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(sends);
});

// =============================================================================
// KPIダッシュボード集計
//   担当者接続率 = (接続 + アポ獲得) / 送信数   目標 15%
//   アポイント率 = アポ獲得 / 送信数             目標 1%
// =============================================================================
app.get('/api/dashboard', (req, res) => {
  const data = db.read();
  const c = data.companies;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, c.filter((x) => x.status === s).length]));
  const sentCount = c.filter((x) => ['送信済', '接続', 'アポ獲得', '見送り'].includes(x.status)).length;
  const connected = byStatus['接続'] + byStatus['アポ獲得'];
  const appointments = byStatus['アポ獲得'];
  const sendsTotal = data.sends.length;
  const sendsSuccess = data.sends.filter((s) => s.status === 'success').length;

  res.json({
    totalCompanies: c.length,
    byStatus,
    sentCount,
    connected,
    appointments,
    connectRate: sentCount ? connected / sentCount : 0,
    appointmentRate: sentCount ? appointments / sentCount : 0,
    deliveryRate: sendsTotal ? sendsSuccess / sendsTotal : 0,
    targets: { connectRate: 0.15, appointmentRate: 0.01 },
    sendsTotal,
    sendsSuccess,
  });
});

// =============================================================================
// 文面の変数差し込み
//   {{company}} 自社名 / {{fullName}} 氏名 / {{dept}} 部署 / {{target}} 送信先企業名 など
// =============================================================================
function render(text, profile, company) {
  const map = {
    company: profile.company,
    fullName: profile.fullName,
    lastName: profile.lastName,
    firstName: profile.firstName,
    dept: profile.dept,
    email: profile.email,
    tel: profile.tel,
    target: company ? company.name : '貴社',
    targetPerson: company && company.contactPerson ? company.contactPerson : 'ご担当者',
  };
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));
}

function absoluteUrl(formUrl, req) {
  if (/^https?:\/\//i.test(formUrl)) return formUrl;
  const base = `${req.protocol}://${req.get('host')}`;
  return base + (formUrl.startsWith('/') ? '' : '/') + formUrl;
}

// =============================================================================
// フォーム自動送信の実行
//   body: { companyIds: [...], templateId, dryRun? }
// =============================================================================
app.post('/api/send', async (req, res) => {
  const { companyIds = [], templateId, dryRun = false } = req.body || {};
  const data = db.read();
  const template = data.templates.find((t) => t.id === templateId);
  if (!template) return res.status(400).json({ error: 'テンプレートが見つかりません' });
  const targets = data.companies.filter((c) => companyIds.includes(c.id));
  if (!targets.length) return res.status(400).json({ error: '送信先企業が選択されていません' });

  const results = [];
  for (const company of targets) {
    if (!company.formUrl) {
      results.push({ companyId: company.id, name: company.name, ok: false, error: 'フォームURL未設定' });
      continue;
    }
    const sendId = db.id('snd');
    const profile = {
      ...data.profile,
      subject: render(template.subject, data.profile, company),
      message: render(template.message, data.profile, company),
      preferredCategory: template.preferredCategory,
    };
    const url = absoluteUrl(company.formUrl, req);
    const r = await sendToForm(url, profile, { shotId: sendId, dryRun });

    // 履歴へ記録
    const record = {
      id: sendId,
      companyId: company.id,
      companyName: company.name,
      templateId: template.id,
      templateName: template.name,
      status: r.ok ? 'success' : 'failed',
      detectedCount: r.detectedCount,
      filledCount: r.filledCount,
      filled: r.filled,
      finalUrl: r.finalUrl,
      screenshot: r.screenshot,
      error: r.error,
      dryRun,
      createdAt: new Date().toISOString(),
    };
    // 直近の履歴を反映するため都度読み直す（並行更新の取りこぼし回避）
    const cur = db.read();
    cur.sends.push(record);
    const cc = cur.companies.find((x) => x.id === company.id);
    if (cc && !dryRun) {
      cc.status = r.ok ? (cc.status === '未送信' || cc.status === '送信失敗' ? '送信済' : cc.status) : '送信失敗';
      if (r.ok) cc.lastSentAt = record.createdAt;
    }
    db.write(cur);

    results.push({ companyId: company.id, name: company.name, ok: r.ok, sendId, error: r.error,
      detectedCount: r.detectedCount, filledCount: r.filledCount, screenshot: r.screenshot });
  }

  res.json({ results });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`営業支援ツール起動: http://localhost:${PORT}`);
  });
}

module.exports = { app, render, absoluteUrl };
