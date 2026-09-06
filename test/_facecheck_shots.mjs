// 検収用: 顔映りチェック表と金属チップだけを切り出して撮る。
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
  const box = await p.evaluate(() => {
    const root = document.getElementById("colorlab-root");
    const pick = (re) => [...root.querySelectorAll("div")].filter((d) => re.test(d.textContent.trim().split("\n")[0])).pop();
    const face = pick(/^色別 顔映りチェック（\d+色）$/);
    const metal = pick(/^アクセサリーの金属$/);
    const rect = (el) => { if (!el) return null; const r = el.parentElement.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; };
    return { face: rect(face), metal: rect(metal) };
  });
  for (const [name, r] of Object.entries(box)) {
    if (!r) continue;
    await p.setViewportSize({ width: 420, height: Math.min(4000, Math.ceil(r.h) + 40) });
    await p.evaluate((y) => window.scrollTo(0, y - 10), r.y);
    await p.waitForTimeout(250);
    await p.screenshot({ path: join(SHOTS, `facecheck_${key}_${name}.png`), clip: { x: r.x, y: 10, width: r.w, height: Math.min(3900, r.h) } });
  }
  console.log(key, "ok");
  await p.close();
}
await b.close();
console.log("done:", Object.keys(seen).join(", "));
