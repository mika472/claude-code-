// 採用支援ツール フロントエンド
'use strict';

const api = {
  async get(p) { return (await fetch(p)).json(); },
  async send(p, m, b) {
    const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  },
  post(p, b) { return this.send(p, 'POST', b); },
  put(p, b) { return this.send(p, 'PUT', b); },
  del(p) { return this.send(p, 'DELETE'); },
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const APPLICANT_STATUSES = ['応募', '書類選考', '一次面接', '最終面接', '内定', '入社', '見送り'];
const JOB_STATUSES = ['下書き', '公開中', '終了'];
let state = { jobs: [], applicants: [], company: {}, replyKinds: {} };

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2800); }
function yen(n) { return '¥' + (Number(n) || 0).toLocaleString('ja-JP'); }
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) : '—'; }

$$('.sidebar nav a').forEach((a) => a.addEventListener('click', () => switchView(a.dataset.view)));
function switchView(v) {
  $$('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
  $$('.view').forEach((s) => s.classList.add('hidden'));
  $('#view-' + v).classList.remove('hidden');
  ({ dashboard: renderDashboard, generate: renderGenerate, jobs: renderJobs, applicants: renderApplicants, settings: renderSettings }[v] || (() => {}))();
}

function openModal(t, b) { $('#modal-title').textContent = t; $('#modal-body').innerHTML = b; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

async function loadJobs() { state.jobs = await api.get('/api/jobs'); }
async function loadApplicants() { state.applicants = await api.get('/api/applicants'); }
const jobName = (id) => (state.jobs.find((j) => j.id === id) || {}).title || '（不明）';

// =============================================================================
// ダッシュボード
// =============================================================================
async function renderDashboard() {
  const d = await api.get('/api/dashboard');
  $('#kpi-cards').innerHTML = `
    <div class="card"><div class="label">公開求人</div><div class="value">${d.openJobs}<span style="font-size:16px;color:var(--muted)"> / ${d.totalJobs}</span></div><div class="sub">公開中 / 全求人</div></div>
    <div class="card"><div class="label">総応募数</div><div class="value">${d.totalApplicants}</div><div class="sub">選考中 ${d.inSelection} 名</div></div>
    <div class="card"><div class="label">内定 / 入社</div><div class="value">${d.offers}<span style="font-size:16px;color:var(--muted)"> / ${d.hires}</span></div><div class="sub">内定率 ${pct(d.offerRate)}</div></div>
    <div class="card accent"><div class="label">採用単価</div><div class="value">${d.costPerHire ? yen(d.costPerHire) : '—'}</div><div class="sub">媒体費 ${yen(d.budget)} ÷ 入社 ${d.hires}</div></div>
    <div class="card accent"><div class="label">応募単価</div><div class="value">${d.costPerApplicant ? yen(d.costPerApplicant) : '—'}</div><div class="sub">媒体費 ÷ 応募 ${d.totalApplicants}</div></div>`;

  const maxS = Math.max(1, ...Object.values(d.byStatus));
  $('#status-bars').innerHTML = APPLICANT_STATUSES.map((s) => {
    const n = d.byStatus[s] || 0;
    return `<div class="bar-row"><span class="bar-label"><span class="badge s-${s}">${s}</span></span>
      <span class="bar-track"><span class="bar-fill" style="width:${(n / maxS) * 100}%"></span></span><span class="bar-num">${n}</span></div>`;
  }).join('');

  const ch = Object.entries(d.byChannel);
  const maxC = Math.max(1, ...ch.map(([, n]) => n));
  $('#channel-bars').innerHTML = ch.length ? ch.map(([c, n]) =>
    `<div class="bar-row"><span class="bar-label" style="width:110px">${esc(c)}</span>
     <span class="bar-track"><span class="bar-fill" style="width:${(n / maxC) * 100}%"></span></span><span class="bar-num">${n}</span></div>`
  ).join('') : '<p class="muted">応募データがありません。</p>';
}

// =============================================================================
// AI求人作成
// =============================================================================
function renderGenerate() {
  $('#gen-result').classList.add('hidden');
  $('#gen-status').classList.remove('hidden');
}
async function doGenerate() {
  const input = {
    title: $('#g-title').value.trim(), industry: $('#g-industry').value, employmentType: $('#g-emp').value,
    location: $('#g-location').value.trim(), salary: $('#g-salary').value.trim(), appeal: $('#g-appeal').value.trim(),
  };
  if (!input.title) return toast('職種を入力してください');
  const status = $('#gen-status'); status.classList.remove('hidden');
  status.innerHTML = '<span class="spinner"></span>求人原稿を生成しています…';
  $('#gen-result').classList.add('hidden');
  $('#btn-generate').disabled = true;
  try {
    const r = await api.post('/api/jobs/generate', input);
    $('#r-catch').value = r.catchphrase || '';
    $('#r-body').value = r.body || '';
    status.classList.add('hidden');
    $('#gen-result').classList.remove('hidden');
    toast(r.source === 'ai' ? 'AIが原稿を生成しました' : '原稿を生成しました');
    if (r.warning) toast(r.warning);
  } catch (e) { status.innerHTML = 'エラー：' + esc(e.message); }
  finally { $('#btn-generate').disabled = false; }
}
$('#btn-generate').addEventListener('click', doGenerate);
$('#btn-regen').addEventListener('click', doGenerate);
$('#btn-save-job').addEventListener('click', async () => {
  const body = {
    title: $('#g-title').value.trim(), industry: $('#g-industry').value, employmentType: $('#g-emp').value,
    location: $('#g-location').value.trim(), salary: $('#g-salary').value.trim(), appeal: $('#g-appeal').value.trim(),
    catchphrase: $('#r-catch').value, body: $('#r-body').value, status: '公開中', source: 'AI',
  };
  await api.post('/api/jobs', body);
  toast('求人を保存しました'); switchView('jobs');
});

// =============================================================================
// 求人一覧
// =============================================================================
async function renderJobs() {
  await Promise.all([loadJobs(), loadApplicants()]);
  const count = (jid) => state.applicants.filter((a) => a.jobId === jid).length;
  $('#job-list').innerHTML = state.jobs.map((j) => `
    <div class="job-card" data-id="${j.id}">
      <div class="top">
        <div>
          <div class="jt">${esc(j.title)} ${j.source === 'AI' ? '<span class="ai-tag">AI作成</span>' : ''}</div>
          ${j.catchphrase ? `<div class="catch">${esc(j.catchphrase)}</div>` : ''}
          <div class="meta">${esc(j.employmentType)}｜${esc(j.location) || '勤務地未設定'}｜${esc(j.salary) || '給与未設定'}｜応募 ${count(j.id)} 名</div>
        </div>
        <div>${jobStatusSelect(j)}</div>
      </div>
      <div class="body" id="body-${j.id}">${esc(j.body) || '本文がありません。'}</div>
      <div class="foot">
        <button class="btn ghost sm" data-toggle="${j.id}">本文を表示</button>
        <button class="btn danger sm" data-del="${j.id}">削除</button>
      </div>
    </div>`).join('') || '<p class="muted">求人がありません。「AI求人作成」から作成できます。</p>';

  $$('#job-list select[data-jstatus]').forEach((s) => s.addEventListener('change', async () => {
    await api.put('/api/jobs/' + s.dataset.jstatus, { status: s.value }); toast('ステータスを更新しました'); renderJobs();
  }));
  $$('#job-list [data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const el = $('#body-' + b.dataset.toggle); el.classList.toggle('open');
    b.textContent = el.classList.contains('open') ? '本文を隠す' : '本文を表示';
  }));
  $$('#job-list [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('この求人と関連応募者を削除しますか？')) return;
    await api.del('/api/jobs/' + b.dataset.del); toast('削除しました'); renderJobs();
  }));
}
function jobStatusSelect(j) {
  return `<select data-jstatus="${j.id}" class="badge j-${j.status}" style="border:0;font-weight:600">
    ${JOB_STATUSES.map((s) => `<option ${s === j.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}
$('#btn-add-job').addEventListener('click', () => jobForm());
function jobForm() {
  openModal('求人を手動で追加', `
    <div class="field-row"><label>職種 *</label><input id="j-title" type="text"></div>
    <div class="field-row"><label>雇用形態</label><input id="j-emp" type="text" value="正社員"></div>
    <div class="field-row"><label>勤務地</label><input id="j-loc" type="text"></div>
    <div class="field-row"><label>給与</label><input id="j-sal" type="text"></div>
    <div class="field-row"><label>キャッチコピー</label><input id="j-catch" type="text"></div>
    <div class="field-row"><label>本文</label><textarea id="j-body" style="min-height:160px"></textarea></div>
    <div class="modal-foot"><button class="btn ghost" id="m-cancel">キャンセル</button><button class="btn" id="m-save">保存</button></div>`);
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-save').addEventListener('click', async () => {
    const b = { title: $('#j-title').value.trim(), employmentType: $('#j-emp').value, location: $('#j-loc').value,
      salary: $('#j-sal').value, catchphrase: $('#j-catch').value, body: $('#j-body').value, status: '公開中', source: '手動' };
    if (!b.title) return toast('職種を入力してください');
    await api.post('/api/jobs', b); closeModal(); toast('保存しました'); renderJobs();
  });
}

