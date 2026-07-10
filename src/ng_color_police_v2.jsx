import React, { useState, useRef } from "react";
import { Camera, RotateCcw, ArrowRight, Download, ExternalLink, Siren } from "lucide-react";

// ════════════════════════════════════════════
// NG色警察 🚨 — ブルベ研究所 / イエベ研究所 presents
// 単独アプリ。結果は「違反切符」or「無罪放免証」。本家アプリ＆ECへ合流させる花火型入口。
// ════════════════════════════════════════════

// 計測: このアプリ経由の流入を判別するUTM
const UTM = "utm_source=ngpolice&utm_medium=app&utm_campaign=viral";
const ITEM_URL = (site, id) => `https://${site}.jp/items/${id}?${UTM}`;
const SITE_URL = (site) => `https://${site}.jp?${UTM}`;

// ════════════════════════════════════════════
// フェーズ1: AI取り調べフラグ。false の間はルールベース簡易判定で完走させる。
// ════════════════════════════════════════════
const AI_ENABLED = false;

// 本家アプリ（v21）を設置したページのURL。差し替えは「ここだけ」。
// ビルド時に差し替えたい場合は VITE_MAIN_APP_URL 環境変数でも上書き可能。
const MAIN_APP_URL_OVERRIDE = (import.meta.env && import.meta.env.VITE_MAIN_APP_URL) || "https://www.blubel.jp/pages/personalcolor";
const MAIN_APP_URL = (site) => MAIN_APP_URL_OVERRIDE || `https://${site}.jp/app?${UTM}`; // 本家アプリ設置URL
const LINE_URLS = { iebel: "https://lin.ee/weC3DMg", blubel: "https://lin.ee/TycoIx4" };

const TYPES = {
  spring: { key: "spring", name: "イエベ春", en: "Spring", palette: ["#F7C9A0", "#F4A582", "#F6D65B", "#8FCB9B"], ng: ["黒", "グレー", "青みの強い色"], accent: "#E8927C", site: "iebel", siteName: "IEBEL", sns: "@iebe_lab", lab: "イエベ研究所" },
  summer: { key: "summer", name: "ブルベ夏", en: "Summer", palette: ["#C9B8D8", "#E8A9C0", "#A9C4DE", "#B7BCC4"], ng: ["オレンジ", "こっくりブラウン", "強い原色"], accent: "#9B8CB5", site: "blubel", siteName: "BLUBEL", sns: "@blube_lab", lab: "ブルベ研究所" },
  autumn: { key: "autumn", name: "イエベ秋", en: "Autumn", palette: ["#B5734A", "#C89B3C", "#7B8B45", "#A65A3A"], ng: ["ビビッド原色", "青みピンク", "純白"], accent: "#A65E3A", site: "iebel", siteName: "IEBEL", sns: "@iebe_lab", lab: "イエベ研究所" },
  winter: { key: "winter", name: "ブルベ冬", en: "Winter", palette: ["#3B5BA5", "#C2408B", "#1F9E8E", "#111418"], ng: ["くすみカラー", "アイボリー", "オレンジ寄り"], accent: "#3B5BA5", site: "blubel", siteName: "BLUBEL", sns: "@blube_lab", lab: "ブルベ研究所" },
};

// 更生プログラム（=置き換えSKU。v19と同一の実在庫・売れ筋）
const SKUS = {
  blubel: [
    { id: 2129, name: "サテン素材の上品な長袖シャツブラウス", price: 4990, cat: "トップス" },
    { id: 1662, name: "透明感あふれる七分袖ニット", price: 4930, cat: "トップス" },
    { id: 1745, name: "優美な佇まい フレアロングワンピース", price: 4390, cat: "ワンピース" },
    { id: 1794, name: "韓国風 ダブルスクエア ネックレス", price: 3060, cat: "アクセサリー" },
  ],
  iebel: [
    { id: 2176, name: "理想のこなれ感スキッパーネックドルマン袖ブラウス", price: 3990, cat: "トップス" },
    { id: 1796, name: "シフォンブラウス 通勤きれいめ上品シャツ", price: 4290, cat: "トップス" },
    { id: 1308, name: "上品ラップ風マキシワンピース", price: 4980, cat: "ワンピース" },
    { id: 1823, name: "洗練された大ぶりフープピアス 韓国風", price: 3050, cat: "アクセサリー" },
  ],
};

