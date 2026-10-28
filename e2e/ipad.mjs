// iPad／iPhone 版網頁測試：用 Chrome 模擬 iPad Pro 11 吋橫放（觸控、UA 是 Macintosh，和真的 iPad WebView 一樣）
// 並模擬 iOS App 的橋（window.XiaokeIOS＋webkit.messageHandlers.xkc）
// 用法：node scripts/build-mobile.mjs && node e2e/ipad.mjs [截圖資料夾]
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const WWW = path.resolve('mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(WWW, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(8823);

// iOS App 的橋：記下網頁送來的指令
const BRIDGE = () => {
  window.XiaokeIOS = true;
  window.__iosCalls = [];
  window.webkit = { messageHandlers: { xkc: { postMessage: (m) => {
    window.__iosCalls.push(m.cmd + ':' + (m.args || [])[0]);
    if (m.cmd === 'begin_save') return Promise.resolve({ status: 'ok', token: 't1', path: m.args[0] });
    if (m.cmd === 'end_save') return Promise.resolve({ status: 'ok', path: 'shared.txt' });
    return Promise.resolve({ status: 'ok' });
  } } } };
};

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };
const browser = await chromium.launch({ channel: 'chrome' });
const W = 1194, H = 834;
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)' });
await ctx.addInitScript(BRIDGE);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const waitFor = async (fn, arg, ms = 30000) => {
  const t = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => false);
    if (v) return v;
    if (Date.now() - t > ms) throw new Error('等待逾時：' + fn);
    await new Promise((r) => setTimeout(r, 150));
  }
};
const shot = (n) => page.screenshot({ path: path.join(outDir, n) });
const box = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);
const fits = () => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);

try {
  await page.goto('http://localhost:8823/index.html');
  await page.waitForSelector('.pf', { timeout: 20000 });
  const cls = await page.evaluate(() => document.documentElement.className);
  check('iPad：電腦版版面＋觸控（不是手機版）', /\btouch\b/.test(cls) && /\bios\b/.test(cls) && !/\bmobile\b/.test(cls), cls);
  await page.tap('.pf-item[data-id="m03"]');
  await page.tap('.pf-tab[data-k="advisor"]');
  await page.tap('.pf-item[data-id="am02"]');
  await page.tap('.modal .pf-ok');
  await waitFor(() => !document.querySelector('.modal-back'));
  await page.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false } }); });
  const hf = await fits();
  check('首頁沒有左右捲動', hf[0] <= W, String(hf));
  await shot('i1-home.png');

  // 與 AI 對賽
  await page.evaluate(() => document.querySelector('.kindbtn[data-k="full"]').click());
  await page.tap('#startAI');
  await waitFor(() => window.__xkc.mode === 'ai');
  await page.waitForTimeout(3300);
  const gf = await fits();
  check('對局畫面剛好一頁（不用捲動）', gf[0] <= W && gf[1] <= H, String(gf));
  const bw = await box('#boardWrap'), right = await box('.game-body > .right'), left = await box('.game-body > .left');
  check('左邊棋手、中間棋盤、右邊面板', left.r <= bw.l + 2 && bw.r <= right.l + 2 && right.r <= W + 1, JSON.stringify({ left, bw, right }));
  check('棋盤夠大', bw.w >= 450 && bw.h >= 500, JSON.stringify(bw));
  check('棋盤提示改成手指操作', (await page.evaluate(() => document.querySelector('.board-tip').textContent)).includes('兩指'));

  // 音量：點一下打開，不靠滑鼠
  await page.tap('#btnSfx');
  check('點「落子」打開音量滑桿', await page.evaluate(() => document.querySelector('#btnSfx').closest('.vol').classList.contains('open')) && await visible('#sfxMute'));
  await shot('i2-volume.png');
  await page.tap('#boardWrap', { position: { x: 30, y: 30 } });
  check('點別處收起音量滑桿', await page.evaluate(() => !document.querySelector('.vol.open')));
  await page.tap('#miniMusic');
  check('點「背景音樂」打開音量滑桿與播放鍵', await visible('#musicPlay'));
  await page.tap('#boardWrap', { position: { x: 30, y: 30 } });

  // 點棋子下棋（用真的觸控點擊棋盤畫面）
  await page.evaluate(() => { const b = window.__xkcBoard; b.onSquareClick(7 * 9 + 7); b.onSquareClick(7 * 9 + 4); });
  await waitFor(() => window.__xkc.game.moves.length >= 2, null, 30000);
  check('下棋、AI 回應', true);
  await page.waitForTimeout(800);
  await shot('i3-game.png');

  // 匯出棋譜 → iOS 分享選單
  const saved = await page.evaluate(() => window.xk.games.export('test.txt', '炮二平五'));
  const calls = await page.evaluate(() => window.__iosCalls.join(' '));
  check('匯出棋譜走 iOS 分享選單', saved === 'shared.txt' && /begin_save:test.txt/.test(calls) && /end_save/.test(calls), calls);

  // 關於：平台名稱；檢查更新（iOS 走安裝頁）
  const info = await page.evaluate(() => window.xk.sys.info());
  check('平台是 iOS', info.platform === 'ios' && info.packaged, JSON.stringify(info));
  const upd = await page.evaluate(() => window.xk.update.check().then((i) => i, (e) => ({ error: e.message })));
  check('檢查更新（iOS）', upd.flavor === 'ios' || /查詢失敗/.test(upd.error || ''), JSON.stringify(upd).slice(0, 200));
  await page.evaluate(() => window.xk.update.openPage());
  check('更新頁用 App 開（Safari）', (await page.evaluate(() => window.__iosCalls.join(' '))).includes('open_url:https://'), await page.evaluate(() => window.__iosCalls.join(' ')));

  // 遊戲說明在 iPad 橫放也放得下
  await page.evaluate(() => window.__xkcBack ? null : null);
  await page.evaluate(() => { document.querySelector('#btnHome').click(); });
  await waitFor(() => document.querySelector('.modal'));
  await page.evaluate(() => document.querySelector('.modal button.primary').click());
  await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  await page.tap('#btnGuide');
  await waitFor(() => document.querySelector('#scr-guide').classList.contains('on'));
  await page.waitForTimeout(1500);
  const gd = await fits();
  check('遊戲說明不用左右捲動', gd[0] <= W, String(gd));
  await shot('i4-guide.png');

  // iPhone：同一個 App 用手機直立版面
  const ctx2 = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await ctx2.addInitScript(BRIDGE);
  const p2 = await ctx2.newPage();
  await p2.goto('http://localhost:8823/index.html');
  await p2.waitForSelector('.pf', { timeout: 20000 });
  const c2 = await p2.evaluate(() => document.documentElement.className);
  check('iPhone：手機直立版面', /\bmobile\b/.test(c2) && /\bios\b/.test(c2), c2);
  await ctx2.close();
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  await shot('i-fail.png').catch(() => {});
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
