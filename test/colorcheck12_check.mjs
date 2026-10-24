// 顔映り24色の ◎○△✕ を12タイプ別にした（v1.22.13）ことを実測する（2026-10-23）。
//   (1) src の COLOR_CHECK_12 が 24色×12タイプ=288件で、下の EXPECT（指示書 CC_v1_22_13 の表）と一致する。値は ◎○△✕ のどれか。
//       色名は COLOR_CHECK の24色と一致する
//   (2) src に 4タイプの判定の参照（cc.r[ など）が残っていない
//   (3) 結果画面（12通り）の「色別 顔映りチェック（24色）」の各行の ◎○△✕ が EXPECT のそのタイプと一致し、◎→✕ の順に並ぶ
//   (4) 「この色、似合う？チェッカー」を12タイプのボタンから選び、24色それぞれの判定が EXPECT と一致する
//   (5) ウォームオータムの BEST COLOR 10 の8〜10番目が #244564 / #6BB2AC / #E8B49C
//   (6) v1.22.14: 商品3点を12タイプ別に（NGカラー診断と同じ表 NG_PRODUCTS_12 = src/ng_products12_data.js を使う）。
//       3か所 = チェッカー「得意色で買い替えるならコレ／この色と好相性の得意色アイテム」・今日のコーデ採点「スコアを底上げする…」・
//       結果画像（保存・シェア）の「似合うアイテム」。12タイプそれぞれで
//       (a) 3か所の商品が NG_PRODUCTS_12[タイプ] と一致（ウォームスプリングは2点）
//       (b) そのタイプの NG色4色に当たる色の商品が出ない（NG色名と判定語は下の NG4・NG_WORDS。商品の色はタグ CSV の color 列）
//       (c) ブライトサマーとソフトサマーで、3か所とも商品が違う
//       (d) 12タイプ名が無い時（コーデ採点を4タイプのボタンで選んだ時）は、商品欄を4タイプに戻さず出さない
//       src に固定表示 SKUS[...].slice(0, 3) が残っていないことも見る
//   (7) v1.22.14 作業②: 4タイプの入口だった5画面（コーデ提案・ふたりの相性配色・骨格診断・買い足しワードローブ・今日のコーデ採点）を
//       12タイプの入口（TypePicker12）に。12タイプ × 5画面で (a) 入口に12タイプのボタン・4タイプのボタン0個
//       (b) 選んだ12タイプ名が見出し・本文に出る (c) 画面全体に4タイプ名が出ない（除外なし）。src の `|| TYPES[...].name` も0件
//   (8) v1.22.14 A・B・C: 12タイプ × 全画面（ホーム・診断結果・コスメ・髪色・試し塗り・相性配色・骨格→コスメ・NGカラー・チェッカー）で
//       4タイプ名0件（ホームと診断結果の「2nd ○○」だけは2位を示す既存の表示なので除く）。色で決める商品（今日の1点・2nd Type・相性配色・
//       セルフカード）が NG_PRODUCTS_12 と一致し、NG色の商品が出ない
// 期待値はこのファイルに直接書く（src から読まない）。
// 実行: npm run build:colorlab && node test/colorcheck12_check.mjs [バンドル] [--src ファイル] [--static-only]
//   バンドル省略時は dist/colorlab.iife.js。スクリーンショットはバンドル省略時だけ out/colorcheck12/ に撮る。
// ネガティブテスト: v1.22.12 の src / バンドル、または COLOR_CHECK_12 から1件消した src を渡すと FAIL（exit 1）になること。
//   (6) は v1.22.13 の src / バンドル（商品が固定表示）を渡すと FAIL になること。
//   (7)(8) は v1.22.14 作業①（26a201d）の src / バンドル（入口が4タイプ）を渡すと FAIL になること。
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import zlib from "zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const SRC = resolve(opt("--src") || join(ROOT, "src", "color_lab_stylist_v23.jsx"));
const STATIC_ONLY = args.includes("--static-only");
const pos = args.filter((a) => !a.startsWith("--"));
const BUNDLE = resolve(pos[0] || join(ROOT, "dist", "colorlab.iife.js"));
const SHOOT = !pos[0] && !STATIC_ONLY;
const OUT = resolve(ROOT, "out", "colorcheck12");
if (SHOOT) mkdirSync(OUT, { recursive: true });

const KEYS = [
  ["2-1", "ブライトサマー"], ["2-3", "ソフトサマー"], ["2-4", "クールサマー"],
  ["4-3", "ディープウィンター"], ["4-2", "クールウィンター"], ["4-1", "ブライトウィンター"],
  ["1-2", "ライトスプリング"], ["1-4", "ブライトスプリング"], ["1-3", "ウォームスプリング"],
  ["3-1", "ウォームオータム"], ["3-2", "ソフトオータム"], ["3-4", "ディープオータム"],
];
// COLOR_CHECK の24色（この順）
const NAMES24 = ["コーラルピンク", "青みピンク", "ビビッドピンク", "サーモンピンク", "レッド", "ワインレッド", "オレンジ", "テラコッタ", "イエロー", "マスタード",
  "ベージュ", "キャメル", "ブラウン", "カーキ", "ミントグリーン", "エメラルド", "水色", "ロイヤルブルー", "ネイビー", "ラベンダー", "パープル", "グレー", "ホワイト", "ブラック"];