// ════ 公文書トークン ════
const P = {
  paper: "#F6F5F1",      // 公文書オフホワイト
  navy: "#1E2A44",       // 制服ネイビー
  red: "#C0242C",        // パトランプ赤（検挙）
  blue: "#3B5BA5",       // 無罪青
  line: "#C9C5BB",       // 書類罫線
  faint: "#8A8578",      // 書類の薄墨
  brand: "#718297",      // 研究所ブランド（presents表記のみ）
};

async function callClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages }),
  });
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

async function aiPoliceCheck(base64, mediaType, type) {
  const prompt = `あなたは「NG色警察」の警察官AIです。パーソナルカラー${type.name}のお客様のコーデ写真を、ユーモアを込めて「取り締まり」ます。
${type.name}の苦手要素: ${type.ng.join("・")} / 得意トーン例: ${type.palette.join(", ")}

ルール:
- 服の色のみ判定。人物の容姿・体型には一切触れない
- 苦手色を顔まわり（トップス・羽織り・ストール等）に着ていたら「検挙」、そうでなければ「無罪放免」
- ボトムスや小物の苦手色は違反にしない（顔から遠いので減点程度）
- 照明で色は正確に見えない前提。判定に迷ったら無罪寄りに
- 文体は交通取り締まりのパロディ。「本官」「〜であります」口調で、面白く、でも絶対に人を傷つけない。服はあくまで「今日はたまたま」というトーンで

以下のJSONのみ出力（前置き・コードブロック禁止）:
{"verdict":"guilty"または"innocent","violation_color":"違反色の名前（無罪なら空文字）","charge":"罪状を30字以内。例『第3条 オレンジトップス着用の疑い』（無罪なら空文字）","statement":"本官のコメント70字程度。検挙なら取り調べ風に面白く、無罪なら褒めちぎる","penalty":"検挙時のみ: 行政処分として『${type.name}の得意色○○への置き換え』を50字程度で。無罪なら空文字","score":"優良運転者的な採点0-100の整数"}`;
  const text = await callClaude([
    { role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: prompt }] },
  ]);
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ════════════════════════════════════════════
// フェーズ1: ルールベース簡易判定（AI取り調べの代替）
// 写真の中央領域(顔まわり寄り)の平均色を canvas で取得 → HSL に変換 → タイプ別の
// NG色相/明度域に入れば「検挙」、それ以外は「無罪放免」。判定精度より、通信なしで
// 必ず完走することを優先。出力は aiPoliceCheck と同一のJSON形。
// ════════════════════════════════════════════
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

// 中央領域(顔まわり〜上半身に寄せて上寄り)の平均色を抽出
function averageCenterColor(img) {
  const S = 64;
  const cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0, S, S);
  const x0 = Math.floor(S * 0.3), x1 = Math.ceil(S * 0.7);
  const y0 = Math.floor(S * 0.22), y1 = Math.ceil(S * 0.68);
  const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (!n) return { r: 128, g: 128, b: 128 };
  return { r: r / n, g: g / n, b: b / n };
}

