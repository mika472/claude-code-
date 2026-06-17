/**
 * 疑似企業サイト（デモ用）
 * 実在企業に送信せずに自動フォーム送信を検証するためのローカルなお問い合わせフォーム。
 * わざと構造の異なる 2 社分のフォームを用意し、汎用的なフィールド解析を実演する。
 */
const express = require('express');

function createServer() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  // ---- 共通スタイル ----
  const style = `
    <style>
      * { box-sizing: border-box; }
      body { font-family: "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;
             margin:0; background:#f4f6f9; color:#1f2933; }
      header { background:#0b5cab; color:#fff; padding:22px 40px; }
      header .logo { font-size:22px; font-weight:700; letter-spacing:1px; }
      header .tag { font-size:13px; opacity:.85; margin-top:4px; }
      .wrap { max-width:720px; margin:32px auto; background:#fff; padding:36px 44px;
              border-radius:10px; box-shadow:0 4px 18px rgba(0,0,0,.06); }
      h1 { font-size:22px; border-left:5px solid #0b5cab; padding-left:12px; margin-top:0; }
      .lead { color:#52606d; font-size:14px; line-height:1.8; }
      .field { margin:18px 0; }
      label { display:block; font-weight:600; font-size:14px; margin-bottom:6px; }
      .req { color:#d64545; font-size:12px; margin-left:6px; }
      input[type=text], input[type=email], input[type=tel], textarea, select {
        width:100%; padding:11px 13px; border:1px solid #cbd2d9; border-radius:6px;
        font-size:15px; background:#fff; }
      textarea { min-height:130px; resize:vertical; }
      .row { display:flex; gap:14px; }
      .row > div { flex:1; }
      .agree { display:flex; align-items:center; gap:8px; font-size:14px; margin:22px 0; }
      .agree input { width:18px; height:18px; }
      button { background:#0b5cab; color:#fff; border:0; padding:14px 34px; font-size:16px;
               border-radius:6px; cursor:pointer; font-weight:700; }
      button:hover { background:#09498a; }
      .note { font-size:12px; color:#7b8794; margin-top:8px; }
      .done { text-align:center; padding:60px 20px; }
      .done .check { font-size:54px; color:#2f9e44; }
    </style>`;

  // ========== 企業A：日本語ラベル・select・同意チェック ==========
  app.get('/company-a', (req, res) => {
    res.send(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
    <title>株式会社サンプル商事｜お問い合わせ</title>${style}</head><body>
    <header><div class="logo">SAMPLE TRADING Co., Ltd.</div>
      <div class="tag">株式会社サンプル商事</div></header>
    <div class="wrap">
      <h1>お問い合わせ</h1>
      <p class="lead">製品・サービスに関するご相談、お見積りのご依頼など、下記フォームよりお気軽にお問い合わせください。</p>
      <form method="POST" action="/company-a/submit">
        <div class="field">
          <label>会社名 / 法人名<span class="req">必須</span></label>
          <input type="text" name="company_name" required>
        </div>
        <div class="field">
          <label>部署名</label>
          <input type="text" name="dept">
        </div>
        <div class="row">
          <div class="field">
            <label>お名前<span class="req">必須</span></label>
            <input type="text" name="your_name" required>
          </div>
          <div class="field">
            <label>フリガナ</label>
            <input type="text" name="kana">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>メールアドレス<span class="req">必須</span></label>
            <input type="email" name="email" required>
          </div>
          <div class="field">
            <label>電話番号</label>
            <input type="tel" name="tel">
          </div>
        </div>
        <div class="field">
          <label>ご用件<span class="req">必須</span></label>
          <select name="category" required>
            <option value="">選択してください</option>
            <option value="estimate">お見積りのご依頼</option>
            <option value="product">製品・サービスについて</option>
            <option value="partner">協業・業務提携のご相談</option>
            <option value="recruit">採用について</option>
            <option value="other">その他</option>
          </select>
        </div>
        <div class="field">
          <label>お問い合わせ内容<span class="req">必須</span></label>
          <textarea name="message" required></textarea>
        </div>
        <label class="agree">
          <input type="checkbox" name="privacy" required>
          <span>個人情報の取り扱いに同意する</span>
        </label>
        <button type="submit">この内容で送信する</button>
        <p class="note">※ いただいた内容は2営業日以内にご返信いたします。</p>
      </form>
    </div></body></html>`);
  });

  // ========== 企業B：英語name属性・placeholder主体・姓名分割・メール確認 ==========
  app.get('/company-b', (req, res) => {
    res.send(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
    <title>GreenField Inc. | Contact</title>${style}</head><body>
    <header style="background:#1f7a4d"><div class="logo">GreenField Inc.</div>
      <div class="tag">グリーンフィールド株式会社</div></header>
    <div class="wrap">
      <h1 style="border-color:#1f7a4d">CONTACT US</h1>
      <p class="lead">お問い合わせは以下のフォームよりお願いいたします。</p>
      <form method="POST" action="/company-b/submit">
        <div class="field">
          <label>御社名</label>
          <input type="text" name="org" placeholder="例）株式会社〇〇">
        </div>
        <div class="row">
          <div class="field">
            <label>姓</label>
            <input type="text" name="lname" placeholder="山田">
          </div>
          <div class="field">
            <label>名</label>
            <input type="text" name="fname" placeholder="太郎">
          </div>
        </div>
        <div class="field">
          <label>E-mail</label>
          <input type="text" name="mailaddr" placeholder="you@example.com">
        </div>
        <div class="field">
          <label>E-mail（確認用）</label>
          <input type="text" name="mailaddr_confirm" placeholder="確認のためもう一度">
        </div>
        <div class="field">
          <label>お電話番号</label>
          <input type="text" name="phone_number" placeholder="03-0000-0000">
        </div>
        <div class="field">
          <label>件名</label>
          <input type="text" name="subject" placeholder="お問い合わせの件名">
        </div>
        <div class="field">
          <label>本文</label>
          <textarea name="body" placeholder="お問い合わせ内容をご記入ください"></textarea>
        </div>
        <label class="agree">
          <input type="checkbox" name="agreement">
          <span>プライバシーポリシーに同意します</span>
        </label>
        <button type="submit" style="background:#1f7a4d">送信</button>
      </form>
    </div></body></html>`);
  });

  // ---- 送信受け口（サンクスページ）----
  function thanks(res, company, data) {
    res.send(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
    <title>送信完了</title>${style}</head><body>
    <header><div class="logo">${company}</div></header>
    <div class="wrap done">
      <div class="check">✓</div>
      <h1 style="border:0; justify-content:center;">お問い合わせを受け付けました</h1>
      <p class="lead">この度はお問い合わせいただき、誠にありがとうございます。<br>
      担当者より追ってご連絡いたします。</p>
    </div></body></html>`);
  }
  app.post('/company-a/submit', (req, res) => {
    console.log('[企業A 受信]', JSON.stringify(req.body, null, 2));
    thanks(res, '株式会社サンプル商事', req.body);
  });
  app.post('/company-b/submit', (req, res) => {
    console.log('[企業B 受信]', JSON.stringify(req.body, null, 2));
    thanks(res, 'GreenField Inc.', req.body);
  });

  return app;
}

module.exports = { createServer };
