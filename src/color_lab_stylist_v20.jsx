import React, { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowRight, ArrowLeft, RotateCcw, Copy, Check, Camera, Heart, Palette, Shirt, Upload, ExternalLink, Brush, Scissors, Ban, Droplet, Paintbrush, ShoppingBag, Eraser } from "lucide-react";

// ════════════════════════════════════════════
// 実データ：自社SKU（在庫あり・直近2ヶ月売れ筋）
// ════════════════════════════════════════════
// 計測: アプリ経由の流入をGA4/Shoppalで判別するためのUTM
const UTM = "utm_source=colorlab&utm_medium=app&utm_campaign=ai_stylist";
const ITEM_URL = (site, id) => `https://${site}.jp/items/${id}?${UTM}`;
const SITE_URL = (site) => `https://${site}.jp?${UTM}`;

// ════════════════════════════════════════════
// フェーズ1: AI機能フラグ（記事埋め込みLiteモード）
// false の間、AI3機能（顔写真で診断 / コーデ提案 / 今日のコーデ採点）は
// 「近日公開」化し、タップ時は12タイプ診断へ誘導する。
// ════════════════════════════════════════════
const AI_ENABLED = false;

// 診断結果の端末ごと保存（localStorage 版・旧 window.storage と同等インターフェイス）
// キー名は据え置き（colorlab-profile）。try-catch でプライベートブラウズ等でも落とさない。
const storage = {
  get: async (k) => { try { const v = localStorage.getItem(k); return v == null ? null : { value: v }; } catch (e) { return null; } },
  set: async (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  delete: async (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};

// LINE公式アカウント（診断完了→友だち追加でリピート導線）
const LINE_URLS = {
  iebel: "https://lin.ee/weC3DMg",
  blubel: "https://lin.ee/TycoIx4",
};

const SKUS = {
  blubel: [
    { id: 2129, name: "サテン素材の上品な長袖シャツブラウス", price: 4990, cat: "トップス", tpo: ["work", "date"], frame: ["S"] },
    { id: 1662, name: "透明感あふれる七分袖ニット", price: 4930, cat: "トップス", tpo: ["work", "casual"], frame: ["S","W"] },
    { id: 1598, name: "ほっそり見せ長身キャップスリーブ", price: 4980, cat: "トップス", tpo: ["casual", "date"], frame: ["W","S"] },
    { id: 2085, name: "異素材切替袖バイカラーブラウス", price: 4390, cat: "トップス", tpo: ["work", "date"], frame: ["W"] },
    { id: 1745, name: "優美な佇まい フレアロングワンピース", price: 4390, cat: "ワンピース", tpo: ["date", "casual"], frame: ["W","N"] },
    { id: 1647, name: "爽やか縦縞ティアードワンピース", price: 4990, cat: "ワンピース", tpo: ["casual", "date"], frame: ["W"] },
    { id: 2072, name: "透け感袖シアーフリル襟付きベルト付きワンピース", price: 5500, cat: "ワンピース", tpo: ["date", "work"], frame: ["W"] },
    { id: 1741, name: "すっきり美脚見せの定番カジュアルセットアップ", price: 4590, cat: "セットアップ", tpo: ["casual", "work"], frame: ["S","N"] },
    { id: 2098, name: "多機能二層式リュックサック（通勤通学対応）", price: 4590, cat: "バッグ", tpo: ["work", "casual"], frame: ["N"] },
    { id: 1794, name: "韓国風 ダブルスクエア ネックレス", price: 3060, cat: "アクセサリー", tpo: ["work", "date", "casual"], frame: ["S","N"] },
    { id: 1793, name: "存在感抜群 太めチェーンチョーカー", price: 2890, cat: "アクセサリー", tpo: ["date", "casual"], frame: ["N"] },
    { id: 1789, name: "スクエアストーン オープンリング", price: 2940, cat: "アクセサリー", tpo: ["work", "date", "casual"], frame: ["W","S"] },
  ],
  iebel: [
    { id: 2176, name: "理想のこなれ感スキッパーネックドルマン袖ブラウス", price: 3990, cat: "トップス", tpo: ["work", "date"], frame: ["N","W"] },
    { id: 1796, name: "シフォンブラウス 通勤きれいめ上品シャツ", price: 4290, cat: "トップス", tpo: ["work"], frame: ["W"] },
    { id: 2088, name: "ニット半袖トップス", price: 4690, cat: "トップス", tpo: ["casual", "date"], frame: ["S","W"] },
    { id: 1694, name: "透明感あふれる七分袖ニット", price: 4930, cat: "トップス", tpo: ["work", "casual"], frame: ["S","W"] },
    { id: 2007, name: "上品な小花柄混合糸丸首ボタン留めカーディガン", price: 4990, cat: "トップス", tpo: ["casual", "date"], frame: ["W"] },
    { id: 1630, name: "ほっそり見せ長身キャップスリーブ", price: 4980, cat: "トップス", tpo: ["casual", "date"], frame: ["W","S"] },
    { id: 2183, name: "ハイウエストワイドタックパンツ垂感仕立て", price: 5990, cat: "ボトムス", tpo: ["work", "date", "casual"], frame: ["S","N"] },
    { id: 1308, name: "上品ラップ風マキシワンピース", price: 4980, cat: "ワンピース", tpo: ["date", "casual"], frame: ["S","N"] },
    { id: 1484, name: "サテンノースリーブワンピース", price: 4490, cat: "ワンピース", tpo: ["date", "work"], frame: ["S"] },
    { id: 2187, name: "ナチュラルリネン調襟付き半袖ロングシャツワンピース", price: 4490, cat: "ワンピース", tpo: ["casual", "date"], frame: ["N"] },
    { id: 1823, name: "洗練された大ぶりフープピアス 韓国風", price: 3050, cat: "アクセサリー", tpo: ["work", "date", "casual"], frame: ["N"] },
    { id: 1822, name: "洗練Y字ラリエットネックレス", price: 3210, cat: "アクセサリー", tpo: ["work", "date"], frame: ["S","W"] },
    { id: 1829, name: "パール調ゴールドバーネックレス", price: 2670, cat: "アクセサリー", tpo: ["date", "casual"], frame: ["W","S"] },
  ],
};

// ════════════════════════════════════════════
// 実データ：コスメAFF（Lip Monster: 春02/秋03/夏04/冬06）
// ════════════════════════════════════════════
const RK = (q) =>
  `https://hb.afl.rakuten.co.jp/hgc/359b13c2.b94cf15e.359b13c3.1f2a5b4f/?pc=${encodeURIComponent(
    `https://search.rakuten.co.jp/search/mall/${q}/`
  )}&link_type=text`;
const AMZ = (q) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}&tag=blubeiebe-22`;

// 診断結果「仕上げのコスメ」用（各タイプ5点：リップ/アイシャドウ/チーク/マスカラ/アイライナー）
// リンクはすべて実データ（RK/AMZ）。noteはタイプ別に書き分け。
const COSME = {
  spring: [
    { name: "KATE リップモンスター 02 Pink banana", price: 1540, cat: "リップ", rakuten: RK("KATE リップモンスター 02"), amazon: AMZ("KATE リップモンスター 02"), note: "イエベ春の血色感を引き出す定番" },
    { name: "rom&nd ベターザンパレット 04 アンビエントライトデイ", price: 2750, cat: "アイシャドウ", rakuten: RK("rom&nd ベターザンパレット 04"), amazon: AMZ("rom%26nd ベターザンパレット 04"), note: "明るくクリアな春の目元に" },
    { name: "CEZANNE ナチュラルチークN 04 シャインベージュ", price: 396, cat: "チーク", rakuten: RK("CEZANNE ナチュラルチーク 04"), amazon: AMZ("CEZANNE ナチュラルチーク 04"), note: "ふんわり明るい頬に" },
    { name: "メイベリン ラッシュニスタ N ブラウン", price: 1400, cat: "マスカラ", rakuten: RK("メイベリン ラッシュニスタ ブラウン"), amazon: AMZ("メイベリン ラッシュニスタ ブラウン"), note: "軽やかブラウンでやわらかい目元に" },
    { name: "キャンメイク クリーミータッチライナー 04 グレージュ", price: 715, cat: "アイライナー", rakuten: RK("キャンメイク クリーミータッチライナー 04"), amazon: AMZ("キャンメイク クリーミータッチライナー 04"), note: "抜け感のあるグレージュライン" },
  ],
  autumn: [
    { name: "KATE リップモンスター 03 ちょっと不機嫌なピンク", price: 1540, cat: "リップ", rakuten: RK("KATE リップモンスター 03"), amazon: AMZ("KATE リップモンスター 03"), note: "イエベ秋の最大人気色" },
    { name: "CANMAKE パーフェクトスタイリストアイズ 14 アンティークテラコッタ", price: 858, cat: "アイシャドウ", rakuten: RK("CANMAKE パーフェクトスタイリストアイズ 14"), amazon: AMZ("CANMAKE パーフェクトスタイリスト 14"), note: "こっくり深みのある目元に" },
    { name: "CEZANNE ナチュラルチークN 04 シャインベージュ", price: 396, cat: "チーク", rakuten: RK("CEZANNE ナチュラルチーク 04"), amazon: AMZ("CEZANNE ナチュラルチーク 04"), note: "肌なじみ抜群のベージュチーク" },
    { name: "ヒロインメイク ロング&カールマスカラ ブラウン", price: 1100, cat: "マスカラ", rakuten: RK("ヒロインメイク ロングアンドカール マスカラ ブラウン"), amazon: AMZ("ヒロインメイク マスカラ ブラウン"), note: "深みブラウンで上品な存在感" },
    { name: "キャンメイク クリーミータッチライナー 03 ダークブラウン", price: 715, cat: "アイライナー", rakuten: RK("キャンメイク クリーミータッチライナー 03"), amazon: AMZ("キャンメイク クリーミータッチライナー 03"), note: "濃茶でやさしく引き締め" },
  ],
  summer: [
    { name: "KATE リップモンスター 04 パンプキンワイン", price: 1540, cat: "リップ", rakuten: RK("KATE リップモンスター 04"), amazon: AMZ("KATE リップモンスター 04"), note: "ブルベ夏に寄り添う上品カラー" },
    { name: "ETUDE プレイカラーアイズ ジューシーペブル", price: 2200, cat: "アイシャドウ", rakuten: RK("ETUDE プレイカラーアイズ ジューシーペブル"), amazon: AMZ("ETUDE プレイカラー ジューシーペブル"), note: "淡くやわらかいパレット" },
    { name: "CEZANNE ナチュラルチークN 02 ピンク", price: 396, cat: "チーク", rakuten: RK("CEZANNE ナチュラルチーク 02"), amazon: AMZ("CEZANNE ナチュラルチーク 02"), note: "青みピンクで透明感UP" },
    { name: "キャンメイク クイックラッシュカーラー ワインモーヴ", price: 748, cat: "マスカラ", rakuten: RK("キャンメイク クイックラッシュカーラー ワインモーヴ"), amazon: AMZ("キャンメイク クイックラッシュカーラー ワインモーヴ"), note: "モーヴの色気を目元に" },
    { name: "ラブ・ライナー リキッドアイライナー グレージュ", price: 1760, cat: "アイライナー", rakuten: RK("ラブライナー リキッド グレージュ"), amazon: AMZ("ラブライナー グレージュ"), note: "やわらかグレージュライン" },
  ],
  winter: [
    { name: "KATE リップモンスター 06 2:00AM", price: 1540, cat: "リップ", rakuten: RK("KATE リップモンスター 06"), amazon: AMZ("KATE リップモンスター 06"), note: "ブルベ冬の鮮烈な深みレッド" },
    { name: "CANMAKE シルキースフレアイズ 06 スモーキーモーヴ", price: 825, cat: "アイシャドウ", rakuten: RK("CANMAKE シルキースフレアイズ 06"), amazon: AMZ("CANMAKE シルキースフレアイズ 06"), note: "モーヴで凛とした目元に" },
    { name: "キャンメイク グロウフルールチークス（ロージー系）", price: 880, cat: "チーク", rakuten: RK("キャンメイク グロウフルールチークス"), amazon: AMZ("キャンメイク グロウフルールチークス"), note: "青みロージーで血色感を" },
    { name: "ヒロインメイク ロング&カールマスカラ ブラック", price: 1100, cat: "マスカラ", rakuten: RK("ヒロインメイク ロングアンドカール マスカラ ブラック"), amazon: AMZ("ヒロインメイク マスカラ ブラック"), note: "漆黒でコントラストを効かせて" },
    { name: "ラブ・ライナー リキッドアイライナー ブラック", price: 1760, cat: "アイライナー", rakuten: RK("ラブライナー リキッド ブラック"), amazon: AMZ("ラブライナー ブラック"), note: "くっきり黒で凛と" },
  ],
};