// タイプ別NG判定。{ guilty, colorName } を返す
function judgeByRule(type, hsl) {
  const { h, s, l } = hsl;
  const warmOrange = h >= 12 && h <= 50;
  const blue = h >= 200 && h <= 260;
  const bluePink = h >= 290 && h <= 345;
  switch (type.key) {
    case "spring": // NG: 黒 / グレー / 青みの強い色
      if (l < 0.22) return { guilty: true, colorName: "ブラック" };
      if (s < 0.13 && l < 0.6) return { guilty: true, colorName: "グレー" };
      if (blue && s > 0.22) return { guilty: true, colorName: "青みの強いブルー" };
      return { guilty: false, colorName: "" };
    case "summer": // NG: オレンジ / こっくりブラウン / 強い原色
      if (warmOrange && l < 0.5) return { guilty: true, colorName: "こっくりブラウン" };
      if (warmOrange) return { guilty: true, colorName: "オレンジ" };
      if (s > 0.7 && l > 0.32 && l < 0.62) return { guilty: true, colorName: "強い原色" };
      return { guilty: false, colorName: "" };
    case "autumn": // NG: ビビッド原色 / 青みピンク / 純白
      if (l > 0.88 && s < 0.16) return { guilty: true, colorName: "純白" };
      if (bluePink && s > 0.25) return { guilty: true, colorName: "青みピンク" };
      if (s > 0.8 && l > 0.4 && l < 0.7) return { guilty: true, colorName: "ビビッド原色" };
      return { guilty: false, colorName: "" };
    case "winter": // NG: くすみカラー / アイボリー / オレンジ寄り
      if (h >= 30 && h <= 60 && l > 0.72 && s < 0.5) return { guilty: true, colorName: "アイボリー" };
      if (warmOrange) return { guilty: true, colorName: "オレンジ寄りの暖色" };
      if (s > 0.1 && s < 0.3 && l > 0.32 && l < 0.72) return { guilty: true, colorName: "くすみカラー" };
      return { guilty: false, colorName: "" };
    default:
      return { guilty: false, colorName: "" };
  }
}

// 検挙時の文言（タイプ別3パターン・本官口調・服の色のみを扱う）
const RULE_GUILTY = {
  spring: [
    { charge: "第1条 重色トップス着用の疑い", statement: "本官である。顔まわりに重たい色を確認したであります。イエベ春の明るさが隠れておるぞ。今日はたまたま、と信じたい。", penalty: "コーラルピンクやキャメルなど、明るい暖色トップスへの置き換えを命ずる。" },
    { charge: "第2条 顔色くもらせ色の携行", statement: "止まりなさい。その色、透明感を曇らせておりますな。春の光を取り戻すべく、本官が指導いたすであります。", penalty: "アイボリーやライトベージュを顔まわりに。暗い色は小物へ回すよう命ずる。" },
    { charge: "第3条 春の血色 隠ぺいの疑い", statement: "本官の目はごまかせぬ。血色感が沈んで見えるであります。あなたのせいではない、色のせいであります。", penalty: "サーモンやピーチ系を一枚。顔まわりを明るく照らすよう更生を求める。" },
  ],
  summer: [
    { charge: "第1条 強い暖色トップス着用の疑い", statement: "本官である。顔まわりに強い暖色を確認したであります。ブルベ夏のやわらかさが押されておるぞ。今日はたまたま、であろう。", penalty: "ラベンダーやグレージュなど、青みのソフトカラーへの置き換えを命ずる。" },
    { charge: "第2条 こっくり色 持ち込みの疑い", statement: "止まりなさい。深い黄み色が透明感を曇らせておりますな。夏の涼やかさを取り戻すべく指導いたすであります。", penalty: "青みピンクや水色を顔まわりに。こっくり色は小物へ回すよう命ずる。" },
    { charge: "第3条 原色まぶしすぎ違反", statement: "本官の目に少々まぶしいであります。強い発色がソフトな魅力と競合しておるぞ。色のせいであり、あなたに罪はない。", penalty: "くすみパステルを一枚。夏の上品さへ更生を求める。" },
  ],
  autumn: [
    { charge: "第1条 純白トップス着用の疑い", statement: "本官である。顔まわりに真っ白を確認したであります。イエベ秋の深みが白と分離しておるぞ。今日はたまたま、と信じたい。", penalty: "エクリュやキャメルなど、生成り〜暖色ブラウンへの置き換えを命ずる。" },
    { charge: "第2条 青みピンク携行の疑い", statement: "止まりなさい。青みの強い色が顔から浮いておりますな。秋のリッチな肌なじみを取り戻すべく指導いたすであります。", penalty: "サーモンやテラコッタを顔まわりに。青みピンクは小物へ回すよう命ずる。" },
    { charge: "第3条 ビビッド原色 過剰の疑い", statement: "本官の目に鮮やかすぎるであります。派手な原色が秋の落ち着きと競合しておるぞ。色のせいであり、あなたに罪はない。", penalty: "マスタードやオリーブなど深みカラーへ。秋の余裕へ更生を求める。" },
  ],
  winter: [
    { charge: "第1条 くすみ色トップス着用の疑い", statement: "本官である。顔まわりに濁りのある色を確認したであります。ブルベ冬のシャープさがぼやけておるぞ。今日はたまたま、であろう。", penalty: "ピュアホワイトやロイヤルブルーなど、澄んだ色への置き換えを命ずる。" },
    { charge: "第2条 アイボリー携行の疑い", statement: "止まりなさい。黄みがかった白が肌の青みと分離しておりますな。冬のクリアな魅力を取り戻すべく指導いたすであります。", penalty: "真っ白か黒でコントラストを。アイボリーは小物へ回すよう命ずる。" },
    { charge: "第3条 オレンジ寄り暖色の疑い", statement: "本官の目はごまかせぬ。暖色の黄みが鮮やかさを打ち消しておるぞ。色のせいであり、あなたに罪はない。", penalty: "ワインレッドやエメラルドなど、冴えた色へ更生を求める。" },
  ],
};

