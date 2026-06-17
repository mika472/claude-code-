/**
 * 求人原稿ジェネレーター
 * -----------------------------------------------------------------------------
 * ANTHROPIC_API_KEY が設定されていれば Claude（claude-opus-4-8）で生成し、
 * 無い場合はルールベースのテンプレート生成にフォールバックする。
 * これにより本番ではAI品質、デモ/オフラインでも確実に動作する。
 *
 * 打ち合わせ方針に沿い、表向きは「求人広告の作成支援」。生成エンジン部分が
 * AI（LLM）であることを前面に出さずに使える構成。
 */

const MODEL = 'claude-opus-4-8';

/** 業種ごとの訴求フレーズ（テンプレート生成用） */
const INDUSTRY_HINTS = {
  保育: ['子ども一人ひとりに向き合える環境', '残業・持ち帰りの少なさ', '複数担任制によるサポート体制'],
  介護: ['利用者に寄り添うケア', '資格取得支援制度', 'チームで支え合う職場'],
  IT: ['モダンな技術スタック', 'リモート・フレックスなど柔軟な働き方', '裁量の大きさ'],
  営業: ['正当に評価されるインセンティブ', '提案力が身につく環境', '幅広い顧客との接点'],
  飲食: ['未経験から学べる研修', '将来の独立・キャリアパス', '活気あるチーム'],
  製造: ['安定した就業環境', '手に職がつく技術習得', '安全への配慮'],
  事務: ['働きやすい就業時間', '土日祝休み', 'バックオフィスを支えるやりがい'],
  その他: ['風通しのよい社風', '成長できる環境', 'ワークライフバランス'],
};

function pickHints(industry) {
  return INDUSTRY_HINTS[industry] || INDUSTRY_HINTS['その他'];
}

/** テンプレートによる求人原稿生成（フォールバック・確実に動作） */
function generateByTemplate(input) {
  const { title, industry, employmentType, location, salary, appeal, company } = input;
  const hints = pickHints(industry);
  const appealList = (appeal ? appeal.split(/[、,\n]/).map((s) => s.trim()).filter(Boolean) : []);
  const points = (appealList.length ? appealList : hints).slice(0, 4);

  const catchphrase = `「${points[0] || 'あなたらしく働ける'}」${company ? company + 'で、' : ''}次のステージへ。`;
  const body =
    `【仕事内容】\n${company || '当社'}にて${title}として活躍いただきます。${title}の実務を、チームでサポートしながらお任せします。\n\n` +
    `【応募資格】\n${employmentType === 'アルバイト・パート' ? '未経験・ブランクのある方も歓迎します。' : '関連する実務経験のある方を歓迎します（未経験応相談）。'}\n\n` +
    `【給与・待遇】\n${salary || '経験・能力を考慮し決定'}／各種社会保険完備／昇給・賞与あり\n\n` +
    `【勤務地・勤務時間】\n${location || '応相談'}／${employmentType || '正社員'}\n\n` +
    `【ここがポイント】\n${points.map((p) => `・${p}`).join('\n')}`;

  return { catchphrase, body, source: 'template' };
}

/** Claude（claude-opus-4-8）による求人原稿生成 */
async function generateByClaude(input) {
  // SDK は API キーがある場合のみ読み込む（未設定環境での依存解決失敗を避ける）
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic(); // ANTHROPIC_API_KEY を環境から解決

  const system =
    'あなたは日本語の採用広告を作成するプロのコピーライターです。求職者に魅力が伝わり、' +
    '誇張や不適切な表現のない、具体的で信頼できる求人原稿を作成します。' +
    '出力は必ず指定のJSON形式のみで返してください。';

  const user =
    `以下の条件で求人原稿を作成してください。\n` +
    `会社名: ${input.company || ''}\n業種: ${input.industry || ''}\n職種: ${input.title || ''}\n` +
    `雇用形態: ${input.employmentType || ''}\n勤務地: ${input.location || ''}\n給与: ${input.salary || ''}\n` +
    `アピールしたい点: ${input.appeal || ''}\n\n` +
    `次のJSON形式で返してください: {"catchphrase": "20〜40字の魅力的なキャッチコピー", ` +
    `"body": "【仕事内容】【応募資格】【給与・待遇】【勤務地・勤務時間】【ここがポイント】の見出しで構成した本文"}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = res.content.find((b) => b.type === 'text')?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('生成結果の解析に失敗しました');
  const parsed = JSON.parse(match[0]);
  return { catchphrase: parsed.catchphrase || '', body: parsed.body || '', source: 'ai' };
}

/**
 * 求人原稿を生成する。APIキーがあればClaude、無ければテンプレート。
 * 失敗時も必ずテンプレートで結果を返す（採用担当の作業を止めない）。
 */
async function generateJobPosting(input) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateByClaude(input);
    } catch (e) {
      const fb = generateByTemplate(input);
      return { ...fb, source: 'template', warning: 'AI生成に失敗したためテンプレートで作成しました：' + e.message };
    }
  }
  return generateByTemplate(input);
}

module.exports = { generateJobPosting, MODEL };
