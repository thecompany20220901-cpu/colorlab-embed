// 「自分の顔で作る」の生成プロンプトを実測する。API は叩かない（課金ゼロ）。
//
// 見るのは 2026-09-05 の不具合そのもの:
//   カードに出る2色配色（例「ネイビー×キャメル」）の 2色目が、
//   生成プロンプトに正しい色として渡っているか。
// 以前は 2色目を 1位シーズンだけで決めていたため、カードが camel でも
// プロンプトは bordeaux red で、絵に camel が出ないのは当然だった。
//
// 実行: node test/selfcard_prompt_check.mjs
import { buildPrompt, deltaE, FIRST_COLOR, SECOND_COLOR, LEGACY_SECOND } from "../worker/selfcard-worker.js";
import { CARD_COPY } from "../src/card_data.js";

const NUM2KEY = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };

let ng = 0, n = 0;
const ok = (cond, label) => {
  n++;
  if (!cond) { ng++; console.log("  NG  " + label); }
  else console.log("  ok  " + label);
};

// ── 1. 48件すべてのカードで、プロンプトの2色がカードの ch[0]/ch[1] と一致するか
console.log("\n[1] カードの配色 ch[] とプロンプトの色が一致するか (CARD_COPY 全48件)");
const seenPairs = new Set();
let mismatch = [];
for (const key of Object.keys(CARD_COPY)) {
  const m = key.match(/^(\d)-(\d)_/);
  const first = NUM2KEY[m[1]], second = NUM2KEY[m[2]];
  const { cn, ch } = CARD_COPY[key];
  const p = buildPrompt(first, second);
  seenPairs.add(m[1] + "-" + m[2]);
  const hitMain = p.includes("(" + ch[0] + ")");
  const hitSecond = p.includes("(" + ch[1] + ")");
  if (!hitMain || !hitSecond) mismatch.push(`${key} ${cn} ch=${ch} main=${hitMain} second=${hitSecond}`);
}
ok(seenPairs.size === 12, `1位x2位のペアが12通り (実測 ${seenPairs.size})`);
ok(Object.keys(CARD_COPY).length === 48, `CARD_COPY は48件 (実測 ${Object.keys(CARD_COPY).length})`);
ok(mismatch.length === 0, `色の不一致 0件 (実測 ${mismatch.length}件)` +
   (mismatch.length ? "\n      " + mismatch.slice(0, 5).join("\n      ") : ""));

// ── 2. 2色目が「役割つき・置き場所つき」で書かれているか（単なる列挙になっていないか）
console.log("\n[2] 2色目の指定が役割と配置を持つか");
for (const [first, second, jp] of [
  ["winter", "autumn", "ネイビー×キャメル"],
  ["spring", "summer", "ピーチ×ローズ"],
  ["summer", "spring", "ラベンダー×イエロー"],
  ["autumn", "winter", "テラコッタ×マゼンタ"],
]) {
  const p = buildPrompt(first, second);
  const dom = FIRST_COLOR[first].en, acc = SECOND_COLOR[second].en;
  const cnt = p.split(acc).length - 1;
  console.log(`  -- ${jp} (${first}/${second}) : ${dom} / ${acc}`);
  ok(p.includes("MAIN COLOR is " + dom), "     1色目が MAIN COLOR として指定されている");
  ok(p.includes("SECOND COLOR is " + acc), "     2色目が SECOND COLOR として指定されている");
  ok(/collar, cuffs and button placket/.test(p), "     置き場所（襟・袖口・前立て）が明示されている");
  ok(/one quarter of the\s+clothing area/.test(p), "     面積の目安（1/4）が指定されている");
  ok(p.includes("do not drop either one"), "     どちらも落とすなと明示されている");
  ok(p.includes("not as a shadow or a tint of the " + dom), "     主色の陰影で済ませるなと明示されている");
  ok(p.includes("at least two " + acc + " strokes"), "     背景ストロークにも2色目が入る");
  ok(cnt >= 4, `     2色目の色名が4回以上出る (実測 ${cnt}回)`);
  ok(!/glasses|eyewear|\bhats?\b|jewell?ery|necklace|earring/i.test(p), "     写真に無い小物を足す語が入っていない");
}

// ── 3. 旧バンドル互換: second が無い/不正でも落ちず、2026-09-05 以前と同じ色になる
console.log("\n[3] second が無い旧クライアントの互換");
for (const first of Object.keys(FIRST_COLOR)) {
  const p = buildPrompt(first, "");
  ok(p.includes("(" + LEGACY_SECOND[first].hex + ")"),
     `${first}: second 無しなら従来色 ${LEGACY_SECOND[first].en} にフォールバック`);
}
ok(buildPrompt("winter", "winter").includes("(" + LEGACY_SECOND.winter.hex + ")"),
   "first と second が同じなら 2色目はフォールバック（同色2つにしない）");
ok(buildPrompt("winter", "bogus").includes("(" + LEGACY_SECOND.winter.hex + ")"),
   "未知の second でも落ちずにフォールバック");

// ── 4. 画風の文面は事前生成16アバターと同じまま（今回は色だけ直す）
console.log("\n[4] 画風の文面は据え置き");
const p = buildPrompt("winter", "autumn");
ok(p.startsWith("Editorial magazine-style illustrated portrait based on the reference photo. "),
   "書き出しが従来どおり");
ok(p.includes("Loose black ink linework with soft colored pencil shading."), "線と塗りの指定が従来どおり");
ok(p.includes("Keep the face and hairstyle accurately recognizable as the same person."),
   "本人性の指定が従来どおり");
ok(p.endsWith("No text."), "末尾の No text. が残っている");


// -- 5. 近い2色ペアにだけ「濃く・彩度を上げろ」の一文が付くか
// 全12ペアの実測 ΔE で線を引く。付く/付かないを表で持たず毎回測るのは、
// 色見本を差し替えたときに書き換え忘れないため。
console.log("\n[5] 近い2色ペアにだけ押し離しの一文が付くか");
const NUM = { spring: 1, summer: 2, autumn: 3, winter: 4 };
const closeSeen = [];
for (const f of Object.keys(FIRST_COLOR)) {
  for (const sd of Object.keys(SECOND_COLOR)) {
    if (f === sd) continue;
    const d = deltaE(FIRST_COLOR[f].hex, SECOND_COLOR[sd].hex);
    const has = buildPrompt(f, sd).includes("close in hue");
    const want = d < 30;
    if (want) closeSeen.push(`${f}/${sd} ΔE${d.toFixed(1)}`);
    ok(has === want,
      `${NUM[f]}-${NUM[sd]} ${FIRST_COLOR[f].en} x ${SECOND_COLOR[sd].en} ΔE ${d.toFixed(1)} -> ` +
      `一文 ${has ? "あり" : "なし"} (期待 ${want ? "あり" : "なし"})`);
  }
}
ok(closeSeen.length === 2, `近いペアは2組だけ (実測 ${closeSeen.length}組: ${closeSeen.join(", ")})`);
ok(buildPrompt("spring", "summer").includes("deeper and more saturated than #D4708E"),
   "ピーチxローズは色見本の hex より濃く振れと書いてある");
ok(!buildPrompt("winter", "autumn").includes("close in hue"),
   "ネイビーxキャメル (ΔE 66.0) には付かない");

console.log(`\n=== ${n - ng}/${n} 合格 ===`);
if (ng) { console.log("実測プロンプト(winter/autumn):\n" + p); process.exit(1); }
process.exit(0);