// 無罪放免時の文言（タイプ別3パターン）
const RULE_INNOCENT = {
  spring: [
    "本官、隅々まで確認したが違反なし！イエベ春の明るさが見事に活きております。本日も優良配色、お見事であります。",
    "検問異常なし。顔まわりの色が春の透明感をしっかり引き立てておるであります。この調子で。",
    "無罪放免！軽やかな色づかい、本官も清々しい気持ちであります。花丸を進呈いたす。",
  ],
  summer: [
    "本官、隅々まで確認したが違反なし！ブルベ夏の透明感が涼やかに映えております。本日も優良配色、お見事であります。",
    "検問異常なし。やわらかな青みが顔まわりを上品に整えておるであります。この調子で。",
    "無罪放免！ソフトで清潔感のある色づかい、本官も涼しい気持ちであります。花丸を進呈いたす。",
  ],
  autumn: [
    "本官、隅々まで確認したが違反なし！イエベ秋の深みが上品に活きております。本日も優良配色、お見事であります。",
    "検問異常なし。こっくりした色が顔まわりをリッチに見せておるであります。この調子で。",
    "無罪放免！大人の余裕を感じる色づかい、本官も感服であります。花丸を進呈いたす。",
  ],
  winter: [
    "本官、隅々まで確認したが違反なし！ブルベ冬のコントラストが鮮やかに映えております。本日も優良配色、お見事であります。",
    "検問異常なし。澄んだ色が顔まわりを凛と引き締めておるであります。この調子で。",
    "無罪放免！クリアでシャープな色づかい、本官も惚れ惚れであります。花丸を進呈いたす。",
  ],
};

async function ruleBasedPoliceCheck(dataUrl, type) {
  const rgb = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(averageCenterColor(img));
    img.onerror = () => resolve({ r: 128, g: 128, b: 128 });
    img.src = dataUrl;
  });
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const { guilty, colorName } = judgeByRule(type, hsl);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  if (guilty) {
    const p = pick(RULE_GUILTY[type.key]);
    return { verdict: "guilty", violation_color: colorName, charge: p.charge, statement: p.statement, penalty: p.penalty, score: 45 + Math.floor(Math.random() * 24) };
  }
  return { verdict: "innocent", violation_color: "", charge: "", statement: pick(RULE_INNOCENT[type.key]), penalty: "", score: 80 + Math.floor(Math.random() * 17) };
}