// パーソナルカラー別おすすめコスメ用フルリスト（各タイプ×各カテゴリ5点／実リンク・タイプ別出し分け）
// set:true は各カテゴリ先頭の1点＝「一式セット」6点構成に使用。
const COSME_CATS = ["リップ", "アイシャドウ", "チーク", "マスカラ", "アイライナー", "アイブロウ"];
const COSME_FULL = {
  spring: [
    { name: "KATE リップモンスター 02 Pink banana", price: 1540, cat: "リップ", set: true, rakuten: RK("KATE リップモンスター 02"), amazon: AMZ("KATE リップモンスター 02"), note: "イエベ春の定番・血色感リップ" },
    { name: "オペラ リップティント N 05 コーラルピンク", price: 1650, cat: "リップ", rakuten: RK("オペラ リップティント 05 コーラルピンク"), amazon: AMZ("オペラ リップティント 05"), note: "みずみずしいコーラルの血色感" },
    { name: "セザンヌ ラスティンググロスリップ CR1", price: 528, cat: "リップ", rakuten: RK("セザンヌ ラスティンググロスリップ CR1"), amazon: AMZ("セザンヌ ラスティンググロスリップ CR1"), note: "明るいコーラルでプチプラ" },
    { name: "rom&nd グラスティングウォーターティント 01", price: 1100, cat: "リップ", rakuten: RK("rom&nd グラスティングウォーターティント 01"), amazon: AMZ("rom%26nd グラスティングウォーターティント 01"), note: "透けるアプリコットの水光リップ" },
    { name: "キャンメイク ステイオンバームルージュ 02", price: 660, cat: "リップ", rakuten: RK("キャンメイク ステイオンバームルージュ 02"), amazon: AMZ("キャンメイク ステイオンバームルージュ 02"), note: "デイリー使いのコーラル" },
    { name: "rom&nd ベターザンパレット 04 アンビエントライトデイ", price: 2750, cat: "アイシャドウ", set: true, rakuten: RK("rom&nd ベターザンパレット 04"), amazon: AMZ("rom%26nd ベターザンパレット 04"), note: "明るくクリアな目元に" },
    { name: "エクセル スキニーリッチシャドウ SR09", price: 1650, cat: "アイシャドウ", rakuten: RK("エクセル スキニーリッチシャドウ SR09"), amazon: AMZ("エクセル スキニーリッチシャドウ SR09"), note: "黄み映えのライトブラウン" },
    { name: "CANMAKE パーフェクトスタイリストアイズ 05", price: 858, cat: "アイシャドウ", rakuten: RK("CANMAKE パーフェクトスタイリストアイズ 05"), amazon: AMZ("CANMAKE パーフェクトスタイリストアイズ 05"), note: "コーラルベージュで華やぎ" },
    { name: "ヴィセ アヴァン シングルアイカラー アプリコット系", price: 715, cat: "アイシャドウ", rakuten: RK("ヴィセ アヴァン シングルアイカラー アプリコット"), amazon: AMZ("ヴィセ アヴァン シングルアイカラー アプリコット"), note: "1色で使える明るい発色" },
    { name: "ETUDE プレイカラーアイズ ピーチファーム", price: 2200, cat: "アイシャドウ", rakuten: RK("ETUDE プレイカラーアイズ ピーチファーム"), amazon: AMZ("ETUDE プレイカラー ピーチファーム"), note: "ピーチ系10色パレット" },
    { name: "CEZANNE ナチュラルチークN 04 シャインベージュ", price: 396, cat: "チーク", set: true, rakuten: RK("CEZANNE ナチュラルチーク 04"), amazon: AMZ("CEZANNE ナチュラルチーク 04"), note: "ふんわり明るい頬に" },
    { name: "キャンメイク グロウフルールチークス 04 アプリコット", price: 880, cat: "チーク", rakuten: RK("キャンメイク グロウフルールチークス 04"), amazon: AMZ("キャンメイク グロウフルールチークス 04"), note: "花びら重ねのアプリコット" },
    { name: "セザンヌ ナチュラルチークN 14 オレンジ系", price: 396, cat: "チーク", rakuten: RK("セザンヌ ナチュラルチーク 14"), amazon: AMZ("セザンヌ ナチュラルチーク 14"), note: "元気なオレンジコーラル" },
    { name: "リンメル ラスティングフィニッシュ マルチチーク 001", price: 1320, cat: "チーク", rakuten: RK("リンメル マルチチーク 001"), amazon: AMZ("リンメル マルチチーク 001"), note: "コーラルの多用途チーク" },
    { name: "excel オーラティックブラッシュ AB03", price: 1650, cat: "チーク", rakuten: RK("excel オーラティックブラッシュ AB03"), amazon: AMZ("excel オーラティックブラッシュ AB03"), note: "ツヤ感コーラルで生き生き" },
    { name: "メイベリン ラッシュニスタ N ブラウン", price: 1400, cat: "マスカラ", set: true, rakuten: RK("メイベリン ラッシュニスタ ブラウン"), amazon: AMZ("メイベリン ラッシュニスタ ブラウン"), note: "軽やかブラウンでやわらかい目元に" },
    { name: "ヒロインメイク ロング&カールマスカラ ブラウン", price: 1100, cat: "マスカラ", rakuten: RK("ヒロインメイク ロングアンドカール マスカラ ブラウン"), amazon: AMZ("ヒロインメイク マスカラ ブラウン"), note: "にじみに強いブラウン" },
    { name: "キャンメイク クイックラッシュカーラー ブラウン", price: 748, cat: "マスカラ", rakuten: RK("キャンメイク クイックラッシュカーラー ブラウン"), amazon: AMZ("キャンメイク クイックラッシュカーラー ブラウン"), note: "上向きカールのブラウン" },
    { name: "デジャヴュ ラッシュアップ E ブラウン", price: 1320, cat: "マスカラ", rakuten: RK("デジャヴュ ラッシュアップ ブラウン"), amazon: AMZ("デジャヴュ ラッシュアップ ブラウン"), note: "自然な繊維入りブラウン" },
    { name: "フローフシ モテマスカラ ナチュラル ブラウン", price: 1650, cat: "マスカラ", rakuten: RK("モテマスカラ ナチュラル ブラウン"), amazon: AMZ("モテマスカラ ナチュラル ブラウン"), note: "やわらかい抜け感ブラウン" },
    { name: "キャンメイク クリーミータッチライナー 04 グレージュ", price: 715, cat: "アイライナー", set: true, rakuten: RK("キャンメイク クリーミータッチライナー 04"), amazon: AMZ("キャンメイク クリーミータッチライナー 04"), note: "抜け感グレージュライン" },
    { name: "ラブ・ライナー リキッド ブラウン", price: 1760, cat: "アイライナー", rakuten: RK("ラブライナー リキッド ブラウン"), amazon: AMZ("ラブライナー ブラウン"), note: "やわらかい印象のブラウン" },
    { name: "ヒロインメイク スムースリキッドアイライナー ブラウン", price: 1210, cat: "アイライナー", rakuten: RK("ヒロインメイク スムースリキッドアイライナー ブラウン"), amazon: AMZ("ヒロインメイク リキッドアイライナー ブラウン"), note: "落ちにくい明るめブラウン" },
    { name: "デジャヴュ ラスティンファインE ライトブラウン", price: 1210, cat: "アイライナー", rakuten: RK("デジャヴュ ラスティンファイン ライトブラウン"), amazon: AMZ("デジャヴュ ラスティンファイン ライトブラウン"), note: "極細ライトブラウン" },
    { name: "キャンメイク クリーミータッチライナー 05 モーヴブラウン", price: 715, cat: "アイライナー", rakuten: RK("キャンメイク クリーミータッチライナー 05"), amazon: AMZ("キャンメイク クリーミータッチライナー 05"), note: "やさしいモーヴブラウン" },
    { name: "ベネフィット ブロウマイクロフィリングペン ライトブラウン", price: 3850, cat: "アイブロウ", set: true, rakuten: RK("ベネフィット ブロウマイクロフィリングペン ライトブラウン"), amazon: AMZ("ベネフィット ブロウマイクロ ライトブラウン"), note: "1本1本描く柔らか眉" },
    { name: "ケイト デザイニングアイブロウ3D EX-4", price: 1210, cat: "アイブロウ", rakuten: RK("ケイト デザイニングアイブロウ3D EX-4"), amazon: AMZ("ケイト デザイニングアイブロウ3D EX-4"), note: "明るめブラウンの立体眉" },
    { name: "セザンヌ 超細芯アイブロウ 03 ナチュラルブラウン", price: 550, cat: "アイブロウ", rakuten: RK("セザンヌ 超細芯アイブロウ 03"), amazon: AMZ("セザンヌ 超細芯アイブロウ 03"), note: "1本描きの明るいブラウン" },
    { name: "ヘビーローテーション カラーリングアイブロウ 05", price: 880, cat: "アイブロウ", rakuten: RK("ヘビーローテーション カラーリングアイブロウ 05"), amazon: AMZ("ヘビーローテーション カラーリングアイブロウ 05"), note: "髪色に合わせる眉マスカラ" },
    { name: "エクセル パウダー&ペンシルアイブロウEX PD01", price: 1595, cat: "アイブロウ", rakuten: RK("エクセル パウダーアンドペンシルアイブロウ PD01"), amazon: AMZ("エクセル パウダーアンドペンシルアイブロウ PD01"), note: "ふんわり明るい3in1" },
  ],
  autumn: [
    { name: "KATE リップモンスター 03 ちょっと不機嫌なピンク", price: 1540, cat: "リップ", set: true, rakuten: RK("KATE リップモンスター 03"), amazon: AMZ("KATE リップモンスター 03"), note: "イエベ秋の最大人気色" },
    { name: "KATE リップモンスター 11 5時の黄昏", price: 1540, cat: "リップ", rakuten: RK("KATE リップモンスター 11"), amazon: AMZ("KATE リップモンスター 11"), note: "深みのある黄昏テラコッタ" },
    { name: "メイベリン スーパーステイ ヴィニルインク 100", price: 1650, cat: "リップ", rakuten: RK("メイベリン ヴィニルインク 100"), amazon: AMZ("メイベリン ヴィニルインク 100"), note: "落ちにくいツヤブラウンレッド" },
    { name: "rom&nd ジューシーラスティングティント 08 アップルブラウン", price: 1485, cat: "リップ", rakuten: RK("rom&nd ジューシーラスティングティント 08"), amazon: AMZ("rom%26nd ジューシーラスティングティント 08"), note: "こっくりアップルブラウン" },
    { name: "セザンヌ ウォータリーティントリップ CT2", price: 638, cat: "リップ", rakuten: RK("セザンヌ ウォータリーティントリップ CT2"), amazon: AMZ("セザンヌ ウォータリーティントリップ CT2"), note: "テラコッタ系プチプラティント" },
    { name: "CANMAKE パーフェクトスタイリストアイズ 14 アンティークテラコッタ", price: 858, cat: "アイシャドウ", set: true, rakuten: RK("CANMAKE パーフェクトスタイリストアイズ 14"), amazon: AMZ("CANMAKE パーフェクトスタイリスト 14"), note: "こっくり深みのある目元に" },
    { name: "エクセル スキニーリッチシャドウ SR05 ウォームブラウン", price: 1650, cat: "アイシャドウ", rakuten: RK("エクセル スキニーリッチシャドウ SR05"), amazon: AMZ("エクセル スキニーリッチシャドウ SR05"), note: "深みの効いた黄みブラウン" },
    { name: "rom&nd ベターザンパレット 05 ベイクドブリック", price: 2750, cat: "アイシャドウ", rakuten: RK("rom&nd ベターザンパレット 05"), amazon: AMZ("rom%26nd ベターザンパレット 05"), note: "レンガ色のこなれパレット" },
    { name: "ヴィセ アヴァン シングルアイカラー テラコッタ系", price: 715, cat: "アイシャドウ", rakuten: RK("ヴィセ アヴァン シングルアイカラー テラコッタ"), amazon: AMZ("ヴィセ アヴァン シングルアイカラー テラコッタ"), note: "深いテラコッタ1色使い" },
    { name: "SUQQU トーンタッチアイズ ブラウン系", price: 2750, cat: "アイシャドウ", rakuten: RK("SUQQU トーンタッチアイズ ブラウン"), amazon: AMZ("SUQQU トーンタッチアイズ ブラウン"), note: "上質なブラウンの単色影" },
    { name: "CEZANNE ナチュラルチークN 04 シャインベージュ", price: 396, cat: "チーク", set: true, rakuten: RK("CEZANNE ナチュラルチーク 04"), amazon: AMZ("CEZANNE ナチュラルチーク 04"), note: "肌なじみ抜群のベージュチーク" },
    { name: "キャンメイク グロウフルールチークス 07 マロンミルクティ", price: 880, cat: "チーク", rakuten: RK("キャンメイク グロウフルールチークス 07"), amazon: AMZ("キャンメイク グロウフルールチークス 07"), note: "こっくりミルクティベージュ" },
    { name: "セザンヌ ナチュラルチークN 17 テラコッタ系", price: 396, cat: "チーク", rakuten: RK("セザンヌ ナチュラルチーク 17"), amazon: AMZ("セザンヌ ナチュラルチーク 17"), note: "落ち着いたテラコッタ" },
    { name: "excel オーラティックブラッシュ AB05 テラコッタ", price: 1650, cat: "チーク", rakuten: RK("excel オーラティックブラッシュ AB05"), amazon: AMZ("excel オーラティックブラッシュ AB05"), note: "ツヤ感テラコッタで大人顔" },
    { name: "リンメル マルチチーク 006 ブリックブラウン", price: 1320, cat: "チーク", rakuten: RK("リンメル マルチチーク 006"), amazon: AMZ("リンメル マルチチーク 006"), note: "深みブラウンの多用途チーク" },
    { name: "ヒロインメイク ロング&カールマスカラ ブラウン", price: 1100, cat: "マスカラ", set: true, rakuten: RK("ヒロインメイク ロングアンドカール マスカラ ブラウン"), amazon: AMZ("ヒロインメイク マスカラ ブラウン"), note: "深みブラウンで上品な存在感" },
    { name: "メイベリン ラッシュニスタ N ブラウン", price: 1400, cat: "マスカラ", rakuten: RK("メイベリン ラッシュニスタ ブラウン"), amazon: AMZ("メイベリン ラッシュニスタ ブラウン"), note: "深みのある赤みブラウン" },
    { name: "デジャヴュ ラッシュアップ E ダークブラウン", price: 1320, cat: "マスカラ", rakuten: RK("デジャヴュ ラッシュアップ ダークブラウン"), amazon: AMZ("デジャヴュ ラッシュアップ ダークブラウン"), note: "こっくり深いダークブラウン" },
    { name: "キャンメイク クイックラッシュカーラー ブラウン", price: 748, cat: "マスカラ", rakuten: RK("キャンメイク クイックラッシュカーラー ブラウン"), amazon: AMZ("キャンメイク クイックラッシュカーラー ブラウン"), note: "カール長持ちのブラウン" },
    { name: "フローフシ モテマスカラ ナチュラル ブラウンブラック", price: 1650, cat: "マスカラ", rakuten: RK("モテマスカラ ナチュラル ブラウンブラック"), amazon: AMZ("モテマスカラ ブラウンブラック"), note: "自然な深みのブラウンブラック" },
    { name: "キャンメイク クリーミータッチライナー 03 ダークブラウン", price: 715, cat: "アイライナー", set: true, rakuten: RK("キャンメイク クリーミータッチライナー 03"), amazon: AMZ("キャンメイク クリーミータッチライナー 03"), note: "濃茶でやさしく引き締め" },
    { name: "ラブ・ライナー リキッド ダークブラウン", price: 1760, cat: "アイライナー", rakuten: RK("ラブライナー リキッド ダークブラウン"), amazon: AMZ("ラブライナー ダークブラウン"), note: "深みブラウンで馴染む目元" },
    { name: "ヒロインメイク スムースリキッドアイライナー ブラウン", price: 1210, cat: "アイライナー", rakuten: RK("ヒロインメイク スムースリキッドアイライナー ブラウン"), amazon: AMZ("ヒロインメイク リキッドアイライナー ブラウン"), note: "落ちにくい深みブラウン" },
    { name: "デジャヴュ ラスティンファインE ブラウンブラック", price: 1210, cat: "アイライナー", rakuten: RK("デジャヴュ ラスティンファイン ブラウンブラック"), amazon: AMZ("デジャヴュ ラスティンファイン ブラウンブラック"), note: "深みの極細ライン" },
    { name: "msh ラブライナー クリームフィットペンシル ショコラブラウン", price: 1320, cat: "アイライナー", rakuten: RK("ラブライナー クリームフィットペンシル ショコラブラウン"), amazon: AMZ("ラブライナー ペンシル ショコラブラウン"), note: "こっくりショコラのペンシル" },
    { name: "KATE デザイニングアイブロウ3D ブラウン系", price: 1210, cat: "アイブロウ", set: true, rakuten: RK("KATE デザイニングアイブロウ3D"), amazon: AMZ("KATE デザイニングアイブロウ3D"), note: "立体感のあるブラウン眉に" },
    { name: "エクセル パウダー&ペンシルアイブロウEX PD05 グレイッシュブラウン", price: 1595, cat: "アイブロウ", rakuten: RK("エクセル パウダーアンドペンシルアイブロウ PD05"), amazon: AMZ("エクセル パウダーアンドペンシルアイブロウ PD05"), note: "深みのある3in1眉" },
    { name: "セザンヌ 超細芯アイブロウ 02 オリーブブラウン", price: 550, cat: "アイブロウ", rakuten: RK("セザンヌ 超細芯アイブロウ 02"), amazon: AMZ("セザンヌ 超細芯アイブロウ 02"), note: "黄み映えのオリーブブラウン" },
    { name: "ヘビーローテーション カラーリングアイブロウ 03 オリーブブラウン", price: 880, cat: "アイブロウ", rakuten: RK("ヘビーローテーション カラーリングアイブロウ 03"), amazon: AMZ("ヘビーローテーション カラーリングアイブロウ 03"), note: "深みブラウンの眉マスカラ" },
    { name: "ヴィセ アイブロウパウダー ブラウン系", price: 1320, cat: "アイブロウ", rakuten: RK("ヴィセ アイブロウパウダー ブラウン"), amazon: AMZ("ヴィセ アイブロウパウダー ブラウン"), note: "ふんわり深みの3色パウダー" },
  ],
  summer: [
    { name: "KATE リップモンスター 04 パンプキンワイン", price: 1540, cat: "リップ", set: true, rakuten: RK("KATE リップモンスター 04"), amazon: AMZ("KATE リップモンスター 04"), note: "ブルベ夏に寄り添う上品カラー" },
    { name: "rom&nd ジューシーラスティングティント 06 フィグフィグ", price: 1485, cat: "リップ", rakuten: RK("rom&nd ジューシーラスティングティント 06"), amazon: AMZ("rom%26nd ジューシーラスティングティント 06"), note: "青みローズの水光ティント" },
    { name: "オペラ リップティント N 03 シフォンピンク", price: 1650, cat: "リップ", rakuten: RK("オペラ リップティント 03 シフォンピンク"), amazon: AMZ("オペラ リップティント 03"), note: "透けるシフォンピンク" },
    { name: "セザンヌ ラスティンググロスリップ RS4 ローズ", price: 528, cat: "リップ", rakuten: RK("セザンヌ ラスティンググロスリップ RS4"), amazon: AMZ("セザンヌ ラスティンググロスリップ RS4"), note: "青みローズのプチプラグロス" },
    { name: "リンメル ラスティングフィニッシュ オイルティントリップ 007", price: 1650, cat: "リップ", rakuten: RK("リンメル オイルティントリップ 007"), amazon: AMZ("リンメル オイルティントリップ 007"), note: "くすみローズの潤いティント" },
    { name: "ETUDE プレイカラーアイズ ジューシーペブル", price: 2200, cat: "アイシャドウ", set: true, rakuten: RK("ETUDE プレイカラーアイズ ジューシーペブル"), amazon: AMZ("ETUDE プレイカラー ジューシーペブル"), note: "淡くやわらかいパレット" },
    { name: "CANMAKE シルキースフレアイズ 05 スイートラベンダー", price: 825, cat: "アイシャドウ", rakuten: RK("CANMAKE シルキースフレアイズ 05"), amazon: AMZ("CANMAKE シルキースフレアイズ 05"), note: "透明感のあるラベンダー" },
    { name: "rom&nd ベターザンパレット 02 モーヴウィスパー", price: 2750, cat: "アイシャドウ", rakuten: RK("rom&nd ベターザンパレット 02"), amazon: AMZ("rom%26nd ベターザンパレット 02"), note: "青みモーヴの上品パレット" },
    { name: "ヴィセ アヴァン シングルアイカラー ローズ系", price: 715, cat: "アイシャドウ", rakuten: RK("ヴィセ アヴァン シングルアイカラー ローズ"), amazon: AMZ("ヴィセ アヴァン シングルアイカラー ローズ"), note: "やわらかローズの単色" },
    { name: "エクセル スキニーリッチシャドウ SR08 ピンクブラウン", price: 1650, cat: "アイシャドウ", rakuten: RK("エクセル スキニーリッチシャドウ SR08"), amazon: AMZ("エクセル スキニーリッチシャドウ SR08"), note: "青みを含むピンクブラウン" },
    { name: "CEZANNE ナチュラルチークN 02 ピンク", price: 396, cat: "チーク", set: true, rakuten: RK("CEZANNE ナチュラルチーク 02"), amazon: AMZ("CEZANNE ナチュラルチーク 02"), note: "青みピンクで透明感UP" },
    { name: "キャンメイク グロウフルールチークス 02 ロマンティックローズ", price: 880, cat: "チーク", rakuten: RK("キャンメイク グロウフルールチークス 02"), amazon: AMZ("キャンメイク グロウフルールチークス 02"), note: "上品な青みローズ" },
    { name: "セザンヌ ナチュラルチークN 15 ローズ系", price: 396, cat: "チーク", rakuten: RK("セザンヌ ナチュラルチーク 15"), amazon: AMZ("セザンヌ ナチュラルチーク 15"), note: "やわらかローズプチプラ" },
    { name: "excel オーラティックブラッシュ AB02 ローズ", price: 1650, cat: "チーク", rakuten: RK("excel オーラティックブラッシュ AB02"), amazon: AMZ("excel オーラティックブラッシュ AB02"), note: "ツヤ感ローズで透明感" },
    { name: "リンメル マルチチーク 003 ローズピンク", price: 1320, cat: "チーク", rakuten: RK("リンメル マルチチーク 003"), amazon: AMZ("リンメル マルチチーク 003"), note: "青みローズの多用途チーク" },
    { name: "キャンメイク クイックラッシュカーラー ワインモーヴ", price: 748, cat: "マスカラ", set: true, rakuten: RK("キャンメイク クイックラッシュカーラー ワインモーヴ"), amazon: AMZ("キャンメイク クイックラッシュカーラー ワインモーヴ"), note: "モーヴの色気を目元に" },
    { name: "ヒロインメイク ロング&カールマスカラ グレー", price: 1100, cat: "マスカラ", rakuten: RK("ヒロインメイク ロングアンドカール マスカラ グレー"), amazon: AMZ("ヒロインメイク マスカラ グレー"), note: "やわらかいグレーの抜け感" },
    { name: "デジャヴュ ラッシュアップ E モーヴブラウン", price: 1320, cat: "マスカラ", rakuten: RK("デジャヴュ ラッシュアップ モーヴブラウン"), amazon: AMZ("デジャヴュ ラッシュアップ モーヴブラウン"), note: "青みを含むモーヴブラウン" },
    { name: "キャンメイク クイックラッシュカーラー ブラウン", price: 748, cat: "マスカラ", rakuten: RK("キャンメイク クイックラッシュカーラー ブラウン"), amazon: AMZ("キャンメイク クイックラッシュカーラー ブラウン"), note: "やさしいブラウンのカール" },
    { name: "フローフシ モテマスカラ ナチュラル ブラウンブラック", price: 1650, cat: "マスカラ", rakuten: RK("モテマスカラ ナチュラル ブラウンブラック"), amazon: AMZ("モテマスカラ ブラウンブラック"), note: "重すぎないブラウンブラック" },
    { name: "ラブ・ライナー リキッドアイライナー グレージュ", price: 1760, cat: "アイライナー", set: true, rakuten: RK("ラブライナー リキッド グレージュ"), amazon: AMZ("ラブライナー グレージュ"), note: "やわらかグレージュライン" },
    { name: "キャンメイク クリーミータッチライナー 05 モーヴブラウン", price: 715, cat: "アイライナー", rakuten: RK("キャンメイク クリーミータッチライナー 05"), amazon: AMZ("キャンメイク クリーミータッチライナー 05"), note: "青みを含むモーヴブラウン" },
    { name: "ヒロインメイク スムースリキッドアイライナー グレージュ", price: 1210, cat: "アイライナー", rakuten: RK("ヒロインメイク スムースリキッドアイライナー グレージュ"), amazon: AMZ("ヒロインメイク リキッドアイライナー グレージュ"), note: "抜け感のあるグレージュ" },
    { name: "デジャヴュ ラスティンファインE モカ", price: 1210, cat: "アイライナー", rakuten: RK("デジャヴュ ラスティンファイン モカ"), amazon: AMZ("デジャヴュ ラスティンファイン モカ"), note: "やわらかモカの極細ライン" },
    { name: "msh ラブライナー クリームフィットペンシル モーヴブラウン", price: 1320, cat: "アイライナー", rakuten: RK("ラブライナー クリームフィットペンシル モーヴブラウン"), amazon: AMZ("ラブライナー ペンシル モーヴブラウン"), note: "青みモーヴのペンシル" },
    { name: "リシェ プリズム・パウダーアイブロウ アッシュ系", price: 715, cat: "アイブロウ", set: true, rakuten: RK("リシェ プリズム パウダーアイブロウ"), amazon: AMZ("リシェ プリズム パウダーアイブロウ"), note: "アッシュ系で抜け感眉に" },
    { name: "エクセル パウダー&ペンシルアイブロウEX PD05 グレイッシュブラウン", price: 1595, cat: "アイブロウ", rakuten: RK("エクセル パウダーアンドペンシルアイブロウ PD05"), amazon: AMZ("エクセル パウダーアンドペンシルアイブロウ PD05"), note: "青みを含むグレイッシュ" },
    { name: "セザンヌ 超細芯アイブロウ 04 アッシュブラウン", price: 550, cat: "アイブロウ", rakuten: RK("セザンヌ 超細芯アイブロウ 04"), amazon: AMZ("セザンヌ 超細芯アイブロウ 04"), note: "くすみアッシュのプチプラ" },
    { name: "ヘビーローテーション カラーリングアイブロウ 01 アッシュブラウン", price: 880, cat: "アイブロウ", rakuten: RK("ヘビーローテーション カラーリングアイブロウ 01"), amazon: AMZ("ヘビーローテーション カラーリングアイブロウ 01"), note: "アッシュ系の眉マスカラ" },
    { name: "ヴィセ アイブロウパウダー グレイッシュブラウン", price: 1320, cat: "アイブロウ", rakuten: RK("ヴィセ アイブロウパウダー グレイッシュブラウン"), amazon: AMZ("ヴィセ アイブロウパウダー グレイッシュブラウン"), note: "くすみ感の3色パウダー" },
  ],
  winter: [
    { name: "KATE リップモンスター 06 2:00AM", price: 1540, cat: "リップ", set: true, rakuten: RK("KATE リップモンスター 06"), amazon: AMZ("KATE リップモンスター 06"), note: "ブルベ冬の鮮烈な深みレッド" },
    { name: "rom&nd ジューシーラスティングティント 09 リッチェリー", price: 1485, cat: "リップ", rakuten: RK("rom&nd ジューシーラスティングティント 09"), amazon: AMZ("rom%26nd ジューシーラスティングティント 09"), note: "鮮やかチェリーのティント" },
    { name: "メイベリン スーパーステイ ヴィニルインク 20 コーティ", price: 1650, cat: "リップ", rakuten: RK("メイベリン ヴィニルインク 20"), amazon: AMZ("メイベリン ヴィニルインク 20"), note: "青みの効いた鮮烈レッド" },
    { name: "オペラ リップティント N 06 ピンクレッド", price: 1650, cat: "リップ", rakuten: RK("オペラ リップティント 06 ピンクレッド"), amazon: AMZ("オペラ リップティント 06"), note: "澄んだピンクレッド" },
    { name: "CLIO メルティングマットリップ 06 ワイン系", price: 1650, cat: "リップ", rakuten: RK("CLIO メルティングマットリップ ワイン"), amazon: AMZ("CLIO メルティングマットリップ ワイン"), note: "深みワインのマットリップ" },
    { name: "CANMAKE シルキースフレアイズ 06 スモーキーモーヴ", price: 825, cat: "アイシャドウ", set: true, rakuten: RK("CANMAKE シルキースフレアイズ 06"), amazon: AMZ("CANMAKE シルキースフレアイズ 06"), note: "モーヴで凛とした目元に" },
    { name: "CLIO プロアイパレット 05 グリッタリーポップス", price: 3300, cat: "アイシャドウ", rakuten: RK("CLIO プロアイパレット 05"), amazon: AMZ("CLIO プロアイパレット 05"), note: "煌めきで華やかに" },
    { name: "rom&nd ベターザンパレット 03 ローズビュットガーデン", price: 2750, cat: "アイシャドウ", rakuten: RK("rom&nd ベターザンパレット 03"), amazon: AMZ("rom%26nd ベターザンパレット 03"), note: "鮮やかローズの華やかパレット" },
    { name: "エクセル スキニーリッチシャドウ SR06 グレイッシュモーヴ", price: 1650, cat: "アイシャドウ", rakuten: RK("エクセル スキニーリッチシャドウ SR06"), amazon: AMZ("エクセル スキニーリッチシャドウ SR06"), note: "青みグレイッシュモーヴ" },
    { name: "ヴィセ アヴァン シングルアイカラー モーヴ系", price: 715, cat: "アイシャドウ", rakuten: RK("ヴィセ アヴァン シングルアイカラー モーヴ"), amazon: AMZ("ヴィセ アヴァン シングルアイカラー モーヴ"), note: "凛としたモーヴ1色" },
    { name: "キャンメイク グロウフルールチークス 03 ロージー", price: 880, cat: "チーク", set: true, rakuten: RK("キャンメイク グロウフルールチークス 03"), amazon: AMZ("キャンメイク グロウフルールチークス 03"), note: "青みロージーで血色感を" },
    { name: "セザンヌ ナチュラルチークN 16 ローズピンク", price: 396, cat: "チーク", rakuten: RK("セザンヌ ナチュラルチーク 16"), amazon: AMZ("セザンヌ ナチュラルチーク 16"), note: "鮮やか青みピンクのプチプラ" },
    { name: "excel オーラティックブラッシュ AB04 ローズモーヴ", price: 1650, cat: "チーク", rakuten: RK("excel オーラティックブラッシュ AB04"), amazon: AMZ("excel オーラティックブラッシュ AB04"), note: "ツヤ感ローズモーヴ" },
    { name: "リンメル マルチチーク 004 ローズレッド", price: 1320, cat: "チーク", rakuten: RK("リンメル マルチチーク 004"), amazon: AMZ("リンメル マルチチーク 004"), note: "青みローズレッドの多用途" },
    { name: "CLIO プリズムエアーブラッシャー ローズ系", price: 1650, cat: "チーク", rakuten: RK("CLIO プリズムエアーブラッシャー ローズ"), amazon: AMZ("CLIO プリズムエアーブラッシャー ローズ"), note: "澄んだローズの発色" },
    { name: "ヒロインメイク ロング&カールマスカラ ブラック", price: 1100, cat: "マスカラ", set: true, rakuten: RK("ヒロインメイク ロングアンドカール マスカラ ブラック"), amazon: AMZ("ヒロインメイク マスカラ ブラック"), note: "漆黒でコントラストを効かせて" },
    { name: "メイベリン ラッシュニスタ N ブラック", price: 1400, cat: "マスカラ", rakuten: RK("メイベリン ラッシュニスタ ブラック"), amazon: AMZ("メイベリン ラッシュニスタ ブラック"), note: "くっきり際立つ漆黒" },
    { name: "デジャヴュ ラッシュアップ E ブラック", price: 1320, cat: "マスカラ", rakuten: RK("デジャヴュ ラッシュアップ ブラック"), amazon: AMZ("デジャヴュ ラッシュアップ ブラック"), note: "自然に伸びる漆黒" },
    { name: "キャンメイク クイックラッシュカーラー ブラック", price: 748, cat: "マスカラ", rakuten: RK("キャンメイク クイックラッシュカーラー ブラック"), amazon: AMZ("キャンメイク クイックラッシュカーラー ブラック"), note: "カール長持ちの黒" },
    { name: "フローフシ モテマスカラ テクニカル 01 ブラック", price: 1650, cat: "マスカラ", rakuten: RK("モテマスカラ テクニカル ブラック"), amazon: AMZ("モテマスカラ テクニカル ブラック"), note: "際立つロング＆ボリューム黒" },
    { name: "ラブ・ライナー リキッドアイライナー ブラック", price: 1760, cat: "アイライナー", set: true, rakuten: RK("ラブライナー リキッド ブラック"), amazon: AMZ("ラブライナー ブラック"), note: "くっきり黒で凛と" },
    { name: "ヒロインメイク スムースリキッドアイライナー ブラック", price: 1210, cat: "アイライナー", rakuten: RK("ヒロインメイク スムースリキッドアイライナー ブラック"), amazon: AMZ("ヒロインメイク リキッドアイライナー ブラック"), note: "にじまない漆黒ライン" },
    { name: "デジャヴュ ラスティンファインE ブラック", price: 1210, cat: "アイライナー", rakuten: RK("デジャヴュ ラスティンファイン ブラック"), amazon: AMZ("デジャヴュ ラスティンファイン ブラック"), note: "極細で引き締める黒" },
    { name: "キャンメイク クリーミータッチライナー 01 ディープブラック", price: 715, cat: "アイライナー", rakuten: RK("キャンメイク クリーミータッチライナー 01"), amazon: AMZ("キャンメイク クリーミータッチライナー 01"), note: "濃密ジェルの漆黒" },
    { name: "msh ラブライナー クリームフィットペンシル ブラック", price: 1320, cat: "アイライナー", rakuten: RK("ラブライナー クリームフィットペンシル ブラック"), amazon: AMZ("ラブライナー ペンシル ブラック"), note: "なめらかな黒ペンシル" },
    { name: "リシェ プリズム・パウダーアイブロウ アッシュ系", price: 715, cat: "アイブロウ", set: true, rakuten: RK("リシェ プリズム パウダーアイブロウ"), amazon: AMZ("リシェ プリズム パウダーアイブロウ"), note: "アッシュ系で洗練眉に" },
    { name: "エクセル パウダー&ペンシルアイブロウEX PD06 アッシュブラウン", price: 1595, cat: "アイブロウ", rakuten: RK("エクセル パウダーアンドペンシルアイブロウ PD06"), amazon: AMZ("エクセル パウダーアンドペンシルアイブロウ PD06"), note: "クールなアッシュブラウン" },
    { name: "セザンヌ 超細芯アイブロウ 04 アッシュブラウン", price: 550, cat: "アイブロウ", rakuten: RK("セザンヌ 超細芯アイブロウ 04"), amazon: AMZ("セザンヌ 超細芯アイブロウ 04"), note: "くすみアッシュのプチプラ" },
    { name: "ヘビーローテーション カラーリングアイブロウ 06 グレー系", price: 880, cat: "アイブロウ", rakuten: RK("ヘビーローテーション カラーリングアイブロウ 06"), amazon: AMZ("ヘビーローテーション カラーリングアイブロウ 06"), note: "暗髪に合うグレー眉マスカラ" },
    { name: "KATE デザイニングアイブロウ3D EX-5 アッシュ系", price: 1210, cat: "アイブロウ", rakuten: RK("KATE デザイニングアイブロウ3D EX-5"), amazon: AMZ("KATE デザイニングアイブロウ3D EX-5"), note: "クールな寒色ブラウン眉" },
  ],
};

