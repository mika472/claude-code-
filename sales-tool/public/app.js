// 営業支援ツール フロントエンド
'use strict';

const api = {
  async get(p) { return (await fetch(p)).json(); },
  async send(p, method, body) {
    const r = await fetch(p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
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
const STATUSES = ['未送信', '送信済', '送信失敗', '接続', 'アポ獲得', '見送り'];

let state = { companies: [], templates: [], profile: {} };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function fmtDate(s) { return s ? new Date(s).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }

// ---- ナビ ----
$$('.sidebar nav a').forEach((a) => a.addEventListener('click', () => switchView(a.dataset.view)));
function switchView(view) {
  $$('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  ({ dashboard: renderDashboard, companies: renderCompanies, send: renderSend, templates: renderTemplates, history: renderHistory, settings: renderSettings }[view] || (() => {}))();
}

// ---- モーダル ----
function openModal(title, bodyHtml) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

// =============================================================================
// ダッシュボード
// =============================================================================
async function renderDashboard() {
  const d = await api.get('/api/dashboard');
  const connOk = d.connectRate >= d.targets.connectRate;
  const apoOk = d.appointmentRate >= d.targets.appointmentRate;
  $('#kpi-cards').innerHTML = `
    <div class="card"><div class="label">登録企業数</div><div class="value">${d.totalCompanies}</div><div class="sub muted">うち送信済 ${d.sentCount} 社</div></div>
    <div class="card"><div class="label">送信回数 / 成功</div><div class="value">${d.sendsTotal}<span style="font-size:18px;color:var(--muted)"> / ${d.sendsSuccess}</span></div><div class="sub muted">到達率 ${pct(d.deliveryRate)}</div></div>
    <div class="card kpi"><div class="label">担当者接続率</div><div class="value ${connOk ? 'ok' : 'ng'}">${pct(d.connectRate)}</div><div class="target">目標 15%以上（${d.connected}/${d.sentCount}）</div></div>
    <div class="card kpi"><div class="label">アポイント率</div><div class="value ${apoOk ? 'ok' : 'ng'}">${pct(d.appointmentRate)}</div><div class="target">目標 1%以上（${d.appointments}/${d.sentCount}）</div></div>`;

  const max = Math.max(1, ...Object.values(d.byStatus));
  $('#status-bars').innerHTML = STATUSES.map((s) => {
    const n = d.byStatus[s] || 0;
    return `<div class="bar-row"><span class="bar-label"><span class="badge s-${s}">${s}</span></span>
      <span class="bar-track"><span class="bar-fill" style="width:${(n / max) * 100}%"></span></span>
      <span class="bar-num">${n}</span></div>`;
  }).join('');
}

// =============================================================================
// 企業リスト
// =============================================================================
async function loadCompanies() { state.companies = await api.get('/api/companies'); }
async function renderCompanies() {
  await loadCompanies();
  const tb = $('#company-table tbody');
  tb.innerHTML = state.companies.map((c) => `
    <tr data-id="${c.id}">
      <td></td>
      <td><b>${esc(c.name)}</b></td>
      <td>${esc(c.industry)}</td>
      <td>${esc(c.contactPerson)}</td>
      <td class="url-cell" title="${esc(c.formUrl)}">${esc(c.formUrl)}</td>
      <td>${statusSelect(c)}</td>
      <td style="font-size:12px;color:var(--muted)">${fmtDate(c.lastSentAt)}</td>
      <td style="white-space:nowrap">
        <button class="icon-btn" data-edit="${c.id}" title="編集">✏️</button>
        <button class="icon-btn" data-del="${c.id}" title="削除">🗑️</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">企業がありません。「＋ 企業を追加」から登録してください。</td></tr>`;

  tb.querySelectorAll('select[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
    await api.put('/api/companies/' + sel.dataset.status, { status: sel.value });
    toast('ステータスを更新しました'); renderCompanies();
  }));
  tb.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => companyForm(state.companies.find((c) => c.id === b.dataset.edit))));
  tb.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('この企業を削除しますか？')) return;
    await api.del('/api/companies/' + b.dataset.del); toast('削除しました'); renderCompanies();
  }));
}
function statusSelect(c) {
  return `<select data-status="${c.id}" class="badge s-${c.status}" style="border:0;font-weight:600">
    ${STATUSES.map((s) => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}

function companyForm(c = {}) {
  const isEdit = !!c.id;
  openModal(isEdit ? '企業を編集' : '企業を追加', `
    <div class="field-row"><label>会社名 *</label><input id="f-name" type="text" value="${esc(c.name)}"></div>
    <div class="field-row"><label>業種</label><input id="f-industry" type="text" value="${esc(c.industry)}"></div>
    <div class="field-row"><label>担当者名</label><input id="f-contact" type="text" value="${esc(c.contactPerson)}"></div>
    <div class="field-row"><label>電話番号</label><input id="f-tel" type="text" value="${esc(c.tel)}"></div>
    <div class="field-row"><label>お問い合わせフォームURL</label><input id="f-url" type="text" value="${esc(c.formUrl)}" placeholder="https://example.com/contact"></div>
    <div class="field-row"><label>メモ</label><textarea id="f-note" style="min-height:70px">${esc(c.note)}</textarea></div>
    <div class="modal-foot"><button class="btn ghost" id="m-cancel">キャンセル</button><button class="btn" id="m-save">保存</button></div>`);
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-save').addEventListener('click', async () => {
    const body = { name: $('#f-name').value.trim(), industry: $('#f-industry').value.trim(), contactPerson: $('#f-contact').value.trim(), tel: $('#f-tel').value.trim(), formUrl: $('#f-url').value.trim(), note: $('#f-note').value };
    if (!body.name) return toast('会社名を入力してください');
    if (isEdit) await api.put('/api/companies/' + c.id, body); else await api.post('/api/companies', body);
    closeModal(); toast('保存しました'); renderCompanies();
  });
}

$('#btn-add-company').addEventListener('click', () => companyForm());
$('#btn-import').addEventListener('click', () => {
  openModal('企業の一括インポート', `
    <p class="muted">1行につき1社。<code>会社名,業種,フォームURL,担当者,電話</code> の順（カンマ または タブ区切り）。</p>
    <textarea id="imp-text" style="min-height:180px" placeholder="株式会社ABC,IT,https://abc.co.jp/contact,山田,03-1111-2222"></textarea>
    <div class="modal-foot"><button class="btn ghost" id="m-cancel">キャンセル</button><button class="btn" id="m-imp">インポート</button></div>`);
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-imp').addEventListener('click', async () => {
    const r = await api.post('/api/companies/import', { text: $('#imp-text').value });
    closeModal(); toast(`${r.added} 社をインポートしました`); renderCompanies();
  });
});

// =============================================================================
// テンプレート
// =============================================================================
async function loadTemplates() { state.templates = await api.get('/api/templates'); }
async function renderTemplates() {
  await loadTemplates();
  $('#template-list').innerHTML = state.templates.map((t) => `
    <div class="tpl-card">
      <div class="tpl-name">${esc(t.name)}</div>
      <div class="tpl-subj">件名：${esc(t.subject) || '（なし）'}</div>
      <div class="tpl-body">${esc(t.message)}</div>
      <div class="tpl-foot">
        <button class="btn ghost sm" data-edit="${t.id}">編集</button>
        <button class="btn danger sm" data-del="${t.id}">削除</button>
      </div>
    </div>`).join('') || '<p class="muted">テンプレートがありません。</p>';
  $$('#template-list [data-edit]').forEach((b) => b.addEventListener('click', () => templateForm(state.templates.find((t) => t.id === b.dataset.edit))));
  $$('#template-list [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('このテンプレートを削除しますか？')) return;
    await api.del('/api/templates/' + b.dataset.del); toast('削除しました'); renderTemplates();
  }));
}
function templateForm(t = {}) {
  const isEdit = !!t.id;
  openModal(isEdit ? 'テンプレートを編集' : '新規テンプレート', `
    <div class="field-row"><label>テンプレート名 *</label><input id="t-name" type="text" value="${esc(t.name)}"></div>
    <div class="field-row"><label>件名</label><input id="t-subject" type="text" value="${esc(t.subject)}"></div>
    <div class="field-row"><label>本文</label><textarea id="t-message" style="min-height:160px">${esc(t.message)}</textarea></div>
    <div class="field-row"><label>用件選択の優先キーワード（カンマ区切り）</label><input id="t-cat" type="text" value="${esc((t.preferredCategory || []).join(', '))}" placeholder="協業, 製品, その他"></div>
    <div class="modal-foot"><button class="btn ghost" id="m-cancel">キャンセル</button><button class="btn" id="m-save">保存</button></div>`);
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-save').addEventListener('click', async () => {
    const body = { name: $('#t-name').value.trim(), subject: $('#t-subject').value, message: $('#t-message').value, preferredCategory: $('#t-cat').value.split(',').map((s) => s.trim()).filter(Boolean) };
    if (!body.name) return toast('テンプレート名を入力してください');
    if (isEdit) await api.put('/api/templates/' + t.id, body); else await api.post('/api/templates', body);
    closeModal(); toast('保存しました'); renderTemplates();
  });
}
$('#btn-add-template').addEventListener('click', () => templateForm());

// =============================================================================
// フォーム送信
// =============================================================================
async function renderSend() {
  await Promise.all([loadCompanies(), loadTemplates()]);
  $('#send-template').innerHTML = state.templates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  $('#send-company-list').innerHTML = state.companies.map((c) => `
    <label><input type="checkbox" value="${c.id}" ${c.status === '未送信' ? 'checked' : ''}>
      <span><b>${esc(c.name)}</b> <span class="badge s-${c.status}">${c.status}</span>
      <span class="muted" style="font-size:12px"> ${esc(c.formUrl) || 'URL未設定'}</span></span></label>`).join('') || '<p class="muted">企業がありません。</p>';
  $('#send-results').innerHTML = '';
  $('#send-progress').classList.add('hidden');
}
$('#btn-run-send').addEventListener('click', async () => {
  const ids = $$('#send-company-list input:checked').map((i) => i.value);
  const templateId = $('#send-template').value;
  const dryRun = $('#send-dryrun').checked;
  if (!ids.length) return toast('送信先を選択してください');
  if (!templateId) return toast('テンプレートを選択してください');
  const btn = $('#btn-run-send'); btn.disabled = true;
  const prog = $('#send-progress'); prog.classList.remove('hidden');
  prog.textContent = `送信中… ${ids.length} 社のフォームを解析・入力しています（数十秒かかる場合があります）`;
  $('#send-results').innerHTML = '';
  try {
    const { results } = await api.post('/api/send', { companyIds: ids, templateId, dryRun });
    prog.classList.add('hidden');
    const ok = results.filter((r) => r.ok).length;
    toast(`${ok}/${results.length} 社へ送信完了`);
    $('#send-results').innerHTML = '<h2 style="margin-top:18px">送信結果</h2>' + results.map((r) => `
      <div class="res-item">
        ${r.screenshot ? `<img class="shot" src="/screenshots/${r.screenshot}" data-full="/screenshots/${r.screenshot}">` : ''}
        <div class="hist-main">
          <div class="t"><span class="dot ${r.ok ? 'ok' : 'ng'}"></span>${esc(r.name)}</div>
          <div class="d">${r.ok ? `検出 ${r.detectedCount} 項目 / 自動入力 ${r.filledCount} 項目${dryRun ? '（ドライラン）' : ' → 送信完了'}` : 'エラー：' + esc(r.error)}</div>
        </div>
      </div>`).join('');
    bindShots();
  } catch (e) {
    prog.classList.add('hidden'); toast('送信に失敗しました：' + e.message);
  } finally { btn.disabled = false; }
});

// =============================================================================
// 履歴
// =============================================================================
async function renderHistory() {
  const sends = await api.get('/api/sends');
  $('#history-list').innerHTML = sends.map((s) => `
    <div class="hist-item">
      ${s.screenshot ? `<img class="shot" src="/screenshots/${s.screenshot}" data-full="/screenshots/${s.screenshot}">` : '<div class="shot" style="display:grid;place-items:center;color:#bbb">no img</div>'}
      <div class="hist-main">
        <div class="t"><span class="dot ${s.status === 'success' ? 'ok' : 'ng'}"></span>${esc(s.companyName)}</div>
        <div class="d">${esc(s.templateName)}｜検出 ${s.detectedCount} / 入力 ${s.filledCount}${s.dryRun ? '（ドライラン）' : ''}</div>
        <div class="d">${fmtDate(s.createdAt)}${s.error ? '｜<span style="color:var(--red)">' + esc(s.error) + '</span>' : ''}</div>
      </div>
    </div>`).join('') || '<p class="muted">送信履歴はまだありません。</p>';
  bindShots();
}
function bindShots() {
  $$('.shot[data-full]').forEach((img) => img.addEventListener('click', () => {
    openModal('送信フォームのキャプチャ', `<div class="img-modal"><img src="${img.dataset.full}"></div>`);
  }));
}

// =============================================================================
// 送信者設定
// =============================================================================
async function renderSettings() {
  state.profile = await api.get('/api/profile');
  const f = [
    ['company', '会社名'], ['dept', '部署名'], ['fullName', '氏名'], ['lastName', '姓'], ['firstName', '名'],
    ['kana', 'フリガナ'], ['email', 'メールアドレス'], ['tel', '電話番号'], ['zip', '郵便番号'], ['address', '住所'], ['url', 'WebサイトURL'],
  ];
  $('#profile-form').innerHTML = f.map(([k, label]) =>
    `<div class="field-row"><label>${label}</label><input id="p-${k}" type="text" value="${esc(state.profile[k])}"></div>`
  ).join('') + '<div class="modal-foot"><button class="btn" id="p-save">保存</button></div>';
  $('#p-save').addEventListener('click', async () => {
    const body = {}; f.forEach(([k]) => body[k] = $('#p-' + k).value);
    await api.put('/api/profile', body); toast('送信者情報を保存しました');
  });
}

// 起動
renderDashboard();
