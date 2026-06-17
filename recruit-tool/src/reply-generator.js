/**
 * 応募者対応文面ジェネレーター
 * -----------------------------------------------------------------------------
 * 応募受付お礼・面接案内・内定通知・お見送り の文面を生成する。
 * ANTHROPIC_API_KEY があれば Claude（claude-opus-4-8）、無ければテンプレート。
 */
const MODEL = 'claude-opus-4-8';

const KINDS = {
  thanks: '応募受付のお礼',
  interview: '面接のご案内',
  offer: '内定のご連絡',
  reject: 'お見送りのご連絡',
};

/** テンプレート生成（フォールバック） */
function generateByTemplate({ kind, applicantName, jobTitle, company }) {
  const name = applicantName || 'ご応募者';
  const job = jobTitle || '募集職種';
  const co = company || '当社';
  const sign = `\n\n――――――――――\n${co} 採用担当`;
  switch (kind) {
    case 'thanks':
      return { subject: `【${co}】ご応募ありがとうございます`,
        body: `${name} 様\n\nこの度は「${job}」へご応募いただき、誠にありがとうございます。\n選考結果につきましては、数日以内に改めてご連絡いたします。今しばらくお待ちくださいませ。${sign}`,
        source: 'template' };
    case 'interview':
      return { subject: `【${co}】面接日程のご案内`,
        body: `${name} 様\n\nこの度は「${job}」へご応募いただきありがとうございます。\n書類選考の結果、ぜひ一度面接の機会をいただきたくご連絡いたしました。\nご都合のよい日時を２〜３候補お知らせいただけますでしょうか。${sign}`,
        source: 'template' };
    case 'offer':
      return { subject: `【${co}】内定のご連絡`,
        body: `${name} 様\n\n先日は面接にお越しいただきありがとうございました。\n選考の結果、ぜひ「${job}」として一緒に働いていただきたく、内定のご連絡を差し上げます。\n今後の手続きについて改めてご案内いたします。${sign}`,
        source: 'template' };
    case 'reject':
      return { subject: `【${co}】選考結果のご連絡`,
        body: `${name} 様\n\nこの度は「${job}」へご応募いただき、誠にありがとうございました。\n慎重に選考を進めました結果、誠に残念ながら今回はご期待に沿いかねる結果となりました。\n${name}様の今後益々のご活躍を心よりお祈り申し上げます。${sign}`,
        source: 'template' };
    default:
      return { subject: '', body: '', source: 'template' };
  }
}

async function generateByClaude({ kind, applicantName, jobTitle, company }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const system =
    'あなたは日本企業の採用担当者です。応募者に送る、丁寧で温かみのあるビジネスメール文面を作成します。' +
    '過度にへりくだらず、簡潔で読みやすい敬語で書いてください。出力は指定のJSON形式のみ。';
  const user =
    `次の条件で応募者へのメール文面を作成してください。\n種別: ${KINDS[kind] || kind}\n` +
    `応募者名: ${applicantName || ''}\n応募職種: ${jobTitle || ''}\n会社名: ${company || ''}\n\n` +
    `JSON形式で返してください: {"subject": "件名", "body": "本文（署名含む）"}`;
  const res = await client.messages.create({
    model: MODEL, max_tokens: 1200, system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content.find((b) => b.type === 'text')?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('生成結果の解析に失敗しました');
  const parsed = JSON.parse(match[0]);
  return { subject: parsed.subject || '', body: parsed.body || '', source: 'ai' };
}

async function generateReply(input) {
  if (!KINDS[input.kind]) throw new Error('不明な文面種別です');
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await generateByClaude(input); }
    catch (e) { return { ...generateByTemplate(input), warning: 'AI生成に失敗したためテンプレートで作成しました：' + e.message }; }
  }
  return generateByTemplate(input);
}

module.exports = { generateReply, KINDS, MODEL };