// ════ 違反切符シェア画像（1080×1350） ════
function buildTicketImage(type, result) {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const guilty = result.verdict === "guilty";
  const stamp = guilty ? P.red : P.blue;

  // 背景（公文書紙）
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
  // 外枠二重線
  ctx.strokeStyle = P.navy; ctx.lineWidth = 6; ctx.strokeRect(50, 50, W - 100, H - 100);
  ctx.lineWidth = 2; ctx.strokeRect(66, 66, W - 132, H - 132);

  ctx.textAlign = "center";
  // ヘッダ
  ctx.fillStyle = P.navy; ctx.font = "600 38px serif";
  ctx.fillText("パーソナルカラー保安委員会", W / 2, 150);
  ctx.font = "700 92px serif";
  ctx.fillText(guilty ? "違 反 切 符" : "無罪放免証", W / 2, 270);
  ctx.strokeStyle = P.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(120, 310); ctx.lineTo(W - 120, 310); ctx.stroke();

  // 本文（書類項目）
  ctx.textAlign = "left";
  const row = (label, value, y) => {
    ctx.fillStyle = P.faint; ctx.font = "34px sans-serif";
    ctx.fillText(label, 140, y);
    ctx.fillStyle = P.navy; ctx.font = "600 40px sans-serif";
    ctx.fillText(value, 340, y);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(140, y + 18); ctx.lineTo(W - 140, y + 18); ctx.stroke();
  };
  row("被疑者", `${type.name}タイプの方`, 400);
  row("違反色", guilty ? result.violation_color : "なし", 480);
  row("罪 状", guilty ? (result.charge || "").slice(0, 16) : "本日も優良配色", 560);
  row("点 数", `${result.score} / 100`, 640);

  // 本官コメント（折り返し）
  ctx.fillStyle = P.faint; ctx.font = "34px sans-serif";
  ctx.fillText("本官所見", 140, 730);
  ctx.fillStyle = "#3a3f4a"; ctx.font = "36px sans-serif";
  const words = (result.statement || "").split("");
  let line = "", y = 790;
  for (const ch of words) {
    if (ctx.measureText(line + ch).width > W - 300) { ctx.fillText(line, 150, y); line = ch; y += 54; }
    else line += ch;
    if (y > 950) break;
  }
  if (line && y <= 950) ctx.fillText(line, 150, y);

  // 判子
  ctx.save();
  ctx.translate(W - 270, 1060); ctx.rotate(-0.12);
  ctx.strokeStyle = stamp; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, 110, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = stamp; ctx.font = "700 58px serif"; ctx.textAlign = "center";
  ctx.fillText(guilty ? "検挙" : "無罪", 0, -8);
  ctx.font = "600 34px serif";
  ctx.fillText(guilty ? "NG色警察" : "放 免", 0, 44);
  ctx.restore();

  // フッター
  ctx.textAlign = "center";
  ctx.fillStyle = P.brand; ctx.font = "600 34px sans-serif";
  ctx.fillText(`${type.lab} presents・NG色警察`, W / 2, H - 130);
  ctx.fillStyle = P.faint; ctx.font = "30px sans-serif";
  ctx.fillText(`あなたも出頭を → ${type.sns}`, W / 2, H - 85);

  return cv.toDataURL("image/png");
}

