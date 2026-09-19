// MINE（会員・答え合わせ）の API の置き場所。
// ステージング確認用のビルドだけ VITE_MINE_ENDPOINT で差し替える:
//   VITE_MINE_ENDPOINT=https://colorlab-selfcard-staging.the-company-20220901.workers.dev npx vite build ...
// 本番ビルド（npm run build）では未指定なので、既存の中継 Worker と同じ URL になる。
export const MINE_ENDPOINT =
  (import.meta.env && import.meta.env.VITE_MINE_ENDPOINT) ||
  "https://colorlab-selfcard.the-company-20220901.workers.dev";

// ログイン状態（セッショントークン）の保存先。読めない環境ではログインを保持しない
const SESSION_KEY = "colorlab-mine-session";
export const readSession = () => { try { return localStorage.getItem(SESSION_KEY) || ""; } catch (e) { return ""; } };
export const writeSession = (v) => { try { v ? localStorage.setItem(SESSION_KEY, v) : localStorage.removeItem(SESSION_KEY); } catch (e) {} };

export async function mineFetch(path, { method = "GET", body, session, form } = {}) {
  const headers = {};
  if (session) headers.Authorization = "Bearer " + session;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(MINE_ENDPOINT + path, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, ok: r.ok && !!(j && j.ok), j: j || {} };
}
