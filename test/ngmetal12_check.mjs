// NG色（苦手な色）と金属を12タイプ別にした（v1.22.12）ことを実測する（2026-10-23）。
//   (1) src の NG_COLORS_12 が12タイプ×4色=48件で、下の EXPECT_NG と一致する。各 alt の hex が
//       そのタイプの BEST COLOR 10（下の PALETTE）に含まれる。TYPE12_NAME（1位-2位→12タイプ名）の12通り全部で4色引ける
//   (2) src の METAL_12 が下の EXPECT_METAL と一致する。ディープウィンターのシルバーが○、ブルベ6タイプのシルバーが△以上
//   (3) 結果画面（12通り）の「苦手な色（顔まわりでは注意）」に、そのタイプの4色が順に出る
//   (4) 結果画面の「アクセサリーの金属」で ゴールド/シルバーの評価・パールの白みの名前・得意/避けたい の1行が表と一致する
//   (5) 診断後の「NGカラー診断」画面に、12タイプ名と4色（置き換え色つき）が出る
//   (6) 未診断で「NGカラー診断」を開くと12タイプのボタン（12個）が出て、押すとそのタイプの4色が出る
//   (4) にはパールの丸の色（PEARL_TONE・12タイプ別の見本色）も含む
//   (7) v1.22.13: NGカラー診断「置き換えカラーの服はコレ」の商品を12タイプ別に（12画面を実測）
//       (a) 12タイプで商品の組み合わせが重複しない（同じ商品を2つのタイプで使わない）
//       (b) そのタイプの NG色4色に当たる色の商品が出ない（判定は下の NG_WORDS・keisuke 承認の表。商品の色はタグ CSV の color 列）
//       ほかに、タグ CSV でそのタイプが付いている・商品マスタで stock==true かつ hide!=true・顔まわりの服・
//       並びが display の小さい順→item_id の大きい順・点数（3点。ウォームスプリングは候補2点なので2点）も見る
//   (5)(6) では NGカラー診断の商品セクション（「○○の得意色だけで作った…」「○○の服をもっと見る」）が12タイプ名で、
//          画面に4タイプ名（イエベ春/イエベ秋/ブルベ夏/ブルベ冬）が無いことも見る
// 期待値はこのファイルに直接書く（src から読まない。読むと src が壊れても一致してしまう）。
// 実行: npm run build:colorlab && node test/ngmetal12_check.mjs [バンドル] [--src ファイル] [--static-only]
//   バンドル省略時は dist/colorlab.iife.js。スクリーンショットはバンドル省略時だけ out/ngmetal12/ に撮る。
// ネガティブテスト: v1.22.11 の src / バンドル、または NG_COLORS_12 から1タイプ消した src を渡すと FAIL（exit 1）になること。
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync, statSync } from "fs";
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
const OUT = resolve(ROOT, "out", "ngmetal12");
if (SHOOT) mkdirSync(OUT, { recursive: true });

// ── (7) 商品の判定に使う元データ（Downloads の CSV。build_ng_products12.py と同じもの） ──
const DL = "C:/Users/newfa/Downloads";
const TAG_CSV = { blubel: join(DL, "blubel_pc12_tags_v1.csv"), iebel: join(DL, "iebel_pc12_tags_v1.csv") };
const ITEM_CSV = { blubel: join(DL, "item_blubel (8).csv"), iebel: join(DL, "item_iebel (7).csv") };
const TYPE_ALIAS = { "ライトサマー": "ブライトサマー", "クリアウィンター": "ブライトウィンター" };
const FACE_CATS = ["1", "3", "4", "9"];
const EXPECT_PICKS = { "ウォームスプリング": 2 }; // ほかは3点
// NG色名 → 商品の色名にこの語（正規表現）が含まれていたら NG（2026-10-23 keisuke 承認の表）
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
const csvById = {};
const loadSite = (site) => {
  if (csvById[site]) return csvById[site];
  const tag = Object.fromEntries(parseCsv(readFileSync(TAG_CSV[site], "utf-8")).map((r) => [r.item_id, r]));
  const item = Object.fromEntries(parseCsv(readFileSync(ITEM_CSV[site], "utf-8")).map((r) => [r.item_id, r]));
  return (csvById[site] = { tag, item });
};

