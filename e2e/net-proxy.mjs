// 遠端對賽：雙方頭像互通、軍師代打（對方要知道主位換人）
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const { PeerServer } = require('peer');
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9125;
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
for (const p of ['e2ePA', 'e2ePB']) fs.rmSync(path.join(appData, 'xiaoke-chess-' + p), { recursive: true, force: true });
PeerServer({ port: PORT, path: '/' });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

async function launch(profile, name, pr) {
  const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=' + profile] });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await win.waitForSelector('#btnHost', { timeout: 20000 });
  await win.evaluate(async ({ port, name, pr }) => {
    window.__xkc.settings = await window.xk.settings.set({ playerName: name, server: { mode: 'custom', host: '127.0.0.1', port, path: '/', secure: false }, music: { autoplay: false }, profile: pr, proxyLevel: 1 });
    document.querySelectorAll('.modal-back').forEach((b) => b.remove());
  }, { port: PORT, name, pr });
  const waitFor = async (fn, arg, ms = 25000) => {
    const t = Date.now();
    for (;;) {
      const v = await win.evaluate(fn, arg).catch(() => false);
      if (v) return v;
      if (Date.now() - t > ms) throw new Error(profile + ' 等待逾時：' + fn);
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  return { app, win, errors, waitFor };
}

const A = await launch('e2ePA', '小明', { avatar: 'm01', advisor: 'am01' });
const B = await launch('e2ePB', '阿華', { avatar: 'f01', advisor: 'af05' });
const banner = (X) => X.win.evaluate(() => document.querySelector('#turnBanner').textContent);
const click = (X, f, t) => X.win.evaluate(({ f, t }) => { const b = window.__xkcBoard; b.onSquareClick(f); b.onSquareClick(t); }, { f, t });
const n = (X) => X.win.evaluate(() => window.__xkc.game.moves.length);
const legal1 = (X) => X.win.evaluate(() => { const m = window.__xkc.game.legalMoves()[0]; return { f: m & 127, t: (m >> 7) & 127 }; });

try {
  await A.win.selectOption('#hostSide', 'red');
  await A.win.click('#btnHost');
  const code = (await A.waitFor(() => document.querySelector('.room-code')?.textContent)).replace(/\s/g, '');
  await B.win.fill('#joinCode', code);
  await B.win.click('#btnJoin');
  await A.waitFor(() => window.__xkc.netStarted);
  await B.waitFor(() => window.__xkc.netStarted);
  // 頭像互通
  const pa = await A.win.evaluate(() => JSON.stringify(window.__xkc.players));
  const pb = await B.win.evaluate(() => JSON.stringify(window.__xkc.players));
  check('雙方頭像互通（兩邊一致）', pa === pb && pa.includes('m01') && pa.includes('f01') && pa.includes('af05'), pa + ' / ' + pb);
  check('A 看到對方（阿華）的頭像', (await A.win.evaluate(() => document.querySelector('#pBlack .pimg').getAttribute('src'))).includes('f01'));
  check('B 看到對方（小明）的頭像', (await B.win.evaluate(() => document.querySelector('#pRed .pimg').getAttribute('src'))).includes('m01'));
  check('雙方都顯示對陣畫面', (await A.win.evaluate(() => !!document.querySelector('.versus'))) && (await B.win.evaluate(() => !!document.querySelector('.versus'))));
  await B.win.screenshot({ path: path.join(outDir, 'np-B-versus.png') });

  // A 走第一步
  await click(A, 7 * 9 + 7, 7 * 9 + 4);
  await B.waitFor(() => window.__xkc.game.moves.length === 1 && !window.__xkc.animating);

  // B 暫時離開：軍師代打
  await B.win.click('#btnProxy');
  await A.waitFor(() => window.__xkc.proxy[1] === true);
  check('A 知道對方換 AI 軍師代打（狀態）', true);
  await A.waitFor(() => /暫時離開/.test(document.querySelector('#chatLog').textContent));
  check('A 的聊天室出現換人通知', (await A.win.evaluate(() => document.querySelector('#chatLog').textContent)).includes('謝軍師'));
  check('A 看到對方卡片換成軍師頭像＋代打徽章', await A.win.evaluate(() => document.querySelector('#pBlack').classList.contains('proxy') && document.querySelector('#pBlack .pimg').getAttribute('src').includes('af05')));
  // B 的 AI 軍師自動下
  await A.waitFor(() => window.__xkc.game.moves.length === 2 && !window.__xkc.animating, null, 30000);
  check('對方軍師自動下棋並同步過來', true);
  check('B 的棋局與 A 同步', (await A.win.evaluate(() => window.__xkc.game.notes.join())) === (await B.win.evaluate(() => window.__xkc.game.notes.join())));
  await A.win.screenshot({ path: path.join(outDir, 'np-A-opp-proxy.png') });
  // A 再走，B 的軍師再應
  let waitBanner = '';
  for (let i = 0; i < 2; i++) {
    await A.waitFor(() => document.querySelector('#turnBanner').textContent === '輪到您下棋' && !window.__xkc.animating);
    const before = await n(A);
    const m = await legal1(A);
    await click(A, m.f, m.t);
    if (i === 0) waitBanner = await A.waitFor(() => { const t = document.querySelector('#turnBanner').textContent; return t.includes('對方由 AI 軍師代打') ? t : false; }, null, 5000).catch(() => '');
    await A.waitFor((k) => window.__xkc.game.moves.length >= k + 2 && !window.__xkc.animating, before, 30000);
  }
  check('對方代打期間持續對下', (await n(A)) >= 6);
  check('A 等待時提示「對方由 AI 軍師代打」', !!waitBanner, waitBanner);
  // 代打中：悔棋請求自動婉拒
  await A.waitFor(() => document.querySelector('#turnBanner').textContent === '輪到您下棋' && !window.__xkc.animating);
  const nBefore = await n(A);
  await A.win.click('#btnUndo');
  await A.waitFor(() => /無法回覆悔棋/.test(document.querySelector('#chatLog').textContent));
  check('對方暫離時悔棋請求自動婉拒', (await n(A)) === nBefore);
  // B 回來
  await B.win.click('#btnProxy');
  await A.waitFor(() => window.__xkc.proxy[1] === false);
  await A.waitFor(() => /回來了/.test(document.querySelector('#chatLog').textContent));
  check('A 知道對方回到主位', await A.win.evaluate(() => !document.querySelector('#pBlack').classList.contains('proxy') && document.querySelector('#pBlack .pimg').getAttribute('src').includes('f01')));
  // A 走，B 不會自動下了
  const m2 = await legal1(A);
  await click(A, m2.f, m2.t);
  await B.waitFor((k) => window.__xkc.game.moves.length === k + 1 && !window.__xkc.animating, nBefore);
  await B.win.waitForTimeout(2500);
  check('交還主位後 B 要自己下', (await n(B)) === nBefore + 1 && (await banner(B)) === '輪到您下棋', await banner(B));
  // 換 A 暫離：B 也要知道
  await A.win.click('#btnProxy');
  await B.waitFor(() => window.__xkc.proxy[0] === true);
  check('B 也知道 A 換軍師代打', (await B.win.evaluate(() => document.querySelector('#pRed').classList.contains('proxy') && document.querySelector('#pRed .pimg').getAttribute('src').includes('am01'))));
  const m3 = await legal1(B);
  const nb = await n(B);
  await click(B, m3.f, m3.t);
  await B.waitFor((k) => window.__xkc.game.moves.length >= k + 2, nb, 30000);
  check('A 的軍師自動回應 B', true);
  await B.win.screenshot({ path: path.join(outDir, 'np-B-opp-proxy.png') });
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
} finally {
  console.log('A errors:', A.errors.join(' | ') || 'none');
  console.log('B errors:', B.errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await A.app.close().catch(() => {});
  await B.app.close().catch(() => {});
  process.exit(fail ? 1 : 0);
}
