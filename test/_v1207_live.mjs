// v1.20.7 の本番実測。blubel.jp / iebel.jp の実ページを実ブラウザで開き、
// 12タイプ診断を最後まで通して A〜D案と既存機能・JSエラーを確認する。
// 実行: node test/_v1207_live.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const SITES = [
  { site: "blubel", url: "https://www.blubel.jp/pages/personalcolor" },
  { site: "iebel", url: "https://www.iebel.jp/pages/personalcolor" },
];

// ── 期待値をローカルのソースから独立に組み立てる（本番の表示と突き合わせる） ──
const src = readFileSync(join(__dirname, "..", "src", "color_lab_stylist_v23.jsx"), "utf8");
const cdata = readFileSync(join(__dirname, "..", "src", "color_data.js"), "utf8");
const skuc = readFileSync(join(__dirname, "..", "src", "sku_color_data.js"), "utf8");
const palette10 = {};
for (const m of src.matchAll(/(spring|summer|autumn|winter): \{ key:.*?palette10: (\[\[.*?\]\]),/gs))
  palette10[m[1]] = JSON.parse(m[2].replace(/"/g, "'").replace(/'/g, '"'));
const COLOR_CHECK = [];
for (const m of src.matchAll(/\{ name: "([^"]+)", hex: "(#\w{6})", r: \{ spring: "(.)", summer: "(.)", autumn: "(.)", winter: "(.)" \} \}/g))
  COLOR_CHECK.push({ name: m[1], hex: m[2], r: { spring: m[3], summer: m[4], autumn: m[5], winter: m[6] } });
const FAMILY_ORDER = JSON.parse(cdata.match(/export const FAMILY_ORDER = (\[[\s\S]*?\]);/)[1]);
const COLOR_FAMILIES = JSON.parse(cdata.match(/export const COLOR_FAMILIES = (\{[\s\S]*?\n\});/)[1]);
const SKU_COLORS = JSON.parse(skuc.match(/export const SKU_COLORS = (\{[\s\S]*\});/)[1]);
const ALIAS = JSON.parse(src.match(/const MASTER_COLOR_ALIAS = (\{[\s\S]*?\n\};)/)[1]
  .replace(/\/\/[^\n]*/g, "").replace(/,(\s*\})/g, "$1").replace(/\};$/, "}"));
const SKUS = {};
{
  const body = src.match(/const SKUS = \{([\s\S]*?)\n\};/)[1];
  let s2 = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(blubel|iebel):\s*\[/);
    if (m) { s2 = m[1]; SKUS[s2] = []; continue; }
    const g = line.match(/\{ id: (\d+), name: "([^"]+)", price: \d+, cat: "([^"]+)"/);
    if (g) SKUS[s2].push({ id: g[1], name: g[2], cat: g[3] });
  }
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
function expectTop6(k) {
  const fam = COLOR_FAMILIES[k] || {}, r = refOf(k), all = [];
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
const PEARL = { spring: "アイボリー", summer: "オフホワイト", autumn: "ベージュパール", winter: "ピュアホワイト" };
const SITE_OF = { spring: "iebel", autumn: "iebel", summer: "blubel", winter: "blubel" };

let ng = 0;
const ok = (c, m) => { console.log((c ? "  [PASS] " : "  [FAIL] ") + m); if (!c) ng++; };

const readAll = (page) => page.evaluate(() => {
  const root = document.getElementById("colorlab-root");
  if (!root) return null;
  const pickBlock = (rx) => {
    const el = [...root.querySelectorAll("div")].filter((d) => rx.test(d.textContent.trim().split("\n")[0])).pop();
    return el ? el.parentElement : null;
  };
  const faceSec = pickBlock(/^色別 顔映りチェック（\d+色）$/);
  const rows = faceSec ? [...faceSec.querySelectorAll(":scope > div")].map((d) => {
    const chip = d.querySelector("span[style*='width: 38px']");
    const nm = d.querySelector(".text-\\[11px\\].font-medium.leading-tight");
    if (!chip || !nm) return null;
    return { name: nm.textContent.trim(), cells: [...d.querySelectorAll(".grid.grid-cols-4 > div")].map((c) => c.textContent.trim()) };
  }).filter(Boolean) : [];
  const t6sec = pickBlock(/^Best Color TOP6$/);
  const top6 = t6sec ? [...t6sec.querySelectorAll(".grid.grid-cols-6 > div")].map((d) => d.textContent.trim()) : [];
  const tipSec = pickBlock(/^避けたい色を着たいときは$/);
  const tips = tipSec ? [...tipSec.querySelectorAll(".text-\\[11px\\].font-medium.leading-tight")].map((d) => d.textContent.trim()) : [];
  const mSec = pickBlock(/^アクセサリーの金属$/);
  const metals = mSec ? [...mSec.querySelectorAll(".grid.grid-cols-3 > div")].map((d) => d.innerText.replace(/\s+/g, " ").trim()) : [];
  const toggle = [...root.querySelectorAll("button")].filter((b) => /^TOP6の色だけ（\d+点）$/.test(b.textContent.trim())).pop();
  return {
    faceTitle: faceSec ? faceSec.firstElementChild.textContent.trim() : null,
    rows, top6, tips, metals,
    toggle: toggle ? toggle.textContent.trim() : null,
    text: root.innerText,
  };
});

const PATTERNS = [
  { label: "全部A", f: () => true },
  { label: "全部B", f: () => false },
  { label: "交互A始まり", f: (i) => i % 2 === 0 },
  { label: "交互B始まり", f: (i) => i % 2 === 1 },
  { label: "先頭5問A", f: (i) => i < 5 },
];

const browser = await chromium.launch();
for (const { site, url } of SITES) {
  console.log(`\n══════ ${site.toUpperCase()} ${url} ══════`);
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1200 } });
  const page = await ctx.newPage();
  const errs = [], failed = [], bundles = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 110)}`));
  page.on("request", (r) => { if (/colorlab-embed@/.test(r.url())) bundles.push(r.url()); });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#colorlab-root button", { timeout: 40000 });
  const tag = (bundles.find((u) => /colorlab\.iife\.js/.test(u)) || "").match(/@v[\d.]+/);
  ok(!!tag && tag[0] === "@v1.20.7", `読み込まれたバンドルが @v1.20.7 (実測 ${tag ? tag[0] : "取得できず"})`);

  const home = await page.locator("#colorlab-root").innerText();
  ok(/質問で診断/.test(home) && /写真で診断/.test(home), "ホームの診断導線が出ている");
  ok(!/近日公開/.test(home), "「近日公開」バッジが0件");
  await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `live1207_${site}_home.png`) });

  // 診断を通す（このサイトの担当タイプに当たるまで回答パターンを変える）
  let key = null, r = null;
  for (const pat of PATTERNS) {
    await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 40000 });
    await page.getByRole("button", { name: /^質問で診断/ }).click();
    let got = null;
    for (let i = 0; i < 40 && !got; i++) {
      got = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}").myType || null; } catch (e) { return null; } });
      if (got) break;
      const btns = page.locator("#colorlab-root button");
      const n = await btns.count();
      const idx = [];
      for (let b = 0; b < n; b++) {
        const t = (await btns.nth(b).innerText().catch(() => "")).trim();
        if (/^[AB]\b/.test(t)) idx.push({ b, t });
      }
      if (!idx.length) { if (n) await btns.first().click().catch(() => {}); await page.waitForTimeout(180); continue; }
      const want = pat.f(i) ? "A" : "B";
      const pick = idx.find((x) => x.t.startsWith(want)) || idx[0];
      await btns.nth(pick.b).click().catch(() => {});
      await page.waitForTimeout(200);
    }
    if (got && SITE_OF[got] === site) { key = got; break; }
    if (got && !key) key = got; // このサイト担当が出なければ最後の結果で見る
  }
  await page.waitForTimeout(800);
  r = await readAll(page);
  ok(!!r, "結果画面が取得できた");
  console.log(`  （判定タイプ: ${key} / このサイトの担当: ${SITE_OF[key] === site ? "はい" : "いいえ"}）`);

  // ── A案 ──
  ok(r.faceTitle === "色別 顔映りチェック（24色）", `A案 表の見出し: ${r.faceTitle}`);
  ok(r.rows.length === 24, `A案 24色ぶんの行 (実測 ${r.rows.length})`);
  let miss = [];
  for (const row of r.rows) {
    const cc = COLOR_CHECK.find((c) => c.name === row.name);
    if (!cc) { miss.push(row.name); continue; }
    const e = expectAxes(cc.hex, key);
    const want = ["明るさ" + e.bright, "くすみ" + e.dull, "影" + e.shadow, "血色" + e.blood];
    for (let i = 0; i < 4; i++) if (row.cells[i] !== want[i]) miss.push(`${row.name}:期待"${want[i]}"実測"${row.cells[i]}"`);
  }
  ok(miss.length === 0, `A案 96個のコメントがLab実測値と一致 (不一致 ${miss.length}件)` + (miss.length ? " " + miss.slice(0, 3).join(" / ") : ""));
  const order = { "◎": 0, "○": 1, "△": 2, "✕": 3 };
  const rat = r.rows.map((row) => (COLOR_CHECK.find((c) => c.name === row.name) || { r: {} }).r[key]);
  ok(rat.join("") === [...COLOR_CHECK].map((c) => c.r[key]).sort((x, y) => order[x] - order[y]).join(""),
     `A案 判定が COLOR_CHECK と一致 (${rat.join("")})`);

  // ── B案 ──
  const want6 = expectTop6(key).map((c) => c.name);
  ok(r.top6.join("・") === want6.join("・"), `B案 TOP6: ${r.top6.join("・")}`);
  const wantHit = expectTop6Skus(site, key);
  ok(r.toggle === `TOP6の色だけ（${wantHit.length}点）`, `B案 絞り込みトグル: ${r.toggle}（在庫${SKUS[site].length}点中）`);
  const tg = page.locator("#colorlab-root button").filter({ hasText: /^TOP6の色だけ（\d+点）$/ }).last();
  await tg.scrollIntoViewIfNeeded();
  await tg.click();
  await page.waitForTimeout(500);
  const after = await page.locator("#colorlab-root").innerText();
  ok(/この商品のTOP6カラー:/.test(after), "B案 絞り込みが効き、商品のTOP6カラーが表示される");
  await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `live1207_${site}_result.png`) });
  await tg.click();
  await page.waitForTimeout(300);

  // ── C案 ──
  ok(r.tips.length === 3, `C案 回避策が3点 (実測 ${r.tips.length})`);
  ok(r.tips.join("/") === "トップスは顔から離す/顔まわりは明るい色を入れる/メイクとアクセで明るさを足す",
     `C案 中身: ${r.tips.join(" / ")}`);

  // ── D案 ──
  const g = expectMetal("#D4AF5A", key), s2 = expectMetal("#B8BEC9", key);
  ok(r.metals.length === 3, `D案 金属チップ3つ (実測 ${r.metals.length})`);
  ok(r.metals[0].includes("ゴールド") && r.metals[0].includes(g.rating), `D案 ゴールド ${g.rating} (ΔE=${g.d.toFixed(1)})`);
  ok(r.metals[1].includes("シルバー") && r.metals[1].includes(s2.rating), `D案 シルバー ${s2.rating} (ΔE=${s2.d.toFixed(1)})`);
  ok(r.metals[2].includes("パール") && r.metals[2].includes(PEARL[key]), `D案 パール ◎ / ${PEARL[key]}`);
  ok(/のアクセサリー/.test(r.text), "D案 SKUS のアクセサリー在庫につながっている");

  // ── 既存機能の回帰 ──
  ok(/似合う色（勝ち色 \d+色）/.test(r.text), "既存 勝ち色ブロック");
  ok((r.text.match(/苦手な色/g) || []).length === 1, "既存 苦手色ブロックは1箇所のまま");
  ok(/2nd/.test(r.text), "既存 1st/2nd 表示");
  ok(/仕上げのコスメはコレ/.test(r.text), "既存 コスメ欄");
  ok(/に似合う服はコレ/.test(r.text), "既存 おすすめ商品欄");
  ok(/(イエローベース|ブルーベース|ニュートラル)/.test(r.text) && /(高|中|低)明度/.test(r.text), "既存 専門表記（ベース/明度）");
  ok(/DEPACOS/.test(await page.evaluate(async () => {
    const root = document.getElementById("colorlab-root");
    const b = [...root.querySelectorAll("button")].find((x) => /おすすめコスメ|コスメ/.test(x.textContent));
    return root.innerText;
  })) || true, "（デパコスはコスメ一覧で別途確認）");

  // デパコスAFF はコスメ一覧ページで確認
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#colorlab-root button", { timeout: 40000 });
  await page.getByRole("button", { name: /おすすめコスメ/ }).click();
  await page.waitForSelector("#colorlab-root >> text=に似合うコスメはコレ", { timeout: 15000 });
  await page.waitForTimeout(4500);
  const cos = await page.evaluate(() => {
    const root = document.getElementById("colorlab-root");
    const a = root.querySelector('a[href*="px.a8.net/svt/ejp"]');
    return { text: root.innerText, a8: a ? a.getAttribute("href") : null, slot: !!root.querySelector(".a8ad-slot") };
  });
  ok(/DEPACOS/.test(cos.text), "既存 デパコスAFF のカードが出る");
  ok(!!cos.a8 && /a8mat=4B3VR9\+GAG5TE\+4QYG\+BWGDT/.test(decodeURIComponent(cos.a8)), `既存 A8 計測URL: ${(cos.a8 || "").slice(0, 70)}`);
  ok(/Qoo10で見る/.test(cos.text), "既存 「Qoo10で見る」ボタン");
  await page.locator("#colorlab-root").screenshot({ path: join(SHOTS, `live1207_${site}_cosme.png`) });

  // ── JSエラー ──
  const realFail = failed.filter((f) => !/ERR_ABORTED/.test(f));
  ok(errs.length === 0, `JSエラー0件 (実測 ${errs.length}件)` + (errs.length ? "\n         " + errs.slice(0, 3).join("\n         ") : ""));
  ok(realFail.length === 0, `中断以外のリクエスト失敗0件 (実測 ${realFail.length}件 / ERR_ABORTED ${failed.length - realFail.length}件)` +
     (realFail.length ? "\n         " + realFail.slice(0, 3).join("\n         ") : ""));

  await ctx.close();
}
await browser.close();
console.log(ng === 0 ? "\nALL PASS" : "\n" + ng + " 件 FAIL");
process.exit(ng === 0 ? 0 : 1);
