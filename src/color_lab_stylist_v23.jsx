import React, { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowRight, ArrowLeft, RotateCcw, Copy, Check, Camera, Heart, Palette, Shirt, Upload, ExternalLink, Brush, Scissors, Ban, Droplet, Paintbrush, ShoppingBag, Eraser } from "lucide-react";

// ════════════════════════════════════════════
// 実データ：自社SKU（在庫あり・直近2ヶ月売れ筋）
// ════════════════════════════════════════════
// 計測: アプリ経由の流入をGA4/Shoppalで判別するためのUTM
const UTM = "utm_source=colorlab&utm_medium=app&utm_campaign=ai_stylist";
const ITEM_URL = (site, id) => `https://${site}.jp/items/${id}?${UTM}`;
const SITE_URL = (site) => `https://${site}.jp?${UTM}`;

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

// 埋め込み公開時は false にする（対象機能に「近日公開」を表示）
// AI_ENABLED はコーデ提案 / コーデ採点（外部AI依存）のゲート。false のまま維持する。
const AI_ENABLED = false;
// 「顔写真で診断」だけは 2026-08-29 に実測方式（白基準補正 + CIELab・外部通信なし）へ
// 置換したため、AI_ENABLED とは切り離した専用フラグで解禁する。
const PHOTO_DIAGNOSE_ENABLED = true;
// 「パーソナルカラー別コーデ提案」も 2026-08-29 にシーン別記事データの参照方式へ置換して解禁。
const STYLIST_ENABLED = true;
// 「今日のコーデ採点」も 2026-08-29 に色照合方式（CIELab のΔE）へ置換して解禁。
// 判定できるのは「服の色とタイプの相性」だけで、シルエット・素材感は対象外（結果画面に明記する）。
const SCORE_ENABLED = true;