const EXPECT = {
  "コーラルピンク": { "ブライトサマー": "△", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "○", "ソフトオータム": "○", "ディープオータム": "○" },
  "青みピンク": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "△", "クールウィンター": "○", "ブライトウィンター": "△", "ライトスプリング": "○", "ブライトスプリング": "✕", "ウォームスプリング": "△", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "ビビッドピンク": { "ブライトサマー": "○", "ソフトサマー": "✕", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "△", "ブライトスプリング": "○", "ウォームスプリング": "△", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "✕" },
  "サーモンピンク": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "レッド": { "ブライトサマー": "△", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "◎", "クールウィンター": "○", "ブライトウィンター": "◎", "ライトスプリング": "○", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "△", "ディープオータム": "○" },
  "ワインレッド": { "ブライトサマー": "△", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "○", "ソフトオータム": "○", "ディープオータム": "◎" },
  "オレンジ": { "ブライトサマー": "△", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "△", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "○", "ディープオータム": "◎" },
  "テラコッタ": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "イエロー": { "ブライトサマー": "△", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "○", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "△", "ディープオータム": "△" },
  "マスタード": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "ベージュ": { "ブライトサマー": "✕", "ソフトサマー": "○", "クールサマー": "△", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "○" },
  "キャメル": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "ブラウン": { "ブライトサマー": "✕", "ソフトサマー": "△", "クールサマー": "✕", "ディープウィンター": "○", "クールウィンター": "△", "ブライトウィンター": "△", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "○", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "カーキ": { "ブライトサマー": "✕", "ソフトサマー": "△", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "△", "ブライトスプリング": "✕", "ウォームスプリング": "△", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "ミントグリーン": { "ブライトサマー": "△", "ソフトサマー": "◎", "クールサマー": "○", "ディープウィンター": "✕", "クールウィンター": "△", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "エメラルド": { "ブライトサマー": "△", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "○", "ウォームオータム": "○", "ソフトオータム": "○", "ディープオータム": "○" },
  "水色": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "△", "クールウィンター": "◎", "ブライトウィンター": "△", "ライトスプリング": "◎", "ブライトスプリング": "△", "ウォームスプリング": "△", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "ロイヤルブルー": { "ブライトサマー": "○", "ソフトサマー": "○", "クールサマー": "◎", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "△", "ブライトスプリング": "△", "ウォームスプリング": "✕", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "✕" },
  "ネイビー": { "ブライトサマー": "△", "ソフトサマー": "○", "クールサマー": "◎", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "○", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "△", "ソフトオータム": "○", "ディープオータム": "◎" },
  "ラベンダー": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "△", "クールウィンター": "◎", "ブライトウィンター": "△", "ライトスプリング": "○", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "パープル": { "ブライトサマー": "○", "ソフトサマー": "✕", "クールサマー": "○", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "✕", "ブライトスプリング": "△", "ウォームスプリング": "✕", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "△" },
  "グレー": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "○", "クールウィンター": "○", "ブライトウィンター": "△", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "△", "ソフトオータム": "○", "ディープオータム": "△" },
  "ホワイト": { "ブライトサマー": "△", "ソフトサマー": "○", "クールサマー": "○", "ディープウィンター": "○", "クールウィンター": "◎", "ブライトウィンター": "○", "ライトスプリング": "◎", "ブライトスプリング": "△", "ウォームスプリング": "○", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "✕" },
  "ブラック": { "ブライトサマー": "✕", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "○", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "△", "ソフトオータム": "△", "ディープオータム": "○" },
};
const RANK = ["◎", "○", "△", "✕"];
const WA_TAIL = ["#244564", "#6BB2AC", "#E8B49C"];

// ── (6) 商品3点 ──
// 期待する商品の表（NGカラー診断と同じ表。test/build_ng_products12.py が生成）
const NGP = (() => {
  const s = readFileSync(join(ROOT, "src", "ng_products12_data.js"), "utf-8");
  const i = s.indexOf("export const NG_PRODUCTS_12 = ");
  return new Function("return " + s.slice(s.indexOf("{", i), s.lastIndexOf("}") + 1))();
})();
const SITE12 = Object.fromEntries(KEYS.map(([k, n]) => [n, +k[0] === 2 || +k[0] === 4 ? "blubel" : "iebel"]));
// 各タイプの NG色4色（NG_COLORS_12 の name）
const NG4 = {
  "ブライトサマー": ["真っ黒", "マスタード", "ダークブラウン", "カーキ"], "ソフトサマー": ["ビビッドオレンジ", "真っ黒", "ビビッドレッド", "ブライトイエロー"],
  "クールサマー": ["オレンジ", "マスタード", "テラコッタ", "カーキ"], "ディープウィンター": ["パステルピンク", "ベビーブルー", "ミントグリーン", "くすみベージュ"],
  "クールウィンター": ["オレンジブラウン", "マスタード", "モスグリーン", "ベージュ"], "ブライトウィンター": ["くすみベージュ", "モスグリーン", "ダスティピンク", "グレージュ"],
  "ライトスプリング": ["真っ黒", "ダークネイビー", "ボルドー", "チャコールグレー"], "ブライトスプリング": ["くすみグレー", "ダスティローズ", "カーキ", "真っ黒"],
  "ウォームスプリング": ["青みピンク", "ネイビー", "ライトグレー", "真っ黒"], "ウォームオータム": ["青みピンク", "ビビッドブルー", "純白", "ライトグレー"],
  "ソフトオータム": ["ビビッドピンク", "真っ黒", "ビビッドブルー", "ブライトイエロー"], "ディープオータム": ["純白", "ミントグリーン", "ビビッドピンク", "ラベンダー"],
};
// NG色名 → 商品の色名にこの語（正規表現）が含まれていたら NG（2026-10-23 keisuke 承認の表・ngmetal12_check と同じ）
const NG_WORDS = {
  "真っ黒": ["ブラック", "黒", "グラック"], "マスタード": ["マスタード"], "ダークブラウン": ["ダークブラウン", "ブラウン", "モカ", "あずき"],
  "カーキ": ["カーキ", "オリーブ"], "ビビッドオレンジ": ["オレンジ"], "オレンジ": ["オレンジ"], "ビビッドレッド": ["^レッド", "赤"],
  "ブライトイエロー": ["^イエロー"], "テラコッタ": ["テラコッタ"], "パステルピンク": ["ライトピンク", "^ピンク"],
  "ベビーブルー": ["ライトブルー", "淡いブルー"], "ミントグリーン": ["ミントグリーン", "ライトグリーン", "パステルグリーン"],
  "くすみベージュ": ["ベージュ"], "オレンジブラウン": ["キャメル", "キャラメル"], "モスグリーン": ["カーキ", "オリーブ", "ダークグリーン"],
  "ベージュ": ["ベージュ"], "ダスティピンク": ["ダスティピンク", "ダースティピンク"], "グレージュ": ["グレージュ"],
  "ダークネイビー": ["ネイビー"], "ネイビー": ["ネイビー"], "ボルドー": ["ボルドー", "ワインレッド"],
  "チャコールグレー": ["チャコールグレー", "ダークグレー"], "くすみグレー": ["グレー"], "ダスティローズ": ["ダスティピンク", "ダースティピンク"],
  "青みピンク": ["^ピンク", "ホットピンク", "ショッキングピンク"], "ライトグレー": ["ライトグレー"], "ビビッドブルー": ["^ブルー"],
  "純白": ["ホワイト"], "ビビッドピンク": ["ホットピンク", "ショッキングピンク"], "ラベンダー": ["ラベンダー"],
};
// 商品の色はタグ CSV の color 列（build_ng_products12.py と同じ元データ）
const TAG_CSV = { blubel: "C:/Users/newfa/Downloads/blubel_pc12_tags_v1.csv", iebel: "C:/Users/newfa/Downloads/iebel_pc12_tags_v1.csv" };
function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...rs] = rows;
  h[0] = h[0].replace(/^\uFEFF/, "");
  return rs.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}
const COLORS = Object.fromEntries(Object.entries(TAG_CSV).map(([site, p]) =>
  [site, Object.fromEntries(parseCsv(readFileSync(p, "utf-8")).map((r) => [r.item_id, r.color.split(",").map((c) => c.trim()).filter(Boolean)]))]));
