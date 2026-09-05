// v1.20.4 本番実測。実サイトを実ブラウザで開いて、新フロー・1st/2nd・既存診断を通す。
// 「自分の顔で作る」は撮影画面に着くところまでで、画像生成は一切叩かない。
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const OUT = resolve("C:/Users/newfa/AppData/Local/Temp/claude/C--Users-newfa/3252b577-6047-43f9-93b8-b76df23867ab/scratchpad/v1204");
mkdirSync(OUT, { recursive: true });

const SITES = [
  { key: "BLUBEL", url: "https://www.blubel.jp/pages/personalcolor" },
  { key: "IEBEL",  url: "https://www.iebel.jp/pages/personalcolor" },
];

const results = [];
const browser = await chromium.launch();

for (const site of SITES) {
  const ok = [], ng = [];
  const check = (c, l) => (c ? ok : ng).push(l);
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
  const page = await ctx.newPage();
  const bundles = [];
  page.on("request", (r) => { if (/colorlab\.iife\.js/.test(r.url())) bundles.push(r.url()); });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));

  const open = async () => {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#colorlab-root button", { timeout: 60000 });
  };
  await open();

  // 1) 実際に読み込まれたバンドルのタグ
  check(bundles.some((u) => u.includes("@v1.20.4")), "① 読み込まれたバンドルが @v1.20.4 (" + (bundles[0] || "なし") + ")");
  check(!bundles.some((u) => /@v1\.20\.[0-3]\//.test(u)), "① 旧タグを同時に読んでいない");

  // 4) 既存導線が全部残っている
  const home = await page.textContent("#colorlab-root");
  for (const l of ["写真で診断", "質問で診断", "写真＋質問で12タイプ診断！", "パーソナルカラー別コーデ提案", "骨格診断", "今日のコーデ採点"])
    check(home.includes(l), "④ 既存導線: " + l);
  await page.screenshot({ path: `${OUT}/${site.key}_00_home.png`, fullPage: true });

  // 2a) カード入口 → 選択画面 → アバターで見る
  await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
  await page.waitForTimeout(700);
  const choose = await page.textContent("#colorlab-root");
  check(choose.includes("あなたの結果をどう見る？"), "② 選択画面が診断より前に出る");
  check(choose.includes("無料・すぐに完成") && choose.includes("写真から本人風イラストを生成"), "② 選択画面の文言が指示書どおり");
  check(!choose.includes("今日着る服"), "② 選択画面ではまだQ1を出さない");
  await page.screenshot({ path: `${OUT}/${site.key}_01_choose.png`, fullPage: true });

  await page.getByRole("button", { name: /アバターで見る/ }).first().click();
  await page.waitForTimeout(400);
  check((await page.textContent("#colorlab-root")).includes("今日着る服"), "②A アバター選択後は従来どおりQ1へ");
  await page.getByRole("button", { name: /^直感で選ぶ/ }).click(); await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^自分から話しかける/ }).click(); await page.waitForTimeout(400);
  // 未診断なので Q3(6ペア)。先頭=戻る、その次がA選択肢。
  for (let i = 0; i < 6; i++) { await page.locator("#colorlab-root button").nth(1).click(); await page.waitForTimeout(220); }
  await page.waitForTimeout(1200);
  let body = await page.textContent("#colorlab-root");
  check(body.includes("カードを画像で保存"), "②A 結果画面に到達");
  // 3) 1st / 2nd
  const m = body.match(/1st\s*(\S+)\s*2nd\s*(\S+)/);
  check(!!m, "③ カードに「1st ○○　2nd ○○」が出る" + (m ? " → 1st " + m[1] + " / 2nd " + m[2] : ""));
  const order = body.indexOf("1st") < body.indexOf("あなたの色は") && body.indexOf("1st") > 0;
  check(order, "③ 1st/2nd が「あなたの色は」より上にある");
  check(body.includes("自分の顔で作る") && !body.includes("別の写真で作り直す"), "②A アバター選択時は「自分の顔で作る」ボタンが残る");
  // 5) アバター画像が実際に読めているか
  const av = await page.evaluate(() => {
    const i = document.querySelector("#colorlab-root img");
    return i ? { src: i.src, w: i.naturalWidth, h: i.naturalHeight } : null;
  });
  check(av && av.w > 0, "⑤ カードのアバターが実際に読み込まれた " + (av ? `${av.w}x${av.h} ${av.src.split("/").pop()}` : "なし"));
  await page.screenshot({ path: `${OUT}/${site.key}_02_card_1st2nd.png`, fullPage: true });

  // 2b) カード入口 → 自分の顔で作る → 診断完了で撮影画面へ自動遷移（生成はしない）
  await open();
  await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /自分の顔で作る/ }).first().click();
  await page.waitForTimeout(400);
  check((await page.textContent("#colorlab-root")).includes("今日着る服"), "②B 自分の顔を選んでもQ1から始まる");
  await page.getByRole("button", { name: /^考えて選ぶ/ }).click(); await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^聞き役になる/ }).click(); await page.waitForTimeout(400);
  for (let i = 0; i < 6; i++) { await page.locator("#colorlab-root button").nth(1).click(); await page.waitForTimeout(220); }
  await page.waitForTimeout(1200);
  body = await page.textContent("#colorlab-root");
  check(await page.getByRole("button", { name: /写真を選ぶ/ }).count() > 0, "②B 診断完了で撮影画面へ自動遷移");
  check(!body.includes("カードを画像で保存"), "②B 撮影画面では結果画面を先に見せない");
  await page.screenshot({ path: `${OUT}/${site.key}_03_selfphoto.png`, fullPage: true });
  // 戻ると結果画面 + 文言が「別の写真で作り直す」
  await page.locator("#colorlab-root button").first().click();
  await page.waitForTimeout(700);
  body = await page.textContent("#colorlab-root");
  check(body.includes("カードを画像で保存"), "②B 戻ると結果画面が出る");
  check(body.includes("別の写真で作り直す"), "②B 自分の顔選択時は「別の写真で作り直す」表記");

  // 4) 既存: 質問で診断（12タイプ）を通し、5) シーズン代表アバターを見る
  await open();
  await page.getByRole("button", { name: /質問で診断/ }).first().click();
  await page.waitForTimeout(700);
  for (let i = 0; i < 20; i++) {
    const t = await page.textContent("#colorlab-root");
    if (/あなたは【/.test(t)) break;
    const btns = page.locator("#colorlab-root button");
    const n = await btns.count();
    if (n < 2) break;
    await btns.nth(1).click();
    await page.waitForTimeout(320);
  }
  await page.waitForTimeout(1200);
  body = await page.textContent("#colorlab-root");
  check(/あなたは【.+】タイプです/.test(body), "④ 質問診断が結果まで到達 " + (body.match(/あなたは【(.+?)】/) || [])[1]);
  check(/2nd|2位/.test(body), "④ 結果画面の 2nd 表示が残っている");
  const sav = await page.evaluate(() => {
    const i = document.querySelector("#colorlab-root img");
    return i ? { src: i.src, w: i.naturalWidth } : null;
  });
  check(sav && /avatar_(spring|summer|autumn|winter)_/.test(sav.src) && sav.w > 0,
        "⑤ シーズン代表アバターが表示 " + (sav ? sav.src.split("/").pop() + " " + sav.w + "px" : "なし"));
  await page.screenshot({ path: `${OUT}/${site.key}_04_quiz_result.png`, fullPage: true });

  // 4) 既存: 写真診断 / 写真+質問 の入口が開くか（撮影は起動しない範囲で）
  await open();
  await page.getByRole("button", { name: /写真で診断/ }).first().click();
  await page.waitForTimeout(1200);
  const photo = await page.textContent("body");
  check(/白い紙|撮影|カメラ|写真/.test(photo), "④ 写真診断の画面が開く");
  await page.screenshot({ path: `${OUT}/${site.key}_05_photo.png`, fullPage: true });

  await open();
  await page.getByRole("button", { name: /写真＋質問で12タイプ診断/ }).first().click();
  await page.waitForTimeout(1200);
  check(/白い紙|撮影|カメラ|写真|質問/.test(await page.textContent("body")), "④ 写真+質問の画面が開く");
  await page.screenshot({ path: `${OUT}/${site.key}_06_combo.png`, fullPage: true });

  check(errs.length === 0, "JSエラー0件" + (errs.length ? " → " + errs.slice(0, 3).join(" / ") : ""));
  results.push({ site: site.key, ok, ng });
  await ctx.close();
}

await browser.close();
for (const r of results) {
  console.log("\n===== " + r.site + " : PASS " + r.ok.length + " / FAIL " + r.ng.length);
  r.ok.forEach((l) => console.log("  [OK] " + l));
  r.ng.forEach((l) => console.log("  [NG] " + l));
}
process.exit(results.some((r) => r.ng.length) ? 1 : 0);
