import React, { useState, useEffect } from "react";
import {
  Palette, Shirt, Ban, Droplet, Scissors, Heart, Sparkles,
  ArrowLeft, ArrowRight, Instagram, RotateCcw, Camera, Share2,
} from "lucide-react";

/* --- 診断イラスト(AI生成・左右ペアを分割してWebP化したもの) -------------------
   test/build_quiz_art.mjs で src/assets/<元PNG> から生成する。
   vite の assetsInlineLimit で base64 としてバンドルに内包される。 */
import Q01A from "./assets/mens_q01_skin_warm.webp";
import Q01B from "./assets/mens_q01_skin_cool.webp";
import Q03A from "./assets/mens_q03_eye_light.webp";
import Q03B from "./assets/mens_q03_eye_deep.webp";
import Q04A from "./assets/mens_q04_wrist_green.webp";
import Q04B from "./assets/mens_q04_wrist_blue.webp";
import Q08A from "./assets/mens_q08_knit_light.webp";
import Q08B from "./assets/mens_q08_knit_deep.webp";
import Q11A from "./assets/mens_q11_flush_tan.webp";
import Q11B from "./assets/mens_q11_flush_pink.webp";
import Q13A from "./assets/mens_q13_hair_brown.webp";
import Q13B from "./assets/mens_q13_hair_black.webp";
import Q06A from "./assets/mens_q06_tee_offwhite.webp";
import Q06B from "./assets/mens_q06_tee_white.webp";

/* =========================================================================
 * 清潔感カラー診断（メンズ版） v1
 * - 女性版 color_lab_stylist_v23.jsx とはソースを完全分離（女性版は一切編集しない）
 * - 商品・アフィリ・LINE導線は一切持たない。出口は IG フォローとスクショのみ
 * - 診断中は「ブルベ/イエベ」を出さず「青みタイプ/黄みタイプ」。結果画面でのみ正式名称を併記
 * ====================================================================== */

const IG_HANDLE = "@seiketsu_lab";
const IG_URL = "https://www.instagram.com/seiketsu_lab/";
const PAGE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_MENS_PAGE_URL) ||
  // Shopify側の制約でスラッグにハイフンが使えず personalcolormens で確定（2026-07-19 設置済み）。
  "https://www.iebel.jp/pages/personalcolormens";

/* --- 清潔感研究所のカラートークン（IG レンダラと同一値） ------------------ */
const C = {
  navy: "#1F2A44",
  navy2: "#2E3B57",
  accent: "#9CBCE0",
  accent2: "#5B7FAC",
  ink: "#1F2A44",
  card: "#FFFFFF",
  rule: "#DCE1E9",
  faint: "#6E7887",
  tint: "#E7EBF0",
  pageBg: "linear-gradient(170deg,#E6EAEF 0%,#EAEDF2 52%,#E4E8EE 100%)",
};

/* --- localStorage（private browsing でも落ちないよう全て try/catch） ------- */
const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};
const STORE_KEY = "seiketsu-color-profile";

/* =========================================================================
 * タイプ定義
 *  - key/num は女性版とスコアリング互換（1=spring 2=summer 3=autumn 4=winter）
 *  - name    … 診断中も使える中立名（青みタイプ / 黄みタイプ）
 *  - formal  … 結果画面でのみ併記する正式名称
 * ====================================================================== */
const TYPES = {
  spring: {
    key: "spring", num: 1,
    name: "黄みタイプ・明るめ", formal: "イエベ春", en: "Spring",
    catch: "軽くて明るい暖色が似合う。重い色ほど老けて見えるタイプ。",
    accent: "#C98A4B",
    palette: ["#F5EFE3", "#D8C3A2", "#BE8747", "#3E5A7E", "#E8907C"],
    palette10: [
      ["アイボリー", "#F5EFE3"], ["ライトベージュ", "#D8C3A2"], ["キャメル", "#BE8747"],
      ["ライトネイビー", "#3E5A7E"], ["コーラル", "#E8907C"], ["ソフトブラウン", "#A6764C"],
      ["ライトデニム", "#7196BC"], ["生成り", "#EFE6D6"], ["アプリコット", "#E0A96D"],
      ["ライトカーキ", "#9C9A6E"],
    ],
  },
  summer: {
    key: "summer", num: 2,
    name: "青みタイプ・やわらか", formal: "ブルベ夏", en: "Summer",
    catch: "青みのある淡い色が似合う。強い色より、少し霞んだ色が武器。",
    accent: "#5B7FAC",
    palette: ["#F3F0F5", "#B7BCC4", "#A9C4DE", "#40527A", "#C99BAC"],
    palette10: [
      ["オフホワイト", "#F3F0F5"], ["ライトグレー", "#B7BCC4"], ["ミディアムグレー", "#8A929E"],
      ["サックスブルー", "#A9C4DE"], ["ペールブルー", "#BBD3E8"], ["ネイビー", "#40527A"],
      ["スモーキーモーヴ", "#C99BAC"], ["ブルーグレー", "#93A5B8"], ["ラベンダー", "#B5AECB"],
      ["シルバーグレー", "#C9CCD2"],
    ],
  },
  autumn: {
    key: "autumn", num: 3,
    name: "黄みタイプ・深め", formal: "イエベ秋", en: "Autumn",
    catch: "深く濁った暖色が似合う。明るくしすぎると印象がぼやけるタイプ。",
    accent: "#8B5E34",
    palette: ["#F0E6D2", "#B49B75", "#6B6B3A", "#8B5E34", "#B5643F"],
    palette10: [
      ["クリーム", "#F0E6D2"], ["ダークベージュ", "#B49B75"], ["オリーブ", "#6B6B3A"],
      ["マスタード", "#C89A3C"], ["キャメルブラウン", "#8B5E34"], ["テラコッタ", "#B5643F"],
      ["ダークブラウン", "#4E3A2C"], ["チャコールブラウン", "#4A403A"], ["カーキ", "#7C7A55"],
      ["レンガ", "#94472F"],
    ],
  },
  winter: {
    key: "winter", num: 4,
    name: "青みタイプ・くっきり", formal: "ブルベ冬", en: "Winter",
    catch: "白黒がはっきりした色が似合う。中間色ほど顔がぼやけるタイプ。",
    accent: "#2A4FA0",
    palette: ["#FFFFFF", "#9AA0A8", "#2B2E33", "#2A4FA0", "#7B2137"],
    palette10: [
      ["純白", "#FFFFFF"], ["ブラック", "#171717"], ["チャコールグレー", "#2B2E33"],
      ["ライトグレー", "#9AA0A8"], ["ロイヤルブルー", "#2A4FA0"], ["ネイビー", "#23325C"],
      ["ワインレッド", "#7B2137"], ["アイスブルー", "#BFD6EA"], ["シルバー", "#C6CBD1"],
      ["ボルドー", "#5C1A2B"],
    ],
  },
};
const NUM2KEY = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };
const TYPE_KEYS = ["spring", "summer", "autumn", "winter"];

/* =========================================================================
 * ★ タイプ別カラーコーデ提案（ビジネス / カジュアル / デート）
 * ====================================================================== */
const SCENES = [
  { id: "business", label: "ビジネス" },
  { id: "casual", label: "カジュアル" },
  { id: "date", label: "デート" },
];

const COORD = {
  spring: {
    business: {
      base: ["ライトネイビー", "#3E5A7E"], top: ["アイボリーシャツ", "#F5EFE3"], acc: ["キャメルレザー", "#BE8747"],
      text: "ライトネイビージャケット × アイボリーシャツ × キャメルのベルトと靴",
      note: "黒より明るいネイビー、白よりアイボリー。顔まわりに影を作らないのがこのタイプの鉄則。",
    },
    casual: {
      base: ["ベージュチノ", "#D8C3A2"], top: ["白T", "#FBF8F1"], acc: ["ライトデニムシャツ", "#7196BC"],
      text: "ベージュチノ × 白T × 明るいデニムシャツを羽織る",
      note: "全体を明るくまとめて、羽織りで軽く色を足す。濃紺デニムより色落ちデニムが合う。",
    },
    date: {
      base: ["ソフトブラウンパンツ", "#A6764C"], top: ["コーラルニット", "#E8907C"], acc: ["生成りスニーカー", "#EFE6D6"],
      text: "ソフトブラウンパンツ × コーラルニット × 生成りスニーカー",
      note: "血色に寄せた明るい暖色を顔の近くに。黒スニーカーだけは足元が重くなるので避ける。",
    },
  },
  summer: {
    business: {
      base: ["ミディアムグレー", "#8A929E"], top: ["サックスブルーシャツ", "#A9C4DE"], acc: ["ネイビータイ", "#3B4E6B"],
      text: "ミディアムグレースーツ × サックスブルーシャツ × ネイビータイ",
      note: "黒スーツより明るいグレー。青みのシャツで肌の透明感がそのまま出る。",
    },
    casual: {
      base: ["ライトグレーパンツ", "#B7BCC4"], top: ["オフホワイトT", "#F3F0F5"], acc: ["ペールブルーシャツ", "#BBD3E8"],
      text: "ライトグレーパンツ × オフホワイトT × ペールブルーシャツ",
      note: "同系色の濃淡だけでまとめるのが一番きれいに見える。差し色は入れなくていい。",
    },
    date: {
      base: ["ネイビーパンツ", "#40527A"], top: ["モーヴニット", "#C99BAC"], acc: ["グレースニーカー", "#C9CCD2"],
      text: "ネイビーパンツ × くすみモーヴのニット × グレースニーカー",
      note: "くすんだ赤紫はこのタイプだけが自然に着られる色。やわらかい印象が出る。",
    },
  },
  autumn: {
    business: {
      base: ["ダークブラウン", "#4E3A2C"], top: ["クリームシャツ", "#F0E6D2"], acc: ["こげ茶レザー", "#8B5E34"],
      text: "ダークブラウンスーツ × クリームシャツ × こげ茶レザー小物",
      note: "白シャツをクリームに替えるだけで顔のくすみが消える。革小物は黒より茶。",
    },
    casual: {
      base: ["オリーブパンツ", "#6B6B3A"], top: ["マスタードニット", "#C89A3C"], acc: ["ダークベージュキャップ", "#B49B75"],
      text: "オリーブパンツ × マスタードニット × ダークベージュのキャップ",
      note: "濁った暖色同士を重ねる。彩度を上げすぎないほど洗練して見える。",
    },
    date: {
      base: ["チャコールブラウン", "#4A403A"], top: ["テラコッタシャツ", "#B5643F"], acc: ["レザーブーツ", "#6B4A30"],
      text: "チャコールブラウンパンツ × テラコッタシャツ × レザーブーツ",
      note: "赤みのある土色を顔の近くに置くと血色が良く見える。ツヤよりマットな素材で。",
    },
  },
  winter: {
    business: {
      base: ["チャコールグレー", "#2B2E33"], top: ["純白シャツ", "#FFFFFF"], acc: ["ロイヤルブルータイ", "#2A4FA0"],
      text: "チャコールグレースーツ × 純白シャツ × ロイヤルブルーのタイ",
      note: "生成りではなく純白。明暗の差がはっきりするほど顔が引き締まって見える。",
    },
    casual: {
      base: ["ブラックデニム", "#23252A"], top: ["純白T", "#FFFFFF"], acc: ["グレーパーカー", "#9AA0A8"],
      text: "ブラックデニム × 純白T × グレーパーカー",
      note: "白と黒の2色だけで組むのが最も強い。中途半端なベージュを混ぜない。",
    },
    date: {
      base: ["ネイビーパンツ", "#23325C"], top: ["ワインレッドニット", "#7B2137"], acc: ["シルバー時計・黒レザー", "#171717"],
      text: "ネイビーパンツ × ワインレッドニット × シルバー時計と黒レザー",
      note: "深く冴えた赤が映えるのはこのタイプだけ。金属小物はゴールドよりシルバー。",
    },
  },
};