// [1位-2位, 12タイプ名]
const KEYS = [
  ["2-1", "ブライトサマー"], ["2-3", "ソフトサマー"], ["2-4", "クールサマー"],
  ["4-3", "ディープウィンター"], ["4-2", "クールウィンター"], ["4-1", "ブライトウィンター"],
  ["1-2", "ライトスプリング"], ["1-4", "ブライトスプリング"], ["1-3", "ウォームスプリング"],
  ["3-1", "ウォームオータム"], ["3-2", "ソフトオータム"], ["3-4", "ディープオータム"],
];
const BLUBE = ["ブライトサマー", "ソフトサマー", "クールサマー", "ディープウィンター", "クールウィンター", "ブライトウィンター"];
// NG色 [名前, hex, 置き換え色の名前, 置き換え色の hex]（NG_COLORS_12TYPES_v1_20261023.md のまま）
const EXPECT_NG = {
  "ブライトサマー": [["真っ黒", "#141414", "スカイブルー", "#98CEF2"], ["マスタード", "#C89B3C", "レモンクリーム", "#FEF898"], ["ダークブラウン", "#4A3326", "ブルーグレー", "#D2D9E1"], ["カーキ", "#6B6B4A", "ミントグリーン", "#73D6BA"]],
  "ソフトサマー": [["ビビッドオレンジ", "#E8722A", "ダスティピンク", "#CD8DA5"], ["真っ黒", "#141414", "ダークネイビー", "#323558"], ["ビビッドレッド", "#D01C28", "ダスティローズ", "#A16F7B"], ["ブライトイエロー", "#F5D000", "ペールイエロー", "#FAF399"]],
  "クールサマー": [["オレンジ", "#E8722A", "ベビーピンク", "#F9ADD3"], ["マスタード", "#C89B3C", "ライトブルー", "#71B3E3"], ["テラコッタ", "#A8543A", "ベリー", "#A7194B"], ["カーキ", "#6B6B4A", "エメラルドグリーン", "#47B68B"]],
  "ディープウィンター": [["パステルピンク", "#F7D7DD", "ディープマゼンタ", "#990C50"], ["ベビーブルー", "#BFD7EC", "ロイヤルネイビー", "#011971"], ["ミントグリーン", "#BFE5D3", "フォレストグリーン", "#345F55"], ["くすみベージュ", "#C4AE97", "チャコール", "#383836"]],
  "クールウィンター": [["オレンジブラウン", "#A8663A", "ラズベリーピンク", "#C53F72"], ["マスタード", "#C89B3C", "レモンイエロー", "#FDE755"], ["モスグリーン", "#5F6B3F", "ティールグリーン", "#1E9A82"], ["ベージュ", "#D9C4A3", "ホワイト", "#FDFDFB"]],
  "ブライトウィンター": [["くすみベージュ", "#C4AE97", "ホワイト", "#FDFDFD"], ["モスグリーン", "#5F6B3F", "ライムグリーン", "#83DD3D"], ["ダスティピンク", "#CD8DA5", "ビビッドレッド", "#E30037"], ["グレージュ", "#B7ACA6", "ビビッドブルー", "#0815BB"]],
  "ライトスプリング": [["真っ黒", "#141414", "ライトイエロー", "#F0F2BF"], ["ダークネイビー", "#1E2A44", "アクアブルー", "#AED2D8"], ["ボルドー", "#5A1A2B", "ピーチピンク", "#EAB7B9"], ["チャコールグレー", "#4A4A50", "ミントグリーン", "#BADAC4"]],
  "ブライトスプリング": [["くすみグレー", "#8C8C93", "グリーン", "#78B664"], ["ダスティローズ", "#A16F7B", "ローズピンク", "#C53F83"], ["カーキ", "#6B6B4A", "ライムグリーン", "#B0CC5A"], ["真っ黒", "#141414", "ターコイズ", "#4B9BB7"]],
  "ウォームスプリング": [["青みピンク", "#E8A9C0", "サーモンピンク", "#D1766F"], ["ネイビー", "#1E2A44", "ミントターコイズ", "#6AB3AB"], ["ライトグレー", "#C9C9CE", "ベージュ", "#DBB891"], ["真っ黒", "#141414", "ダークブラウン", "#763E29"]],
  "ウォームオータム": [["青みピンク", "#E86FA8", "サーモンピンク", "#E59A95"], ["ビビッドブルー", "#1F5BD6", "ディープネイビー", "#244564"], ["純白", "#FFFFFF", "ベージュ", "#E8B49C"], ["ライトグレー", "#C9C9CE", "サンドオレンジ", "#E8B87F"]],
  "ソフトオータム": [["ビビッドピンク", "#D6337F", "ダスティローズ", "#B3696B"], ["真っ黒", "#141414", "ブラウンローズ", "#86605C"], ["ビビッドブルー", "#1F5BD6", "ブルーグレー", "#8493B4"], ["ブライトイエロー", "#F5D000", "ペールイエロー", "#ECE392"]],
  "ディープオータム": [["純白", "#FFFFFF", "ゴールド", "#CAA744"], ["ミントグリーン", "#9FD9C3", "オリーブ", "#656742"], ["ビビッドピンク", "#D6337F", "プラム", "#65284A"], ["ラベンダー", "#C9B8D8", "ディープブルー", "#234563"]],
};
// BEST COLOR 10（test/result12_check.mjs の EXPECT と同じ値）
const PALETTE = {
  "ブライトサマー": ["#FECFD9", "#D698C1", "#ACCEF1", "#FEFFDB", "#FEF898", "#FDD4F2", "#B4B2D9", "#98CEF2", "#73D6BA", "#D2D9E1"],
  "ソフトサマー": ["#A16F7B", "#709D89", "#A2A7CF", "#FAF399", "#A6A2A3", "#CD8DA5", "#A1BBB8", "#CAA9C6", "#F3DD87", "#323558"],
  "クールサマー": ["#FFD2D9", "#F6F17B", "#71B3E3", "#DC4647", "#080240", "#F9ADD3", "#47B68B", "#0D43C9", "#A7194B", "#FDFFE7"],
  "ディープウィンター": ["#990C50", "#6B016D", "#F6E073", "#989701", "#383836", "#55072E", "#011971", "#3B4374", "#345F55", "#010101"],
  "クールウィンター": ["#EEB6CF", "#C53F72", "#34A9DE", "#334A9A", "#000000", "#FDE755", "#1E9A82", "#13749E", "#7E4B86", "#FDFDFB"],
  "ブライトウィンター": ["#E7DDFF", "#3DCFFE", "#F9FE02", "#E30037", "#FDFDFD", "#FEE4FF", "#0815BB", "#83DD3D", "#E92BE3", "#000000"],
  "ライトスプリング": ["#ECC6D9", "#EAB7B9", "#D48473", "#E4D594", "#F0F2BF", "#DCE2AC", "#BADAC4", "#D3E9EE", "#AED2D8", "#A1CBCB"],
  "ブライトスプリング": ["#C53F83", "#C45D51", "#D36D3D", "#ECDF5E", "#D7CF83", "#B0CC5A", "#78B664", "#77BEC0", "#4B9BB7", "#6BA5B4"],
  "ウォームスプリング": ["#EBC051", "#D1766F", "#D6EA95", "#CF7250", "#568C5F", "#516D36", "#1F3F54", "#6AB3AB", "#763E29", "#DBB891"],
  "ソフトオータム": ["#F8D8D7", "#ECE392", "#C3918F", "#BFC3A6", "#B3696B", "#4B7173", "#7B5973", "#86605C", "#8493B4", "#E3DACB"],
  "ディープオータム": ["#9F563D", "#CAA744", "#71292D", "#D07150", "#656742", "#65284A", "#3B6A7E", "#234563", "#523224", "#000328"],
  "ウォームオータム": ["#E59A95", "#E8B87F", "#DE824B", "#AC4234", "#497849", "#37143A", "#4D2F22", "#244564", "#6BB2AC", "#E8B49C"],
};
// 金属（CC_v1_22_12_NG_METAL_12TYPES.md の METAL_12 のまま）
const EXPECT_METAL = {
  "ブライトサマー":   { silver: "◎", gold: "△", good: "明るいシルバー・ピンクシルバー・ローズゴールド", avoid: "黄みの強いゴールド・くすんだ燻し", pearl: "ピンクパール" },
  "ソフトサマー":     { silver: "◎", gold: "△", good: "マット/ブラッシュドのシルバー・淡いシャンパンゴールド", avoid: "光沢の強すぎるミラー・濃い黄金色", pearl: "オフホワイトパール" },
  "クールサマー":     { silver: "◎", gold: "✕", good: "プラチナ・ホワイトゴールド・青みのシルバー", avoid: "黄みのゴールド全般(顔から離す)", pearl: "ブルーホワイトパール" },
  "ディープウィンター": { silver: "○", gold: "△", good: "ガンメタル・アンティークシルバー・落ち着いたピンクゴールド", avoid: "明るすぎる淡いシャンパン・白っぽいマットな銀", pearl: "ブラックパール・グレーパール" },
  "クールウィンター": { silver: "◎", gold: "△", good: "高輝度プラチナ・ミラーシルバー", avoid: "黄みの濃いゴールド・マットな燻し", pearl: "ピュアホワイトパール" },
  "ブライトウィンター": { silver: "◎", gold: "△", good: "ミラー・クリアな高輝度シルバー・大ぶりで存在感のあるデザイン", avoid: "くすんだ燻し・パステル調の金属", pearl: "ホワイト(高光沢)パール" },
  "ライトスプリング": { silver: "△", gold: "◎", good: "シャンパンゴールド・ライトゴールド・細身で軽い華奢なデザイン", avoid: "重厚なアンティーク・燻したシルバー", pearl: "アイボリーパール" },
  "ブライトスプリング": { silver: "○", gold: "◎", good: "ツヤのあるイエローゴールド・クリアな高輝度シルバー(小ぶり)", avoid: "暗いマットなブロンズ・くすんだ燻し", pearl: "クリームホワイトパール" },
  "ウォームスプリング": { silver: "✕", gold: "◎", good: "イエローゴールド・ブライトゴールド", avoid: "青みの強いシルバー全般(顔から離す)", pearl: "ゴールデンパール" },
  "ウォームオータム": { silver: "✕", gold: "◎", good: "マットゴールド・ブロンズ・銅色・べっ甲との組合せ", avoid: "青白いシルバー・ミラー", pearl: "ベージュパール" },
  "ソフトオータム":   { silver: "△", gold: "◎", good: "サテン/ブラッシュドゴールド・ローズゴールド", avoid: "ギラつく光沢・青白いシルバー", pearl: "シャンパンパール" },
  "ディープオータム": { silver: "○", gold: "◎", good: "アンティークゴールド・ブロンズ・燻しシルバー", avoid: "ツルツルの明るいシルバー・淡いシャンパン", pearl: "ダークグレー・ブラウンパール" },
};
// パールの丸の見本色（2026-10-23 keisuke 指定）
const PEARL_HEX = {
  "ブライトサマー": "#F3E1E6", "ソフトサマー": "#F2EEE6", "クールサマー": "#E6EEF6", "ディープウィンター": "#8E9096",
  "クールウィンター": "#F7F9FC", "ブライトウィンター": "#FBFCFF", "ライトスプリング": "#F6EEDC", "ブライトスプリング": "#F8F0D8",
  "ウォームスプリング": "#EBD8A8", "ウォームオータム": "#E0CFB4", "ソフトオータム": "#EAD9BD", "ディープオータム": "#6E625A",
};
// NGカラー診断の商品セクションに出るサイト名
const SITE_NAME = { "ブライトサマー": "BLUBEL", "ソフトサマー": "BLUBEL", "クールサマー": "BLUBEL", "ディープウィンター": "BLUBEL", "クールウィンター": "BLUBEL", "ブライトウィンター": "BLUBEL", "ライトスプリング": "IEBEL", "ブライトスプリング": "IEBEL", "ウォームスプリング": "IEBEL", "ウォームオータム": "IEBEL", "ソフトオータム": "IEBEL", "ディープオータム": "IEBEL" };
const RANK = ["◎", "○", "△", "✕"];
// 結果画面の金属の枠に出る1行（評価の高い方に good、低い方に avoid）
const metalNote = (m, key) => {
  const hi = RANK.indexOf(m.gold) <= RANK.indexOf(m.silver) ? "gold" : "silver";
  return key === hi ? "得意：" + m.good : "避けたい：" + m.avoid;
};

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

