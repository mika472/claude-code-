/**
 * 簡易JSONデータストア（採用支援ツール）
 * -----------------------------------------------------------------------------
 * 営業支援ツールと同じく data/db.json に永続化する。本番ではDBへ置き換え可能。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(seed(), null, 2));
}
function read() { ensure(); return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function write(db) { ensure(); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); return db; }
function id(p) { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function seed() {
  const now = new Date().toISOString();
  const jobHoiku = {
    id: 'job_hoiku',
    title: '保育士（正社員）',
    industry: '保育',
    employmentType: '正社員',
    location: '東京都世田谷区',
    salary: '月給23万〜30万円',
    appeal: '残業ほぼなし・持ち帰り仕事なし、複数担任制で手厚いサポート',
    catchphrase: '「子どもの“できた！”に寄り添う。あなたらしく働ける園です」',
    body:
      '【仕事内容】\n0〜5歳児の保育業務全般をお任せします。複数担任制のため、はじめての方も先輩がしっかりサポートします。\n\n' +
      '【応募資格】\n保育士資格をお持ちの方（ブランク可・新卒歓迎）\n\n' +
      '【給与・待遇】\n月給23万〜30万円／賞与年2回／各種社会保険完備／処遇改善手当\n\n' +
      '【勤務地・時間】\n東京都世田谷区（最寄駅より徒歩7分）／シフト制（7:00〜19:00の間で実働8h）\n\n' +
      '【ここがポイント】\n・残業ほぼなし、持ち帰り仕事なし\n・複数担任制で手厚いサポート\n・有給取得率90%以上',
    status: '公開中',
    source: 'AI',
    createdAt: now,
  };
  const jobIt = {
    id: 'job_it',
    title: 'Webエンジニア（フロントエンド）',
    industry: 'IT',
    employmentType: '正社員',
    location: 'フルリモート可',
    salary: '年収450万〜750万円',
    appeal: 'フルリモート・フレックス、モダンな技術スタック',
    catchphrase: '「裁量とリモートで、つくりたいものに集中できる環境」',
    body:
      '【仕事内容】\n自社プロダクトのフロントエンド開発（React/TypeScript）を担当いただきます。\n\n' +
      '【応募資格】\nReact等を用いた実務開発経験2年以上\n\n' +
      '【給与・待遇】\n年収450万〜750万円／フルフレックス／書籍購入補助\n\n' +
      '【勤務地・時間】\nフルリモート可／コアタイムなしのフレックス\n\n' +
      '【ここがポイント】\n・モダンな技術スタック\n・少人数で裁量が大きい',
    status: '公開中',
    source: 'AI',
    createdAt: now,
  };
  const a = (jobId, name, channel, status) => ({
    id: id('apl'), jobId, name, email: `${name}@example.com`, tel: '', channel,
    status, note: '', appliedAt: now,
  });
  return {
    company: {
      name: '株式会社ミレイグロース',
      industry: '人材・採用支援',
      address: '東京都千代田区千代田1-1',
      website: 'https://mileegrowth.example.com',
      appeal: '少数精鋭・風通しのよい社風。成長中の組織で裁量大。',
      contactEmail: 'saiyo@mileegrowth.example.com',
      recruitBudget: 600000,
    },
    jobs: [jobHoiku, jobIt],
    applicants: [
      a('job_hoiku', '佐藤 花子', '求人サイトA', '一次面接'),
      a('job_hoiku', '鈴木 みき', '自社サイト', '内定'),
      a('job_hoiku', '田中 さくら', '求人サイトA', '応募'),
      a('job_it', '高橋 大輔', 'リファラル', '最終面接'),
      a('job_it', '伊藤 健', '求人サイトB', '入社'),
      a('job_it', '渡辺 颯', '求人サイトB', '見送り'),
    ],
  };
}

module.exports = { read, write, id, DB_PATH, DATA_DIR };
