// 半盤、AI 對 AI、關於與更新的端對端測試
// 用法：node e2e/half.mjs [截圖資料夾]
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
fs.rmSync(path.join(appData, 'xiaoke-chess-e2eHalf'), { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=e2eHalf'] });
const win = await app.firstWindow();
const errors = [];
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
win.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const waitFor = async (fn, arg, ms = 30000) => {
  const t = Date.now();
  for (;;) {
    const v = await win.evaluate(fn, arg).catch(() => false);
    if (v) return v;
    if (Date.now() - t > ms) throw new Error('等待逾時：' + fn);
    await new Promise((r) => setTimeout(r, 150));
  }
};
const myTurn = () => waitFor(() => document.querySelector('#turnBanner').textContent.startsWith('輪到您下棋') && !window.__xkc.animating && !window.__xkc.aiThinking);
const pieceSync = () => win.evaluate(() => [window.__xkcBoard.allPieces.size, [...(window.__xkc.game.board || window.__xkc.game.pos.board)].filter(Boolean).length]);
const shot = (name) => win.screenshot({ path: path.join(outDir, name) });

try {
  await win.waitForSelector('#startAI', { timeout: 20000 });
  await win.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false } }); });

  // ---- 半盤：與 AI 對賽 ----
  await win.click('.kindbtn[data-k="half"]');
  await waitFor(() => document.querySelector('.kindbtn.on')?.dataset.k === 'half');
  check('首頁可切換到半盤', (await win.locator('.mode-card').count()) === 3);
  await shot('h1-home-half.png');
  await win.click('.segbtn[data-v="first"]');
  await win.click('#startAI');
  await myTurn();
  check('半盤開局：輪到您下棋', true);
  check('半盤 3D 棋盤：32 顆暗子', (await win.evaluate(() => window.__xkcBoard.layout === 'half' && window.__xkcBoard.allPieces.size === 32 && [...window.__xkcBoard.allPieces].every((g) => !g.userData.faceUp))));
  check('半盤提示語', (await win.evaluate(() => document.querySelector('#halfTip').textContent)).includes('翻開'));
  await shot('h2-half-start.png');

  // 翻第一顆
  await win.evaluate(() => window.__xkcBoard.onSquareClick(10));
  await waitFor(() => window.__xkc.game.moves.length >= 1);
  check('點暗子會翻開並決定顏色', await win.evaluate(() => window.__xkc.game.pcolor[0] != null && window.__xkc.game.up[10] === 1));
  // 下 8 回合（自己隨機動作，AI 回應）
  for (let i = 0; i < 8; i++) {
    await myTurn();
    if (await win.evaluate(() => !!window.__xkc.game.result)) break;
    const a = await win.evaluate(() => {
      const g = window.__xkc.game;
      const l = g.legalActions();
      const moves = l.filter((x) => (x & 31) !== ((x >> 5) & 31));
      const pick = moves.length && Math.random() < 0.6 ? moves[Math.floor(Math.random() * moves.length)] : l[Math.floor(Math.random() * l.length)];
      return { a: pick, n: g.moves.length };
    });
    await win.evaluate(({ a }) => { const b = window.__xkcBoard; const f = a & 31, t = (a >> 5) & 31; b.onSquareClick(f); if (f !== t) b.onSquareClick(t); }, a);
    await waitFor((n) => window.__xkc.game.moves.length >= n + 2 || window.__xkc.game.result, a.n);
  }
  check('半盤 AI 會回應', (await win.evaluate(() => window.__xkc.game.moves.length)) >= 6);
  await win.waitForTimeout(1200);
  let ps = await pieceSync();
  check('半盤 3D 棋子數與局面一致', ps[0] === ps[1], ps.join(' vs '));
  check('半盤與 AI 不能悔棋', await win.evaluate(() => document.querySelector('#btnUndo').disabled));
  console.log('  動作：', (await win.evaluate(() => window.__xkc.game.notes.join('｜'))));
  await shot('h3-half-mid.png');

  // 提示與軍師
  if (!(await win.evaluate(() => !!window.__xkc.game.result))) {
    await myTurn();
    await win.click('#btnHint');
    await waitFor(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('提示')));
    check('半盤提示', true);
    await win.click('.adv-quick button');
    await waitFor(() => [...document.querySelectorAll('.adv-msg.ai')].some((e) => e.textContent.includes('建議')), null, 20000);
    check('半盤軍師給建議', true);
    // 認輸
    await win.click('#btnResign');
    await waitFor(() => document.querySelector('.modal'));
    await win.click('.modal button.primary');
  }
  await waitFor(() => window.__xkc.game.result);
  await waitFor(() => document.querySelector('.modal h3'));
  check('結束時所有暗子翻開', await win.evaluate(() => [...window.__xkcBoard.allPieces].every((g) => g.userData.faceUp)));
  await shot('h4-half-end.png');
  await win.click('.modal button:not(.primary)');
  let list = await win.evaluate(() => window.xk.games.list());
  check('半盤棋譜存入棋譜庫', list.length === 1 && list[0].kind === 'half', JSON.stringify(list));
  check('半盤棋譜不列入整盤 AI 學習', (await win.evaluate(() => window.__xkc.learned.games)) === 0);

  // 重播
  await win.click('#btnHome');
  await win.click('text=棋譜庫');
  await waitFor(() => document.querySelectorAll('.rec-table tbody tr').length === 1);
  check('棋譜庫顯示「半盤」', (await win.evaluate(() => document.querySelector('.rec-table tbody tr').textContent)).includes('半盤'));
  await win.waitForTimeout(300);
  await win.click('.rec-table .ops button:first-child');
  await waitFor(() => document.body.classList.contains('mode-replay'));
  for (let i = 0; i < 3; i++) { await win.click('#rpNext'); await win.waitForTimeout(250); }
  await win.waitForTimeout(900);
  check('半盤重播前進', (await win.evaluate(() => window.__xkc.replay.ply)) === 3);
  ps = await pieceSync();
  check('半盤重播棋子數一致', ps[0] === ps[1], ps.join(' vs '));
  await win.click('#rpLast');
  await win.waitForTimeout(600);
  check('半盤重播終局', await win.evaluate(() => window.__xkc.replay.ply === window.__xkc.replay.game.moves.length));

  // 匯出 → 再匯入
  let exported = '';
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('games:export');
    ipcMain.handle('games:export', (e, name, text) => { global.__lastExport = text; return 'C:/fake/' + name; });
  });
  await win.click('#rpExport');
  await win.waitForTimeout(500);
  exported = await app.evaluate(() => global.__lastExport || '');
  check('半盤匯出含牌局與動作', exported.includes('牌局：') && exported.includes('動作：'));
  await app.evaluate(({ ipcMain }, text) => {
    ipcMain.removeHandler('games:pickImport');
    ipcMain.handle('games:pickImport', () => [{ name: 'half.txt', text }]);
  }, exported);
  await win.click('#btnHome');
  await win.click('text=棋譜庫');
  await waitFor(() => document.querySelectorAll('.rec-table tbody tr').length === 1);
  await win.waitForTimeout(300);
  await win.click('text=匯入棋譜');
  await waitFor(() => document.querySelectorAll('.rec-table tbody tr').length === 2);
  list = await win.evaluate(() => window.xk.games.list());
  check('半盤棋譜可再匯入', list.filter((g) => g.kind === 'half').length === 2 && list[0].plies === list[1].plies, JSON.stringify(list.map((g) => [g.kind, g.plies])));

  // ---- AI 對 AI：整盤 ----
  await win.click('text=返回首頁');
  await win.click('.kindbtn[data-k="full"]');
  await waitFor(() => document.querySelector('.kindbtn.on')?.dataset.k === 'full');
  await win.selectOption('#aivaiA', '0');
  await win.selectOption('#aivaiB', '1');
  await win.click('#startAivai .. >> text=快').catch(() => {});
  await win.evaluate(() => { const b = [...document.querySelectorAll('.segbtn')].find((x) => x.dataset.v === 'fast'); b && b.click(); });
  await win.click('#startAivai');
  await waitFor(() => window.__xkc.mode === 'aivai' && window.__xkc.game.moves.length >= 6, null, 60000);
  check('整盤 AI 對 AI 自動下棋', true);
  check('觀戰時不能動棋', !(await win.evaluate(() => { const g = window.__xkc.game; const n = g.moves.length; window.__xkcBoard.onSquareClick(63); window.__xkcBoard.onSquareClick(64); return window.__xkc.game.moves.length > n + 1; })));
  check('AI 對 AI 顯示思考中的一方', (await win.evaluate(() => document.querySelector('#turnBanner').textContent)).includes('AI 對 AI'));
  await shot('h5-aivai-full.png');
  await win.click('#btnPause');
  await waitFor(() => !window.__xkc.aiThinking && !window.__xkc.animating);
  const n1 = await win.evaluate(() => window.__xkc.game.moves.length);
  await win.waitForTimeout(2500);
  const n2 = await win.evaluate(() => window.__xkc.game.moves.length);
  check('暫停後不再下', n2 === n1, `${n1} → ${n2}`);
  await win.click('#btnPause');
  await waitFor((n) => window.__xkc.game.moves.length > n, n2, 20000);
  check('繼續後接著下', true);

  // ---- AI 對 AI：半盤（下到分出勝負） ----
  await win.click('#btnHome');
  await win.click('.kindbtn[data-k="half"]');
  await waitFor(() => document.querySelector('.kindbtn.on')?.dataset.k === 'half');
  await win.selectOption('#aivaiA', '2');
  await win.selectOption('#aivaiB', '0');
  await win.evaluate(() => { const b = [...document.querySelectorAll('.segbtn')].find((x) => x.dataset.v === 'fast'); b && b.click(); });
  await win.click('#startAivai');
  await waitFor(() => window.__xkc.mode === 'aivai' && window.__xkc.kind === 'half' && window.__xkc.game.moves.length >= 4, null, 60000);
  await shot('h6-aivai-half.png');
  await waitFor(() => window.__xkc.game.result, null, 300000);
  const res = await win.evaluate(() => window.__xkc.game.result);
  check('半盤 AI 對 AI 下完整局', !!res, JSON.stringify(res));
  console.log('  結果：', res.reason, '共', await win.evaluate(() => window.__xkc.game.moves.length), '步');
  await waitFor(() => document.querySelector('.modal h3'));
  await win.click('.modal button:not(.primary)');
  list = await win.evaluate(() => window.xk.games.list());
  check('AI 對 AI 棋譜收錄（含中途離開的整盤）', list.filter((g) => g.mode === 'aivai').length === 2, JSON.stringify(list.map((g) => [g.mode, g.kind, g.result])));

  // ---- 關於與更新 ----
  await win.click('#btnHome');
  await win.click('#btnAbout');
  await waitFor(() => document.querySelector('.about'));
  check('關於視窗顯示開發者', (await win.evaluate(() => document.querySelector('.about').textContent)).includes('吳玉柱 與 Claude AI Opus 5.5'));
  await waitFor(() => !document.querySelector('.upd-status').textContent.includes('正在檢查'), null, 20000);
  const upd = await win.evaluate(() => document.querySelector('.upd-status').textContent);
  console.log('  更新狀態：', upd);
  check('檢查更新有結果', /最新版本|有新版本/.test(upd), upd);
  await shot('h7-about.png');
  await win.click('.modal button.primary');
  check('首頁顯示開發者', (await win.evaluate(() => document.querySelector('.credit').textContent)).includes('吳玉柱 與 Claude AI Opus 5.5'));
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  await shot('fail-half.png').catch(() => {});
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await app.close().catch(() => {});
  process.exit(fail ? 1 : 0);
}