// 似合う髪色（自社髪色記事の内容ベース）＋セルフカラーAFF
const HAIR = {
  spring: {
    colors: [
      { name: "ミルクティーベージュ", hex: "#C8A882" },
      { name: "明るめブラウン", hex: "#A5754E" },
      { name: "オレンジブラウン", hex: "#9E5B3C" },
    ],
    tip: "明るく黄みのある髪色が、イエベ春の肌のツヤ感を引き立てます。重い黒髪より、光を含む明るめトーンが得意です。",
    article: "https://www.iebel.jp/articles/26",
    aff: { name: "パルティ カラーリングミルク モカショコラ", price: 920, cat: "セルフカラー", rakuten: RK("パルティ カラーリングミルク モカショコラ"), amazon: AMZ("パルティ カラーリングミルク モカショコラ"), note: "セルフで黄みブラウンに" },
    affs: [
      { name: "パルティ カラーリングミルク モカショコラ", price: 920, cat: "セルフカラー", rakuten: RK("パルティ カラーリングミルク モカショコラ"), amazon: AMZ("パルティ カラーリングミルク モカショコラ"), note: "セルフで黄みブラウンに" },
      { name: "リーゼ 泡カラー マシュマロブラウン", price: 760, cat: "セルフカラー", rakuten: RK("リーゼ 泡カラー マシュマロブラウン"), amazon: AMZ("リーゼ 泡カラー マシュマロブラウン"), note: "明るめミルクティー系に" },
      { name: "エブリ カラートリートメント ライトブラウン", price: 1408, cat: "カラートリートメント", rakuten: RK("エブリ カラートリートメント ライトブラウン"), amazon: AMZ("エブリ カラートリートメント ライトブラウン"), note: "色落ちケアで明るさキープ" },
      { name: "エヌドット カラーシャンプー ベージュ", price: 1540, cat: "カラーシャンプー", rakuten: RK("エヌドット カラーシャンプー ベージュ"), amazon: AMZ("エヌドット カラーシャンプー ベージュ"), note: "黄みを保ちくすみ防止" },
      { name: "フィーノ プレミアムタッチ 洗い流すトリートメント", price: 810, cat: "ヘアケア", rakuten: RK("フィーノ プレミアムタッチ トリートメント"), amazon: AMZ("フィーノ プレミアムタッチ トリートメント"), note: "染めた髪にツヤを補給" },
    ],
  },
  autumn: {
    colors: [
      { name: "ショコラブラウン", hex: "#5B3A29" },
      { name: "オリーブアッシュ", hex: "#6B6B4A" },
      { name: "テラコッタブラウン", hex: "#8A4B32" },
    ],
    tip: "深みとこっくり感のある暖色ブラウンが得意。ツヤの出るショコラ系で、大人の落ち着きが引き立ちます。",
    article: "https://www.iebel.jp/articles/26",
    aff: { name: "パルティ カラーリングミルク モカショコラ", price: 920, cat: "セルフカラー", rakuten: RK("パルティ カラーリングミルク モカショコラ"), amazon: AMZ("パルティ カラーリングミルク モカショコラ"), note: "イエベ秋の定番モカ系" },
    affs: [
      { name: "パルティ カラーリングミルク モカショコラ", price: 920, cat: "セルフカラー", rakuten: RK("パルティ カラーリングミルク モカショコラ"), amazon: AMZ("パルティ カラーリングミルク モカショコラ"), note: "イエベ秋の定番モカ系" },
      { name: "リーゼ 泡カラー ショコラブラウン", price: 760, cat: "セルフカラー", rakuten: RK("リーゼ 泡カラー ショコラブラウン"), amazon: AMZ("リーゼ 泡カラー ショコラブラウン"), note: "深みのあるこっくりブラウンに" },
      { name: "エブリ カラートリートメント ダークブラウン", price: 1408, cat: "カラートリートメント", rakuten: RK("エブリ カラートリートメント ダークブラウン"), amazon: AMZ("エブリ カラートリートメント ダークブラウン"), note: "色持ちケアで深み維持" },
      { name: "アンナドンナ エブリ カラーシャンプー ブラウン", price: 1540, cat: "カラーシャンプー", rakuten: RK("アンナドンナ エブリ カラーシャンプー ブラウン"), amazon: AMZ("エブリ カラーシャンプー ブラウン"), note: "赤み・くすみを整える" },
      { name: "フィーノ プレミアムタッチ 洗い流すトリートメント", price: 810, cat: "ヘアケア", rakuten: RK("フィーノ プレミアムタッチ トリートメント"), amazon: AMZ("フィーノ プレミアムタッチ トリートメント"), note: "ショコラ髪にツヤを補給" },
    ],
  },
  summer: {
    colors: [
      { name: "ピンクブラウン", hex: "#8A5A62" },
      { name: "ローズベージュ", hex: "#A87E80" },
      { name: "アッシュブラウン", hex: "#7A6E6B" },
    ],
    tip: "赤みを抑えたアッシュ系や、やわらかなローズ系が得意。黄みの強いオレンジブラウンは肌がくすんで見えやすいので注意。",
    article: "https://www.blubel.jp/articles/417",
    aff: { name: "リーゼ 泡カラー ブリリアンスアッシュ", price: 760, cat: "セルフカラー", rakuten: RK("リーゼ 泡カラー ブリリアンスアッシュ"), amazon: AMZ("リーゼ 泡カラー アッシュ"), note: "セルフで透明感アッシュに" },
    affs: [
      { name: "リーゼ 泡カラー ブリリアンスアッシュ", price: 760, cat: "セルフカラー", rakuten: RK("リーゼ 泡カラー ブリリアンスアッシュ"), amazon: AMZ("リーゼ 泡カラー アッシュ"), note: "セルフで透明感アッシュに" },
      { name: "パルティ カラーリングミルク ローズブラウン", price: 920, cat: "セルフカラー", rakuten: RK("パルティ カラーリングミルク ローズブラウン"), amazon: AMZ("パルティ カラーリングミルク ローズブラウン"), note: "やわらかローズ系で肌に透明感" },
      { name: "エブリ カラートリートメント アッシュ", price: 1408, cat: "カラートリートメント", rakuten: RK("エブリ カラートリートメント アッシュ"), amazon: AMZ("エブリ カラートリートメント アッシュ"), note: "赤みを抑えてくすみ防止" },
      { name: "エヌドット カラーシャンプー パープル", price: 1540, cat: "カラーシャンプー", rakuten: RK("エヌドット カラーシャンプー パープル"), amazon: AMZ("エヌドット カラーシャンプー パープル"), note: "黄ばみを抑え透明感キープ" },
      { name: "フィーノ プレミアムタッチ 洗い流すトリートメント", price: 810, cat: "ヘアケア", rakuten: RK("フィーノ プレミアムタッチ トリートメント"), amazon: AMZ("フィーノ プレミアムタッチ トリートメント"), note: "アッシュ髪にうるおいとツヤを" },
    ],
  },
  winter: {
    colors: [
      { name: "ブルーブラック", hex: "#1B1F2A" },
      { name: "ダークアッシュ", hex: "#3C4048" },
      { name: "バーガンディ", hex: "#4A2430" },
    ],
    tip: "ツヤのある黒〜青み系ダークカラーが最強。コントラストが際立ち、凛とした印象に仕上がります。",
    article: "https://www.blubel.jp/articles/135",
    aff: { name: "リーゼ 泡カラー ブリリアンスアッシュ", price: 760, cat: "セルフカラー", rakuten: RK("リーゼ 泡カラー ブリリアンスアッシュ"), amazon: AMZ("リーゼ 泡カラー アッシュ"), note: "赤みを抑えたクールな髪色に" },
    affs: [
      { name: "リーゼ 泡カラー ブリリアンスアッシュ", price: 760, cat: "セルフカラー", rakuten: RK("リーゼ 泡カラー ブリリアンスアッシュ"), amazon: AMZ("リーゼ 泡カラー アッシュ"), note: "赤みを抑えたクールな髪色に" },
      { name: "パルティ カラーリングミルク ブルーブラック", price: 920, cat: "セルフカラー", rakuten: RK("パルティ カラーリングミルク ブルーブラック"), amazon: AMZ("パルティ カラーリングミルク ブルーブラック"), note: "青みのある艶やかな黒に" },
      { name: "エブリ カラートリートメント ブルーブラック", price: 1408, cat: "カラートリートメント", rakuten: RK("エブリ カラートリートメント ブルーブラック"), amazon: AMZ("エブリ カラートリートメント ブルーブラック"), note: "色落ちを防いで青みキープ" },
      { name: "エヌドット カラーシャンプー パープル", price: 1540, cat: "カラーシャンプー", rakuten: RK("エヌドット カラーシャンプー パープル"), amazon: AMZ("エヌドット カラーシャンプー パープル"), note: "黄ばみを抑えクールな発色に" },
      { name: "フィーノ プレミアムタッチ 洗い流すトリートメント", price: 810, cat: "ヘアケア", rakuten: RK("フィーノ プレミアムタッチ トリートメント"), amazon: AMZ("フィーノ プレミアムタッチ トリートメント"), note: "ダーク髪の艶を引き出す" },
    ],
  },
};


// ════════════════════════════════════════════
// ① NGカラー診断（タイプ別・避けたい色→置き換え色）
// ════════════════════════════════════════════
const NG_COLORS = {
  spring: [
    { name: "真っ黒", hex: "#141414", why: "重さで肌のツヤ感が消え、顔色が沈んで見えやすい", alt: { name: "キャメル", hex: "#C89B5A" } },
    { name: "青みの強いローズ", hex: "#B04A7A", why: "黄みの肌と喧嘩して、くすみや疲れ顔の原因に", alt: { name: "コーラルピンク", hex: "#F49A8C" } },
    { name: "グレー", hex: "#8C8C93", why: "無彩色のくすみが、春の透明感を打ち消してしまう", alt: { name: "アイボリー", hex: "#F5EDDC" } },
    { name: "ダークネイビー", hex: "#1E2A44", why: "暗く重い寒色は若々しさ・血色感を弱めやすい", alt: { name: "ライトベージュ", hex: "#E8D7BC" } },
  ],
  summer: [
    { name: "オレンジ", hex: "#E8722A", why: "強い黄みが肌の赤みを強調し、くすんで見えやすい", alt: { name: "ラベンダー", hex: "#C9B8D8" } },
    { name: "こっくりブラウン", hex: "#6B4226", why: "深い黄みブラウンは透明感を消し、重たい印象に", alt: { name: "グレージュ", hex: "#B7ACA6" } },
    { name: "ビビッドイエロー", hex: "#F2C200", why: "強い原色は上品なソフトさと相性が悪い", alt: { name: "ベビーピンク", hex: "#E8A9C0" } },
    { name: "カーキ", hex: "#6B6B4A", why: "黄みの濁りが顔色を暗く見せやすい", alt: { name: "ブルーグレー", hex: "#93A5B8" } },
  ],
  autumn: [
    { name: "青みピンク", hex: "#E86FA8", why: "青みが強い色は黄みの深い肌から浮きやすい", alt: { name: "サーモンピンク", hex: "#E8927C" } },
    { name: "純白", hex: "#FFFFFF", why: "真っ白は肌の深みと分離し、顔だけ黄ぐすみして見える", alt: { name: "エクリュ", hex: "#EFE4CD" } },
    { name: "ビビッドブルー", hex: "#1F5BD6", why: "鮮やかな寒色はリッチな深みと喧嘩する", alt: { name: "ティールグリーン", hex: "#2E6E63" } },
    { name: "ライトグレー", hex: "#C9C9CE", why: "淡いくすみ寒色は血色を奪いやすい", alt: { name: "キャメルブラウン", hex: "#A8703F" } },
  ],
  winter: [
    { name: "くすみベージュ", hex: "#C4AE97", why: "濁りのある中間色はコントラストの魅力を消す", alt: { name: "ピュアホワイト", hex: "#FFFFFF" } },
    { name: "アイボリー", hex: "#F2E8D5", why: "黄みがかった白は肌の青みと分離しやすい", alt: { name: "ロイヤルブルー", hex: "#3B5BA5" } },
    { name: "オレンジブラウン", hex: "#A8663A", why: "黄み暖色は鮮やかさを打ち消し、地味見えの原因に", alt: { name: "ワインレッド", hex: "#7A1E3C" } },
    { name: "モスグリーン", hex: "#5F6B3F", why: "くすみ暖色はシャープさを弱める", alt: { name: "エメラルド", hex: "#1F9E8E" } },
  ],
};

// ════════════════════════════════════════════
// ② 手持ち服カラーチェッカー（24色×4タイプ判定）
// ════════════════════════════════════════════
const COLOR_CHECK = [
  { name: "コーラルピンク", hex: "#F49A8C", r: { spring: "◎", summer: "△", autumn: "○", winter: "✕" } },
  { name: "青みピンク", hex: "#E8A9C0", r: { spring: "△", summer: "◎", autumn: "✕", winter: "○" } },
  { name: "ビビッドピンク", hex: "#D6337F", r: { spring: "△", summer: "△", autumn: "✕", winter: "◎" } },
  { name: "サーモンピンク", hex: "#E8927C", r: { spring: "◎", summer: "✕", autumn: "◎", winter: "✕" } },
  { name: "レッド", hex: "#C0242C", r: { spring: "○", summer: "✕", autumn: "○", winter: "◎" } },
  { name: "ワインレッド", hex: "#7A1E3C", r: { spring: "✕", summer: "△", autumn: "○", winter: "◎" } },
  { name: "オレンジ", hex: "#E8722A", r: { spring: "◎", summer: "✕", autumn: "◎", winter: "✕" } },
  { name: "テラコッタ", hex: "#A8543A", r: { spring: "○", summer: "✕", autumn: "◎", winter: "✕" } },
  { name: "イエロー", hex: "#F2C94C", r: { spring: "◎", summer: "✕", autumn: "○", winter: "△" } },
  { name: "マスタード", hex: "#C89B3C", r: { spring: "○", summer: "✕", autumn: "◎", winter: "✕" } },
  { name: "ベージュ", hex: "#D9C4A3", r: { spring: "◎", summer: "△", autumn: "◎", winter: "✕" } },
  { name: "キャメル", hex: "#B5824A", r: { spring: "◎", summer: "✕", autumn: "◎", winter: "✕" } },
  { name: "ブラウン", hex: "#6B4226", r: { spring: "○", summer: "✕", autumn: "◎", winter: "△" } },
  { name: "カーキ", hex: "#6B6B4A", r: { spring: "△", summer: "✕", autumn: "◎", winter: "✕" } },
  { name: "ミントグリーン", hex: "#9FD9C3", r: { spring: "◎", summer: "○", autumn: "✕", winter: "△" } },
  { name: "エメラルド", hex: "#1F9E8E", r: { spring: "○", summer: "△", autumn: "○", winter: "◎" } },
  { name: "水色", hex: "#A9C4DE", r: { spring: "○", summer: "◎", autumn: "✕", winter: "○" } },
  { name: "ロイヤルブルー", hex: "#3B5BA5", r: { spring: "△", summer: "○", autumn: "✕", winter: "◎" } },
  { name: "ネイビー", hex: "#1E2A44", r: { spring: "△", summer: "○", autumn: "○", winter: "◎" } },
  { name: "ラベンダー", hex: "#C9B8D8", r: { spring: "△", summer: "◎", autumn: "✕", winter: "○" } },
  { name: "パープル", hex: "#6E3FA3", r: { spring: "✕", summer: "△", autumn: "△", winter: "◎" } },
  { name: "グレー", hex: "#8C8C93", r: { spring: "✕", summer: "◎", autumn: "△", winter: "○" } },
  { name: "ホワイト", hex: "#FFFFFF", r: { spring: "○", summer: "○", autumn: "✕", winter: "◎" } },
  { name: "ブラック", hex: "#141414", r: { spring: "✕", summer: "△", autumn: "△", winter: "◎" } },
];
const RATING_LABEL = { "◎": "とても似合う色", "○": "似合う色", "△": "工夫すれば使える色", "✕": "顔まわりでは避けたい色" };
const RATING_TIP = {
  "◎": "自信を持って顔まわりに。トップスやワンピースで主役にできます。",
  "○": "普段使いに十分なじむ色。素材や小物で自分らしさを足して。",
  "△": "顔から離す（ボトムス・バッグ）か、得意色を顔まわりに挟むと使えます。",
  "✕": "トップスは避けて、ボトムスや小物での取り入れが安全。顔まわりは得意色に置き換えを。",
};