/* =========================================================================
 * NGカラー（老けて見える色 / 疲れて見える色）
 * ====================================================================== */
const NG_COLORS = {
  spring: [
    { name: "真っ黒", hex: "#141414", why: "顔まわりに強い影が落ちて、実年齢より老けて見えやすい", alt: { name: "ライトネイビー", hex: "#3E5A7E" } },
    { name: "くすんだグレー", hex: "#7E8085", why: "血色が抜けて、疲れているように見える", alt: { name: "ライトベージュ", hex: "#D8C3A2" } },
    { name: "濃いワインレッド", hex: "#5C1A2B", why: "色の重さが顔に落ちて、表情が沈んで見える", alt: { name: "コーラル", hex: "#E8907C" } },
    { name: "青みの強いパープル", hex: "#6B4E8F", why: "肌の黄みとぶつかって、顔色がにごって見える", alt: { name: "ライトカーキ", hex: "#9C9A6E" } },
  ],
  summer: [
    { name: "こっくりブラウン", hex: "#6B4A30", why: "肌の透明感が消えて、疲れ顔に見える", alt: { name: "ネイビー", hex: "#40527A" } },
    { name: "マスタード（黄土色）", hex: "#C89A3C", why: "顔の黄ぐすみが強調される", alt: { name: "サックスブルー", hex: "#A9C4DE" } },
    { name: "鮮やかなオレンジ", hex: "#E0651F", why: "肌と喧嘩して、赤黒く見えてしまう", alt: { name: "スモーキーモーヴ", hex: "#C99BAC" } },
    { name: "真っ黒", hex: "#141414", why: "コントラストが強すぎて顔だけが浮いて見える", alt: { name: "ミディアムグレー", hex: "#8A929E" } },
  ],
  autumn: [
    { name: "純白", hex: "#FFFFFF", why: "肌の黄みが浮いて、顔がくすんで見える", alt: { name: "クリーム", hex: "#F0E6D2" } },
    { name: "青みピンク", hex: "#D96BA0", why: "肌となじまず、疲れた印象になる", alt: { name: "テラコッタ", hex: "#B5643F" } },
    { name: "アイスブルー", hex: "#BFD6EA", why: "顔色が抜けて、血色が悪く見える", alt: { name: "カーキ", hex: "#7C7A55" } },
    { name: "蛍光色・ビビッドな原色", hex: "#00C2FF", why: "色だけが浮いて、肌の質感が粗く見える", alt: { name: "マスタード", hex: "#C89A3C" } },
  ],
  winter: [
    { name: "ベージュ", hex: "#D8C3A2", why: "顔の輪郭がぼやけて、生気が抜けて見える", alt: { name: "ライトグレー", hex: "#9AA0A8" } },
    { name: "オレンジブラウン", hex: "#A6552A", why: "肌がくすんで、老けた印象になる", alt: { name: "ワインレッド", hex: "#7B2137" } },
    { name: "カーキ・オリーブ", hex: "#6B6B3A", why: "顔色が沈んで、疲れて見える", alt: { name: "ロイヤルブルー", hex: "#2A4FA0" } },
    { name: "くすんだクリーム", hex: "#EFE3C8", why: "肌の白さが濁って見える", alt: { name: "純白", hex: "#FFFFFF" } },
  ],
};

/* =========================================================================
 * この色、似合う？（24色 × 4タイプ）
 * ====================================================================== */
const COLOR_CHECK = [
  { name: "純白", hex: "#FFFFFF", r: { spring: "○", summer: "○", autumn: "△", winter: "◎" } },
  { name: "アイボリー", hex: "#F5EFE3", r: { spring: "◎", summer: "○", autumn: "◎", winter: "△" } },
  { name: "ライトグレー", hex: "#C9CCD2", r: { spring: "△", summer: "◎", autumn: "△", winter: "○" } },
  { name: "チャコールグレー", hex: "#2B2E33", r: { spring: "△", summer: "○", autumn: "○", winter: "◎" } },
  { name: "ブラック", hex: "#171717", r: { spring: "✕", summer: "△", autumn: "○", winter: "◎" } },
  { name: "ネイビー", hex: "#23325C", r: { spring: "○", summer: "◎", autumn: "○", winter: "◎" } },
  { name: "ライトネイビー", hex: "#3E5A7E", r: { spring: "◎", summer: "◎", autumn: "△", winter: "○" } },
  { name: "サックスブルー", hex: "#A9C4DE", r: { spring: "○", summer: "◎", autumn: "△", winter: "○" } },
  { name: "ロイヤルブルー", hex: "#2A4FA0", r: { spring: "○", summer: "○", autumn: "△", winter: "◎" } },
  { name: "アイスブルー", hex: "#BFD6EA", r: { spring: "△", summer: "◎", autumn: "✕", winter: "◎" } },
  { name: "ベージュ", hex: "#D8C3A2", r: { spring: "◎", summer: "△", autumn: "◎", winter: "✕" } },
  { name: "キャメル", hex: "#BE8747", r: { spring: "◎", summer: "△", autumn: "◎", winter: "✕" } },
  { name: "ダークブラウン", hex: "#4E3A2C", r: { spring: "△", summer: "✕", autumn: "◎", winter: "△" } },
  { name: "オリーブ", hex: "#6B6B3A", r: { spring: "○", summer: "△", autumn: "◎", winter: "✕" } },
  { name: "カーキ", hex: "#7C7A55", r: { spring: "○", summer: "△", autumn: "◎", winter: "✕" } },
  { name: "マスタード", hex: "#C89A3C", r: { spring: "○", summer: "✕", autumn: "◎", winter: "△" } },
  { name: "テラコッタ", hex: "#B5643F", r: { spring: "○", summer: "✕", autumn: "◎", winter: "△" } },
  { name: "コーラル", hex: "#E8907C", r: { spring: "◎", summer: "○", autumn: "○", winter: "△" } },
  { name: "ワインレッド", hex: "#7B2137", r: { spring: "△", summer: "○", autumn: "○", winter: "◎" } },
  { name: "モーヴ", hex: "#C99BAC", r: { spring: "△", summer: "◎", autumn: "△", winter: "○" } },
  { name: "ラベンダー", hex: "#B5AECB", r: { spring: "△", summer: "◎", autumn: "✕", winter: "○" } },
  { name: "フォレストグリーン", hex: "#2F5D46", r: { spring: "○", summer: "○", autumn: "◎", winter: "○" } },
  { name: "ミントグリーン", hex: "#A8D8C8", r: { spring: "◎", summer: "◎", autumn: "△", winter: "○" } },
  { name: "パープル", hex: "#5B3E8F", r: { spring: "✕", summer: "○", autumn: "△", winter: "◎" } },
];
const RATING_LABEL = { "◎": "かなり似合う", "○": "似合う", "△": "使い方次第", "✕": "苦手な色" };
const RATING_TIP = {
  "◎": "顔の近く（シャツ・ニット・タイ）に持ってきて正解の色。",
  "○": "普通に着ていい色。面積を広くとっても破綻しない。",
  "△": "顔から離す（パンツ・靴）なら問題ない。トップスに使うなら小面積で。",
  "✕": "顔まわりには置かない。どうしても着るならインナーに白系を挟む。",
};

/* =========================================================================
 * 髪色
 * ====================================================================== */