const TYPES = {
  spring: { key: "spring", num: 1, name: "イエベ春", en: "Spring", catch: "光をまとう、いきいきとした暖色", palette: ["#F7C9A0", "#F4A582", "#F6D65B", "#8FCB9B", "#FFF3E2"], palette10: [["アイボリー","#FFF3E2"],["アプリコット","#F7C9A0"],["コーラルピンク","#F4A582"],["ピーチ","#EE8B7E"],["イエロー","#F6D65B"],["ゴールデンイエロー","#F2B94C"],["ライトグリーン","#8FCB9B"],["明るいターコイズ","#67C7B0"],["キャメル","#C89B5A"],["オレンジ","#E8875C"]], ng: ["黒", "グレー", "青みの強い色"], accent: "#E8927C", site: "iebel", siteName: "IEBEL", siteUrl: "https://iebel.jp", sns: "@iebe_lab" },
  summer: { key: "summer", num: 2, name: "ブルベ夏", en: "Summer", catch: "やわらかく澄んだ、上品な寒色", palette: ["#C9B8D8", "#E8A9C0", "#A9C4DE", "#B7BCC4", "#F3EEF5"], palette10: [["オフホワイト","#F3EEF5"],["ラベンダー","#C9B8D8"],["ローズピンク","#E8A9C0"],["ローズ","#D4708E"],["パウダーブルー","#A9C4DE"],["ブルーグレー","#93A5B8"],["ソフトグレー","#B7BCC4"],["モーヴ","#A05A78"],["ペリウィンクル","#7A86B8"],["ラズベリー","#B45A72"]], ng: ["オレンジ", "こっくりブラウン", "強い原色"], accent: "#9B8CB5", site: "blubel", siteName: "BLUBEL", siteUrl: "https://blubel.jp", sns: "@blube_lab" },
  autumn: { key: "autumn", num: 3, name: "イエベ秋", en: "Autumn", catch: "深みでまとう、こっくりリッチな暖色", palette: ["#B5734A", "#C89B3C", "#7B8B45", "#A65A3A", "#E8D6B8"], palette10: [["エクリュ","#E8D6B8"],["キャメル","#B5734A"],["マスタード","#C89B3C"],["テラコッタ","#A65A3A"],["オリーブ","#7B8B45"],["モスグリーン","#5F6B3F"],["ティールグリーン","#2E6E63"],["ブラウン","#6B4226"],["ブロンズ","#A8703F"],["ブラウンレッド","#8E3B2E"]], ng: ["ビビッド原色", "青みピンク", "純白"], accent: "#A65E3A", site: "iebel", siteName: "IEBEL", siteUrl: "https://iebel.jp", sns: "@iebe_lab" },
  winter: { key: "winter", num: 4, name: "ブルベ冬", en: "Winter", catch: "コントラストで際立つ、鮮烈な寒色", palette: ["#3B5BA5", "#C2408B", "#1F9E8E", "#111418", "#FFFFFF"], palette10: [["ピュアホワイト","#FFFFFF"],["ブラック","#111418"],["ロイヤルブルー","#3B5BA5"],["エメラルド","#1F9E8E"],["マゼンタ","#C2408B"],["ワインレッド","#9E1F33"],["パープル","#6E3FA3"],["ネイビー","#1E2A44"],["アイシーグレー","#C9CDD6"],["ビビッドピンク","#D6337F"]], ng: ["くすみカラー", "アイボリー", "オレンジ寄り"], accent: "#3B5BA5", site: "blubel", siteName: "BLUBEL", siteUrl: "https://blubel.jp", sns: "@blube_lab" },
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

// 骨格診断: デザイン項目の簡易イラスト（キーワードマッチ）
function DesignIcon({ label }) {
  const st = { stroke: "currentColor", strokeWidth: 2.2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const pick = () => {
    if (label.includes("Iライン") || label.includes("ジャスト")) return <path {...st} d="M14 8 h12 l3 6 v22 h-18 v-22 z M17 8 v-2 h6 v2" />; // すとんとしたワンピ
    if (label.includes("Xライン") || label.includes("ハイウエスト")) return <><path {...st} d="M12 8 h16 l2 8 -6 4 6 12 h-20 l6-12 -6-4 z" /><path {...st} d="M15 20 h10" /></>; // くびれワンピ
    if (label.includes("Vネック") || label.includes("襟元")) return <><path {...st} d="M10 12 l6-4 4 10 4-10 6 4 -2 22 h-16 z" /><path {...st} d="M16 8 l4 10 4-10" /></>; // Vネック
    if (label.includes("ハリ") || label.includes("ツヤ") || label.includes("上質")) return <><path {...st} d="M12 10 h16 l2 24 h-20 z" /><path {...st} d="M26 14 l4-4 M28 20 l4-2" /></>; // 光沢トップス
    if (label.includes("フリル") || label.includes("ティアード") || label.includes("ギャザー")) return <><path {...st} d="M12 8 h16 v8 q-4 3 -8 0 q-4 3 -8 0 z" /><path {...st} d="M11 20 q5 4 9 0 q5 4 9 0 M10 28 q6 4 10 0 q6 4 10 0" /></>; // 段々フリル
    if (label.includes("ふんわり") || label.includes("シフォン") || label.includes("ソフト素材")) return <><path {...st} d="M13 12 q7-6 14 0 q4 8 -2 20 h-10 q-6-12 -2-20 z" /><path {...st} d="M16 18 q4 2 8 0" opacity="0.5" /></>; // ふわトップス
    if (label.includes("短め") || label.includes("コンパクト")) return <path {...st} d="M12 10 h16 l2 4 v10 h-20 v-10 z" />; // ショート丈
    if (label.includes("ロング") || label.includes("ドロップ")) return <><path {...st} d="M10 10 h20 l3 6 -4 2 v18 h-18 v-18 l-4-2 z" /></>; // ロング＆落ち肩
    if (label.includes("ゆったり") || label.includes("リラックス") || label.includes("オーバーサイズ") || label.includes("ビッグ") || label.includes("着られ感")) return <path {...st} d="M8 12 h24 l4 8 -5 2 v14 h-22 v-14 l-5-2 z" />; // ワイドトップス
    if (label.includes("リネン") || label.includes("ざっくり") || label.includes("天然")) return <><path {...st} d="M12 10 h16 v24 h-16 z" /><path {...st} d="M12 16 h16 M12 22 h16 M12 28 h16" opacity="0.5" /></>; // 編み目
    if (label.includes("大ぶり") || label.includes("アクセ") || label.includes("小物")) return <><circle {...st} cx="20" cy="24" r="8" /><path {...st} d="M20 10 v6" /></>; // ピアス
    if (label.includes("ローウエスト")) return <><path {...st} d="M13 8 h14 l2 20 h-18 z" /><path {...st} d="M14 24 h12" /></>; // 低ウエスト
    if (label.includes("重く") || label.includes("硬い")) return <><rect {...st} x="12" y="10" width="16" height="24" rx="1" /><path {...st} d="M12 18 h16" /></>; // 重素材
    if (label.includes("薄手") || label.includes("ふにゃ")) return <path {...st} d="M12 12 q4 4 0 8 q4 4 0 8 q4 4 0 6 M20 10 q4 4 0 8 q4 4 0 8 q4 4 0 8 M28 12 q4 4 0 8 q4 4 0 8 q4 4 0 6" />; // よれ素材
    if (label.includes("ピタピタ") || label.includes("タイト")) return <path {...st} d="M15 8 h10 l1 6 -2 4 2 16 h-12 l2-16 -2-4 z" />; // タイト
    if (label.includes("華奢")) return <><circle {...st} cx="20" cy="26" r="4" /><path {...st} d="M20 12 v10" /></>; // 細アクセ
    return <path {...st} d="M20 8 q0 4 4 4 h4 l-8 6 -8-6 h4 q4 0 4-4 M12 18 l8 6 8-6 v16 h-16 z" />; // 汎用ハンガー服
  };
  return <svg viewBox="0 0 40 44" className="w-9 h-10 shrink-0">{pick()}</svg>;
}

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

function QuizIllust({ illust, aLabel, bLabel, onPick }) {
  if (!illust) return null;
  return (
    <div className="flex gap-3 mb-5">
      {[["A", illust.left, aLabel], ["B", illust.right, bLabel]].map(([tag, v, label]) => (
        <button key={tag} onClick={() => onPick && onPick(tag)} className="flex-1 rounded-2xl p-3 text-center transition-all hover:shadow-md active:scale-95" style={{ border: "1px solid " + C.line, background: "#fdfcfd", cursor: onPick ? "pointer" : "default" }}>
          <span className="block text-sm font-bold mb-1" style={{ color: C.main }}>{tag}</span>
          <IllustHalf kind={illust.kind} v={v} />
          <span className="block text-[10px] mt-1 leading-tight" style={{ color: C.sub }}>{label}</span>
        </button>
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
  const cardX = 80, cardY = 200, cardW = W - 160, cardH = 1640, r = 48;
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

  // 3軸バー（行間を詰めてカタログ領域を確保）
  const rows = [
    ["色相", axes.hue], ["明度", axes.value], ["彩度", axes.chroma],
  ];
  let by = cardY + 770;
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
    by += 118;
  });

  // ⑥ 似合うコーデ3点＋コスメ1点（枠内固定レイアウト・フッターと衝突しない）
  const catalogSkus = SKUS[RT.site].slice(0, 3);
  const catalogCosme = (COSME[RT.key] || [])[0];
  const cleanName = (t) => t.replace(/【[^】]*】/g, "").replace(/^(ブルベ夏\/ブルベ冬服|ブルベ夏服|ブルベ冬服|イエベ春\/イエベ秋服|イエベ春服|イエベ秋服)[\s　]*/, "").trim();
  const truncate = (t, n) => (t.length > n ? t.slice(0, n) + "…" : t);
  let cy = cardY + 1130;
  ctx.textAlign = "left";
  ctx.fillStyle = RT.accent; ctx.font = "600 40px sans-serif";
  ctx.fillText("似合うアイテム", barX, cy);
  cy += 58;
  catalogSkus.forEach((sku) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#3a3340"; ctx.font = "500 32px sans-serif";
    ctx.fillText("・" + truncate(cleanName(sku.name), 16), barX, cy);
    ctx.textAlign = "right";
    ctx.fillStyle = "#a99fa8"; ctx.font = "30px sans-serif";
    ctx.fillText("¥" + sku.price.toLocaleString(), barX + barW, cy);
    cy += 50;
  });
  if (catalogCosme) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#3a3340"; ctx.font = "500 32px sans-serif";
    ctx.fillText("・" + truncate(catalogCosme.name, 16) + "（コスメ）", barX, cy);
  }

  // フッター（カード下端から逆算・CTAをアクセント色ピルで強調）
  ctx.textAlign = "center";
  const ctaW = 640, ctaH = 96, ctaX = W / 2 - ctaW / 2, ctaY = cardY + cardH - 210;
  ctx.fillStyle = RT.accent;
  ctx.beginPath(); ctx.roundRect(ctaX, ctaY, ctaW, ctaH, 48); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.font = "700 48px sans-serif";
  ctx.fillText("あなたも診断してみて ♡", W / 2, ctaY + 64);
  ctx.fillStyle = "#a99fa8"; ctx.font = "36px sans-serif";
  ctx.fillText(RT.sns + "  |  " + RT.siteName, W / 2, cardY + cardH - 55);

  ctx.fillStyle = "#b3aab2"; ctx.font = "32px sans-serif";
  ctx.fillText("#パーソナルカラー診断 #" + RT.name, W / 2, H - 40);
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
// コーデ提案：シーン別 勝ち色マスター
// BLUBEL/IEBEL のシーン別記事22本（42_{BLUBEL,IEBEL}_scene_articles_20260822.csv）から
// 機械抽出したデータ。AIで文章を作らず、この実データだけを組み立てて提案を返す。
//   n=シーン名 / e=効果 / l=記事のリード文 / w=勝ち色[名前,効果] / g=NG色[名前,効果]
//   s=記事の推奨SKU id（SKUS に在庫がある場合のみ採用） / sn=そのSKUの一言
// ════════════════════════════════════════════
const STYLING_DATA = {
  blubel: {
    jobhunt: [
      { n: "最初の面接", e: "顔が明るく見える襟元色", l: "第一印象は数秒で決まり、その一瞬に面接官の目へ入るのは顔と襟元の色。ブルベ肌に黄みの白が来ると影とくすみが出て、青みの白なら透明感と血色が戻ります。", w: { summer: [["青みオフ白", "影が飛ぶ"], ["アイスラベンダー", "透明感"], ["ペールブルー", "清潔感"], ["ソフトグレー", "穏やか"], ["ローズミスト", "血色"]], winter: [["純白", "輪郭が締まる"], ["アイスブルー", "目力"], ["クールグレー", "信頼感"], ["アイスピンク", "華やか"], ["ミントホワイト", "個性"]] }, g: { summer: [["クリーム白", "黄ぐすみ"], ["生成り", "疲れ顔"]], winter: [["クリーム白", "白さが濁る"], ["ベージュ", "印象が弱い"]] } },
      { n: "リクルートスーツ", e: "黒ではなく、自分の紺", l: "「就活=黒」は思い込み。ブルベさんの多くは真っ黒より紺のほうが顔が明るく見えます。黒は光を吸って影を作り、特に夏タイプは黒に着られがち。", w: { summer: [["ソフトネイビー", "黒より軽い"], ["チャコールグレー", "肌がやわらぐ"], ["グレイッシュブルー", "上品"], ["ミディアムグレー", "知的"], ["ダークグレー", "締まる"]], winter: [["ダークネイビー", "意思の強さ"], ["ブラック", "冬の武器"], ["濃紺", "誠実"], ["チャコール(冷)", "シャープ"], ["ダークグレー(冷)", "クール"]] }, g: { summer: [["真っ黒単体", "影を作る"], ["黄み茶", "顔がくすむ"]], winter: [["黄み茶", "くすむ"], ["ベージュ", "印象が弱い"]] } },
      { n: "証明写真", e: "タイプに合う白\"。白は1色じゃない", l: "証明写真は対面より色の影響が強く出ます。カメラの強い光が服の色を肌へ反射させるため、黄みの白は黄ぐすみを顔に返し、青み白は影を飛ばして明るく写します。夏=青みオフ白、冬=純白。", w: { summer: [["青みオフ白", "影が飛ぶ"], ["ペールブルー", "涼しげ"], ["アイスラベンダー", "透明感"], ["ソフトグレー白", "穏やか"], ["ローズ白", "血色"]], winter: [["純白", "輪郭が締まる"], ["アイスブルー白", "目力"], ["クールグレー白", "信頼"], ["アイスピンク白", "華やか"], ["ブルーホワイト", "冴える"]] }, g: { summer: [["クリーム白", "黄ぐすみ"], ["生成り", "疲れ顔"]], winter: [["クリーム白", "濁る"], ["アイボリー", "ぼやける"]] } },
      { n: "面接メイク", e: "黒スーツが吸った血色を戻すコスメ色", l: "見落とされがちですが、黒・紺のスーツは顔の血色を吸います。だから面接メイクは「盛る」より「スーツに吸われた血色を色で戻す」のが正解。ブルベさんは青みの血色色が肌になじみます。", w: { summer: [["ローズピンク", "自然な血色"], ["ローズベージュ", "上品"], ["モーヴ", "知的な陰影"], ["プラムピンク", "華やか"], ["ソフトレッド", "顔色UP"]], winter: [["ローズレッド", "はっきり血色"], ["フューシャ", "華やか"], ["ワインレッド", "深み"], ["クリアレッド", "目力"], ["プラム", "品"]] }, g: { summer: [["オレンジチーク", "黄ぐすみ"], ["コーラルリップ", "浮く"]], winter: [["コーラル", "浮く"], ["オレンジ", "黄ぐすみ"]] } },
      { n: "面接の髪色", e: "暗くても地毛に馴染むトーン", l: "就活は暗髪が基本ですが、真っ黒に染め直す必要はありません。大事なのは肌との相性。ブルベさんはアッシュ・ブルーブラック系の青みのある暗髪が肌の透明感を引き立てます。", w: { summer: [["ブルーブラック", "透明感"], ["アッシュ暗髪", "肌が澄む"], ["ダークアッシュ茶", "なじむ"], ["グレージュ暗め", "柔らか"], ["ソフトブラック", "自然"]], winter: [["ブルーブラック", "肌が際立つ"], ["漆黒", "目力"], ["ダークアッシュ", "シャープ"], ["ブルーグレー暗髪", "冴える"], ["クールブラック", "締まる"]] }, g: { summer: [["黄みブラウン", "くすむ"], ["オレンジ茶", "黄ばむ"]], winter: [["黄みブラウン", "くすむ"], ["キャメル茶", "浮く"]] } },
      { n: "最終面接・プレゼン", e: "記憶に残る一点", l: "一次面接は減点回避、最終面接やグループプレゼンは印象に残ることが加点になります。ブルベさんは差し色を顔まわりに一点だけ。夏=スカイブルー、冬=ボルドー/ロイヤルブルー。", w: { summer: [["スカイブルー", "清潔感"], ["ラベンダー", "知的"], ["ローズピンク", "華やか"], ["グレイッシュブルー", "落ち着き"], ["モーヴ", "大人"]], winter: [["ボルドー", "記憶に残る"], ["ロイヤルブルー", "目力"], ["ショッキングピンク", "華やか"], ["ワインパープル", "高貴"], ["クリアグリーン", "冴える"]] }, g: { summer: [["オレンジ", "浮く"], ["マスタード", "黄ばむ"]], winter: [["くすみオレンジ", "浮く"], ["黄緑", "ぼやける"]] } },
    ],
    business: [
      { n: "初回商談・謝罪", e: "誠実に見える色", l: "初回商談や謝罪の場は、何より誠実さが伝わることが大切。色彩心理でネイビー・グレーが誠実・堅実を伝えます。そこに顔映えを重ねるのが正解です。", w: { summer: [["ソフトネイビー", "誠実"], ["チャコール", "堅実"], ["青みオフ白", "清潔感"], ["グレイッシュブルー", "落ち着き"], ["ペールブルー", "信頼"]], winter: [["ダークネイビー", "誠実"], ["純白", "清潔"], ["濃紺", "堅実"], ["クールグレー", "冷静"], ["アイスブルー", "知的"]] }, g: { summer: [["オレンジ", "軽い印象"], ["黄みベージュ", "ぼやける"]], winter: [["キャメル", "締まらない"], ["黄み茶", "くすむ"]] } },
      { n: "プレゼン・提案", e: "記憶に残る一点", l: "提案やプレゼンで全身を無難にまとめると記憶に残りません。顔まわりに一点だけ、印象に残る色を置くと視線が集まり話が届きます。", w: { summer: [["スカイブルー", "爽やか"], ["ロイヤルブルー", "自信"], ["ラベンダー", "知的"], ["モーヴ", "華やか"], ["グレイッシュブルー", "落ち着き"]], winter: [["ボルドー", "記憶に残る"], ["ロイヤルブルー", "自信"], ["クリアグリーン", "冴える"], ["ワインパープル", "高貴"], ["ショッキングピンク", "印象的"]] }, g: { summer: [["オレンジ", "チープ"], ["マスタード", "浮く"]], winter: [["くすみオレンジ", "浮く"], ["ベージュ", "印象薄"]] } },
      { n: "社内会議・日常", e: "調和する色", l: "社内会議や日常業務では、浮かず沈まず〈調和〉する色が信頼を積み上げます。派手さより安定感です。", w: { summer: [["チャコール", "調和"], ["ソフトグレー", "穏やか"], ["ラベンダー", "柔らか"], ["青みオフ白", "清潔"], ["グレイッシュブルー", "落ち着き"]], winter: [["クールグレー", "冷静"], ["ダークネイビー", "安定"], ["純白", "清潔"], ["アイスブルー", "知的"], ["チャコール(冷)", "締まる"]] }, g: { summer: [["オレンジ", "浮く"], ["黄み茶", "くすむ"]], winter: [["黄み茶", "くすむ"], ["ベージュ", "弱い"]] } },
      { n: "オンライン会議", e: "画面で沈まない色", l: "オンライン会議は画面越しに彩度が落ち、暗い色は顔まで沈みます。対面より一段明るくはっきりした色で顔の位置を明るく保ちます。", w: { summer: [["ロイヤルブルー", "画面映え"], ["スカイブルー", "明るい"], ["ローズピンク", "血色"], ["純白", "顔が明るい"], ["ラベンダー", "柔らか"]], winter: [["ロイヤルブルー", "画面映え"], ["ボルドー", "はっきり"], ["ショッキングピンク", "血色"], ["純白", "顔が明るい"], ["クリアグリーン", "冴える"]] }, g: { summer: [["暗いグレー", "顔が沈む"], ["黒", "重い"]], winter: [["暗い茶", "顔が沈む"], ["グレー", "ぼやける"]] } },
      { n: "交渉ごと", e: "主導権を握る色", l: "交渉ごとでは、相手に主導権を渡さない意思の強さが必要。深く冴えた色が背筋を伸ばし、説得力を底上げします。", w: { summer: [["ソフトネイビー", "意思"], ["ダークグレー", "冷静"], ["グレイッシュブルー", "落ち着き"], ["モーヴ", "品格"], ["チャコール", "堅実"]], winter: [["ダークネイビー", "主導権"], ["ブラック", "意思の強さ"], ["ボルドー", "貫禄"], ["ワインパープル", "高貴"], ["濃紺", "誠実"]] }, g: { summer: [["淡いピンク", "弱い"], ["クリーム", "頼りない"]], winter: [["ベージュ", "弱い"], ["淡い茶", "頼りない"]] } },
    ],
    konkatsu: [
      { n: "お見合い・初対面", e: "清潔感と品が伝わる色", l: "お見合いや初対面は、第一印象が全て。派手さより「清潔感・品・優しさ」が伝わる色が、また会いたいと思わせます。", w: { summer: [["ラベンダー", "上品"], ["青みオフ白", "清潔感"], ["ローズピンク", "優しさ"], ["スカイブルー", "爽やか"], ["ソフトグレー", "落ち着き"]], winter: [["純白", "清楚"], ["アイスブルー", "知的"], ["ローズレッド", "華やか"], ["アイスピンク", "柔らか"], ["クールグレー", "品"]] }, g: { summer: [["オレンジ", "派手すぎ"], ["マスタード", "老け見え"]], winter: [["キャメル", "ぼやける"], ["黄み茶", "くすむ"]] } },
      { n: "婚活パーティー", e: "埋もれない華やかさの色", l: "婚活パーティーは大勢の中で埋もれないことが第一。顔まわりに華やかな色を置いて、視線を集めましょう。", w: { summer: [["ローズピンク", "華やか"], ["ラベンダー", "上品"], ["モーヴ", "大人可愛い"], ["スカイブルー", "爽やか"], ["プラムピンク", "血色"]], winter: [["ショッキングピンク", "目を引く"], ["ボルドー", "華やか"], ["ロイヤルブルー", "目力"], ["ワインパープル", "高貴"], ["ローズレッド", "血色"]] }, g: { summer: [["地味グレー", "埋もれる"], ["黒単体", "暗い"]], winter: [["暗い茶", "埋もれる"], ["グレー", "地味"]] } },
      { n: "デート", e: "親しみと女性らしさの色", l: "デートでは親しみやすさと女性らしさを。やわらかい色が「話しやすくて可愛い人」という印象を作ります。", w: { summer: [["ローズピンク", "可愛い"], ["ラベンダー", "優しい"], ["スカイブルー", "爽やか"], ["アイスピンク", "柔らか"], ["モーヴ", "大人"]], winter: [["アイスピンク", "甘い"], ["ローズレッド", "華やか"], ["純白", "清楚"], ["ロイヤルブルー", "爽やか"], ["ワインパープル", "上品"]] }, g: { summer: [["カーキ", "地味"], ["黄み茶", "重い"]], winter: [["カーキ", "地味"], ["茶", "重い"]] } },
      { n: "親への挨拶", e: "誠実で信頼される色", l: "親への挨拶は誠実さと信頼が命。落ち着いた色で「きちんとしたお嬢さん」という安心感を伝えます。", w: { summer: [["ソフトネイビー", "誠実"], ["青みオフ白", "清潔"], ["ラベンダー", "上品"], ["ソフトグレー", "落ち着き"], ["ローズミスト", "柔らか"]], winter: [["ダークネイビー", "誠実"], ["純白", "清潔"], ["クールグレー", "品"], ["アイスブルー", "知的"], ["アイスピンク", "柔らか"]] }, g: { summer: [["派手ピンク", "軽い"], ["オレンジ", "派手"]], winter: [["派手ピンク", "軽い"], ["キャメル", "ぼやける"]] } },
      { n: "プロフィール写真", e: "写真で顔が明るく映える色", l: "マッチングアプリや婚活サイトの写真は、色の影響が対面より強く出ます。顔が明るく映える色で「会ってみたい」を引き出します。", w: { summer: [["ローズピンク", "血色"], ["青みオフ白", "明るい"], ["ラベンダー", "透明感"], ["スカイブルー", "爽やか"], ["アイスピンク", "柔らか"]], winter: [["純白", "明るい"], ["ローズレッド", "血色"], ["ロイヤルブルー", "目力"], ["アイスピンク", "柔らか"], ["ショッキングピンク", "華やか"]] }, g: { summer: [["黄みベージュ", "黄ぐすみ"], ["クリーム", "くすむ"]], winter: [["キャメル", "くすむ"], ["クリーム", "ぼやける"]] } },
    ],
    date: [
      { n: "初デート・昼カフェ", e: "清潔感と透明感の色", l: "初デートは頑張った感より清潔感。淡く澄んだ色が肌の透明感を最大化し、清潔感と親しみやすさを伝えます。", w: { summer: [["ラベンダー", "上品"], ["ローズピンク", "血色"], ["青みオフ白", "清潔感"], ["スカイブルー", "爽やか"], ["ソフトグレー", "落ち着き"]], winter: [["純白", "清楚"], ["アイスピンク", "柔らか"], ["アイスブルー", "知的"], ["ローズレッド", "華やか"], ["クールグレー", "品"]] }, g: { summer: [["オレンジ", "浮く"], ["黄みベージュ", "地味"]], winter: [["キャメル", "ぼやける"], ["黄み茶", "くすむ"]] }, s: 1582, sn: "ホワイト。フリルがレフ板になり昼カフェで肌が明るく見えます。" },
      { n: "夜ディナー", e: "照明で艶が出る色", l: "夜のレストランはオレンジがかった暖色照明。淡い色は黄ばみ、深い色は艶っぽく発色します。昼と同じ色を選ぶと〈ぼやけて見える〉ことがあります。", w: { summer: [["グレイッシュブルー", "艶"], ["モーヴ", "大人っぽい"], ["プラムピンク", "華やか"], ["ソフトネイビー", "上品"], ["ラベンダー", "知的"]], winter: [["ボルドー", "艶っぽい"], ["ブラック", "洗練"], ["ワインパープル", "高貴"], ["ロイヤルブルー", "目力"], ["ショッキングピンク", "華やか"]] }, g: { summer: [["淡いパステル全般", "ぼやける"], ["クリーム", "黄ばむ"]], winter: [["ベージュ", "地味"], ["淡い茶", "沈む"]] }, s: 2072, sn: "ブラック。夜の照明で艶やかに、抜け感も演出。" },
      { n: "映画館・水族館(暗所)", e: "顔が沈まない色", l: "暗い場所では中間色がすべて「なんとなく暗い色」に見えてしまいます。顔の位置を明るく保つ色を選ぶのがコツです。", w: { summer: [["スカイブルー", "明るい"], ["青みオフ白", "顔が浮く"], ["ローズピンク", "血色"], ["ラベンダー", "柔らか"], ["ペールブルー", "涼しげ"]], winter: [["純白", "明るい"], ["ロイヤルブルー", "目力"], ["アイスブルー", "冴える"], ["ショッキングピンク", "華やか"], ["アイスピンク", "柔らか"]] }, g: { summer: [["暗いグレー", "顔が沈む"], ["黒", "重い"]], winter: [["暗い茶", "顔が沈む"], ["グレー", "ぼやける"]] }, s: 1745, sn: "4色展開。歩くたびに揺れるフレアが照明で陰影を作ります。" },
      { n: "公園・お出かけ", e: "自然光で映える色", l: "公園や屋外は強い自然光。得意な色をいちばん美しく発色させてくれる、いわば〈本領発揮〉のシーンです。", w: { summer: [["スカイブルー", "爽やか"], ["ラベンダー", "可憐"], ["ローズピンク", "血色"], ["青みオフ白", "清潔感"], ["ペールブルー", "涼しげ"]], winter: [["ロイヤルブルー", "目力"], ["クリアグリーン", "冴える"], ["純白", "明るい"], ["ショッキングピンク", "華やか"], ["アイスブルー", "涼しげ"]] }, g: { summer: [["オレンジ", "浮く"], ["カーキ", "地味"]], winter: [["キャメル", "地味"], ["黄み茶", "くすむ"]] } },
      { n: "手つなぎ・写真に残るデート", e: "写真映えする色", l: "写真は対面より色の影響が強く出ます。カメラのホワイトバランスに負けない、顔がはっきり写る色を選びましょう。", w: { summer: [["ローズピンク", "可愛い写り"], ["ラベンダー", "透明感"], ["青みオフ白", "明るい"], ["スカイブルー", "爽やか"], ["アイスピンク", "柔らか"]], winter: [["純白", "明るい写り"], ["ボルドー", "艶やか"], ["ロイヤルブルー", "目力"], ["ショッキングピンク", "華やか"], ["ワインパープル", "上品"]] }, g: { summer: [["黄みベージュ", "黄ぐすみ"], ["クリーム", "くすむ"]], winter: [["キャメル", "くすむ"], ["クリーム", "ぼやける"]] } },
    ],
    partner: [
      { n: "知的・落ち着いた相手", e: "聡明さが伝わる色", l: "知的で落ち着いた相手には、派手さより聡明さが伝わる色が響きます。落ち着いたトーンで「話が合いそう」という安心感を先に作りましょう。", w: { summer: [["ソフトネイビー", "知的"], ["チャコール", "品格"], ["グレイッシュブルー", "落ち着き"], ["ラベンダー", "上品"], ["ソフトグレー", "穏やか"]], winter: [["ダークネイビー", "知的"], ["クールグレー", "品格"], ["純白", "清潔感"], ["ワインパープル", "高貴"], ["アイスブルー", "冴える"]] }, g: { summer: [["蛍光ピンク", "軽い"], ["オレンジ", "派手"]], winter: [["蛍光色全般", "軽い"], ["原色黄", "子供っぽい"]] }, s: 1993, sn: "ホワイト・ベージュ。知的な相手との会話に清潔感を。" },
      { n: "明るく社交的な相手", e: "華やかさで惹きつける色", l: "明るく社交的な相手には、あなたも華やかな一面を見せると相性の良さが伝わります。顔まわりに一段明るい色を。", w: { summer: [["ローズピンク", "華やか"], ["スカイブルー", "元気"], ["ラベンダー", "可愛い"], ["モーヴ", "大人可愛い"], ["プラムピンク", "血色"]], winter: [["ショッキングピンク", "華やか"], ["ロイヤルブルー", "目力"], ["ボルドー", "印象的"], ["クリアグリーン", "元気"], ["ワインパープル", "高貴"]] }, g: { summer: [["地味グレー", "埋もれる"], ["黒単体", "暗い"]], winter: [["暗い茶", "埋もれる"], ["グレー", "地味"]] }, s: 2028, sn: "9色展開。社交的な相手には明るい色をチョイス。" },
      { n: "年上・大人な相手", e: "落ち着きと余裕の色", l: "年上・大人な相手には、落ち着きと余裕を感じさせる深みのある色が効きます。子供っぽく見える原色・パステルの多用は避けて。", w: { summer: [["モーヴ", "大人"], ["グレイッシュブルー", "余裕"], ["チャコール", "品格"], ["ローズミスト", "柔らか"], ["ラベンダー", "上品"]], winter: [["ワインパープル", "大人"], ["ボルドー", "余裕"], ["ダークネイビー", "品格"], ["クールグレー", "落ち着き"], ["アイスピンク", "柔らか"]] }, g: { summer: [["原色系全般", "子供っぽい"], ["ビビッドオレンジ", "幼い"]], winter: [["原色系全般", "子供っぽい"], ["パステル過多", "幼い"]] }, s: 1315, sn: "4色展開。年上の相手には落ち着いた色で余裕を演出。" },
      { n: "年下・親しみやすさ重視の相手", e: "フレッシュで親しみやすい色", l: "年下・親しみやすさ重視の相手には、重すぎない爽やかな色でフラットな距離感を演出しましょう。", w: { summer: [["スカイブルー", "爽やか"], ["ローズピンク", "可愛い"], ["ラベンダー", "柔らか"], ["ペールブルー", "涼しげ"], ["アイスピンク", "親しみ"]], winter: [["純白", "爽やか"], ["アイスブルー", "涼しげ"], ["ショッキングピンク", "元気"], ["ロイヤルブルー", "フレッシュ"], ["アイスピンク", "可愛い"]] }, g: { summer: [["重い暗色全般", "堅い"], ["黒スーツ調", "距離感"]], winter: [["重い暗色全般", "堅い"], ["黒すぎる装い", "距離感"]] } },
    ],
    hair: [
      { n: "黒髪・暗髪", e: "コントラストで垢抜ける色", l: "顔にいちばん近い大きな色面は髪。黒髪さんは髪自体が強いので、服も強い色か白でコントラスト設計にすると輪郭が引き締まり垢抜けます。", w: { summer: [["青みオフ白", "輪郭が締まる"], ["ソフトネイビー", "上品"], ["ラベンダー", "華やか"], ["スカイブルー", "爽やか"], ["ローズピンク", "血色"]], winter: [["純白", "輪郭が締まる"], ["ロイヤルブルー", "目力"], ["ボルドー", "華やか"], ["ショッキングピンク", "印象的"], ["アイスブルー", "冴える"]] }, g: { summer: [["黄みベージュ", "顔だけ浮く"], ["クリーム", "くすむ"]], winter: [["キャメル", "地味"], ["黄み茶", "くすむ"]] }, s: 1315, sn: "4色展開。黒髪さんのコントラスト設計に。立ち襟で首を長く。" },
      { n: "アッシュ・グレージュ系暗髪", e: "同系グラデでつなぐ色", l: "アッシュ・グレージュ系の暗髪は、服も同系色でつなぐグラデーション設計が正解。全身に統一感が出て一気に洗練されます。", w: { summer: [["グレイッシュブルー", "同系"], ["ラベンダー", "つながる"], ["ソフトグレー", "統一感"], ["チャコール", "洗練"], ["モーヴ", "上品"]], winter: [["クールグレー", "同系"], ["アイスブルー", "つながる"], ["ワインパープル", "統一感"], ["ダークネイビー", "洗練"], ["アイスピンク", "柔らか"]] }, g: { summer: [["オレンジ", "浮く"], ["黄み茶", "喧嘩する"]], winter: [["黄み茶", "喧嘩する"], ["キャメル", "浮く"]] }, s: 1884, sn: "5色展開。アッシュ暗髪と同系のグレーでグラデーション。" },
      { n: "ボブ・ショート", e: "首元に情報がある色", l: "ボブ・ショートは首元が見える髪型。ハイネックやリボン襟など「首元に情報のある服」が映えます。", w: { summer: [["ローズピンク", "華やか首元"], ["ラベンダー", "上品襟"], ["青みオフ白", "清潔感"], ["スカイブルー", "爽やか"], ["ソフトグレー", "洗練"]], winter: [["純白", "清潔感"], ["ボルドー", "華やか首元"], ["ロイヤルブルー", "目力"], ["ショッキングピンク", "印象的"], ["クールグレー", "洗練"]] }, g: { summer: [["厚手ハイネック暗色", "重い"], ["黄みベージュタートル", "地味"]], winter: [["厚手ハイネック暗色", "重い"], ["キャメルタートル", "地味"]] }, s: 1993, sn: "ホワイト・ベージュ。ロングヘアの肌見せに。" },
      { n: "ロング・下ろし髪", e: "肌の面積を確保する色", l: "ロング・下ろし髪は顔まわりを覆う分、服はVネックや開襟で肌の面積を確保すると重たくなりません。", w: { summer: [["青みオフ白", "肌見せ"], ["ラベンダー", "抜け感"], ["ローズピンク", "柔らか"], ["スカイブルー", "涼しげ"], ["ソフトグレー", "上品"]], winter: [["純白", "肌見せ"], ["ロイヤルブルー", "抜け感"], ["ボルドー", "華やか"], ["アイスブルー", "涼しげ"], ["クールグレー", "上品"]] }, g: { summer: [["厚手ハイネック黄み", "もたつく"], ["カーキタートル", "地味"]], winter: [["厚手ハイネック黄み", "もたつく"], ["オリーブタートル", "地味"]] } },
    ],
    weather: [
      { n: "晴れの日", e: "自然光で淡色が最も美しく発色する色", l: "強くクリアな自然光は、得意な淡色や鮮やかな色をいちばん美しく発色させます。晴れの日は攻めた色を着る日です。", w: { summer: [["ラベンダー", "最高に発色"], ["ローズピンク", "血色"], ["スカイブルー", "爽やか"], ["青みオフ白", "清潔感"], ["ペールブルー", "涼しげ"]], winter: [["純白", "冴える"], ["ロイヤルブルー", "目力"], ["ショッキングピンク", "華やか"], ["アイスブルー", "涼しげ"], ["クリアグリーン", "冴える"]] }, g: { summer: [["暗い色全般", "もったいない"], ["黄み系", "くすむ"]], winter: [["中間色全般", "ぼやける"], ["黄み茶", "くすむ"]] }, s: 1662, sn: "6色展開。晴れの日は明るい色、雨の日はネイビーで血色を。" },
      { n: "曇りの日", e: "弱い光を顔に反射させる色", l: "曇りの光は青白く弱く、肌の影とくすみを強調します。顔の下に明るい色を置き、弱い光を顔へ反射させるのがコツです。", w: { summer: [["青みオフ白", "レフ板効果"], ["ライトグレー", "反射"], ["ペールブルー", "明るく見える"], ["ラベンダー", "立体感"], ["ソフトグレー", "顔映え"]], winter: [["純白", "レフ板効果"], ["アイスブルー", "明るく見える"], ["クールグレー", "反射"], ["アイスピンク", "柔らか"], ["ミントホワイト", "個性"]] }, g: { summer: [["くすみ暗色", "のっぺり"], ["黄みベージュ", "くすむ"]], winter: [["くすみ暗色", "のっぺり"], ["キャメル", "くすむ"]] }, s: 1661, sn: "7色展開。曇りの日はホワイト/ライトグレーがレフ板効果。" },
      { n: "雨の日", e: "彩度で血色をひと足しする色", l: "雨の日は光量が落ち、淡い色はぼやけ、暗い色は重く沈みます。効くのは彩度のある色で、顔に血色や光をひと足しすることです。", w: { summer: [["ローズピンク", "血色"], ["スカイブルー", "冴える"], ["グレイッシュブルー", "上品"], ["ラベンダー", "華やか"], ["モーヴ", "艶"]], winter: [["ボルドー", "血色"], ["ロイヤルブルー", "冴える"], ["ショッキングピンク", "華やか"], ["ワインパープル", "艶"], ["クリアグリーン", "目立つ"]] }, g: { summer: [["淡すぎる色全般", "ぼやける"], ["生成り", "沈む"]], winter: [["淡すぎる色全般", "ぼやける"], ["ベージュ", "沈む"]] }, s: 2028, sn: "9色展開。天気で色だけ差し替える運用に。" },
      { n: "真夏の強い日差し", e: "涼しげさが伝わる色", l: "強い日差しの日は、色そのものが持つ\"体感温度\"も印象を左右します。涼しげ・元気さが伝わる色で季節感を演出しましょう。", w: { summer: [["スカイブルー", "涼しげ"], ["青みオフ白", "清涼感"], ["ラベンダー", "爽やか"], ["ペールブルー", "涼しい"], ["ミントホワイト", "個性"]], winter: [["純白", "清涼感"], ["アイスブルー", "涼しげ"], ["クリアグリーン", "爽やか"], ["ロイヤルブルー", "冴える"], ["ミントホワイト", "涼しい"]] }, g: { summer: [["黒単体", "暑苦しい"], ["マスタード", "重い"]], winter: [["黒単体", "暑苦しい"], ["キャメル", "重い"]] } },
    ],
    ceremony: [
      { n: "結婚式のお呼ばれ", e: "主役を立てつつ華やぐ色", l: "結婚式は主役の花嫁を立てつつ、自分も華やかに祝う色を選ぶのがマナー。白は花嫁の色のため厳禁、黒一色のコーデもお祝いの場にはそぐいません。", w: { summer: [["ラベンダー", "上品な華やかさ"], ["ローズピンク", "お祝い感"], ["グレイッシュブルー", "上品"], ["モーヴ", "大人可愛い"], ["ペールブルー", "爽やか"]], winter: [["ワインパープル", "高貴"], ["ショッキングピンク", "華やか"], ["ロイヤルブルー", "目力"], ["ボルドー", "艶やか(色被り注意)"], ["アイスピンク", "柔らか"]] }, g: { summer: [["純白・白系全般", "花嫁の色でNG"], ["黒一色の喪服的コーデ", "お祝いの場にNG"]], winter: [["純白・白系全般", "花嫁の色でNG"], ["黒一色の喪服的コーデ", "お祝いの場にNG"]] }, s: 2072, sn: "ブラック。結婚式・法事どちらにも対応できるシルエット(アクセサリーで華やかさ調整)。" },
      { n: "お葬式・法要", e: "正式な喪服マナーの黒", l: "お葬式・法要は色選びに個人差の余地がありません。正式な喪服マナーに沿った黒(または濃紺・濃グレー)が絶対です。素材と光沢にも注意してください。", w: { summer: [["漆黒(喪服)", "マナー"], ["濃いネイビー(準喪服可)", "控えめ"], ["ダークグレー", "控えめ"], ["マットな黒", "上品"], ["黒に近い墨色", "マナー"]], winter: [["漆黒(喪服)", "マナー"], ["濃いネイビー(準喪服可)", "控えめ"], ["ダークグレー", "控えめ"], ["マットな黒", "上品"], ["黒に近い墨色", "マナー"]] }, g: { summer: [["光沢・パール素材の黒", "マナー違反"], ["柄物", "不適切"]], winter: [["光沢・パール素材の黒", "マナー違反"], ["柄物", "不適切"]] }, s: 1745, sn: "4色展開。結婚式のお呼ばれに華やかなネイビーやベージュを。" },
      { n: "七五三・入学式などの親の付き添い", e: "控えめだが上品な色", l: "七五三や入学式の付き添いは、主役はあくまで子供。控えめだけれど品のある色で、写真に写っても浮かない立ち位置を作ります。", w: { summer: [["ソフトネイビー", "上品控えめ"], ["グレイッシュブルー", "柔らかい"], ["ラベンダー", "華やかさ少量"], ["ソフトグレー", "品"], ["ペールブルー", "爽やか"]], winter: [["ダークネイビー", "上品控えめ"], ["クールグレー", "柔らかい"], ["アイスピンク", "華やかさ少量"], ["純白", "清潔"], ["アイスブルー", "品"]] }, g: { summer: [["真っ黒フルコーデ", "主役の子より目立つ喪主的"], ["派手な原色", "子供の日に不適切"]], winter: [["真っ黒フルコーデ", "主役の子より目立つ"], ["派手な原色", "不適切"]] }, s: 1280, sn: "3色展開。法事・法要にも使えるブラック。落ち着いた印象。" },
    ],
    shoubu: [
      { n: "資格試験・面接試験の証明写真", e: "顔色が悪く写らない色", l: "証明写真は対面より色の影響が強く出ます。試験・資格の顔写真で損をしないよう、顔色が明るく見える色のインナーを選びましょう。", w: { summer: [["青みオフ白", "影が飛ぶ"], ["アイスラベンダー", "透明感"], ["ペールブルー", "清潔感"], ["ソフトグレー", "穏やか"], ["ローズミスト", "血色"]], winter: [["純白", "輪郭が締まる"], ["アイスブルー", "目力"], ["クールグレー", "信頼感"], ["アイスピンク", "華やか"], ["ミントホワイト", "個性"]] }, g: { summer: [["クリーム白", "黄ぐすみ"], ["生成り", "疲れ顔"]], winter: [["クリーム白", "白さが濁る"], ["ベージュ", "印象が弱い"]] }, s: 1993, sn: "ホワイト・ベージュ。証明写真の主力。首元すっきり。" },
      { n: "大勢の前でのプレゼン・発表会", e: "遠くからでも視線を集める色", l: "大勢の前でのプレゼンや発表会は、遠目からでも視線を集める色が武器になります。全身を無難にまとめると記憶に残りません。", w: { summer: [["スカイブルー", "目立つ"], ["ラベンダー", "印象的"], ["ローズピンク", "華やか"], ["グレイッシュブルー", "品格"], ["モーヴ", "記憶に残る"]], winter: [["ボルドー", "記憶に残る"], ["ロイヤルブルー", "目力"], ["ショッキングピンク", "目立つ"], ["ワインパープル", "高貴"], ["クリアグリーン", "冴える"]] }, g: { summer: [["薄すぎる色全般", "埋もれる"], ["生成り", "印象薄"]], winter: [["薄すぎる色全般", "埋もれる"], ["ベージュ", "印象薄"]] }, s: 2129, sn: "5色展開。プレゼン・発表会はボルドーで記憶に残す。" },
      { n: "受験・試験当日", e: "緊張を和らげ集中力を高める色", l: "受験や試験当日は、気を散らさず集中力を保つ色を。刺激の強い原色は緊張や興奮を煽るため避け、落ち着いた色で自分をコントロールしましょう。", w: { summer: [["グレイッシュブルー", "冷静"], ["ソフトグレー", "落ち着き"], ["ラベンダー", "リラックス"], ["ソフトネイビー", "集中力"], ["ペールブルー", "冷静"]], winter: [["クールグレー", "冷静"], ["ダークネイビー", "集中力"], ["アイスブルー", "リラックス"], ["純白", "クリア"], ["チャコール(冷)", "落ち着き"]] }, g: { summer: [["刺激的な原色全般", "気が散る"], ["蛍光色", "落ち着かない"]], winter: [["刺激的な原色全般", "気が散る"], ["蛍光色", "落ち着かない"]] }, s: 1736, sn: "ダークブルー。昇進面談・節目の場に。" },
      { n: "昇進・キャリアの節目の面談", e: "自信と実力が伝わる色", l: "昇進やキャリアの節目の面談では、自信と実力が伝わる深みのある色が説得力を底上げします。", w: { summer: [["ソフトネイビー", "自信"], ["チャコール", "実力"], ["グレイッシュブルー", "説得力"], ["モーヴ", "貫禄"], ["ダークグレー", "締まる"]], winter: [["ダークネイビー", "自信"], ["ブラック", "実力"], ["ボルドー", "貫禄"], ["ワインパープル", "高貴"], ["濃紺", "説得力"]] }, g: { summer: [["淡い色全般", "頼りない"], ["パステルベージュ", "弱い"]], winter: [["淡い色全般", "頼りない"], ["パステルベージュ", "弱い"]] } },
    ],
    age: [
      { n: "20代", e: "フレッシュさを最大化する色", l: "20代はフレッシュさが最大の武器。明るく澄んだ色をためらわず着ることで、若さと元気が最大限に活きます。重すぎる色は年齢より老けて見えるので注意。", w: { summer: [["スカイブルー", "フレッシュ"], ["ローズピンク", "可愛い"], ["ラベンダー", "華やか"], ["ペールブルー", "爽やか"], ["アイスピンク", "柔らか"]], winter: [["ロイヤルブルー", "元気"], ["ショッキングピンク", "華やか"], ["純白", "フレッシュ"], ["クリアグリーン", "爽やか"], ["アイスブルー", "涼しげ"]] }, g: { summer: [["重すぎる暗色全般", "老けて見える"], ["茶系フルコーデ", "地味"]], winter: [["重すぎる暗色全般", "老けて見える"], ["茶系フルコーデ", "地味"]] }, s: 1662, sn: "6色展開。20代はビビッドな色、30代以降は落ち着いた色を。" },
      { n: "30代", e: "きちんと感と抜け感のバランス色", l: "30代はきちんと感と抜け感のバランスが鍵。子供っぽい原色は避けつつ、大人の余裕を感じさせる色を選びましょう。", w: { summer: [["ソフトネイビー", "きちんと感"], ["グレイッシュブルー", "抜け感"], ["モーヴ", "大人可愛い"], ["ラベンダー", "上品"], ["チャコール", "洗練"]], winter: [["ダークネイビー", "きちんと感"], ["ワインパープル", "大人っぽい"], ["クールグレー", "抜け感"], ["ボルドー", "艶"], ["アイスブルー", "洗練"]] }, g: { summer: [["子供っぽい原色全般", "幼く見える"], ["キャラクター的な柄", "TPOに合わない"]], winter: [["子供っぽい原色全般", "幼く見える"], ["蛍光色", "浮く"]] }, s: 1315, sn: "4色展開。30代のきちんと感と抜け感のバランスに。" },
      { n: "40代以降", e: "上質さと落ち着きが伝わる色", l: "40代以降は上質さと落ち着きが武器になります。若作りに見える蛍光色・過度なパステルより、深みのある色が年齢を魅力に変えます。", w: { summer: [["チャコール", "上質"], ["グレイッシュブルー", "洗練"], ["モーヴ", "品格"], ["ソフトグレー", "落ち着き"], ["ラベンダー(控えめ)", "上品"]], winter: [["ダークネイビー", "上質"], ["ワインパープル", "品格"], ["クールグレー", "洗練"], ["ボルドー(控えめ)", "落ち着き"], ["チャコール(冷)", "上質"]] }, g: { summer: [["安っぽく見える蛍光色", "若作り感"], ["過度なパステル", "子供っぽい"]], winter: [["安っぽく見える蛍光色", "若作り感"], ["過度なパステル", "子供っぽい"]] }, s: 2028, sn: "9色展開。年代に合わせて色だけ差し替える運用に。" },
    ],
  },
  iebel: {
    jobhunt: [
      { n: "最初の面接", e: "顔が明るく見える襟元色", l: "第一印象は数秒で決まり、その一瞬に面接官の目へ入るのは顔と襟元の色。イエベ肌に青みの白が来ると顔が青ざめてくすみ、黄みのアイボリーなら血色と健康的な明るさが戻ります。", w: { spring: [["アイボリー", "なじむ"], ["ライトベージュ", "健康的"], ["ピーチ白", "血色"], ["クリームアイボリー", "優しい"], ["ウォームホワイト", "明るい"]], autumn: [["リッチアイボリー", "上品"], ["キャメルベージュ", "艶が出る"], ["ウォームベージュ", "安心感"], ["オークル白", "なじむ"], ["ゴールドアイボリー", "華やか"]] }, g: { spring: [["青み白", "顔が青む"], ["純白(冷)", "浮く"]], autumn: [["青み白", "浮く"], ["アイスブルー", "青む"]] } },
      { n: "リクルートスーツ", e: "黒ではなく、自分の色", l: "「就活=黒」は思い込み。イエベさんは真っ黒より紺やブラウンのほうが顔が明るく見えます。黒は青ざめさせ、特に秋タイプは黒に着られがち。", w: { spring: [["ブライトネイビー", "明るい紺"], ["ウォームグレー", "柔らか"], ["ベージュブラウン", "なじむ"], ["ミディアムブラウン", "上品"], ["カーキブラウン", "こなれ"]], autumn: [["ダークブラウン", "信頼感"], ["ダークネイビー", "誠実"], ["チョコレート", "深み"], ["カーキ", "こなれ"], ["濃キャメル", "艶"]] }, g: { spring: [["真っ黒", "浮く"], ["青みグレー", "くすむ"]], autumn: [["真っ黒", "浮く"], ["青みグレー", "くすむ"]] } },
      { n: "証明写真", e: "タイプに合う白\"。白は1色じゃない", l: "証明写真は対面より色の影響が強く出ます。カメラの光が服の色を肌へ反射させるため、青み白は顔を青ざめさせ、アイボリー系は血色を返して健康的に写します。春=アイボリー、秋=リッチアイボリー。", w: { spring: [["アイボリー", "なじむ"], ["ピーチ白", "血色"], ["クリーム", "優しい"], ["ウォームホワイト", "明るい"], ["ライトベージュ白", "健康的"]], autumn: [["リッチアイボリー", "上品"], ["オークル白", "なじむ"], ["ウォームベージュ白", "安心"], ["ゴールドアイボリー", "華やか"], ["キャメル白", "艶"]] }, g: { spring: [["純白(冷)", "浮く"], ["青み白", "青む"]], autumn: [["純白(冷)", "浮く"], ["青み白", "青む"]] } },
      { n: "面接メイク", e: "黒スーツが吸った血色を戻すコスメ色", l: "黒・紺のスーツは顔の血色を吸います。だから面接メイクは「盛る」より「スーツに吸われた血色を色で戻す」のが正解。イエベさんは暖色の血色色が肌になじみます。", w: { spring: [["コーラル", "フレッシュ"], ["ピーチピンク", "血色"], ["アプリコット", "元気"], ["ウォームローズ", "華やか"], ["サーモン", "明るい"]], autumn: [["テラコッタ", "大人の血色"], ["ブリックレッド", "深み"], ["ウォームブラウンリップ", "上品"], ["オレンジブラウン", "こなれ"], ["レンガ", "艶"]] }, g: { spring: [["青みローズ", "浮く"], ["フューシャ", "冷える"]], autumn: [["青みピンク", "浮く"], ["ショッキングピンク", "冷える"]] } },
      { n: "面接の髪色", e: "暗くても地毛に馴染むトーン", l: "就活は暗髪が基本ですが、真っ黒に染め直す必要はありません。イエベさんはブラウン系の暗髪が肌になじみ、青みのブルーブラックはむしろ肌から浮きます。暗くするならブラウン寄りに。", w: { spring: [["ライトブラウン", "なじむ"], ["ゴールドブラウン", "明るい"], ["ミルクティー暗め", "柔らか"], ["キャラメル", "艶"], ["ウォームブラウン", "自然"]], autumn: [["ダークブラウン", "信頼"], ["チョコレート", "深み"], ["カカオブラウン", "上品"], ["マロン", "なじむ"], ["ディープキャメル", "艶"]] }, g: { spring: [["ブルーブラック", "硬い"], ["アッシュ", "青む"]], autumn: [["ブルーブラック", "硬い"], ["アッシュ", "青む"]] } },
      { n: "最終面接・プレゼン", e: "記憶に残る一点", l: "一次面接は減点回避、最終面接やグループプレゼンは印象に残ることが加点になります。イエベさんは差し色を顔まわりに一点だけ。春=イエロー/コーラル、秋=テラコッタ/マスタード。", w: { spring: [["コーラル", "フレッシュ"], ["イエロー", "明るい"], ["アプリコット", "元気"], ["ライトグリーン", "若々しい"], ["ピーチ", "華やか"]], autumn: [["テラコッタ", "記憶に残る"], ["マスタード", "こなれ"], ["カーキ", "大人"], ["ボルドー(黄)", "深み"], ["パンプキン", "艶"]] }, g: { spring: [["ボルドー(青)", "浮く"], ["ロイヤルブルー", "冷える"]], autumn: [["ショッキングピンク", "浮く"], ["ロイヤルブルー", "冷える"]] } },
    ],
    business: [
      { n: "初回商談・謝罪", e: "誠実に見える色", l: "初回商談や謝罪の場は、何より誠実さが伝わることが大切。色彩心理でネイビー・グレーが誠実・堅実を伝えます。そこに顔映えを重ねるのが正解です。", w: { spring: [["ブライトネイビー", "誠実"], ["ウォームグレー", "柔らか"], ["アイボリー", "清潔感"], ["ライトベージュ", "親しみ"], ["ミディアムブラウン", "堅実"]], autumn: [["ダークネイビー", "誠実"], ["ダークブラウン", "信頼"], ["リッチアイボリー", "清潔"], ["チョコレート", "堅実"], ["キャメルベージュ", "安心"]] }, g: { spring: [["青み白", "冷たい"], ["純白(冷)", "硬い"]], autumn: [["青み白", "冷たい"], ["クールグレー", "くすむ"]] } },
      { n: "プレゼン・提案", e: "記憶に残る一点", l: "提案やプレゼンで全身を無難にまとめると記憶に残りません。顔まわりに一点だけ、印象に残る色を置くと視線が集まり話が届きます。", w: { spring: [["コーラル", "熱意"], ["イエロー", "明るい"], ["アプリコット", "元気"], ["ライトグリーン", "爽やか"], ["ピーチ", "華やか"]], autumn: [["テラコッタ", "記憶に残る"], ["マスタード", "こなれ"], ["パンプキン", "印象的"], ["ボルドー(黄)", "貫禄"], ["カーキ", "大人"]] }, g: { spring: [["青みローズ", "浮く"], ["ショッキングピンク", "冷える"]], autumn: [["ショッキングピンク", "浮く"], ["ロイヤルブルー", "冷える"]] } },
      { n: "社内会議・日常", e: "調和する色", l: "社内会議や日常業務では、浮かず沈まず〈調和〉する色が信頼を積み上げます。派手さより安定感です。", w: { spring: [["ライトベージュ", "調和"], ["ウォームグレー", "穏やか"], ["アイボリー", "清潔"], ["ミディアムブラウン", "安定"], ["カーキブラウン", "こなれ"]], autumn: [["ダークブラウン", "安定"], ["キャメルベージュ", "安心"], ["リッチアイボリー", "清潔"], ["カーキ", "こなれ"], ["チョコレート", "締まる"]] }, g: { spring: [["青み白", "冷たい"], ["グレージュ", "くすむ"]], autumn: [["青み白", "冷たい"], ["クールグレー", "くすむ"]] } },
      { n: "オンライン会議", e: "画面で沈まない色", l: "オンライン会議は画面越しに彩度が落ち、暗い色は顔まで沈みます。対面より一段明るくはっきりした色で顔の位置を明るく保ちます。", w: { spring: [["コーラル", "画面映え"], ["イエロー", "明るい"], ["アプリコット", "血色"], ["アイボリー", "顔が明るい"], ["ピーチ", "華やか"]], autumn: [["テラコッタ", "画面映え"], ["マスタード", "はっきり"], ["リッチアイボリー", "顔が明るい"], ["パンプキン", "血色"], ["キャメル", "あたたかい"]] }, g: { spring: [["暗い茶", "顔が沈む"], ["黒", "重い"]], autumn: [["黒", "顔が沈む"], ["暗いグレー", "ぼやける"]] } },
      { n: "交渉ごと", e: "主導権を握る色", l: "交渉ごとでは、相手に主導権を渡さない意思の強さが必要。深く冴えた色が背筋を伸ばし、説得力を底上げします。", w: { spring: [["ブライトネイビー", "意思"], ["ミディアムブラウン", "貫禄"], ["カーキブラウン", "落ち着き"], ["ダークネイビー", "誠実"], ["ウォームグレー", "冷静"]], autumn: [["ダークブラウン", "主導権"], ["チョコレート", "貫禄"], ["ボルドー(黄)", "意思の強さ"], ["ダークネイビー", "誠実"], ["カカオ", "締まる"]] }, g: { spring: [["淡いピーチ", "弱い"], ["アイボリー", "頼りない"]], autumn: [["淡ベージュ", "弱い"], ["キャメル", "頼りない"]] } },
    ],
    konkatsu: [
      { n: "お見合い・初対面", e: "清潔感と品が伝わる色", l: "お見合いや初対面は、第一印象が全て。派手さより「清潔感・品・優しさ」が伝わる色が、また会いたいと思わせます。", w: { spring: [["ピーチピンク", "優しさ"], ["アイボリー", "清潔感"], ["コーラル", "血色"], ["ライトベージュ", "上品"], ["ライトグリーン", "爽やか"]], autumn: [["リッチアイボリー", "清楚"], ["テラコッタ", "華やか"], ["キャメルベージュ", "上品"], ["ウォームベージュ", "落ち着き"], ["ボルドー(黄)", "品"]] }, g: { spring: [["青み白", "冷たい"], ["ショッキングピンク", "派手"]], autumn: [["青み白", "冷たい"], ["クールグレー", "地味"]] } },
      { n: "婚活パーティー", e: "埋もれない華やかさの色", l: "婚活パーティーは大勢の中で埋もれないことが第一。顔まわりに華やかな色を置いて、視線を集めましょう。", w: { spring: [["コーラル", "華やか"], ["ピーチピンク", "可愛い"], ["イエロー", "明るい"], ["アプリコット", "元気"], ["サーモン", "血色"]], autumn: [["テラコッタ", "目を引く"], ["マスタード", "こなれ"], ["パンプキン", "華やか"], ["ボルドー(黄)", "高貴"], ["ブリックレッド", "血色"]] }, g: { spring: [["グレージュ", "埋もれる"], ["青み白", "冷たい"]], autumn: [["グレー", "埋もれる"], ["青み白", "冷たい"]] } },
      { n: "デート", e: "親しみと女性らしさの色", l: "デートでは親しみやすさと女性らしさを。やわらかい色が「話しやすくて可愛い人」という印象を作ります。", w: { spring: [["ピーチピンク", "可愛い"], ["コーラル", "血色"], ["アプリコット", "優しい"], ["ライトベージュ", "柔らか"], ["イエロー", "明るい"]], autumn: [["キャメル", "上品"], ["テラコッタ", "華やか"], ["ウォームベージュ", "柔らか"], ["マスタード", "こなれ"], ["ボルドー(黄)", "大人"]] }, g: { spring: [["青み白", "冷たい"], ["グレージュ", "地味"]], autumn: [["青み白", "冷たい"], ["クールグレー", "地味"]] } },
      { n: "親への挨拶", e: "誠実で信頼される色", l: "親への挨拶は誠実さと信頼が命。落ち着いた色で「きちんとしたお嬢さん」という安心感を伝えます。", w: { spring: [["ブライトネイビー", "誠実"], ["アイボリー", "清潔"], ["ライトベージュ", "上品"], ["ウォームグレー", "落ち着き"], ["ミディアムブラウン", "堅実"]], autumn: [["ダークブラウン", "誠実"], ["リッチアイボリー", "清潔"], ["ダークネイビー", "信頼"], ["キャメルベージュ", "安心"], ["チョコレート", "品"]] }, g: { spring: [["ショッキングピンク", "軽い"], ["青み白", "冷たい"]], autumn: [["ショッキングピンク", "軽い"], ["青み白", "冷たい"]] } },
      { n: "プロフィール写真", e: "写真で顔が明るく映える色", l: "マッチングアプリや婚活サイトの写真は、色の影響が対面より強く出ます。顔が明るく映える色で「会ってみたい」を引き出します。", w: { spring: [["コーラル", "血色"], ["アイボリー", "明るい"], ["ピーチピンク", "柔らか"], ["イエロー", "華やか"], ["アプリコット", "元気"]], autumn: [["リッチアイボリー", "明るい"], ["テラコッタ", "血色"], ["マスタード", "こなれ"], ["キャメル", "あたたかい"], ["パンプキン", "華やか"]] }, g: { spring: [["青み白", "顔が青む"], ["ショッキングピンク", "浮く"]], autumn: [["青み白", "顔が青む"], ["クールグレー", "くすむ"]] } },
    ],
    date: [
      { n: "初デート・昼カフェ", e: "清潔感と血色の色", l: "初デートは頑張った感より清潔感。淡く澄んだ色が肌の透明感を最大化し、清潔感と親しみやすさを伝えます。", w: { spring: [["コーラル", "血色"], ["ピーチピンク", "可愛い"], ["アイボリー", "清潔感"], ["アプリコット", "元気"], ["ライトベージュ", "柔らか"]], autumn: [["リッチアイボリー", "清楚"], ["テラコッタ", "華やか"], ["キャメルベージュ", "上品"], ["ウォームベージュ", "落ち着き"], ["マスタード", "こなれ"]] }, g: { spring: [["青み白", "冷たい"], ["グレージュ", "地味"]], autumn: [["青み白", "冷たい"], ["クールグレー", "地味"]] }, s: 1739, sn: "5色展開。リボンの甘さで話しかけやすい雰囲気に。" },
      { n: "夜ディナー", e: "暖色照明と好相性の色", l: "夜のレストランはオレンジがかった暖色照明。淡い色は黄ばみ、深い色は艶っぽく発色します。昼と同じ色を選ぶと〈ぼやけて見える〉ことがあります。", w: { spring: [["オレンジ", "艶っぽい"], ["ゴールドベージュ", "華やか"], ["コーラル", "血色"], ["アプリコット", "あたたかい"], ["イエロー", "明るい"]], autumn: [["テラコッタ", "艶っぽい"], ["ボルドー(黄)", "高貴"], ["ブリックレッド", "血色"], ["マスタード", "こなれ"], ["パンプキン", "華やか"]] }, g: { spring: [["青み白", "浮く"], ["ショッキングピンク", "冷える"]], autumn: [["青み白", "浮く"], ["クールグレー", "地味"]] }, s: 1676, sn: "5色展開。透け感が昼の光でふんわり発色。" },
      { n: "映画館・水族館(暗所)", e: "顔の位置を明るく保つ色", l: "暗い場所では中間色がすべて「なんとなく暗い色」に見えてしまいます。顔の位置を明るく保つ色を選ぶのがコツです。", w: { spring: [["アイボリー", "明るい"], ["イエロー", "華やか"], ["コーラル", "血色"], ["アプリコット", "元気"], ["ピーチ", "柔らか"]], autumn: [["リッチアイボリー", "明るい"], ["テラコッタ", "血色"], ["キャメル", "あたたかい"], ["マスタード", "はっきり"], ["パンプキン", "華やか"]] }, g: { spring: [["暗い茶", "顔が沈む"], ["黒", "重い"]], autumn: [["黒", "顔が沈む"], ["暗いグレー", "ぼやける"]] }, s: 1777, sn: "4色展開。夜はオレンジで艶っぽく。" },
      { n: "公園・お出かけ", e: "自然光で華やぐ色", l: "公園や屋外は強い自然光。得意な色をいちばん美しく発色させてくれる、いわば〈本領発揮〉のシーンです。", w: { spring: [["イエロー", "華やか"], ["コーラル", "血色"], ["ライトグリーン", "爽やか"], ["アプリコット", "元気"], ["ピーチ", "柔らか"]], autumn: [["テラコッタ", "華やか"], ["マスタード", "こなれ"], ["カーキ", "自然"], ["パンプキン", "印象的"], ["キャメル", "あたたかい"]] }, g: { spring: [["青み白", "浮く"], ["グレージュ", "地味"]], autumn: [["青み白", "浮く"], ["クールグレー", "地味"]] } },
      { n: "手つなぎ・写真に残るデート", e: "写真映えする色", l: "写真は対面より色の影響が強く出ます。カメラのホワイトバランスに負けない、顔がはっきり写る色を選びましょう。", w: { spring: [["コーラル", "可愛い写り"], ["アイボリー", "明るい"], ["ピーチピンク", "柔らか"], ["イエロー", "華やか"], ["アプリコット", "元気"]], autumn: [["リッチアイボリー", "明るい写り"], ["テラコッタ", "艶やか"], ["マスタード", "こなれ"], ["キャメル", "あたたかい"], ["パンプキン", "華やか"]] }, g: { spring: [["青み白", "顔が青む"], ["ショッキングピンク", "浮く"]], autumn: [["青み白", "顔が青む"], ["クールグレー", "くすむ"]] } },
    ],
    partner: [
      { n: "知的・落ち着いた相手", e: "聡明さが伝わる色", l: "知的で落ち着いた相手には、派手さより聡明さが伝わる色が響きます。落ち着いたトーンで「話が合いそう」という安心感を先に作りましょう。", w: { spring: [["ブライトネイビー", "知的"], ["ウォームグレー", "落ち着き"], ["ミディアムブラウン", "品格"], ["ライトベージュ", "穏やか"], ["カーキブラウン", "こなれ"]], autumn: [["ダークブラウン", "知的"], ["ダークネイビー", "品格"], ["リッチアイボリー", "清潔感"], ["チョコレート", "落ち着き"], ["キャメルベージュ", "上品"]] }, g: { spring: [["蛍光ピンク", "軽い"], ["青紫", "浮く"]], autumn: [["蛍光色全般", "軽い"], ["青紫", "浮く"]] }, s: 2025, sn: "ベージュ・ホワイト。知的な相手に清潔感を。" },
      { n: "明るく社交的な相手", e: "華やかさで惹きつける色", l: "明るく社交的な相手には、あなたも華やかな一面を見せると相性の良さが伝わります。顔まわりに一段明るい色を。", w: { spring: [["コーラル", "華やか"], ["イエロー", "元気"], ["アプリコット", "明るい"], ["ピーチピンク", "可愛い"], ["ライトグリーン", "爽やか"]], autumn: [["テラコッタ", "華やか"], ["マスタード", "印象的"], ["パンプキン", "元気"], ["ボルドー(黄)", "高貴"], ["ブリックレッド", "血色"]] }, g: { spring: [["グレージュ", "埋もれる"], ["青み白", "地味"]], autumn: [["グレー", "埋もれる"], ["青み白", "地味"]] }, s: 2060, sn: "9色展開。社交的な相手には明るい色を。" },
      { n: "年上・大人な相手", e: "落ち着きと余裕の色", l: "年上・大人な相手には、落ち着きと余裕を感じさせる深みのある色が効きます。子供っぽく見える原色・パステルの多用は避けて。", w: { spring: [["キャメル", "大人"], ["ウォームグレー", "余裕"], ["ミディアムブラウン", "品格"], ["ライトベージュ", "柔らか"], ["アプリコット", "上品"]], autumn: [["ダークブラウン", "大人"], ["ボルドー(黄)", "余裕"], ["チョコレート", "品格"], ["キャメルベージュ", "落ち着き"], ["マスタード", "こなれ"]] }, g: { spring: [["原色系全般", "子供っぽい"], ["ビビッド青", "幼い"]], autumn: [["原色系全般", "子供っぽい"], ["ビビッド青", "幼い"]] }, s: 2007, sn: "4色展開。年上の相手には落ち着いた色を。" },
      { n: "年下・親しみやすさ重視の相手", e: "フレッシュで親しみやすい色", l: "年下・親しみやすさ重視の相手には、重すぎない爽やかな色でフラットな距離感を演出しましょう。", w: { spring: [["コーラル", "爽やか"], ["イエロー", "フレッシュ"], ["ライトグリーン", "親しみ"], ["ピーチピンク", "可愛い"], ["アプリコット", "元気"]], autumn: [["リッチアイボリー", "爽やか"], ["パンプキン", "フレッシュ"], ["テラコッタ", "元気"], ["マスタード", "親しみ"], ["キャメル", "あたたかい"]] }, g: { spring: [["重い暗色全般", "堅い"], ["黒すぎる装い", "距離感"]], autumn: [["重い暗色全般", "堅い"], ["黒すぎる装い", "距離感"]] } },
    ],
    hair: [
      { n: "黒髪", e: "明るい暖色でコントラストを作る色", l: "顔にいちばん近い大きな色面は髪。黒髪さんは髪自体が強いので、服も強い色か白でコントラスト設計にすると輪郭が引き締まり垢抜けます。", w: { spring: [["アイボリー", "肌が軽くなる"], ["コーラル", "血色"], ["イエロー", "華やか"], ["ピーチピンク", "柔らか"], ["ライトベージュ", "清潔感"]], autumn: [["リッチアイボリー", "肌が軽くなる"], ["テラコッタ", "血色"], ["マスタード", "華やか"], ["キャメル", "あたたかい"], ["パンプキン", "印象的"]] }, g: { spring: [["青み白", "顔が浮く"], ["グレージュ", "地味"]], autumn: [["青み白", "顔が浮く"], ["クールグレー", "地味"]] }, s: 1739, sn: "5色展開。ボブさんの首元に華やかさを。" },
      { n: "ブラウンヘア", e: "同系グラデが黄金ゾーンの色", l: "アッシュ・グレージュ系の暗髪は、服も同系色でつなぐグラデーション設計が正解。全身に統一感が出て一気に洗練されます。", w: { spring: [["ライトベージュ", "同系"], ["アプリコット", "つながる"], ["ミディアムブラウン", "統一感"], ["キャメル", "調和"], ["ウォームグレー", "洗練"]], autumn: [["キャメルベージュ", "同系"], ["テラコッタ", "つながる"], ["ダークブラウン", "統一感"], ["マスタード", "調和"], ["チョコレート", "洗練"]] }, g: { spring: [["青み白", "喧嘩する"], ["ショッキングピンク", "不調和"]], autumn: [["青み白", "喧嘩する"], ["ショッキングピンク", "不調和"]] }, s: 2007, sn: "4色展開。ブラウンヘアと同系のグラデーション。" },
      { n: "ボブ・ショート", e: "首元に情報がある色", l: "ボブ・ショートは首元が見える髪型。ハイネックやリボン襟など「首元に情報のある服」が映えます。", w: { spring: [["コーラル", "華やか首元"], ["アイボリー", "清潔感"], ["ピーチピンク", "柔らか"], ["イエロー", "華やか"], ["ライトベージュ", "上品"]], autumn: [["リッチアイボリー", "清潔感"], ["テラコッタ", "華やか首元"], ["マスタード", "印象的"], ["パンプキン", "元気"], ["キャメル", "あたたかい"]] }, g: { spring: [["厚手ハイネック寒色", "冷たい"], ["青みグレータートル", "地味"]], autumn: [["厚手ハイネック寒色", "冷たい"], ["青みグレータートル", "地味"]] }, s: 2025, sn: "ベージュ・ホワイト。ロングヘアの肌見せに。" },
      { n: "ロング・下ろし髪", e: "肌の面積を確保する色", l: "ロング・下ろし髪は顔まわりを覆う分、服はVネックや開襟で肌の面積を確保すると重たくなりません。", w: { spring: [["アイボリー", "肌見せ"], ["コーラル", "抜け感"], ["ピーチピンク", "柔らか"], ["イエロー", "華やか"], ["ライトベージュ", "上品"]], autumn: [["リッチアイボリー", "肌見せ"], ["テラコッタ", "抜け感"], ["マスタード", "華やか"], ["キャメル", "あたたかい"], ["パンプキン", "印象的"]] }, g: { spring: [["厚手ハイネック寒色", "もたつく"], ["青みグレータートル", "冷たい"]], autumn: [["厚手ハイネック寒色", "もたつく"], ["青みグレータートル", "冷たい"]] } },
    ],
    weather: [
      { n: "晴れの日", e: "自然光でビタミンカラーが解禁される色", l: "強くクリアな自然光は、得意な淡色や鮮やかな色をいちばん美しく発色させます。晴れの日は攻めた色を着る日です。", w: { spring: [["イエロー", "最高に発色"], ["コーラル", "血色"], ["アプリコット", "元気"], ["ライトグリーン", "爽やか"], ["ピーチ", "華やか"]], autumn: [["テラコッタ", "冴える"], ["マスタード", "目力"], ["パンプキン", "華やか"], ["ブリックレッド", "印象的"], ["カーキ", "こなれ"]] }, g: { spring: [["暗い色全般", "もったいない"], ["青み系", "くすむ"]], autumn: [["中間色全般", "ぼやける"], ["青み系", "くすむ"]] }, s: 1694, sn: "6色展開。雨の日はピンク・ベージュを主役に。" },
      { n: "曇りの日", e: "青白い光の中でも血色を保つ色", l: "曇りの光は青白く弱く、肌の影とくすみを強調します。顔の下に明るい色を置き、弱い光を顔へ反射させるのがコツです。", w: { spring: [["ライトベージュ", "血色キープ"], ["アプリコット", "明るく見える"], ["アイボリー", "のっぺり回避"], ["コーラル", "顔映え"], ["ピーチ", "柔らか"]], autumn: [["キャメルベージュ", "血色キープ"], ["テラコッタ", "明るく見える"], ["リッチアイボリー", "のっぺり回避"], ["マスタード", "顔映え"], ["パンプキン", "印象的"]] }, g: { spring: [["青白い寒色全般", "くすみ重ね"], ["グレージュ", "地味"]], autumn: [["青白い寒色全般", "くすみ重ね"], ["クールグレー", "地味"]] }, s: 2007, sn: "4色展開。曇りの日でものっぺり見えを防ぐ。" },
      { n: "雨の日", e: "彩度で光をひと足しする色", l: "雨の日は光量が落ち、淡い色はぼやけ、暗い色は重く沈みます。効くのは彩度のある色で、顔に血色や光をひと足しすることです。", w: { spring: [["コーラル", "彩度UP"], ["イエロー", "光を足す"], ["アプリコット", "華やか"], ["ピーチピンク", "柔らか"], ["ライトグリーン", "爽やか"]], autumn: [["テラコッタ", "彩度UP"], ["マスタード", "光を足す"], ["パンプキン", "華やか"], ["ブリックレッド", "印象的"], ["ボルドー(黄)", "艶"]] }, g: { spring: [["淡すぎる色全般", "ぼやける"], ["薄いグレー", "消える"]], autumn: [["淡すぎる色全般", "ぼやける"], ["薄いグレー", "消える"]] }, s: 2060, sn: "9色展開。天気で色だけ差し替える運用に。" },
      { n: "真夏の強い日差し", e: "元気さが伝わる色", l: "強い日差しの日は、色そのものが持つ\"体感温度\"も印象を左右します。涼しげ・元気さが伝わる色で季節感を演出しましょう。", w: { spring: [["イエロー", "元気"], ["コーラル", "夏らしい"], ["ライトグリーン", "爽やか"], ["アプリコット", "華やか"], ["ピーチ", "明るい"]], autumn: [["パンプキン", "元気"], ["テラコッタ", "夏らしい"], ["マスタード", "華やか"], ["カーキ", "こなれ"], ["ブリックレッド", "印象的"]] }, g: { spring: [["黒単体", "暑苦しい"], ["青みグレー", "冷たい印象"]], autumn: [["黒単体", "暑苦しい"], ["青みグレー", "冷たい印象"]] } },
    ],
    ceremony: [
      { n: "結婚式のお呼ばれ", e: "主役を立てつつ華やぐ色", l: "結婚式は主役の花嫁を立てつつ、自分も華やかに祝う色を選ぶのがマナー。白は花嫁の色のため厳禁、黒一色のコーデもお祝いの場にはそぐいません。", w: { spring: [["コーラル", "お祝い感"], ["アプリコット", "華やか"], ["ライトグリーン", "爽やか"], ["ピーチピンク", "柔らか"], ["イエロー", "明るい"]], autumn: [["テラコッタ", "艶やか"], ["マスタード", "こなれ"], ["パンプキン", "華やか"], ["ボルドー(黄)", "高貴(色被り注意)"], ["キャメル", "上品"]] }, g: { spring: [["純白・白系全般", "花嫁の色でNG"], ["黒一色の喪服的コーデ", "お祝いの場にNG"]], autumn: [["純白・白系全般", "花嫁の色でNG"], ["黒一色の喪服的コーデ", "お祝いの場にNG"]] }, s: 2188, sn: "ブラック。結婚式・法事どちらにも対応できるシルエット。" },
      { n: "お葬式・法要", e: "正式な喪服マナーの黒", l: "お葬式・法要は色選びに個人差の余地がありません。正式な喪服マナーに沿った黒(または濃紺・濃グレー)が絶対です。素材と光沢にも注意してください。", w: { spring: [["漆黒(喪服)", "マナー"], ["濃いダークブラウン(準喪服可)", "控えめ"], ["ダークグレー", "控えめ"], ["マットな黒", "上品"], ["黒に近い墨色", "マナー"]], autumn: [["漆黒(喪服)", "マナー"], ["濃いダークブラウン(準喪服可)", "控えめ"], ["ダークグレー", "控えめ"], ["マットな黒", "上品"], ["黒に近い墨色", "マナー"]] }, g: { spring: [["光沢・パール素材の黒", "マナー違反"], ["柄物", "不適切"]], autumn: [["光沢・パール素材の黒", "マナー違反"], ["柄物", "不適切"]] }, s: 1777, sn: "4色展開。結婚式のお呼ばれに華やかなオレンジやベージュを。" },
      { n: "七五三・入学式などの親の付き添い", e: "控えめだが上品な色", l: "七五三や入学式の付き添いは、主役はあくまで子供。控えめだけれど品のある色で、写真に写っても浮かない立ち位置を作ります。", w: { spring: [["ライトベージュ", "上品控えめ"], ["ウォームグレー", "柔らかい"], ["アイボリー", "清潔"], ["アプリコット", "華やかさ少量"], ["ミディアムブラウン", "品"]], autumn: [["ダークブラウン", "上品控えめ"], ["キャメルベージュ", "柔らかい"], ["リッチアイボリー", "清潔"], ["テラコッタ(控えめ)", "華やかさ少量"], ["チョコレート", "品"]] }, g: { spring: [["真っ黒フルコーデ", "主役の子より目立つ"], ["派手な寒色", "子供の日に不適切"]], autumn: [["真っ黒フルコーデ", "主役の子より目立つ"], ["派手な寒色", "不適切"]] }, s: 490, sn: "ネイビー。法事・法要にも使える落ち着いた一枚。" },
    ],
    shoubu: [
      { n: "資格試験・面接試験の証明写真", e: "顔色が悪く写らない色", l: "証明写真は対面より色の影響が強く出ます。試験・資格の顔写真で損をしないよう、顔色が明るく見える色のインナーを選びましょう。", w: { spring: [["アイボリー", "なじむ"], ["ライトベージュ", "健康的"], ["ピーチ白", "血色"], ["クリームアイボリー", "優しい"], ["ウォームホワイト", "明るい"]], autumn: [["リッチアイボリー", "上品"], ["キャメルベージュ", "艶が出る"], ["ウォームベージュ", "安心感"], ["オークル白", "なじむ"], ["ゴールドアイボリー", "華やか"]] }, g: { spring: [["青み白", "顔が青む"], ["純白(冷)", "浮く"]], autumn: [["青み白", "浮く"], ["アイスブルー", "青む"]] }, s: 2025, sn: "ベージュ・ホワイト。証明写真の主力。" },
      { n: "大勢の前でのプレゼン・発表会", e: "遠くからでも視線を集める色", l: "大勢の前でのプレゼンや発表会は、遠目からでも視線を集める色が武器になります。全身を無難にまとめると記憶に残りません。", w: { spring: [["コーラル", "目立つ"], ["イエロー", "印象的"], ["アプリコット", "華やか"], ["ライトグリーン", "爽やか"], ["ピーチ", "記憶に残る"]], autumn: [["テラコッタ", "記憶に残る"], ["マスタード", "目力"], ["パンプキン", "目立つ"], ["ボルドー(黄)", "高貴"], ["ブリックレッド", "印象的"]] }, g: { spring: [["薄すぎる色全般", "埋もれる"], ["青み白", "印象薄"]], autumn: [["薄すぎる色全般", "埋もれる"], ["青み白", "印象薄"]] }, s: 1796, sn: "4色展開。プレゼン・発表会はボルドーで記憶に残す。" },
      { n: "受験・試験当日", e: "緊張を和らげ集中力を高める色", l: "受験や試験当日は、気を散らさず集中力を保つ色を。刺激の強い原色は緊張や興奮を煽るため避け、落ち着いた色で自分をコントロールしましょう。", w: { spring: [["ライトベージュ", "落ち着き"], ["ウォームグレー", "冷静"], ["アイボリー", "リラックス"], ["ミディアムブラウン", "集中力"], ["カーキブラウン", "安定"]], autumn: [["キャメルベージュ", "落ち着き"], ["ダークブラウン", "集中力"], ["リッチアイボリー", "リラックス"], ["チョコレート", "安定"], ["カーキ", "冷静"]] }, g: { spring: [["刺激的な寒色全般", "気が散る"], ["蛍光ピンク", "落ち着かない"]], autumn: [["刺激的な寒色全般", "気が散る"], ["蛍光ピンク", "落ち着かない"]] }, s: 2182, sn: "4色展開。昇進面談・節目の場に。" },
      { n: "昇進・キャリアの節目の面談", e: "自信と実力が伝わる色", l: "昇進やキャリアの節目の面談では、自信と実力が伝わる深みのある色が説得力を底上げします。", w: { spring: [["ブライトネイビー", "自信"], ["ミディアムブラウン", "実力"], ["カーキブラウン", "説得力"], ["ウォームグレー", "貫禄"], ["ダークネイビー", "締まる"]], autumn: [["ダークブラウン", "自信"], ["チョコレート", "実力"], ["ボルドー(黄)", "貫禄"], ["ダークネイビー", "説得力"], ["カカオ", "高貴"]] }, g: { spring: [["淡い色全般", "頼りない"], ["パステルアイボリー", "弱い"]], autumn: [["淡い色全般", "頼りない"], ["パステルアイボリー", "弱い"]] } },
    ],
    age: [
      { n: "20代", e: "フレッシュさを最大化する色", l: "20代はフレッシュさが最大の武器。明るく澄んだ色をためらわず着ることで、若さと元気が最大限に活きます。重すぎる色は年齢より老けて見えるので注意。", w: { spring: [["コーラル", "フレッシュ"], ["イエロー", "元気"], ["ピーチピンク", "可愛い"], ["アプリコット", "華やか"], ["ライトグリーン", "爽やか"]], autumn: [["テラコッタ", "元気"], ["パンプキン", "華やか"], ["リッチアイボリー", "フレッシュ"], ["マスタード", "こなれ"], ["ブリックレッド", "印象的"]] }, g: { spring: [["重すぎる暗色全般", "老けて見える"], ["グレーフルコーデ", "地味"]], autumn: [["重すぎる暗色全般", "老けて見える"], ["グレーフルコーデ", "地味"]] }, s: 1694, sn: "6色展開。20代は明るい色、30代以降は落ち着いた色を。" },
      { n: "30代", e: "きちんと感と抜け感のバランス色", l: "30代はきちんと感と抜け感のバランスが鍵。子供っぽい原色は避けつつ、大人の余裕を感じさせる色を選びましょう。", w: { spring: [["ライトベージュ", "きちんと感"], ["ウォームグレー", "抜け感"], ["アプリコット", "大人可愛い"], ["ミディアムブラウン", "上品"], ["カーキブラウン", "洗練"]], autumn: [["ダークブラウン", "きちんと感"], ["テラコッタ", "大人っぽい"], ["キャメルベージュ", "抜け感"], ["ボルドー(黄)", "艶"], ["チョコレート", "洗練"]] }, g: { spring: [["子供っぽい原色全般", "幼く見える"], ["キャラクター的な柄", "TPOに合わない"]], autumn: [["子供っぽい原色全般", "幼く見える"], ["蛍光色", "浮く"]] }, s: 2007, sn: "4色展開。30代のきちんと感と抜け感のバランスに。" },
      { n: "40代以降", e: "上質さと落ち着きが伝わる色", l: "40代以降は上質さと落ち着きが武器になります。若作りに見える蛍光色・過度なパステルより、深みのある色が年齢を魅力に変えます。", w: { spring: [["キャメル", "上質"], ["ウォームグレー", "洗練"], ["ミディアムブラウン", "品格"], ["ライトベージュ", "落ち着き"], ["アプリコット(控えめ)", "上品"]], autumn: [["ダークブラウン", "上質"], ["ボルドー(控えめ)", "品格"], ["キャメルベージュ", "洗練"], ["チョコレート", "落ち着き"], ["カーキ(控えめ)", "上質"]] }, g: { spring: [["安っぽく見える蛍光色", "若作り感"], ["過度なパステル寒色", "子供っぽい"]], autumn: [["安っぽく見える蛍光色", "若作り感"], ["過度なパステル寒色", "子供っぽい"]] }, s: 2060, sn: "9色展開。年代に合わせて色だけ差し替える運用に。" },
    ],
  },
};
// ── コーデ提案：入力(シーン/相手/気分/髪色/悩み) → 記事シーンへの対応表 ──
// 気分の自由入力はキーワードで拾う。上から順に最初に当たったものを採用する。
const STYLIST_MOOD_RULES = [
  [/就活|面接|エントリー|説明会|OB訪問/, "jobhunt", 0],
  [/証明写真|履歴書/, "shoubu", 0],
  [/プレゼン|発表|登壇|セミナー/, "shoubu", 1],
  [/受験|試験|資格/, "shoubu", 2],
  [/昇進|評価面談|キャリア/, "shoubu", 3],
  [/結婚式|披露宴|お呼ばれ|二次会/, "ceremony", 0],
  [/葬|法要|通夜|お別れ/, "ceremony", 1],
  [/入学式|卒業式|七五三|入園|授業参観/, "ceremony", 2],
  [/婚活|お見合い/, "konkatsu", 0],
  [/パーティ/, "konkatsu", 1],
  [/親に|ご挨拶|実家/, "konkatsu", 3],
  [/プロフィール/, "konkatsu", 4],
  [/オンライン|リモート|ｗeb|web会議|ズーム|Zoom/i, "business", 3],
  [/交渉|条件|見積/, "business", 4],
  [/謝罪|お詫び|初回商談/, "business", 0],
  [/映画|水族館|暗い/, "date", 2],
  [/写真|撮/, "date", 4],
  [/雨/, "weather", 2],
  [/曇/, "weather", 1],
  [/猛暑|日差し|真夏|炎天/, "weather", 3],
];
// 「今日会う相手」→ シーン
const STYLIST_MEET_RULES = {
  "上司・仕事関係": ["business", 2],
  "義家族・目上の方": ["konkatsu", 3],
  "初対面の人": ["konkatsu", 0],
  "彼・気になる人": ["date", 0],
  "友達": ["date", 3],
};
// 「どんなデート？」→ シーン
const STYLIST_SUB_RULES = {
  "初デート": ["date", 0],
  "カフェ・ランチ": ["date", 0],
  "ディナー": ["date", 1],
  "お出かけ・アクティブ": ["date", 3],
};
// シーン未確定時の既定（work=プレゼン・提案 / date=初デート・昼カフェ / casual=晴れの日）
const STYLIST_TPO_DEFAULT = { work: ["business", 1], date: ["date", 0], casual: ["weather", 0] };
// 髪色 → 髪色記事のシーン。記事が扱っていない髪色は、無理に当てず髪の一文を省く。
const STYLIST_HAIR_SCENE = {
  blubel: { "黒髪": 0, "暗めブラウン": 0, "アッシュ・グレージュ": 1, "ベージュ・ミルクティー": 1 },
  iebel: { "黒髪": 0, "暗めブラウン": 1, "明るめブラウン": 1, "ベージュ・ミルクティー": 1 },
};
// 「叶えたいこと」→ 優先して選ぶ商品カテゴリ（記事にはこの軸が無いため、商品選定にのみ使う）
const STYLIST_WORRY_CATS = {
  "細見えしたい": ["ワンピース", "セットアップ"],
  "二の腕をカバー": ["トップス"],
  "顔色を明るく": ["トップス"],
  "大人っぽく": ["ワンピース", "セットアップ"],
  "若々しく": ["トップス"],
  "褒められたい": ["ワンピース", "アクセサリー"],
};
const STYLIST_ACC_CATS = ["アクセサリー", "バッグ"];

// 記事シーンを1つ選ぶ。優先順は 気分の自由入力 > デート細分 > 会う相手 > シーン既定。
function pickStylingScene(site, tpo, mood, sub, meet) {
  const book = STYLING_DATA[site] || {};
  const cands = [];
  if (mood) {
    for (const [re, th, i] of STYLIST_MOOD_RULES) if (re.test(mood)) { cands.push([th, i]); break; }
  }
  if (sub && STYLIST_SUB_RULES[sub]) cands.push(STYLIST_SUB_RULES[sub]);
  if (meet && STYLIST_MEET_RULES[meet]) cands.push(STYLIST_MEET_RULES[meet]);
  cands.push(STYLIST_TPO_DEFAULT[tpo] || STYLIST_TPO_DEFAULT.work);
  for (const [th, i] of cands) {
    const list = book[th];
    if (list && list[i]) return { theme: th, index: i, scene: list[i] };
  }
  const th = Object.keys(book)[0];
  return th ? { theme: th, index: 0, scene: book[th][0] } : null;
}

// 在庫(SKUS)から2〜3点。記事の推奨SKUが在庫にあれば最優先、カテゴリは必ず散らす。
function pickStylistSkus(site, scene, tpo, worries, frameKey) {
  const pool = SKUS[site] || [];
  const boost = [];
  (worries || []).forEach((w) => (STYLIST_WORRY_CATS[w] || []).forEach((c) => boost.push(c)));
  const scored = pool
    .map((sku) => {
      let sc = 0;
      if (scene && scene.s === sku.id) sc += 10;      // 記事がこのシーンに挙げている商品
      if (sku.tpo && sku.tpo.includes(tpo)) sc += 3;  // シーン一致
      if (frameKey && sku.frame && sku.frame.includes(frameKey)) sc += 2;
      if (boost.includes(sku.cat)) sc += 2;
      return { sku, sc };
    })
    .sort((a, b) => (b.sc !== a.sc ? b.sc - a.sc : a.sku.id - b.sku.id));
  const picked = [], cats = [];
  const take = (pred) => {
    for (const { sku } of scored) {
      if (picked.includes(sku) || cats.includes(sku.cat)) continue;
      if (!pred(sku)) continue;
      picked.push(sku); cats.push(sku.cat); return true;
    }
    return false;
  };
  take((s) => !STYLIST_ACC_CATS.includes(s.cat));   // 主役1点
  take((s) => !STYLIST_ACC_CATS.includes(s.cat));   // 主役2点目（別カテゴリ）
  take((s) => STYLIST_ACC_CATS.includes(s.cat));    // 仕上げの小物
  while (picked.length < 2) if (!take(() => true)) break;
  return picked.map((s) => s.id);
}

// ════════════════════════════════════════════
// 顔写真で診断：白基準補正 + CIELab 実測エンジン
// photo_diagnose_v3.jsx より移植。AI / 外部通信は一切使わない。
// ════════════════════════════════════════════
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const srgbToLinear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

function rgbToLab(r, g, b) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // sRGB D65 → XYZ
  let X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  X /= 0.95047; Y /= 1.0; Z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/* 領域の中央値サンプリング(外れ値に強い) */
function sampleRegion(data, W, H, x0, y0, x1, y1) {
  const rs = [], gs = [], bs = [];
  const sx = Math.max(0, Math.floor(x0 * W)), ex = Math.min(W, Math.floor(x1 * W));
  const sy = Math.max(0, Math.floor(y0 * H)), ey = Math.min(H, Math.floor(y1 * H));
  const step = Math.max(1, Math.floor(Math.min(ex - sx, ey - sy) / 40));
  for (let y = sy; y < ey; y += step) {
    for (let x = sx; x < ex; x += step) {
      const i = (y * W + x) * 4;
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    }
  }
  if (!rs.length) return null;
  const med = (arr) => { const s = [...arr].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  return { r: med(rs), g: med(gs), b: med(bs), n: rs.length };
}

/* サンプリング領域(相対座標)。撮影ガイドの枠と必ず一致させること。 */
const PH_REGION = {
  white:  [0.34, 0.76, 0.66, 0.92], // 顎下の白い紙
  cheekL: [0.24, 0.46, 0.36, 0.58],
  cheekR: [0.64, 0.46, 0.76, 0.58],
  hair:   [0.40, 0.06, 0.60, 0.16],
};

/* 撮影条件(すべてチェックするまで撮影へ進めない) */
const PHOTO_CONDITIONS = [
  { id: "window", label: "窓から1m以内・日中の自然光で撮る", why: "蛍光灯やLEDは色が偏ります" },
  { id: "noLight", label: "照明を消す(自然光だけにする)", why: "光が混ざると補正できません" },
  { id: "white", label: "白い紙かハンカチを顎の下に持つ", why: "照明のズレを補正する基準になります" },
  { id: "hair", label: "髪を耳にかけ、顔まわりを出す", why: "頬の色を正しく測るためです" },
  { id: "bare", label: "ノーメイクか薄化粧にする", why: "ファンデーションの色を測ってしまいます" },
];

/* HEX → RGB。色マスター(TYPES.palette10 / NG_COLORS)との照合に使う。 */
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/* CIE76 の色差ΔE。0に近いほど同じ色。 */
function deltaE(a, b) {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

/* HEX を Lab に。色マスターは固定なので毎回計算しても軽い。 */
function hexToLab(h) {
  const c = hexToRgb(h);
  return c ? rgbToLab(c.r, c.g, c.b) : null;
}

/* data URL / base64 を canvas に描いて ImageData を返す（写真診断・コーデ採点で共用） */
async function readImageData(base64, mediaType, width) {
  const dataUrl = /^data:/.test(base64) ? base64 : `data:${mediaType || "image/jpeg"};base64,${base64}`;
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(gateError("画像を開けませんでした", "別の写真でお試しください。"));
    im.src = dataUrl;
  });
  const W = width;
  const H = Math.max(1, Math.round((img.height / img.width) * W));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  return { data: ctx.getImageData(0, 0, W, H).data, W, H };
}

/* 品質ゲートで却下するときの例外。title / body を撮り直し画面がそのまま出す。 */
function gateError(title, body) {
  const e = new Error(title);
  e.isPhotoGate = true; e.title = title; e.body = body;
  return e;
}

/* インカメラの起動/停止。顔写真診断とコーデ採点で共用する。 */
async function startCameraInto(videoRef, streamRef, setReady, setError) {
  setError(null); setReady(false);
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("unavailable");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setReady(true);
    }
  } catch (e) {
    setError(e && e.name === "NotAllowedError" ? "denied" : "unavailable");
  }
}
function stopCameraOf(streamRef, setReady) {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  setReady(false);
}

/* 染髪フラグ。aiPhotoDiagnose のシグネチャを変えないためモジュールスコープで受け渡す。 */
let photoHairDyed = false;
const setPhotoHairDyed = (v) => { photoHairDyed = !!v; };

/* 3軸算出 + 4タイプ距離判定(参照ソース photo_diagnose_v3.jsx の diagnose() をそのまま移植) */
function diagnoseByMeasure(skinLab, hairLab, skinRGB, hairDyed) {
  /* 軸1: 色相(暖/寒)
     肌のb*(黄み)とa*(赤み)の比。日本人の肌はb*=12〜24が中心域。
     b*が高くa*との差が大きいほどWarm寄り。 */
  const warmRaw = skinLab.b - skinLab.a * 0.55;
  const warmth = clamp01((warmRaw - 4) / 14); // 0=Cool 1=Warm

  /* 軸2: 明度。肌のL*。日本人の肌はL*=58〜75が中心域。 */
  const lightness = clamp01((skinLab.L - 56) / 20); // 0=Deep 1=Light

  /* 軸3: 清濁。肌の彩度C*と、髪と肌の明度差(コントラスト)。
     コントラストが高く彩度が明瞭ほどClear。 */
  const chromaC = Math.sqrt(skinLab.a ** 2 + skinLab.b ** 2);
  const contrast = Math.abs(skinLab.L - hairLab.L);
  /* 染髪している場合、髪コントラストは地の色素を反映しないため
     重みを肌の彩度側へ寄せる(プロは地毛・瞳で清濁を見る) */
  const wC = hairDyed ? 0.85 : 0.45;
  const wK = hairDyed ? 0.15 : 0.55;
  const clarity = clamp01(((chromaC - 12) / 12) * wC + ((contrast - 22) / 30) * wK);

  /* 4タイプへの距離(各タイプの理想座標との近さ) */
  const targets = { spring: [1, 1, 1], autumn: [1, 0, 0], summer: [0, 1, 0], winter: [0, 0, 1] };
  const v = [warmth, lightness, clarity];
  const scored = Object.entries(targets)
    .map(([k, t]) => {
      // 色相の重みを最大にする(タイプ分けの第一軸のため)
      const w = [1.6, 1.0, 1.0];
      const d = Math.sqrt(t.reduce((s, tv, i) => s + w[i] * (tv - v[i]) ** 2, 0));
      return { key: k, dist: d };
    })
    .sort((p, q) => p.dist - q.dist);

  // 信頼度: 1位と2位の差が小さいほど低い
  const gap = scored[1].dist - scored[0].dist;
  const confidence = gap > 0.55 ? "high" : gap > 0.25 ? "medium" : "low";

  return {
    first: scored[0].key,
    second: scored[1].key,
    axes: {
      warmth: Math.round(warmth * 100),
      lightness: Math.round(lightness * 100),
      clarity: Math.round(clarity * 100),
    },
    metrics: {
      L: skinLab.L.toFixed(1), a: skinLab.a.toFixed(1), b: skinLab.b.toFixed(1),
      chroma: chromaC.toFixed(1), contrast: contrast.toFixed(1), hairL: hairLab.L.toFixed(1),
    },
    skinHex: hex(skinRGB.r, skinRGB.g, skinRGB.b),
    confidence,
    gap: gap.toFixed(2),
  };
}

// ════════════════════════════════════════════
// 今日のコーデ採点：服の色 × タイプの色相性（CIELab のΔE照合）
// 判定するのは「色の相性」だけ。シルエット・素材感・バランスは対象外。
// ════════════════════════════════════════════
// 撮影ガイドの枠と必ず一致させること（ガイドとサンプリングがズレると測る場所が変わる）
const SC_REGION = {
  tops: [0.34, 0.30, 0.66, 0.50],    // 上半身中央
  bottoms: [0.36, 0.60, 0.64, 0.80], // 下半身中央
  bgL: [0.02, 0.06, 0.13, 0.24],     // 背景の基準（左上）
  bgR: [0.87, 0.06, 0.98, 0.24],     // 背景の基準（右上）
};
const SC_NEAR = 15;   // これ以内なら「その色に近い」と見なすΔE
const SC_SAME = 4;    // これ以下なら「同じ色」と見なすΔE
const SC_BG = 8;      // 背景と区別がつかないと見なすΔE

/* 実測Lab を、タイプの勝ち色10色 / NG色4色 と突き合わせて最も近い色を返す */
function scoreMatchColor(lab, typeKey) {
  const win = (TYPES[typeKey].palette10 || []).map(([name, hex]) => ({ name, lab: hexToLab(hex) }));
  const ng = (NG_COLORS[typeKey] || []).map((c) => ({ name: c.name, why: c.why, alt: c.alt, lab: hexToLab(c.hex) }));
  const near = (arr) => arr.reduce((best, c) => (c.lab && (!best || deltaE(lab, c.lab) < best.d) ? { c, d: deltaE(lab, c.lab) } : best), null);
  return { win: near(win), ng: near(ng) };
}

/* 1領域あたりの加点/減点。得意色に近いほど+、NG色に近いほど−。中間色は0。 */
function scoreRegionPoints(match, maxPts) {
  const dw = match.win ? match.win.d : Infinity;
  const dn = match.ng ? match.ng.d : Infinity;
  if (dw <= SC_NEAR && dw <= dn) return Math.round(maxPts * (1 - dw / SC_NEAR));
  if (dn <= SC_NEAR && dn < dw) return -Math.round(maxPts * (1 - dn / SC_NEAR));
  return 0;
}

// ════════════════════════════════════════════
// 提案・診断・採点のロジック（外部AIには一切依存しない）
// ════════════════════════════════════════════
// 2026-08-29 に3機能とも決定論的な実装へ置換したため、Anthropic API を叩いていた
// callClaude() / parseAiJson() は役目を終えたので削除した。
//   コーデ提案       → STYLING_DATA（シーン別記事22本の実データ）を参照
//   顔写真で診断     → 白基準補正 + CIELab の実測
//   今日のコーデ採点 → 服の色と色マスターの ΔE 照合
// 外部APIを再び持ち込む場合は、APIキーを晒さない中継（Cloudflare Workers 等）が前提。

// 【2026-08-29 置換】AI(api.anthropic.com)呼び出しを廃止し、シーン別記事22本から機械抽出した
// STYLING_DATA を参照して組み立てる方式に置換した。文章はAIで創作せず、記事の実文と
// 記事の色名・効果だけを使う。シグネチャ・戻り値契約は据え置き（結果画面は無改修）。
// 戻り値: {title(15字以内), sku_ids[2〜3](在庫実在), styling(180字以内), makeup_hint(40字以内)}
async function aiStylist(type, secondKey, tpo, mood, sub, worries, hair, frame, meet) {
  const site = type.site;
  const hit = pickStylingScene(site, tpo, mood, sub, meet);
  if (!hit) throw new Error("STYLING_DATA にシーンがありません: " + site);
  const scene = hit.scene;
  const win = (scene.w && scene.w[type.key]) || [];
  const ng = (scene.g && scene.g[type.key]) || [];

  // ── 文字数上限を守って組み立てるヘルパー ──
  const clip = (t, n) => (t.length <= n ? t : t.slice(0, n - 1) + "…");
  const parts = [];
  let left = 180;
  const push = (t) => { if (t && t.length <= left) { parts.push(t); left -= t.length; return true; } return false; };

  // 1) 記事のリード文（実文をそのまま）
  push(scene.l);
  // 2) 勝ち色（記事の色名と効果）
  if (win.length) {
    const names = win.slice(0, 3).map((c) => c[0]).join("・");
    // 効果語は「上品」「なじむ」「健康的」など品詞がまちまちなので、括弧書きにして文法に依存させない
    const accent = win[1] ? `とくに${win[0][0]}（${win[0][1]}）と${win[1][0]}（${win[1][1]}）が効きます。`
                          : `とくに${win[0][0]}（${win[0][1]}）が効きます。`;
    if (!push(`${type.name}の勝ち色は${names}。${accent}`)) push(`${type.name}の勝ち色は${names}。`);
  }
  // 3) 避けたい色（記事のNG色）
  if (ng.length) push(`避けたいのは${ng[0][0]}（${ng[0][1]}）。`);
  // 4) 髪色との調和（記事が扱っている髪色のときだけ）
  const hairIdx = hair ? (STYLIST_HAIR_SCENE[site] || {})[hair] : undefined;
  const hairScene = hairIdx !== undefined && STYLING_DATA[site].hair ? STYLING_DATA[site].hair[hairIdx] : null;
  const hairWin = hairScene && hairScene.w ? hairScene.w[type.key] : null;
  if (hairWin && hairWin.length) push(`${hair}なら${hairWin[0][0]}（${hairWin[0][1]}）が特に好相性。`);
  // 5) 2ndタイプの遊び（1点だけ効かせる、という既存の考え方）
  if (secondKey && TYPES[secondKey]) {
    const sw = scene.w && scene.w[secondKey];
    if (sw && sw.length) push(`小物に2nd ${TYPES[secondKey].name}の${sw[0][0]}を1点だけ。`);
  }
  // 6) 商品の一言（記事が付けている場合）
  if (scene.sn) push(scene.sn);

  const frameKey = frame ? (frame.includes("ストレート") ? "S" : frame.includes("ウェーブ") ? "W" : frame.includes("ナチュラル") ? "N" : null) : null;
  const sku_ids = pickStylistSkus(site, scene, tpo, worries, frameKey);

  // メイクは、記事にメイクのシーンがあればその色を、無ければタイプの主力リップ色を使う
  const mkScene = (STYLING_DATA[site][hit.theme] || []).find((x) => /メイク/.test(x.n));
  const mkWin = mkScene && mkScene.w ? mkScene.w[type.key] : null;
  const lip = (TRYON_LIPS[type.key] || [{ name: "" }])[0].name;
  const makeup_hint = mkWin && mkWin.length
    ? clip(`メイクは${mkWin[0][0]}のリップに${mkWin[1] ? mkWin[1][0] : mkWin[0][0]}を重ねて`, 40)
    : clip(win[0] ? `リップは${lip}、目元は${win[0][0]}系を効かせて` : `リップは${lip}で血色を足して`, 40);

  const baseTitle = scene.n + "の勝ち色";
  return {
    title: clip(baseTitle.length <= 15 ? baseTitle : scene.n, 15),
    sku_ids,
    styling: clip(parts.join(""), 180),
    makeup_hint,
  };
}


// 【2026-08-29 置換】AI(api.anthropic.com)呼び出しを廃止し、CIELab のΔE照合に置き換えた。
// シグネチャ・戻り値契約は据え置き（結果画面は無改修）。
// 戻り値: {score: 0-100, good(60字), improve(70字), one_item(30字)}
// 判定できるのは「服の色とタイプの相性」だけ。シルエット・素材感・バランスは評価対象外。
// 品質ゲートに掛かった場合は gateError() を throw する。
async function aiScoreOutfit(base64, mediaType, type) {
  const { data, W, H } = await readImageData(base64, mediaType, 600);
  const R = SC_REGION;
  const take = (k) => sampleRegion(data, W, H, R[k][0], R[k][1], R[k][2], R[k][3]);
  const tops = take("tops"), bottoms = take("bottoms"), bgL = take("bgL"), bgR = take("bgR");
  const whole = sampleRegion(data, W, H, 0, 0, 1, 1);
  if (!tops || !bottoms || !whole) throw gateError("写真を読み取れませんでした", "もう一度撮影してください。");

  // ── 品質ゲート ──
  const wMax = Math.max(whole.r, whole.g, whole.b), wMin = Math.min(whole.r, whole.g, whole.b);
  if (wMax < 45) {
    throw gateError("写真が暗すぎます", "明るい場所で、全身または上半身がはっきり写るように撮り直してください。");
  }
  if (wMin > 246) {
    throw gateError("光が強すぎて色が飛んでいます", "直射日光や強い照明を避けて、もう一度撮り直してください。");
  }
  const tLab = rgbToLab(tops.r, tops.g, tops.b);
  const bLab = rgbToLab(bottoms.r, bottoms.g, bottoms.b);
  const bg = bgL && bgR
    ? rgbToLab((bgL.r + bgR.r) / 2, (bgL.g + bgR.g) / 2, (bgL.b + bgR.b) / 2)
    : null;
  const dTB = deltaE(tLab, bLab);
  const dTbg = bg ? deltaE(tLab, bg) : 99;
  const dBbg = bg ? deltaE(bLab, bg) : 99;
  if (dTbg < SC_BG && dBbg < SC_BG) {
    throw gateError("枠に服が入っていません",
      "トップスの枠に上半身、ボトムスの枠に下半身が重なるように立って、もう一度撮り直してください。");
  }
  // 2領域の色差が極端に小さく、しかも背景とも見分けがつかない = 枠がずれている
  if (dTB < SC_SAME && dTbg < SC_BG * 1.5 && dBbg < SC_BG * 1.5) {
    throw gateError("トップスとボトムスを見分けられません",
      "服がガイド枠から外れているようです。全身が枠に収まる位置で撮り直してください。");
  }
  const oneTone = dTB < SC_SAME; // 背景とは区別できているワントーンコーデ。却下せず採点する。

  // ── 色照合 ──
  const key = type.key;
  const mt = scoreMatchColor(tLab, key);
  const mb = scoreMatchColor(bLab, key);
  const pt = scoreRegionPoints(mt, 30); // 顔まわりのトップスを重く見る
  const pb = scoreRegionPoints(mb, 20);
  const score = Math.max(0, Math.min(100, 50 + pt + pb));

  const clip = (t, n) => (t.length <= n ? t : t.slice(0, n - 1) + "…");
  const winName = (m) => (m.win && m.win.d <= SC_NEAR ? m.win.c.name : null);
  const ngHit = (m, pts) => (pts < 0 && m.ng ? m.ng.c : null);
  const tw = pt > 0 ? winName(mt) : null;
  const bw = pb > 0 ? winName(mb) : null;
  const tn = ngHit(mt, pt), bn = ngHit(mb, pb);

  // ── good（60字）──
  let good;
  if (tw && bw) {
    good = `トップスの${tw}もボトムスの${bw}も${type.name}の勝ち色。全身で色がそろっています。`;
  } else if (tw) {
    good = `トップスの${tw}は${type.name}の得意色。顔まわりが明るく見えます。`;
  } else if (bw) {
    good = `ボトムスの${bw}は${type.name}の得意色。全体が落ち着いてまとまります。`;
  } else if (!tn && !bn) {
    good = `大きく外した色はありません。${(TYPES[key].palette10[0] || [])[0]}を差し色に足すと、より${type.name}らしくなります。`;
  } else {
    good = `色を意識して選べている部分があります。顔まわりを得意色にすると印象が変わります。`;
  }
  if (oneTone) good = clip(`ワントーンでまとめた配色です。` + good, 60);

  // ── improve（70字）──
  let improve;
  const worst = tn && bn ? (pt <= pb ? { c: tn, where: "トップス" } : { c: bn, where: "ボトムス" })
    : tn ? { c: tn, where: "トップス" } : bn ? { c: bn, where: "ボトムス" } : null;
  if (worst) {
    improve = `${worst.where}の${worst.c.name}は${type.name}が苦手な色。${worst.c.why}ため、${worst.c.alt.name}に置き換えると顔映りが変わります。`;
  } else if (!tw) {
    improve = `顔に近いトップスを得意色にすると効果が大きいです。${(TYPES[key].palette10[0] || [])[0]}や${(TYPES[key].palette10[1] || [])[0]}を試してみてください。`;
  } else {
    improve = `色の相性は良好です。次はシルエットや素材にも注目してみましょう。`;
  }

  // ── one_item（30字）──
  let one_item;
  if (worst) one_item = `${worst.c.name}の代わりに${worst.c.alt.name}を`;
  else if (!tw) one_item = `${(TYPES[key].palette10[0] || [])[0]}のトップスを1枚`;
  else one_item = `${(TYPES[key].palette10[1] || [])[0]}の小物を1点`;

  return {
    score,
    good: clip(good, 60),
    improve: clip(improve, 70),
    one_item: clip(one_item, 30),
  };
}


// 【2026-08-29 置換】AI(api.anthropic.com)呼び出しを廃止し、白基準補正 + CIELab の
// 決定論的な実測に置き換えた。シグネチャ・戻り値の契約は据え置きのため、呼び出し側
// (結果画面 / localStorage保存 / SKU連携 / シェア) は無改修でそのまま動作する。
// 戻り値: {type, second, confidence:"high|medium|low", hue_pct, value_pct, chroma_pct, reason}
// 品質ゲートに掛かった場合は gateError() を throw する(呼び出し側の catch が撮り直し導線を出す)。
async function aiPhotoDiagnose(base64, mediaType) {
  const dataUrl = /^data:/.test(base64) ? base64 : `data:${mediaType || "image/jpeg"};base64,${base64}`;

  // 1. 画像を canvas に描画して ImageData を得る
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(gateError("画像を開けませんでした", "別の写真でお試しください。"));
    im.src = dataUrl;
  });
  const W = 600;
  const H = Math.max(1, Math.round((img.height / img.width) * W));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  // 2. ガイド枠に対応した固定領域をサンプリング
  const whiteRef = sampleRegion(data, W, H, PH_REGION.white[0], PH_REGION.white[1], PH_REGION.white[2], PH_REGION.white[3]);
  const cheekL = sampleRegion(data, W, H, PH_REGION.cheekL[0], PH_REGION.cheekL[1], PH_REGION.cheekL[2], PH_REGION.cheekL[3]);
  const cheekR = sampleRegion(data, W, H, PH_REGION.cheekR[0], PH_REGION.cheekR[1], PH_REGION.cheekR[2], PH_REGION.cheekR[3]);
  const hairS = sampleRegion(data, W, H, PH_REGION.hair[0], PH_REGION.hair[1], PH_REGION.hair[2], PH_REGION.hair[3]);
  if (!whiteRef || !cheekL || !cheekR || !hairS) {
    throw gateError("写真を読み取れませんでした", "もう一度撮影してください。");
  }

  // 3. 品質ゲート（暗すぎ / 白飛び / 色かぶり28%超）
  const wMax = Math.max(whiteRef.r, whiteRef.g, whiteRef.b);
  const wMin = Math.min(whiteRef.r, whiteRef.g, whiteRef.b);
  if (wMax < 120) {
    throw gateError("白い紙が写っていないか、暗すぎます",
      "顎の下に白い紙を持ち、窓の近くでもう一度撮ってください。白い紙が明るく写っている必要があります。");
  }
  if (wMax > 252 && wMin > 250) {
    throw gateError("光が強すぎて白が飛んでいます",
      "直射日光を避け、窓から少し離れて撮り直してください。");
  }
  const castRatio = (wMax - wMin) / wMax;
  if (castRatio > 0.28) {
    throw gateError("照明の色が強く偏っています",
      "室内照明を消し、日中の自然光だけで撮り直してください。オレンジや青の光が混ざると測れません。");
  }

  // 4. ホワイトバランス補正 + 露出正規化
  //    白紙の色偏りをチャンネル別ゲインで均し、さらに白紙が固定輝度(235 ≒ L*93)に
  //    なるよう全体をスケールして「色の偏り」と「露出の明暗」の両方を補正する。
  const WHITE_TARGET = 235;
  const k = WHITE_TARGET / wMax;
  const gain = {
    r: (wMax / whiteRef.r) * k,
    g: (wMax / whiteRef.g) * k,
    b: (wMax / whiteRef.b) * k,
  };
  const corr = (sm) => ({
    r: Math.min(255, sm.r * gain.r),
    g: Math.min(255, sm.g * gain.g),
    b: Math.min(255, sm.b * gain.b),
  });
  const skinRaw = { r: (cheekL.r + cheekR.r) / 2, g: (cheekL.g + cheekR.g) / 2, b: (cheekL.b + cheekR.b) / 2 };
  const skin = corr(skinRaw);
  const hair = corr(hairS);

  // 5. CIELab 変換
  const skinLab = rgbToLab(skin.r, skin.g, skin.b);
  const hairLab = rgbToLab(hair.r, hair.g, hair.b);

  // 6. 測定妥当性ゲート
  // (a) 左右の頬が大きく違う = 位置ズレ or 片側からの強い光。どちらも測定不能
  const cL = corr(cheekL), cR = corr(cheekR);
  const lLab = rgbToLab(cL.r, cL.g, cL.b), rLab = rgbToLab(cR.r, cR.g, cR.b);
  const cheekDiff = Math.sqrt((lLab.L - rLab.L) ** 2 + (lLab.a - rLab.a) ** 2 + (lLab.b - rLab.b) ** 2);
  if (cheekDiff > 14) {
    throw gateError("左右の頬で色が大きく違っています",
      "顔の位置がガイドとずれているか、横から片側だけに光が当たっています。窓に正面から向き、顔を楕円の中央に合わせて撮り直してください。");
  }
  // (b) 肌として生理的にあり得る範囲か(壁・髪・服を測っていないか)
  const skinOk =
    skinLab.L >= 40 && skinLab.L <= 88 &&
    skinLab.a >= 2 && skinLab.a <= 26 &&
    skinLab.b >= 4 && skinLab.b <= 32;
  if (!skinOk) {
    throw gateError("頬の位置で肌以外を測ってしまいました",
      "顔をガイドの楕円に合わせ、頬がオレンジの円に重なるように撮り直してください。前髪やマスクが頬にかかっていないかも確認してください。");
  }

  // 7. 3軸算出 + 4タイプ判定 → 既存契約の形へ整形
  const m = diagnoseByMeasure(skinLab, hairLab, skin, photoHairDyed);
  const first = m.first;
  // 結果画面は軸ラベル(Warm/Cool・Light/Deep・Clear/Soft)を1stタイプから決めるため、
  // %もそのラベル方向の強さに揃える(質問式 finishQuiz の pct と同じ考え方)。
  const toward = (pct, positiveSide) => (positiveSide ? pct : 100 - pct);
  return {
    type: first,
    second: m.second,
    confidence: m.confidence,
    hue_pct: toward(m.axes.warmth, first === "spring" || first === "autumn"),      // Warm側の強さ
    value_pct: toward(m.axes.lightness, first === "spring" || first === "summer"), // Light側の強さ
    chroma_pct: toward(m.axes.clarity, first === "spring" || first === "winter"),  // Clear側の強さ
    reason: `白い紙で照明を補正したうえで、肌のb*${m.metrics.b}（黄み）・a*${m.metrics.a}（赤み）・明度L*${m.metrics.L}・彩度C*${m.metrics.chroma}・髪との明度差${m.metrics.contrast}を実測して判定しました。`,
  };
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

  // photo（実測方式: intro=撮影条件 → guide=ライブカメラ → analyzing → rejected）
  const fileRef = useRef(null);
  const [phPreview, setPhPreview] = useState(null);
  const [phStep, setPhStep] = useState("intro");
  const [phChecked, setPhChecked] = useState({});
  const [phDyed, setPhDyed] = useState(null); // null=未回答 / true=染めている
  const [phReject, setPhReject] = useState(null); // {title, body}
  const [phCamError, setPhCamError] = useState(null); // "denied" | "unavailable"
  const [phCamReady, setPhCamReady] = useState(false);
  const phVideoRef = useRef(null);
  const phStreamRef = useRef(null);
  const phCanvasRef = useRef(null);
  const phAllChecked = PHOTO_CONDITIONS.every((c) => phChecked[c.id]);

  // ② カラーチェッカー
  const [checkColor, setCheckColor] = useState(null);
  // ③ 試し塗り
  const [toPreview, setToPreview] = useState(null);
  const [toColor, setToColor] = useState(null);
  const [toKind, setToKind] = useState("lip");
  const toFileRef = useRef(null);
  const toCanvasRef = useRef(null);
  const toDrawing = useRef(false);
  // ⑩ コーデ採点（intro=案内 → guide=ライブカメラ → analyzing → result / rejected）
  const [scPreview, setScPreview] = useState(null);
  const [scResult, setScResult] = useState(null);
  const [scStep, setScStep] = useState("intro");
  const [scReject, setScReject] = useState(null);
  const [scCamError, setScCamError] = useState(null);
  const [scCamReady, setScCamReady] = useState(false);
  const scFileRef = useRef(null);
  const scVideoRef = useRef(null);
  const scStreamRef = useRef(null);
  const scCanvasRef = useRef(null);
  // ⑤ ワードローブ・ウィザード
  const [wdStep, setWdStep] = useState(1);
  const [wdScene, setWdScene] = useState(null);
  const [wdOwned, setWdOwned] = useState([]);
  const [wdWorry, setWdWorry] = useState(null);

  const goHome = () => setMode("home");
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, [mode]);
  // 顔写真診断から離れたらカメラを必ず解放する（撮影後・戻る・別タイルへ遷移のいずれでも）
  useEffect(() => {
    if (mode !== "photo") stopPhCamera();
    if (mode !== "score") stopScCamera();
  }, [mode]);

  // ④ 診断結果の保存＆再訪（window.storage / 端末ごと）
  const [soonOpen, setSoonOpen] = useState(false);
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
    const attempt = () => aiStylist(TYPES[myType], mySecond, stTpo, stMood, stSub, stWorries, stHair, myFrame ? `骨格${FRAMES[myFrame].name}` : null, stMeet);
    try {
      setStResult(await attempt());
    } catch (e1) {
      try { setStResult(await attempt()); } // 自動リトライ1回
      catch (e2) { setStError("提案の生成に失敗しました。通信状況をご確認のうえ、もう一度お試しください。"); }
    }
    setStLoading(false);
  };

  // ── 顔写真で診断（実測方式・外部通信なし）──
  const stopPhCamera = () => stopCameraOf(phStreamRef, setPhCamReady);
  const startPhCamera = () => startCameraInto(phVideoRef, phStreamRef, setPhCamReady, setPhCamError);

  // 実測 → 成功時は質問式とまったく同じ結果ページ(quizResult)へ合流させる
  const runPhotoDiagnose = async (dataUrl, mediaType) => {
    setPhPreview(dataUrl); setPhReject(null); setPhStep("analyzing");
    try {
      const r = await aiPhotoDiagnose(dataUrl.split(",")[1], mediaType || "image/jpeg");
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
          note: `※お写真の色を実測した結果です（信頼度：${conf}）。${r.reason || ""}`,
        });
        setMode("quiz");
      } else {
        setPhReject({ title: "解析に失敗しました", body: "明るい場所で撮った写真でもう一度お試しください。" });
        setPhStep("rejected");
      }
    } catch (err) {
      if (err && err.isPhotoGate) setPhReject({ title: err.title, body: err.body });
      else setPhReject({ title: "解析に失敗しました", body: "明るい場所で撮った写真でもう一度お試しください。" });
      setPhStep("rejected");
    }
  };

  const phCapture = () => {
    const video = phVideoRef.current;
    if (!video) return;
    const cv = phCanvasRef.current || document.createElement("canvas");
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    // 前面カメラは左右反転して見えるが、鏡像のまま解析しても頬の左右判定に影響しないため反転補正は不要
    cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", 0.92);
    stopPhCamera();
    runPhotoDiagnose(dataUrl, "image/jpeg");
  };

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopPhCamera();
    const reader = new FileReader();
    reader.onload = () => runPhotoDiagnose(reader.result, file.type || "image/jpeg");
    reader.readAsDataURL(file);
  };

  // ── 今日のコーデ採点（色照合方式・外部通信なし）──
  const stopScCamera = () => stopCameraOf(scStreamRef, setScCamReady);
  const startScCamera = () => startCameraInto(scVideoRef, scStreamRef, setScCamReady, setScCamError);

  const runScoreOutfit = async (dataUrl, mediaType) => {
    if (!myType) return;
    setScPreview(dataUrl); setScReject(null); setScResult(null); setScStep("analyzing");
    try {
      const r = await aiScoreOutfit(dataUrl.split(",")[1], mediaType || "image/jpeg", TYPES[myType]);
      setScResult(r); setScStep("result");
    } catch (err) {
      if (err && err.isPhotoGate) setScReject({ title: err.title, body: err.body });
      else setScReject({ title: "採点できませんでした", body: "明るい場所で、服がはっきり写る写真でもう一度お試しください。" });
      setScStep("rejected");
    }
  };

  const scCapture = () => {
    const video = scVideoRef.current;
    if (!video) return;
    const cv = scCanvasRef.current || document.createElement("canvas");
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", 0.92);
    stopScCamera();
    runScoreOutfit(dataUrl, "image/jpeg");
  };

  const onScorePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopScCamera();
    const reader = new FileReader();
    reader.onload = () => runScoreOutfit(reader.result, file.type || "image/jpeg");
    reader.readAsDataURL(file);
  };

  const openScore = () => {
    setScStep("intro"); setScPreview(null); setScResult(null);
    setScReject(null); setScCamError(null);
    setMode("score");
  };

  const openPhoto = () => {
    setPhStep("intro"); setPhChecked({}); setPhDyed(null);
    setPhReject(null); setPhPreview(null); setPhCamError(null);
    setMode("photo");
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
              <button onClick={() => { if (!STYLIST_ENABLED) { setSoonOpen(true); return; } setStResult(null); setMode("stylist"); }} className="w-full flex items-center gap-4 rounded-2xl p-5 text-left transition-shadow hover:shadow-md" style={{ border: STYLIST_ENABLED ? `2px solid ${C.main}` : "2px solid #dedede", background: STYLIST_ENABLED ? "#fdfbfd" : "#f7f7f7" }}>
                <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: STYLIST_ENABLED ? C.main : "#bdbdbd" }}><Shirt size={20} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium" style={{ color: STYLIST_ENABLED ? C.ink : "#9a9a9a" }}>パーソナルカラー別コーデ提案{!STYLIST_ENABLED && <span className="ml-2 align-middle text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#e4e4e4", color: "#8a8a8a" }}>近日公開</span>}</span><span className="block text-xs mt-0.5" style={{ color: STYLIST_ENABLED ? C.sub : "#ababab" }}>シーン×気分から、服とメイクを提案</span></span>
                <ArrowRight size={16} style={{ color: STYLIST_ENABLED ? C.main : "#bdbdbd" }} />
              </button>
            </div>

            {/* ── 診断する ── */}
            <div className="flex items-center gap-3 mt-7 mb-3">
              <span className="text-xs tracking-widest shrink-0" style={{ color: C.faint }}>診断する</span>
              <span className="h-px flex-1" style={{ background: C.line }} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: <Camera size={17} />, label: "顔写真で診断", soon: !PHOTO_DIAGNOSE_ENABLED, onClick: () => { if (!PHOTO_DIAGNOSE_ENABLED) { setSoonOpen(true); return; } openPhoto(); } },
                { icon: <Sparkles size={17} />, label: "骨格診断", onClick: startFrame },
              ].map((it, i) => (
                <button key={i} onClick={it.onClick} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-4 text-left transition-shadow hover:shadow-md" style={{ border: it.soon ? "1px solid #dedede" : "1px solid " + C.line, background: it.soon ? "#f7f7f7" : "white" }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: it.soon ? "#e8e8e8" : "#f4eff3", color: it.soon ? "#a5a5a5" : C.main }}>{it.icon}</span>
                  <span className="text-xs font-medium leading-tight" style={{ color: it.soon ? "#9a9a9a" : C.ink }}>{it.label}{it.soon && <span className="block mt-0.5 text-[9px] px-1.5 py-0.5 rounded-full w-fit" style={{ background: "#e4e4e4", color: "#8a8a8a" }}>近日公開</span>}</span>
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
                { icon: <Droplet size={17} />, label: "この色、似合う？", onClick: () => { setCheckColor(null); setMode("checker"); } },
                { icon: <Paintbrush size={17} />, label: "リップ・髪色 試し塗り", onClick: () => { setToPreview(null); setToColor(null); setToKind("lip"); setMode("tryon"); } },
                { icon: <Check size={17} />, label: "今日のコーデ採点", soon: !SCORE_ENABLED, onClick: () => { if (!SCORE_ENABLED) { setSoonOpen(true); return; } openScore(); } },
              ].map((it, i) => (
                <button key={i} onClick={it.onClick} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-4 text-left transition-shadow hover:shadow-md" style={{ border: it.soon ? "1px solid #dedede" : "1px solid " + C.line, background: it.soon ? "#f7f7f7" : "white" }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: it.soon ? "#e8e8e8" : "#f4eff3", color: it.soon ? "#a5a5a5" : C.main }}>{it.icon}</span>
                  <span className="text-xs font-medium leading-tight" style={{ color: it.soon ? "#9a9a9a" : C.ink }}>{it.label}{it.soon && <span className="block mt-0.5 text-[9px] px-1.5 py-0.5 rounded-full w-fit" style={{ background: "#e4e4e4", color: "#8a8a8a" }}>近日公開</span>}</span>
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
                <button key={i} onClick={it.onClick} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-4 text-left transition-shadow hover:shadow-md" style={{ border: it.soon ? "1px solid #dedede" : "1px solid " + C.line, background: it.soon ? "#f7f7f7" : "white" }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: it.soon ? "#e8e8e8" : "#f4eff3", color: it.soon ? "#a5a5a5" : C.main }}>{it.icon}</span>
                  <span className="text-xs font-medium leading-tight" style={{ color: it.soon ? "#9a9a9a" : C.ink }}>{it.label}{it.soon && <span className="block mt-0.5 text-[9px] px-1.5 py-0.5 rounded-full w-fit" style={{ background: "#e4e4e4", color: "#8a8a8a" }}>近日公開</span>}</span>
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
                  <QuizIllust illust={Q12[qi].illust} aLabel={Q12[qi].a} bLabel={Q12[qi].b} onPick={(k) => answerQ(k)} />
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
              <div className="inline-flex items-center gap-2 text-xl font-bold mt-3 mb-6 px-5 py-2.5 rounded-full" style={{ background: TYPES[quizResult.second].accent + "14", color: TYPES[quizResult.second].accent, border: `2px solid ${TYPES[quizResult.second].accent}44` }}>
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
                <div>
                  <div className="text-xs mb-2" style={{ color: C.faint }}>似合う色（勝ち色10選）</div>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {(RT.palette10 || RT.palette.map((c) => ["", c])).map(([label, c], i) => (
                      <div key={i} className="text-center">
                        <div className="w-full aspect-square rounded-xl" style={{ background: c, border: "1px solid #e8e2e8" }} />
                        <span className="block text-[9px] mt-1 leading-tight" style={{ color: C.sub }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs mb-2" style={{ color: C.faint }}>苦手な色（顔まわりでは注意）</div>
                  <div className="grid grid-cols-4 gap-2">
                    {(NG_COLORS[RT.key] || []).map((ngc, i) => (
                      <div key={i} className="text-center">
                        <div className="w-full aspect-square rounded-xl relative" style={{ background: ngc.hex, border: "1px solid #e8e2e8" }}>
                          <span className="absolute inset-0 flex items-center justify-center text-lg" style={{ color: "#fff", textShadow: "0 0 4px rgba(0,0,0,.45)" }}>✕</span>
                        </div>
                        <span className="block text-[9px] mt-1 leading-tight" style={{ color: C.sub }}>{ngc.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
              </div>
              {/* 公式フォーマット：似合う服セクション */}
              <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>
                {RT.name}のあなたに似合う服はコレ！
              </h3>
              <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>
                色相（Hue）・明度（Value）・彩度（Chroma）の3軸分析の結果から、{RT.name}のあなたの特性と調和するカラーのファッションアイテムをご紹介します。顔の透明感アップ、顔の引き締め効果、細見えのスリムアップ等の効果が期待できるカラーアイテムばかりなので、是非チェックしてみてください。
              </p>
              {SKUS[RT.site].slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={RT.site} accent={RT.accent} />)}

              <h3 className="font-serif text-lg mt-6 mb-1" style={{ color: C.ink }}>仕上げのコスメはコレ！</h3>
              <p className="text-xs leading-relaxed mb-3" style={{ color: C.sub }}>{RT.name}の肌と調和する色番だけを選びました。</p>
              {COSME[RT.key].slice(0, 3).map((item, i) => (
                <div key={i}>
                  <CosmeCard item={item} />
                  <div className="flex items-center gap-1.5 -mt-1 mb-3 pl-1">
                    <span className="text-[10px]" style={{ color: C.faint }}>似合うカラー:</span>
                    {RT.palette.slice(0, 5).map((c, j) => <span key={j} className="w-4 h-4 rounded-full" style={{ background: c, border: "1px solid #e8e2e8" }} />)}
                  </div>
                </div>
              ))}

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

              <button onClick={() => { if (!STYLIST_ENABLED) { setSoonOpen(true); return; } setStResult(null); setMode("stylist"); }} className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mb-3 mt-2 transition-transform hover:scale-105" style={{ background: RT.accent }}>このタイプで「今日なに着る？」→</button>
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
                    {TYPES[myType].name}{mySecond ? ` × 2nd ${TYPES[mySecond].name}` : ""} <button onClick={() => { setMyType(null); setMySecond(null); setStResult(null); }} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
                  </div>
                  <div className="text-base font-bold mb-2.5" style={{ color: C.ink }}>今日のシーン</div>
                  <div className="flex gap-2 mb-5">
                    {["work", "date", "casual"].map((k) => (
                      <button key={k} onClick={() => setStTpo(k)} className="flex-1 py-2.5 rounded-full text-sm transition-all" style={{ border: stTpo === k ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: stTpo === k ? TYPES[myType].accent : C.sub, background: stTpo === k ? TYPES[myType].accent + "0d" : "white" }}>{tpoJa[k]}</button>
                    ))}
                  </div>
                  {stTpo === "date" && (
                    <>
                      <div className="text-base font-bold mb-2.5" style={{ color: C.ink }}>どんなデート？</div>
                      <div className="flex flex-wrap gap-2 mb-5">
                        {["カフェ・ランチ", "ディナー", "お出かけ・アクティブ", "初デート"].map((d) => (
                          <button key={d} onClick={() => setStSub(stSub === d ? null : d)} className="px-3.5 py-2 rounded-full text-xs transition-all" style={{ border: stSub === d ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: stSub === d ? TYPES[myType].accent : C.sub, background: stSub === d ? TYPES[myType].accent + "0d" : "white" }}>{d}</button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="text-base font-bold mb-2.5" style={{ color: C.ink }}>いまの髪色（任意）</div>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {["黒髪", "暗めブラウン", "明るめブラウン", "ベージュ・ミルクティー", "アッシュ・グレージュ", "ピンク・レッド系"].map((h) => (
                      <button key={h} onClick={() => setStHair(stHair === h ? null : h)} className="px-3.5 py-2 rounded-full text-xs transition-all" style={{ border: stHair === h ? `2px solid ${TYPES[myType].accent}` : "1px solid " + C.line, color: stHair === h ? TYPES[myType].accent : C.sub, background: stHair === h ? TYPES[myType].accent + "0d" : "white" }}>{h}</button>
                    ))}
                  </div>
                  <div className="text-base font-bold mb-2.5" style={{ color: C.ink }}>今日会う相手（任意）</div>
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
                  <div className="text-base font-bold mb-2.5" style={{ color: C.ink }}>今日の気分（任意）</div>
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
                  <div className="inline-flex items-center gap-2.5 mb-3 px-6 py-3 rounded-full text-2xl font-bold" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
                  </div>
                  <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>{TYPES[myType].name}に似合うコスメはコレ！</h3>
                  <div className="rounded-2xl p-3.5 mb-4" style={{ background: "#faf7f9", border: "1px solid #f0e9ef" }}>
                    <div className="text-[11px] mb-2" style={{ color: C.faint }}>以下のコスメはすべて、この「似合うカラー」と調和する色番です</div>
                    <div className="flex items-center gap-2">
                      {TYPES[myType].palette.slice(0, 5).map((c, j) => <span key={j} className="w-8 h-8 rounded-full" style={{ background: c, border: "1px solid #e8e2e8" }} />)}
                    </div>
                  </div>
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
                  <div className="inline-flex items-center gap-2.5 mb-3 px-6 py-3 rounded-full text-2xl font-bold" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
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
                  {(HAIR[myType].affs || [HAIR[myType].aff]).map((item, i) => (
                    <div key={i} className="mb-1">
                      <div className="text-sm font-bold mb-1.5 pl-1" style={{ color: TYPES[myType].accent }}>{TYPES[myType].name}におすすめ　{item.note}</div>
                      <CosmeCard item={item} />
                    </div>
                  ))}
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
                <span className="block text-base mb-1" style={{ color: C.ink }}>あなたのタイプ</span><span className="block text-3xl" style={{ color: FRAMES[myFrame].accent }}>【骨格{FRAMES[myFrame].name}】</span>
              </h2>
              <p className="text-sm mb-5" style={{ color: "#8a828d" }}>{FRAMES[myFrame].catch}</p>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "#4a434f" }}>{FRAMES[myFrame].tip}</p>
              <div className="grid grid-cols-2 gap-4 mb-7">
                <div><div className="text-xs mb-2" style={{ color: C.faint }}>得意なデザイン</div><div className="space-y-2">{FRAMES[myFrame].good.map((g, i) => <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: FRAMES[myFrame].accent + "10", color: FRAMES[myFrame].accent }}><DesignIcon label={g} /><span className="text-sm font-medium">{g}</span></div>)}</div></div>
                <div><div className="text-xs mb-2" style={{ color: C.faint }}>注意したいデザイン</div><div className="space-y-2">{FRAMES[myFrame].ng.map((n, i) => <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "#f2eef1", color: "#8a828d" }}><DesignIcon label={n} /><span className="text-sm font-medium">{n}</span></div>)}</div></div>
              </div>
              {myType ? (
                <>
                  <h3 className="font-serif text-xl leading-snug mb-2" style={{ color: C.ink }}>{TYPES[myType].name}×骨格{FRAMES[myFrame].name}のあなたに似合う服はコレ！</h3>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: C.sub }}>似合う色（パーソナルカラー）と似合う形（骨格）の両方で絞り込んだ、あなた専用のセレクトです。</p>
                  <div className="text-xs mb-2" style={{ color: C.faint }}>あなたに似合うカラーパレット</div>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {(TYPES[myType].palette10 || TYPES[myType].palette.map((c) => ["", c])).map(([label, c], i) => (
                      <div key={i} className="text-center">
                        <div className="w-full aspect-square rounded-xl" style={{ background: c, border: "1px solid #e8e2e8" }} />
                        <span className="block text-[9px] mt-1 leading-tight" style={{ color: C.sub }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  {SKUS[TYPES[myType].site].filter((sku) => sku.frame && sku.frame.includes(myFrame)).slice(0, 3).map((sku) => <SkuCard key={sku.id} sku={sku} site={TYPES[myType].site} accent={TYPES[myType].accent} />)}
                  <button onClick={() => setMode("cosme")} className="block w-full text-center px-6 py-3.5 rounded-full text-white text-sm font-medium mb-3 mt-2 transition-transform hover:scale-105" style={{ background: TYPES[myType].accent }}>{TYPES[myType].name}のおすすめコスメを見る →</button>
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

        {/* ═══ PHOTO（白基準補正 + CIELab 実測。外部通信なし） ═══ */}
        {mode === "photo" && (
          <div>
            <Header title="顔写真で診断" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">

              {/* ── STEP: intro（撮影条件チェック + 染髪確認） ── */}
              {phStep === "intro" && (
                <>
                  <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>
                    写真の色は照明で大きく変わります。この診断では<strong style={{ color: C.ink }}>白い紙を一緒に写して照明のズレを補正</strong>し、肌と髪の色を実測します。条件を満たさない写真は判定せずにお返しします。写真は端末の中だけで処理され、送信も保存もされません。
                  </p>

                  <div className="text-xs mb-1" style={{ color: C.faint }}>撮影条件（すべて必要です）</div>
                  {PHOTO_CONDITIONS.map((c) => (
                    <label key={c.id} style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: `1px solid ${C.line}`, cursor: "pointer", alignItems: "flex-start" }}>
                      <input type="checkbox" checked={!!phChecked[c.id]} onChange={() => setPhChecked((st) => ({ ...st, [c.id]: !st[c.id] }))} style={{ marginTop: 3, width: 17, height: 17, accentColor: C.main, flexShrink: 0 }} />
                      <span>
                        <span style={{ display: "block", fontSize: 13.5, lineHeight: 1.5, color: C.ink }}>{c.label}</span>
                        <span style={{ display: "block", fontSize: 11, color: C.sub, marginTop: 3 }}>{c.why}</span>
                      </span>
                    </label>
                  ))}

                  {/* 染髪の確認（清濁軸の測り方が変わる） */}
                  <div className="mt-5">
                    <div className="text-sm mb-2.5" style={{ color: C.ink }}>髪を染めていますか？（明るめのカラーやブリーチ）</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[["yes", "染めている"], ["no", "地毛に近い"]].map(([v, l]) => (
                        <button key={v} onClick={() => setPhDyed(v === "yes")}
                          style={{ flex: 1, padding: "11px 0", fontSize: 13, cursor: "pointer", borderRadius: 999,
                            border: `1px solid ${phDyed === (v === "yes") ? C.main : C.line}`,
                            background: phDyed === (v === "yes") ? C.main : "#fff",
                            color: phDyed === (v === "yes") ? "#fff" : C.ink }}>{l}</button>
                      ))}
                    </div>
                    <div className="text-[11px] mt-1.5" style={{ color: C.faint }}>染めている場合、髪の色は判定に使わず肌の彩度で清濁を測ります</div>
                  </div>

                  <button onClick={() => { setPhotoHairDyed(phDyed === true); setPhStep("guide"); }} disabled={!phAllChecked || phDyed === null}
                    style={{ width: "100%", marginTop: 22, padding: 16, borderRadius: 999, border: "none",
                      background: (phAllChecked && phDyed !== null) ? C.main : "#d6d3ce", color: "#fff", fontSize: 14, letterSpacing: "0.06em",
                      cursor: (phAllChecked && phDyed !== null) ? "pointer" : "not-allowed" }}>
                    {(phAllChecked && phDyed !== null) ? "撮影にすすむ" : "すべての項目に答えてください"}
                  </button>
                </>
              )}

              {/* ── STEP: guide（ライブカメラ + リアルタイムガイド） ── */}
              {phStep === "guide" && (
                <>
                  {!phCamReady && !phCamError && (
                    <div className="text-center py-2">
                      <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>
                        カメラを起動します。顔を楕円に、白い紙を下の枠に合わせてから撮影してください。
                      </p>
                      <button onClick={startPhCamera} style={{ width: "100%", padding: 16, borderRadius: 999, border: "none", background: C.main, color: "#fff", fontSize: 14, letterSpacing: "0.06em", cursor: "pointer" }}>
                        カメラを起動する
                      </button>
                      <div className="text-[11px] mt-2.5" style={{ color: C.faint }}>ブラウザからカメラの使用許可を聞かれたら「許可」を選んでください</div>
                    </div>
                  )}

                  {phCamError && (
                    <div className="text-center py-2">
                      <p className="text-xs leading-relaxed mb-3.5" style={{ color: "#c2410c" }}>
                        {phCamError === "denied"
                          ? "カメラの使用が許可されていません。ブラウザの設定でこのサイトのカメラ利用を許可してから、もう一度お試しください。"
                          : "カメラを起動できませんでした。かわりに、標準カメラで撮った写真を選んでください。"}
                      </p>
                      <button onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: 16, borderRadius: 999, border: "none", background: C.main, color: "#fff", fontSize: 14, cursor: "pointer" }}>
                        写真を選ぶ
                      </button>
                      <button onClick={startPhCamera} className="w-full mt-2.5 py-3 text-xs" style={{ color: C.sub }}>カメラをもう一度試す</button>
                    </div>
                  )}

                  {/* 外側パネル: 下端に黒帯(96px)を作り、シャッターをそこへ置く。
                      映像に重ねるとシャッターが白紙ガイド＝測定範囲(0.76〜0.92)を覆ってしまうため。
                      ガイドとサンプリング座標は動かさない。 */}
                  <div style={{ position: "relative", display: phCamReady ? "block" : "none", background: "#000", borderRadius: 16, overflow: "hidden", paddingBottom: 96 }}>
                    {/* 内側ラッパ: オーバーレイSVGを映像と同じ高さに閉じ込める(黒帯まで伸ばさない) */}
                    <div style={{ position: "relative" }}>
                    <video ref={phVideoRef} playsInline muted style={{ width: "100%", display: "block", transform: "scaleX(-1)" }} />
                    {/* リアルタイムガイド（サンプリング座標 PH_REGION と一致・丸型 + グラデーション） */}
                    <svg viewBox="0 0 300 400" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                      <defs>
                        <linearGradient id="gFace" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#F5F0FF" stopOpacity="0.95" />
                          <stop offset="100%" stopColor="#FFE8F0" stopOpacity="0.95" />
                        </linearGradient>
                        <linearGradient id="gCheek" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#FFB88C" />
                          <stop offset="100%" stopColor="#FF7E5F" />
                        </linearGradient>
                        <linearGradient id="gHair" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#8EC5FC" />
                          <stop offset="100%" stopColor="#4F8FE8" />
                        </linearGradient>
                        <linearGradient id="gPaper" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#A8F0C6" />
                          <stop offset="100%" stopColor="#4ADE80" />
                        </linearGradient>
                      </defs>
                      {/* 顔: 淡紫〜ピンクの点線楕円 */}
                      <ellipse cx="150" cy="175" rx="82" ry="108" fill="none" stroke="url(#gFace)" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" opacity="0.95" />
                      {/* 頬: オレンジ〜コーラルの円（0.24-0.36 / 0.64-0.76, 0.46-0.58 の中心） */}
                      <circle cx="93" cy="209" r="21" fill="none" stroke="url(#gCheek)" strokeWidth="3" strokeLinecap="round" />
                      <circle cx="207" cy="209" r="21" fill="none" stroke="url(#gCheek)" strokeWidth="3" strokeLinecap="round" />
                      <text x="93" y="248" fontSize="10" fill="#FF9569" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>頬</text>
                      <text x="207" y="248" fontSize="10" fill="#FF9569" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>頬</text>
                      {/* 髪: 水色〜青の円（0.40-0.60, 0.06-0.16 の中心） */}
                      <circle cx="150" cy="51" r="26" fill="none" stroke="url(#gHair)" strokeWidth="3" strokeLinecap="round" />
                      <text x="150" y="20" fontSize="10" fill="#6FA8F5" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>髪</text>
                      {/* 白紙: 黄緑〜緑の角丸楕円（0.34-0.66, 0.76-0.92 を包む） */}
                      <ellipse cx="150" cy="339" rx="52" ry="33" fill="none" stroke="url(#gPaper)" strokeWidth="3" strokeLinecap="round" />
                      <text x="150" y="387" fontSize="10" fill="#5EE897" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>白い紙をここに</text>
                    </svg>
                    <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>
                      枠に合わせて、正面から自然光の方を向いてください
                    </div>
                    </div>
                    {/* 撮影ボタン: パネル下端18px・中央固定（黒帯の中＝ガイドに被らない位置） */}
                    {phCamReady && (
                      <button onClick={phCapture} aria-label="撮影する"
                        style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
                          width: 68, height: 68, borderRadius: "50%", border: "4px solid #fff",
                          background: "radial-gradient(circle at 35% 30%, #fff, #E8E4DE)",
                          boxShadow: "0 4px 16px rgba(0,0,0,.4)", cursor: "pointer" }}>
                        <span style={{ display: "block", width: 50, height: 50, margin: "0 auto", borderRadius: "50%", background: "#1B1F2A" }} />
                      </button>
                    )}
                  </div>

                  {phCamReady && (
                    <button onClick={() => { stopPhCamera(); fileRef.current?.click(); }} className="w-full mt-2.5 py-2.5 text-xs" style={{ color: C.sub }}>かわりに写真を選ぶ</button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
                  <button onClick={() => { stopPhCamera(); setPhStep("intro"); }} className="w-full mt-2 py-3 text-xs" style={{ color: C.faint }}>条件を見直す</button>
                  <canvas ref={phCanvasRef} style={{ display: "none" }} />
                </>
              )}

              {/* ── STEP: analyzing ── */}
              {phStep === "analyzing" && (
                <div className="text-center py-14">
                  {phPreview && <img src={phPreview} alt="" style={{ width: 110, height: 110, objectFit: "cover", borderRadius: "50%", margin: "0 auto 22px", filter: "grayscale(.4)" }} />}
                  <div className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-3" style={{ borderColor: "#c3b4c4", borderTopColor: "transparent" }} />
                  <p className="text-sm" style={{ color: C.ink }}>色を測っています</p>
                  <p className="text-xs mt-1.5" style={{ color: C.sub }}>白い紙で照明を補正しています…</p>
                </div>
              )}

              {/* ── STEP: rejected（品質ゲート却下 → 撮り直し導線） ── */}
              {phStep === "rejected" && phReject && (
                <div>
                  <div style={{ borderLeft: "3px solid #c2410c", paddingLeft: 16, marginBottom: 20 }}>
                    <div className="font-serif text-lg mb-2" style={{ color: C.ink }}>{phReject.title}</div>
                    <p className="text-xs leading-relaxed" style={{ color: C.sub }}>{phReject.body}</p>
                  </div>
                  <p className="text-[11px] leading-relaxed mb-5" style={{ color: C.faint }}>
                    正しく測れない写真で結果をお出しすることはしていません。条件を整えると精度が上がります。
                  </p>
                  <button onClick={() => { setPhReject(null); setPhStep("guide"); }}
                    style={{ width: "100%", padding: 16, borderRadius: 999, border: "none", background: C.main, color: "#fff", fontSize: 14, cursor: "pointer" }}>
                    撮り直す
                  </button>
                  <button onClick={() => { setPhReject(null); setPhChecked({}); setPhDyed(null); setPhStep("intro"); }}
                    className="block w-full text-center px-6 py-3 rounded-full text-sm mt-2.5" style={{ border: "1px solid " + C.line, color: C.sub }}>
                    条件を見直す
                  </button>
                </div>
              )}

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
                  <div className="inline-flex items-center gap-2.5 mb-3 px-6 py-3 rounded-full text-2xl font-bold" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
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
            <Header title="この色、似合う？チェッカー" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2.5 mb-3 px-6 py-3 rounded-full text-2xl font-bold" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
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
                  <div className="inline-flex items-center gap-2.5 mb-3 px-6 py-3 rounded-full text-2xl font-bold" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => setMyType(null)} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
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
                    <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full text-lg font-bold" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                      {TYPES[myType].name}{myFrame ? ` × 骨格${FRAMES[myFrame].name}` : ""} <button onClick={() => { setMyType(null); setWdStep(1); }} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
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
        {/* ═══ SCORE（服の色 × タイプの色相性を CIELab で照合。外部通信なし） ═══ */}
        {mode === "score" && (
          <div>
            <Header title="今日のコーデ採点" onBack={goHome} />
            <div className="px-8 pb-12 pt-3">
              {!myType && <TypePicker value={myType} onChange={(k) => { setMyType(k); setMySecond(null); }} label="あなたのタイプは？（未診断なら12タイプ診断へ）" />}
              {myType && (
                <>
                  <div className="inline-flex items-center gap-2.5 mb-3 px-6 py-3 rounded-full text-2xl font-bold" style={{ background: TYPES[myType].accent + "14", color: TYPES[myType].accent }}>
                    {TYPES[myType].name} <button onClick={() => { setMyType(null); setScResult(null); setScStep("intro"); }} className="underline text-xs font-normal" style={{ color: C.faint }}>変更</button>
                  </div>

                  {/* ── STEP: intro ── */}
                  {scStep === "intro" && (
                    <>
                      <p className="text-xs leading-relaxed mb-4" style={{ color: C.sub }}>
                        今日のコーデを、トップスとボトムスの2か所で測って{TYPES[myType].name}との<strong style={{ color: C.ink }}>色の相性</strong>を採点します。写真は端末の中だけで処理され、送信も保存もされません。
                      </p>
                      <div className="rounded-2xl p-4 mb-5" style={{ background: "#faf7f9", border: "1px solid #f0e9ef" }}>
                        <p className="text-[11px] leading-relaxed" style={{ color: C.sub }}>
                          判定できるのは<strong style={{ color: C.ink }}>服の色とタイプの相性だけ</strong>です。シルエット・素材感・コーデのバランスは採点に含まれません。
                        </p>
                      </div>
                      <button onClick={() => { setScCamError(null); setScStep("guide"); }} className="w-full rounded-2xl py-10 flex flex-col items-center gap-3 mb-3" style={{ border: "2px dashed " + C.line, color: C.sub }}>
                        <Camera size={26} style={{ color: C.main }} />
                        <span className="text-sm">カメラで撮る（枠に合わせて撮影）</span>
                      </button>
                      <input ref={scFileRef} type="file" accept="image/*" className="hidden" onChange={onScorePhoto} />
                      <button onClick={() => scFileRef.current && scFileRef.current.click()} className="w-full py-3 rounded-full text-xs" style={{ border: "1px solid " + C.line, color: C.sub }}>
                        撮影済みの写真を選ぶ
                      </button>
                    </>
                  )}

                  {/* ── STEP: guide（ライブカメラ + トップス枠 / ボトムス枠） ── */}
                  {scStep === "guide" && (
                    <>
                      {!scCamReady && !scCamError && (
                        <div className="text-center py-2">
                          <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>
                            カメラを起動します。上の枠にトップス、下の枠にボトムスが重なる位置に立ってください。
                          </p>
                          <button onClick={startScCamera} style={{ width: "100%", padding: 16, borderRadius: 999, border: "none", background: C.main, color: "#fff", fontSize: 14, letterSpacing: "0.06em", cursor: "pointer" }}>
                            カメラを起動する
                          </button>
                          <div className="text-[11px] mt-2.5" style={{ color: C.faint }}>ブラウザからカメラの使用許可を聞かれたら「許可」を選んでください</div>
                        </div>
                      )}
                      {scCamError && (
                        <div className="text-center py-2">
                          <p className="text-xs leading-relaxed mb-3.5" style={{ color: "#c2410c" }}>
                            {scCamError === "denied"
                              ? "カメラの使用が許可されていません。ブラウザの設定でこのサイトのカメラ利用を許可してから、もう一度お試しください。"
                              : "カメラを起動できませんでした。かわりに、撮影済みの写真を選んでください。"}
                          </p>
                          <button onClick={() => scFileRef.current?.click()} style={{ width: "100%", padding: 16, borderRadius: 999, border: "none", background: C.main, color: "#fff", fontSize: 14, cursor: "pointer" }}>
                            写真を選ぶ
                          </button>
                          <button onClick={startScCamera} className="w-full mt-2.5 py-3 text-xs" style={{ color: C.sub }}>カメラをもう一度試す</button>
                        </div>
                      )}

                      {/* 外側パネル: 下端の黒帯にシャッターを置く（枠に被らせないため。顔写真診断と同じ構造） */}
                      <div style={{ position: "relative", display: scCamReady ? "block" : "none", background: "#000", borderRadius: 16, overflow: "hidden", paddingBottom: 96 }}>
                        {/* 内側ラッパ: オーバーレイSVGを映像と同じ高さに閉じ込める */}
                        <div style={{ position: "relative" }}>
                          <video ref={scVideoRef} playsInline muted style={{ width: "100%", display: "block", transform: "scaleX(-1)" }} />
                          {/* ガイド枠は SC_REGION と同じ座標。顔写真診断のグラデーションと同系統の配色にそろえる */}
                          <svg viewBox="0 0 300 400" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                            <defs>
                              <linearGradient id="gTops" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#FFB88C" />
                                <stop offset="100%" stopColor="#FF7E5F" />
                              </linearGradient>
                              <linearGradient id="gBottoms" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#8EC5FC" />
                                <stop offset="100%" stopColor="#4F8FE8" />
                              </linearGradient>
                            </defs>
                            {/* トップス: 相対 0.34-0.66 / 0.30-0.50 */}
                            <rect x="102" y="120" width="96" height="80" rx="14" fill="none" stroke="url(#gTops)" strokeWidth="3" strokeLinejoin="round" />
                            <text x="150" y="112" fontSize="10" fill="#FF9569" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>トップス</text>
                            {/* ボトムス: 相対 0.36-0.64 / 0.60-0.80 */}
                            <rect x="108" y="240" width="84" height="80" rx="14" fill="none" stroke="url(#gBottoms)" strokeWidth="3" strokeLinejoin="round" />
                            <text x="150" y="336" fontSize="10" fill="#6FA8F5" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>ボトムス</text>
                          </svg>
                          <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>
                            上の枠にトップス、下の枠にボトムスを合わせてください
                          </div>
                        </div>
                        {scCamReady && (
                          <button onClick={scCapture} aria-label="撮影する"
                            style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
                              width: 68, height: 68, borderRadius: "50%", border: "4px solid #fff",
                              background: "radial-gradient(circle at 35% 30%, #fff, #E8E4DE)",
                              boxShadow: "0 4px 16px rgba(0,0,0,.4)", cursor: "pointer" }}>
                            <span style={{ display: "block", width: 50, height: 50, margin: "0 auto", borderRadius: "50%", background: "#1B1F2A" }} />
                          </button>
                        )}
                      </div>
                      <input ref={scFileRef} type="file" accept="image/*" className="hidden" onChange={onScorePhoto} />
                      {scCamReady && (
                        <button onClick={() => { stopScCamera(); scFileRef.current?.click(); }} className="w-full mt-2.5 py-2.5 text-xs" style={{ color: C.sub }}>かわりに写真を選ぶ</button>
                      )}
                      <button onClick={() => { stopScCamera(); setScStep("intro"); }} className="w-full mt-2 py-3 text-xs" style={{ color: C.faint }}>戻る</button>
                      <canvas ref={scCanvasRef} style={{ display: "none" }} />
                    </>
                  )}

                  {/* ── STEP: analyzing ── */}
                  {scStep === "analyzing" && (
                    <div className="text-center py-14">
                      {scPreview && <img src={scPreview} alt="" style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 18, margin: "0 auto 22px" }} />}
                      <div className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mb-3" style={{ borderColor: "#c3b4c4", borderTopColor: "transparent" }} />
                      <p className="text-sm" style={{ color: C.ink }}>服の色を測っています</p>
                      <p className="text-xs mt-1.5" style={{ color: C.sub }}>トップスとボトムスの色を照合しています…</p>
                    </div>
                  )}

                  {/* ── STEP: rejected ── */}
                  {scStep === "rejected" && scReject && (
                    <div>
                      <div style={{ borderLeft: "3px solid #c2410c", paddingLeft: 16, marginBottom: 20 }}>
                        <div className="font-serif text-lg mb-2" style={{ color: C.ink }}>{scReject.title}</div>
                        <p className="text-xs leading-relaxed" style={{ color: C.sub }}>{scReject.body}</p>
                      </div>
                      <p className="text-[11px] leading-relaxed mb-5" style={{ color: C.faint }}>
                        正しく測れない写真で点数をお出しすることはしていません。
                      </p>
                      <button onClick={() => { setScReject(null); setScStep("guide"); }}
                        style={{ width: "100%", padding: 16, borderRadius: 999, border: "none", background: TYPES[myType].accent, color: "#fff", fontSize: 14, cursor: "pointer" }}>
                        撮り直す
                      </button>
                      <button onClick={() => { setScReject(null); setScStep("intro"); }} className="block w-full text-center px-6 py-3 rounded-full text-sm mt-2.5" style={{ border: "1px solid " + C.line, color: C.sub }}>
                        最初から
                      </button>
                    </div>
                  )}

                  {/* ── STEP: result ── */}
                  {scStep === "result" && scResult && (
                    <div className="fade-up">
                      {scPreview && (
                        <div className="rounded-2xl overflow-hidden mb-4" style={{ border: "1px solid " + C.line }}>
                          <img src={scPreview} alt="コーデ" className="w-full block" />
                        </div>
                      )}
                      <div className="rounded-2xl p-6 mb-4 text-center" style={{ background: "#faf7f9", border: "1px solid #f0e9ef" }}>
                        <div className="text-xs mb-1" style={{ color: C.faint }}>{TYPES[myType].name}との色の相性スコア</div>
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
                      <p className="mt-3 text-center text-[10px] leading-relaxed" style={{ color: "#b3aab2" }}>
                        ※この採点は服の色とタイプの相性のみを判定しています（シルエット・素材感は含みません）。<br />
                        照明により色の見え方は変わるため、傾向としてお楽しみください。
                      </p>
                      <button onClick={() => { setScResult(null); setScPreview(null); setScStep("intro"); }} className="block w-full text-center px-6 py-3 rounded-full text-sm mt-4" style={{ border: "1px solid " + C.line, color: C.sub }}>
                        別のコーデを採点する
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      {soonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" style={{ background: "rgba(40,35,45,0.45)" }} onClick={() => setSoonOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="inline-block text-xs px-3 py-1 rounded-full mb-3" style={{ background: "#ececec", color: "#8a8a8a" }}>近日公開</div>
            <h4 className="font-serif text-lg mb-2" style={{ color: C.ink }}>新機能は、近日公開！</h4>
            <p className="text-xs leading-relaxed mb-5" style={{ color: C.sub }}>この機能はもうすぐ使えるようになります。まずは12タイプ診断で、あなたの似合う色を見つけてみてください♡</p>
            <button onClick={() => { setSoonOpen(false); startQuiz(); }} className="w-full py-3 rounded-full text-white text-sm font-medium mb-2" style={{ background: C.main }}>12タイプ診断をはじめる</button>
            <button onClick={() => setSoonOpen(false)} className="w-full py-2.5 rounded-full text-xs" style={{ border: "1px solid " + C.line, color: "#8a8a8a" }}>閉じる</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
