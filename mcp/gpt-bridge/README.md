# gpt-bridge — Claude から ChatGPT(OpenAI API)を呼ぶ

## 結論:「Claudeの設定画面にAPIキー入力欄」は存在しない

調べても分からなかった理由はこれです。Claude 側に「ChatGPT連携」という
機能やキー入力欄は用意されていません。**MCPサーバーを1つ登録し、その
サーバーに渡す環境変数としてAPIキーを設定する**のが唯一の正式な方法です。

このディレクトリは、そのMCPサーバーの実体です。追加インストールは不要
(Node 18以降だけで動作、依存パッケージゼロ)。

---

## 事前準備:APIキーの発行(ここで詰まる人が多い)

| 手順 | 操作 | 注意点 |
|---|---|---|
| 1 | <https://platform.openai.com/api-keys> を開く | ChatGPTと**別サイト**。同じアカウントでログイン可 |
| 2 | 「Create new secret key」でキーを発行 | `sk-...` で始まる文字列。**表示は一度だけ**なので必ず控える |
| 3 | <https://platform.openai.com/settings/organization/billing> で支払い方法を登録し、クレジットを購入 | **ChatGPT Plus/Proの月額とAPIの課金は完全に別勘定**。Plusを払っていてもAPIは0円では使えない |

> 手順3を飛ばすと、キーは正しいのに `429 insufficient_quota` エラーになります。
> 最初は $10 程度のチャージで十分に試せます。

---

## 設定方法A:コマンド1行(推奨・最も簡単)

ターミナルで、このリポジトリのディレクトリに移動して実行します。

```bash
claude mcp add --env OPENAI_API_KEY=sk-ここに発行したキー \
  --transport stdio gpt \
  -- node "$(pwd)/mcp/gpt-bridge/server.mjs"
```

- `--` より後ろがサーバーの起動コマンドです。この区切りは省略できません。
- `--env` の直後にサーバー名(`gpt`)を置くとCLIが誤認するため、間に
  `--transport stdio` を挟んでいます。
- 保存先は `~/.claude.json`(自分専用。Gitには入りません)。

### 確認

```bash
claude mcp list        # gpt が ✓ connected と出れば成功
```

Claude Code を起動し直して `/mcp` と打つと `gpt` が一覧に出ます。

---

## 設定方法B:`.mcp.json` + 環境変数(チームで共有する場合)

リポジトリ直下の `.mcp.json` に設定済みです。こちらはキー本体を
ファイルに書かず、環境変数から読み込みます。**Gitにキーを載せたくない
場合はこちら**。

`~/.zshrc`(Macの標準) に次の2行を追記します。

```bash
export OPENAI_API_KEY="sk-ここに発行したキー"
export OPENAI_MODEL="gpt-5.1"   # 任意。使いたいモデルID
```

追記後、ターミナルを開き直すか `source ~/.zshrc` を実行してから Claude Code
を起動します。初回起動時に「このプロジェクトのMCPサーバーを使うか」の
承認プロンプトが出るので承認してください。

> 方法AとBの両方を設定した場合、A(local)が優先されます。

---

## 使い方

Claude に日本語で頼むだけです。

| 頼み方の例 | 実行されるツール |
|---|---|
| 「この件、GPTにも聞いて意見を比べて」 | `ask_gpt` |
| 「`server.mjs` をGPTにレビューさせて」 | `ask_gpt`(files付き) |
| 「このテロップ入りサムネを縦型で作って」 | `generate_image` |
| 「この画像の文字だけ差し替えて」 | `edit_image` |
| 「使えるモデル一覧を出して」 | `list_models` |

生成した画像は `./generated-images/` に保存され、パスが返ります。そのまま
Claude に「この画像をffmpegで動画の冒頭3秒に重ねて」と続けられます。

Claude を経由せず単体でも動きます(動作確認に便利)。

```bash
node mcp/gpt-bridge/server.mjs --ask "日本の中小企業向けAI研修の相場を教えて"
node mcp/gpt-bridge/server.mjs --image "縦型9:16のサムネイル。中央に大きく「AI研修」の文字"
node mcp/gpt-bridge/server.mjs --models
```

### ツール仕様

**`ask_gpt`**