// =============================================================================
// 応募者管理
// =============================================================================
async function renderApplicants() {
  await Promise.all([loadJobs(), loadApplicants()]);
  const filter = $('#apl-filter');
  const cur = filter.value;
  filter.innerHTML = '<option value="">すべての求人</option>' + state.jobs.map((j) => `<option value="${j.id}" ${j.id === cur ? 'selected' : ''}>${esc(j.title)}</option>`).join('');
  filter.onchange = renderApplicants;

  const list = state.applicants.filter((a) => !cur || a.jobId === cur);
  $('#applicant-table tbody').innerHTML = list.map((a) => `
    <tr data-id="${a.id}">
      <td><b>${esc(a.name)}</b><div style="font-size:11px;color:var(--muted)">${esc(a.email)}</div></td>
      <td>${esc(jobName(a.jobId))}</td>
      <td>${esc(a.channel) || '—'}</td>
      <td>${aplStatusSelect(a)}</td>
      <td style="font-size:12px;color:var(--muted)">${fmtDate(a.appliedAt)}</td>
      <td style="white-space:nowrap">
        <button class="icon-btn" data-reply="${a.id}" title="AIで返信文を作成">✉️</button>
        <button class="icon-btn" data-del="${a.id}" title="削除">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">応募者がいません。</td></tr>';

  $$('#applicant-table select[data-astatus]').forEach((s) => s.addEventListener('change', async () => {
    await api.put('/api/applicants/' + s.dataset.astatus, { status: s.value }); toast('ステータスを更新しました'); renderApplicants();
  }));
  $$('#applicant-table [data-reply]').forEach((b) => b.addEventListener('click', () => replyForm(b.dataset.reply)));
  $$('#applicant-table [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('この応募者を削除しますか？')) return;
    await api.del('/api/applicants/' + b.dataset.del); toast('削除しました'); renderApplicants();
  }));
}
function aplStatusSelect(a) {
  return `<select data-astatus="${a.id}" class="badge s-${a.status}" style="border:0;font-weight:600">
    ${APPLICANT_STATUSES.map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}
$('#btn-add-applicant').addEventListener('click', () => applicantForm());
function applicantForm() {
  openModal('応募者を追加', `
    <div class="field-row"><label>氏名 *</label><input id="a-name" type="text"></div>
    <div class="field-row"><label>応募求人</label><select id="a-job">${state.jobs.map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join('')}</select></div>
    <div class="field-row"><label>メールアドレス</label><input id="a-email" type="email"></div>
    <div class="field-row"><label>応募チャネル</label><input id="a-channel" type="text" placeholder="例）求人サイトA / リファラル"></div>
    <div class="modal-foot"><button class="btn ghost" id="m-cancel">キャンセル</button><button class="btn" id="m-save">保存</button></div>`);
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-save').addEventListener('click', async () => {
    const b = { name: $('#a-name').value.trim(), jobId: $('#a-job').value, email: $('#a-email').value, channel: $('#a-channel').value };
    if (!b.name) return toast('氏名を入力してください');
    await api.post('/api/applicants', b); closeModal(); toast('追加しました'); renderApplicants();
  });
}