// ════════════════════════════════════════════
// ③ 試し塗りカラー（リップ＝タイプ別主力色 / 髪色＝HAIRと連動）
// ════════════════════════════════════════════
const TRYON_LIPS = {
  spring: [ { name: "コーラル", hex: "#E86A55" }, { name: "アプリコット", hex: "#E8875C" }, { name: "ピーチピンク", hex: "#EE8B7E" } ],
  summer: [ { name: "ローズ", hex: "#B45A72" }, { name: "青みピンク", hex: "#C96A8E" }, { name: "モーヴ", hex: "#A05A78" } ],
  autumn: [ { name: "テラコッタ", hex: "#B0523A" }, { name: "ブラウンレッド", hex: "#8E3B2E" }, { name: "レンガ", hex: "#A34A32" } ],
  winter: [ { name: "深みレッド", hex: "#9E1F33" }, { name: "チェリー", hex: "#C21F45" }, { name: "ワイン", hex: "#701A34" } ],
};

// ════════════════════════════════════════════
// ⑤ 今季の買い足しワードローブ（月→季節を自動判定）
// ════════════════════════════════════════════
const SEASON_OF_MONTH = (m) => (m >= 3 && m <= 5 ? "spr" : m >= 6 && m <= 8 ? "sum" : m >= 9 && m <= 11 ? "aut" : "win");
const SEASON_LABEL = { spr: "春", sum: "夏", aut: "秋", win: "冬" };
const WARDROBE_FOCUS = {
  spr: {
    spring: "明るいトーンのブラウス＆ワンピで、いちばん得意な季節を主役に",
    summer: "淡い寒色のシャツ・ワンピで、春の光をやわらかく纏って",
    autumn: "ベージュ〜サーモン系のトップスで、春でも深みをキープ",
    winter: "白×黒のクリア配色で、春もシャープな印象を崩さずに",
  },
  sum: {
    spring: "コーラル系の半袖・ワンピで、健康的な明るさを最大化",
    summer: "シアー素材×寒色トップスで、涼しげな透明感を全開に",
    autumn: "テラコッタ・カーキのワンピで、夏でも大人の深みを",
    winter: "モノトーンのメリハリ配色で、夏こそクールに引き締めて",
  },
  aut: {
    spring: "キャメル・マスタードの軽やかトップスで秋の暖かみを",
    summer: "グレージュ・モーヴのスモーキー色で秋の抜け感を",
    autumn: "こっくりブラウン・カーキで、最も得意な季節を満喫",
    winter: "ダークトーン×差し色1点で、凛とした秋コーデに",
  },
  win: {
    spring: "明るいベージュのニットで、冬でも顔色をぱっと明るく",
    summer: "グレー・ネイビーの上品ニットで、やわらかく品よく",
    autumn: "ダークブラウン・マスタードで、温かみのある冬に",
    winter: "黒×白のコントラストで、冬がいちばん映えるタイプ",
  },
};
const WARDROBE_ROLES = [
  { key: "tops", role: "主役トップス", cats: ["トップス"], n: 2, why: "顔まわりに得意色を置く、着回しの軸になる1枚" },
  { key: "onepiece", role: "きれいめワンピ／ボトム", cats: ["ワンピース", "ボトムス", "セットアップ"], n: 2, why: "1枚でコーデが決まる、仕事にもデートにも効く" },
  { key: "acc", role: "仕上げの小物", cats: ["アクセサリー", "バッグ"], n: 1, why: "手持ち服の印象を更新する、いちばん手軽な近道" },
];
const WD_WORRIES = [
  { key: "pattern", label: "コーデがワンパターン", tip: "いつもの服に「役割の違う1枚」を足すのが近道。特に小物と羽織りは、同じ服でも印象を大きく変えてくれます。" },
  { key: "dull", label: "顔色がくすんで見える", tip: "原因はたいてい顔まわりの色。トップスを得意色に替えるだけで、レフ板効果で肌が明るく見えます。" },
  { key: "unknown", label: "何を買えばいいかわからない", tip: "「持っていない役割」から埋めるのが失敗しないコツ。下の提案は、そのままチェックリストとして使えます。" },
  { key: "mix", label: "手持ち服と合わせにくい", tip: "得意色のベーシック形を選べば、手持ちのどの服とも喧嘩しません。柄物より無地を優先しましょう。" },
];

const NUM2KEY = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };

const TYPES = {
  spring: { key: "spring", num: 1, name: "イエベ春", en: "Spring", catch: "光をまとう、いきいきとした暖色", palette: ["#F7C9A0", "#F4A582", "#F6D65B", "#8FCB9B", "#FFF3E2"], ng: ["黒", "グレー", "青みの強い色"], accent: "#E8927C", site: "iebel", siteName: "IEBEL", siteUrl: "https://iebel.jp", sns: "@iebe_lab" },
  summer: { key: "summer", num: 2, name: "ブルベ夏", en: "Summer", catch: "やわらかく澄んだ、上品な寒色", palette: ["#C9B8D8", "#E8A9C0", "#A9C4DE", "#B7BCC4", "#F3EEF5"], ng: ["オレンジ", "こっくりブラウン", "強い原色"], accent: "#9B8CB5", site: "blubel", siteName: "BLUBEL", siteUrl: "https://blubel.jp", sns: "@blube_lab" },
  autumn: { key: "autumn", num: 3, name: "イエベ秋", en: "Autumn", catch: "深みでまとう、こっくりリッチな暖色", palette: ["#B5734A", "#C89B3C", "#7B8B45", "#A65A3A", "#E8D6B8"], ng: ["ビビッド原色", "青みピンク", "純白"], accent: "#A65E3A", site: "iebel", siteName: "IEBEL", siteUrl: "https://iebel.jp", sns: "@iebe_lab" },
  winter: { key: "winter", num: 4, name: "ブルベ冬", en: "Winter", catch: "コントラストで際立つ、鮮烈な寒色", palette: ["#3B5BA5", "#C2408B", "#1F9E8E", "#111418", "#FFFFFF"], ng: ["くすみカラー", "アイボリー", "オレンジ寄り"], accent: "#3B5BA5", site: "blubel", siteName: "BLUBEL", siteUrl: "https://blubel.jp", sns: "@blube_lab" },
};


// ════════════════════════════════════════════
// 骨格診断（標準3タイプ・セルフチェック8問）
// ════════════════════════════════════════════
const FRAMES = {
  S: { key: "S", name: "ストレート", en: "Straight", accent: "#7b6f83",
    catch: "メリハリのある立体ボディ",
    good: ["Iラインシルエット", "ジャストサイズ", "ハリ・ツヤのある上質素材", "Vネック・スッキリ襟元"],
    ng: ["過度なフリル・ギャザー", "オーバーサイズ", "ふにゃっとした薄手素材"],
    tip: "体に厚みとハリがあるタイプ。シンプル×ジャストサイズで素材の良さを見せると、着痩せしてクラス感が出やすいです。" },
  W: { key: "W", name: "ウェーブ", en: "Wave", accent: "#c48ea8",
    catch: "華奢でやわらかな曲線ボディ",
    good: ["Xライン・ハイウエスト", "ふんわりソフト素材（シフォン等）", "ティアード・フリル", "短め丈トップス"],
    ng: ["ローウエスト", "重く硬い素材", "ビッグシルエットの着られ感"],
    tip: "上半身が華奢で曲線的なタイプ。ウエスト位置を高く見せて、やわらかい素材で曲線を活かすとスタイルアップしやすいです。" },
  N: { key: "N", name: "ナチュラル", en: "Natural", accent: "#8a9a7b",
    catch: "スタイリッシュなフレームボディ",
    good: ["ゆったりリラックスシルエット", "リネン・ざっくり素材", "ロング丈・ドロップショルダー", "大ぶりアクセ"],
    ng: ["ピタピタのタイトシルエット", "華奢すぎる小物", "コンパクトすぎる丈"],
    tip: "骨格のフレーム感が魅力のタイプ。あえてゆるっと着るラフさが様になり、天然素材のこなれ感が得意です。" },
};

const FQ = [
  { q: "体の質感は？", a: "ハリ・弾力がある", b: "ふわっとやわらかい", c: "骨や関節がしっかり" },
  { q: "体の重心・厚みは？", a: "上半身に厚みがある", b: "下半身にボリュームが出やすい", c: "全体的に骨格のフレーム感" },
  { q: "手の印象は？", a: "手のひらに厚みがある", b: "薄くて華奢", c: "関節や筋が目立つ" },
  { q: "鎖骨は？", a: "あまり目立たない", b: "細く目立つ", c: "大きくしっかりしている" },
  { q: "首の印象は？", a: "短めでしっかり", b: "細く長め", c: "筋が目立つ" },
  { q: "ひざの骨は？", a: "小さめで目立たない", b: "小さく、ひざ下が細い", c: "大きめでしっかり" },
  { q: "「似合う」と言われる服は？", a: "シンプル・ジャストサイズ", b: "ふんわり・装飾のある服", c: "ラフ・オーバーサイズ" },
  { q: "体型が変わるときは？", a: "お腹・二の腕から", b: "下半身から", c: "あまり変わらない" },
];

// ════════════════════════════════════════════
// 本番12タイプ診断ロジック（サイト掲載版と同一の質問・画像・配点）
// ════════════════════════════════════════════
// ════ 診断設問イラスト（SVG内蔵・外部画像依存なし） ════
function IllustHalf({ kind, v }) {
  if (kind === "face") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <circle cx="50" cy="42" r="26" fill={v.skin} />
      <path d="M24 96 Q50 62 76 96 Z" fill={v.top || "#EDE9E3"} />
      <circle cx="41" cy="40" r="2.6" fill="#5a5049" /><circle cx="59" cy="40" r="2.6" fill="#5a5049" />
      <path d="M43 52 Q50 56 57 52" stroke="#b98a7a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {v.cheek ? <><circle cx="36" cy="48" r="5" fill={v.cheek} opacity="0.55" /><circle cx="64" cy="48" r="5" fill={v.cheek} opacity="0.55" /></> : null}
    </svg>
  );
  if (kind === "eye") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <path d="M14 50 Q50 18 86 50 Q50 82 14 50 Z" fill="#fff" stroke="#c9beb8" strokeWidth="2" />
      <circle cx="50" cy="50" r="17" fill={v.iris} />
      <circle cx="50" cy="50" r="7" fill="#2a2320" />
      <circle cx="45" cy="44" r="3.5" fill="#fff" opacity="0.85" />
    </svg>
  );
  if (kind === "lips") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <path d="M20 52 Q35 38 50 50 Q65 38 80 52 Q65 72 50 70 Q35 72 20 52 Z" fill={v.lip} />
      <path d="M20 52 Q50 58 80 52" stroke="#00000022" strokeWidth="2" fill="none" />
    </svg>
  );
  if (kind === "wrist") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <rect x="24" y="12" width="52" height="76" rx="22" fill="#F2DFCE" />
      <path d="M40 24 Q42 50 38 84" stroke={v.vein} strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M52 22 Q54 52 50 86" stroke={v.vein} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M62 26 Q62 54 60 82" stroke={v.vein} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
  if (kind === "chips") return (
    <svg viewBox="0 0 100 100" className="w-full">
      {v.colors.map((c, i) => (
        <rect key={i} x={12 + (i % 2) * 42} y={12 + Math.floor(i / 2) * 42} width="34" height="34" rx="9" fill={c} stroke="#00000014" />
      ))}
    </svg>
  );
  if (kind === "swatch") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <rect x="14" y="14" width="72" height="72" rx="14" fill={v.color} stroke="#c9beb8" strokeWidth="1.5" />
    </svg>
  );
  if (kind === "metal") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <circle cx="50" cy="50" r="26" fill="none" stroke={v.metal} strokeWidth="11" />
      <circle cx="50" cy="24" r="6.5" fill={v.metal} />
      <circle cx="43" cy="42" r="8" fill="#ffffff" opacity="0.25" />
    </svg>
  );
  if (kind === "hair") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <path d="M22 92 Q16 34 50 26 Q84 34 78 92 L64 92 Q70 52 50 46 Q30 52 36 92 Z" fill={v.hair} />
      <circle cx="50" cy="52" r="17" fill="#F4E0CE" />
      <circle cx="44" cy="50" r="2" fill="#5a5049" /><circle cx="56" cy="50" r="2" fill="#5a5049" />
      <path d="M46 59 Q50 62 54 59" stroke="#b98a7a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
  if (kind === "lipstick") return (
    <svg viewBox="0 0 100 100" className="w-full">
      <rect x="40" y="52" width="20" height="34" rx="3" fill="#3a3340" />
      <rect x="42" y="44" width="16" height="10" rx="2" fill="#8a8090" />
      <path d="M43 46 L43 22 Q43 16 50 16 Q57 16 57 24 L57 46 Z" fill={v.lip} />
    </svg>
  );
  return null;
}

