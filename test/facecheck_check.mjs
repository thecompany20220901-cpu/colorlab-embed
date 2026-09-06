// 12タイプ結果画面に足した4つの検証。
//   A案 色別 顔映りチェック表 / B案 ベストカラーTOP6 / C案 苦手な色を着るときのポイント / D案 アクセサリーの金属
//   ・4タイプすべてで表とチップが出る
//   ・24色ぶんの4軸コメントが、Lab から計算した期待値と1件も違わない
//   ・判定は既存の COLOR_CHECK と完全一致（チェッカー画面と食い違わない）
//   ・金属は既存の ΔE 照合どおりに割れる
//   ・既存の結果画面（勝ち色・苦手色・コスメ・おすすめ商品）が壊れていない
// 実行: node test/facecheck_check.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const ART = "file://" + join(__dirname, "local_article.html").replace(/\\/g, "/");
const SRC = join(__dirname, "..", "src", "color_lab_stylist_v23.jsx");

let ng = 0;
const ok = (c, m) => { console.log((c ? "  [PASS] " : "  [FAIL] ") + m); if (!c) ng++; };

// ── 期待値をソースの生データから独立に組み立てる（表示ロジックとは別実装で突き合わせる） ──
const src = readFileSync(SRC, "utf8");
const palette10 = {};
for (const m of src.matchAll(/(spring|summer|autumn|winter): \{ key:.*?palette10: (\[\[.*?\]\]),/gs)) {
  palette10[m[1]] = JSON.parse(m[2].replace(/"/g, "'").replace(/'/g, '"'));
}
const COLOR_CHECK = [];
for (const m of src.matchAll(/\{ name: "([^"]+)", hex: "(#\w{6})", r: \{ spring: "(.)", summer: "(.)", autumn: "(.)", winter: "(.)" \} \}/g)) {
  COLOR_CHECK.push({ name: m[1], hex: m[2], r: { spring: m[3], summer: m[4], autumn: m[5], winter: m[6] } });
}

const lin = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
function lab(hex) {
  const h = hex.replace("#", "");
  const R = lin(parseInt(h.slice(0, 2), 16)), G = lin(parseInt(h.slice(2, 4), 16)), B = lin(parseInt(h.slice(4, 6), 16));
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
const med = (a) => { const v = [...a].sort((p, q) => p - q), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
const refOf = (k) => {
  const labs = palette10[k].map(([, hx]) => lab(hx));
  return { L: med(labs.map((l) => l.L)), C: med(labs.map((l) => Math.hypot(l.a, l.b))), b: med(labs.map((l) => l.b)), labs };
};
const BRIGHT = ["下がる", "やや下がる", "変わらない", "やや上がる", "上がる"];
const SHADOW = ["されない", "弱い", "少し出る", "強調"];
const BLOOD = ["悪い", "やや落ちる", "普通", "良い"];
function expectAxes(hex, k) {
  const l = lab(hex), r = refOf(k);
  const C = Math.hypot(l.a, l.b), dL = l.L - r.L, dC = C - r.C, db = l.b - r.b;
  const bright = BRIGHT[dL < -18 ? 0 : dL < -6 ? 1 : dL < 6 ? 2 : dL < 18 ? 3 : 4];
  const mid = l.L > 25 && l.L < 78, ut = C >= 12 ? Math.abs(db) : 0;
  const dull = (mid && dC <= -22) || ut >= 30 ? "出る" : (mid && dC <= -8) || ut >= 18 ? "やや出る" : "出ない";
  const dk = Math.max(0, -dL);
  const shadow = SHADOW[dk < 8 ? 0 : dk < 18 ? 1 : dk < 30 ? 2 : 3];
  let dW = Infinity;
  for (const p of r.labs) dW = Math.min(dW, Math.sqrt((l.a - p.a) ** 2 + (l.b - p.b) ** 2 + 0.25 * (l.L - p.L) ** 2));
  let i = dW <= 14 ? 3 : dW <= 26 ? 2 : dW <= 38 ? 1 : 0;
  if (l.a >= 25) i = Math.min(3, i + 1); else if (l.a <= -25) i = Math.max(0, i - 1);
  return { bright, dull, shadow, blood: BLOOD[i] };
}
function expectMetal(hex, k) {
  const l = lab(hex), r = refOf(k);
  let d = Infinity;
  for (const p of r.labs) d = Math.min(d, Math.sqrt((l.L - p.L) ** 2 + (l.a - p.a) ** 2 + (l.b - p.b) ** 2));
  return { d, rating: d <= 12 ? "◎" : d <= 22 ? "○" : d <= 40 ? "△" : "✕" };
}
// ── B案の期待値をテスト側で独立に組み立てる ──
const cdata = readFileSync(join(__dirname, "..", "src", "color_data.js"), "utf8");
const FAMILY_ORDER = JSON.parse(cdata.match(/export const FAMILY_ORDER = (\[[\s\S]*?\]);/)[1]);
const COLOR_FAMILIES = JSON.parse(cdata.match(/export const COLOR_FAMILIES = (\{[\s\S]*?\n\});/)[1]);
const SKU_COLORS = JSON.parse(readFileSync(join(__dirname, "..", "src", "sku_color_data.js"), "utf8")
  .match(/export const SKU_COLORS = (\{[\s\S]*\});/)[1]);
const SKUS = {};
{
  const body = src.match(/const SKUS = \{([\s\S]*?)\n\};/)[1];
  let site = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(blubel|iebel):\s*\[/);
    if (m) { site = m[1]; SKUS[site] = []; continue; }
    const g = line.match(/\{ id: (\d+), name: "([^"]+)", price: \d+, cat: "([^"]+)"/);
    if (g) SKUS[site].push({ id: g[1], name: g[2], cat: g[3] });
  }
}
const ALIAS = JSON.parse(src.match(/const MASTER_COLOR_ALIAS = (\{[\s\S]*?\n\};)/)[1]
  .replace(/\/\/[^\n]*/g, "").replace(/,(\s*\})/g, "$1").replace(/\};$/, "}"));

function expectTop6(k) {
  const fam = COLOR_FAMILIES[k] || {};
  const r = refOf(k);
  const all = [];
  for (const f of FAMILY_ORDER) for (const [name, hex, mark] of (fam[f] || [])) {
    const l = lab(hex);
    let d = Infinity;
    for (const p of r.labs) d = Math.min(d, Math.sqrt((l.L - p.L) ** 2 + (l.a - p.a) ** 2 + (l.b - p.b) ** 2));
    all.push({ name, hex, family: f, top: mark === "✓", d });
  }
  all.sort((x, y) => x.d - y.d);
  const picked = [], used = new Set();
  const take = (c) => { picked.push(c); used.add(c.family); };
  all.filter((c) => c.top).forEach((c) => { if (picked.length < 6) take(c); });
  all.filter((c) => !c.top && !used.has(c.family)).forEach((c) => { if (picked.length < 6 && !used.has(c.family)) take(c); });
  all.forEach((c) => { if (picked.length < 6 && !picked.includes(c)) take(c); });
  return picked.slice(0, 6);
}
function expectTop6Skus(site, k) {
  const names = new Set(expectTop6(k).map((c) => c.name));
  return (SKUS[site] || []).filter((sku) => ((SKU_COLORS[site] || {})[sku.id] || [])
    .some((c) => (ALIAS[c] || []).some((n) => names.has(n))));
}
const SITE_OF = { spring: "iebel", autumn: "iebel", summer: "blubel", winter: "blubel" };

const NAME2KEY = { "イエベ春": "spring", "ブルベ夏": "summer", "イエベ秋": "autumn", "ブルベ冬": "winter" };
const PEARL = { spring: "アイボリー", summer: "オフホワイト", autumn: "ベージュパール", winter: "ピュアホワイト" };

const browser = await chromium.launch();

// 質問は A/B の2択。答え方のパターンを変えると通る型が変わる。4タイプ集まるまで総当たりする。
const ANSWER_PATTERNS = [];
for (let c = 0; c <= 12; c++) ANSWER_PATTERNS.push({ label: `先頭${c}問A`, f: (i) => i < c });
ANSWER_PATTERNS.push({ label: "交互A始まり", f: (i) => i % 2 === 0 });
ANSWER_PATTERNS.push({ label: "交互B始まり", f: (i) => i % 2 === 1 });
ANSWER_PATTERNS.push({ label: "3問に1回A", f: (i) => i % 3 === 0 });
ANSWER_PATTERNS.push({ label: "3問に2回A", f: (i) => i % 3 !== 0 });
ANSWER_PATTERNS.push({ label: "2問ごと切替", f: (i) => i % 4 < 2 });
ANSWER_PATTERNS.push({ label: "後半だけA", f: (i) => i >= 6 });

async function runQuizWith(page, wantAAt) {
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.goto(ART, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.getByRole("button", { name: /^質問で診断/ }).click();
  for (let i = 0; i < 40; i++) {
    const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}").myType || null; } catch (e) { return null; } });
    if (saved) return saved;
    const btns = page.locator("#colorlab-root button");
    const n = await btns.count();
    const idx = [];
    for (let b = 0; b < n; b++) {
      const t = (await btns.nth(b).innerText().catch(() => "")).trim();
      if (/^[AB]\b/.test(t) || t === "A" || t === "B") idx.push({ b, t });
    }
    if (!idx.length) { if (n) await btns.first().click().catch(() => {}); await page.waitForTimeout(150); continue; }
    const wantA = wantAAt(i);
    const pick = idx.find((x) => x.t.startsWith(wantA ? "A" : "B")) || idx[0];
    await btns.nth(pick.b).click().catch(() => {});
    await page.waitForTimeout(160);
  }
  return null;
}

// 表・チップの実測値を取る
const readResult = (page) => page.evaluate(() => {
  const root = document.getElementById("colorlab-root");
  const heads = [...root.querySelectorAll("div")].filter((d) => /^色別 顔映りチェック（\d+色）$/.test(d.textContent.trim()));
  const sec = heads.length ? heads[heads.length - 1].parentElement : null;
  const rows = sec ? [...sec.querySelectorAll(":scope > div")].map((d) => {
    const chip = d.querySelector("span[style*='width: 38px']");
    const nm = d.querySelector(".text-\\[11px\\].font-medium.leading-tight");
    if (!chip || !nm) return null;
    const cells = [...d.querySelectorAll(".grid.grid-cols-4 > div")].map((c) => c.textContent.trim());
    return { name: nm.textContent.trim(), cells };
  }).filter(Boolean) : [];
  const t6 = [...root.querySelectorAll("div")].filter((d) => d.textContent.trim() === "Best Color TOP6").pop();
  const t6sec = t6 ? t6.parentElement : null;
  const top6 = t6sec ? [...t6sec.querySelectorAll(".grid.grid-cols-6 > div")].map((d) => d.textContent.trim()) : [];
  const tipHead = [...root.querySelectorAll("div")].filter((d) => d.textContent.trim() === "避けたい色を着たいときは").pop();
  const tips = tipHead ? [...tipHead.parentElement.querySelectorAll(".text-\\[11px\\].font-medium.leading-tight")].map((d) => d.textContent.trim()) : [];
  const toggle = [...root.querySelectorAll("button")].filter((b) => /^TOP6の色だけ（\d+点）$/.test(b.textContent.trim())).pop();
  const mHeads = [...root.querySelectorAll("div")].filter((d) => d.textContent.trim() === "アクセサリーの金属");
  const msec = mHeads.length ? mHeads[mHeads.length - 1].parentElement : null;
  const metals = msec ? [...msec.querySelectorAll(".grid.grid-cols-3 > div")].map((d) => d.innerText.replace(/\s+/g, " ").trim()) : [];
  return { title: sec ? sec.firstElementChild.textContent.trim() : null, rows, metals, top6,
    top6Title: t6sec ? t6sec.children[1].textContent.trim() : null,
    tips, toggle: toggle ? toggle.textContent.trim() : null, text: root.innerText };
});

const seen = {};
console.log("\n== 12タイプ結果画面（4タイプ） ==");
for (const pat of ANSWER_PATTERNS) {
  if (Object.keys(seen).length >= 4) break;
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
  const jp = await runQuizWith(page, pat.f);
  const key = NAME2KEY[jp] || (["spring", "summer", "autumn", "winter"].includes(jp) ? jp : null);
  if (!key || seen[key]) { await page.close(); continue; }
  seen[key] = true;
  console.log(`\n-- ${jp} (${key}) / 回答: ${pat.label} --`);
  await page.waitForTimeout(500);
  const r = await readResult(page);

  ok(r.title === "色別 顔映りチェック（24色）", `表の見出しが出ている: ${r.title}`);
  ok(r.rows.length === 24, `24色ぶんの行がある (実測 ${r.rows.length})`);

  // 4軸コメントを1件ずつ突き合わせる
  let miss = [];
  for (const row of r.rows) {
    const cc = COLOR_CHECK.find((c) => c.name === row.name);
    if (!cc) { miss.push(row.name + ":色マスターに無い"); continue; }
    const e = expectAxes(cc.hex, key);
    const want = ["明るさ" + e.bright, "くすみ" + e.dull, "影" + e.shadow, "血色" + e.blood];
    for (let i = 0; i < 4; i++) if (row.cells[i] !== want[i]) miss.push(`${row.name}: 期待"${want[i]}" 実測"${row.cells[i]}"`);
  }
  ok(miss.length === 0, `24色×4軸=96個のコメントがLab実測値と一致 (不一致 ${miss.length}件)` + (miss.length ? "\n         " + miss.slice(0, 4).join("\n         ") : ""));

  // 並びは ◎→○→△→✕
  const order = { "◎": 0, "○": 1, "△": 2, "✕": 3 };
  const rat = r.rows.map((row) => COLOR_CHECK.find((c) => c.name === row.name).r[key]);
  ok(rat.every((v, i) => i === 0 || order[rat[i - 1]] <= order[v]), `並びが ◎→○→△→✕ (${rat.join("")})`);
  ok(rat.join("") === [...COLOR_CHECK].map((c) => c.r[key]).sort((x, y) => order[x] - order[y]).join(""),
     "判定の内訳が既存の COLOR_CHECK と完全一致（チェッカー画面と食い違わない）");

  // D案：金属
  const g = expectMetal("#D4AF5A", key), s2 = expectMetal("#B8BEC9", key);
  ok(r.metals.length === 3, `金属チップが3つ (実測 ${r.metals.length})`);
  ok(/ゴールド/.test(r.metals[0]) && r.metals[0].includes(g.rating), `ゴールド ${g.rating} (ΔE=${g.d.toFixed(1)}) : ${r.metals[0]}`);
  ok(/シルバー/.test(r.metals[1]) && r.metals[1].includes(s2.rating), `シルバー ${s2.rating} (ΔE=${s2.d.toFixed(1)}) : ${r.metals[1]}`);
  ok(/パール/.test(r.metals[2]) && r.metals[2].includes(PEARL[key]) && r.metals[2].includes("◎"), `パール ◎ / ${PEARL[key]} : ${r.metals[2]}`);
  ok(/のアクセサリー/.test(r.text), "既存のアクセサリー在庫（SKUS）につながっている");

  // ── B案：ベストカラーTOP6 ──
  const want6 = expectTop6(key).map((c) => c.name);
  ok(r.top6.length === 6, `TOP6の帯に6色ある (実測 ${r.top6.length})`);
  ok(r.top6.join("・") === want6.join("・"), `TOP6が期待どおり: ${r.top6.join("・")}`);
  ok(r.top6Title === "まずはこの6色から", `帯の見出し: ${r.top6Title}`);
  const wantHit = expectTop6Skus(SITE_OF[key], key);
  ok(r.toggle === `TOP6の色だけ（${wantHit.length}点）`, `絞り込みトグルの件数が在庫と一致: ${r.toggle} / 全${SKUS[SITE_OF[key]].length}点`);
  ok(wantHit.length > 0 && wantHit.length < SKUS[SITE_OF[key]].length, `絞り込みが実際に効く件数になっている (${wantHit.length}/${SKUS[SITE_OF[key]].length})`);

  // ── C案：苦手な色を着るときのポイント ──
  ok(r.tips.length === 3, `苦手色の回避策が3点ある (実測 ${r.tips.length})`);
  ok(r.tips.join("/") === "トップスは顔から離す/顔まわりは明るい色を入れる/メイクとアクセで明るさを足す",
     `回避策の中身: ${r.tips.join(" / ")}`);

  // 既存機能に影響がないこと
  ok(/似合う色（勝ち色 \d+色）/.test(r.text), "既存の勝ち色ブロックが残っている");
  ok((r.text.match(/苦手な色/g) || []).length === 1, "苦手色ブロックは1箇所のまま");
  ok(/仕上げのコスメはコレ/.test(r.text), "既存のコスメ欄が残っている");
  ok(/に似合う服はコレ/.test(r.text), "既存のおすすめ商品欄が残っている");
  ok(/2nd/.test(r.text) || /2ndの/.test(r.text), "1st/2nd の表示が残っている");

  // スクリーンショット
  const sec = page.locator("#colorlab-root div").filter({ hasText: /^色別 顔映りチェック（24色）/ }).last();
  await sec.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `facecheck_${key}_full.png`) });
  await page.close();
}
ok(Object.keys(seen).length === 4, `4タイプすべてを実機で確認できた (${Object.keys(seen).join(", ")})`);

await browser.close();
console.log(ng === 0 ? "\nALL PASS" : "\n" + ng + " 件 FAIL");
process.exit(ng === 0 ? 0 : 1);