// AI返信文面生成
function replyForm(applicantId) {
  const a = state.applicants.find((x) => x.id === applicantId);
  const kinds = state.replyKinds;
  openModal('AIで応募者対応文を作成', `
    <p class="muted">${esc(a.name)} 様（${esc(jobName(a.jobId))}）への文面を生成します。</p>
    <div class="field-row"><label>文面の種類</label><select id="rep-kind">
      ${Object.entries(kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
    <button class="btn" id="rep-gen">文面を生成</button>
    <div id="rep-out" style="margin-top:14px"></div>`);
  $('#rep-gen').addEventListener('click', async () => {
    const out = $('#rep-out'); out.innerHTML = '<span class="spinner"></span>生成中…';
    try {
      const r = await api.post('/api/replies/generate', { applicantId, kind: $('#rep-kind').value });
      out.innerHTML = `<div class="field-row"><label>件名</label><input id="rep-subj" type="text" value="${esc(r.subject)}"></div>
        <div class="field-row"><label>本文</label><textarea id="rep-body" style="min-height:200px">${esc(r.body)}</textarea></div>
        <div class="modal-foot"><button class="btn" id="rep-copy">本文をコピー</button></div>`;
      $('#rep-copy').addEventListener('click', () => { navigator.clipboard?.writeText($('#rep-body').value); toast('コピーしました'); });
      if (r.warning) toast(r.warning);
    } catch (e) { out.innerHTML = 'エラー：' + esc(e.message); }
  });
}