function QuizIllust({ illust, aLabel, bLabel }) {
  if (!illust) return null;
  return (
    <div className="flex gap-3 mb-5">
      {[["A", illust.left, aLabel], ["B", illust.right, bLabel]].map(([tag, v, label]) => (
        <div key={tag} className="flex-1 rounded-2xl p-3 text-center" style={{ border: "1px solid " + C.line, background: "#fdfcfd" }}>
          <IllustHalf kind={illust.kind} v={v} />
          <div className="text-[10px] mt-1 leading-tight" style={{ color: C.sub }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

const IMG = (n) => `https://d1wfsv2ufomua9.cloudfront.net/carrierwave-test-siruku6/uploads/image/image_url/${n}.jpg`;

const Q12 = [
  { q: "Q1（肌印象）\n鏡を見て、顔の肌の色はどちらに近いですか？", img: IMG("110182/1"), illust: { kind: "face", left: { skin: "#F2D3AE" }, right: { skin: "#F6D9CE" } }, A: [1, 3], B: [2, 4], a: "黄み・オークル寄り", b: "青み・ピンク寄り" },
  { q: "Q2（印象）\n友人から、良く言われる印象はどっちが近いですか？", img: IMG("110183/2"), illust: { kind: "chips", left: { colors: ["#F6D65B", "#F4A582", "#8FCB9B", "#F7C9A0"] }, right: { colors: ["#5A4A3D", "#1E2A44", "#7A1E3C", "#6B6B4A"] } }, A: [1, 2], B: [3, 4], a: "明るい・若々しい", b: "落ち着き・大人っぽい" },
  { q: "Q3（瞳）\n鏡を見て、目の色はどちらに近いですか？", img: IMG("110184/3"), illust: { kind: "eye", left: { iris: "#A9713F" }, right: { iris: "#3E2A20" } }, A: [1, 2], B: [3, 4], a: "明るめのブラウン", b: "深いブラウン・黒" },
  { q: "Q4（唇の色み）\nすっぴんの唇の色はどっちに近いですか？", img: IMG("110185/4"), illust: { kind: "lips", left: { lip: "#E8875C" }, right: { lip: "#D4708E" } }, A: [1, 3], B: [2, 4], a: "オレンジ・コーラル寄り", b: "ピンク・ローズ寄り" },
  { q: "Q5（血管の色み）\n手首の血管の見え方はどっちに近いですか？", img: IMG("110186/5"), illust: { kind: "wrist", left: { vein: "#4E8A5A" }, right: { vein: "#4A5BA8" } }, A: [1, 3], B: [2, 4], a: "緑っぽく見える", b: "青〜青紫に見える" },
  { q: "Q6（日焼け）\n日焼けすると肌色はどうなりやすいですか？", img: IMG("110187/6"), illust: { kind: "face", left: { skin: "#D9A06C" }, right: { skin: "#F2C4B8" } }, A: [1, 3], B: [2, 4], a: "小麦色に焼ける", b: "赤くなって戻る" },
  { q: "Q7（似合う色の傾向）\nどちらの色の方がしっくりきますか？", img: IMG("110188/7"), illust: { kind: "chips", left: { colors: ["#F6D65B", "#8FD3C7", "#F4A0B5", "#9AD08F"] }, right: { colors: ["#5F2A3A", "#1E3A5F", "#4A5230", "#5A3A28"] } }, A: [1, 2], B: [3, 4], a: "明るく澄んだ色", b: "深く落ち着いた色" },
  { q: "Q8（黒を着たとき）\n黒を着たときの印象は？", img: IMG("110189/8"), illust: { kind: "face", left: { skin: "#DCC2B4", top: "#1B1B1B" }, right: { skin: "#F4D8C6", top: "#1B1B1B" } }, A: [1, 2], B: [3, 4], a: "顔が沈む・強すぎる", b: "引き締まって見える" },
  { q: "Q9（白の比較）\n白トップスを選ぶならどっちが似合いますか？", img: IMG("110190/9"), illust: { kind: "swatch", left: { color: "#FFFFFF" }, right: { color: "#F2E8D5" } }, A: [1, 2], B: [3, 4], a: "明るくクリアな白", b: "生成り・落ち着いた白" },
  { q: "Q10（金属）\nアクセサリーはどちらが似合いますか？", img: IMG("110191/10"), illust: { kind: "metal", left: { metal: "#D4AF5A" }, right: { metal: "#B8BEC9" } }, A: [1, 3], B: [2, 4], a: "ゴールド", b: "シルバー" },
  { q: "Q11（頬の赤み）\n運動後や寒いときの頬の色はどっちが近いですか？", img: IMG("110193/11"), illust: { kind: "face", left: { skin: "#F2D3AE", cheek: "#E8722A" }, right: { skin: "#F6D9CE", cheek: "#E86F9A" } }, A: [1, 3], B: [2, 4], a: "オレンジっぽい赤み", b: "ピンクっぽい赤み" },
  { q: "Q12（リップ）\nリップでしっくりくるのはどちらですか？", img: IMG("110194/12"), illust: { kind: "lipstick", left: { lip: "#F0705A" }, right: { lip: "#8E2A44" } }, A: [1, 2], B: [3, 4], a: "明るいクリアカラー", b: "深みのあるカラー" },
  { q: "Q13（ヘアカラー）\nどっちの髪色の方が似合いますか？", img: IMG("110195/13"), illust: { kind: "hair", left: { hair: "#B5824A" }, right: { hair: "#2E2226" } }, A: [1, 2], B: [3, 4], a: "明るめの髪色", b: "暗め・深めの髪色" },
];

const TIE_Q = {
  q: "友人からは、なんていわれることが多いですか？",
  img: IMG("110196/14"),
  opts: { A: 1, B: 2, C: 3, D: 4 },
  labels: { A: "明るい・キュート", B: "上品・やさしい", C: "大人っぽい・シック", D: "クール・華やか" },
};

// 公式結果ページ（本番resultMapと同一）
const RESULT_MAP = {
  "1-2": "https://www.iebel.jp/pages/diagnosis3",
  "1-3": "https://www.iebel.jp/pages/diagnosis4",
  "1-4": "https://www.iebel.jp/pages/diagnosis5",
  "3-1": "https://www.iebel.jp/pages/diagnosis6",
  "3-2": "https://www.iebel.jp/pages/diagnosis7",
  "3-4": "https://www.iebel.jp/pages/diagnosis8",
  "2-1": "https://www.blubel.jp/pages/diagnosis3",
  "2-3": "https://www.blubel.jp/pages/diagnosis4",
  "2-4": "https://www.blubel.jp/pages/diagnosis5",
  "4-1": "https://www.blubel.jp/pages/diagnosis6",
  "4-2": "https://www.blubel.jp/pages/diagnosis7",
  "4-3": "https://www.blubel.jp/pages/diagnosis8",
};

// 1位/2位確定（本番と同一：同点は優先順1→2→3→4）
const sortTypes = (scores) =>
  [1, 2, 3, 4]
    .map((t) => ({ type: t, score: scores[t] }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.type - b.type));

// ════════════════════════════════════════════
// ペア相性
// ════════════════════════════════════════════
const PAIR = {
  "spring-spring": { title: "ビタミンツインズ", colors: ["#F4A582", "#F6D65B", "#8FCB9B"], text: "2人ともクリアな暖色が得意。コーラル×イエローのリンクコーデで、並ぶだけで場がぱっと明るくなります。" },
  "spring-summer": { title: "パステルハーモニー", colors: ["#F7C9A0", "#C9B8D8", "#FFF3E2"], text: "暖と寒、でも2人とも「明るくやわらかい」が共通点。ペールトーンで揃えると、ふんわり調和します。" },
  "spring-autumn": { title: "ウォームグラデーション", colors: ["#F4A582", "#B5734A", "#C89B3C"], text: "同じイエベ同士。春が明るいオレンジ、秋が深いテラコッタを取ると、温度感が繋がる美しいグラデに。" },
  "spring-winter": { title: "ポップコントラスト", colors: ["#F6D65B", "#3B5BA5", "#FFFFFF"], text: "明るい暖色×鮮やかな寒色。あえてビビッドをぶつけ合うと、お互いを引き立てる元気なペアに。" },
  "summer-summer": { title: "透明感シンクロ", colors: ["#C9B8D8", "#A9C4DE", "#E8A9C0"], text: "2人ともソフトな寒色が得意。ラベンダー×水色のワントーン違いで、上品な統一感が生まれます。" },
  "summer-autumn": { title: "スモーキーブリッジ", colors: ["#B7BCC4", "#7B8B45", "#E8D6B8"], text: "くすみ感が共通の架け橋。グレージュ×カーキなどスモーキートーンで揃えると、大人っぽく調和します。" },
  "summer-winter": { title: "クールエレガンス", colors: ["#A9C4DE", "#3B5BA5", "#C2408B"], text: "同じブルベ同士。夏が淡いブルー、冬が濃いネイビーを取ると、涼やかな濃淡ペアが完成します。" },
  "autumn-autumn": { title: "リッチアース", colors: ["#B5734A", "#C89B3C", "#7B8B45"], text: "2人ともこっくり暖色が得意。テラコッタ×マスタードのアースカラーで、カフェが似合う大人ペアに。" },
  "autumn-winter": { title: "ディープムード", colors: ["#A65A3A", "#111418", "#1F9E8E"], text: "深みが共通点。ダークブラウン×ブラックの重厚トーンに差し色を1点。シックで格好いいペアです。" },
  "winter-winter": { title: "モードインパクト", colors: ["#111418", "#FFFFFF", "#C2408B"], text: "2人ともコントラストの達人。モノトーン×ビビッド1点投入で、街で振り返られるモードペアに。" },
};
const pairKey = (a, b) => {
  const order = ["spring", "summer", "autumn", "winter"];
  return order.indexOf(a) <= order.indexOf(b) ? `${a}-${b}` : `${b}-${a}`;
};


// ════════════════════════════════════════════
// 診断結果シェア画像（IGストーリー 1080x1920）
// ════════════════════════════════════════════
function buildShareImage(RT, secondName, axes) {
  const W = 1080, H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");

  // 背景: 淡いグラデーション
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fbf9f7"); bg.addColorStop(1, "#f0eaf0");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // 上部パレット帯
  const bandH = 260;
  RT.palette.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect((W / RT.palette.length) * i, 0, W / RT.palette.length + 1, bandH);
  });

  // 白カード
  const cardX = 80, cardY = 200, cardW = W - 160, cardH = 1460, r = 48;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(cardX + r, cardY);
  ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, r);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, r);
  ctx.arcTo(cardX, cardY + cardH, cardX, cardY, r);
  ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
  ctx.closePath();
  ctx.shadowColor = "rgba(80,70,90,0.25)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.textAlign = "center";
  // 監修
  ctx.fillStyle = "#8a828d";
  ctx.font = "500 34px sans-serif";
  ctx.fillText((RT.site === "iebel" ? "イエベ研究所" : "ブルベ研究所") + " 監修の診断結果", W / 2, cardY + 130);

  // タイプ名
  ctx.fillStyle = "#3a3340";
  ctx.font = "42px serif";
  ctx.fillText("わたしのパーソナルカラーは", W / 2, cardY + 230);
  ctx.fillStyle = RT.accent;
  ctx.font = "700 130px serif";
  ctx.fillText(RT.name, W / 2, cardY + 400);
  ctx.fillStyle = "#8a828d";
  ctx.font = "40px sans-serif";
  ctx.fillText("2nd " + secondName, W / 2, cardY + 480);

  // パレット丸
  const dotR = 52, gap = 30;
  const total = RT.palette.length * dotR * 2 + (RT.palette.length - 1) * gap;
  let dx = W / 2 - total / 2 + dotR;
  RT.palette.forEach((c) => {
    ctx.beginPath(); ctx.arc(dx, cardY + 620, dotR, 0, Math.PI * 2);
    ctx.fillStyle = c; ctx.fill();
    ctx.strokeStyle = "#eeeeee"; ctx.lineWidth = 3; ctx.stroke();
    dx += dotR * 2 + gap;
  });

  // 3軸バー
  const rows = [
    ["色相", axes.hue], ["明度", axes.value], ["彩度", axes.chroma],
  ];
  let by = cardY + 800;
  const barX = cardX + 110, barW = cardW - 220;
  rows.forEach(([label, ax]) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#7d7580"; ctx.font = "36px sans-serif";
    ctx.fillText(label, barX, by);
    ctx.textAlign = "right";
    ctx.fillStyle = RT.accent; ctx.font = "600 38px sans-serif";
    ctx.fillText(ax.label + " " + ax.pct + "%", barX + barW, by);
    // バー
    ctx.fillStyle = "#efe9ee";
    ctx.beginPath(); ctx.roundRect(barX, by + 24, barW, 22, 11); ctx.fill();
    ctx.fillStyle = RT.accent;
    ctx.beginPath(); ctx.roundRect(barX, by + 24, barW * ax.pct / 100, 22, 11); ctx.fill();
    by += 140;
  });

  // ⑥ 似合うコーデ3点＋コスメ1点（シェア画像を商品カタログ化）
  const catalogSkus = SKUS[RT.site].slice(0, 3);
  const catalogCosme = (COSME[RT.key] || [])[0];
  let cy = by + 30;
  ctx.textAlign = "left";
  ctx.fillStyle = RT.accent; ctx.font = "600 40px sans-serif";
  ctx.fillText("似合うアイテム", barX, cy);
  cy += 64;
  const truncate = (t, n) => (t.length > n ? t.slice(0, n) + "…" : t);
  catalogSkus.forEach((sku) => {
    ctx.fillStyle = "#3a3340"; ctx.font = "500 36px sans-serif";
    ctx.fillText("・" + truncate(sku.name.replace(/【[^】]*】/g, ""), 17), barX, cy);
    ctx.fillStyle = "#a99fa8"; ctx.font = "34px sans-serif";
    ctx.fillText("¥" + sku.price.toLocaleString(), barX + 680, cy);
    cy += 58;
  });
  if (catalogCosme) {
    ctx.fillStyle = "#3a3340"; ctx.font = "500 36px sans-serif";
    ctx.fillText("・" + truncate(catalogCosme.name, 17) + "（コスメ）", barX, cy);
    cy += 58;
  }

  // フッター
  ctx.textAlign = "center";
  ctx.fillStyle = "#3a3340"; ctx.font = "600 42px sans-serif";
  ctx.fillText("あなたも診断してみて ♡", W / 2, cardY + 1300);
  ctx.fillStyle = "#a99fa8"; ctx.font = "36px sans-serif";
  ctx.fillText(RT.sns + "  |  " + RT.siteName, W / 2, cardY + 1370);

  ctx.fillStyle = "#b3aab2"; ctx.font = "32px sans-serif";
  ctx.fillText("#パーソナルカラー診断 #" + RT.name, W / 2, H - 120);
  return cv;
}

async function shareResultImage(RT, secondName, axes) {
  const cv = buildShareImage(RT, secondName, axes);
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  const file = new File([blob], "my_personal_color.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "パーソナルカラー診断結果" }); return; } catch (e) {}
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "my_personal_color.png"; a.click();
  URL.revokeObjectURL(a.href);
}

// ════════════════════════════════════════════
// Claude API
// ════════════════════════════════════════════
async function callClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages }),
  });
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

async function aiStylist(type, secondKey, tpo, mood, sub, worries, hair, frame, meet) {
  const matched = SKUS[type.site].filter((s) => s.tpo.includes(tpo));
  const pool = matched.length >= 4 ? matched : SKUS[type.site];
  const skuList = pool.map((s) => `${s.id}: ${s.name}（${s.cat}・¥${s.price}）`).join("\n");
  const tpoJa = { work: "通勤", date: "デート", casual: "休日" }[tpo];
  const scene = tpo === "date" && sub ? `デート（${sub}）` : tpoJa;
  const worryText = worries && worries.length ? worries.join("・") : "特になし";
  const second = secondKey ? `（2nd: ${TYPES[secondKey].name}の要素も少し持っています）` : "";
  const prompt = `あなたはパーソナルカラーの専門スタイリストです。
お客様: ${type.name}タイプ${second} / シーン: ${scene} / いまの髪色: ${hair || "未指定"} / 骨格タイプ: ${frame || "未指定"} / 今日会う相手: ${meet || "未指定"} / 叶えたいこと: ${worryText} / 今日の気分: 「${mood || "特になし"}」

自社の商品リスト（実在庫）:
${skuList}

このお客様の今日のコーデを「セット」で提案してください。組み合わせパターンは次のいずれか:
A) ワンピース ＋ 小物（アクセサリーやバッグ）
B) トップス ＋ ボトムス（リストに無ければ色・形を文章で指定）＋ 小物
C) セットアップ ＋ 小物
シューズなどリストに無いアイテムは、stylingの文章内で色まで具体的に指定して補完すること。
以下のJSONのみを出力（Markdownの\`\`\`や前置きは一切禁止）:
{"title":"コーデ名（15字以内・キャッチー）","sku_ids":[セットを構成する商品ID 2〜3個の数値。必ず異なるカテゴリから選ぶ],"styling":"選んだセット全体（足元・リストに無い補完アイテム含む）の着こなし提案。叶えたいこと（${worryText}）にどう応えるかを必ず盛り込み、髪色の指定があれば髪色と服の色の調和にも触れ、骨格タイプの指定があれば得意なシルエット・素材の観点も添え、会う相手の指定があれば相手に与えたい印象（きちんと感/親しみ/清潔感など）への配慮を一言含め、色使い（${type.name}の得意色、2ndがあれば軽く活かす）・合わせる小物・避けたい色も1つ添える。180字程度。やさしい語り口、絵文字は文末に1つ","makeup_hint":"このコーデに合うメイクの一言（40字以内）"}`;
  const text = await callClaude([{ role: "user", content: prompt }]);
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function aiScoreOutfit(base64, mediaType, type) {
  const prompt = `あなたはパーソナルカラーの専門スタイリストです。この写真はお客様（パーソナルカラー: ${type.name}）の今日のコーデです。
${type.name}の得意トーン（例: ${type.palette.join(", ")}）・苦手要素（${type.ng.join("・")}）を踏まえ、服の色使いとタイプの調和を採点してください。
注意: 人物の特定・容姿の評価はせず、服の色・組み合わせの分析のみ。照明で色は正確に見えない前提で「傾向」として。ポジティブな言葉を基本に、改善点は前向きな提案として。
以下のJSONのみ出力（前置き・\u0060\u0060\u0060禁止）:
{"score":100点満点の整数,"good":"良い点を60字程度。具体的な色に触れて","improve":"さらに良くする提案を70字程度。${type.name}の得意色への置き換えなど具体的に","one_item":"買い足すなら、の一言（30字以内。トップス/小物/ワンピなどカテゴリを1つ挙げる）"}`;
  const text = await callClaude([
    { role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: prompt }] },
  ]);
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function aiPhotoDiagnose(base64, mediaType) {
  const prompt = `この写真の肌・髪・瞳の色調傾向から、パーソナルカラー4タイプ（spring=イエベ春/autumn=イエベ秋/summer=ブルベ夏/winter=ブルベ冬)のうち、最も近い1stタイプと、次に近い2ndタイプを推定してください。
あわせて3軸の傾向を55〜90の整数%で推定: hue_pct=色相の傾き（1stが暖色系ならWarm寄り、寒色系ならCool寄りの強さ）、value_pct=明度の傾き、chroma_pct=彩度（清濁）の傾き。
注意: 人物の特定はせず、色調の分析のみ行うこと。照明の影響で確実な判定はできない前提で「傾向」として答えること。
以下のJSONのみ出力（前置き・\`\`\`禁止）:
{"type":"spring|autumn|summer|winter","second":"spring|autumn|summer|winter（typeとは別のもの）","confidence":"high|medium|low","hue_pct":数値,"value_pct":数値,"chroma_pct":数値,"reason":"判定理由を80字程度。肌の黄み/青み、明度など具体的に。やさしい語り口"}`;
  const text = await callClaude([
    { role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: prompt }] },
  ]);
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ════════════════════════════════════════════
// UI 部品
// ════════════════════════════════════════════
const C = { ink: "#3a3340", sub: "#7d7580", faint: "#a99fa8", line: "#e7dfe6", main: "#7b6f83" };
const LAB = (site) => (site === "iebel" ? "イエベ研究所" : "ブルベ研究所");

function CosmeCard({ item }) {
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ border: "1px solid " + C.line }}>
      <div>
        <span className="text-[10px] px-1.5 py-0.5 rounded mr-1.5 align-middle" style={{ background: "#f2eef1", color: C.sub }}>PR</span>
        <span className="text-[10px] align-middle" style={{ color: C.faint }}>{item.cat}</span>
        <div className="text-sm font-medium mt-1" style={{ color: C.ink }}>{item.name}</div>
        <div className="text-xs mt-0.5" style={{ color: C.sub }}>{item.note}・¥{item.price.toLocaleString()}</div>
      </div>
      <div className="flex gap-2 mt-3">
        <a href={item.rakuten} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs text-white py-2 rounded-full" style={{ background: "#bf0000" }}>楽天で見る</a>
        <a href={item.amazon} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs text-white py-2 rounded-full" style={{ background: "#ff9900" }}>Amazonで見る</a>
      </div>
    </div>
  );
}

function SkuCard({ sku, site, accent }) {
  return (
    <a href={ITEM_URL(site, sku.id)} target="_blank" rel="noreferrer" className="block rounded-2xl p-4 mb-3 transition-shadow hover:shadow-md" style={{ border: "1px solid " + C.line }}>
      <div className="text-[10px]" style={{ color: C.faint }}>{sku.cat}</div>
      <div className="text-sm font-medium mt-0.5" style={{ color: C.ink }}>{sku.name}</div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-sm" style={{ color: accent }}>¥{sku.price.toLocaleString()}</span>
        <span className="text-xs inline-flex items-center gap-1" style={{ color: C.sub }}>商品を見る <ArrowRight size={12} /></span>
      </div>
    </a>
  );
}

