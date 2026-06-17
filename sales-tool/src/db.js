/**
 * 簡易JSONデータストア
 * -----------------------------------------------------------------------------
 * 本ツールはデモ／PoC用途のため、外部DBを使わず data/db.json に永続化する。
 * 本番では PostgreSQL / Supabase 等に置き換えやすいよう、アクセスは
 * read()/write() と各コレクション操作に集約している。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(seed(), null, 2));
  }
}

function read() {
  ensure();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function write(db) {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  return db;
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 初期データ（送信者プロフィール・サンプル文面・デモ企業） */
function seed() {
  const now = new Date().toISOString();
  return {
    profile: {
      company: '株式会社ミレイグロース',
      dept: '営業推進部',
      fullName: '三毛 美香',
      lastName: '三毛',
      firstName: '美香',
      kana: 'ミケ ミカ',
      email: 'mika@mileegrowth.com',
      tel: '03-1234-5678',
      zip: '100-0001',
      address: '東京都千代田区千代田1-1',
      url: 'https://mileegrowth.example.com',
    },
    templates: [
      {
        id: 'tpl_default',
        name: '初回アプローチ（生産性向上）',
        subject: '営業活動の生産性向上についてのご提案',
        preferredCategory: ['協業', 'partner', '製品', '見積', 'その他'],
        message:
          '突然のご連絡失礼いたします。{{company}}の{{fullName}}と申します。\n' +
          '{{target}}様の営業活動の生産性向上・コスト削減につながるご提案がございまして、ご連絡いたしました。\n' +
          '5分ほどお電話にてご説明のお時間を頂戴できれば幸いです。ご検討のほどよろしくお願いいたします。',
        createdAt: now,
      },
      {
        id: 'tpl_recruit',
        name: '採用効率化のご提案',
        subject: '採用コスト削減・求人作成の効率化について',
        preferredCategory: ['採用', 'recruit', 'その他', 'other'],
        message:
          'お世話になります。{{company}}の{{fullName}}と申します。\n' +
          '求人原稿の作成や応募者対応を効率化し、採用コストを抑える仕組みについてご案内しております。\n' +
          '貴社の採用業務のご状況に合わせてご説明できればと思います。ぜひ一度お時間をいただけますと幸いです。',
        createdAt: now,
      },
    ],
    companies: [
      mkCompany('株式会社サンプル商事', '卸売', '/targets/company-a', '営業企画部', now),
      mkCompany('GreenField株式会社', '製造', '/targets/company-b', '総務部', now),
      mkCompany('みらい保育サービス株式会社', '保育', '/targets/company-c', '採用担当', now),
    ],
    sends: [],
  };
}

function mkCompany(name, industry, formUrl, contactPerson, now) {
  return {
    id: id('cmp'),
    name,
    industry,
    formUrl,
    contactPerson,
    tel: '',
    note: '',
    status: '未送信',
    lastSentAt: null,
    createdAt: now,
  };
}

module.exports = { read, write, id, DB_PATH, DATA_DIR };
