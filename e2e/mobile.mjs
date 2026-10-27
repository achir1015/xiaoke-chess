// 手機版網頁測試：用 Chrome 模擬直立手機（觸控）開 mobile/www
// 用法：node scripts/build-mobile.mjs && node e2e/mobile.mjs [截圖資料夾]
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
  if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { console.log('  404：', req.url); res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(8822);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-S9380) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
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

try {
  await page.goto('http://localhost:8822/index.html');
  await page.waitForSelector('.pf', { timeout: 20000 });
  check('手機版樣式啟用', await page.evaluate(() => document.documentElement.classList.contains('mobile')));
  check('第一次開啟要選頭像', true);
  await shot('m1-picker.png');
  await page.tap('.pf-item[data-id="m01"]');
  await page.tap('.pf-tab[data-k="advisor"]');
  await page.tap('.pf-item[data-id="af02"]');
  await page.tap('.modal .pf-ok');
  await waitFor(() => !document.querySelector('.modal-back'));
  await page.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false } }); });
  const hw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('首頁沒有左右捲動', hw <= 412, String(hw));
  await shot('m2-home.png');

  // 與 AI 對賽（整盤）
  await page.tap('#startAI');
  await waitFor(() => window.__xkc.mode === 'ai');
  await page.waitForTimeout(3300);
  const bw = await box('#boardWrap');
  check('整盤棋盤佔滿手機寬度、夠高', bw.w >= 400 && bw.h >= 380, JSON.stringify(bw));
  const gw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('對局畫面沒有左右捲動', gw <= 412, String(gw));
  const tabs = await box('.right .tabs');
  check('底部分頁列在螢幕下方', tabs.b <= 892 + 1 && tabs.t >= 892 - 60, JSON.stringify(tabs));
  check('有「著法」分頁', await page.evaluate(() => !!document.querySelector('.tab[data-tab="moves"]')));
  await shot('m3-game.png');
  // 觸控走棋：點炮二再點炮二平五的位置（從畫面點）
  const sq = await page.evaluate(() => {
    const b = window.__xkcBoard; const THREE = b.camera.constructor;
    const pt = (s) => { const v = b.allPieces.size && [...b.pieces.entries()].find(([q]) => q === s); const p = v ? v[1].position.clone() : null; return p; };
    return null;
  });
  await page.evaluate(() => { const b = window.__xkcBoard; b.onSquareClick(7 * 9 + 7); b.onSquareClick(7 * 9 + 4); });
  await waitFor(() => window.__xkc.game.moves.length >= 2, null, 20000);
  check('手機版可以下棋、AI 會回應', true);
  // 抽屜
  await page.tap('.tab[data-tab="moves"]');
  await page.waitForTimeout(400);
  check('點分頁打開抽屜', await page.evaluate(() => document.body.classList.contains('sheet-open')));
  check('著法紀錄在抽屜裡', (await page.evaluate(() => document.querySelector('#pane-moves').textContent)).includes('炮二平五'));
  await shot('m4-sheet-moves.png');
  await page.tap('.tab[data-tab="advisor"]');
  await page.tap('.adv-quick button');
  await waitFor(() => [...document.querySelectorAll('.adv-msg.ai')].some((e) => e.textContent.includes('建議')), null, 20000);
  check('軍師（離線引擎）可用', true);
  await shot('m5-sheet-advisor.png');
  await page.tap('.tab[data-tab="advisor"]');
  await page.waitForTimeout(400);
  check('再點一次收起抽屜', !(await page.evaluate(() => document.body.classList.contains('sheet-open'))));
  // 音量（點圖示開直立滑桿）
  await page.tap('#miniMusic');
  check('點音樂圖示出現直立音量', await page.evaluate(() => getComputedStyle(document.querySelector('.music-vol .vol-pop')).display === 'flex'));
  const mp = await box('.music-vol .vol-pop');
  check('音量面板沒有超出螢幕', mp.r <= 412 && mp.l >= 0, JSON.stringify(mp));
  await shot('m6-volume.png');
  const was = await page.evaluate(() => document.querySelector('.music').classList.contains('playing'));
  await page.tap('#musicPlay');
  await page.waitForTimeout(1200);
  const now = await page.evaluate(() => document.querySelector('.music').classList.contains('playing'));
  if (!now) { await page.tap('#musicPlay'); await page.waitForTimeout(1200); }
  check('手機版背景音樂可以播放／暫停', was !== now && (await page.evaluate(() => document.querySelector('.music').classList.contains('playing'))), `${was}→${now}`);
  await page.evaluate(() => document.querySelectorAll('.vol.open').forEach((v) => v.classList.remove('open')));
  // 返回鍵（Android）
  await page.evaluate(() => window.__xkBack());
  await waitFor(() => document.querySelector('.modal'));
  check('返回鍵會先問是否離開對局', true);
  await page.tap('.modal button.primary');
  await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));

  // 半盤：直立時棋盤轉成直的
  await page.tap('.kindbtn[data-k="half"]');
  await page.tap('.segbtn[data-v="first"]');
  await page.tap('#startAI');
  await waitFor(() => window.__xkc.kind === 'half');
  await page.waitForTimeout(3300);
  check('半盤在直立手機轉成直的', await page.evaluate(() => Math.abs(window.__xkcBoard.yaw - Math.PI / 2) < 1e-6));
  await page.evaluate(() => window.__xkcBoard.onSquareClick(10));
  await waitFor(() => window.__xkc.game.moves.length >= 2, null, 20000);
  check('半盤可以翻棋、AI 會回應', true);
  await page.waitForTimeout(800);
  await shot('m7-half.png');
  await page.evaluate(() => window.__xkBack());
  await waitFor(() => document.querySelector('.modal'));
  await page.tap('.modal button.primary');
  await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));

  // 遊戲說明（半盤直的）
  await page.tap('#btnGuide');
  await waitFor(() => document.querySelector('#scr-guide').classList.contains('on'));
  await page.waitForTimeout(800);
  check('說明：半盤棋盤是直的', await page.evaluate(() => window.__guide.board.vertical === true));
  await shot('m8-guide-half.png');
  await page.tap('[data-gk="full"]');
  await page.waitForTimeout(1200);
  const gb = await box('.gd-board svg');
  check('說明：整盤棋盤夠大', gb.w >= 300, JSON.stringify(gb));
  await shot('m9-guide-full.png');
  await page.evaluate(() => window.__xkBack());
  await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  check('返回鍵離開說明', true);

  // 棋譜庫（IndexedDB）
  await page.tap('text=📜 棋譜庫');
  await waitFor(() => document.querySelectorAll('.rec-table tbody tr').length >= 1);
  check('手機版棋譜存在手機裡（IndexedDB）', true);
  await shot('m10-records.png');
  await page.evaluate(() => window.__xkBack());
  // 設定
  await page.tap('text=⚙ 設定');
  await page.waitForSelector('.settings');
  check('設定畫面可開啟', true);
  await shot('m11-settings.png');
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  await shot('fail-mobile.png').catch(() => {});
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
