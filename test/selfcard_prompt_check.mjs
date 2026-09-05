// 「自分の顔で作る」の生成プロンプトを、カードの表記と突き合わせて検証する。
// 事象: カードが「ネイビー×キャメル」でも、生成される絵に2色目が出ない。
// 原因: v1 は2色目を ACCENT[first] という別表から引いていたため、カードの
//       2色目（＝2位シーズンの色）を一度も指定していなかった。
//
// ここで見るのは、画像を1枚も生成せずに機械的に確かめられることだけ:
//   (1) 12通り（1位×2位）すべてで、プロンプトの2色が card_data.js の
//       CARD_COPY[].ch[0] / ch[1] と一致する
//   (2) 2色目に「役割」と「置き場所」が書かれている（ただ列挙していない）
//   (3) 2色目が1色目に飲まれないための指示がある
//   (4) 写真に無い持ち物（眼鏡等）を描き足させる語が入っていない
// 実行: node test/selfcard_prompt_check.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { FIRST_COLOR, SECOND_COLOR, buildPrompt } from "../worker/selfcard-worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// カード側の正解（src/card_data.js）。1位-2位 -> [色名, 1色目HEX, 2色目HEX]
const CARD = readFileSync(join(ROOT, "src/card_data.js"), "utf-8");
const NUM2KEY = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };
const pairs = new Map();
for (const m of CARD.slice(CARD.indexOf("export const CARD_COPY"))
  .matchAll(/"(\d)-(\d)_\w+": \{ t: "[^"]+", cn: "([^"]+)", ch: \["([^"]+)", "([^"]+)"\]/g)) {
  const key = NUM2KEY[m[1]] + ">" + NUM2KEY[m[2]];
  const val = { cn: m[3], h1: m[4].toUpperCase(), h2: m[5].toUpperCase() };
  const prev = pairs.get(key);
  if (prev && (prev.h1 !== val.h1 || prev.h2 !== val.h2)) {
    throw new Error("同じ 1位-2位 なのに色が違う: " + key);
  }
  pairs.set(key, val);
}

const ok = [], ng = [];
const check = (c, l) => { (c ? ok : ng).push(l); return c; };

check(pairs.size === 12, `カードの配色は 12通り (実測 ${pairs.size})`);

// ── (1) 12通りすべてで、プロンプトの2色がカードと一致するか ──
for (const [key, want] of [...pairs].sort()) {
  const [first, second] = key.split(">");
  const p = buildPrompt(first, second);
  const c1 = FIRST_COLOR[first], c2 = SECOND_COLOR[second];

  check(c1.hex.toUpperCase() === want.h1,
    `${want.cn} (${first}>${second}): 1色目が card_data と一致 (${c1.en} ${c1.hex})`);
  check(c2.hex.toUpperCase() === want.h2,
    `${want.cn} (${first}>${second}): 2色目が card_data と一致 (${c2.en} ${c2.hex})`);
  check(p.includes(c1.hex) && p.includes(c1.en), `${want.cn}: プロンプトに1色目 ${c1.en} ${c1.hex} が入る`);
  check(p.includes(c2.hex) && p.includes(c2.en), `${want.cn}: プロンプトに2色目 ${c2.en} ${c2.hex} が入る`);
  check(c1.hex !== c2.hex, `${want.cn}: 2色が別の色になっている`);

  // v1 で使っていた誤りの色が残っていないこと（回帰の防止）
  for (const stale of ["bordeaux", "charcoal", "olive green", "light green"]) {
    check(!p.toLowerCase().includes(stale), `${want.cn}: v1 の誤った accent「${stale}」が残っていない`);
  }
}

// ── (2)(3)(4) 文面そのものの条件。1通りで代表して見る ──
const sample = buildPrompt("winter", "autumn");   // ネイビー×キャメル
check(/MAIN COLOR/.test(sample), "1色目に「MAIN COLOR」という役割が付いている");
check(/SECOND COLOR/.test(sample), "2色目に「SECOND COLOR」という役割が付いている");
check(/collar/i.test(sample) && /cuffs/i.test(sample) && /brush strokes on the background/i.test(sample),
  "2色目の置き場所が3箇所（襟・袖口・背景のストローク）名指しされている");
check(/all three of these places/i.test(sample), "3箇所すべてに入れる、と必須で書いている");
check(/70%/.test(sample) && /30%/.test(sample), "面積比（70% / 30%）が書いてある");
check(/do not tint/i.test(sample) && /do not omit/i.test(sample),
  "2色目を1色目に寄せない・省かない、と明示している");
check(!/glass|eyewear|spectacle|jewelry|necklace|earring/i.test(sample),
  "写真に無い持ち物（眼鏡・アクセサリー）を描き足させる語が入っていない");
check(/recognizable as the same person/i.test(sample), "本人らしさの指示は従来どおり残っている");
check(/No text\.$/.test(sample), "「No text.」で終わる従来の締めが残っている");

// ── 古いクライアント（second を送らない）でも落ちないこと ──
const noSecond = buildPrompt("winter", "");
check(noSecond.includes(FIRST_COLOR.winter.hex) && noSecond.includes(SECOND_COLOR.winter.hex),
  "second が無いときは1位で代用し、2色とも指定される");

console.log("── プロンプト（ネイビー×キャメル / winter>autumn）──");
console.log(sample.replace(/\. /g, ".\n"));
console.log("\nOK");
ok.forEach((l) => console.log("  ✓ " + l));
if (ng.length) { console.log("NG"); ng.forEach((l) => console.log("  ✗ " + l)); process.exit(1); }
console.log(`\nすべて通過 (${ok.length} 項目)`);