// ════ 小物 ════
function SkuCard({ sku, site, accent }) {
  return (
    <a href={ITEM_URL(site, sku.id)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl p-3.5 mb-2 transition-shadow hover:shadow-md" style={{ border: "1px solid " + P.line, background: "white" }}>
      <span className="text-[10px] px-2 py-1 rounded shrink-0 text-white" style={{ background: accent }}>{sku.cat}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium leading-snug truncate" style={{ color: P.navy }}>{sku.name}</span>
        <span className="block text-[11px] mt-0.5" style={{ color: P.faint }}>¥{sku.price.toLocaleString()}</span>
      </span>
      <ExternalLink size={13} style={{ color: P.faint }} />
    </a>
  );
}

export default function NgColorPolice() {
  const [step, setStep] = useState("cover"); // cover / type / upload / result
  const [myType, setMyType] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(null);
  const fileRef = useRef(null);
  const b64 = useRef(null);
  const T = myType ? TYPES[myType] : null;

  const reset = () => { setStep("cover"); setPreview(null); setResult(null); setTicket(null); setError(""); b64.current = null; };

  return (
    <div className="min-h-screen flex items-start justify-center py-6 px-3" style={{ background: "#E9E7E0", fontFamily: "'Noto Sans JP', sans-serif" }}>
      <style>{`
        .paper { background: ${P.paper}; }
        .stamp-in { animation: stampIn .45s cubic-bezier(.2,1.6,.4,1) both; }
        @keyframes stampIn { 0% { transform: scale(2.4) rotate(-12deg); opacity: 0; } 100% { transform: scale(1) rotate(-7deg); opacity: 1; } }
        .fade-up { animation: fadeUp .4s ease both; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .stamp-in, .fade-up { animation: none; } }
      `}</style>
      <div className="w-full max-w-md paper rounded-lg overflow-hidden" style={{ border: `3px double ${P.navy}`, boxShadow: "0 8px 30px rgba(30,42,68,.18)" }}>

        {/* ═══ 表紙 ═══ */}
        {step === "cover" && (
          <div className="px-8 py-12 text-center fade-up">
            <div className="text-[11px] tracking-[0.3em] mb-6" style={{ color: P.brand }}>ブルベ研究所・イエベ研究所 presents</div>
            <Siren size={44} className="mx-auto mb-4" style={{ color: P.red }} />
            <h1 className="text-4xl font-bold mb-1" style={{ color: P.navy, fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.15em" }}>NG色警察</h1>
            <p className="text-xs tracking-widest mb-8" style={{ color: P.faint }}>PERSONAL COLOR POLICE DEPT.</p>
            <div className="rounded-lg p-5 mb-8 text-left" style={{ border: `1px solid ${P.line}`, background: "white" }}>
              <p className="text-sm leading-relaxed" style={{ color: P.navy }}>
                本官が、あなたの今日のコーデを<br />取り締まります。<br />
                <span className="text-xs" style={{ color: P.faint }}>似合わない色を着ていた場合、違反切符を切らせていただくのでそのつもりで。</span>
              </p>
            </div>
            <button onClick={() => setStep("type")} className="w-full py-4 rounded text-white text-sm font-bold tracking-widest transition-transform hover:scale-105" style={{ background: P.navy }}>
              出頭する →
            </button>
            <p className="mt-4 text-[10px]" style={{ color: P.faint }}>※服の色だけを楽しく判定します。容姿の評価は一切しません。</p>
          </div>
        )}

        {/* ═══ タイプ選択 ═══ */}
        {step === "type" && (
          <div className="px-8 py-10 fade-up">
            <div className="text-[11px] tracking-widest mb-1" style={{ color: P.faint }}>供述調書 第1項</div>
            <h2 className="text-xl font-bold mb-5" style={{ color: P.navy, fontFamily: "'Noto Serif JP', serif" }}>あなたのパーソナルカラーは？</h2>
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {Object.values(TYPES).map((t) => (
                <button key={t.key} onClick={() => { setMyType(t.key); setStep("upload"); }} className="rounded-lg p-4 text-left transition-shadow hover:shadow-md" style={{ border: `1px solid ${P.line}`, background: "white" }}>
                  <div className="flex gap-1 mb-2">{t.palette.map((c, i) => <span key={i} className="w-4 h-4 rounded-full" style={{ background: c, border: "1px solid #eee" }} />)}</div>
                  <div className="text-sm font-medium" style={{ color: P.navy }}>{t.name}</div>
                </button>
              ))}
            </div>
            <a href={MAIN_APP_URL("blubel")} target="_blank" rel="noreferrer" className="block text-center text-xs underline" style={{ color: P.brand }}>
              自分のタイプがわからない → 本家アプリで診断（無料）
            </a>
          </div>
        )}

        {/* ═══ 写真提出 ═══ */}
        {step === "upload" && T && (
          <div className="px-8 py-10 fade-up">
            <div className="text-[11px] tracking-widest mb-1" style={{ color: P.faint }}>証拠品の提出</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: P.navy, fontFamily: "'Noto Serif JP', serif" }}>本日のコーデ写真を提出せよ</h2>
            <p className="text-xs leading-relaxed mb-5" style={{ color: P.faint }}>
              全身または服がよく見える写真。写真は取り調べ（判定）のためだけに使われ、保存・送信されません。
            </p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              setError("");
              const reader = new FileReader();
              reader.onload = () => { setPreview(reader.result); b64.current = { data: String(reader.result).split(",")[1], mt: f.type || "image/jpeg" }; };
              reader.readAsDataURL(f);
            }} />
            {!preview && (
              <button onClick={() => fileRef.current && fileRef.current.click()} className="w-full rounded-lg py-12 flex flex-col items-center gap-3 mb-4" style={{ border: `2px dashed ${P.line}`, color: P.faint, background: "white" }}>
                <Camera size={26} style={{ color: P.navy }} />
                <span className="text-sm">写真を選ぶ / 撮影する</span>
              </button>
            )}
            {preview && <div className="rounded-lg overflow-hidden mb-4" style={{ border: `1px solid ${P.line}` }}><img src={preview} alt="コーデ" className="w-full block" /></div>}
            {preview && (
              <>
                <button disabled={loading} onClick={async () => {
                  if (!b64.current) return;
                  setLoading(true); setError("");
                  try {
                    const r = AI_ENABLED
                      ? await aiPoliceCheck(b64.current.data, b64.current.mt, T)
                      : await ruleBasedPoliceCheck(preview, T);
                    setResult(r);
                    setTicket(buildTicketImage(T, r));
                    setStep("result");
                  } catch (err) {
                    setError("取り調べに失敗しました。写真を変えるか、少し待って再提出してください。");
                  }
                  setLoading(false);
                }} className="w-full py-4 rounded text-white text-sm font-bold tracking-widest mb-2 transition-transform hover:scale-105 disabled:opacity-60" style={{ background: P.red }}>
                  {loading ? "取り調べ中…（10秒ほど）" : "🚨 取り調べを受ける"}
                </button>
                <button onClick={() => { setPreview(null); b64.current = null; }} className="w-full py-2.5 rounded text-xs" style={{ border: `1px solid ${P.line}`, color: P.faint, background: "white" }}>別の写真にする</button>
              </>
            )}
            {error && <p className="text-xs mt-3 text-center" style={{ color: P.red }}>{error}</p>}
          </div>
        )}

        {/* ═══ 判決 ═══ */}
        {step === "result" && T && result && (() => {
          const guilty = result.verdict === "guilty";
          const stamp = guilty ? P.red : P.blue;
          return (
            <div className="px-6 py-8 fade-up">
              {/* 違反切符カード */}
              <div className="relative rounded p-5 mb-5" style={{ border: `2px solid ${P.navy}`, background: "white" }}>
                <div className="text-center text-[10px] tracking-widest mb-1" style={{ color: P.faint }}>パーソナルカラー保安委員会</div>
                <div className="text-center text-2xl font-bold mb-3" style={{ color: P.navy, fontFamily: "'Noto Serif JP', serif", letterSpacing: "0.2em" }}>{guilty ? "違 反 切 符" : "無罪放免証"}</div>
                <div className="text-xs space-y-2" style={{ color: P.navy }}>
                  <div className="flex justify-between pb-1" style={{ borderBottom: `1px solid ${P.line}` }}><span style={{ color: P.faint }}>被疑者</span><span className="font-medium">{T.name}タイプの方</span></div>
                  <div className="flex justify-between pb-1" style={{ borderBottom: `1px solid ${P.line}` }}><span style={{ color: P.faint }}>違反色</span><span className="font-medium">{guilty ? result.violation_color : "なし"}</span></div>
                  {guilty && <div className="flex justify-between pb-1" style={{ borderBottom: `1px solid ${P.line}` }}><span style={{ color: P.faint }}>罪状</span><span className="font-medium text-right">{result.charge}</span></div>}
                  <div className="flex justify-between pb-1" style={{ borderBottom: `1px solid ${P.line}` }}><span style={{ color: P.faint }}>点数</span><span className="font-medium">{result.score} / 100</span></div>
                </div>
                <p className="text-xs leading-relaxed mt-3 p-3 rounded" style={{ color: "#3a3f4a", background: P.paper }}>
                  <span className="font-medium" style={{ color: P.navy }}>本官所見：</span>{result.statement}
                </p>
                {/* 判子 */}
                <div className="stamp-in absolute -top-3 -right-2 w-20 h-20 rounded-full flex flex-col items-center justify-center rotate-[-7deg]" style={{ border: `4px solid ${stamp}`, color: stamp, background: "rgba(255,255,255,.75)" }}>
                  <span className="font-bold text-lg leading-none" style={{ fontFamily: "'Noto Serif JP', serif" }}>{guilty ? "検挙" : "無罪"}</span>
                  <span className="text-[9px] mt-0.5">{guilty ? "NG色警察" : "放免"}</span>
                </div>
              </div>

              {/* 行政処分＝更生プログラム */}
              {guilty && result.penalty && (
                <div className="rounded p-4 mb-4" style={{ background: "#FBEFEF", border: `1px solid ${P.red}33` }}>
                  <div className="text-xs font-bold mb-1" style={{ color: P.red }}>行政処分（更生プログラム）</div>
                  <p className="text-xs leading-relaxed" style={{ color: "#5a3a3a" }}>{result.penalty}</p>
                </div>
              )}

              <div className="text-xs mb-2" style={{ color: P.faint }}>{guilty ? `更生用の${T.name}優良物件（${T.siteName}）` : `さらに点数を伸ばす${T.name}の得意色（${T.siteName}）`}</div>
              {SKUS[T.site].slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={T.site} accent={T.accent} />)}

              {/* シェア */}
              {ticket && (
                <a href={ticket} download={`ng_police_${T.key}.png`} className="flex items-center justify-center gap-2 w-full py-3.5 rounded text-white text-sm font-bold mt-4 mb-2 transition-transform hover:scale-105" style={{ background: P.navy }}>
                  <Download size={15} /> {guilty ? "違反切符を保存してシェア" : "無罪放免証を保存して自慢"}
                </a>
              )}

              {/* 本家＆LINE合流 */}
              <a href={MAIN_APP_URL(T.site)} target="_blank" rel="noreferrer" className="block w-full text-center py-3.5 rounded mt-1 mb-2 transition-transform hover:scale-105" style={{ background: P.brand, color: "#fff" }}>
                <span className="block text-[11px] opacity-90 mb-0.5">ちゃんと似合う色を知りたい方へ</span>
                <span className="inline-flex items-center gap-1.5 text-base font-bold">本家診断アプリで本格診断する <ArrowRight size={16} /></span>
              </a>
              <a href={LINE_URLS[T.site]} target="_blank" rel="noreferrer" className="block w-full text-center py-3.5 rounded text-white mb-4 transition-transform hover:scale-105" style={{ background: "#06C755" }}>
                <span className="block text-[11px] opacity-95 mb-0.5">毎週届く・いつでもブロックOK</span>
                <span className="block text-base font-bold">LINEで「{T.name}の勝ち色」を受け取る</span>
              </a>

              <button onClick={reset} className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded text-xs" style={{ border: `1px solid ${P.line}`, color: P.faint, background: "white" }}>
                <RotateCcw size={13} /> 最初からやり直す
              </button>
              <p className="mt-4 text-center text-[10px] leading-relaxed" style={{ color: P.faint }}>
                ※判定は色の傾向を楽しむジョークです。どんな色も、あなたが好きなら正解。<br />{T.lab} presents
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
