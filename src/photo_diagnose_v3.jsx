import React, { useState, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════
   Color Lab — 写真診断 v2
   設計変更: AIの目視判定 → 白基準補正つきの実測(CIELab)

   v10の問題: 写真をそのままClaudeに渡し「見て判断して」だけ。
   照明・ホワイトバランス未補正のため同一人物でも部屋で結果が変わる。
   撮影条件は文章で推奨するのみで強制も検証もなし。

   v2の解:
   1. 撮影条件をチェックリストで強制(全項目チェックまで進めない)
   2. 白い紙を一緒に写す → 写真内の「本来白い点」で照明ズレを機械補正
   3. 補正後の肌・髪をサンプリングしCIELabへ変換
   4. 3軸(色相/明度/清濁)を数値算出 → 4タイプへ規則で分類
   5. 品質ゲート: 暗すぎ/白飛び/白基準なし/強い色かぶりは判定前に却下
   6. 計測値を全部開示(ブラックボックスにしない=信頼の源泉)
   ═══════════════════════════════════════════════════════ */

/* ---------- 色科学 ---------- */
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
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
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

/* ---------- 判定エンジン ---------- */
const UTM = "utm_source=colorlab&utm_medium=app&utm_campaign=photo_v2";
const TYPE_DEF = {
  spring: { name: "イエベ春", tone: "Warm × Light × Clear", site: "iebel", tag: 1 },
  autumn: { name: "イエベ秋", tone: "Warm × Deep × Soft", site: "iebel", tag: 2 },
  summer: { name: "ブルベ夏", tone: "Cool × Light × Soft", site: "blubel", tag: 1 },
  winter: { name: "ブルベ冬", tone: "Cool × Deep × Clear", site: "blubel", tag: 2 },
};
/* 勝ち色パレット(各タイプ代表5色・記事の色マスターと同一HEX) */
const WIN_COLORS = {
  spring: ["#F98D7A", "#F2C84B", "#F0A868", "#F4B0A0", "#A8C878"],
  autumn: ["#C56B4A", "#C99A2E", "#B8895A", "#7A2E2E", "#6B6B3A"],
  summer: ["#C9B8D9", "#D98FA8", "#A8C8E0", "#F2F0F5", "#7B93A8"],
  winter: ["#232B45", "#6E1E37", "#2F5CB5", "#D6236E", "#FFFFFF"],
};

function diagnose(skinLab, hairLab, skinRGB, hairDyed) {
  /* 軸1: 色相(暖/寒)
     肌のb*(黄み)とa*(赤み)の比。日本人の肌はb*=12〜24が中心域。
     b*が高くa*との差が大きいほどWarm寄り。 */
  const warmRaw = skinLab.b - skinLab.a * 0.55;
  const warmth = clamp01((warmRaw - 4) / 14); // 0=Cool 1=Warm

  /* 軸2: 明度
     肌のL*。日本人の肌はL*=58〜75が中心域。 */
  const lightness = clamp01((skinLab.L - 56) / 20); // 0=Deep 1=Light

  /* 軸3: 清濁
     肌の彩度C*と、髪と肌の明度差(コントラスト)。
     コントラストが高く彩度が明瞭ほどClear。 */
  const chromaC = Math.sqrt(skinLab.a ** 2 + skinLab.b ** 2);
  const contrast = Math.abs(skinLab.L - hairLab.L);
  /* 染髪している場合、髪コントラストは地の色素を反映しないため
     重みを肌の彩度側へ寄せる(プロは地毛・瞳で清濁を見る) */
  const wC = hairDyed ? 0.85 : 0.45;
  const wK = hairDyed ? 0.15 : 0.55;
  const clarity = clamp01(((chromaC - 12) / 12) * wC + ((contrast - 22) / 30) * wK);

  /* 4タイプへの距離(各タイプの理想座標との近さ) */
  const targets = {
    spring: [1, 1, 1],
    autumn: [1, 0, 0],
    summer: [0, 1, 0],
    winter: [0, 0, 1],
  };
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
      L: skinLab.L.toFixed(1),
      a: skinLab.a.toFixed(1),
      b: skinLab.b.toFixed(1),
      chroma: chromaC.toFixed(1),
      contrast: contrast.toFixed(1),
      hairL: hairLab.L.toFixed(1),
    },
    skinHex: hex(skinRGB.r, skinRGB.g, skinRGB.b),
    confidence,
    gap: gap.toFixed(2),
  };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---------- 撮影条件 ---------- */
