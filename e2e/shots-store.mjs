// App Store 截圖：用 Chrome 開手機版網頁（mobile/www），模擬 App Store 版的 iPhone／iPad／Mac 外殼
// 用法：node scripts/build-mobile.mjs && node e2e/shots-store.mjs [輸出資料夾]
// 尺寸：iPhone 6.3 吋 1206×2622（直）、iPad 13 吋 2752×2064（橫）、Mac 2880×1800
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const outRoot = process.argv[2] || 'e2e/out/store';
const WWW = path.resolve('mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(WWW, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(8824);

const DEVICES = {
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, shim: { store: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' },
  ipad: { viewport: { width: 1376, height: 1032 }, deviceScaleFactor: 2, hasTouch: true, shim: { store: true },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)' },
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, shim: { store: true, mac: true },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)' },
};

const browser = await chromium.launch({ channel: 'chrome' });
let fail = 0;
for (const [name, dev] of Object.entries(DEVICES)) {
  const dir = path.join(outRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { shim, ...opts } = dev;
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((sh) => {
    window.XiaokeIOS = sh;
    window.webkit = { messageHandlers: { xkc: { postMessage: () => Promise.resolve({ status: 'ok' }) } } };
  }, shim);
  const page = await ctx.newPage();
  const waitFor = async (fn, arg, ms = 30000) => {
    const t = Date.now();
    for (;;) {
      const v = await page.evaluate(fn, arg).catch(() => false);
      if (v) return v;
      if (Date.now() - t > ms) throw new Error(name + ' 等待逾時：' + fn);
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  let n = 0;
  const shot = async (label) => { n++; await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, '0')}-${label}.png`) }); };
  const move = async (from, to) => {
    const k = await page.evaluate(() => window.__xkc.game.moves.length);
    await page.evaluate(([f, t]) => { const b = window.__xkcBoard; b.onSquareClick(f); b.onSquareClick(t); }, [from, to]);
    await waitFor((k) => window.__xkc.game.moves.length >= k + 2 && !window.__xkc.animating, k, 40000);
  };
  const home = async () => {
    await page.evaluate(() => document.querySelector('#btnHome').click());
    await page.waitForTimeout(500);
    await page.evaluate(() => { const b = document.querySelector('.modal button.primary'); if (b) b.click(); });
    await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  };
  try {
    await page.goto('http://localhost:8824/index.html');
    await page.waitForSelector('.pf', { timeout: 30000 });
    // 1. 選頭像（60 位英雄、佳人與軍師）
    await page.evaluate(() => { document.querySelector('.pf-item[data-id="m01"]').click(); });
    await page.waitForTimeout(600);
    await shot('portraits');
    await page.evaluate(() => { document.querySelector('.pf-tab[data-k="advisor"]').click(); document.querySelector('.pf-item[data-id="am03"]').click(); document.querySelector('.modal .pf-ok').click(); });
    await waitFor(() => !document.querySelector('.modal-back'));
    await page.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ playerName: '棋友', music: { autoplay: false }, level: 2 }); window.__xkc.render && window.__xkc.render(); });
    await page.reload();
    await waitFor(() => window.__xkc && window.__xkcBoard);
    await page.evaluate(() => document.querySelectorAll('.modal-back').forEach((b) => b.remove()));
    await page.evaluate(() => document.querySelector('.kindbtn[data-k="full"]').click());
    await page.waitForTimeout(800);
    // 2. 首頁
    await shot('home');
    // 3. 整盤對局（中局）＋軍師建議
    await page.evaluate(() => { document.querySelector('.segbtn[data-v="red"]').click(); document.querySelector('#startAI').click(); });
    await waitFor(() => window.__xkc.mode === 'ai');
    await page.waitForTimeout(3600);
    await move(7 * 9 + 7, 7 * 9 + 4);   // 炮二平五
    await move(9 * 9 + 7, 7 * 9 + 6);   // 馬二進三
    await move(9 * 9 + 8, 9 * 9 + 7);   // 車一平二
    await move(6 * 9 + 6, 5 * 9 + 6);   // 兵三進一
    await page.waitForTimeout(1200);
    await shot('full-game');
    if (name === 'iphone') await page.evaluate(() => document.querySelector('.tab[data-tab="advisor"]').click());
    else await page.evaluate(() => document.querySelector('.tab[data-tab="advisor"]').click());
    await page.evaluate(() => document.querySelector('.adv-quick button').click());
    await waitFor(() => [...document.querySelectorAll('.adv-msg.ai')].some((e) => e.textContent.includes('建議')), null, 40000);
    await page.waitForTimeout(1500);
    await shot('advisor');
    if (name === 'iphone') await page.evaluate(() => document.body.classList.remove('sheet-open'));
    // 4. 半盤（暗棋）
    await home();
    await page.evaluate(() => { document.querySelector('.kindbtn[data-k="half"]').click(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelector('.segbtn[data-v="first"]').click(); document.querySelector('#startAI').click(); });
    await waitFor(() => window.__xkc.kind === 'half');
    await page.waitForTimeout(3600);
    for (const sq of [12, 17, 21, 6, 26]) {
      const k = await page.evaluate(() => window.__xkc.game.moves.length);
      const ok = await page.evaluate((s) => { const g = window.__xkc.game; const b = window.__xkcBoard; if (g.result) return false; b.onSquareClick(s); return true; }, sq);
      if (!ok) break;
      await waitFor((k) => window.__xkc.game.moves.length >= k + 2 || window.__xkc.game.result, k, 40000).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1200);
    await shot('half-game');
    // 5. 遊戲說明（動畫＋語音）
    await home();
    await page.evaluate(() => document.querySelector('#btnGuide').click());
    await waitFor(() => document.querySelector('#scr-guide').classList.contains('on'));
    await page.evaluate(() => { const t = [...document.querySelectorAll('#scr-guide .gd-kind button, #scr-guide button')].find((b) => b.textContent.includes('整盤')); if (t) t.click(); });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const l = [...document.querySelectorAll('#scr-guide button')].find((b) => /馬/.test(b.textContent)); if (l) l.click(); });
    await page.waitForTimeout(4500);
    await shot('guide');
    console.log(`✔ ${name}：${n} 張 → ${dir}`);
  } catch (e) {
    fail++;
    console.log(`✘ ${name}：`, e.message);
    await page.screenshot({ path: path.join(dir, 'fail.png') }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
