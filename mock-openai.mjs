import { createServer } from "node:http";
// 1x1 の赤い PNG
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    console.error(`[mock] ${req.method} ${req.url} content-type=${req.headers["content-type"]?.slice(0,30)}`);
    console.error(`[mock] body=${body.slice(0, 200)}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      data: [{ b64_json: PNG_B64, revised_prompt: "a red dot" }, { b64_json: PNG_B64 }],
      usage: { input_tokens: 12, output_tokens: 345 },
    }));
  });
}).listen(8899, "127.0.0.1", () => console.error("[mock] listening"));