| 引数 | 必須 | 説明 |
|---|---|---|
| `prompt` | ○ | GPTに送る本文 |
| `system` | | 役割・制約を与えるsystemメッセージ |
| `model` | | モデルID。未指定なら `OPENAI_MODEL` → 既定値 |
| `files` | | 参考として同送するテキストファイルのパス(配列) |
| `reasoning_effort` | | `minimal`/`low`/`medium`/`high`(対応モデルのみ) |
| `temperature` | | 0〜2。未指定なら送信しない |

**`generate_image`** / **`edit_image`**

| 引数 | 必須 | 説明 |
|---|---|---|
| `prompt` | ○ | 生成・編集の指示(日本語可) |
| `images` | `edit_image`のみ○ | 編集元の画像パス(配列)。複数渡すと合成も可 |
| `mask` | | 透明部分だけを描き換えるマスクPNG |
| `size` | | `1024x1536`(縦型)など。長辺3840px未満・各辺16の倍数・比率3:1以内 |
| `quality` | | `auto`/`low`/`medium`/`high`。高いほど高コスト |
| `n` | | 生成枚数 |
| `background` | | `transparent` で背景透過(png/webpのみ) |
| `out_dir` / `name_prefix` | | 保存先と接頭辞。既定は `./generated-images/` |
| `model` | | 既定は `OPENAI_IMAGE_MODEL` → `gpt-image-2` |

> `size`・`quality` などは**指定したときだけAPIに送る**設計です。モデルに
> よって受け付ける値が違い、既定値を勝手に送ると400エラーになるためです。

**`list_models`** — そのAPIキーで実際に使えるモデルIDを一覧表示。

### 画像生成のコスト目安

| 品質 | 1024×1024 の1枚あたり概算 |
|---|---|
| low | 約 $0.006 |
| medium | 約 $0.053 |
| high | 約 $0.211 |

出典は第三者による試算で、公式の定価表記ではありません(確信度:中)。
`gpt-image-2` のトークン単価は公式ページで image input $4/1M・output $15/1M と
記載されていますが、第三者サイトは $8/$30 と食い違っています。**本番前に
<https://platform.openai.com/docs/pricing> で必ず確認してください。**

試行錯誤で枚数が増えると効きます。high で100枚作れば約$21(約3,000円)です。

---

## うまくいかないときの対処

| 症状 | 原因と対処 |
|---|---|
| `OPENAI_API_KEY が設定されていません` | 環境変数がサーバーに渡っていない。方法Aで再登録するか、`source ~/.zshrc` 後にClaude Codeを再起動 |
| `HTTP 401` | キーが誤っている/失効。`platform.openai.com` で再発行 |
| `HTTP 429 insufficient_quota` | APIのクレジット残高ゼロ。billing設定で入金(Plus課金とは別) |
| `モデル名 "..." が無効` | `list_models` で実際のID を確認し `OPENAI_MODEL` を修正 |
| `接続できません` | クラウドセッションの場合、環境のネットワーク設定で `api.openai.com` を許可ドメインに追加する必要がある |
| `claude mcp list` に出ない | `--` の位置、`server.mjs` の絶対パスを確認 |

---

## リスク・ダウンサイド(導入前に把握しておくこと)

| 項目 | 内容 |
|---|---|
| **キーの平文保存** | 方法Aは `~/.claude.json`、方法Bは `~/.zshrc` に平文で残る。PCを共有しない、キーに利用上限(`platform.openai.com` の Limits)を設定する、退職者が出たら再発行する |
| **情報の社外送信** | `ask_gpt` に渡した内容はOpenAIに送信される。顧客の機密情報・個人情報を含むファイルを `files` で渡さない運用ルールを先に決める |
| **コストが二重に発生** | Claudeの利用料とOpenAI APIの従量課金が別に積み上がる。使うほど増えるため、OpenAI側で月額の上限額(Usage limits)を必ず設定する |
| **`.mcp.json` のコミット** | このファイル自体にキーは含まれないが、方法Aで誤って `~/.claude.json` 以外に書かないよう注意 |
| **運用の属人化** | 設定したPCでしか動かない。社内に広げるなら方法B+手順書の配布を前提にする |

> 顧客に提供・再販する構成として使う場合は、OpenAIの利用規約(データ取り扱い・
> 再販条項)と自社の秘密保持契約の整合について、法務の確認を推奨します。