// ── (1)(2) src の表 ──
const src = readFileSync(SRC, "utf-8");
const objAfter = (head) => {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const b = src.indexOf("{", i + head.length - 1);
  const e = src.indexOf("\n};", b);
  try { return new Function("return " + src.slice(b, e + 2))(); } catch (err) { return null; }
};
const NG12 = objAfter("const NG_COLORS_12 = {");
const MT12 = objAfter("const METAL_12 = {");
const T12N = objAfter("const TYPE12_NAME = {");
console.log("src: " + SRC);
check(!!NG12, `(1) src に NG_COLORS_12 がある`);
if (NG12) {
  const n = Object.values(NG12).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  check(Object.keys(NG12).length === 12 && n === 48, `(1) NG_COLORS_12 が12タイプ×4色=48件 (${Object.keys(NG12).length}タイプ / ${n}件)`);
  for (const [, name] of KEYS) {
    const got = (NG12[name] || []).map((c) => [c.name, (c.hex || "").toUpperCase(), c.alt && c.alt.name, ((c.alt && c.alt.hex) || "").toUpperCase()]);
    check(JSON.stringify(got) === JSON.stringify(EXPECT_NG[name]), `(1) ${name}: NG4色が案v1と一致 (${got.map((g) => g[0]).join("・") || "なし"})`);
    const miss = (NG12[name] || []).filter((c) => !PALETTE[name].includes(((c.alt && c.alt.hex) || "").toUpperCase()));
    check((NG12[name] || []).length === 4 && miss.length === 0, `(1) ${name}: alt が全部 BEST COLOR 10 に入っている${miss.length ? " (外: " + miss.map((c) => c.alt.name + c.alt.hex).join(" ") + ")" : ""}`);
    check((NG12[name] || []).every((c) => c.why && c.why.length > 0), `(1) ${name}: 理由（why）が4色とも入っている`);
  }
}
check(!!T12N && Object.keys(T12N).length === 12, `(1) TYPE12_NAME が12通り`);
if (T12N && NG12) {
  const lack = Object.entries(T12N).filter(([, n]) => !(NG12[n] && NG12[n].length === 4));
  check(lack.length === 0, `(1) 1位-2位の12通り全部で NG が4色引ける${lack.length ? " (欠け: " + lack.map(([k, n]) => k + " " + n).join(" / ") + ")" : ""}`);
}
check(!!MT12, `(2) src に METAL_12 がある`);
if (MT12) {
  check(Object.keys(MT12).length === 12, `(2) METAL_12 が12タイプ (${Object.keys(MT12).length})`);
  for (const [, name] of KEYS) check(JSON.stringify(MT12[name]) === JSON.stringify(EXPECT_METAL[name]), `(2) ${name}: METAL_12 が指示書と一致`);
  check(MT12["ディープウィンター"] && MT12["ディープウィンター"].silver === "○", `(2) ディープウィンターのシルバーが○ (${MT12["ディープウィンター"] && MT12["ディープウィンター"].silver})`);
  const bad = BLUBE.filter((n) => !(MT12[n] && RANK.indexOf(MT12[n].silver) >= 0 && RANK.indexOf(MT12[n].silver) <= 2));
  check(bad.length === 0, `(2) ブルベ6タイプのシルバーが△以上${bad.length ? " (外: " + bad.join("・") + ")" : ""}`);
}