const HAIR = {
  spring: {
    tip: "赤みより黄みを残して1トーン明るく。地毛より少し明るいだけで顔まわりが軽く見える。",
    colors: [["ライトブラウン", "#8B5E3C"], ["ゴールドベージュ", "#A87B4A"], ["ミルクティーベージュ", "#B08D63"]],
  },
  summer: {
    tip: "黄みを抑えたアッシュ系。暗めにしても重く見えないのがこのタイプの強み。",
    colors: [["アッシュブラウン", "#6E6259"], ["グレージュ", "#857B72"], ["ダークアッシュ", "#4A4A50"]],
  },
  autumn: {
    tip: "深く落ち着いたブラウン。明るくしすぎるほど印象がぼやけるので暗めで正解。",
    colors: [["ダークブラウン", "#4E3A2C"], ["チョコレートブラウン", "#3E2A20"], ["オリーブブラウン", "#5A4A32"]],
  },
  winter: {
    tip: "黒に近いほど輪郭が締まる。明るい茶にすると顔の印象が散りやすい。",
    colors: [["ブルーブラック", "#1B1D24"], ["ダークアッシュブラック", "#26272C"], ["黒髪（地毛）", "#141414"]],
  },
};

/* =========================================================================
 * ふたりの相性配色（10通り）
 * ====================================================================== */
const PAIR = {
  "spring-spring": { title: "そろって軽い、明るい二人", colors: ["#F5EFE3", "#BE8747", "#3E5A7E"], text: "どちらも明るい色が似合うので、二人ともベージュ〜アイボリーで揃えると並んだ時の統一感が出る。片方だけ黒を着ると急に浮くので注意。" },
  "spring-summer": { title: "明るさと澄んだ軽さ", colors: ["#F5EFE3", "#A9C4DE", "#3E5A7E"], text: "共通して使えるのがライトネイビーとオフホワイト。黄み側はベージュ、青み側はグレーを足すと自然に馴染む。" },
  "spring-autumn": { title: "同じ黄み、明るさで差をつける", colors: ["#D8C3A2", "#8B5E34", "#EFE6D6"], text: "同じ黄みタイプ同士なのでブラウン系で揃えやすい。明るめ側がベージュ、深め側がダークブラウンにすると濃淡が生まれる。" },
  "spring-winter": { title: "いちばん差がある組み合わせ", colors: ["#F5EFE3", "#2B2E33", "#3E5A7E"], text: "似合う色が正反対。共通項はネイビー。片方が明るいベージュ、片方が黒でも、ネイビーを挟むと並びが整う。" },
  "summer-summer": { title: "静かに揃う二人", colors: ["#F3F0F5", "#B7BCC4", "#40527A"], text: "グレーの濃淡だけで組めるペア。二人とも同じトーンなので、色数を増やさないほどきれいに見える。" },
  "summer-autumn": { title: "淡さと深さのコントラスト", colors: ["#B7BCC4", "#6B6B3A", "#F0E6D2"], text: "青みと黄みで方向が違うので、片方を必ず無彩色に寄せる。グレー × オリーブが最も破綻しない。" },
  "summer-winter": { title: "同じ青み、強さで差をつける", colors: ["#A9C4DE", "#23325C", "#FFFFFF"], text: "同じ青みタイプ同士。淡い側がサックスブルー、くっきり側がネイビーや白黒にすると、同系統のまま差が出る。" },
  "autumn-autumn": { title: "深い色で揃う二人", colors: ["#4E3A2C", "#C89A3C", "#F0E6D2"], text: "ブラウンとオリーブで揃えられる唯一のペア。二人とも彩度を抑えるほど大人っぽくまとまる。" },
  "autumn-winter": { title: "深さとくっきりの間", colors: ["#4A403A", "#7B2137", "#2B2E33"], text: "共通で使えるのがワインレッドとチャコール。ベージュとアイスブルーはどちらかが必ず負けるので避ける。" },
  "winter-winter": { title: "白黒で完成する二人", colors: ["#FFFFFF", "#171717", "#2A4FA0"], text: "二人とも白黒がはっきりした色が得意。中間色を混ぜず、白・黒・ネイビーだけで組むと並びが最も締まる。" },
};
const pairKey = (a, b) =>
  TYPE_KEYS.indexOf(a) <= TYPE_KEYS.indexOf(b) ? `${a}-${b}` : `${b}-${a}`;

/* =========================================================================
 * 骨格診断（S/W/N）
 * ====================================================================== */
const FRAMES = {
  S: {
    key: "S", name: "ストレート", accent: "#5B7FAC",
    catch: "厚みがあり、体の面がはっきり出るタイプ。",
    good: ["ジャストサイズのシャツ", "Vネック・開きのある襟", "落ち感のあるスラックス", "薄手で目の詰まった生地"],
    bad: ["オーバーサイズの重ね着", "モコモコした厚手ニット", "ハイネックの詰まった襟"],
  },
  W: {
    key: "W", name: "ウェーブ", accent: "#8A929E",
    catch: "薄みがあり、上半身が華奢に見えるタイプ。",
    good: ["やや細身のトップス", "ハイネック・タートル", "柔らかい素材のニット", "上半身に情報量を足す重ね着"],
    bad: ["厚手のごつい生地", "深いVネック", "下半身にボリュームが集中する形"],
  },
  N: {
    key: "N", name: "ナチュラル", accent: "#6B6B3A",
    catch: "骨や関節がしっかり出る、フレーム感のあるタイプ。",
    good: ["オーバーサイズ", "リネン・コットンなど質感のある生地", "ラフなシルエット", "重ね着"],
    bad: ["体に沿うぴったりしたトップス", "光沢の強いツルツルした素材", "きっちりしすぎた細身"],
  },
};
const FQ = [
  { q: "手首の骨の出方は？", a: "あまり目立たない・丸い", b: "はっきり出ている・角ばる", A: ["S", "W"], B: ["N"] },
  { q: "鎖骨は？", a: "ほとんど見えない", b: "はっきり浮き出て見える", A: ["S"], B: ["W", "N"] },
  { q: "体の厚み（横から見た時）は？", a: "厚みがある", b: "薄い", A: ["S", "N"], B: ["W"] },
  { q: "太りやすいのは？", a: "お腹・上半身から", b: "下半身から", A: ["S", "N"], B: ["W"] },
  { q: "肌の質感は？", a: "ハリがあって弾力を感じる", b: "やわらかく、筋張って見える", A: ["S"], B: ["W", "N"] },
  { q: "膝のお皿は？", a: "小さくて目立たない", b: "大きくてはっきり出る", A: ["S", "W"], B: ["N"] },
];

/* =========================================================================
 * 12タイプ診断（13問）
 *  配点: 色相軸 A:[1,3]=黄み / B:[2,4]=青み   明度軸 A:[1,2]=明るい / B:[3,4]=深い
 *  ※ 設問・選択肢に「ブルベ/イエベ」は一切出さない
 * ====================================================================== */
const Q = [
  { q: "Q1（肌の色み）\n鏡で見た顔の肌の色は、どちらに近いですか？", illust: { kind: "face", pair: [Q01A, Q01B], left: { skin: "#F2D3AE" }, right: { skin: "#F6D9CE" } }, A: [1, 3], B: [2, 4], a: "黄み・オークル寄り", b: "青み・ピンク寄り" },
  { q: "Q2（スーツの明るさ）\n顔映りが良いと言われるのは、どちらのスーツですか？", illust: { kind: "chips", left: { colors: ["#B7BCC4", "#D8C3A2", "#A9C4DE", "#C9CCD2"] }, right: { colors: ["#2B2E33", "#23325C", "#4E3A2C", "#1B1D24"] } }, A: [1, 2], B: [3, 4], a: "明るいグレー・ベージュ系", b: "濃紺・チャコール系" },
  { q: "Q3（瞳の色）\n自分の瞳の色は、どちらに近いですか？", illust: { kind: "eye", pair: [Q03A, Q03B], left: { iris: "#8B5E3C" }, right: { iris: "#2E2620" } }, A: [1, 2], B: [3, 4], a: "明るい茶色・透明感がある", b: "濃い黒茶・深い色" },
  { q: "Q4（手首の血管）\n手首の内側の血管は、何色に見えますか？", illust: { kind: "wrist", pair: [Q04A, Q04B], left: { vein: "#6E8B4E" }, right: { vein: "#5B7FAC" } }, A: [1, 3], B: [2, 4], a: "緑っぽく見える", b: "青・紫っぽく見える" },
  { q: "Q5（時計・ベルトの金具）\nしっくりくるのは、どちらの金属ですか？", illust: { kind: "metal", left: { metal: "#C9A24B" }, right: { metal: "#B9BEC5" } }, A: [1, 3], B: [2, 4], a: "ゴールド系", b: "シルバー系" },
  { q: "Q6（白の選び方）\n顔まわりがきれいに見えるTシャツは？", illust: { kind: "face", pair: [Q06A, Q06B], left: { top: "#EFE6D6" }, right: { top: "#FFFFFF" } }, A: [1, 3], B: [2, 4], a: "生成り・オフホワイト", b: "混じり気のない真っ白" },
  { q: "Q7（似合う色の傾向）\nどちらの色の方がしっくりきますか？", illust: { kind: "chips", left: { colors: ["#E8907C", "#A8D8C8", "#A9C4DE", "#E0A96D"] }, right: { colors: ["#4E3A2C", "#23325C", "#6B6B3A", "#5C1A2B"] } }, A: [1, 2], B: [3, 4], a: "明るく澄んだ色", b: "深く落ち着いた色" },
  { q: "Q8（ニットの濃さ）\n人に褒められることが多いのは？", illust: { kind: "face", pair: [Q08A, Q08B], left: { top: "#C9CCD2" }, right: { top: "#3A3D42" } }, A: [1, 2], B: [3, 4], a: "明るい色のニット", b: "濃い色のニット" },
  { q: "Q9（パンツの色）\n手持ちで一番使いやすいのは？", illust: { kind: "swatch", left: { color: "#D8C3A2" }, right: { color: "#4E3A2C" } }, A: [1, 2], B: [3, 4], a: "ライトベージュ", b: "ダークブラウン・黒" },
  { q: "Q10（ネクタイの色）\n顔色が良く見えるのは、どちらですか？", illust: { kind: "tie", left: { color: "#B5643F" }, right: { color: "#7B2137" } }, A: [1, 3], B: [2, 4], a: "テラコッタ（黄みの赤）", b: "ワインレッド（青みの赤）" },
  { q: "Q11（運動後の顔）\n汗をかいたあと、顔はどうなりますか？", illust: { kind: "face", pair: [Q11A, Q11B], left: { skin: "#E3B48C" }, right: { skin: "#F2C0C0" } }, A: [1, 3], B: [2, 4], a: "赤黒く、日焼けしたようになる", b: "明るいピンクに赤らむ" },
  { q: "Q12（シャツの色）\n着ていて落ち着くのは、どちらですか？", illust: { kind: "shirt", left: { color: "#A9C4DE" }, right: { color: "#23325C" } }, A: [1, 2], B: [3, 4], a: "淡いサックスブルー", b: "深いネイビー" },
  { q: "Q13（髪色）\n似合うと言われるのは、どちらですか？", illust: { kind: "menshair", pair: [Q13A, Q13B], left: { hair: "#8B5E3C" }, right: { hair: "#1B1D24" } }, A: [1, 2], B: [3, 4], a: "明るめの茶", b: "黒髪・暗めの髪" },
];

