/**
 * フィールドマッピングエンジン
 * -----------------------------------------------------------------------------
 * お問い合わせフォームは企業ごとに構造（ラベル文言・name属性・項目数・選択肢）が
 * バラバラなため、「どの入力欄に何を入れるか」を毎回判断する必要がある。これが
 * フォーム自動送信の技術的な核心であり、本来 AI（LLM）が担う部分。
 *
 * 本デモではキーワードスコアリングによるルールベースで実装しているが、
 * 関数の入出力（detectFields の結果 → 各欄への割り当て）はそのままに、
 * classifyField() を LLM 呼び出しに差し替えれば本番用の高精度版に移行できる。
 * （末尾の classifyFieldWithLLM のひな型を参照）
 */

// 意味カテゴリごとの手がかりキーワード（ラベル/placeholder/name/id を対象に照合）
const RULES = [
  { key: 'company',        kw: ['会社名','法人名','御社名','貴社名','企業名','団体名','組織名','company','corp','organization','org'] },
  { key: 'dept',           kw: ['部署','部門','所属','department','dept','division'] },
  { key: 'lastName',       kw: ['姓','苗字','名字','せい','lastname','last name','family','sei'] },
  { key: 'firstName',      kw: ['名','めい','firstname','first name','given','mei'] },
  { key: 'fullName',       kw: ['お名前','氏名','ご担当者','担当者名','name','your name','fullname'] },
  { key: 'kana',           kw: ['フリガナ','ふりがな','カナ','かな','kana','furigana'] },
  { key: 'emailConfirm',   kw: ['メール確認','メールアドレス確認','確認用','再入力','confirm','retype','again','確認のため'] },
  { key: 'email',          kw: ['メール','メールアドレス','email','e-mail','mail','mailaddr'] },
  { key: 'tel',            kw: ['電話','tel','phone','携帯','fax'] },
  { key: 'zip',            kw: ['郵便番号','〒','zip','postal'] },
  { key: 'address',        kw: ['住所','所在地','address'] },
  { key: 'url',            kw: ['url','ホームページ','website','サイト','web'] },
  { key: 'subject',        kw: ['件名','題名','タイトル','subject','title'] },
  { key: 'category',       kw: ['ご用件','用件','種別','区分','カテゴリ','category','type','お問い合わせ種別'] },
  { key: 'message',        kw: ['お問い合わせ内容','内容','本文','詳細','ご相談','メッセージ','message','body','content','comment','inquiry'] },
  { key: 'privacy',        kw: ['同意','個人情報','プライバシー','privacy','agree','agreement','承諾','規約'] },
];

function normalize(s) {
  return (s || '').toString().toLowerCase().replace(/\s+/g, '').trim();
}

// 照合元ごとの重み。表示ラベルが最も信頼でき、name/id 属性は誤一致しやすいので低め。
// （例: name="lname" は英語キーワード "name" を部分一致で拾ってしまうため）
const SOURCES = [
  { get: f => f.label, w: 5 },
  { get: f => f.placeholder, w: 2 },
  { get: f => f.name, w: 1 },
  { get: f => f.id, w: 1 },
];

const CONFIRM_KW = ['確認', 'confirm', '再入力', 'retype', 'again', '確認のため'];

/**
 * 単一フィールドの意味カテゴリを推定する。
 * field: { tag, type, name, id, placeholder, label, options }
 * 戻り値: { key, score }
 *
 * スコア = Σ(照合元の重み × ヒットしたキーワード長)。
 * 具体的で長い手がかり（例「お問い合わせ内容」）ほど、汎用語（例「name」）に勝つ。
 */