// 商品 id の並び → NG色に当たったもの（"id:NG色<商品の色"）
const ngHits = (name, ids) => ids.flatMap((id) => (COLORS[SITE12[name]][String(id)] || [])
  .flatMap((c) => NG4[name].filter((n) => NG_WORDS[n].some((w) => new RegExp(w).test(c))).map((n) => `${id}:${n}<${c}`)));
// 結果画像の商品行（buildShareImage と同じ整形: 先頭の「〜服」と【…】を外して16字で切る）
const shareLine = (sku) => {
  const t = sku.name.replace(/【[^】]*】/g, "").replace(/^(ブルベ夏\/ブルベ冬服|ブルベ夏服|ブルベ冬服|イエベ春\/イエベ秋服|イエベ春服|イエベ秋服)[\s　]*/, "").trim();
  return "・" + (t.length > 16 ? t.slice(0, 16) + "…" : t);
};
const SHOT6 = ["ブライトサマー", "ソフトサマー", "ウォームスプリング"]; // (6)(7)(8) のスクリーンショットを撮るタイプ
// (8) 用: 12タイプ名 → 2位を1位にした12タイプ名（"2-1" → "1-2"）／プロフィール（1位・2位の4タイプ key）
const NAME_OF = Object.fromEntries(KEYS);
const REV12 = Object.fromEntries(KEYS.map(([k, n]) => [n, NAME_OF[k.split("-").reverse().join("-")]]));
const NUM_KEY = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };
const PROFILE12 = Object.fromEntries(KEYS.map(([k, n]) => [n, { myType: NUM_KEY[k[0]], mySecond: NUM_KEY[k[2]], myFrame: null }]));
const got6 = {}; // got6[タイプ][場所] = 商品 id（結果画像は商品行）の並び
const put6 = (name, place, v) => { (got6[name] = got6[name] || {})[place] = v; };

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

// ── (1)(2) src ──
const src = readFileSync(SRC, "utf-8");
const objAfter = (head) => {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const b = src.indexOf("{", i + head.length - 1), e = src.indexOf("\n};", b);
  try { return new Function("return " + src.slice(b, e + 2))(); } catch (err) { return null; }
};
const CC12 = objAfter("const COLOR_CHECK_12 = {");
console.log("src: " + SRC);
check(!!CC12, "(1) src に COLOR_CHECK_12 がある");
if (CC12) {
  const vals = Object.values(CC12).flatMap((v) => Object.values(v));
  check(Object.keys(CC12).length === 24 && vals.length === 288, `(1) 24色×12タイプ=288件 (${Object.keys(CC12).length}色 / ${vals.length}件)`);
  check(vals.every((v) => RANK.includes(v)), "(1) 値が全部 ◎○△✕ のどれか");
  check(JSON.stringify(Object.keys(CC12)) === JSON.stringify(NAMES24), "(1) 色名が COLOR_CHECK の24色と一致（同じ順）");
  for (const nm of NAMES24) {
    const lack = KEYS.filter(([, n]) => !(CC12[nm] && RANK.includes(CC12[nm][n]))).map(([, n]) => n);
    check(lack.length === 0, `(1) ${nm}: 12タイプ全部に判定がある${lack.length ? " (欠け: " + lack.join("・") + ")" : ""}`);
    check(JSON.stringify(CC12[nm]) === JSON.stringify(EXPECT[nm]), `(1) ${nm}: 指示書の表と一致`);
  }
}
const ccr = (src.match(/cc\.r\[/g) || []).length;
const anyR = (src.match(/\.r\[(myType|typeKey|key|RT\.key)\]/g) || []).length;
check(ccr === 0 && anyR === 0, `(2) 4タイプ判定の参照が0件 (cc.r[ ${ccr}件 / .r[myType|typeKey|key] ${anyR}件)`);
const fixed = (src.match(/SKUS\[[^\]]+\]\.slice\(0, 3\)/g) || []).length;
check(fixed === 0, `(6) src に商品の固定表示 SKUS[...].slice(0, 3) が残っていない (${fixed}件)`);
const fb = (src.match(/\|\|\s*(TYPES\[[^\]]+\]|type)\.name\b/g) || []).length;
check(fb === 0, `(7) src に4タイプ名へのフォールバック \`|| TYPES[...].name\` が残っていない (${fb}件)`);
// (8) C: 色で決める商品の出どころ（セルフカードは実機で撮れないので src で見る）
check(src.includes("const skus = site === T.site ? (NG_PRODUCTS_12[T12] || []) : pickCardSkus(site, CARD_SKU_LIMIT);"), "(8) セルフカードのおすすめ商品（担当サイト）が NG_PRODUCTS_12[12タイプ名]");
check(src.includes("const luckyList = NG_PRODUCTS_12[MY12] || [];"), "(8) ホームの今日の1点が NG_PRODUCTS_12[MY12]");
check(src.includes("NG_PRODUCTS_12[type12Name(quizResult.second, quizResult.first)]"), "(8) 診断結果の 2nd Type の商品が NG_PRODUCTS_12[type12Name(2位, 1位)]");
check(src.includes("const coord = NG_PRODUCTS_12[pA12] || [];"), "(8) 相性配色の商品が NG_PRODUCTS_12[あなたの12タイプ名]");
check(!/<TypePicker\s/.test(src), "(8) 4タイプのボタン（<TypePicker ）を使う画面が0");
check(/const catalogSkus = NG_PRODUCTS_12\[typeName\] \|\| \[\];/.test(src), "(6) 結果画像の商品が NG_PRODUCTS_12[typeName]");
check(KEYS.every(([, n]) => (NGP[n] || []).length === (n === "ウォームスプリング" ? 2 : 3)), "(6) NG_PRODUCTS_12 が12タイプ分（ウォームスプリング2点・ほか3点）");