// =============================================================================
// 会社情報・予算
// =============================================================================
async function renderSettings() {
  state.company = await api.get('/api/company');
  const f = [
    ['name', '会社名', 'text'], ['industry', '業種', 'text'], ['address', '所在地', 'text'],
    ['website', 'WebサイトURL', 'text'], ['contactEmail', '採用問い合わせメール', 'text'],
    ['appeal', '会社のアピールポイント', 'textarea'], ['recruitBudget', '採用予算・媒体費（円）', 'number'],
  ];
  $('#company-form').innerHTML = f.map(([k, label, t]) => t === 'textarea'
    ? `<div class="field-row"><label>${label}</label><textarea id="c-${k}" style="min-height:70px">${esc(state.company[k])}</textarea></div>`
    : `<div class="field-row"><label>${label}</label><input id="c-${k}" type="${t}" value="${esc(state.company[k])}"></div>`
  ).join('') + '<div class="modal-foot"><button class="btn" id="c-save">保存</button></div>';
  $('#c-save').addEventListener('click', async () => {
    const b = {}; f.forEach(([k]) => b[k] = $('#c-' + k).value);
    await api.put('/api/company', b); toast('会社情報を保存しました');
  });
}

// 起動
(async () => {
  try {
    const meta = await api.get('/api/meta');
    state.replyKinds = meta.replyKinds || {};
    $('#ai-badge').textContent = meta.aiEnabled ? 'AI生成: 有効 (Claude)' : 'AI生成: テンプレート';
  } catch {}
  renderDashboard();
})();
