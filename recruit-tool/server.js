/**
 * 採用支援ツール — APIサーバー
 * -----------------------------------------------------------------------------
 * - 静的ダッシュボード（public/）の配信
 * - 会社情報 / 求人 / 応募者 の CRUD
 * - AI求人原稿生成（/api/jobs/generate）・応募者対応文面生成（/api/replies/generate）
 * - 採用KPIの集計（/api/dashboard）
 */
const path = require('path');
const express = require('express');
const db = require('./src/db');
const { generateJobPosting } = require('./src/job-generator');
const { generateReply, KINDS } = require('./src/reply-generator');

const PORT = process.env.PORT || 4190;
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const APPLICANT_STATUSES = ['応募', '書類選考', '一次面接', '最終面接', '内定', '入社', '見送り'];
const JOB_STATUSES = ['下書き', '公開中', '終了'];

// =============================================================================
// 会社情報
// =============================================================================
app.get('/api/company', (req, res) => res.json(db.read().company));
app.put('/api/company', (req, res) => {
  const data = db.read();
  data.company = { ...data.company, ...req.body };
  if (req.body.recruitBudget !== undefined) data.company.recruitBudget = Number(req.body.recruitBudget) || 0;
  db.write(data);
  res.json(data.company);
});

// =============================================================================
// 求人
// =============================================================================
app.get('/api/jobs', (req, res) => res.json(db.read().jobs));
app.post('/api/jobs', (req, res) => {
  const data = db.read();
  const job = {
    id: db.id('job'),
    title: req.body.title || '無題の求人',
    industry: req.body.industry || data.company.industry || '',
    employmentType: req.body.employmentType || '正社員',
    location: req.body.location || '',
    salary: req.body.salary || '',
    appeal: req.body.appeal || '',
    catchphrase: req.body.catchphrase || '',
    body: req.body.body || '',
    status: JOB_STATUSES.includes(req.body.status) ? req.body.status : '下書き',
    source: req.body.source || '手動',
    createdAt: new Date().toISOString(),
  };
  data.jobs.push(job);
  db.write(data);
  res.status(201).json(job);
});
app.put('/api/jobs/:id', (req, res) => {
  const data = db.read();
  const job = data.jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  for (const k of ['title', 'industry', 'employmentType', 'location', 'salary', 'appeal', 'catchphrase', 'body']) {
    if (req.body[k] !== undefined) job[k] = req.body[k];
  }
  if (req.body.status && JOB_STATUSES.includes(req.body.status)) job.status = req.body.status;
  db.write(data);
  res.json(job);
});
app.delete('/api/jobs/:id', (req, res) => {
  const data = db.read();
  data.jobs = data.jobs.filter((j) => j.id !== req.params.id);
  data.applicants = data.applicants.filter((a) => a.jobId !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

/** AI求人原稿生成（保存はしない。プレビューを返す） */
app.post('/api/jobs/generate', async (req, res) => {
  try {
    const data = db.read();
    const result = await generateJobPosting({ ...req.body, company: data.company.name });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// 応募者（軽量ATS）
// =============================================================================
app.get('/api/applicants', (req, res) => res.json(db.read().applicants));
app.post('/api/applicants', (req, res) => {
  const data = db.read();
  const ap = {
    id: db.id('apl'),
    jobId: req.body.jobId || '',
    name: req.body.name || '',
    email: req.body.email || '',
    tel: req.body.tel || '',
    channel: req.body.channel || '',
    status: APPLICANT_STATUSES.includes(req.body.status) ? req.body.status : '応募',
    note: req.body.note || '',
    appliedAt: new Date().toISOString(),
  };
  data.applicants.push(ap);
  db.write(data);
  res.status(201).json(ap);
});
app.put('/api/applicants/:id', (req, res) => {
  const data = db.read();
  const ap = data.applicants.find((a) => a.id === req.params.id);
  if (!ap) return res.status(404).json({ error: 'not found' });
  for (const k of ['name', 'email', 'tel', 'channel', 'note', 'jobId']) {
    if (req.body[k] !== undefined) ap[k] = req.body[k];
  }
  if (req.body.status && APPLICANT_STATUSES.includes(req.body.status)) ap.status = req.body.status;
  db.write(data);
  res.json(ap);
});
app.delete('/api/applicants/:id', (req, res) => {
  const data = db.read();
  data.applicants = data.applicants.filter((a) => a.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

/** AI応募者対応文面生成 */
app.post('/api/replies/generate', async (req, res) => {
  try {
    const data = db.read();
    const ap = data.applicants.find((a) => a.id === req.body.applicantId);
    const job = ap ? data.jobs.find((j) => j.id === ap.jobId) : null;
    const result = await generateReply({
      kind: req.body.kind,
      applicantName: ap ? ap.name : req.body.applicantName,
      jobTitle: job ? job.title : req.body.jobTitle,
      company: data.company.name,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// =============================================================================
// 採用KPIダッシュボード
//   採用単価 = 媒体費 ÷ 入社数 ／ 応募単価 = 媒体費 ÷ 応募総数
// =============================================================================
app.get('/api/dashboard', (req, res) => {
  const data = db.read();
  const apps = data.applicants;
  const byStatus = Object.fromEntries(APPLICANT_STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length]));
  const total = apps.length;
  const offers = byStatus['内定'] + byStatus['入社'];
  const hires = byStatus['入社'];
  const inSelection = byStatus['応募'] + byStatus['書類選考'] + byStatus['一次面接'] + byStatus['最終面接'];
  const budget = Number(data.company.recruitBudget) || 0;

  // チャネル別応募数
  const byChannel = {};
  for (const a of apps) { const c = a.channel || '未設定'; byChannel[c] = (byChannel[c] || 0) + 1; }

  res.json({
    openJobs: data.jobs.filter((j) => j.status === '公開中').length,
    totalJobs: data.jobs.length,
    totalApplicants: total,
    inSelection,
    offers,
    hires,
    byStatus,
    byChannel,
    offerRate: total ? offers / total : 0,
    hireRate: total ? hires / total : 0,
    budget,
    costPerApplicant: total ? Math.round(budget / total) : 0,
    costPerHire: hires ? Math.round(budget / hires) : 0,
  });
});

app.get('/api/meta', (req, res) => res.json({ replyKinds: KINDS, aiEnabled: !!process.env.ANTHROPIC_API_KEY }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`採用支援ツール起動: http://localhost:${PORT}`));
}

module.exports = { app };