// ── (3)(4)(5) 画面 ──
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
  page.on("pageerror", (e) => ng.push("pageerror: " + e.message));
  const shots = [];
  console.log("bundle: " + BUNDLE);

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
      const h2 = [...root.querySelectorAll("h2")].find((h) => /タイプです/.test(h.textContent));
      const ngHead = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "苦手な色（顔まわりでは注意）");
      const ngGrid = ngHead && ngHead.nextElementSibling;
      const ngs = ngGrid ? [...ngGrid.children].map((c) => ({ name: (c.querySelector("span.block") || {}).textContent || "", hex: toHex(getComputedStyle(c.firstElementChild).backgroundColor) })) : [];
      const mHead = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "アクセサリーの金属");
      const mBox = mHead && mHead.parentElement;
      const mGrid = mBox && mBox.querySelector(".grid.grid-cols-3");
      const metals = mGrid ? [...mGrid.children].map((c) => [...c.querySelectorAll("div")].map((d) => d.textContent.trim())) : [];
      const pearlHex = mGrid && mGrid.children[2] ? toHex(getComputedStyle(mGrid.children[2].querySelector("span")).backgroundColor) : "";
      const fav = mBox ? ([...mBox.querySelectorAll("div")].find((d) => d.children.length === 0 && /が得意なあなたに/.test(d.textContent)) || {}).textContent || "" : "";
      return { h2: h2 ? h2.textContent.trim() : "", ngs, metals, fav, pearlHex, top: ngHead ? ngHead.getBoundingClientRect().top + scrollY : null, bottom: mBox ? mBox.getBoundingClientRect().bottom + scrollY : null };
    });
    check(info.h2.includes(`【${name}】`), `${key} ${name}: 結果画面の見出しに12タイプ名 (${info.h2.slice(0, 30)})`);
    const wantNg = EXPECT_NG[name].map(([n, h]) => ({ name: n, hex: h }));
    check(JSON.stringify(info.ngs) === JSON.stringify(wantNg), `${key} ${name}: (3) 苦手な色が4色・名前とHEXが一致 (${info.ngs.map((x) => x.name + x.hex).join(" ") || "なし"})`);
    const em = EXPECT_METAL[name];
    // 枠の中の div: [名前, (白みの名前), 評価, METAL_TIP, (得意/避けたい)]
    const want = [
      ["ゴールド", em.gold, metalNote(em, "gold")],
      ["シルバー", em.silver, metalNote(em, "silver")],
      ["パール", em.pearl, "◎"],
    ];
    const g = info.metals;
    const gotGold = g[0] ? [g[0][0], g[0][1], g[0][3]] : [];
    const gotSilver = g[1] ? [g[1][0], g[1][1], g[1][3]] : [];
    const gotPearl = g[2] ? [g[2][0], g[2][1], g[2][2]] : [];
    check(JSON.stringify(gotGold) === JSON.stringify(want[0]), `${key} ${name}: (4) ゴールド ${gotGold.join(" / ") || "なし"}`);
    check(JSON.stringify(gotSilver) === JSON.stringify(want[1]), `${key} ${name}: (4) シルバー ${gotSilver.join(" / ") || "なし"}`);
    // 「○○が得意なあなたに」: ◎の金属。◎が無いタイプ（ディープウィンター）は評価の高い方
    const favWant = ["gold", "silver"].filter((k) => em[k] === "◎").map((k) => (k === "gold" ? "ゴールド" : "シルバー")).join("・")
      || (RANK.indexOf(em.gold) <= RANK.indexOf(em.silver) ? "ゴールド" : "シルバー");
    check(info.fav.startsWith(favWant + "が得意なあなたに"), `${key} ${name}: (4) 「${favWant}が得意なあなたに」 (${info.fav || "なし"})`);
    check(info.pearlHex === PEARL_HEX[name], `${key} ${name}: (4) パールの丸の色 ${info.pearlHex || "なし"} (期待 ${PEARL_HEX[name]})`);
    check(JSON.stringify(gotPearl) === JSON.stringify(want[2]), `${key} ${name}: (4) パール ${gotPearl.join(" / ") || "なし"}`);

    if (SHOOT && info.top != null && info.bottom != null) {
      const file = join(OUT, `${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, info.top - 12), width: 390, height: info.bottom - info.top + 24 } });
      shots.push(file);
    }

    // (5) 診断後の「NGカラー診断」画面（プロフィールに1位・2位が残っている）
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.getByRole("button", { name: /NGカラー診断/ }).first().click();
    await page.waitForTimeout(300);
    const scr = await page.evaluate(() => {
      const root = document.querySelector("#colorlab-root");
      const h3 = [...root.querySelectorAll("h3")].find((h) => /顔まわりで避けたい色/.test(h.textContent));
      const cards = [...root.querySelectorAll("div.rounded-2xl.p-4.mb-3")].filter((d) => /代わりに/.test(d.textContent));
      const prod = ([...root.querySelectorAll("p")].find((p) => /の得意色だけで作った/.test(p.textContent)) || {}).textContent || "";
      const more = ([...root.querySelectorAll("a")].find((a) => /の服をもっと見る/.test(a.textContent)) || {}).textContent || "";
      const season = root.innerText.match(/イエベ春|イエベ秋|ブルベ夏|ブルベ冬/g) || [];
      return { h3: h3 ? h3.textContent.trim() : "", prod: prod.trim(), more: more.trim(), season, cards: cards.map((c) => [c.querySelector(".text-sm.font-medium")?.textContent.replace(/^✕\s*/, "").trim(), [...c.querySelectorAll("span.text-xs.font-medium")].pop()?.textContent.trim()]) };
    });
    check(scr.h3 === `${name}が顔まわりで避けたい色`, `${key} ${name}: (5) NGカラー診断の見出し (${scr.h3 || "なし"})`);
    const wantCards = EXPECT_NG[name].map(([n, , a]) => [n, a]);
    check(JSON.stringify(scr.cards) === JSON.stringify(wantCards), `${key} ${name}: (5) NGカラー診断の4色と置き換え色 (${scr.cards.map((c) => c.join("→")).join(" / ") || "なし"})`);
    check(scr.prod === `${name}の得意色だけで作った${SITE_NAME[name]}のアイテムです。`, `${key} ${name}: (5) 商品セクションの説明が12タイプ名 (${scr.prod || "なし"})`);
    check(scr.more === `${name}の服をもっと見る →`, `${key} ${name}: (5) 「もっと見る」ボタンが12タイプ名 (${scr.more || "なし"})`);
    check(scr.season.length === 0, `${key} ${name}: (5) NGカラー診断の画面に4タイプ名が無い (${scr.season.join("・") || "0件"})`);
  }

  // (6) 未診断（プロフィール無し）で NGカラー診断 → 12タイプのボタンから選ぶ
  const readNg = () => page.evaluate(() => {
    const root = document.querySelector("#colorlab-root");
    const h3 = [...root.querySelectorAll("h3")].find((h) => /顔まわりで避けたい色/.test(h.textContent));
    const cards = [...root.querySelectorAll("div.rounded-2xl.p-4.mb-3")].filter((d) => /代わりに/.test(d.textContent));
    const prod = ([...root.querySelectorAll("p")].find((p) => /の得意色だけで作った/.test(p.textContent)) || {}).textContent || "";
    const more = ([...root.querySelectorAll("a")].find((a) => /の服をもっと見る/.test(a.textContent)) || {}).textContent || "";
    const season = root.innerText.match(/イエベ春|イエベ秋|ブルベ夏|ブルベ冬/g) || [];
    return { h3: h3 ? h3.textContent.trim() : "", prod: prod.trim(), more: more.trim(), season, cards: cards.map((c) => [c.querySelector(".text-sm.font-medium")?.textContent.replace(/^✕\s*/, "").trim(), [...c.querySelectorAll("span.text-xs.font-medium")].pop()?.textContent.trim()]) };
  });
  const openPicker = async () => {
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.getByRole("button", { name: /NGカラー診断/ }).first().click();
    await page.waitForTimeout(300);
    return page.evaluate((names) => {
      const root = document.querySelector("#colorlab-root");
      return [...root.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => names.includes(t));
    }, KEYS.map(([, n]) => n));
  };
  const btns = await openPicker();
  check(btns.length === 12 && new Set(btns).size === 12, `(6) 未診断の NGカラー診断に12タイプのボタンが12個 (${btns.length}個: ${btns.join("・")})`);
  const ng0 = await readNg();
  check(ng0.cards.length === 0 && !ng0.h3, `(6) タイプを選ぶ前は NG 色を出さない（0件の表示にならない）`);
  if (SHOOT) {
    const file = join(OUT, "ngcolor_picker12.png");
    await page.screenshot({ path: file, fullPage: true });
    shots.push(file);
  }
  const prodByType = {};
  for (const [key, name] of KEYS) {
    await openPicker();
    const btn = page.locator("#colorlab-root button", { hasText: new RegExp("^" + name + "$") });
    if (!(await btn.count())) { check(false, `${key} ${name}: (6) 「${name}」のボタンが無い`); continue; }
    await btn.first().click();
    await page.waitForTimeout(300);
    const r = await readNg();
    // (7) 置き換えカラーの服（カードのリンク https://{site}.jp/items/{id} から商品を特定する）
    const skus = await page.evaluate(() => [...document.querySelectorAll("#colorlab-root a")]
      .filter((a) => /\/items\/\d+/.test(a.href) && /商品を見る/.test(a.textContent))
      .map((a) => ({ site: (a.href.match(/^https:\/\/(\w+)\.jp\//) || [])[1], id: (a.href.match(/\/items\/(\d+)/) || [])[1] })));
    prodByType[name] = skus;
    const site = SITE_NAME[name].toLowerCase();
    const wantN = EXPECT_PICKS[name] || 3;
    check(skus.length === wantN, `${key} ${name}: (7) 置き換えカラーの服が${wantN}点 (${skus.length}点: ${skus.map((x) => x.id).join(",")})`);
    check(skus.every((x) => x.site === site), `${key} ${name}: (7) 商品は${SITE_NAME[name]}のもの (${[...new Set(skus.map((x) => x.site))].join(",")})`);
    const { tag, item } = loadSite(site);
    const ngNames = EXPECT_NG[name].map(([n]) => n);
    const bad = [], keyOf = [];
    for (const x of skus) {
      const t = tag[x.id], m = item[x.id];
      if (!t || !m) { bad.push(`${x.id}:CSVに無い`); continue; }
      const types = t.pc12_types.split("・").map((y) => TYPE_ALIAS[y] || y);
      if (!types.includes(name)) bad.push(`${x.id}:タグに${name}が無い`);
      if (m.stock.trim().toLowerCase() !== "true" || m.hide.trim().toLowerCase() === "true") bad.push(`${x.id}:在庫なし/非表示`);
      if (!FACE_CATS.includes(m.category_id.split(",")[0].trim())) bad.push(`${x.id}:顔まわりの服でない`);
      const colors = t.color.split(",").map((c) => c.trim()).filter(Boolean);
      const hits = ngNames.flatMap((n) => (NG_WORDS[n] || []).flatMap((w) => colors.filter((c) => new RegExp(w).test(c)).map((c) => `${n}<${c}`)));
      check(NG_WORDS && ngNames.every((n) => NG_WORDS[n]) && hits.length === 0, `${key} ${name}: (7b) ${x.id} の色（${colors.join(",")}）が NG色（${ngNames.join("・")}）に当たらない${hits.length ? " ← " + hits.join(" ") : ""}`);
      const d = m.display.trim();
      keyOf.push([/^\d+$/.test(d) ? +d : 9999, -x.id]);
    }
    check(bad.length === 0, `${key} ${name}: (7) タグ・在庫・顔まわりの服の条件 (${bad.join(" ") || "全部OK"})`);
    check(keyOf.every((k, i) => i === 0 || keyOf[i - 1][0] < k[0] || (keyOf[i - 1][0] === k[0] && keyOf[i - 1][1] <= k[1])),
      `${key} ${name}: (7) 並びが display の小さい順→item_id の大きい順 (${keyOf.map(([d, i]) => -i + "/d" + d).join(" ")})`);
    check(r.h3 === `${name}が顔まわりで避けたい色`, `${key} ${name}: (6) ボタンで選んだ NGカラー診断の見出し (${r.h3 || "なし"})`);
    const wantCards = EXPECT_NG[name].map(([n, , a]) => [n, a]);
    check(JSON.stringify(r.cards) === JSON.stringify(wantCards), `${key} ${name}: (6) ボタンで選んだ NGカラー診断の4色と置き換え色 (${r.cards.map((c) => c.join("→")).join(" / ") || "なし"})`);
    check(r.prod === `${name}の得意色だけで作った${SITE_NAME[name]}のアイテムです。`, `${key} ${name}: (6) 商品セクションの説明が12タイプ名 (${r.prod || "なし"})`);
    check(r.more === `${name}の服をもっと見る →`, `${key} ${name}: (6) 「もっと見る」ボタンが12タイプ名 (${r.more || "なし"})`);
    check(r.season.length === 0, `${key} ${name}: (6) NGカラー診断の画面に4タイプ名が無い (${r.season.join("・") || "0件"})`);
    const prof = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}"); } catch (e) { return {}; } });
    const NUM = { spring: 1, summer: 2, autumn: 3, winter: 4 };
    check(`${NUM[prof.myType]}-${NUM[prof.mySecond]}` === key, `${key} ${name}: (6) 選んだタイプが1位-2位でプロフィールに入る (${prof.myType}/${prof.mySecond})`);
    if (SHOOT) {
      const file = join(OUT, `ngcolor_${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
    }
  }
  // (7a) 12タイプで組み合わせが重複しない・同じ商品を2つのタイプで使わない
  const combos = KEYS.map(([, n]) => (prodByType[n] || []).map((x) => x.site + ":" + x.id).sort().join("|"));
  check(Object.keys(prodByType).length === 12 && new Set(combos).size === 12, `(7a) 12タイプで商品の組み合わせが重複しない (${new Set(combos).size}通り)`);
  const all = KEYS.flatMap(([, n]) => (prodByType[n] || []).map((x) => x.site + ":" + x.id));
  const dup = all.filter((x, i) => all.indexOf(x) !== i);
  check(dup.length === 0, `(7a) 同じ商品を2つのタイプで使っていない (重複 ${dup.join(",") || "0件"})`);
  await browser.close();
  server.close();
  if (shots.length) { console.log("\nスクリーンショット:"); shots.forEach((f) => console.log("  " + f)); }
}

console.log(`\nPASS ${ok.length} / FAIL ${ng.length}`);
ng.forEach((l) => console.log("  FAIL " + l));
if (process.env.VERBOSE) ok.forEach((l) => console.log("  ok   " + l));
process.exit(ng.length ? 1 : 0);
