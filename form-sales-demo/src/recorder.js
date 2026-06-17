/**
 * フレーム収集レコーダー
 * Playwright のスクリーンショットを連番PNGとして書き出し、最後に ffmpeg で mp4 へ。
 * （ブラウザ標準の動画取得経路がこの環境では使えないため、スクショ連結方式を採用）
 */
const fs = require('fs');
const path = require('path');

class Recorder {
  constructor(page, dir, fps = 12) {
    this.page = page;
    this.dir = dir;
    this.fps = fps;
    this.n = 0;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  _name() {
    return path.join(this.dir, String(this.n++).padStart(5, '0') + '.png');
  }

  /** 現在の画面を1フレーム収集 */
  async snap() {
    try {
      await this.page.screenshot({ path: this._name() });
    } catch (_) { /* 遷移中などは無視 */ }
  }

  /** sec 秒ぶん同じ画面を保持（直近フレームを複製して尺をかせぐ） */
  async hold(sec) {
    await this.snap();
    const last = path.join(this.dir, String(this.n - 1).padStart(5, '0') + '.png');
    if (!fs.existsSync(last)) return;
    const frames = Math.max(1, Math.round(sec * this.fps));
    for (let i = 0; i < frames; i++) {
      fs.copyFileSync(last, this._name());
    }
  }

  get frameCount() { return this.n; }
}

module.exports = { Recorder };
