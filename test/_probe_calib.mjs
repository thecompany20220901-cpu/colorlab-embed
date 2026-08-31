// フェイクカメラに流したときに「実際に届く a*」を候補色ごとに測る（較正用）
import { chromium } from "playwright";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import zlib from "zlib";
const __dirname = dirname(fileURLToPath(import.meta.url));
function crc32(buf){let c,t=crc32.t||(crc32.t=(()=>{const t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})());let crc=0xffffffff;for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function y4m(W,H,base,rects){
  const box=rects.map(([x0,y0,x1,y1,c])=>[Math.floor(x0*W),Math.floor(y0*H),Math.floor(x1*W),Math.floor(y1*H),c]);
  const at=(x,y)=>{let c=base;for(const[x0,y0,x1,y1,col]of box)if(x>=x0&&x<x1&&y>=y0&&y<y1)c=col;return c;};
  const Y=Buffer.alloc(W*H),U=Buffer.alloc(W*H/4),V=Buffer.alloc(W*H/4);
  const cl=(v)=>Math.max(0,Math.min(255,Math.round(v)));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const[r,g,b]=at(x,y);Y[y*W+x]=cl(.299*r+.587*g+.114*b);}
  for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){let r=0,g=0,b=0;
    for(const[dx,dy]of[[0,0],[1,0],[0,1],[1,1]]){const c=at(Math.min(W-1,x+dx),Math.min(H-1,y+dy));r+=c[0];g+=c[1];b+=c[2];}
    r/=4;g/=4;b/=4;const i=(y/2)*(W/2)+x/2;
    U[i]=cl(-.169*r-.331*g+.5*b+128);V[i]=cl(.5*r-.419*g-.081*b+128);}
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F5:1 Ip A1:1 C420mpeg2\n`,"ascii"),Buffer.from("FRAME\n","ascii"),Y,U,V]);
}
const CANDIDATES = [[248,176,156],[250,168,150],[252,160,142],[252,152,136],[250,144,128],[248,136,120]];
for (const cheek of CANDIDATES) {
  const f = join(tmpdir(), "calib.y4m");
  writeFileSync(f, y4m(480,640,[190,190,195],[
    [0.24,0.46,0.36,0.58,cheek],[0.64,0.46,0.76,0.58,cheek],
    [0.34,0.76,0.66,0.92,[235,232,228]],
  ]));
  const b = await chromium.launch({args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--use-file-for-fake-video-capture="+f]});
  const c = await b.newContext({viewport:{width:375,height:812},permissions:["camera"]});
  const p = await c.newPage();
  await p.goto(pathToFileURL(join(__dirname,"local_article.html")).href);
  const a = await p.evaluate(async () => {
    const v=document.createElement("video");v.autoplay=true;v.playsInline=true;v.muted=true;document.body.appendChild(v);
    v.srcObject=await navigator.mediaDevices.getUserMedia({video:true});await v.play();
    await new Promise(r=>setTimeout(r,700));
    const cv=document.createElement("canvas");cv.width=120;cv.height=160;
    const ctx=cv.getContext("2d",{willReadFrequently:true});ctx.drawImage(v,0,0,120,160);
    const med=(x0,y0,x1,y1)=>{const d=ctx.getImageData(Math.round(x0*120),Math.round(y0*160),Math.round((x1-x0)*120),Math.round((y1-y0)*160)).data;
      const r=[],g=[],bl=[];for(let i=0;i<d.length;i+=4){r.push(d[i]);g.push(d[i+1]);bl.push(d[i+2]);}
      const m=(a)=>{a.sort((p,q)=>p-q);return a[a.length>>1];};return [m(r),m(g),m(bl)];};
    const ch=med(0.242,0.504,0.340,0.578), pa=med(0.34,0.76,0.66,0.92);
    const srgb=(c)=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
    const g=[235/pa[0],235/pa[1],235/pa[2]];
    const [R,G,B]=ch.map((v,k)=>Math.min(255,v*g[k])).map(srgb);
    let X=R*.4124+G*.3576+B*.1805,Y2=R*.2126+G*.7152+B*.0722,Z=R*.0193+G*.1192+B*.9505;
    X/=.95047;Z/=1.08883;const f2=(t)=>t>0.008856?Math.cbrt(t):7.787*t+16/116;
    return 500*(f2(X)-f2(Y2));
  });
  console.log("塗り色 RGB(%d,%d,%d) → 実際に届く a* = %s %s", ...cheek, a.toFixed(1), a<=26?"厳密✓":(a<=29?"余裕✓":"余裕も外"));
  await b.close();
}
