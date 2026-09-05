// 実接続テスト: デプロイ済み Worker に写真を投げ、生成イラストに2色とも写るかを実測する。
//
//   ★ 1ペアにつき OpenAI の画像生成が1回走る（＝課金1回・日次50枠を1消費）。
//     Worker を wrangler deploy した後でないと、直した新プロンプトは走らない。
//
// 使い方:
//   node test/selfcard_live_colors.mjs <顔写真.jpg> winter:autumn spring:summer
//     引数のペアぶんだけ生成する。省略時は winter:autumn と spring:summer の2回。
//
// 出力: test/_live_colors_<first>_<second>.png と、2色の面積比の実測表。
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { chromium } from "playwright";
import { buildPrompt, FIRST_COLOR, SECOND_COLOR } from "../worker/selfcard-worker.js";
import { measure, verdict, line, decodeB64 } from "./selfcard_color_detect.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENDPOINT = "https://colorlab-selfcard.the-company-20220901.workers.dev/illustrate";
const ORIGIN = "https://blubel.jp";

const argv = process.argv.slice(2);
const photo = argv[0];
if (!photo || !existsSync(photo)) {
  console.log("使い方: node test/selfcard_live_colors.mjs <顔写真.jpg> [first:second ...]");
  process.exit(2);
}
const pairs = (argv.length > 1 ? argv.slice(1) : ["winter:autumn", "spring:summer"])
  .map((s) => s.split(":"));
for (const [f, s] of pairs) {
  if (!FIRST_COLOR[f] || !SECOND_COLOR[s]) { console.log(`不正なペア: ${f}:${s}`); process.exit(2); }
}
console.log(`実接続テスト: ${pairs.length}回 生成します（課金 ${pairs.length}回・日次枠を ${pairs.length} 消費）`);

const buf = readFileSync(photo);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");

const rows = [];
for (const [first, second] of pairs) {
  const fd = new FormData();
  fd.append("photo", new Blob([buf], { type: "image/jpeg" }), "p.jpg");
  fd.append("first", first);
  fd.append("second", second);
  const t0 = Date.now();
  const r = await fetch(ENDPOINT, { method: "POST", headers: { Origin: ORIGIN }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.image) {
    console.log(`  NG  ${first}/${second}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
    rows.push({ first, second, ok: false });
    continue;
  }
  const out = resolve(HERE, `_live_colors_${first}_${second}.png`);
  writeFileSync(out, Buffer.from(j.image, "base64"));

  const img = await decodeB64(page, j.image);

  const m = measure(Uint8Array.from(img.px), [FIRST_COLOR[first], SECOND_COLOR[second]], 2);
  const pass = verdict(m).pass;
  rows.push({ first, second, ok: pass, p1: m.pct[0], p2: m.pct[1], out, sec: ((Date.now() - t0) / 1000).toFixed(1),
              remaining: j.remaining });
  console.log(`  ${pass ? "ok" : "NG"}  ${first}/${second}  ` +
    `${FIRST_COLOR[first].en} / ${SECOND_COLOR[second].en}  ` +
    `(${rows[rows.length - 1].sec}s, 残り枠 ${j.remaining})
        ${line(m)}
        -> ${out}`);
}
await browser.close();

console.log("\n--- 送ったプロンプト ---");
for (const [f, s] of pairs) console.log(`[${f}/${s}] ${buildPrompt(f, s)}\n`);

const ng = rows.filter((r) => !r.ok).length;
console.log(`=== ${rows.length - ng}/${rows.length} 合格  /  OpenAI 画像生成 ${pairs.length} 回 課金 ===`);
process.exit(ng ? 1 : 0);
