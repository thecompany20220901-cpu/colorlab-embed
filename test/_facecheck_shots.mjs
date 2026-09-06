// 検収用: 12タイプ結果画面に足した A/B/C/D 案のブロックだけを切り出して撮る。
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ART = "file://" + join(__dirname, "local_article.html").split("\\").join("/");
const SHOTS = join(__dirname, "screenshots");

const PATTERNS = [
  { label: "先頭12問A", f: () => true },
  { label: "先頭0問A", f: () => false },
  { label: "先頭5問A", f: (i) => i < 5 },
  { label: "先頭8問A", f: (i) => i < 8 },
  { label: "交互A始まり", f: (i) => i % 2 === 0 },
  { label: "交互B始まり", f: (i) => i % 2 === 1 },
  { label: "3問に1回A", f: (i) => i % 3 === 0 },
];

// 撮る対象: 見出しの文字で親ブロックを特定する
const TARGETS = [
  ["top6", /^Best Color TOP6$/],
  ["ngtips", /^避けたい色を着たいときは$/],
  ["face", /^色別 顔映りチェック（\d+色）$/],
  ["metal", /^アクセサリーの金属$/],
];

const b = await chromium.launch();
const seen = {};
for (const pat of PATTERNS) {
  if (Object.keys(seen).length >= 4) break;
  const p = await b.newPage({ viewport: { width: 420, height: 1200 } });
  await p.goto(ART, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await p.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await p.getByRole("button", { name: /^質問で診断/ }).click();
  let key = null;
  for (let i = 0; i < 40 && !key; i++) {
    key = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}").myType || null; } catch (e) { return null; } });
    if (key) break;
    const btns = p.locator("#colorlab-root button");
    const n = await btns.count();
    const idx = [];
    for (let k = 0; k < n; k++) {
      const t = (await btns.nth(k).innerText().catch(() => "")).trim();
      if (/^[AB]\b/.test(t)) idx.push({ k, t });
    }
    if (!idx.length) { if (n) await btns.first().click().catch(() => {}); await p.waitForTimeout(150); continue; }
    const want = pat.f(i) ? "A" : "B";
    const pick = idx.find((x) => x.t.startsWith(want)) || idx[0];
    await btns.nth(pick.k).click().catch(() => {});
    await p.waitForTimeout(160);
  }
  if (!key || seen[key]) { await p.close(); continue; }
  seen[key] = true;
  await p.waitForTimeout(500);

  // TOP6 の絞り込みは、押した状態も撮る
  const shoot = async (suffix) => {
    for (const [name, re] of TARGETS) {
      const r = await p.evaluate((src) => {
        const root = document.getElementById("colorlab-root");
        const rx = new RegExp(src);
        const el = [...root.querySelectorAll("div")].filter((d) => rx.test(d.textContent.trim().split("\n")[0])).pop();
        if (!el) return null;
        const b = el.parentElement.getBoundingClientRect();
        return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height };
      }, re.source);
      if (!r) continue;
      await p.setViewportSize({ width: 420, height: Math.min(4000, Math.ceil(r.h) + 40) });
      await p.evaluate((y) => window.scrollTo(0, y - 10), r.y);
      await p.waitForTimeout(250);
      await p.screenshot({ path: join(SHOTS, `enrich_${key}_${name}${suffix}.png`), clip: { x: r.x, y: 10, width: r.w, height: Math.min(3900, r.h) } });
    }
  };
  await shoot("");

  // 「TOP6の色だけ」を押した状態のおすすめ商品
  await p.setViewportSize({ width: 420, height: 1200 });
  const tg = p.locator("#colorlab-root button").filter({ hasText: /^TOP6の色だけ（\d+点）$/ }).last();
  if (await tg.count()) {
    await tg.scrollIntoViewIfNeeded();
    await tg.click();
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const root = document.getElementById("colorlab-root");
      const h = [...root.querySelectorAll("h3")].filter((d) => /に似合う服はコレ/.test(d.textContent)).pop();
      if (!h) return null;
      const b = h.parentElement.getBoundingClientRect();
      return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height };
    });
    if (r) {
      const el = p.locator("#colorlab-root button").filter({ hasText: /^TOP6の色だけ（\d+点）$/ }).last();
      const bb = await el.boundingBox();
      await p.setViewportSize({ width: 420, height: 1100 });
      await p.evaluate((y) => window.scrollTo(0, y - 60), (bb ? bb.y + (await p.evaluate(() => scrollY)) : r.y));
      await p.waitForTimeout(300);
      await p.screenshot({ path: join(SHOTS, `enrich_${key}_sku_top6only.png`) });
    }
  }
  console.log(key, "ok");
  await p.close();
}
await b.close();
console.log("done:", Object.keys(seen).join(", "));