const TIE_Q = {
  q: "人からよく言われる印象は、どれに近いですか？",
  opts: { A: 1, B: 2, C: 3, D: 4 },
  labels: { A: "明るい・親しみやすい", B: "穏やか・上品", C: "落ち着いている・大人っぽい", D: "クール・存在感がある" },
};

/* =========================================================================
 * SVG イラスト
 * ====================================================================== */
function IllustHalf({ kind, v }) {
  const S = { width: "100%", height: "auto", display: "block" };
  const stroke = "#8A929E";
  if (kind === "face") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <path d="M18 100 Q22 76 50 72 Q78 76 82 100 Z" fill={v.top || "#DCE1E9"} stroke={stroke} strokeWidth="1.2" />
        <circle cx="50" cy="42" r="26" fill={v.skin || "#F2D3AE"} stroke={stroke} strokeWidth="1.2" />
        <path d="M32 26 Q50 12 68 26 Q68 18 50 15 Q32 18 32 26 Z" fill="#3A332C" />
        <circle cx="41" cy="42" r="2.6" fill="#3A332C" />
        <circle cx="59" cy="42" r="2.6" fill="#3A332C" />
        <path d="M44 55 Q50 59 56 55" fill="none" stroke="#B07A6A" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "eye") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <path d="M14 50 Q50 22 86 50 Q50 78 14 50 Z" fill="#fff" stroke={stroke} strokeWidth="1.6" />
        <circle cx="50" cy="50" r="16" fill={v.iris || "#8B5E3C"} />
        <circle cx="50" cy="50" r="7" fill="#1A1614" />
        <circle cx="44" cy="44" r="3.4" fill="#fff" opacity="0.85" />
      </svg>
    );
  }
  if (kind === "wrist") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <rect x="30" y="14" width="40" height="72" rx="18" fill="#F2D3AE" stroke={stroke} strokeWidth="1.2" />
        <path d="M42 24 Q46 50 42 78" fill="none" stroke={v.vein || "#6E8B4E"} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M56 26 Q52 52 57 76" fill="none" stroke={v.vein || "#6E8B4E"} strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      </svg>
    );
  }
  if (kind === "metal") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <rect x="42" y="10" width="16" height="22" rx="4" fill={v.metal || "#C9A24B"} opacity="0.5" />
        <rect x="42" y="68" width="16" height="22" rx="4" fill={v.metal || "#C9A24B"} opacity="0.5" />
        <circle cx="50" cy="50" r="24" fill="#fff" stroke={v.metal || "#C9A24B"} strokeWidth="7" />
        <circle cx="50" cy="50" r="15" fill="#F3F5F8" />
        <path d="M50 40 L50 50 L58 54" fill="none" stroke="#6E7887" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "chips") {
    const cs = v.colors || [];
    return (
      <svg viewBox="0 0 100 100" style={S}>
        {cs.slice(0, 4).map((c, i) => (
          <rect key={i} x={i % 2 === 0 ? 10 : 52} y={i < 2 ? 10 : 52} width="38" height="38" rx="6" fill={c} stroke={stroke} strokeWidth="0.8" />
        ))}
      </svg>
    );
  }
  if (kind === "swatch") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <rect x="14" y="14" width="72" height="72" rx="10" fill={v.color || "#DCE1E9"} stroke={stroke} strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === "tie") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <path d="M30 8 L50 20 L70 8 L70 22 L56 34 L44 34 L30 22 Z" fill="#F3F5F8" stroke={stroke} strokeWidth="1.2" />
        <path d="M44 22 L56 22 L60 32 L50 40 L40 32 Z" fill={v.color || "#7B2137"} />
        <path d="M42 40 L58 40 L62 78 L50 92 L38 78 Z" fill={v.color || "#7B2137"} stroke={stroke} strokeWidth="0.8" />
      </svg>
    );
  }
  if (kind === "shirt") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <path d="M32 16 L50 24 L68 16 L88 26 L82 44 L74 41 L74 88 L26 88 L26 41 L18 44 L12 26 Z" fill={v.color || "#A9C4DE"} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M50 24 L44 16 L50 12 L56 16 Z" fill="#FFFFFF" opacity="0.55" />
        <path d="M50 30 L50 86" fill="none" stroke="#000" strokeWidth="0.7" opacity="0.18" />
      </svg>
    );
  }
  if (kind === "menshair") {
    return (
      <svg viewBox="0 0 100 100" style={S}>
        <path d="M20 96 Q24 74 50 70 Q76 74 80 96 Z" fill="#DCE1E9" stroke={stroke} strokeWidth="1.2" />
        <circle cx="50" cy="44" r="25" fill="#F2D3AE" stroke={stroke} strokeWidth="1.2" />
        <path d="M26 40 Q26 18 50 17 Q74 18 74 40 Q70 30 58 27 Q44 25 36 31 Q29 34 26 40 Z" fill={v.hair || "#1B1D24"} />
        <circle cx="41" cy="45" r="2.6" fill="#3A332C" />
        <circle cx="59" cy="45" r="2.6" fill="#3A332C" />
      </svg>
    );
  }
  return null;
}

function QuizIllust({ illust, aLabel, bLabel, onPick }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[["A", illust.left, aLabel], ["B", illust.right, bLabel]].map(([k, v, label]) => (
        <button
          key={k}
          onClick={() => onPick(k)}
          className="rounded-xl p-3 text-center transition"
          style={{ background: C.card, border: `1.5px solid ${C.rule}`, boxShadow: "0 2px 10px rgba(31,42,68,.06)" }}
        >
          <div className="mx-auto mb-2" style={{ width: illust.pair ? "88%" : "72%" }}>
            {illust.pair
              ? <img src={illust.pair[k === "A" ? 0 : 1]} alt="" loading="lazy"
                  style={{ width: "100%", height: "auto", display: "block" }} />
              : <IllustHalf kind={illust.kind} v={v || {}} />}
          </div>
          <div className="text-[12.5px] font-bold leading-snug" style={{ color: C.ink }}>{label}</div>
        </button>
      ))}
    </div>
  );
}

/* --- 簡易コーデ図（ジャケット=ベース / インナー=トップス / 小物=アクセント） --- */
function CoordFigure({ base, top, acc }) {
  return (
    <svg viewBox="0 0 120 100" style={{ width: "100%", height: "auto", display: "block" }}>
      <path d="M42 12 L60 22 L78 12 L96 22 L92 42 L84 39 L84 92 L36 92 L36 39 L28 42 L24 22 Z"
        fill={top} stroke="#8A929E" strokeWidth="1" strokeLinejoin="round" />
      <path d="M42 12 L24 22 L28 42 L36 39 L36 92 L52 92 L52 34 Z" fill={base} stroke="#8A929E" strokeWidth="1" strokeLinejoin="round" />
      <path d="M78 12 L96 22 L92 42 L84 39 L84 92 L68 92 L68 34 Z" fill={base} stroke="#8A929E" strokeWidth="1" strokeLinejoin="round" />
      <rect x="52" y="60" width="16" height="7" rx="1.5" fill={acc} stroke="#8A929E" strokeWidth="0.8" />
      <circle cx="104" cy="76" r="9" fill={acc} stroke="#8A929E" strokeWidth="1" />
    </svg>
  );
}

/* =========================================================================
 * 共通パーツ
 * ====================================================================== */
function Header({ title, onBack }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <button onClick={onBack} className="rounded-lg px-2 py-2" style={{ border: `1px solid ${C.rule}`, background: C.card }} aria-label="戻る">
        <ArrowLeft size={16} color={C.navy} />
      </button>
      <h2 className="text-[15px] font-bold" style={{ color: C.ink }}>{title}</h2>
    </div>
  );
}

function Chip({ label, hex }) {
  return (
    <div className="text-center">
      <div className="w-full rounded-lg mb-1" style={{ paddingTop: "58%", background: hex, border: `1px solid ${C.rule}` }} />
      <div className="text-[10.5px] leading-tight" style={{ color: C.faint }}>{label}</div>
    </div>
  );
}

