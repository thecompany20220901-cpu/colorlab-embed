import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const DIR = "C:/Users/newfa/projects/colorlab-embed/src/assets";
const files = process.argv.slice(2);
const INSET = 12; // 中央の仕切り線を避ける内側マージン

const b = await chromium.launch();
const p = await b.newPage();
const out = {};

for (const f of files) {
  const buf = fs.readFileSync(path.join(DIR, f));
  const dataUrl = "data:image/png;base64," + buf.toString("base64");
  const r = await p.evaluate(async ({ dataUrl, INSET }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const half = Math.floor(img.width / 2);

    const scan = (x0, x1) => {
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      for (let y = 0; y < img.height; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4;
          const a = d[i + 3];
          if (a < 16) continue;                 // 透明は背景扱い
          // 純白に近い画素は背景とみなす
          if (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      return { minX, minY, maxX, maxY };
    };

    return {
      w: img.width, h: img.height,
      left: scan(0, half - INSET),
      right: scan(half + INSET, img.width),
    };
  }, { dataUrl, INSET });
  out[f] = r;
  console.log(f, JSON.stringify(r));
}

fs.writeFileSync("C:/Users/newfa/projects/colorlab-embed/test/_bbox.json", JSON.stringify(out, null, 2));
await b.close();