function classifyField(field) {
  let best = { key: 'unknown', score: 0 };
  for (const rule of RULES) {
    let score = 0;
    for (const src of SOURCES) {
      const hay = normalize(src.get(field));
      if (!hay) continue;
      for (const kw of rule.kw) {
        const k = normalize(kw);
        if (k && hay.includes(k)) score += src.w * k.length;
      }
    }
    // input type による補強
    if (rule.key === 'email' && field.type === 'email') score += 6;
    if (rule.key === 'tel' && field.type === 'tel') score += 6;
    if (rule.key === 'privacy' && field.type === 'checkbox') score += 6;
    if (rule.key === 'message' && field.tag === 'textarea') score += 6;
    if (score > best.score) best = { key: rule.key, score };
  }
  // 「確認用メール」はメールより具体的な意図なので上書き
  if (best.key === 'email') {
    const all = normalize([field.label, field.placeholder, field.name, field.id].join(' '));
    if (CONFIRM_KW.some(k => all.includes(normalize(k)))) best.key = 'emailConfirm';
  }
  return best;
}

/** select の選択肢から、送信意図に最も合うものを選ぶ */
function chooseOption(options, profile) {
  const wanted = profile.preferredCategory || ['お見積り','見積','相談','partner','協業','製品','サービス','その他','other'];
  const list = Array.isArray(wanted) ? wanted : [wanted];
  // 値が空（プレースホルダ）でない選択肢が対象
  const candidates = options.filter(o => normalize(o.value) || normalize(o.label));
  for (const w of list) {
    const wn = normalize(w);
    const hit = candidates.find(o => normalize(o.label).includes(wn) || normalize(o.value).includes(wn));
    if (hit) return hit.value || hit.label;
  }
  // 見つからなければ「その他」、それも無ければ最初の有効な選択肢
  const other = candidates.find(o => /その他|other/.test(normalize(o.label)));
  return other ? (other.value || other.label) : (candidates[0] && (candidates[0].value || candidates[0].label));
}

/**
 * 検出した全フィールドに対して、入力すべき値（アクション）を組み立てる。
 * profile: 送信者プロフィール＋メッセージ
 * 戻り値: フィールドごとに { selector, kind, value, meaning } を付与した配列
 */
function buildFillPlan(fields, profile) {
  const plan = [];
  let emailFilledOnce = false;

  for (const f of fields) {
    const { key } = classifyField(f);
    let value = null, kind = 'fill', meaning = key;

    switch (key) {
      case 'company':      value = profile.company; break;
      case 'dept':         value = profile.dept; break;
      case 'fullName':     value = profile.fullName; break;
      case 'lastName':     value = profile.lastName; break;
      case 'firstName':    value = profile.firstName; break;
      case 'kana':         value = profile.kana; break;
      case 'email':        value = profile.email; emailFilledOnce = true; break;
      case 'emailConfirm': value = profile.email; meaning = 'email(確認用)'; break;
      case 'tel':          value = profile.tel; break;
      case 'zip':          value = profile.zip; break;
      case 'address':      value = profile.address; break;
      case 'url':          value = profile.url; break;
      case 'subject':      value = profile.subject; break;
      case 'message':      value = profile.message; break;
      case 'category':
        kind = 'select';
        value = chooseOption(f.options || [], profile);
        break;
      case 'privacy':
        kind = 'check'; value = true; break;
      default:
        // 未分類の必須項目はスキップ（本番では LLM で再判定）
        continue;
    }
    if (value === null || value === undefined || value === '') continue;
    plan.push({ selector: f.selector, kind, value, meaning, label: f.label || f.name });
  }
  return plan;
}

/**
 * 本番用ひな型：classifyField を LLM に置き換える場合の入出力イメージ。
 * detectFields() の結果（ラベル等のテキスト情報のみ。個人情報は含めない）を
 * LLM に渡し、各フィールドの意味カテゴリを JSON で受け取る。
 *
 * async function classifyFieldWithLLM(fields) {
 *   const res = await anthropic.messages.create({
 *     model: 'claude-opus-4-8',
 *     max_tokens: 1024,
 *     system: 'あなたは日本語のお問い合わせフォームを解析し、各入力欄の意味を分類するアシスタントです。',
 *     messages: [{ role: 'user', content: JSON.stringify(fields) }],
 *   });
 *   return JSON.parse(res.content[0].text); // [{ index, key }]
 * }
 */

module.exports = { classifyField, buildFillPlan, chooseOption, RULES };