if (!STATIC_ONLY) {
  // 回答パターンの探索・合成写真は test/result12_check.mjs と同じ
  const q12 = src.slice(src.indexOf("const Q12 = ["), src.indexOf("const TIE_Q"));
  const GAINS = [...q12.matchAll(/A: \[(\d), (\d)\], B: \[(\d), (\d)\]/g)].map((m) => ({ A: [+m[1], +m[2]], B: [+m[3], +m[4]] }));
  if (GAINS.length !== 13) throw new Error("Q12 の配点が13問分取れない: " + GAINS.length);
  const TIE = { A: 1, B: 2, C: 3, D: 4 };
  const sortTypes = (s) => [1, 2, 3, 4].map((t) => ({ t, s: s[t] })).sort((a, b) => (b.s !== a.s ? b.s - a.s : a.t - b.t));
  const findPattern = (want) => {
    for (let bits = 0; bits < 1 << 13; bits++) {
      const s = { 1: 0, 2: 0, 3: 0, 4: 0 };
      const picks = [];
      for (let i = 0; i < 13; i++) {
        const c = bits & (1 << i) ? "B" : "A";
        picks.push(c);
        GAINS[i][c].forEach((t) => { s[t] += 1; });
      }
      const sorted = sortTypes(s);
      const tied = sorted.filter((x) => x.s === sorted[0].s).length > 1;
      for (const tc of tied ? Object.keys(TIE) : [null]) {
        const f = { ...s };
        if (tc) f[TIE[tc]] += 1;
        const r = sortTypes(f);
        if (`${r[0].t}-${r[1].t}` === want) return { picks, tie: tc };
      }
    }
    return null;
  };
  const labToRgb = (L, a, b) => {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz);
    const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
    return lin.map((c) => Math.max(0, Math.min(255, Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))));
  };
  const chunk = (type, data) => {
    const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const regionPng = (W, H, base, rects) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
    const box = rects.map(([x0, y0, x1, y1, c]) => [Math.floor(x0 * W), Math.floor(y0 * H), Math.floor(x1 * W), Math.floor(y1 * H), c]);
    const raw = Buffer.alloc(H * (W * 3 + 1));
    let o = 0;
    for (let y = 0; y < H; y++) {
      raw[o++] = 0;
      for (let x = 0; x < W; x++) {
        let c = base;
        for (const [x0, y0, x1, y1, col] of box) if (x >= x0 && x < x1 && y >= y0 && y < y1) c = col;
        raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
      }
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };
  const facePhoto = (skinLab, hairL) => {
    const skin = labToRgb(...skinLab), hair = labToRgb(hairL, 0, 0);
    return regionPng(600, 800, [190, 190, 195], [
      [0.40, 0.06, 0.60, 0.16, hair], [0.24, 0.46, 0.36, 0.58, skin], [0.64, 0.46, 0.76, 0.58, skin], [0.34, 0.76, 0.66, 0.92, [235, 235, 235]],
    ]);
  };
  const PHOTO = { "4-1": facePhoto([64, 14, 17.3], 6), "1-4": facePhoto([68, 12, 19], 10), "3-2": facePhoto([64, 6, 15.7], 54) };

  const HARNESS = `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/__bundle.js"></script></body></html>`;
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
  const server = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/__harness.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(HARNESS); return; }
    if (p === "/__bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(readFileSync(BUNDLE)); return; }
    const f = join(ROOT, p);
    // ディレクトリ等で readFileSync が投げると応答が返らず接続が詰まるので、ファイル以外は 404
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  // どこで起きたか分かるよう、stack の先頭と、その時に開いたタイル（openTile の正規表現）も残す
  let lastScreen = "";
  page.on("pageerror", (e) => ng.push("pageerror: " + e.message + " @ " + String(e.stack || "").split("\n").slice(1, 3).map((x) => x.trim()).join(" / ")
    + " [画面] " + lastScreen));
  // (6) 結果画像は canvas なので、描いた文字（fillText）と画像（toBlob の直前の canvas）を控える
  await page.addInitScript(() => {
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { (window.__ft = window.__ft || []).push(String(t)); return ft.call(this, t, ...a); };
    const tb = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, ...a) { window.__shareImg = this.toDataURL("image/png"); return tb.call(this, cb, ...a); };
  });
  // 画面の商品カード（リンク https://{site}.jp/items/{id}）の id と、見出しからカードまでの範囲
  const cardIds = (headRe) => page.evaluate((src) => {
    const root = document.querySelector("#colorlab-root");
    const re = new RegExp(src);
    const head = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && re.test(d.textContent.trim()));
    const cards = [...root.querySelectorAll("a[href]")].filter((a) => /\/items\/\d+/.test(a.href));
    const ids = cards.map((a) => +a.href.match(/\/items\/(\d+)/)[1]);
    const els = [head, ...cards].filter(Boolean);
    const top = els.length ? Math.min(...els.map((e) => e.getBoundingClientRect().top)) + scrollY : null;
    const bottom = els.length ? Math.max(...els.map((e) => e.getBoundingClientRect().bottom)) + scrollY : null;
    return { head: head ? head.textContent.trim() : null, ids, top, bottom };
  }, headRe.source);
  // コーデ採点用の合成写真（背景グレー・トップス紺・ボトムス白。SC_REGION の枠に合わせる）
  const outfitPhoto = regionPng(600, 800, [190, 190, 195], [[0.30, 0.26, 0.70, 0.54, [40, 55, 110]], [0.32, 0.56, 0.68, 0.84, [238, 236, 230]]]);
  const shots = [];
  // (6)(d)(7) 用: プロフィールを入れ直して開き直す / ホームのタイル / 画面のタイプボタン / 画面の文字
  const fresh = async (profile) => {
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.evaluate((p) => { try { if (p) localStorage.setItem("colorlab-profile", JSON.stringify(p)); else localStorage.removeItem("colorlab-profile"); } catch (e) {} }, profile || null);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  };
  const openTile = async (re) => { lastScreen = String(re); await page.locator("#colorlab-root button", { hasText: re }).first().click(); await page.waitForTimeout(300); };
  const clickText = async (re) => { await page.locator("#colorlab-root button", { hasText: re }).first().click(); await page.waitForTimeout(200); };
  const rootText = () => page.evaluate(() => document.querySelector("#colorlab-root").innerText);
  // 画面に出ているタイプボタン: 12タイプ名それぞれの個数と、4タイプ名だけのボタンの個数
  const NAMES12 = KEYS.map(([, n]) => n);
  const pickers = (per = 1) => page.evaluate(([names, per]) => {
    const t = [...document.querySelectorAll("#colorlab-root button")].map((b) => b.textContent.trim());
    const cnt = Object.fromEntries(names.map((n) => [n, t.filter((x) => x === n).length]));
    const four = t.filter((x) => ["イエベ春", "ブルベ夏", "イエベ秋", "ブルベ冬"].includes(x)).length;
    return { cnt, four, ok12: names.every((n) => cnt[n] === per) && four === 0 };
  }, [NAMES12, per]);
  const FOUR = /イエベ春|ブルベ夏|イエベ秋|ブルベ冬/, FOUR_G = /イエベ春|ブルベ夏|イエベ秋|ブルベ冬/g;
  // 「2nd ○○」は2位の4タイプを示す既存の表示なので、戻りに数えない
  // 「2nd ○○」「2nd（○○）」（全角かっこ）の両方
  const strip2nd = (t) => t.replace(/2nd[\s（]*(イエベ春|ブルベ夏|イエベ秋|ブルベ冬)/g, "2nd");
  console.log("bundle: " + BUNDLE);

  // (3)(5) 結果画面
  for (const [key, name] of KEYS) {
    const pat = findPattern(key);
    if (!pat && !PHOTO[key]) { check(false, `${key}: 回答パターンも合成写真も無い`); continue; }
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    if (pat) {
      await page.getByRole("button", { name: /質問で診断/ }).first().click();
      for (let i = 0; i < 13; i++) {
        await page.locator("#colorlab-root button").nth(pat.picks[i] === "A" ? 1 : 2).click();
        await page.waitForTimeout(90);
      }
      if (pat.tie) await page.locator("#colorlab-root button").nth(1 + "ABCD".indexOf(pat.tie)).click();
    } else {
      await page.getByRole("button", { name: /^写真で診断/ }).click();
      await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
      const boxes = page.locator("#colorlab-root input[type=checkbox]");
      for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
      await page.getByRole("button", { name: /^地毛に近い$/ }).click();
      await page.getByRole("button", { name: /撮影にすすむ/ }).click();
      await page.getByRole("button", { name: /カメラを起動する/ }).click();
      await page.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
      await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: key + ".png", mimeType: "image/png", buffer: PHOTO[key] });
    }
    await page.waitForFunction(() => /タイプです/.test(document.querySelector("#colorlab-root").textContent), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const root = document.querySelector("#colorlab-root");
      const toHex = (rgb) => {
        const m = String(rgb).match(/\d+/g);
        return m ? "#" + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("").toUpperCase() : "";
      };
      const head = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && /^色別 顔映りチェック（\d+色）$/.test(d.textContent.trim()));
      const sec = head && head.parentElement;
      const rows = [];
      let cur = null;
      if (sec) for (const d of sec.querySelectorAll(":scope > div")) {
        const h = d.querySelector(".flex.items-baseline > span");
        if (h) cur = h.textContent.trim();
        const nm = d.querySelector(".text-\\[11px\\].font-medium.leading-tight");
        if (nm) rows.push([nm.textContent.trim(), cur]);
      }
      const bc = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "まずはこの10色から");
      const grid = bc && bc.nextElementSibling;
      const sw = grid ? [...grid.children].map((c) => toHex(getComputedStyle(c.firstElementChild || c).backgroundColor)) : [];
      const r = sec ? sec.getBoundingClientRect() : null;
      const rb = grid ? grid.getBoundingClientRect() : null;
      return { rows, sw, top: r ? r.top + scrollY : null, bottom: r ? r.bottom + scrollY : null,
        bcTop: rb ? rb.top + scrollY - 40 : null, bcBottom: rb ? rb.bottom + scrollY : null };
    });
    check(info.rows.length === 24, `${key} ${name}: (3) 顔映りチェックが24行 (${info.rows.length})`);
    // (8) 診断結果: 画面に4タイプ名が出ない（「2nd ○○」だけは2位を示す既存の表示なので除く）／2nd Type の商品が12タイプ別
    {
      const rtxt = strip2nd(await rootText());
      const hit4 = [...new Set(rtxt.match(FOUR_G) || [])];
      check(hit4.length === 0, `${key} ${name}: (8) 診断結果に4タイプ名が出ない（2nd表記は除く）${hit4.length ? " (出た: " + hit4.join(",") + ")" : ""}`);
      const rev = REV12[name];
      const nd = await page.evaluate(() => {
        const root = document.querySelector("#colorlab-root");
        const h = [...root.querySelectorAll("h4")].find((e) => e.textContent.trim() === "1stで無難に、2ndで冒険する");
        const box = h && h.parentElement;
        const ids = box ? [...box.querySelectorAll("a[href]")].filter((a) => /\/items\/\d+/.test(a.href)).map((a) => +a.href.match(/\/items\/(\d+)/)[1]) : [];
        const r = box ? box.getBoundingClientRect() : null;
        return { ids, top: r ? r.top + scrollY : null, bottom: r ? r.bottom + scrollY : null };
      });
      const want = (NGP[rev] || []).slice(0, 1).map((s) => s.id);
      check(nd.ids.length === 1 && JSON.stringify(nd.ids) === JSON.stringify(want), `${key} ${name}: (8) 2nd Type の商品が NG_PRODUCTS_12[${rev}] の1点目 (${nd.ids.join(",") || "0点"} / 期待 ${want.join(",")})`);
      const h2 = ngHits(rev, nd.ids);
      check(nd.ids.length > 0 && h2.length === 0, `${key} ${name}: (8) 2nd Type の商品に NG色（${rev}）が無い${h2.length ? " (" + h2.join(" ") + ")" : ""}`);
      if (SHOOT && SHOT6.includes(name) && nd.top != null) {
        const file = join(OUT, `screens12_result2nd_${key}_${name}.png`);
        await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, nd.top - 12), width: 390, height: nd.bottom - nd.top + 24 } });
        shots.push(file);
      }
    }
    const bad = info.rows.filter(([n, r]) => !EXPECT[n] || EXPECT[n][name] !== r);
    check(info.rows.length === 24 && bad.length === 0, `${key} ${name}: (3) 24色の ◎○△✕ が表と一致${bad.length ? " (違う: " + bad.slice(0, 4).map(([n, r]) => `${n}=${r}/期待${EXPECT[n] && EXPECT[n][name]}`).join(" ") + ")" : ""}`);
    const order = info.rows.map(([, r]) => RANK.indexOf(r));
    check(order.every((v, i) => i === 0 || order[i - 1] <= v), `${key} ${name}: (3) ◎→○→△→✕ の順 (${info.rows.map(([, r]) => r).join("")})`);
    const wantOrder = NAMES24.map((n) => [n, EXPECT[n][name]]).sort((x, y) => RANK.indexOf(x[1]) - RANK.indexOf(y[1])).map(([n]) => n);
    check(JSON.stringify(info.rows.map(([n]) => n)) === JSON.stringify(wantOrder), `${key} ${name}: (3) 同じ評価の中は COLOR_CHECK の順`);
    if (name === "ウォームオータム") {
      check(JSON.stringify(info.sw.slice(7)) === JSON.stringify(WA_TAIL), `${key} ${name}: (5) BEST COLOR 10 の8〜10番目 (${info.sw.slice(7).join(" ")})`);
      if (SHOOT && info.bcTop != null) {
        const file = join(OUT, `bestcolor10_${key}_${name}.png`);
        await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, info.bcTop), width: 390, height: info.bcBottom - info.bcTop + 12 } });
        shots.push(file);
      }
    }
    if (SHOOT && info.top != null) {
      const file = join(OUT, `facecheck_${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, info.top - 12), width: 390, height: info.bottom - info.top + 24 } });
      shots.push(file);
    }
    // (6) 結果画像（保存・シェア）の「似合うアイテム」
    await page.evaluate(() => { window.__ft = []; window.__shareImg = null; });
    await page.getByRole("button", { name: /結果を画像で保存・シェア/ }).first().click();
    await page.waitForFunction(() => window.__shareImg, null, { timeout: 10000 }).catch(() => {});
    const share = await page.evaluate(() => ({ ft: window.__ft || [], img: window.__shareImg }));
    const hi = share.ft.indexOf("似合うアイテム");
    const lines = hi < 0 ? [] : share.ft.slice(hi + 1).filter((t) => t.startsWith("・") && !t.endsWith("（コスメ）"));
    put6(name, "share", lines);
    if (SHOOT && SHOT6.includes(name) && share.img) {
      const file = join(OUT, `products_share_${key}_${name}.png`);
      writeFileSync(file, Buffer.from(share.img.split(",")[1], "base64"));
      shots.push(file);
    }
  }

  // (4) チェッカー（未診断 → 12タイプのボタン → 24色を1つずつタップ）
  for (const [key, name] of KEYS) {
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    const tile = page.locator("#colorlab-root button", { hasText: /この色、似合う？/ });
    if (!(await tile.count())) { check(false, `${key} ${name}: (4) チェッカーの入口が無い`); continue; }
    await tile.first().click();
    await page.waitForTimeout(300);
    const btn = page.locator("#colorlab-root button", { hasText: new RegExp("^" + name + "$") });
    if (!(await btn.count())) { check(false, `${key} ${name}: (4) チェッカーに「${name}」のボタンが無い`); continue; }
    await btn.first().click();
    await page.waitForTimeout(200);
    const miss = [];
    for (const nm of NAMES24) {
      await page.locator(`#colorlab-root button[title="${nm}"]`).first().click();
      const got = await page.evaluate(() => {
        const d = document.querySelector("#colorlab-root .text-lg.font-serif");
        return d ? d.textContent.trim().slice(0, 1) : "";
      });
      if (got !== EXPECT[nm][name]) miss.push(`${nm}=${got || "なし"}/期待${EXPECT[nm][name]}`);
    }
    check(miss.length === 0, `${key} ${name}: (4) チェッカーの24色の判定が表と一致${miss.length ? " (違う: " + miss.slice(0, 4).join(" ") + ")" : ""}`);
    const txt = await page.evaluate(() => document.querySelector("#colorlab-root").innerText);
    check(txt.includes(`${name}との相性を判定します`), `${key} ${name}: (4) チェッカーの説明が12タイプ名`);
    // (6) チェッカーの商品（最後にタップしたブラックの判定の下）
    const ck = await cardIds(/^(得意色で買い替えるならコレ|この色と好相性の得意色アイテム)（/);
    put6(name, "checker", ck.ids);
    if (SHOOT && SHOT6.includes(name) && ck.top != null) {
      const file = join(OUT, `products_checker_${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, ck.top - 12), width: 390, height: ck.bottom - ck.top + 24 } });
      shots.push(file);
    }
    if (SHOOT && key === "4-3") {
      const file = join(OUT, `checker_${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
    }
    // (6) 今日のコーデ採点（チェッカーで選んだ12タイプがプロフィールに残っている状態で、合成写真を採点）
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.locator("#colorlab-root button", { hasText: /今日のコーデ採点/ }).first().click();
    await page.waitForTimeout(300);
    await page.locator("#colorlab-root input[type=file]").last().setInputFiles({ name: "outfit.png", mimeType: "image/png", buffer: outfitPhoto });
    const scored = await page.waitForSelector("#colorlab-root >> text=この採点は服の色とタイプの相性のみ", { timeout: 15000 }).then(() => true).catch(() => false);
    check(scored, `${key} ${name}: (6) コーデ採点の結果が出る`);
    const sc = await cardIds(/^スコアを底上げする.+の得意色アイテム$/);
    check(sc.head === `スコアを底上げする${name}の得意色アイテム`, `${key} ${name}: (6) コーデ採点の見出しが12タイプ名 (${sc.head})`);
    put6(name, "score", sc.ids);
    if (SHOOT && SHOT6.includes(name) && sc.top != null) {
      const file = join(OUT, `products_score_${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, sc.top - 12), width: 390, height: sc.bottom - sc.top + 24 } });
      shots.push(file);
    }
  }

  // (6)(d) 12タイプ名が無い時（プロフィールに1位だけ・2位なし）: v1.22.14 作業②からコーデ採点の入口は12タイプのボタン。
  //   採点に進めず、商品欄も4タイプ名も出ない
  {
    await fresh({ myType: "summer", mySecond: null, myFrame: null });
    await openTile(/今日のコーデ採点/);
    const pk = await pickers();
    const sc = await cardIds(/^スコアを底上げする/);
    const txt = strip2nd(await rootText());
    check(pk.ok12 && sc.head === null && sc.ids.length === 0 && !FOUR.test(txt),
      `(6)(d) 12タイプ名が無い時、コーデ採点は12タイプの入口を出し、商品欄・4タイプ名は出ない (12ボタン ${pk.ok12 ? "あり" : "なし"} / 4タイプボタン ${pk.four}個 / 見出し ${sc.head} / 商品 ${sc.ids.join(",") || "0点"} / 4タイプ名 ${(txt.match(FOUR_G) || []).join(",") || "なし"})`);
  }

  // (6)(a)(b)(c)
  for (const [key, name] of KEYS) {
    const want = (NGP[name] || []).map((s) => s.id);
    const g = got6[name] || {};
    for (const place of ["checker", "score"]) {
      const ids = g[place] || [];
      check(JSON.stringify(ids) === JSON.stringify(want), `${key} ${name}: (6)(a) ${place} の商品が NG_PRODUCTS_12 と一致 (${ids.join(",") || "0点"} / 期待 ${want.join(",")})`);
      const hit = ngHits(name, ids);
      check(ids.length > 0 && hit.length === 0, `${key} ${name}: (6)(b) ${place} に NG色の商品が出ない${hit.length ? " (" + hit.join(" ") + ")" : ""}`);
    }
    const lines = g.share || [];
    const wantLines = (NGP[name] || []).map(shareLine);
    check(JSON.stringify(lines) === JSON.stringify(wantLines), `${key} ${name}: (6)(a) 結果画像の商品が NG_PRODUCTS_12 と一致 (${lines.join(" ") || "0点"})`);
    // 結果画像は id を描かないので、行が一致した商品の id で NG色を見る
    const shareIds = (NGP[name] || []).filter((s) => lines.includes(shareLine(s))).map((s) => s.id);
    const hit = ngHits(name, shareIds);
    check(shareIds.length > 0 && hit.length === 0, `${key} ${name}: (6)(b) 結果画像に NG色の商品が出ない${hit.length ? " (" + hit.join(" ") + ")" : ""}`);
  }
  for (const place of ["checker", "score", "share"]) {
    const a = (got6["ブライトサマー"] || {})[place] || [], b = (got6["ソフトサマー"] || {})[place] || [];
    check(a.length > 0 && b.length > 0 && JSON.stringify(a) !== JSON.stringify(b), `(6)(c) ${place}: ブライトサマーとソフトサマーで商品が違う (${a.join(",")} / ${b.join(",")})`);
  }

  // (7) 5画面の入口を12タイプに（未診断で入る → 12タイプのボタンで選ぶ → 見出し・本文が12タイプ名）
  //   (a) 入口に12タイプのボタンが12個（相性配色は2人分で各2個）・4タイプのボタンは0個
  //   (b) 選んだ12タイプ名が見出し・本文に出る  (c) 画面全体に4タイプ名（イエベ春/ブルベ夏/イエベ秋/ブルベ冬）が出ない（除外なし）
  const shot7 = async (screen, key, name) => {
    if (!SHOOT || !SHOT6.includes(name)) return;
    const file = join(OUT, `screens12_${screen}_${key}_${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    shots.push(file);
  };
  const SCREENS = {
    // 今日なに着る？（コーデ提案）
    stylist: { tile: /パーソナルカラー別コーデ提案/, run: async (name) => {
      await clickText(/にコーデを提案してもらう/);
      await page.waitForSelector("#colorlab-root >> text=の服をもっと見る", { timeout: 10000 }).catch(() => {});
      const t = await rootText();
      return [[`${name}の服をもっと見る`, t.includes(`${name}の服をもっと見る →`)], [`${name}の勝ち色は`, !t.includes("の勝ち色は") || t.includes(`${name}の勝ち色は`)]];
    } },
    // ふたりの相性配色（相手は KEYS の次のタイプ）
    pair: { tile: /ふたりの相性配色/, per: 2, run: async (name, partner) => {
      await page.locator("#colorlab-root button", { hasText: new RegExp("^" + partner + "$") }).nth(1).click();
      await page.waitForTimeout(200);
      const t = await rootText();
      return [[`${name} × ${partner}`, t.includes(`${name} × ${partner}`)], [`${name}のあなたに似合うコーデ一式`, t.includes(`${name}のあなたに似合うコーデ一式`)], [`${name}の服をもっと見る`, t.includes(`${name}の服をもっと見る →`)]];
    } },
    // 骨格診断（8問に答えた結果の画面で選ぶ）
    frame: { tile: /^骨格診断/, before: async () => {
      for (let i = 0; i < 12; i++) {
        if ((await rootText()).includes("注意したいデザイン")) break;
        await page.locator("#colorlab-root button.w-full.text-left").first().click();
        await page.waitForTimeout(120);
      }
    }, run: async (name) => {
      const t = await rootText();
      return [[`${name}×骨格…のあなたに似合う服はコレ！`, new RegExp(name + "×骨格.+のあなたに似合う服はコレ！").test(t)], [`${name}のおすすめコスメを見る`, t.includes(`${name}のおすすめコスメを見る →`)]];
    } },
    // 今季の買い足しワードローブ（STEP1〜3 → 提案）
    wardrobe: { tile: /買い足しワードローブ/, run: async (name) => {
      const t0 = await rootText();
      await clickText(/^通勤・仕事$/); await clickText(/^次へ →$/); await clickText(/^次へ →$/);
      await clickText(/コーデがワンパターン/); await clickText(/^提案を見る →$/);
      const t = await rootText();
      return [[`入口のタイプ表示 ${name}`, t0.includes(name)], [`${name}の…服をもっと見る`, new RegExp(name + "の.{1,4}服をもっと見る").test(t)]];
    } },
    // 今日のコーデ採点（合成写真で採点）
    score: { tile: /今日のコーデ採点/, run: async (name) => {
      const t0 = await rootText();
      await page.locator("#colorlab-root input[type=file]").last().setInputFiles({ name: "outfit.png", mimeType: "image/png", buffer: outfitPhoto });
      await page.waitForSelector("#colorlab-root >> text=この採点は服の色とタイプの相性のみ", { timeout: 15000 }).catch(() => {});
      const t = await rootText();
      return [[`測って${name}との色の相性`, t0.includes(`測って${name}との色の相性`)], [`${name}との色の相性スコア`, t.includes(`${name}との色の相性スコア`)], [`スコアを底上げする${name}の得意色アイテム`, t.includes(`スコアを底上げする${name}の得意色アイテム`)]];
    } },
  };
  for (const [screen, S] of Object.entries(SCREENS)) {
    for (const [i, [key, name]] of KEYS.entries()) {
      const partner = KEYS[(i + 1) % KEYS.length][1];
      await fresh(null);
      await openTile(S.tile);
      if (S.before) await S.before();
      const pk = await pickers(S.per || 1);
      const entryTxt = await rootText(); // (7)(c) は画面全体・除外なし
      check(pk.ok12, `${key} ${name}: (7)(a) ${screen} の入口に12タイプのボタン${S.per ? "（2人分）" : ""}・4タイプのボタン0個 (4タイプ ${pk.four}個 / 12タイプ ${Object.values(pk.cnt).join("")})`);
      if (SHOOT && i === 0) {
        const file = join(OUT, `screens12_${screen}_entry.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
      }
      const btn = page.locator("#colorlab-root button", { hasText: new RegExp("^" + name + "$") });
      if (!pk.ok12 || !(await btn.count())) { check(false, `${key} ${name}: (7)(b) ${screen} で「${name}」を選べない`); continue; }
      await btn.first().click();
      await page.waitForTimeout(250);
      const res = await S.run(name, partner);
      const miss = res.filter(([, ok]) => !ok).map(([l]) => l);
      check(miss.length === 0, `${key} ${name}: (7)(b) ${screen} の見出し・本文が12タイプ名${miss.length ? " (出ない: " + miss.join(" / ") + ")" : ""}`);
      const txt = await rootText();
      const back = [...new Set([...(entryTxt.match(FOUR_G) || []), ...(txt.match(FOUR_G) || [])])];
      check(back.length === 0, `${key} ${name}: (7)(c) ${screen} に4タイプ名が出ない${back.length ? " (出た: " + back.join(",") + ")" : ""}`);
      await shot7(screen, key, name);
    }
  }

  // (8) v1.22.14 A・B・C: 12タイプ × 全画面で4タイプ名0件・色で決める商品が NG_PRODUCTS_12 と一致・NG色の商品が出ない
  //   画面: ホーム（今日の1点）・おすすめコスメ・おすすめ髪色・リップ/髪色の試し塗り・ふたりの相性配色（商品）・骨格診断→コスメ・
  //   NGカラー診断・この色、似合う？（診断結果と 2nd Type の商品は (3) のループで見ている）
  //   ホームは「2nd ○○ で覚えています」（2位を示す既存の表示）だけ除く。ほかの画面は除外なし
  const shot8 = async (screen, key, name) => {
    if (!SHOOT || !SHOT6.includes(name)) return;
    const file = join(OUT, `screens12_${screen}_${key}_${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    shots.push(file);
  };
  const four = (t) => [...new Set(t.match(FOUR_G) || [])];
  for (const [i, [key, name]] of KEYS.entries()) {
    const partner = KEYS[(i + 1) % KEYS.length][1];
    const want = (NGP[name] || []).map((s) => s.id);
    // ホーム（プロフィールに12タイプ）: 4タイプ名なし・今日の1点が NG_PRODUCTS_12 のどれか
    await fresh(PROFILE12[name]);
    {
      const t = strip2nd(await rootText());
      check(four(t).length === 0 && t.includes(`おかえりなさい、${name}さん`), `${key} ${name}: (8) ホームに4タイプ名が出ない・おかえりなさいが12タイプ名${four(t).length ? " (出た: " + four(t).join(",") + ")" : ""}`);
      const lk = await page.evaluate(() => {
        const a = [...document.querySelectorAll("#colorlab-root a[href]")].find((e) => e.textContent.trim().startsWith("今日の1点："));
        return a && /\/items\/(\d+)/.test(a.href) ? +a.href.match(/\/items\/(\d+)/)[1] : null;
      });
      check(lk != null && want.includes(lk) && ngHits(name, [lk]).length === 0, `${key} ${name}: (8) 今日の1点が NG_PRODUCTS_12 の商品で NG色なし (${lk} / 候補 ${want.join(",")}${lk != null && ngHits(name, [lk]).length ? " / " + ngHits(name, [lk]).join(" ") : ""})`);
      await shot8("home", key, name);
    }
    // NGカラー診断・この色、似合う？（プロフィールに12タイプ）: 4タイプ名なし
    for (const [scr, tile] of [["ngcolor", /NGカラー診断/], ["checker", /この色、似合う？/]]) {
      await fresh(PROFILE12[name]);
      await openTile(tile);
      const t = await rootText();
      check(four(t).length === 0, `${key} ${name}: (8) ${scr} に4タイプ名が出ない${four(t).length ? " (出た: " + four(t).join(",") + ")" : ""}`);
    }
    // おすすめコスメ・おすすめ髪色・試し塗り（未診断 → 12タイプのボタンで選ぶ）
    const SC8 = {
      cosme: { tile: /おすすめコスメ/, run: async () => {
        const t1 = await rootText();
        await clickText(/^一式セット$/);
        const t2 = await rootText();
        return { t: t1 + "\n" + t2, need: [`${name}に似合うコスメはコレ！`, `${name}の肌と調和する`, `${name} フルメイク一式`] };
      } },
      hair: { tile: /おすすめ髪色/, run: async () => ({ t: await rootText(), need: [`${name}に似合う髪色はコレ！`, `${name}におすすめ`] }) },
      tryon: { tile: /リップ・髪色 試し塗り/, run: async () => ({ t: await rootText(), need: [`指でなぞると${name}に似合う色が重なります`] }) },
    };
    for (const [scr, S] of Object.entries(SC8)) {
      await fresh(null);
      await openTile(S.tile);
      const pk = await pickers();
      const t0 = await rootText();
      check(pk.ok12, `${key} ${name}: (8) ${scr} の入口に12タイプのボタン・4タイプのボタン0個 (4タイプ ${pk.four}個)`);
      if (SHOOT && i === 0) {
        const file = join(OUT, `screens12_${scr}_entry.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
      }
      const btn = page.locator("#colorlab-root button", { hasText: new RegExp("^" + name + "$") });
      if (!pk.ok12 || !(await btn.count())) { check(false, `${key} ${name}: (8) ${scr} で「${name}」を選べない`); continue; }
      await btn.first().click();
      await page.waitForTimeout(250);
      await shot8(scr, key, name);
      const r = await S.run();
      const miss = r.need.filter((x) => !r.t.includes(x));
      check(miss.length === 0, `${key} ${name}: (8) ${scr} の見出し・本文が12タイプ名${miss.length ? " (出ない: " + miss.join(" / ") + ")" : ""}`);
      const b4 = four(t0 + "\n" + r.t);
      check(b4.length === 0, `${key} ${name}: (8) ${scr} に4タイプ名が出ない${b4.length ? " (出た: " + b4.join(",") + ")" : ""}`);
    }
    // ふたりの相性配色の商品: 「あなた」の12タイプ名の NG_PRODUCTS_12
    {
      await fresh(null);
      await openTile(/ふたりの相性配色/);
      const pa = page.locator("#colorlab-root button", { hasText: new RegExp("^" + name + "$") });
      const pb = page.locator("#colorlab-root button", { hasText: new RegExp("^" + partner + "$") });
      if ((await pa.count()) < 1 || (await pb.count()) < 2) { check(false, `${key} ${name}: (8) 相性配色で12タイプを選べない`); continue; }
      await pa.first().click();
      await pb.nth(1).click();
      await page.waitForTimeout(200);
      const pc = await cardIds(/のあなたに似合うコーデ一式$/);
      check(JSON.stringify(pc.ids) === JSON.stringify(want), `${key} ${name}: (8) 相性配色の商品が NG_PRODUCTS_12 と一致 (${pc.ids.join(",") || "0点"} / 期待 ${want.join(",")})`);
      const h = ngHits(name, pc.ids);
      check(pc.ids.length > 0 && h.length === 0, `${key} ${name}: (8) 相性配色の商品に NG色が無い${h.length ? " (" + h.join(" ") + ")" : ""}`);
      if (SHOOT && SHOT6.includes(name) && pc.top != null) {
        const file = join(OUT, `screens12_pairitems_${key}_${name}.png`);
        await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, pc.top - 12), width: 390, height: pc.bottom - pc.top + 24 } });
        shots.push(file);
      }
    }
    // 骨格診断 → 「〇〇のおすすめコスメを見る」→ コスメ画面が12タイプ名
    {
      await fresh(PROFILE12[name]);
      await openTile(/^骨格診断/);
      for (let q = 0; q < 12; q++) {
        if ((await rootText()).includes("注意したいデザイン")) break;
        await page.locator("#colorlab-root button.w-full.text-left").first().click();
        await page.waitForTimeout(120);
      }
      const go = page.locator("#colorlab-root button", { hasText: new RegExp("^" + name + "のおすすめコスメを見る →$") });
      const has = await go.count();
      check(has > 0, `${key} ${name}: (8) 骨格診断のコスメへの導線が「${name}のおすすめコスメを見る →」`);
      if (has) {
        await go.first().click();
        await page.waitForTimeout(250);
        const t = await rootText();
        check(t.includes(`${name}に似合うコスメはコレ！`) && four(t).length === 0, `${key} ${name}: (8) 骨格診断から入ったコスメ画面が12タイプ名・4タイプ名なし${four(t).length ? " (出た: " + four(t).join(",") + ")" : ""}`);
        await shot8("frame2cosme", key, name);
      }
    }
  }
  await browser.close();
  server.close();
  if (shots.length) { console.log("\nスクリーンショット:"); shots.forEach((f) => console.log("  " + f)); }
}

console.log(`\nPASS ${ok.length} / FAIL ${ng.length}`);
ng.forEach((l) => console.log("  FAIL " + l));
if (process.env.VERBOSE) ok.forEach((l) => console.log("  ok   " + l));
process.exit(ng.length ? 1 : 0);