function TypePicker({ value, onChange, label }) {
  return (
    <div className="mb-4">
      {label && <div className="text-xs mb-2" style={{ color: C.faint }}>{label}</div>}
      <div className="grid grid-cols-2 gap-2">
        {Object.values(TYPES).map((t) => (
          <button key={t.key} onClick={() => onChange(t.key)} className="rounded-2xl px-3 py-3 text-sm text-left transition-all" style={{ border: value === t.key ? `2px solid ${t.accent}` : "1px solid " + C.line, color: C.ink, background: value === t.key ? t.accent + "10" : "white" }}>
            <div className="flex gap-1 mb-1.5">{t.palette.slice(0, 4).map((c, i) => <span key={i} className="w-3.5 h-3.5 rounded-full" style={{ background: c, border: "1px solid #eee" }} />)}</div>
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Header({ title, onBack }) {
  return (
    <div className="flex items-center gap-3 px-6 pt-6 pb-2">
      <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-50" style={{ color: C.sub }}><ArrowLeft size={18} /></button>
      <span className="text-sm font-medium" style={{ color: C.ink }}>{title}</span>
    </div>
  );
}

// フェーズ1: AI機能の「近日公開」バッジ
function SoonBadge({ corner }) {
  const base = { background: "#efe7f0", color: "#8a6fa0" };
  if (corner) return <span className="absolute top-1.5 right-2 text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={base}>近日公開</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={base}>近日公開</span>;
}

// ════════════════════════════════════════════
// メイン
// ════════════════════════════════════════════
export default function App() {
  const [mode, setMode] = useState("home");
  const [myType, setMyType] = useState(null); // 1stタイプ key
  const [mySecond, setMySecond] = useState(null); // 2ndタイプ key
  const [myFrame, setMyFrame] = useState(null); // 骨格 S/W/N
  const [fqi, setFqi] = useState(0);
  const [fScores, setFScores] = useState({ S: 0, W: 0, N: 0 });
  const [frameDone, setFrameDone] = useState(false);

  // 12タイプ診断
  const [qi, setQi] = useState(0);
  const [scores, setScores] = useState({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [tieMode, setTieMode] = useState(false);
  const [quizResult, setQuizResult] = useState(null); // {first, second, url}

  // stylist
  const [stTpo, setStTpo] = useState("work");
  const [stSub, setStSub] = useState(null);
  const [stWorries, setStWorries] = useState([]);
  const [stHair, setStHair] = useState(null);
  const [stMeet, setStMeet] = useState(null);
  const [cosmeCat, setCosmeCat] = useState("すべて");
  const [stMood, setStMood] = useState("");
  const [stResult, setStResult] = useState(null);
  const [stLoading, setStLoading] = useState(false);
  const [stError, setStError] = useState("");

  // pair
  const [pA, setPA] = useState(null);
  const [pB, setPB] = useState(null);
  const [copied, setCopied] = useState(false);

  // photo
  const fileRef = useRef(null);
  const [phPreview, setPhPreview] = useState(null);
  const [phLoading, setPhLoading] = useState(false);
  const [phResult, setPhResult] = useState(null);
  const [phError, setPhError] = useState("");

  // ② カラーチェッカー
  const [checkColor, setCheckColor] = useState(null);
  // ③ 試し塗り
  const [toPreview, setToPreview] = useState(null);
  const [toColor, setToColor] = useState(null);
  const [toKind, setToKind] = useState("lip");
  const toFileRef = useRef(null);
  const toCanvasRef = useRef(null);
  const toDrawing = useRef(false);
  // ⑩ コーデ採点
  const [scPreview, setScPreview] = useState(null);
  const [scResult, setScResult] = useState(null);
  const [scLoading, setScLoading] = useState(false);
  const [scError, setScError] = useState("");
  const scFileRef = useRef(null);
  const scB64 = useRef(null);
  // ⑤ ワードローブ・ウィザード
  const [wdStep, setWdStep] = useState(1);
  const [wdScene, setWdScene] = useState(null);
  const [wdOwned, setWdOwned] = useState([]);
  const [wdWorry, setWdWorry] = useState(null);

  const goHome = () => setMode("home");

  // フェーズ1: AI3機能タップ時の「近日公開」モーダル
  const [aiSoon, setAiSoon] = useState(false);
  // AI_ENABLED=false の間は診断誘導モーダルを開く。true なら本来のハンドラを実行。
  const aiGate = (realOnClick) => () => { if (AI_ENABLED) { realOnClick(); } else { setAiSoon(true); } };

  // ④ 診断結果の保存＆再訪（window.storage / 端末ごと）
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get("colorlab-profile");
        if (r && r.value) {
          const p = JSON.parse(r.value);
          if (p.myType && TYPES[p.myType]) setMyType(p.myType);
          if (p.mySecond && TYPES[p.mySecond]) setMySecond(p.mySecond);
          if (p.myFrame) setMyFrame(p.myFrame);
        }
      } catch (e) { /* 初回はキーなし */ }
      setProfileLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!profileLoaded) return;
    (async () => {
      try {
        await storage.set("colorlab-profile", JSON.stringify({ myType, mySecond, myFrame }));
      } catch (e) { /* 保存失敗は無視 */ }
    })();
  }, [myType, mySecond, myFrame, profileLoaded]);
  const resetProfile = async () => {
    setMyType(null); setMySecond(null); setMyFrame(null);
    try { await storage.delete("colorlab-profile"); } catch (e) {}
  };
  const startFrame = () => { setFScores({ S: 0, W: 0, N: 0 }); setFqi(0); setFrameDone(false); setMode("frame"); };
  const answerFQ = (k) => {
    const next = { ...fScores, [k]: fScores[k] + 1 };
    setFScores(next);
    if (fqi + 1 < FQ.length) { setFqi(fqi + 1); return; }
    const win = ["S", "W", "N"].sort((a, b) => next[b] - next[a])[0];
    setMyFrame(win); setFrameDone(true);
  };
  const T = myType ? TYPES[myType] : null;

  const startQuiz = () => { setScores({ 1: 0, 2: 0, 3: 0, 4: 0 }); setQi(0); setTieMode(false); setQuizResult(null); setMode("quiz"); };

  const finishQuiz = (finalScores) => {
    const sorted = sortTypes(finalScores);
    const first = sorted[0].type, second = sorted[1].type;
    const fKey = NUM2KEY[first], sKey = NUM2KEY[second];
    setMyType(fKey); setMySecond(sKey);
    // 3軸%を回答スコアから算出（色相=温冷 / 明度=明深 / 彩度=清濁）
    const s = finalScores;
    const total = s[1] + s[2] + s[3] + s[4];
    const pct = (a, b) => Math.round((Math.max(a, b) / total) * 100);
    const axes = {
      hue: { pct: pct(s[2] + s[4], s[1] + s[3]), label: s[2] + s[4] >= s[1] + s[3] ? "Cool（青み）" : "Warm（黄み）" },
      value: { pct: pct(s[1] + s[2], s[3] + s[4]), label: s[1] + s[2] >= s[3] + s[4] ? "Light（明るい）" : "Deep（深い）" },
      chroma: { pct: pct(s[1] + s[4], s[2] + s[3]), label: s[1] + s[4] >= s[2] + s[3] ? "Clear（クリア）" : "Soft（ソフト）" },
    };
    setQuizResult({ first: fKey, second: sKey, url: RESULT_MAP[`${first}-${second}`] || TYPES[fKey].siteUrl, axes });
  };

  const answerQ = (choice) => {
    if (tieMode) {
      const t = TIE_Q.opts[choice];
      const next = { ...scores, [t]: scores[t] + 1 };
      setScores(next); finishQuiz(next); return;
    }
    const gains = Q12[qi][choice];
    const next = { ...scores };
    gains.forEach((t) => { next[t] += 1; });
    setScores(next);
    if (qi + 1 < Q12.length) { setQi(qi + 1); return; }
    // 全問終了：1位同点判定（本番同一）
    const sorted = sortTypes(next);
    const topTied = sorted.filter((x) => x.score === sorted[0].score);
    if (topTied.length === 1) finishQuiz(next);
    else setTieMode(true);
  };

  const runStylist = async () => {
    if (!myType) return;
    setStLoading(true); setStError(""); setStResult(null);
    try { setStResult(await aiStylist(TYPES[myType], mySecond, stTpo, stMood, stSub, stWorries, stHair, myFrame ? `骨格${FRAMES[myFrame].name}` : null, stMeet)); }
    catch (e) { setStError("提案の生成に失敗しました。もう一度お試しください。"); }
    setStLoading(false);
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhResult(null); setPhError("");
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setPhPreview(dataUrl);
      setPhLoading(true);
      try {
        const r = await aiPhotoDiagnose(dataUrl.split(",")[1], file.type || "image/jpeg");
        if (r.type && TYPES[r.type]) {
          const fT = TYPES[r.type];
          const fallback2nd = { spring: "autumn", autumn: "spring", summer: "winter", winter: "summer" };
          const sKey = r.second && TYPES[r.second] && r.second !== r.type ? r.second : fallback2nd[r.type];
          const sT = TYPES[sKey];
          setMyType(r.type); setMySecond(sKey);
          const clamp = (v) => Math.min(90, Math.max(55, parseInt(v) || 65));
          const axes = {
            hue: { pct: clamp(r.hue_pct), label: r.type === "summer" || r.type === "winter" ? "Cool（青み）" : "Warm（黄み）" },
            value: { pct: clamp(r.value_pct), label: r.type === "spring" || r.type === "summer" ? "Light（明るい）" : "Deep（深い）" },
            chroma: { pct: clamp(r.chroma_pct), label: r.type === "spring" || r.type === "winter" ? "Clear（クリア）" : "Soft（ソフト）" },
          };
          const conf = r.confidence === "high" ? "高" : r.confidence === "medium" ? "中" : "低";
          setQuizResult({
            first: r.type, second: sKey,
            url: RESULT_MAP[`${fT.num}-${sT.num}`] || fT.siteUrl,
            axes,
            note: `※お写真の色調からの推定です（信頼度：${conf}）。${r.reason || ""}`,
          });
          setMode("quiz");
        } else { setPhError("解析に失敗しました。明るい場所で撮った写真でもう一度お試しください。"); }
      } catch (err) { setPhError("解析に失敗しました。明るい場所で撮った写真でもう一度お試しください。"); }
      setPhLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const pairData = pA && pB ? PAIR[pairKey(pA, pB)] : null;
  const shareText = pairData ? `私たちの相性配色は【${pairData.title}】🎨\n${TYPES[pA].name} × ${TYPES[pB].name}\nあなたたちも診断してみて → @blube_lab @iebe_lab` : "";
  const copyShare = async () => { try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) {} };

  const tpoJa = { work: "通勤", date: "デート", casual: "休日" };
  const RT = quizResult ? TYPES[quizResult.first] : null;

  return (
    <div className="min-h-screen w-full flex items-start justify-center p-4 font-sans" style={{ background: "linear-gradient(160deg,#fbf9f7 0%,#f3eef2 50%,#eef2f4 100%)" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp .5s ease both; }
        @keyframes barGrow { from { width: 0; } }
        .bar-grow { animation: barGrow 1s ease both; }
      `}</style>
      {/* フェーズ1: AI機能「近日公開」モーダル → 12タイプ診断へ誘導 */}
      {aiSoon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(40,34,46,0.45)" }} onClick={() => setAiSoon(false)}>
          <div className="w-full max-w-xs bg-white rounded-3xl p-6 text-center fade-up" onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 20px 60px -20px rgba(80,70,90,0.4)" }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-white" style={{ background: C.main }}><Sparkles size={22} /></div>
            <div className="text-sm font-medium mb-1.5" style={{ color: C.ink }}>AI機能は近日公開！</div>
            <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>まずは12タイプ診断から。<br />あなたのパーソナルカラーがわかると、公開後のAI提案がもっと当たります。</p>
            <button onClick={() => { setAiSoon(false); startQuiz(); }} className="w-full py-3 rounded-full text-white text-sm font-medium mb-2" style={{ background: C.main }}>12タイプ診断をはじめる</button>
            <button onClick={() => setAiSoon(false)} className="w-full py-2 text-xs" style={{ color: C.faint }}>閉じる</button>
          </div>
        </div>
      )}

      <div className="w-full max-w-xl bg-white rounded-3xl overflow-hidden my-4" style={{ boxShadow: "0 20px 60px -20px rgba(80,70,90,0.25)" }}>

        {/* ═══ HOME ═══ */}
        {mode === "home" && (
          <div className="fade-up">
            <div>
              <div className="flex h-20">
                {["#F7C9A0", "#F4A582", "#F6D65B", "#C89B3C", "#B5734A", "#A65A3A"].map((c, i) => (
                  <div key={i} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <div className="flex h-20">
                {["#C9B8D8", "#E8A9C0", "#A9C4DE", "#3B5BA5", "#C2408B", "#111418"].map((c, i) => (
                  <div key={i} className="flex-1" style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="px-8 pb-10">
              <div className="text-center mb-9 -mt-14">
                <div className="mx-auto max-w-sm bg-white rounded-3xl px-6 py-7" style={{ boxShadow: "0 16px 40px -16px rgba(80,70,90,0.3)" }}>
                  <div className="text-xs font-medium mb-3 tracking-wide" style={{ color: C.sub }}>ブルベ研究所・イエベ研究所 監修</div>
                  <h1 className="font-serif text-3xl leading-tight mb-2" style={{ color: C.ink }}>パーソナルカラー<br />スタイリング</h1>
                  <p className="text-sm" style={{ color: C.sub }}>12タイプ診断から「今日なに着る？」まで。</p>
                </div>
                {T && (
                  <div className="mx-auto max-w-sm mt-4 rounded-2xl px-5 py-4 text-left" style={{ background: T.accent + "0d", border: `1px solid ${T.accent}33` }}>
                    <div className="text-sm font-medium" style={{ color: T.accent }}>おかえりなさい、{T.name}さん 🎨</div>
                    <div className="text-xs mt-1" style={{ color: C.sub }}>
                      {mySecond ? `2nd ${TYPES[mySecond].name}` : ""}{mySecond && myFrame ? " × " : ""}{myFrame ? `骨格${FRAMES[myFrame].name}` : ""}{(mySecond || myFrame) ? " で覚えています。" : "前回の診断結果で始められます。"}
                      <button onClick={resetProfile} className="underline ml-1" style={{ color: C.faint }}>リセット</button>
                    </div>
                    {(() => {
                      const day = Math.floor(Date.now() / 86400000);
                      const pal = TYPES[myType].palette;
                      const lucky = pal[day % pal.length];
                      const luckySku = SKUS[TYPES[myType].site][day % SKUS[TYPES[myType].site].length];
                      return (
                        <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: `1px dashed ${T.accent}33` }}>
                          <span className="w-8 h-8 rounded-full shrink-0" style={{ background: lucky, border: "1px solid #e5dfe4" }} />
                          <div className="min-w-0">
                            <div className="text-xs font-medium" style={{ color: C.ink }}>今日のラッキーカラー</div>
                            <a href={ITEM_URL(TYPES[myType].site, luckySku.id)} target="_blank" rel="noreferrer" className="text-[11px] underline block truncate" style={{ color: T.accent }}>今日の1点：{luckySku.name.length > 24 ? luckySku.name.slice(0, 24) + "…" : luckySku.name}</a>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            {/* ── 主要2機能：大ボタン ── */}
            <div className="space-y-3">
              <button onClick={startQuiz} className="w-full flex items-center gap-4 rounded-2xl p-5 text-left transition-shadow hover:shadow-md" style={{ border: `2px solid ${C.main}`, background: "#fdfbfd" }}>
                <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: C.main }}><Palette size={20} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium" style={{ color: C.ink }}>パーソナルカラー診断（12タイプ）</span><span className="block text-xs mt-0.5" style={{ color: C.sub }}>13の質問から、1st×2ndタイプまで判定</span></span>
                <ArrowRight size={16} style={{ color: C.main }} />
              </button>
              <button onClick={aiGate(() => { setStResult(null); setMode("stylist"); })} className="w-full flex items-center gap-4 rounded-2xl p-5 text-left transition-shadow hover:shadow-md" style={{ border: `2px solid ${C.main}`, background: "#fdfbfd" }}>
                <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: C.main }}><Shirt size={20} /></span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="text-sm font-medium" style={{ color: C.ink }}>パーソナルカラー別コーデ提案</span>{!AI_ENABLED && <SoonBadge />}</span><span className="block text-xs mt-0.5" style={{ color: C.sub }}>シーン×気分から、服とメイクを提案</span></span>
                <ArrowRight size={16} style={{ color: C.main }} />
              </button>
            </div>

            {/* ── 診断する ── */}
            <div className="flex items-center gap-3 mt-7 mb-3">
              <span className="text-xs tracking-widest shrink-0" style={{ color: C.faint }}>診断する</span>
              <span className="h-px flex-1" style={{ background: C.line }} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: <Camera size={17} />, label: "顔写真で診断", soon: true, onClick: aiGate(() => { setPhResult(null); setPhPreview(null); setMode("photo"); }) },
                { icon: <Sparkles size={17} />, label: "骨格診断", onClick: startFrame },
              ].map((it, i) => (
                <button key={i} onClick={it.onClick} className="relative flex items-center gap-2.5 rounded-2xl px-3.5 py-4 text-left transition-shadow hover:shadow-md" style={{ border: "1px solid " + C.line }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#f4eff3", color: C.main }}>{it.icon}</span>
                  <span className="text-xs font-medium leading-tight" style={{ color: C.ink }}>{it.label}</span>
                  {it.soon && !AI_ENABLED && <SoonBadge corner />}
                </button>
              ))}
            </div>

            {/* ── 似合うを知る ── */}
            <div className="flex items-center gap-3 mt-6 mb-3">
              <span className="text-xs tracking-widest shrink-0" style={{ color: C.faint }}>似合うを知る</span>
              <span className="h-px flex-1" style={{ background: C.line }} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: <Ban size={17} />, label: "NGカラー診断", onClick: () => setMode("ngcolor") },
                { icon: <Droplet size={17} />, label: "手持ち服チェッカー", onClick: () => { setCheckColor(null); setMode("checker"); } },
                { icon: <Paintbrush size={17} />, label: "リップ・髪色 試し塗り", onClick: () => { setToPreview(null); setToColor(null); setToKind("lip"); setMode("tryon"); } },
                { icon: <Check size={17} />, label: "今日のコーデ採点", soon: true, onClick: aiGate(() => { setScPreview(null); setScResult(null); setScError(""); setMode("score"); }) },
              ].map((it, i) => (
                <button key={i} onClick={it.onClick} className="relative flex items-center gap-2.5 rounded-2xl px-3.5 py-4 text-left transition-shadow hover:shadow-md" style={{ border: "1px solid " + C.line }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#f4eff3", color: C.main }}>{it.icon}</span>
                  <span className="text-xs font-medium leading-tight" style={{ color: C.ink }}>{it.label}</span>
                  {it.soon && !AI_ENABLED && <SoonBadge corner />}
                </button>
              ))}
            </div>

            {/* ── 買い足す・楽しむ ── */}
            <div className="flex items-center gap-3 mt-6 mb-3">
              <span className="text-xs tracking-widest shrink-0" style={{ color: C.faint }}>買い足す・楽しむ</span>
              <span className="h-px flex-1" style={{ background: C.line }} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: <Brush size={17} />, label: "おすすめコスメ", onClick: () => setMode("cosme") },
                { icon: <Scissors size={17} />, label: "おすすめ髪色", onClick: () => setMode("hair") },
                { icon: <ShoppingBag size={17} />, label: "買い足しワードローブ", onClick: () => { setWdStep(1); setWdScene(null); setWdOwned([]); setWdWorry(null); setMode("wardrobe"); } },
                { icon: <Heart size={17} />, label: "ふたりの相性配色", onClick: () => { setPA(null); setPB(null); setMode("pair"); } },
              ].map((it, i) => (
                <button key={i} onClick={it.onClick} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-4 text-left transition-shadow hover:shadow-md" style={{ border: "1px solid " + C.line }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#f4eff3", color: C.main }}>{it.icon}</span>
                  <span className="text-xs font-medium leading-tight" style={{ color: C.ink }}>{it.label}</span>
                </button>
              ))}
            </div>
              <p className="mt-8 text-center text-xs" style={{ color: "#b3aab2" }}>BLUBEL / IEBEL presents・登録不要</p>
            </div>
          </div>
        )}

        {/* ═══ QUIZ（本番12タイプロジック） ═══ */}
        {mode === "quiz" && !quizResult && (
          <div>
            <Header title="12タイプ カラー診断" onBack={goHome} />
            <div className="px-8 pb-12 pt-4">
              {!tieMode ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs tracking-widest" style={{ color: C.faint }}>質問 {qi + 1} / {Q12.length}</span>
                  </div>
                  <div className="h-1 w-full rounded-full mb-6" style={{ background: "#efe9ee" }}>
                    <div className="h-1 rounded-full transition-all duration-300" style={{ width: `${(qi / Q12.length) * 100}%`, background: C.main }} />
                  </div>
                  <h2 className="text-base font-medium leading-relaxed mb-4 whitespace-pre-line" style={{ color: C.ink }}>{Q12[qi].q}</h2>
                  <QuizIllust illust={Q12[qi].illust} aLabel={Q12[qi].a} bLabel={Q12[qi].b} />
                  <div className="flex gap-3">
                    {["A", "B"].map((k) => (
                      <button key={k} onClick={() => answerQ(k)} className="flex-1 py-4 px-3 rounded-2xl transition-all hover:shadow-md" style={{ border: "1px solid " + C.line, color: C.ink }}>
                        <span className="block text-2xl font-bold mb-1">{k}</span>
                        <span className="block text-xs" style={{ color: C.sub }}>{k === "A" ? Q12[qi].a : Q12[qi].b}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs tracking-widest mb-4" style={{ color: C.faint }}>最終質問</div>
                  <h2 className="text-base font-medium leading-relaxed mb-4" style={{ color: C.ink }}>{TIE_Q.q}</h2>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {["A", "B", "C", "D"].map((k) => (
                      <button key={k} onClick={() => answerQ(k)} className="py-4 px-3 rounded-2xl transition-all hover:shadow-md" style={{ border: "1px solid " + C.line, color: C.ink }}>
                        <span className="block text-2xl font-bold mb-1">{k}</span>
                        <span className="block text-xs" style={{ color: C.sub }}>{TIE_Q.labels[k]}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {mode === "quiz" && quizResult && RT && (
          <div className="fade-up">
            <div className="flex h-32 relative">
              {RT.palette.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
              <div className="absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(to top, rgba(255,255,255,0.9), transparent)" }} />
            </div>
            <div className="px-8 py-9">
              {/* 公式フォーマット：監修ヘッダー＋タイプ宣言 */}
              <div className="text-xs font-medium mb-3" style={{ color: C.sub }}>
                {RT.site === "iebel" ? "イエベ研究所" : "ブルベ研究所"}監修の診断結果
              </div>
              <h2 className="font-serif text-2xl leading-snug mb-1" style={{ color: C.ink }}>
                あなたは<span className="text-3xl mx-0.5" style={{ color: RT.accent }}>【{RT.name}】</span>タイプです！
              </h2>
              <div className="inline-flex items-center gap-1.5 text-sm mt-2 mb-6 px-3 py-1 rounded-full" style={{ background: TYPES[quizResult.second].accent + "14", color: TYPES[quizResult.second].accent }}>
                2nd：{TYPES[quizResult.second].name}
              </div>
              {quizResult.note && <p className="text-xs leading-relaxed mb-4" style={{ color: C.faint }}>{quizResult.note}</p>}

              {/* 3軸バー（回答から算出したあなただけの数値） */}
              <div className="rounded-2xl p-5 mb-4" style={{ background: "#faf7f9", border: "1px solid #f0e9ef" }}>
                <div className="text-xs font-medium mb-4" style={{ color: C.ink }}>あなたの色相 / 明度 / 彩度</div>
                {[
                  { no: "①", name: "色相", ax: quizResult.axes.hue },
                  { no: "②", name: "明度", ax: quizResult.axes.value },
                  { no: "③", name: "彩度", ax: quizResult.axes.chroma },
                ].map((row, i) => (
                  <div key={i} className={i < 2 ? "mb-4" : ""}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-xs" style={{ color: C.sub }}>{row.no} {row.name}</span>
                      <span className="text-sm font-medium" style={{ color: RT.accent }}>{row.ax.label} {row.ax.pct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full" style={{ background: "#efe9ee" }}>
                      <div className="h-2 rounded-full bar-grow" style={{ width: `${row.ax.pct}%`, background: RT.accent, animationDelay: `${i * 0.15}s` }} />
                    </div>
                  </div>
                ))}
                <p className="text-[10px] leading-relaxed mt-4" style={{ color: C.faint }}>
                  ※本診断は「色相（黄み/青み）」「明度」「彩度」の3軸分析に基づきパーソナルカラーを算出しています。<br />
                  ・色相：肌に調和する色の温度（黄み / 青み）　・明度：似合う色の明るさ（明るい / 深い）　・彩度：似合う色の鮮やかさ（クリア / ソフト）
                </p>
              </div>

              <p className="text-sm mb-6" style={{ color: "#8a828d" }}>{RT.catch}。2ndの{TYPES[quizResult.second].name}らしさも少し持っているタイプです。</p>
              <div className="grid grid-cols-2 gap-4 mb-7">
                <div><div className="text-xs mb-2" style={{ color: C.faint }}>似合う色</div><div className="flex gap-1.5">{RT.palette.map((c, i) => <div key={i} className="w-7 h-7 rounded-full" style={{ background: c, border: "1px solid #eee" }} />)}</div></div>
                <div><div className="text-xs mb-2" style={{ color: C.faint }}>苦手な色</div><div className="flex flex-wrap gap-1">{RT.ng.map((n, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f2eef1", color: "#8a828d" }}>{n}</span>)}</div></div>
              </div>
              {/* 公式フォーマット：似合う服セクション */}
              <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>
                {RT.name}のあなたに似合う服はコレ！
              </h3>
              <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>
                色相（Hue）・明度（Value）・彩度（Chroma）の3軸分析の結果から、{RT.name}のあなたの特性と調和するカラーのファッションアイテムをご紹介します。顔の透明感アップ、顔の引き締め効果、細見えのスリムアップ等の効果が期待できるカラーアイテムばかりなので、是非チェックしてみてください。
              </p>
              {SKUS[RT.site].slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={RT.site} accent={RT.accent} />)}

              {/* ⑧ 2ndタイプ活用：1stで無難、2ndで冒険 */}
              <div className="rounded-2xl p-5 mt-5 mb-6" style={{ background: TYPES[quizResult.second].accent + "0a", border: `1px solid ${TYPES[quizResult.second].accent}33` }}>
                <div className="text-xs tracking-widest uppercase mb-1" style={{ color: TYPES[quizResult.second].accent }}>2nd Type Styling</div>
                <h4 className="font-serif text-lg mb-1" style={{ color: C.ink }}>1stで無難に、2ndで冒険する</h4>
                <p className="text-xs leading-relaxed mb-3" style={{ color: C.sub }}>
                  ベースは{RT.name}の得意色で固めつつ、小物や1点だけ2nd（{TYPES[quizResult.second].name}）の色を効かせると、「似合うのに人と被らない」コーデになります。2ndの得意トーンはこちら。
                </p>
                <div className="flex gap-1.5 mb-4">{TYPES[quizResult.second].palette.map((c, i) => <div key={i} className="w-7 h-7 rounded-full" style={{ background: c, border: "1px solid #eee" }} />)}</div>
                {SKUS[TYPES[quizResult.second].site].slice(0, 1).map((sku) => <SkuCard key={sku.id} sku={sku} site={TYPES[quizResult.second].site} accent={TYPES[quizResult.second].accent} />)}
                <a href={SITE_URL(TYPES[quizResult.second].site)} target="_blank" rel="noreferrer" className="block text-center text-xs underline mt-1" style={{ color: TYPES[quizResult.second].accent }}>2nd {TYPES[quizResult.second].name}の冒険アイテムをもっと見る →</a>
              </div>

              <button onClick={() => { setStResult(null); setMode("stylist"); }} className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mb-3 mt-2 transition-transform hover:scale-105" style={{ background: RT.accent }}>このタイプで「今日なに着る？」→</button>
              <button onClick={() => shareResultImage(RT, TYPES[quizResult.second].name, quizResult.axes)} className="flex items-center justify-center gap-2 w-full text-center px-6 py-3.5 rounded-full text-sm font-medium mb-3 transition-transform hover:scale-105" style={{ border: `2px solid ${RT.accent}`, color: RT.accent, background: RT.accent + "0a" }}>
                <Sparkles size={15} /> 結果を画像で保存・シェア
              </button>
              <a href={quizResult.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 w-full text-center px-6 py-3.5 rounded-full text-sm font-medium mb-3" style={{ border: `1px solid ${C.line}`, color: C.sub }}>
                あなたの詳しい診断結果ページへ <ExternalLink size={14} />
              </a>
              {/* ⑦ LINE導線強化：保存＋毎週配信の理由付き */}
              <div className="rounded-2xl p-5 mb-3" style={{ background: "#f2fbf5", border: "1px solid #c9ecd6" }}>
                <div className="text-sm font-medium mb-1" style={{ color: "#1a7a42" }}>この結果、LINEに保存しておきませんか？</div>
                <p className="text-xs leading-relaxed mb-3" style={{ color: "#4a6355" }}>
                  友だち追加で診断結果メモをトークに残せて、毎週土曜に{RT.name}向けの新着コーデ・お得情報が届きます（不要ならいつでもブロックOK）。
                </p>
                <a href={LINE_URLS[RT.site]} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium" style={{ background: "#06C755" }}>
                  LINEに結果を保存する（{RT.site === "iebel" ? "イエベ研究所" : "ブルベ研究所"}）
                </a>
              </div>
              <button onClick={goHome} className="block w-full text-center px-6 py-3 rounded-full text-sm" style={{ border: "1px solid " + C.line, color: C.sub }}>メニューへ戻る</button>
            </div>
          </div>
        )}

        {/* ═══ STYLIST ═══ */}
        {mode === "stylist" && (
          <div>
            <Header title="今日なに着る？" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name}{mySecond ? ` × 2nd ${TYPES[mySecond].name}` : ""} <button onClick={() => { setMyType(null); setMySecond(null); setStResult(null); }} className="underline" style={{ color: C.faint }}>変更</button>
                  </div>
                  <div className="text-xs mb-2" style={{ color: C.faint }}>今日のシーン</div>
                  <div className="flex gap-2 mb-5">
                    {["work", "date", "casual"].map((k) => (
                      <button key={k} onClick={() => setStTpo(k)} className="flex-1 py-2.5 rounded-full text-sm transition-all" style={{ border: stTpo === k ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: stTpo === k ? TYPES[myType].accent : C.sub, background: stTpo === k ? TYPES[myType].accent + "0d" : "white" }}>{tpoJa[k]}</button>
                    ))}
                  </div>
                  {stTpo === "date" && (
                    <>
                      <div className="text-xs mb-2" style={{ color: C.faint }}>どんなデート？</div>
                      <div className="flex flex-wrap gap-2 mb-5">
                        {["カフェ・ランチ", "ディナー", "お出かけ・アクティブ", "初デート"].map((d) => (
                          <button key={d} onClick={() => setStSub(stSub === d ? null : d)} className="px-3.5 py-2 rounded-full text-xs transition-all" style={{ border: stSub === d ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: stSub === d ? TYPES[myType].accent : C.sub, background: stSub === d ? TYPES[myType].accent + "0d" : "white" }}>{d}</button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="text-xs mb-2" style={{ color: C.faint }}>いまの髪色（任意）</div>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {["黒髪", "暗めブラウン", "明るめブラウン", "ベージュ・ミルクティー", "アッシュ・グレージュ", "ピンク・レッド系"].map((h) => (
                      <button key={h} onClick={() => setStHair(stHair === h ? null : h)} className="px-3.5 py-2 rounded-full text-xs transition-all" style={{ border: stHair === h ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: stHair === h ? TYPES[myType].accent : C.sub, background: stHair === h ? TYPES[myType].accent + "0d" : "white" }}>{h}</button>
                    ))}
                  </div>
                  <div className="text-xs mb-2" style={{ color: C.faint }}>今日会う相手（任意）</div>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {["彼・気になる人", "友達", "上司・仕事関係", "義家族・目上の方", "初対面の人"].map((m) => (
                      <button key={m} onClick={() => setStMeet(stMeet === m ? null : m)} className="px-3.5 py-2 rounded-full text-xs transition-all" style={{ border: stMeet === m ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: stMeet === m ? TYPES[myType].accent : C.sub, background: stMeet === m ? TYPES[myType].accent + "0d" : "white" }}>{m}</button>
                    ))}
                  </div>
                  <div className="text-xs mb-2" style={{ color: C.faint }}>叶えたいこと（複数OK）</div>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {["細見えしたい", "二の腕をカバー", "顔色を明るく", "大人っぽく", "若々しく", "褒められたい"].map((w) => {
                      const on = stWorries.includes(w);
                      return (
                        <button key={w} onClick={() => setStWorries(on ? stWorries.filter((x) => x !== w) : [...stWorries, w])} className="px-3.5 py-2 rounded-full text-xs transition-all" style={{ border: on ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: on ? TYPES[myType].accent : C.sub, background: on ? TYPES[myType].accent + "0d" : "white" }}>{w}</button>
                      );
                    })}
                  </div>
                  <div className="text-xs mb-2" style={{ color: C.faint }}>今日の気分（任意）</div>
                  <input value={stMood} onChange={(e) => setStMood(e.target.value)} placeholder="例：きちんと見せたい／ラクしたい／褒められたい" className="w-full rounded-2xl px-4 py-3 text-sm mb-5 focus:outline-none" style={{ border: "1px solid " + C.line, color: C.ink }} />
                  <button onClick={runStylist} disabled={stLoading} className="w-full py-3.5 rounded-full text-white text-sm font-medium transition-transform hover:scale-105 disabled:opacity-60" style={{ background: TYPES[myType].accent }}>
                    {stLoading ? "スタイリング中…" : `${LAB(TYPES[myType].site)}にコーデを提案してもらう`}
                  </button>
                  {stError && <p className="text-xs mt-3 text-center" style={{ color: "#c0392b" }}>{stError}</p>}

                  {stResult && (
                    <div className="mt-8">
                      <div className="text-xs tracking-widest uppercase mb-1" style={{ color: TYPES[myType].accent }}>Today's Styling</div>
                      <h3 className="font-serif text-2xl mb-4" style={{ color: C.ink }}>{stResult.title}</h3>
                      <div className="rounded-2xl p-5 mb-5" style={{ background: "#faf7f9", border: "1px solid #f0e9ef" }}>
                        <div className="flex items-center gap-1.5 text-xs font-medium mb-2" style={{ color: TYPES[myType].accent }}><Sparkles size={13} /> {LAB(TYPES[myType].site)}のスタイリストより</div>
                        <p className="text-sm leading-relaxed" style={{ color: "#4a434f" }}>{stResult.styling}</p>
                        {stResult.makeup_hint && <p className="text-xs mt-3 pt-3" style={{ color: C.sub, borderTop: "1px dashed " + C.line }}>💄 {stResult.makeup_hint}</p>}
                      </div>
                      <div className="text-xs mb-2.5" style={{ color: C.faint }}>今日のコーデセット（{TYPES[myType].siteName}）</div>
                      {(stResult.sku_ids || []).map((id) => {
                        const sku = SKUS[TYPES[myType].site].find((s) => s.id === id);
                        return sku ? <SkuCard key={id} sku={sku} site={TYPES[myType].site} accent={TYPES[myType].accent} /> : null;
                      })}
                      <div className="text-xs mb-2.5 mt-5" style={{ color: C.faint }}>仕上げのコスメ</div>
                      {COSME[myType].map((item, i) => <CosmeCard key={i} item={item} />)}
                      <a href={SITE_URL(TYPES[myType].site)} target="_blank" rel="noreferrer" className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mt-4 transition-transform hover:scale-105" style={{ background: TYPES[myType].accent }}>{TYPES[myType].name}の服をもっと見る →</a>
                      <p className="mt-4 text-center text-[10px] leading-relaxed" style={{ color: "#b3aab2" }}>※コスメ紹介はアフィリエイト広告を含みます</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ PAIR ═══ */}
        {mode === "pair" && (
          <div>
            <Header title="ふたりの相性配色" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              <TypePicker value={pA} onChange={setPA} label="あなたのタイプ" />
              <TypePicker value={pB} onChange={setPB} label="相手のタイプ" />
              {pairData && (
                <div className="mt-6">
                  <div className="flex h-20 rounded-2xl overflow-hidden mb-5">{pairData.colors.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}</div>
                  <div className="text-xs tracking-widest uppercase mb-1" style={{ color: C.main }}>{TYPES[pA].name} × {TYPES[pB].name}</div>
                  <h3 className="font-serif text-2xl mb-3" style={{ color: C.ink }}>{pairData.title}</h3>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: "#4a434f" }}>{pairData.text}</p>
                  <div className="flex gap-3">
                    <button onClick={copyShare} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-full text-sm" style={{ border: "1px solid " + C.line, color: "#6b6370" }}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "コピーしました" : "結果をシェア"}
                    </button>
                    <button onClick={() => { setPA(null); setPB(null); }} className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-full text-sm" style={{ border: "1px solid " + C.line, color: "#6b6370" }}><RotateCcw size={15} /> もう一度</button>
                  </div>
                  {(() => {
                    const site = TYPES[pA].site;
                    const list = SKUS[site];
                    const take = (cats, n) => list.filter((s) => cats.includes(s.cat)).slice(0, n);
                    const coord = [
                      ...take(["トップス"], 2),
                      ...take(["ワンピース", "ボトムス", "セットアップ"], 2),
                      ...take(["アクセサリー"], 1),
                    ];
                    return coord.length ? (
                      <div className="mt-8 pt-6" style={{ borderTop: "1px dashed " + C.line }}>
                        <div className="text-xs tracking-widest uppercase mb-1" style={{ color: TYPES[pA].accent }}>Your Pair Coordinate</div>
                        <h4 className="font-serif text-lg mb-1" style={{ color: C.ink }}>{TYPES[pA].name}のあなたに似合うコーデ一式</h4>
                        <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>ペアで並んだとき、この配色を活かせる{TYPES[pA].siteName}のアイテムです。</p>
                        {coord.map((sku) => <SkuCard key={sku.id} sku={sku} site={site} accent={TYPES[pA].accent} />)}
                        <a href={SITE_URL(site)} target="_blank" rel="noreferrer" className="block w-full text-center px-6 py-3 rounded-full text-white text-sm font-medium mt-2 transition-transform hover:scale-105" style={{ background: TYPES[pA].accent }}>{TYPES[pA].name}の服をもっと見る →</a>
                      </div>
                    ) : null;
                  })()}
                  <p className="mt-5 text-center text-xs" style={{ color: "#b3aab2" }}>ペアコーデのアイテム探しは → @blube_lab / @iebe_lab</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ COSME COUNTER ═══ */}
        {mode === "cosme" && (
          <div>
            <Header title="パーソナルカラー別おすすめコスメ" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline" style={{ color: C.faint }}>変更</button>
                  </div>
                  <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>{TYPES[myType].name}に似合うコスメはコレ！</h3>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>{LAB(TYPES[myType].site)}が選んだ、{TYPES[myType].name}の肌と調和する色番号だけを集めました。</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {["すべて", ...COSME_CATS, "一式セット"].map((c) => (
                      <button key={c} onClick={() => setCosmeCat(c)} className="px-3 py-1.5 rounded-full text-xs transition-all" style={{ border: cosmeCat === c ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: cosmeCat === c ? TYPES[myType].accent : C.sub, background: cosmeCat === c ? TYPES[myType].accent + "0d" : "white" }}>{c}</button>
                    ))}
                  </div>
                  {cosmeCat === "一式セット" ? (
                    <>
                      <div className="rounded-2xl p-4 mb-4" style={{ background: TYPES[myType].accent + "0d", border: `1px solid ${TYPES[myType].accent}30` }}>
                        <div className="text-sm font-medium" style={{ color: C.ink }}>{TYPES[myType].name} フルメイク一式</div>
                        <div className="text-xs mt-1" style={{ color: C.sub }}>
                          リップ〜眉まで全6点をこのまま揃えて、合計 <span className="font-medium" style={{ color: TYPES[myType].accent }}>¥{COSME_FULL[myType].filter((x) => x.set).reduce((a, x) => a + x.price, 0).toLocaleString()}</span>（参考価格）
                        </div>
                      </div>
                      {COSME_FULL[myType].filter((x) => x.set).map((item, i) => <CosmeCard key={i} item={item} />)}
                    </>
                  ) : (
                    (cosmeCat === "すべて" ? COSME_FULL[myType] : COSME_FULL[myType].filter((x) => x.cat === cosmeCat)).map((item, i) => <CosmeCard key={i} item={item} />)
                  )}
                  <p className="mt-4 text-center text-[10px] leading-relaxed" style={{ color: "#b3aab2" }}>※コスメ紹介はアフィリエイト広告を含みます。Amazonのアソシエイトとして、適格販売により収入を得ています。</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ HAIR ═══ */}
        {mode === "hair" && (
          <div>
            <Header title="似合う髪色" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline" style={{ color: C.faint }}>変更</button>
                  </div>
                  <h3 className="font-serif text-xl leading-snug mb-4" style={{ color: C.ink }}>{TYPES[myType].name}に似合う髪色はコレ！</h3>
                  <div className="flex gap-3 mb-4">
                    {HAIR[myType].colors.map((c, i) => (
                      <div key={i} className="flex-1 text-center">
                        <div className="w-full h-14 rounded-2xl mb-1.5" style={{ background: c.hex, border: "1px solid #eee" }} />
                        <span className="text-[10px] leading-tight block" style={{ color: C.sub }}>{c.name}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>{HAIR[myType].tip}</p>
                  {(HAIR[myType].affs || [HAIR[myType].aff]).map((item, i) => <CosmeCard key={i} item={item} />)}
                  <a href={HAIR[myType].article + "?" + UTM} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 w-full text-center px-6 py-3.5 rounded-full text-sm font-medium mt-2" style={{ border: `2px solid ${TYPES[myType].accent}`, color: TYPES[myType].accent }}>
                    髪色の記事で詳しく見る <ExternalLink size={14} />
                  </a>
                  <p className="mt-4 text-center text-[10px] leading-relaxed" style={{ color: "#b3aab2" }}>※商品紹介はアフィリエイト広告を含みます。</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ FRAME ═══ */}
        {mode === "frame" && !frameDone && (
          <div>
            <Header title="骨格診断" onBack={goHome} />
            <div className="px-8 pb-12 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs tracking-widest" style={{ color: C.faint }}>質問 {fqi + 1} / {FQ.length}</span>
              </div>
              <div className="h-1 w-full rounded-full mb-6" style={{ background: "#efe9ee" }}>
                <div className="h-1 rounded-full transition-all duration-300" style={{ width: `${(fqi / FQ.length) * 100}%`, background: C.main }} />
              </div>
              <h2 className="text-base font-medium leading-relaxed mb-5" style={{ color: C.ink }}>{FQ[fqi].q}</h2>
              <div className="space-y-3">
                {[["S", FQ[fqi].a], ["W", FQ[fqi].b], ["N", FQ[fqi].c]].map(([k, label]) => (
                  <button key={k} onClick={() => answerFQ(k)} className="w-full text-left px-5 py-4 rounded-2xl text-sm transition-all hover:shadow-md" style={{ border: "1px solid " + C.line, color: "#4a434f" }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === "frame" && frameDone && myFrame && (
          <div>
            <div className="h-3" style={{ background: FRAMES[myFrame].accent }} />
            <div className="px-8 py-9">
              <div className="text-xs font-medium mb-3" style={{ color: C.sub }}>ブルベ研究所・イエベ研究所 監修の骨格セルフチェック</div>
              <h2 className="font-serif text-2xl leading-snug mb-1" style={{ color: C.ink }}>
                あなたは<span className="text-3xl mx-0.5" style={{ color: FRAMES[myFrame].accent }}>【骨格{FRAMES[myFrame].name}】</span>タイプ！
              </h2>
              <p className="text-sm mb-5" style={{ color: "#8a828d" }}>{FRAMES[myFrame].catch}</p>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "#4a434f" }}>{FRAMES[myFrame].tip}</p>
              <div className="grid grid-cols-2 gap-4 mb-7">
                <div><div className="text-xs mb-2" style={{ color: C.faint }}>得意なデザイン</div><div className="flex flex-wrap gap-1">{FRAMES[myFrame].good.map((g, i) => <span key={i} className="text-xs px-2 py-1 rounded-full" style={{ background: FRAMES[myFrame].accent + "14", color: FRAMES[myFrame].accent }}>{g}</span>)}</div></div>
                <div><div className="text-xs mb-2" style={{ color: C.faint }}>注意したいデザイン</div><div className="flex flex-wrap gap-1">{FRAMES[myFrame].ng.map((n, i) => <span key={i} className="text-xs px-2 py-1 rounded-full" style={{ background: "#f2eef1", color: "#8a828d" }}>{n}</span>)}</div></div>
              </div>
              {myType ? (
                <>
                  <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>{TYPES[myType].name}×骨格{FRAMES[myFrame].name}のあなたに似合う服はコレ！</h3>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>似合う色（パーソナルカラー）と似合う形（骨格）の両方で絞り込んだ、あなた専用のセレクトです。</p>
                  {SKUS[TYPES[myType].site].filter((sku) => sku.frame && sku.frame.includes(myFrame)).slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={TYPES[myType].site} accent={TYPES[myType].accent} />)}
                  <button onClick={() => { setStResult(null); setMode("stylist"); }} className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mb-3 mt-2 transition-transform hover:scale-105" style={{ background: TYPES[myType].accent }}>カラー×骨格で「今日なに着る？」→</button>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: C.sub }}>パーソナルカラー診断と組み合わせると、「似合う色×似合う形」であなた専用の提案ができます♡</p>
                  <button onClick={startQuiz} className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mb-3" style={{ background: C.main }}>12タイプ カラー診断へ →</button>
                </>
              )}
              <button onClick={goHome} className="block w-full text-center px-6 py-3 rounded-full text-sm" style={{ border: "1px solid " + C.line, color: C.sub }}>メニューへ戻る</button>
            </div>
          </div>
        )}

        {/* ═══ PHOTO ═══ */}
        {mode === "photo" && (
          <div>
            <Header title="顔写真で診断" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>
                自然光の下で撮った、正面からの写真がおすすめです。写真はこの診断のためだけに使われ、保存されません。照明の影響を受けるため、結果は「傾向」としてお楽しみください。より正確に知りたい方は12タイプ診断（質問式）をどうぞ。
              </p>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="w-full rounded-2xl py-10 flex flex-col items-center gap-3 transition-colors" style={{ border: "2px dashed " + C.line, color: C.sub }}>
                <Upload size={26} style={{ color: C.main }} />
                <span className="text-sm">写真を選ぶ / 撮影する</span>
              </button>
              {phPreview && <img src={phPreview} alt="preview" className="mt-5 w-28 h-28 object-cover rounded-2xl mx-auto" style={{ border: "1px solid " + C.line }} />}
              {phLoading && (
                <div className="text-center mt-6">
                  <div className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-3" style={{ borderColor: "#c3b4c4", borderTopColor: "transparent" }} />
                  <p className="text-sm" style={{ color: C.sub }}>色調を解析しています…</p>
                </div>
              )}
              {phError && <p className="text-xs mt-4 text-center" style={{ color: "#c0392b" }}>{phError}</p>}
              {null}
            </div>
          </div>
        )}

        {/* ═══ ① NG COLOR ═══ */}
        {mode === "ngcolor" && (
          <div>
            <Header title="パーソナルカラー別NGカラー" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline" style={{ color: C.faint }}>変更</button>
                  </div>
                  <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>{TYPES[myType].name}が顔まわりで避けたい色</h3>
                  <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>「なんか今日顔色悪い？」の原因は、実はこの色かも。代わりに使える置き換え色もセットでどうぞ。</p>
                  {NG_COLORS[myType].map((ng, i) => (
                    <div key={i} className="rounded-2xl p-4 mb-3" style={{ border: "1px solid " + C.line }}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-9 h-9 rounded-xl shrink-0" style={{ background: ng.hex, border: "1px solid #e5dfe4" }} />
                        <div>
                          <div className="text-sm font-medium" style={{ color: C.ink }}>✕ {ng.name}</div>
                          <div className="text-xs mt-0.5" style={{ color: C.sub }}>{ng.why}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: TYPES[myType].accent + "0d" }}>
                        <span className="text-xs" style={{ color: TYPES[myType].accent }}>→ 代わりに</span>
                        <span className="w-5 h-5 rounded-full" style={{ background: ng.alt.hex, border: "1px solid #e5dfe4" }} />
                        <span className="text-xs font-medium" style={{ color: C.ink }}>{ng.alt.name}</span>
                      </div>
                    </div>
                  ))}
                  <h4 className="font-serif text-lg mt-6 mb-1" style={{ color: C.ink }}>置き換えカラーの服はコレ</h4>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>{TYPES[myType].name}の得意色だけで作った{TYPES[myType].siteName}のアイテムです。</p>
                  {SKUS[TYPES[myType].site].slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={TYPES[myType].site} accent={TYPES[myType].accent} />)}
                  <a href={SITE_URL(TYPES[myType].site)} target="_blank" rel="noreferrer" className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mt-2 transition-transform hover:scale-105" style={{ background: TYPES[myType].accent }}>{TYPES[myType].name}の服をもっと見る →</a>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ ② COLOR CHECKER ═══ */}
        {mode === "checker" && (
          <div>
            <Header title="手持ち服カラーチェッカー" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline" style={{ color: C.faint }}>変更</button>
                  </div>
                  <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>その服の色、似合ってる？</h3>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>手持ちの服にいちばん近い色をタップすると、{TYPES[myType].name}との相性を判定します。</p>
                  <div className="grid grid-cols-6 gap-2 mb-5">
                    {COLOR_CHECK.map((cc, i) => (
                      <button key={i} onClick={() => setCheckColor(cc)} className="aspect-square rounded-xl transition-transform hover:scale-110" title={cc.name} style={{ background: cc.hex, border: checkColor && checkColor.name === cc.name ? `3px solid ${TYPES[myType].accent}` : "1px solid #e5dfe4" }} />
                    ))}
                  </div>
                  {checkColor && (() => {
                    const rating = checkColor.r[myType];
                    const good = rating === "◎" || rating === "○";
                    const alts = COLOR_CHECK.filter((cc) => cc.r[myType] === "◎").slice(0, 4);
                    return (
                      <div>
                        <div className="rounded-2xl p-5 mb-4" style={{ background: "#faf7f9", border: "1px solid #f0e9ef" }}>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="w-10 h-10 rounded-xl shrink-0" style={{ background: checkColor.hex, border: "1px solid #e5dfe4" }} />
                            <div>
                              <div className="text-sm font-medium" style={{ color: C.ink }}>{checkColor.name}</div>
                              <div className="text-lg font-serif" style={{ color: good ? TYPES[myType].accent : "#c0392b" }}>{rating} {RATING_LABEL[rating]}</div>
                            </div>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: "#4a434f" }}>{RATING_TIP[rating]}</p>
                        </div>
                        {!good && (
                          <>
                            <div className="text-xs mb-2" style={{ color: C.faint }}>代わりに顔まわりで使いたい◎カラー</div>
                            <div className="flex gap-2 mb-5">
                              {alts.map((a, i) => (
                                <div key={i} className="flex-1 text-center">
                                  <div className="w-full h-10 rounded-xl mb-1" style={{ background: a.hex, border: "1px solid #e5dfe4" }} />
                                  <span className="text-[10px] block leading-tight" style={{ color: C.sub }}>{a.name}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        <div className="text-xs mb-2.5" style={{ color: C.faint }}>{good ? "この色と好相性の得意色アイテム" : "得意色で買い替えるならコレ"}（{TYPES[myType].siteName}）</div>
                        {SKUS[TYPES[myType].site].slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={TYPES[myType].site} accent={TYPES[myType].accent} />)}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ ③ TRY-ON ═══ */}
        {mode === "tryon" && (
          <div>
            <Header title="リップ・髪色の試し塗り" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline" style={{ color: C.faint }}>変更</button>
                  </div>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>
                    正面の顔写真をアップして、唇や髪を指でなぞると{TYPES[myType].name}に似合う色が重なります。写真はこの画面の中だけで使われ、保存・送信されません。
                  </p>
                  <input ref={toFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    const url = URL.createObjectURL(f);
                    const img = new Image();
                    img.onload = () => {
                      const cv = toCanvasRef.current;
                      if (!cv) return;
                      const maxW = 320;
                      const scale = Math.min(1, maxW / img.width);
                      cv.width = img.width * scale;
                      cv.height = img.height * scale;
                      const ctx = cv.getContext("2d");
                      ctx.drawImage(img, 0, 0, cv.width, cv.height);
                      cv.dataset.base = cv.toDataURL();
                      setToPreview(url);
                    };
                    img.src = url;
                  }} />
                  {!toPreview && (
                    <button onClick={() => toFileRef.current && toFileRef.current.click()} className="w-full rounded-2xl py-10 flex flex-col items-center gap-3 transition-colors mb-4" style={{ border: "2px dashed " + C.line, color: C.sub }}>
                      <Upload size={26} style={{ color: C.main }} />
                      <span className="text-sm">写真を選ぶ / 撮影する</span>
                    </button>
                  )}
                  <div className="flex gap-2 mb-3">
                    {[["lip", "リップ"], ["hair", "髪色"]].map(([k, label]) => (
                      <button key={k} onClick={() => { setToKind(k); setToColor(null); }} className="flex-1 px-3 py-2 rounded-full text-xs transition-all" style={{ border: toKind === k ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: toKind === k ? TYPES[myType].accent : C.sub, background: toKind === k ? TYPES[myType].accent + "0d" : "white" }}>{label}</button>
                    ))}
                  </div>
                  <div className="flex gap-2 mb-4">
                    {(toKind === "lip" ? TRYON_LIPS[myType] : HAIR[myType].colors).map((c, i) => (
                      <button key={i} onClick={() => setToColor(c.hex)} className="flex-1 text-center">
                        <span className="block w-full h-9 rounded-xl mb-1 transition-transform hover:scale-105" style={{ background: c.hex, border: toColor === c.hex ? `3px solid ${TYPES[myType].accent}` : "1px solid #e5dfe4" }} />
                        <span className="text-[10px] leading-tight block" style={{ color: C.sub }}>{c.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-2xl overflow-hidden mb-3" style={{ border: "1px solid " + C.line, display: toPreview ? "block" : "none" }}>
                    <canvas
                      ref={toCanvasRef}
                      className="w-full block"
                      style={{ touchAction: "none", cursor: "crosshair" }}
                      onPointerDown={(e) => { toDrawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
                      onPointerUp={() => { toDrawing.current = false; }}
                      onPointerMove={(e) => {
                        if (!toDrawing.current || !toColor) return;
                        const cv = e.currentTarget;
                        const rect = cv.getBoundingClientRect();
                        const x = (e.clientX - rect.left) * (cv.width / rect.width);
                        const y = (e.clientY - rect.top) * (cv.height / rect.height);
                        const ctx = cv.getContext("2d");
                        ctx.globalAlpha = 0.12;
                        ctx.fillStyle = toColor;
                        ctx.beginPath();
                        ctx.arc(x, y, toKind === "lip" ? 9 : 18, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                      }}
                    />
                  </div>
                  {toPreview && (
                    <div className="flex gap-2 mb-5">
                      <button onClick={() => {
                        const cv = toCanvasRef.current;
                        if (!cv || !cv.dataset.base) return;
                        const img = new Image();
                        img.onload = () => { const ctx = cv.getContext("2d"); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0); };
                        img.src = cv.dataset.base;
                      }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs" style={{ border: "1px solid " + C.line, color: "#6b6370" }}><Eraser size={14} /> 塗りをリセット</button>
                      <button onClick={() => { setToPreview(null); setToColor(null); }} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs" style={{ border: "1px solid " + C.line, color: "#6b6370" }}><RotateCcw size={14} /> 別の写真にする</button>
                    </div>
                  )}
                  <div className="text-xs mb-2.5" style={{ color: C.faint }}>{toKind === "lip" ? "この色味を買うならコレ" : "この髪色にするならコレ"}</div>
                  {(toKind === "lip" ? COSME_FULL[myType].filter((x) => x.cat === "リップ").slice(0, 3) : (HAIR[myType].affs || [HAIR[myType].aff]).slice(0, 3)).map((item, i) => <CosmeCard key={i} item={item} />)}
                  <p className="mt-4 text-center text-[10px] leading-relaxed" style={{ color: "#b3aab2" }}>※商品紹介はアフィリエイト広告を含みます。色の見え方は画面により異なります。</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ ⑤ WARDROBE（事前ヒアリング式） ═══ */}
        {mode === "wardrobe" && (() => {
          const seasonKey = SEASON_OF_MONTH(new Date().getMonth() + 1);
          const toggleOwned = (k) => setWdOwned((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
          return (
            <div>
              <Header title="今季の買い足しワードローブ" onBack={goHome} />
              <div className="px-8 pb-12 pt-3">
                {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
                {myType && (
                  <>
                    <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                      {TYPES[myType].name}{myFrame ? ` × 骨格${FRAMES[myFrame].name}` : ""} <button onClick={() => { setMyType(null); setWdStep(1); }} className="underline" style={{ color: C.faint }}>変更</button>
                    </div>

                    {/* STEP 1: シーン＋骨格 */}
                    {wdStep === 1 && (
                      <div className="fade-up">
                        <div className="text-xs mb-1" style={{ color: C.faint }}>STEP 1 / 3</div>
                        <h3 className="font-serif text-xl leading-snug mb-4" style={{ color: C.ink }}>その服、どこで着る？</h3>
                        <div className="text-xs mb-2" style={{ color: C.faint }}>いちばんよく着るシーン</div>
                        <div className="flex gap-2 mb-6">
                          {[["work", "通勤・仕事"], ["date", "デート・お出かけ"], ["casual", "休日カジュアル"]].map(([k, label]) => (
                            <button key={k} onClick={() => setWdScene(k)} className="flex-1 px-2 py-3 rounded-2xl text-xs transition-all" style={{ border: wdScene === k ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: wdScene === k ? TYPES[myType].accent : C.sub, background: wdScene === k ? TYPES[myType].accent + "0d" : "white" }}>{label}</button>
                          ))}
                        </div>
                        <div className="text-xs mb-2" style={{ color: C.faint }}>骨格タイプ（わかれば・任意）</div>
                        <div className="flex gap-2 mb-7">
                          {[["S", "ストレート"], ["W", "ウェーブ"], ["N", "ナチュラル"]].map(([k, label]) => (
                            <button key={k} onClick={() => setMyFrame(myFrame === k ? null : k)} className="flex-1 px-2 py-3 rounded-2xl text-xs transition-all" style={{ border: myFrame === k ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: myFrame === k ? TYPES[myType].accent : C.sub, background: myFrame === k ? TYPES[myType].accent + "0d" : "white" }}>{label}</button>
                          ))}
                        </div>
                        <button disabled={!wdScene} onClick={() => setWdStep(2)} className="w-full py-3.5 rounded-full text-white text-sm font-medium transition-transform hover:scale-105 disabled:opacity-40" style={{ background: TYPES[myType].accent }}>次へ →</button>
                      </div>
                    )}

                    {/* STEP 2: 持っているもの */}
                    {wdStep === 2 && (
                      <div className="fade-up">
                        <div className="text-xs mb-1" style={{ color: C.faint }}>STEP 2 / 3</div>
                        <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>もう足りているのは？</h3>
                        <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>すでに十分持っている役割を選んでください（複数OK・なければそのまま次へ）。持っていない役割から優先的に提案します。</p>
                        <div className="space-y-2 mb-7">
                          {WARDROBE_ROLES.map((wr) => (
                            <button key={wr.key} onClick={() => toggleOwned(wr.key)} className="w-full flex items-center gap-3 rounded-2xl p-4 text-left transition-all" style={{ border: wdOwned.includes(wr.key) ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, background: wdOwned.includes(wr.key) ? TYPES[myType].accent + "0d" : "white" }}>
                              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: wdOwned.includes(wr.key) ? TYPES[myType].accent : "#e5dfe4" }}>{wdOwned.includes(wr.key) && <Check size={12} />}</span>
                              <span>
                                <span className="block text-sm font-medium" style={{ color: C.ink }}>{wr.role}</span>
                                <span className="block text-xs mt-0.5" style={{ color: C.sub }}>{wr.cats.join("・")}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setWdStep(3)} className="w-full py-3.5 rounded-full text-white text-sm font-medium transition-transform hover:scale-105 mb-2" style={{ background: TYPES[myType].accent }}>次へ →</button>
                        <button onClick={() => setWdStep(1)} className="w-full py-2.5 rounded-full text-xs" style={{ border: "1px solid " + C.line, color: "#6b6370" }}>← 戻る</button>
                      </div>
                    )}

                    {/* STEP 3: 悩み */}
                    {wdStep === 3 && (
                      <div className="fade-up">
                        <div className="text-xs mb-1" style={{ color: C.faint }}>STEP 3 / 3</div>
                        <h3 className="font-serif text-xl leading-snug mb-4" style={{ color: C.ink }}>いまの服の悩みは？</h3>
                        <div className="space-y-2 mb-7">
                          {WD_WORRIES.map((w) => (
                            <button key={w.key} onClick={() => setWdWorry(w.key)} className="w-full rounded-2xl p-4 text-left text-sm transition-all" style={{ border: wdWorry === w.key ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: wdWorry === w.key ? TYPES[myType].accent : C.ink, background: wdWorry === w.key ? TYPES[myType].accent + "0d" : "white" }}>{w.label}</button>
                          ))}
                        </div>
                        <button disabled={!wdWorry} onClick={() => setWdStep(4)} className="w-full py-3.5 rounded-full text-white text-sm font-medium transition-transform hover:scale-105 disabled:opacity-40 mb-2" style={{ background: TYPES[myType].accent }}>提案を見る →</button>
                        <button onClick={() => setWdStep(2)} className="w-full py-2.5 rounded-full text-xs" style={{ border: "1px solid " + C.line, color: "#6b6370" }}>← 戻る</button>
                      </div>
                    )}

                    {/* STEP 4: 結果 */}
                    {wdStep === 4 && (() => {
                      const worry = WD_WORRIES.find((w) => w.key === wdWorry);
                      const sceneJa = { work: "通勤・仕事", date: "デート・お出かけ", casual: "休日カジュアル" }[wdScene];
                      const roles = WARDROBE_ROLES.filter((wr) => !wdOwned.includes(wr.key));
                      const showRoles = roles.length ? roles : WARDROBE_ROLES; // 全部持っている場合は「更新提案」
                      const allOwned = !roles.length;
                      const pickSkus = (wr) => {
                        const base = SKUS[TYPES[myType].site].filter((s2) => wr.cats.includes(s2.cat));
                        let pool = base.filter((s2) => s2.tpo.includes(wdScene));
                        if (!pool.length) pool = base;
                        if (myFrame) {
                          const framed = pool.filter((s2) => s2.frame && s2.frame.includes(myFrame));
                          if (framed.length) pool = framed;
                        }
                        return pool.slice(0, wr.n);
                      };
                      return (
                        <div className="fade-up">
                          <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>{SEASON_LABEL[seasonKey]}の{sceneJa}に、{allOwned ? "今あるものを更新するならコレ" : "買い足すならこの" + showRoles.length + "役"}</h3>
                          <p className="text-xs leading-relaxed mb-3" style={{ color: C.sub }}>{WARDROBE_FOCUS[seasonKey][myType]}。</p>
                          {worry && (
                            <div className="rounded-2xl p-4 mb-5" style={{ background: TYPES[myType].accent + "0d" }}>
                              <div className="text-xs font-medium mb-1" style={{ color: TYPES[myType].accent }}>「{worry.label}」への処方箋</div>
                              <p className="text-xs leading-relaxed" style={{ color: "#4a434f" }}>{worry.tip}</p>
                            </div>
                          )}
                          {showRoles.map((wr, i) => {
                            const picks = pickSkus(wr);
                            if (!picks.length) return null;
                            return (
                              <div key={wr.key} className="mb-6">
                                <div className="flex items-baseline gap-2 mb-1">
                                  <span className="text-sm font-medium" style={{ color: TYPES[myType].accent }}>{i + 1}. {wr.role}</span>
                                  {myFrame && <span className="text-[10px]" style={{ color: C.faint }}>骨格{FRAMES[myFrame].name}向けを優先</span>}
                                </div>
                                <p className="text-xs leading-relaxed mb-3" style={{ color: C.sub }}>{wr.why}</p>
                                {picks.map((sku) => <SkuCard key={sku.id} sku={sku} site={TYPES[myType].site} accent={TYPES[myType].accent} />)}
                              </div>
                            );
                          })}
                          <a href={SITE_URL(TYPES[myType].site)} target="_blank" rel="noreferrer" className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mb-2 transition-transform hover:scale-105" style={{ background: TYPES[myType].accent }}>{TYPES[myType].name}の{SEASON_LABEL[seasonKey]}服をもっと見る →</a>
                          <button onClick={() => { setWdStep(1); setWdScene(null); setWdOwned([]); setWdWorry(null); }} className="w-full py-2.5 rounded-full text-xs" style={{ border: "1px solid " + C.line, color: "#6b6370" }}>条件を変えてやり直す</button>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* ═══ ⑩ OUTFIT SCORE ═══ */}
        {mode === "score" && (
          <div>
            <Header title="今日のコーデ採点" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full text-xs" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => { setMyType(null); setScResult(null); }} className="underline" style={{ color: C.faint }}>変更</button>
                  </div>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>
                    今日のコーデ（全身または服がよく見える写真）をアップすると、{TYPES[myType].name}との色の調和をAIが採点します。写真は採点のためだけに使われ、保存されません。
                  </p>
                  <input ref={scFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    setScResult(null); setScError("");
                    const reader = new FileReader();
                    reader.onload = () => {
                      setScPreview(reader.result);
                      scB64.current = { data: String(reader.result).split(",")[1], mt: f.type || "image/jpeg" };
                    };
                    reader.readAsDataURL(f);
                  }} />
                  {!scPreview && (
                    <button onClick={() => scFileRef.current && scFileRef.current.click()} className="w-full rounded-2xl py-10 flex flex-col items-center gap-3 mb-4" style={{ border: "2px dashed " + C.line, color: C.sub }}>
                      <Camera size={26} style={{ color: C.main }} />
                      <span className="text-sm">コーデ写真を選ぶ / 撮影する</span>
                    </button>
                  )}
                  {scPreview && (
                    <div className="rounded-2xl overflow-hidden mb-4" style={{ border: "1px solid " + C.line }}>
                      <img src={scPreview} alt="コーデ" className="w-full block" />
                    </div>
                  )}
                  {scPreview && !scResult && (
                    <button disabled={scLoading} onClick={async () => {
                      if (!scB64.current) return;
                      setScLoading(true); setScError("");
                      try {
                        const r = await aiScoreOutfit(scB64.current.data, scB64.current.mt, TYPES[myType]);
                        setScResult(r);
                      } catch (err) {
                        setScError("採点に失敗しました。写真を変えるか、少し待ってからもう一度お試しください。");
                      }
                      setScLoading(false);
                    }} className="w-full py-3.5 rounded-full text-white text-sm font-medium mb-3 transition-transform hover:scale-105 disabled:opacity-60" style={{ background: TYPES[myType].accent }}>
                      {scLoading ? "採点中…（10秒ほどかかります）" : "このコーデを採点する"}
                    </button>
                  )}
                  {scPreview && (
                    <button onClick={() => { setScPreview(null); setScResult(null); setScError(""); scB64.current = null; }} className="w-full py-2.5 rounded-full text-xs mb-4" style={{ border: "1px solid " + C.line, color: "#6b6370" }}>別の写真にする</button>
                  )}
                  {scError && <p className="text-xs mb-4 text-center" style={{ color: "#c0392b" }}>{scError}</p>}
                  {scResult && (
                    <div className="fade-up">
                      <div className="rounded-2xl p-6 mb-4 text-center" style={{ background: "#faf7f9", border: "1px solid #f0e9ef" }}>
                        <div className="text-xs mb-1" style={{ color: C.faint }}>{TYPES[myType].name}との調和スコア</div>
                        <div className="font-serif text-5xl" style={{ color: TYPES[myType].accent }}>{scResult.score}<span className="text-xl" style={{ color: C.faint }}> / 100</span></div>
                      </div>
                      <div className="rounded-2xl p-4 mb-3" style={{ border: "1px solid " + C.line }}>
                        <div className="text-xs font-medium mb-1" style={{ color: TYPES[myType].accent }}>◎ ここが良い</div>
                        <p className="text-xs leading-relaxed" style={{ color: "#4a434f" }}>{scResult.good}</p>
                      </div>
                      <div className="rounded-2xl p-4 mb-3" style={{ border: "1px solid " + C.line }}>
                        <div className="text-xs font-medium mb-1" style={{ color: TYPES[myType].accent }}>↗ もっと良くするなら</div>
                        <p className="text-xs leading-relaxed" style={{ color: "#4a434f" }}>{scResult.improve}</p>
                      </div>
                      {scResult.one_item && (
                        <div className="rounded-2xl p-4 mb-4" style={{ background: TYPES[myType].accent + "0d" }}>
                          <div className="text-xs font-medium mb-1" style={{ color: TYPES[myType].accent }}>🛍 買い足すなら</div>
                          <p className="text-xs leading-relaxed" style={{ color: "#4a434f" }}>{scResult.one_item}</p>
                        </div>
                      )}
                      <div className="text-xs mb-2.5" style={{ color: C.faint }}>スコアを底上げする{TYPES[myType].name}の得意色アイテム</div>
                      {SKUS[TYPES[myType].site].slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={TYPES[myType].site} accent={TYPES[myType].accent} />)}
                      <p className="mt-3 text-center text-[10px] leading-relaxed" style={{ color: "#b3aab2" }}>※採点は色の調和の傾向を楽しむ参考値です。照明により色の見え方は変わります。</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