const CONDITIONS = [
  { id: "window", label: "窓から1m以内・日中の自然光で撮る", why: "蛍光灯やLEDは色が偏ります" },
  { id: "noLight", label: "照明を消す(自然光だけにする)", why: "光が混ざると補正できません" },
  { id: "white", label: "白い紙かハンカチを顎の下に持つ", why: "照明のズレを補正する基準になります" },
  { id: "hair", label: "髪を耳にかけ、顔まわりを出す", why: "頬の色を正しく測るためです" },
  { id: "bare", label: "ノーメイクか薄化粧にする", why: "ファンデーションの色を測ってしまいます" },
];

export default function PhotoDiagnoseV2() {
  const [step, setStep] = useState("intro"); // intro | guide | analyzing | result | rejected
  const [checked, setChecked] = useState({});
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [reject, setReject] = useState(null);
  const [hairDyed, setHairDyed] = useState(null); // null=未回答 true/false
  const hairDyedRef = useRef(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const allChecked = CONDITIONS.every((c) => checked[c.id]);

  /* ライブカメラ起動(証明写真アプリ同様、ガイドを重ねて自分で位置合わせできるようにする) */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (e) {
      setCameraError(e.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const captureFromVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const cv = canvasRef.current || document.createElement("canvas");
    cv.width = video.videoWidth;
    cv.height = video.videoHeight;
    const ctx = cv.getContext("2d");
    // 前面カメラは左右反転して見えるが、鏡像のまま解析しても頬の左右判定に影響しないため反転補正は不要
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", 0.92);
    stopCamera();
    setPreview(dataUrl);
    setStep("analyzing");
    setTimeout(() => analyze(dataUrl), 400);
  }, [stopCamera]);

  const analyze = useCallback((dataUrl) => {
    const img = new Image();
    img.onload = () => {
      const W = 600;
      const H = Math.round((img.height / img.width) * W);
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);

      /* ガイド枠に対応した固定サンプリング領域(相対座標) */
      const whiteRef = sampleRegion(data, W, H, 0.34, 0.76, 0.66, 0.92); // 顎下の白い紙
      const cheekL = sampleRegion(data, W, H, 0.24, 0.46, 0.36, 0.58);
      const cheekR = sampleRegion(data, W, H, 0.64, 0.46, 0.76, 0.58);
      const hairS = sampleRegion(data, W, H, 0.40, 0.06, 0.60, 0.16);

      if (!whiteRef || !cheekL || !cheekR || !hairS) {
        setReject({ title: "写真を読み取れませんでした", body: "もう一度撮影してください。" });
        setStep("rejected"); return;
      }

      /* --- 品質ゲート --- */
      const wMax = Math.max(whiteRef.r, whiteRef.g, whiteRef.b);
      const wMin = Math.min(whiteRef.r, whiteRef.g, whiteRef.b);

      if (wMax < 120) {
        setReject({
          title: "白い紙が写っていないか、暗すぎます",
          body: "顎の下に白い紙を持ち、窓の近くでもう一度撮ってください。白い紙が明るく写っている必要があります。",
        }); setStep("rejected"); return;
      }
      if (wMax > 252 && wMin > 250) {
        setReject({
          title: "光が強すぎて白が飛んでいます",
          body: "直射日光を避け、窓から少し離れて撮り直してください。",
        }); setStep("rejected"); return;
      }
      const castRatio = (wMax - wMin) / wMax;
      if (castRatio > 0.28) {
        setReject({
          title: "照明の色が強く偏っています",
          body: "室内照明を消し、日中の自然光だけで撮り直してください。オレンジや青の光が混ざると測れません。",
        }); setStep("rejected"); return;
      }

      /* --- ホワイトバランス補正 + 露出正規化 ---
         白紙の色偏りを均し(チャンネル別ゲイン)、さらに白紙が
         固定輝度(235 ≒ L*93)になるよう全体をスケール。
         これで「色の偏り」と「露出の明暗」の両方を補正する。 */
      const WHITE_TARGET = 235;
      const k = WHITE_TARGET / wMax;
      const gain = {
        r: (wMax / whiteRef.r) * k,
        g: (wMax / whiteRef.g) * k,
        b: (wMax / whiteRef.b) * k,
      };
      const corr = (s) => ({
        r: Math.min(255, s.r * gain.r),
        g: Math.min(255, s.g * gain.g),
        b: Math.min(255, s.b * gain.b),
      });

      const skinRaw = {
        r: (cheekL.r + cheekR.r) / 2,
        g: (cheekL.g + cheekR.g) / 2,
        b: (cheekL.b + cheekR.b) / 2,
      };
      const skin = corr(skinRaw);
      const hair = corr(hairS);

      const skinLab = rgbToLab(skin.r, skin.g, skin.b);
      const hairLab = rgbToLab(hair.r, hair.g, hair.b);

      /* --- 測定妥当性ゲート --- */
      // (a) 左右の頬が大きく違う = 位置ズレ or 片側からの強い光。どちらも測定不能
      const cL = corr(cheekL), cR = corr(cheekR);
      const lLab = rgbToLab(cL.r, cL.g, cL.b), rLab = rgbToLab(cR.r, cR.g, cR.b);
      const cheekDiff = Math.sqrt((lLab.L - rLab.L) ** 2 + (lLab.a - rLab.a) ** 2 + (lLab.b - rLab.b) ** 2);
      if (cheekDiff > 14) {
        setReject({
          title: "左右の頬で色が大きく違っています",
          body: "顔の位置がガイドとずれているか、横から片側だけに光が当たっています。窓に正面から向き、顔を楕円の中央に合わせて撮り直してください。",
        }); setStep("rejected"); return;
      }
      // (b) 肌として生理的にあり得る範囲か(壁・髪・服を測っていないか)
      const skinOk =
        skinLab.L >= 40 && skinLab.L <= 88 &&
        skinLab.a >= 2 && skinLab.a <= 26 &&
        skinLab.b >= 4 && skinLab.b <= 32;
      if (!skinOk) {
        setReject({
          title: "頬の位置で肌以外を測ってしまいました",
          body: "顔をガイドの楕円に合わせ、頬がオレンジの枠に重なるように撮り直してください。前髪やマスクが頬にかかっていないかも確認してください。",
        }); setStep("rejected"); return;
      }

      const r = diagnose(skinLab, hairLab, skin, hairDyedRef.current);
      r.wb = {
        refHex: hex(whiteRef.r, whiteRef.g, whiteRef.b),
        gain: `R${gain.r.toFixed(2)} G${gain.g.toFixed(2)} B${gain.b.toFixed(2)}`,
        cast: (castRatio * 100).toFixed(1),
      };
      r.hairHex = hex(hair.r, hair.g, hair.b);
      setResult(r);
      setStep("result");
    };
    img.onerror = () => {
      setReject({ title: "画像を開けませんでした", body: "別の写真でお試しください。" });
      setStep("rejected");
    };
    img.src = dataUrl;
  }, []);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      setPreview(rd.result);
      setStep("analyzing");
      setTimeout(() => analyze(rd.result), 400);
    };
    rd.readAsDataURL(f);
  };

  const restart = () => {
    setStep("intro"); setChecked({}); setPreview(null); setResult(null); setReject(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ---------- スタイル ---------- */
  const ink = "#1B1F2A", sub = "#6B7280", line = "#E4E2DD", paper = "#FAFAF7";
  const serif = '"Hiragino Mincho ProN","Yu Mincho",serif';

  return (
    <div style={{ background: paper, minHeight: "100%", fontFamily: '"Hiragino Sans","Yu Gothic",sans-serif', color: ink }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 20px 48px" }}>

        {/* ヘッダー */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", color: sub, marginBottom: 6 }}>COLOR LAB</div>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, margin: 0, lineHeight: 1.4 }}>
            写真で測る<br />パーソナルカラー
          </h1>
        </div>

        {/* STEP: intro */}
        {step === "intro" && (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.9, color: sub, marginBottom: 24 }}>
              写真の色は照明で大きく変わります。この診断では<strong style={{ color: ink }}>白い紙を一緒に写して照明のズレを補正</strong>し、肌と髪の色を数値で測ります。条件を満たさない写真は判定せずにお返しします。
            </p>

            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: sub, marginBottom: 12 }}>撮影条件（すべて必要です）</div>
            {CONDITIONS.map((c) => (
              <label key={c.id} style={{
                display: "flex", gap: 12, padding: "14px 0", borderBottom: `1px solid ${line}`, cursor: "pointer", alignItems: "flex-start",
              }}>
                <input
                  type="checkbox"
                  checked={!!checked[c.id]}
                  onChange={() => setChecked((s) => ({ ...s, [c.id]: !s[c.id] }))}
                  style={{ marginTop: 3, width: 17, height: 17, accentColor: ink, flexShrink: 0 }}
                />
                <span>
                  <span style={{ display: "block", fontSize: 14, lineHeight: 1.5 }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: sub, marginTop: 3 }}>{c.why}</span>
                </span>
              </label>
            ))}

            {/* 染髪の確認(清濁軸の測り方が変わる) */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, marginBottom: 10 }}>髪を染めていますか？(明るめのカラーやブリーチ)</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["yes", "染めている"], ["no", "地毛に近い"]].map(([v, l]) => (
                  <button key={v}
                    onClick={() => { setHairDyed(v === "yes"); hairDyedRef.current = v === "yes"; }}
                    style={{
                      flex: 1, padding: "11px 0", fontSize: 13, cursor: "pointer", borderRadius: 2,
                      border: `1px solid ${hairDyed === (v === "yes") ? ink : line}`,
                      background: hairDyed === (v === "yes") ? ink : "#fff",
                      color: hairDyed === (v === "yes") ? "#fff" : ink,
                    }}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: sub, marginTop: 6 }}>染めている場合、髪の色は判定に使わず肌の彩度で清濁を測ります</div>
            </div>

            <button
              onClick={() => setStep("guide")}
              disabled={!allChecked || hairDyed === null}
              style={{
                width: "100%", marginTop: 24, padding: "16px", borderRadius: 2, border: "none",
                background: (allChecked && hairDyed !== null) ? ink : "#D6D3CE", color: "#fff", fontSize: 14, letterSpacing: "0.08em",
                cursor: (allChecked && hairDyed !== null) ? "pointer" : "not-allowed", transition: "background .2s",
              }}
            >
              {(allChecked && hairDyed !== null) ? "撮影にすすむ" : "すべての項目に答えてください"}
            </button>
          </>
        )}

        {/* STEP: guide(ライブカメラ+リアルタイムガイド。証明写真アプリと同様、位置合わせしながら撮れる) */}
        {step === "guide" && (
          <>
            {!cameraReady && !cameraError && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <p style={{ fontSize: 13, lineHeight: 1.9, color: sub, marginBottom: 20 }}>
                  カメラを起動します。顔を枠に、白い紙を下の枠に合わせてから撮影してください。
                </p>
                <button
                  onClick={startCamera}
                  style={{ width: "100%", padding: 16, borderRadius: 2, border: "none", background: ink, color: "#fff", fontSize: 14, letterSpacing: "0.08em", cursor: "pointer" }}
                >
                  カメラを起動する
                </button>
                <div style={{ fontSize: 11, color: sub, marginTop: 10 }}>ブラウザからカメラの使用許可を聞かれたら「許可」を選んでください</div>
              </div>
            )}

            {cameraError && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <p style={{ fontSize: 13, lineHeight: 1.9, color: "#C2410C", marginBottom: 14 }}>
                  {cameraError === "denied"
                    ? "カメラの使用が許可されていません。ブラウザの設定でこのサイトのカメラ利用を許可してから、もう一度お試しください。"
                    : "カメラを起動できませんでした。かわりに、標準カメラで撮った写真を選んでください。"}
                </p>
                <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={onFile} style={{ display: "none" }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ width: "100%", padding: 16, borderRadius: 2, border: "none", background: ink, color: "#fff", fontSize: 14, cursor: "pointer" }}
                >
                  写真を選ぶ
                </button>
                <button onClick={startCamera} style={{ width: "100%", marginTop: 10, padding: 12, border: "none", background: "none", color: sub, fontSize: 12.5, cursor: "pointer" }}>
                  カメラをもう一度試す
                </button>
              </div>
            )}

            <div style={{ position: "relative", display: cameraReady ? "block" : "none", background: "#000", borderRadius: 2, overflow: "hidden" }}>
              <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block", transform: "scaleX(-1)" }} />
              {/* リアルタイムガイドのオーバーレイ(サンプリング座標は不変・見た目のみ丸型+グラデーションに変更) */}
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
                {/* 顔: 楕円のまま、グラデーション線+太めのソフトな見た目 */}
                <ellipse cx="150" cy="175" rx="82" ry="108" fill="none" stroke="url(#gFace)" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" opacity="0.95" />
                {/* 頬: 四角→丸に変更。サンプリング範囲(0.24-0.36 / 0.64-0.76, 0.46-0.58)の中心に配置 */}
                <circle cx="93" cy="209" r="21" fill="none" stroke="url(#gCheek)" strokeWidth="3" strokeLinecap="round" />
                <circle cx="207" cy="209" r="21" fill="none" stroke="url(#gCheek)" strokeWidth="3" strokeLinecap="round" />
                <text x="93" y="248" fontSize="10" fill="#FF9569" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>頬</text>
                <text x="207" y="248" fontSize="10" fill="#FF9569" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>頬</text>
                {/* 髪: 四角→丸に変更。サンプリング範囲(0.40-0.60, 0.06-0.16)の中心に配置 */}
                <circle cx="150" cy="51" r="26" fill="none" stroke="url(#gHair)" strokeWidth="3" strokeLinecap="round" />
                <text x="150" y="20" fontSize="10" fill="#6FA8F5" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>髪</text>
                {/* 白紙: 角丸の楕円に変更。サンプリング範囲(0.34-0.66, 0.76-0.92)を包む */}
                <ellipse cx="150" cy="339" rx="52" ry="33" fill="none" stroke="url(#gPaper)" strokeWidth="3" strokeLinecap="round" />
                <text x="150" y="387" fontSize="10" fill="#5EE897" textAnchor="middle" fontWeight="bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}>白い紙をここに</text>
              </svg>
              <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>
                枠に合わせて、正面から自然光の方を向いてください
              </div>

              {/* 撮影ボタンを映像に重ねて下部固定(親指が届く位置) */}
              {cameraReady && (
                <button
                  onClick={captureFromVideo}
                  aria-label="撮影する"
                  style={{
                    position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
                    width: 68, height: 68, borderRadius: "50%", border: "4px solid #fff",
                    background: "radial-gradient(circle at 35% 30%, #fff, #E8E4DE)",
                    boxShadow: "0 4px 16px rgba(0,0,0,.4)", cursor: "pointer",
                  }}
                >
                  <span style={{ display: "block", width: 50, height: 50, margin: "0 auto", borderRadius: "50%", background: ink }} />
                </button>
              )}
            </div>

            {cameraReady && (
              <button
                onClick={() => { stopCamera(); fileRef.current?.click(); }}
                style={{ width: "100%", marginTop: 10, padding: 10, border: "none", background: "none", color: sub, fontSize: 12, cursor: "pointer" }}
              >
                かわりに写真を選ぶ
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />

            <button onClick={() => { stopCamera(); setStep("intro"); }} style={{ width: "100%", marginTop: 10, padding: 12, border: "none", background: "none", color: sub, fontSize: 12.5, cursor: "pointer" }}>
              条件を見直す
            </button>
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </>
        )}

        {/* STEP: analyzing */}
        {step === "analyzing" && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            {preview && <img src={preview} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: "50%", marginBottom: 24, filter: "grayscale(.4)" }} />}
            <div style={{ fontFamily: serif, fontSize: 16 }}>色を測っています</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 8 }}>白い紙で照明を補正しています…</div>
          </div>
        )}

        {/* STEP: rejected */}
        {step === "rejected" && reject && (
          <div>
            <div style={{ borderLeft: `3px solid #C2410C`, paddingLeft: 16, marginBottom: 24 }}>
              <div style={{ fontFamily: serif, fontSize: 18, marginBottom: 8 }}>{reject.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.9, color: sub }}>{reject.body}</div>
            </div>
            <p style={{ fontSize: 12, color: sub, lineHeight: 1.8, marginBottom: 20 }}>
              正しく測れない写真で結果をお出しすることはしていません。条件を整えると精度が上がります。
            </p>
            <button onClick={() => setStep("guide")} style={{ width: "100%", padding: 16, borderRadius: 2, border: "none", background: ink, color: "#fff", fontSize: 14, cursor: "pointer" }}>
              撮り直す
            </button>
            <button onClick={restart} style={{ width: "100%", marginTop: 10, padding: 12, border: "none", background: "none", color: sub, fontSize: 12.5, cursor: "pointer" }}>
              最初から
            </button>
          </div>
        )}

        {/* STEP: result */}
        {step === "result" && result && (
          <div>
            {/* 実測した肌色そのものをアクセントにする */}
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 22 }}>
              <div style={{ width: 56, height: 56, background: result.skinHex, border: `1px solid ${line}`, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", color: sub }}>YOUR MEASURED SKIN</div>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 13, marginTop: 3 }}>{result.skinHex}</div>
              </div>
            </div>

            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: sub }}>1st TYPE</div>
            <div style={{ fontFamily: serif, fontSize: 32, margin: "4px 0 2px" }}>{TYPE_DEF[result.first].name}</div>
            <div style={{ fontSize: 12, color: sub, marginBottom: 4 }}>{TYPE_DEF[result.first].tone}</div>
            <div style={{ fontSize: 12.5, color: sub, marginBottom: 24 }}>
              2nd: {TYPE_DEF[result.second].name}
            </div>

            {/* 3軸 */}
            {[
              { k: "warmth", l: "色相", left: "Cool 青み", right: "Warm 黄み" },
              { k: "lightness", l: "明度", left: "Deep 深い", right: "Light 明るい" },
              { k: "clarity", l: "清濁", left: "Soft 穏やか", right: "Clear 明瞭" },
            ].map((ax) => (
              <div key={ax.k} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: sub, marginBottom: 6 }}>
                  <span>{ax.left}</span><span style={{ color: ink }}>{ax.l}</span><span>{ax.right}</span>
                </div>
                <div style={{ height: 3, background: line, position: "relative" }}>
                  <div style={{ position: "absolute", left: `${result.axes[ax.k]}%`, top: -4, width: 2, height: 11, background: ink }} />
                </div>
              </div>
            ))}

            {/* 計測値の開示 = 信頼の源泉 */}
            <div style={{ marginTop: 28, borderTop: `1px solid ${line}`, paddingTop: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: sub, marginBottom: 12 }}>実測値</div>
              <table style={{ width: "100%", fontSize: 12, fontFamily: "ui-monospace,monospace", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["肌 L*(明度)", result.metrics.L],
                    ["肌 a*(赤み)", result.metrics.a],
                    ["肌 b*(黄み)", result.metrics.b],
                    ["肌 彩度 C*", result.metrics.chroma],
                    ["髪との明度差", result.metrics.contrast],
                    ["白基準の色かぶり", result.wb.cast + "%"],
                    ["補正ゲイン", result.wb.gain],
                    ["1位2位の差", result.gap],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: "5px 0", color: sub, fontFamily: '"Hiragino Sans",sans-serif' }}>{k}</td>
                      <td style={{ padding: "5px 0", textAlign: "right" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
                <div style={{ width: 22, height: 22, background: result.skinHex, border: `1px solid ${line}` }} />
                <span style={{ fontSize: 11, color: sub }}>補正後の肌</span>
                <div style={{ width: 22, height: 22, background: result.hairHex, border: `1px solid ${line}`, marginLeft: 8 }} />
                <span style={{ fontSize: 11, color: sub }}>補正後の髪</span>
                <div style={{ width: 22, height: 22, background: result.wb.refHex, border: `1px solid ${line}`, marginLeft: 8 }} />
                <span style={{ fontSize: 11, color: sub }}>補正前の白紙</span>
              </div>
            </div>

            {/* 信頼度 */}
            <div style={{
              marginTop: 22, padding: 14,
              background: result.confidence === "low" ? "#FEF3C7" : "#fff",
              border: `1px solid ${result.confidence === "low" ? "#FCD34D" : line}`,
            }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                {result.confidence === "high" && "この結果ははっきり出ています。1位と2位の差が十分にあります。"}
                {result.confidence === "medium" && `1位と2位が近い結果です。${TYPE_DEF[result.second].name}の色も試してみてください。`}
                {result.confidence === "low" && `${TYPE_DEF[result.first].name}と${TYPE_DEF[result.second].name}がほぼ同点です。質問式の12タイプ診断もあわせてお試しください。`}
              </div>
            </div>

            <p style={{ fontSize: 11, color: sub, lineHeight: 1.8, marginTop: 18 }}>
              写真はこの計測のためだけに端末内で処理され、送信も保存もされません。撮影環境により結果は変わります。確実に知りたい方はプロの対面診断をおすすめします。
            </p>

            {/* あなたの勝ち色 → EC導線 */}
            <div style={{ marginTop: 26, borderTop: `1px solid ${line}`, paddingTop: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: sub, marginBottom: 10 }}>
                {TYPE_DEF[result.first].name}の勝ち色
              </div>
              <div style={{ display: "flex", height: 44, marginBottom: 14 }}>
                {WIN_COLORS[result.first].map((c) => (
                  <div key={c} style={{ flex: 1, background: c, border: c === "#FFFFFF" || c === "#F2F0F5" ? `1px solid ${line}` : "none" }} />
                ))}
              </div>
              <a
                href={`https://www.${TYPE_DEF[result.first].site}.jp/tag/${TYPE_DEF[result.first].tag}?${UTM}`}
                target="_blank" rel="noreferrer"
                style={{ display: "block", textAlign: "center", padding: 15, background: ink, color: "#fff", fontSize: 13.5, textDecoration: "none", letterSpacing: "0.06em" }}
              >
                {TYPE_DEF[result.first].name}に似合う服を見る
              </a>
            </div>

            {/* 校正ログ(タイプ既知の協力者データを貯めて閾値を実測校正するための機能) */}
            <button
              onClick={() => {
                const log = JSON.stringify({ v: "2.1", ts: Date.now(), first: result.first, second: result.second, axes: result.axes, metrics: result.metrics, wb: result.wb, dyed: hairDyedRef.current });
                navigator.clipboard?.writeText(log);
              }}
              style={{ width: "100%", marginTop: 10, padding: 10, border: "none", background: "none", color: "#C4BFC9", fontSize: 10.5, cursor: "pointer" }}
            >
              計測ログをコピー(校正用)
            </button>

            <button onClick={restart} style={{ width: "100%", marginTop: 6, padding: 16, borderRadius: 2, border: `1px solid ${ink}`, background: "none", color: ink, fontSize: 14, cursor: "pointer" }}>
              もう一度測る
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
