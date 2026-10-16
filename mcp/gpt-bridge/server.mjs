#!/usr/bin/env node
/**
 * gpt-bridge - Claude Code から OpenAI (ChatGPT) のモデルを呼び出す MCP サーバー。
 *
 * 依存パッケージなし。Node 18 以降の fetch と標準入出力だけで動く。
 *
 * 環境変数:
 *   OPENAI_API_KEY   必須。https://platform.openai.com/api-keys で発行する。
 *   OPENAI_MODEL     既定モデル。未設定なら DEFAULT_MODEL を使う。
 *   OPENAI_BASE_URL  既定は https://api.openai.com/v1 。互換ゲートウェイ用。
 *
 * MCP サーバーとして:  node server.mjs
 * 単体の CLI として:   node server.mjs --ask "質問"  /  node server.mjs --models
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const DEFAULT_MODEL = "gpt-5.1";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_DIR = "generated-images";
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 300_000;
const MAX_BYTES_PER_FILE = 100_000;
const MAX_BYTES_TOTAL = 400_000;

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY が設定されていません。MCP サーバーの env に API キーを渡してください。"
    );
  }
  return key;
}

async function callOpenAI(path, { method = "GET", body } = {}) {
  const key = apiKey(); // fetch の try の外で検証し、キー未設定を接続エラーと混同しない。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        // FormData のときは Content-Type を fetch に任せる (boundary が必要)。
        ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`OpenAI API がタイムアウトしました (${REQUEST_TIMEOUT_MS / 1000}秒)。`);
    }
    const hint = process.env.HTTPS_PROXY
      ? " (クラウドセッションの場合、環境のネットワーク設定で api.openai.com の許可が必要です)"
      : "";
    throw new Error(`OpenAI API に接続できません: ${err.message}${hint}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI API エラー (HTTP ${res.status}): ${text.slice(0, 2000)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`OpenAI API の応答を JSON として解釈できません: ${text.slice(0, 500)}`);
  }
}

async function readAttachments(files = []) {
  const parts = [];
  let total = 0;
  for (const file of files) {
    const path = resolve(process.cwd(), file);
    let content;
    try {
      content = await readFile(path, "utf8");
    } catch (err) {
      throw new Error(`ファイルを読めません (${file}): ${err.message}`);
    }
    if (Buffer.byteLength(content, "utf8") > MAX_BYTES_PER_FILE) {
      content =
        content.slice(0, MAX_BYTES_PER_FILE) + "\n...(1ファイルあたりの上限で切り詰めました)";
    }
    total += Buffer.byteLength(content, "utf8");
    if (total > MAX_BYTES_TOTAL) {
      throw new Error(
        `添付ファイルの合計が上限 (${MAX_BYTES_TOTAL} バイト) を超えました。渡すファイルを減らしてください。`
      );
    }
    parts.push(`----- ${file} -----\n${content}`);
  }
  return parts.join("\n\n");
}

async function askGpt({ prompt, system, model, files, reasoning_effort, temperature }) {
  if (!prompt || !prompt.trim()) throw new Error("prompt は必須です。");
  const chosen = model || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  let userContent = prompt;
  const attachments = await readAttachments(files);
  if (attachments) {
    userContent = `${prompt}\n\n# 参考ファイル\n\n${attachments}`;
  }

  const messages = [];
  if (system && system.trim()) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userContent });

  const body = { model: chosen, messages };
  // temperature と reasoning_effort は、指定されたときだけ送る。
  // モデルによって受け付けないパラメータがあり、既定で送ると 400 になるため。
  if (typeof temperature === "number") body.temperature = temperature;
  if (reasoning_effort) body.reasoning_effort = reasoning_effort;

  let data;
  try {
    data = await callOpenAI("/chat/completions", { method: "POST", body });
  } catch (err) {
    if (/model/i.test(err.message) && /(not (exist|found)|does not)/i.test(err.message)) {
      throw new Error(
        `${err.message}\n\nモデル名 "${chosen}" が無効な可能性があります。` +
          `list_models ツールで利用可能なモデルを確認し、OPENAI_MODEL か model 引数で指定してください。`
      );
    }
    throw err;
  }

  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error(`応答に本文が含まれていません: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  const usage = data.usage
    ? `\n\n---\nmodel: ${data.model ?? chosen} / tokens: in ${data.usage.prompt_tokens ?? "?"}, out ${data.usage.completion_tokens ?? "?"}`
    : `\n\n---\nmodel: ${data.model ?? chosen}`;
  return answer + usage;
}

// 先頭バイトから拡張子を判定する。output_format の既定値はモデルにより異なるため、
// パラメータを送らずに実際の形式を見て決める。
function extensionOf(buffer) {
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP")
    return "webp";
  return "png";
}

async function saveImages(data, { out_dir, name_prefix }) {
  const dir = resolve(process.cwd(), out_dir || DEFAULT_IMAGE_DIR);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const prefix = (name_prefix || "image").replace(/[^\w.-]/g, "_");
  const saved = [];
  for (const [i, item] of (data ?? []).entries()) {
    if (!item.b64_json) continue;
    const buffer = Buffer.from(item.b64_json, "base64");
    const path = join(dir, `${prefix}-${stamp}-${i + 1}.${extensionOf(buffer)}`);
    await writeFile(path, buffer);
    saved.push({ path, bytes: buffer.length, revised_prompt: item.revised_prompt });
  }
  if (!saved.length) throw new Error("画像データが返りませんでした。");
  return saved;
}

function formatImageResult(saved, data, model) {
  const lines = saved.map(
    (f) => `- ${f.path} (${Math.round(f.bytes / 1024)} KB)` + (f.revised_prompt ? `\n  補正後プロンプト: ${f.revised_prompt}` : "")
  );
  const usage = data.usage
    ? `tokens: in ${data.usage.input_tokens ?? "?"}, out ${data.usage.output_tokens ?? "?"}`
    : "";
  return [`${saved.length}枚を保存しました。`, "", ...lines, "", `---`, `model: ${model}${usage ? " / " + usage : ""}`].join("\n");
}

// 画像サイズ・品質などは、指定されたときだけ送る。モデルによって受け付ける値が
// 異なり、既定で送ると 400 になるため。
function applyImageOptions(body, { size, quality, n, background, output_format }) {
  if (size) body.size = size;
  if (quality) body.quality = quality;
  if (typeof n === "number") body.n = n;
  if (background) body.background = background;
  if (output_format) body.output_format = output_format;
  return body;
}

async function generateImage(args) {
  const { prompt, model, ...rest } = args;
  if (!prompt || !prompt.trim()) throw new Error("prompt は必須です。");
  const chosen = model || process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const body = applyImageOptions({ model: chosen, prompt }, rest);
  const data = await callOpenAI("/images/generations", { method: "POST", body });
  const saved = await saveImages(data.data, rest);
  return formatImageResult(saved, data, chosen);
}

async function editImage(args) {
  const { prompt, images, mask, model, ...rest } = args;
  if (!prompt || !prompt.trim()) throw new Error("prompt は必須です。");
  if (!images?.length) throw new Error("images に編集元の画像パスを1つ以上指定してください。");
  const chosen = model || process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

  const form = new FormData();
  form.append("model", chosen);
  form.append("prompt", prompt);
  for (const file of images) {
    const path = resolve(process.cwd(), file);
    let buffer;
    try {
      buffer = await readFile(path);
    } catch (err) {
      throw new Error(`画像を読めません (${file}): ${err.message}`);
    }
    form.append("image[]", new Blob([buffer]), path.split("/").pop());
  }
  if (mask) {
    const path = resolve(process.cwd(), mask);
    form.append("mask", new Blob([await readFile(path)]), path.split("/").pop());
  }
  const opts = applyImageOptions({}, rest);
  for (const [key, value] of Object.entries(opts)) form.append(key, String(value));

  const data = await callOpenAI("/images/edits", { method: "POST", body: form });
  const saved = await saveImages(data.data, rest);
  return formatImageResult(saved, data, chosen);
}

async function listModels() {
  const data = await callOpenAI("/models");
  const ids = (data.data ?? [])
    .map((m) => m.id)
    .filter(Boolean)
    .sort();
  if (!ids.length) return "このAPIキーで利用できるモデルが取得できませんでした。";
  const gpt = ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id));
  const others = ids.filter((id) => !gpt.includes(id));
  return [
    `利用可能なモデル (${ids.length}件)`,
    "",
    "## 対話系 (gpt / o 系)",
    ...gpt.map((id) => `- ${id}`),
    ...(others.length ? ["", "## その他", ...others.map((id) => `- ${id}`)] : []),
    "",
    `現在の既定モデル: ${process.env.OPENAI_MODEL || DEFAULT_MODEL}`,
  ].join("\n");
}

const TOOLS = [
  {
    name: "ask_gpt",
    description:
      "OpenAI (ChatGPT) のモデルに質問し、回答を返す。別モデルからのセカンドオピニオン、" +
      "Claude の設計や文章のレビュー、2つのモデルの出力比較に使う。" +
      "files にパスを渡すとその内容を参考資料として同送する。",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "GPT に送る質問・依頼の本文。" },
        system: {
          type: "string",
          description: "任意。役割や制約を与える system メッセージ。",
        },
        model: {
          type: "string",
          description:
            "任意。使用するモデル ID。未指定なら OPENAI_MODEL、それも無ければ既定モデル。",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description:
            "任意。参考として同送するテキストファイルのパス(カレントディレクトリからの相対パスも可)。",
        },
        reasoning_effort: {
          type: "string",
          enum: ["minimal", "low", "medium", "high"],
          description: "任意。推論モデル向けの思考量。対応モデルのみ有効。",
        },
        temperature: {
          type: "number",
          description: "任意。0〜2。指定しなければ送らない(モデルの既定値を使う)。",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_image",
    description:
      "OpenAI の画像生成モデル (gpt-image-2 など) で画像を生成し、ファイルに保存してパスを返す。" +
      "動画のキーフレーム・サムネイル・素材画像・ポスターの作成に使う。文字入りの画像にも強い。",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "生成したい画像の説明。日本語可。" },
        size: {
          type: "string",
          description:
            '任意。"1024x1024" など。長辺3840px未満、各辺16の倍数、縦横比3:1以内。未指定ならモデル既定。',
        },
        quality: {
          type: "string",
          enum: ["auto", "low", "medium", "high"],
          description: "任意。高いほど高品質・高コスト。未指定ならモデル既定。",
        },
        n: { type: "number", description: "任意。生成枚数。" },
        background: {
          type: "string",
          enum: ["auto", "transparent", "opaque"],
          description: "任意。transparent は png/webp のみ有効。",
        },
        output_format: {
          type: "string",
          enum: ["png", "jpeg", "webp"],
          description: "任意。未指定なら送信せず、返ったデータから形式を判定する。",
        },
        out_dir: {
          type: "string",
          description: `任意。保存先ディレクトリ。既定は ./${"generated-images"} 。`,
        },
        name_prefix: { type: "string", description: "任意。保存ファイル名の接頭辞。" },
        model: {
          type: "string",
          description: "任意。画像モデルID。未指定なら OPENAI_IMAGE_MODEL、それも無ければ gpt-image-2。",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "edit_image",
    description:
      "既存の画像を OpenAI の画像モデルで編集する。複数画像を渡して合成・一貫性のある差分生成もできる。" +
      "mask を渡すとその領域だけを描き換える (インペイント)。",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "どう編集するかの指示。日本語可。" },
        images: {
          type: "array",
          items: { type: "string" },
          description: "編集元の画像ファイルのパス(1つ以上)。",
        },
        mask: {
          type: "string",
          description: "任意。透明部分を描き換え対象とするマスク画像(PNG)のパス。",
        },
        size: {
          type: "string",
          description:
            '任意。"1024x1024" など。長辺3840px未満、各辺16の倍数、縦横比3:1以内。未指定ならモデル既定。',
        },
        quality: {
          type: "string",
          enum: ["auto", "low", "medium", "high"],
          description: "任意。高いほど高品質・高コスト。未指定ならモデル既定。",
        },
        n: { type: "number", description: "任意。生成枚数。" },
        background: {
          type: "string",
          enum: ["auto", "transparent", "opaque"],
          description: "任意。transparent は png/webp のみ有効。",
        },
        output_format: {
          type: "string",
          enum: ["png", "jpeg", "webp"],
          description: "任意。未指定なら送信せず、返ったデータから形式を判定する。",
        },
        out_dir: {
          type: "string",
          description: `任意。保存先ディレクトリ。既定は ./${"generated-images"} 。`,
        },
        name_prefix: { type: "string", description: "任意。保存ファイル名の接頭辞。" },
        model: {
          type: "string",
          description: "任意。画像モデルID。未指定なら OPENAI_IMAGE_MODEL、それも無ければ gpt-image-2。",
        },
      },
      required: ["prompt", "images"],
    },
  },
  {
    name: "list_models",
    description:
      "この API キーで実際に使えるモデル ID の一覧を取得する。モデル名のエラーが出たときに使う。",
    inputSchema: { type: "object", properties: {} },
  },
];

// ---- MCP (JSON-RPC 2.0 over stdio, 改行区切り) ----

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    const requested = params?.protocolVersion;
    respond(id, {
      protocolVersion: typeof requested === "string" ? requested : "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "gpt-bridge", version: "1.0.0" },
    });
    return;
  }

  if (method === "ping") {
    respond(id, {});
    return;
  }

  if (method === "tools/list") {
    respond(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    try {
      let text;
      if (name === "ask_gpt") text = await askGpt(args);
      else if (name === "generate_image") text = await generateImage(args);
      else if (name === "edit_image") text = await editImage(args);
      else if (name === "list_models") text = await listModels();
      else throw new Error(`未知のツール: ${name}`);
      respond(id, { content: [{ type: "text", text }] });
    } catch (err) {
      // ツール実行時のエラーは isError で返す。Claude 側が内容を読んで対処できる。
      respond(id, { content: [{ type: "text", text: `エラー: ${err.message}` }], isError: true });
    }
    return;
  }

  respondError(id, -32601, `未対応のメソッド: ${method}`);
}

function startServer() {
  let buffer = "";
  let pending = 0;
  let stdinEnded = false;
  const exitIfDone = () => {
    if (stdinEnded && pending === 0) process.exit(0);
  };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        respondError(null, -32700, "JSON として解釈できません");
        continue;
      }
      // id を持たないメッセージは通知。応答してはいけない。
      if (msg.id === undefined || msg.id === null) continue;
      pending += 1;
      handleRequest(msg)
        .catch((err) => respondError(msg.id, -32603, err.message))
        .finally(() => {
          pending -= 1;
          exitIfDone();
        });
    }
  });
  // stdin が閉じても、処理中のリクエストが残っていれば応答を返してから終了する。
  process.stdin.on("end", () => {
    stdinEnded = true;
    exitIfDone();
  });
}

// ---- CLI モード ----

async function runCli(argv) {
  const flag = argv[0];
  try {
    if (flag === "--models") {
      process.stdout.write((await listModels()) + "\n");
    } else if (flag === "--image") {
      const prompt = argv.slice(1).join(" ");
      process.stdout.write((await generateImage({ prompt })) + "\n");
    } else if (flag === "--ask") {
      const prompt = argv.slice(1).join(" ");
      process.stdout.write((await askGpt({ prompt })) + "\n");
    } else {
      process.stdout.write(
        [
          "gpt-bridge - Claude Code から OpenAI のモデルを呼ぶ MCP サーバー",
          "",
          "  node server.mjs              MCP サーバーとして起動 (Claude Code が実行する)",
          '  node server.mjs --ask "質問"   その場で GPT に質問する',
          '  node server.mjs --image "説明" その場で画像を生成する',
          "  node server.mjs --models      使えるモデル一覧を表示する",
          "",
        ].join("\n")
      );
    }
  } catch (err) {
    process.stderr.write(`エラー: ${err.message}\n`);
    process.exit(1);
  }
}

if (process.argv.length > 2) {
  await runCli(process.argv.slice(2));
} else {
  startServer();
}