function TypePicker({ value, onChange, label = "あなたのタイプを選んでください" }) {
  return (
    <div className="mb-4">
      <div className="text-[12px] mb-2" style={{ color: C.faint }}>{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {TYPE_KEYS.map((k) => {
          const t = TYPES[k], on = value === k;
          return (
            <button key={k} onClick={() => onChange(k)} className="rounded-xl px-3 py-2.5 text-left"
              style={{ border: `1.5px solid ${on ? C.accent2 : C.rule}`, background: on ? C.accent2 + "14" : C.card }}>
              <div className="text-[12.5px] font-bold leading-tight" style={{ color: C.ink }}>{t.name}</div>
              <div className="text-[10.5px] mt-0.5" style={{ color: C.faint }}>{t.formal}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IgCta() {
  return (
    <a href={IG_URL} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 mt-3"
      style={{ background: C.navy, color: "#fff", textDecoration: "none" }}>
      <Instagram size={17} />
      <span className="text-[13.5px] font-bold">清潔感研究所（{IG_HANDLE}）をフォロー</span>
    </a>
  );
}

function SaveHint() {
  return (
    <div className="rounded-xl px-4 py-3 mt-3" style={{ background: C.tint, border: `1px solid ${C.rule}` }}>
      <div className="text-[12.5px] font-bold mb-1" style={{ color: C.ink }}>結果を残しておく</div>
      <div className="text-[11.5px] leading-relaxed" style={{ color: C.faint }}>
        この画面をスクリーンショットで保存しておくと、買い物中にそのまま見返せます。
        端末に結果は自動保存されるので、次に開いた時も同じタイプが表示されます。
      </div>
    </div>
  );
}

/* =========================================================================
 * シェア画像（1080×1920 canvas を手描き）
 * ====================================================================== */
function buildShareImage(t, secondName, axes, coord) {
  const cv = document.createElement("canvas");
  cv.width = 1080; cv.height = 1920;
  const x = cv.getContext("2d");

  const g = x.createLinearGradient(0, 0, 0, 1920);
  g.addColorStop(0, "#E6EAEF"); g.addColorStop(0.55, "#EAEDF2"); g.addColorStop(1, "#E4E8EE");
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);

  x.fillStyle = C.navy; x.fillRect(0, 0, 1080, 150);
  x.fillStyle = "#fff"; x.font = "700 40px sans-serif"; x.textAlign = "left";
  x.fillText("清潔感カラー診断", 64, 92);
  x.fillStyle = C.accent; x.font = "700 30px sans-serif"; x.textAlign = "right";
  x.fillText(IG_HANDLE, 1016, 90);

  // パレット帯
  t.palette.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * 216, 150, 216, 96); });

  // 白カード
  const card = (yTop, h) => {
    x.save();
    x.shadowColor = "rgba(31,42,68,.16)"; x.shadowBlur = 34; x.shadowOffsetY = 12;
    x.fillStyle = "#fff"; x.beginPath();
    x.moveTo(84, yTop + 24); x.arcTo(84, yTop, 108, yTop, 24);
    x.lineTo(972, yTop); x.arcTo(996, yTop, 996, yTop + 24, 24);
    x.lineTo(996, yTop + h - 24); x.arcTo(996, yTop + h, 972, yTop + h, 24);
    x.lineTo(108, yTop + h); x.arcTo(84, yTop + h, 84, yTop + h - 24, 24);
    x.closePath(); x.fill(); x.restore();
  };

  card(300, 470);
  x.textAlign = "center";
  x.fillStyle = C.faint; x.font = "500 28px sans-serif";
  x.fillText("あなたのタイプ", 540, 368);
  x.fillStyle = C.navy; x.font = "700 68px sans-serif";
  x.fillText(t.name, 540, 452);
  x.fillStyle = C.accent2; x.font = "700 34px sans-serif";
  x.fillText(`正式名称：${t.formal}（${t.en}）`, 540, 508);
  x.fillStyle = C.faint; x.font = "500 27px sans-serif";
  x.fillText(`2nd：${secondName}`, 540, 558);

  // 3軸
  if (axes) {
    const rows = [["色相", axes.hue], ["明度", axes.value], ["彩度", axes.chroma]];
    rows.forEach(([lab, a], i) => {
      const y = 610 + i * 52;
      x.textAlign = "left"; x.fillStyle = C.faint; x.font = "500 24px sans-serif";
      x.fillText(`${lab}  ${a.label}`, 140, y);
      x.fillStyle = "#E4E8EE"; x.fillRect(140, y + 12, 800, 12);
      x.fillStyle = C.accent2; x.fillRect(140, y + 12, 800 * (a.pct / 100), 12);
      x.textAlign = "right"; x.fillStyle = C.navy; x.font = "700 24px sans-serif";
      x.fillText(`${a.pct}%`, 940, y);
    });
  }

  // 勝ち色
  card(812, 300);
  x.textAlign = "left"; x.fillStyle = C.navy; x.font = "700 34px sans-serif";
  x.fillText("似合う色", 140, 880);
  t.palette10.slice(0, 10).forEach((p, i) => {
    const cx = 140 + (i % 5) * 162, cy = 912 + Math.floor(i / 5) * 92;
    x.fillStyle = p[1]; x.beginPath(); x.arc(cx + 30, cy + 30, 30, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#DCE1E9"; x.lineWidth = 2; x.stroke();
  });

  // NG色
  card(1148, 250);
  x.fillStyle = C.navy; x.font = "700 34px sans-serif";
  x.fillText("避けたい色", 140, 1216);
  (NG_COLORS[t.key] || []).slice(0, 4).forEach((n, i) => {
    const cx = 140 + i * 205;
    x.fillStyle = n.hex; x.beginPath(); x.arc(cx + 34, 1290, 34, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#DCE1E9"; x.lineWidth = 2; x.stroke();
    x.strokeStyle = "#C0392B"; x.lineWidth = 5;
    x.beginPath(); x.moveTo(cx + 14, 1270); x.lineTo(cx + 54, 1310);
    x.moveTo(cx + 54, 1270); x.lineTo(cx + 14, 1310); x.stroke();
    x.fillStyle = C.faint; x.font = "500 20px sans-serif"; x.textAlign = "center";
    x.font = "500 19px sans-serif";
    x.fillText(n.name.length > 11 ? n.name.slice(0, 10) + "…" : n.name, cx + 34, 1352);
    x.textAlign = "left";
  });

  // 推しコーデ
  if (coord) {
    card(1428, 230);
    x.fillStyle = C.navy; x.font = "700 34px sans-serif";
    x.fillText("推しコーデ", 140, 1496);
    [coord.base, coord.top, coord.acc].forEach((p, i) => {
      x.fillStyle = p[1]; x.fillRect(140 + i * 96, 1520, 76, 76);
      x.strokeStyle = "#DCE1E9"; x.lineWidth = 2; x.strokeRect(140 + i * 96, 1520, 76, 76);
    });
    x.fillStyle = C.ink; x.font = "500 25px sans-serif";
    const words = coord.text.split(" × ");
    words.forEach((w, i) => x.fillText(i < words.length - 1 ? w + " ×" : w, 452, 1548 + i * 34));
  }

  // フッター誘導
  x.fillStyle = C.navy; x.fillRect(0, 1720, 1080, 200);
  x.textAlign = "center";
  x.fillStyle = "#fff"; x.font = "700 36px sans-serif";
  x.fillText("あなたに似合う色も診断できます", 540, 1790);
  x.fillStyle = C.accent; x.font = "700 32px sans-serif";
  x.fillText(`${IG_HANDLE}  ｜  無料・登録不要`, 540, 1844);
  x.fillStyle = "#B7C4D6"; x.font = "500 24px sans-serif";
  x.fillText(PAGE_URL.replace(/^https?:\/\//, ""), 540, 1888);

  return cv;
}

async function shareResultImage(t, secondName, axes, coord) {
  const cv = buildShareImage(t, secondName, axes, coord);
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  const file = new File([blob], "seiketsu_color.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "清潔感カラー診断の結果" }); return; } catch (e) {}
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "seiketsu_color.png"; a.click();
  URL.revokeObjectURL(a.href);
}

/* =========================================================================
 * 本体
 * ====================================================================== */
export default function App() {
  const [mode, setMode] = useState("home");
  const [myType, setMyType] = useState(null);
  const [mySecond, setMySecond] = useState(null);
  const [myFrame, setMyFrame] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // quiz
  const [qi, setQi] = useState(0);
  const [scores, setScores] = useState({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [tieMode, setTieMode] = useState(false);
  const [result, setResult] = useState(null);

  // tools
  const [scene, setScene] = useState("business");
  const [checkColor, setCheckColor] = useState(null);
  const [pA, setPA] = useState(null);
  const [pB, setPB] = useState(null);
  const [fqi, setFqi] = useState(0);
  const [fScores, setFScores] = useState({ S: 0, W: 0, N: 0 });
  const [frameDone, setFrameDone] = useState(false);
  const [hairColor, setHairColor] = useState(null);
  const [hasPhoto, setHasPhoto] = useState(false);

  const goHome = () => setMode("home");
  useEffect(() => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }, [mode]);

  /* --- 保存 / 復元 --- */
  useEffect(() => {
    const raw = storage.get(STORE_KEY);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p.myType && TYPES[p.myType]) setMyType(p.myType);
        if (p.mySecond && TYPES[p.mySecond]) setMySecond(p.mySecond);
        if (p.myFrame && FRAMES[p.myFrame]) setMyFrame(p.myFrame);
      } catch (e) {}
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    storage.set(STORE_KEY, JSON.stringify({ myType, mySecond, myFrame }));
  }, [myType, mySecond, myFrame, loaded]);
  const resetProfile = () => {
    setMyType(null); setMySecond(null); setMyFrame(null); setResult(null); storage.del(STORE_KEY);
  };

  /* --- 12タイプ診断ロジック（女性版と同一） --- */
  const sortTypes = (s) =>
    [1, 2, 3, 4].map((t) => ({ type: t, score: s[t] }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.type - b.type));

  const startQuiz = () => {
    setQi(0); setScores({ 1: 0, 2: 0, 3: 0, 4: 0 }); setTieMode(false); setResult(null); setMode("quiz");
  };

  const finishQuiz = (s) => {
    const sorted = sortTypes(s);
    const first = sorted[0].type, second = sorted[1].type;
    setMyType(NUM2KEY[first]); setMySecond(NUM2KEY[second]);
    const total = s[1] + s[2] + s[3] + s[4];
    const pct = (a, b) => Math.round((Math.max(a, b) / total) * 100);
    setResult({
      first: NUM2KEY[first], second: NUM2KEY[second],
      axes: {
        hue: { pct: pct(s[2] + s[4], s[1] + s[3]), label: s[2] + s[4] >= s[1] + s[3] ? "Cool（青み）" : "Warm（黄み）" },
        value: { pct: pct(s[1] + s[2], s[3] + s[4]), label: s[1] + s[2] >= s[3] + s[4] ? "Light（明るい）" : "Deep（深い）" },
        chroma: { pct: pct(s[1] + s[4], s[2] + s[3]), label: s[1] + s[4] >= s[2] + s[3] ? "Clear（クリア）" : "Soft（ソフト）" },
      },
    });
  };

  const answerQ = (choice) => {
    if (tieMode) {
      const t = TIE_Q.opts[choice];
      const next = { ...scores, [t]: scores[t] + 1 };
      setScores(next); finishQuiz(next); return;
    }
    const next = { ...scores };
    Q[qi][choice].forEach((t) => { next[t] += 1; });
    setScores(next);
    if (qi + 1 < Q.length) { setQi(qi + 1); return; }
    const sorted = sortTypes(next);
    if (sorted.filter((x) => x.score === sorted[0].score).length === 1) finishQuiz(next);
    else setTieMode(true);
  };

  /* --- 骨格診断 --- */
  const startFrame = () => { setFqi(0); setFScores({ S: 0, W: 0, N: 0 }); setFrameDone(false); setMode("frame"); };
  const answerFQ = (choice) => {
    const next = { ...fScores };
    FQ[fqi][choice].forEach((k) => { next[k] += 1; });
    setFScores(next);
    if (fqi + 1 < FQ.length) { setFqi(fqi + 1); return; }
    const win = ["S", "W", "N"].sort((a, b) => next[b] - next[a])[0];
    setMyFrame(win); setFrameDone(true);
  };

  /* --- 髪色シミュレーション（canvas 塗り） --- */
  const onPhoto = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const cv = document.getElementById("mens-tryon-canvas");
        if (!cv) return;
        const maxW = 320;
        const sc = Math.min(1, maxW / img.width);
        cv.width = Math.round(img.width * sc);
        cv.height = Math.round(img.height * sc);
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.dataset.base = cv.toDataURL("image/png");
        setHasPhoto(true);
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  const resetPhoto = () => {
    const cv = document.getElementById("mens-tryon-canvas");
    if (!cv || !cv.dataset.base) return;
    const img = new Image();
    img.onload = () => cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    img.src = cv.dataset.base;
  };
  const paint = (e) => {
    if (!hasPhoto || !hairColor) return;
    if (e.buttons === 0 && e.type === "pointermove") return;
    const cv = e.currentTarget;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * (cv.width / r.width);
    const y = (e.clientY - r.top) * (cv.height / r.height);
    const ctx = cv.getContext("2d");
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = hairColor;
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  };

  const RT = myType ? TYPES[myType] : null;
  const pairData = pA && pB ? PAIR[pairKey(pA, pB)] : null;

  /* ---------------------------------------------------------------------
   * 画面
   * ------------------------------------------------------------------ */
  const shell = (children) => (
    <div className="min-h-screen w-full flex justify-center py-5 px-3" style={{ background: C.pageBg }}>
      <style>{`@keyframes mensFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        #mens-root .mens-fade{animation:mensFade .28s ease both}`}</style>
      <div className="w-full max-w-xl mens-fade">{children}</div>
    </div>
  );

  /* ---- ホーム ---- */
  if (mode === "home") {
    return shell(
      <div>
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: C.card, boxShadow: "0 12px 34px rgba(31,42,68,.14)" }}>
          <div className="flex">
            {["#F5EFE3", "#D8C3A2", "#BE8747", "#3E5A7E", "#A9C4DE", "#2B2E33"].map((c, i) => (
              <div key={i} className="flex-1" style={{ background: c, height: 12 }} />
            ))}
          </div>
          <div className="px-5 py-6 text-center">
            <div className="text-[11px] font-bold tracking-widest mb-2" style={{ color: C.accent2 }}>
              清潔感研究所 監修
            </div>
            <h1 className="text-[23px] font-bold leading-snug" style={{ color: C.navy }}>
              清潔感カラー診断
            </h1>
            <div className="mx-auto my-3" style={{ width: 56, height: 3, background: C.accent2 }} />
            <p className="text-[12.5px] leading-relaxed" style={{ color: C.faint }}>
              似合う色とコーデがわかる。<br />無料・登録不要、すべてこのページで完結します。
            </p>
          </div>
        </div>

        {RT && (
          <div className="rounded-2xl px-4 py-4 mb-4" style={{ background: C.card, border: `1.5px solid ${C.accent}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px]" style={{ color: C.faint }}>診断済み</div>
              <button onClick={resetProfile} className="text-[11px] underline" style={{ color: C.faint }}>リセット</button>
            </div>
            <div className="text-[16px] font-bold" style={{ color: C.navy }}>{RT.name}</div>
            <div className="text-[11.5px] mb-2" style={{ color: C.accent2 }}>{RT.formal}（{RT.en}）</div>
            <div className="grid grid-cols-5 gap-1.5">
              {RT.palette.map((c, i) => <div key={i} className="rounded" style={{ paddingTop: "100%", background: c, border: `1px solid ${C.rule}` }} />)}
            </div>
          </div>
        )}

        <button onClick={startQuiz} className="w-full rounded-2xl px-4 py-4 mb-2.5 flex items-center gap-3 text-left"
          style={{ background: C.navy, boxShadow: "0 8px 22px rgba(31,42,68,.22)" }}>
          <div className="rounded-full p-2.5" style={{ background: "rgba(255,255,255,.14)" }}><Palette size={20} color="#fff" /></div>
          <div className="flex-1">
            <div className="text-[14.5px] font-bold text-white">清潔感カラー診断（12タイプ）</div>
            <div className="text-[11.5px]" style={{ color: C.accent }}>13の質問で、1st × 2nd まで判定</div>
          </div>
          <ArrowRight size={18} color={C.accent} />
        </button>

        <button onClick={() => { setScene("business"); setMode("coord"); }} className="w-full rounded-2xl px-4 py-4 mb-4 flex items-center gap-3 text-left"
          style={{ background: C.card, border: `1.5px solid ${C.accent2}` }}>
          <div className="rounded-full p-2.5" style={{ background: C.accent2 + "1a" }}><Shirt size={20} color={C.accent2} /></div>
          <div className="flex-1">
            <div className="text-[14.5px] font-bold" style={{ color: C.navy }}>タイプ別カラーコーデ提案</div>
            <div className="text-[11.5px]" style={{ color: C.faint }}>ビジネス / カジュアル / デートの3シーン</div>
          </div>
          <ArrowRight size={18} color={C.accent2} />
        </button>

        {[
          {
            label: "似合うを知る",
            items: [
              { icon: <Ban size={17} />, label: "NGカラー診断", onClick: () => setMode("ngcolor") },
              { icon: <Droplet size={17} />, label: "この色、似合う？", onClick: () => { setCheckColor(null); setMode("checker"); } },
              { icon: <Scissors size={17} />, label: "髪色シミュレーション", onClick: () => { setHairColor(null); setMode("hair"); } },
              { icon: <Sparkles size={17} />, label: "骨格診断", onClick: startFrame },
            ],
          },
          {
            label: "楽しむ",
            items: [
              { icon: <Heart size={17} />, label: "ふたりの相性配色", onClick: () => { setPA(null); setPB(null); setMode("pair"); } },
              { icon: <Share2 size={17} />, label: "結果を画像で保存", onClick: () => setMode(myType ? "quizresult" : "quiz"), sub: myType ? null : "先に診断が必要です" },
            ],
          },
        ].map((sec) => (
          <div key={sec.label} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11.5px] font-bold" style={{ color: C.faint }}>{sec.label}</span>
              <span className="flex-1" style={{ height: 1, background: C.rule }} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {sec.items.map((it, i) => (
                <button key={i} onClick={it.onClick} className="rounded-xl px-3 py-3.5 flex items-center gap-2.5 text-left"
                  style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                  <span className="rounded-full p-2" style={{ background: C.tint, color: C.accent2 }}>{it.icon}</span>
                  <span className="text-[12.5px] font-bold leading-tight" style={{ color: C.ink }}>{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <IgCta />
        <div className="text-center text-[10.5px] mt-4" style={{ color: C.faint }}>
          清潔感研究所 presents ・ 登録不要 ・ 全機能無料
        </div>
      </div>
    );
  }

  /* ---- 12タイプ診断（設問） ---- */
  if (mode === "quiz" && !result) {
    const cur = tieMode ? null : Q[qi];
    const prog = tieMode ? 100 : Math.round(((qi) / Q.length) * 100);
    return shell(
      <div>
        <Header title="清潔感カラー診断" onBack={goHome} />
        <div className="rounded-2xl px-4 py-5" style={{ background: C.card, boxShadow: "0 8px 24px rgba(31,42,68,.10)" }}>
          <div className="mb-3">
            <div style={{ height: 5, background: C.tint, borderRadius: 99 }}>
              <div style={{ height: 5, width: `${prog}%`, background: C.accent2, borderRadius: 99, transition: "width .25s" }} />
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: C.faint }}>
              {tieMode ? "最後の質問" : `${qi + 1} / ${Q.length}`}
            </div>
          </div>

          {tieMode ? (
            <>
              <p className="text-[14.5px] font-bold mb-4 leading-relaxed" style={{ color: C.ink }}>{TIE_Q.q}</p>
              <div className="grid gap-2">
                {["A", "B", "C", "D"].map((k) => (
                  <button key={k} onClick={() => answerQ(k)} className="rounded-xl px-4 py-3 text-left text-[13px] font-bold"
                    style={{ border: `1.5px solid ${C.rule}`, background: C.card, color: C.ink }}>
                    {TIE_Q.labels[k]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[14.5px] font-bold mb-4 leading-relaxed whitespace-pre-line" style={{ color: C.ink }}>{cur.q}</p>
              <QuizIllust illust={cur.illust} aLabel={cur.a} bLabel={cur.b} onPick={answerQ} />
            </>
          )}
        </div>
        <div className="text-center text-[11px] mt-3" style={{ color: C.faint }}>
          直感で選んでかまいません。迷ったら「よく言われる方」を。
        </div>
      </div>
    );
  }

  /* ---- 12タイプ診断（結果） ---- */
  if ((mode === "quiz" && result) || mode === "quizresult") {
    const t = result ? TYPES[result.first] : RT;
    const secondName = result ? TYPES[result.second].name : (mySecond ? TYPES[mySecond].name : "—");
    const axes = result ? result.axes : null;
    const topCoord = COORD[t.key].business;
    return shell(
      <div>
        <Header title="診断結果" onBack={goHome} />

        <div className="rounded-2xl px-5 py-6 mb-3" style={{ background: C.card, boxShadow: "0 10px 30px rgba(31,42,68,.12)" }}>
          <div className="text-[11.5px] mb-2" style={{ color: C.accent2 }}>清潔感研究所 監修の診断結果</div>
          <div className="text-[24px] font-bold leading-snug mb-1" style={{ color: C.navy }}>
            あなたは<span style={{ color: t.accent }}>【{t.name}】</span>
          </div>
          <div className="inline-block rounded-full px-3 py-1 text-[12px] font-bold mb-3"
            style={{ background: C.tint, color: C.accent2 }}>
            正式名称：{t.formal}（{t.en}）
          </div>
          <div className="text-[12px] mb-3" style={{ color: C.faint }}>2nd：{secondName}</div>
          <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>{t.catch}</p>

          {axes && (
            <div className="mt-4 rounded-xl px-3.5 py-3.5" style={{ background: C.tint }}>
              {[["色相", axes.hue], ["明度", axes.value], ["彩度", axes.chroma]].map(([lab, a], i) => (
                <div key={i} className="mb-2.5 last:mb-0">
                  <div className="flex justify-between text-[11.5px] mb-1" style={{ color: C.ink }}>
                    <span>{lab}　{a.label}</span><span className="font-bold">{a.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: "#fff", borderRadius: 99 }}>
                    <div style={{ height: 6, width: `${a.pct}%`, background: C.accent2, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
          <div className="text-[13.5px] font-bold mb-2.5" style={{ color: C.navy }}>似合う色（勝ち色10）</div>
          <div className="grid grid-cols-5 gap-2">
            {t.palette10.map((p, i) => <Chip key={i} label={p[0]} hex={p[1]} />)}
          </div>
        </div>

        <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
          <div className="text-[13.5px] font-bold mb-2.5" style={{ color: C.navy }}>避けたい色</div>
          <div className="grid grid-cols-4 gap-2">
            {NG_COLORS[t.key].map((n, i) => (
              <div key={i} className="text-center">
                <div className="relative w-full rounded-lg mb-1" style={{ paddingTop: "100%", background: n.hex, border: `1px solid ${C.rule}` }}>
                  <span className="absolute inset-0 flex items-center justify-center text-[20px] font-bold" style={{ color: "#C0392B" }}>✕</span>
                </div>
                <div className="text-[10px] leading-tight" style={{ color: C.faint }}>{n.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
          <div className="text-[13.5px] font-bold mb-2" style={{ color: C.navy }}>推しコーデ（ビジネス）</div>
          <div className="flex gap-3 items-center">
            <div style={{ width: 92, flexShrink: 0 }}>
              <CoordFigure base={topCoord.base[1]} top={topCoord.top[1]} acc={topCoord.acc[1]} />
            </div>
            <div className="flex-1">
              <div className="text-[12.5px] font-bold leading-relaxed mb-1.5" style={{ color: C.ink }}>{topCoord.text}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {[topCoord.base, topCoord.top, topCoord.acc].map((p, i) => <Chip key={i} label={p[0]} hex={p[1]} />)}
              </div>
            </div>
          </div>
          <button onClick={() => { setScene("business"); setMode("coord"); }}
            className="w-full mt-3 rounded-xl py-2.5 text-[12.5px] font-bold"
            style={{ border: `1.5px solid ${C.accent2}`, color: C.accent2 }}>
            3シーン分のコーデを見る →
          </button>
        </div>

        <button onClick={() => shareResultImage(t, secondName, axes, topCoord)}
          className="w-full rounded-xl py-3.5 text-[13.5px] font-bold flex items-center justify-center gap-2"
          style={{ background: C.accent2, color: "#fff" }}>
          <Share2 size={16} /> 結果を画像で保存・シェア
        </button>

        <SaveHint />
        <IgCta />

        <button onClick={goHome} className="w-full text-center text-[12px] mt-4 underline" style={{ color: C.faint }}>
          メニューへ戻る
        </button>
      </div>
    );
  }

  /* ---- ★ タイプ別カラーコーデ提案 ---- */
  if (mode === "coord") {
    if (!myType) {
      return shell(
        <div>
          <Header title="タイプ別カラーコーデ提案" onBack={goHome} />
          <div className="rounded-2xl px-4 py-5" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
            <TypePicker value={myType} onChange={setMyType} />
            <button onClick={startQuiz} className="w-full rounded-xl py-3 text-[12.5px] font-bold mt-1"
              style={{ border: `1.5px solid ${C.accent2}`, color: C.accent2 }}>
              わからない場合は診断する →
            </button>
          </div>
        </div>
      );
    }
    const cd = COORD[myType][scene];
    return shell(
      <div>
        <Header title="タイプ別カラーコーデ提案" onBack={goHome} />
        <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
          <div className="text-[12px] mb-0.5" style={{ color: C.faint }}>あなたのタイプ</div>
          <div className="text-[15px] font-bold" style={{ color: C.navy }}>{RT.name}</div>
          <div className="text-[11px]" style={{ color: C.accent2 }}>{RT.formal}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {SCENES.map((s) => {
            const on = scene === s.id;
            return (
              <button key={s.id} onClick={() => setScene(s.id)} className="rounded-xl py-2.5 text-[12.5px] font-bold"
                style={{ background: on ? C.navy : C.card, color: on ? "#fff" : C.faint, border: `1px solid ${on ? C.navy : C.rule}` }}>
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl px-4 py-5" style={{ background: C.card, boxShadow: "0 8px 24px rgba(31,42,68,.10)" }}>
          <div className="mx-auto mb-4" style={{ width: 148 }}>
            <CoordFigure base={cd.base[1]} top={cd.top[1]} acc={cd.acc[1]} />
          </div>

          <div className="text-[14px] font-bold leading-relaxed text-center mb-4" style={{ color: C.navy }}>
            {cd.text}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[["ベース", cd.base], ["トップス", cd.top], ["小物", cd.acc]].map(([role, p], i) => (
              <div key={i} className="text-center">
                <div className="text-[10px] mb-1 font-bold" style={{ color: C.accent2 }}>{role}</div>
                <div className="w-full rounded-lg mb-1" style={{ paddingTop: "62%", background: p[1], border: `1px solid ${C.rule}` }} />
                <div className="text-[10.5px] leading-tight" style={{ color: C.faint }}>{p[0]}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl px-3.5 py-3" style={{ background: C.tint }}>
            <div className="text-[11.5px] font-bold mb-1" style={{ color: C.ink }}>ポイント</div>
            <div className="text-[11.5px] leading-relaxed" style={{ color: C.faint }}>{cd.note}</div>
          </div>
        </div>

        <SaveHint />
        <IgCta />
      </div>
    );
  }

  /* ---- NGカラー診断 ---- */
  if (mode === "ngcolor") {
    return shell(
      <div>
        <Header title="NGカラー診断" onBack={goHome} />
        {!myType ? (
          <div className="rounded-2xl px-4 py-5" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
            <TypePicker value={myType} onChange={setMyType} />
          </div>
        ) : (
          <>
            <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
              <div className="text-[13.5px] font-bold mb-1" style={{ color: C.navy }}>
                {RT.name}が「老けて見える色 / 疲れて見える色」
              </div>
              <div className="text-[11.5px]" style={{ color: C.faint }}>
                顔まわり（シャツ・ニット・タイ）に置いた時に損をしやすい色です。
              </div>
            </div>
            {NG_COLORS[myType].map((n, i) => (
              <div key={i} className="rounded-2xl px-4 py-4 mb-2.5" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative rounded-lg" style={{ width: 48, height: 48, background: n.hex, border: `1px solid ${C.rule}`, flexShrink: 0 }}>
                    <span className="absolute inset-0 flex items-center justify-center text-[22px] font-bold" style={{ color: "#C0392B" }}>✕</span>
                  </div>
                  <div>
                    <div className="text-[13.5px] font-bold" style={{ color: C.ink }}>{n.name}</div>
                    <div className="text-[11.5px] leading-snug" style={{ color: C.faint }}>{n.why}</div>
                  </div>
                </div>
                <div className="rounded-lg px-3 py-2 flex items-center gap-2.5" style={{ background: C.tint }}>
                  <div className="rounded" style={{ width: 26, height: 26, background: n.alt.hex, border: `1px solid ${C.rule}`, flexShrink: 0 }} />
                  <div className="text-[11.5px]" style={{ color: C.ink }}>
                    代わりに<span className="font-bold">{n.alt.name}</span>を選べば、同じ雰囲気のまま損をしません。
                  </div>
                </div>
              </div>
            ))}
            <IgCta />
          </>
        )}
      </div>
    );
  }

  /* ---- この色、似合う？ ---- */
  if (mode === "checker") {
    return shell(
      <div>
        <Header title="この色、似合う？" onBack={goHome} />
        {!myType ? (
          <div className="rounded-2xl px-4 py-5" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
            <TypePicker value={myType} onChange={setMyType} />
          </div>
        ) : (
          <>
            <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
              <div className="text-[12px] mb-2.5" style={{ color: C.faint }}>
                気になる色をタップすると、{RT.name}との相性を判定します。
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {COLOR_CHECK.map((c, i) => (
                  <button key={i} onClick={() => setCheckColor(c)} className="rounded-lg"
                    style={{
                      paddingTop: "100%", background: c.hex,
                      border: checkColor && checkColor.name === c.name ? `2.5px solid ${C.navy}` : `1px solid ${C.rule}`,
                    }} aria-label={c.name} />
                ))}
              </div>
            </div>

            {checkColor && (() => {
              const rating = checkColor.r[myType];
              const good = rating === "◎" || rating === "○";
              const alts = COLOR_CHECK.filter((cc) => cc.r[myType] === "◎").slice(0, 4);
              return (
                <div className="rounded-2xl px-4 py-5 mb-3" style={{ background: C.card, boxShadow: "0 8px 24px rgba(31,42,68,.10)" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="rounded-lg" style={{ width: 56, height: 56, background: checkColor.hex, border: `1px solid ${C.rule}`, flexShrink: 0 }} />
                    <div>
                      <div className="text-[13px]" style={{ color: C.faint }}>{checkColor.name}</div>
                      <div className="text-[20px] font-bold" style={{ color: good ? C.accent2 : "#C0392B" }}>
                        {rating} {RATING_LABEL[rating]}
                      </div>
                    </div>
                  </div>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: C.ink }}>{RATING_TIP[rating]}</p>
                  {!good && (
                    <div className="mt-4">
                      <div className="text-[12px] font-bold mb-2" style={{ color: C.navy }}>代わりにこの色を</div>
                      <div className="grid grid-cols-4 gap-2">
                        {alts.map((a, i) => <Chip key={i} label={a.name} hex={a.hex} />)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <IgCta />
          </>
        )}
      </div>
    );
  }

  /* ---- 髪色シミュレーション ---- */
  if (mode === "hair") {
    return shell(
      <div>
        <Header title="髪色シミュレーション" onBack={goHome} />
        {!myType ? (
          <div className="rounded-2xl px-4 py-5" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
            <TypePicker value={myType} onChange={setMyType} />
          </div>
        ) : (
          <>
            <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
              <div className="text-[13.5px] font-bold mb-1.5" style={{ color: C.navy }}>{RT.name}におすすめの髪色</div>
              <div className="text-[11.5px] leading-relaxed mb-3" style={{ color: C.faint }}>{HAIR[myType].tip}</div>
              <div className="grid grid-cols-3 gap-2">
                {HAIR[myType].colors.map((h, i) => <Chip key={i} label={h[0]} hex={h[1]} />)}
              </div>
            </div>

            <div className="rounded-2xl px-4 py-4" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
              <div className="text-[13.5px] font-bold mb-1" style={{ color: C.navy }}>写真で試し塗り</div>
              <div className="text-[11px] leading-relaxed mb-3" style={{ color: C.faint }}>
                自分の写真を選んで、髪の部分を指でなぞると色が乗ります。
                画像は端末の中だけで処理され、どこにも送信されません。
              </div>

              <label className="flex items-center justify-center gap-2 rounded-xl py-3 mb-3 cursor-pointer"
                style={{ border: `1.5px dashed ${C.accent2}`, color: C.accent2 }}>
                <Camera size={16} />
                <span className="text-[12.5px] font-bold">写真を選ぶ</span>
                <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
              </label>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {HAIR[myType].colors.map((h, i) => (
                  <button key={i} onClick={() => setHairColor(h[1])} className="rounded-lg py-2 text-[11px] font-bold"
                    style={{
                      background: h[1], color: "#fff",
                      border: hairColor === h[1] ? `2.5px solid ${C.navy}` : `1px solid ${C.rule}`,
                    }}>
                    {h[0]}
                  </button>
                ))}
              </div>

              <canvas id="mens-tryon-canvas" onPointerDown={paint} onPointerMove={paint}
                className="w-full rounded-xl"
                style={{ background: C.tint, touchAction: "none", border: `1px solid ${C.rule}`, minHeight: 160 }} />

              {hasPhoto && (
                <button onClick={resetPhoto} className="w-full mt-2.5 rounded-xl py-2.5 text-[12px] font-bold flex items-center justify-center gap-1.5"
                  style={{ border: `1px solid ${C.rule}`, color: C.faint }}>
                  <RotateCcw size={14} /> 塗りを消す
                </button>
              )}
            </div>
            <IgCta />
          </>
        )}
      </div>
    );
  }

  /* ---- 骨格診断 ---- */
  if (mode === "frame") {
    if (!frameDone) {
      const f = FQ[fqi];
      return shell(
        <div>
          <Header title="骨格診断" onBack={goHome} />
          <div className="rounded-2xl px-4 py-5" style={{ background: C.card, boxShadow: "0 8px 24px rgba(31,42,68,.10)" }}>
            <div style={{ height: 5, background: C.tint, borderRadius: 99 }}>
              <div style={{ height: 5, width: `${(fqi / FQ.length) * 100}%`, background: C.accent2, borderRadius: 99 }} />
            </div>
            <div className="text-[11px] mt-1.5 mb-3" style={{ color: C.faint }}>{fqi + 1} / {FQ.length}</div>
            <p className="text-[15px] font-bold mb-4" style={{ color: C.ink }}>{f.q}</p>
            <div className="grid gap-2">
              {["A", "B"].map((k) => (
                <button key={k} onClick={() => answerFQ(k)} className="rounded-xl px-4 py-3.5 text-left text-[13px] font-bold"
                  style={{ border: `1.5px solid ${C.rule}`, background: C.card, color: C.ink }}>
                  {k === "A" ? f.a : f.b}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
    const fr = FRAMES[myFrame];
    return shell(
      <div>
        <Header title="骨格診断の結果" onBack={goHome} />
        <div className="rounded-2xl px-5 py-6 mb-3" style={{ background: C.card, boxShadow: "0 10px 30px rgba(31,42,68,.12)" }}>
          <div className="text-[11.5px] mb-2" style={{ color: C.accent2 }}>清潔感研究所 監修の骨格セルフチェック</div>
          <div className="text-[24px] font-bold mb-2" style={{ color: fr.accent }}>骨格{fr.name}</div>
          <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>{fr.catch}</p>
        </div>
        <div className="rounded-2xl px-4 py-4 mb-2.5" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
          <div className="text-[13px] font-bold mb-2" style={{ color: C.accent2 }}>得意</div>
          {fr.good.map((g, i) => (
            <div key={i} className="text-[12.5px] leading-relaxed mb-1" style={{ color: C.ink }}>✓　{g}</div>
          ))}
        </div>
        <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
          <div className="text-[13px] font-bold mb-2" style={{ color: "#C0392B" }}>注意</div>
          {fr.bad.map((g, i) => (
            <div key={i} className="text-[12.5px] leading-relaxed mb-1" style={{ color: C.ink }}>✕　{g}</div>
          ))}
        </div>
        <SaveHint />
        <IgCta />
      </div>
    );
  }

  /* ---- ふたりの相性配色 ---- */
  if (mode === "pair") {
    return shell(
      <div>
        <Header title="ふたりの相性配色" onBack={goHome} />
        <div className="rounded-2xl px-4 py-5 mb-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
          <TypePicker value={pA} onChange={setPA} label="ひとり目のタイプ" />
          <TypePicker value={pB} onChange={setPB} label="ふたり目のタイプ" />
        </div>
        {pairData && (
          <div className="rounded-2xl px-4 py-5 mb-3" style={{ background: C.card, boxShadow: "0 8px 24px rgba(31,42,68,.10)" }}>
            <div className="text-[11.5px] mb-1" style={{ color: C.accent2 }}>ふたりの配色</div>
            <div className="text-[19px] font-bold mb-3" style={{ color: C.navy }}>{pairData.title}</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {pairData.colors.map((c, i) => (
                <div key={i} className="rounded-lg" style={{ paddingTop: "48%", background: c, border: `1px solid ${C.rule}` }} />
              ))}
            </div>
            <p className="text-[12.5px] leading-relaxed" style={{ color: C.ink }}>{pairData.text}</p>
          </div>
        )}
        <SaveHint />
        <IgCta />
      </div>
    );
  }

  return shell(<div><Header title="清潔感カラー診断" onBack={goHome} /></div>);
}
