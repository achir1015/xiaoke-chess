// 單機端對端測試：首頁、與 AI 對局、軍師（離線）、提示、認輸、棋譜庫、重播、匯入、音樂
// 用法：node e2e/smoke.mjs [截圖資料夾]
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
fs.rmSync(path.join(appData, 'xiaoke-chess-e2eSmoke'), { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=e2eSmoke', '--autoplay-policy=no-user-gesture-required'] });
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

try {
  await win.waitForSelector('#startAI', { timeout: 20000 });
  await win.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false } }); });
  await win.waitForTimeout(500);
  await win.screenshot({ path: path.join(outDir, '1-home.png') });
  check('首頁顯示 A、B 兩種模式與半盤', (await win.locator('.mode-card').count()) === 3);

  // 背景音樂清單
  const nTracks = await win.evaluate(() => window.xk.music.list().then((l) => l.length));
  check('內建 20 首背景音樂', nTracks === 20, String(nTracks));

  // 與 AI 對局（執紅）
  await win.click('.segbtn[data-v="red"]');
  await win.click('#startAI');
  await myTurn();
  check('開局提示「輪到您下棋」', true);
  await win.screenshot({ path: path.join(outDir, '2-board.png') });

  // 軍師（離線模式，本機引擎）
  await win.click('.adv-quick button');
  try {
    await waitFor(() => [...document.querySelectorAll('.adv-msg.ai')].some((e) => e.textContent.includes('建議走')), null, 20000);
  } catch (e) {
    console.log('  軍師訊息：', await win.evaluate(() => [...document.querySelectorAll('.adv-msg')].map((x) => x.className + ':' + x.textContent).join(' / ')));
    console.log('  狀態：', await win.evaluate(() => JSON.stringify({ side: window.__xkc.game.side, my: window.__xkc.mySide, ai: window.__xkc.aiThinking, n: window.__xkc.game.moves.length })));
    await win.screenshot({ path: path.join(outDir, 'fail-advisor.png') });
    throw e;
  }
  check('軍師給出建議著法', true);
  check('棋盤標出建議箭頭', await win.evaluate(() => !!window.__xkcBoard.hintArrow));

  // 下三步，每步後 AI 回應
  for (let i = 0; i < 3; i++) {
    await myTurn();
    const mv = await win.evaluate(() => { const l = window.__xkc.game.legalMoves(); return { m: l[Math.floor(Math.random() * l.length)], n: window.__xkc.game.moves.length }; });
    await win.evaluate(({ m }) => { const b = window.__xkcBoard; b.onSquareClick(m & 127); b.onSquareClick((m >> 7) & 127); }, mv);
    await waitFor((n) => window.__xkc.game.moves.length >= n + 2 || window.__xkc.game.result, mv.n);
  }
  check('AI 會回應著法', (await win.evaluate(() => window.__xkc.game.moves.length)) >= 6);
  console.log('  著法：', await win.evaluate(() => window.__xkc.game.notes.join(' ')));
  console.log('  ', await win.evaluate(() => document.querySelector('#aiInfo').textContent));

  // 吃子動畫：在獨立的 3D 棋盤上模擬炮打馬，確認被吃的棋子會移除
  const capOk = await win.evaluate(async () => {
    const b = window.__xkcBoard;
    const saved = [...window.__xkc.game.pos.board];
    const { Position } = await import('./js/xiangqi.js');
    const p = new Position();
    b.setPosition(p.board);
    await b.animateMove(7 * 9 + 1, 0 * 9 + 1); // 炮八進七 打馬
    await new Promise((r) => setTimeout(r, 900));
    const n = b.allPieces.size;
    b.setPosition(Int8Array.from(saved));
    return n;
  });
  check('吃子後被吃的棋子從 3D 場景移除', capOk === 31, String(capOk));
  // 提示
  await myTurn();
  await win.click('#btnHint');
  await waitFor(() => document.querySelector('.toast')?.textContent.includes('提示'));
  check('提示按鈕', true);

  // 悔棋（AI 模式退回 2 步）
  const before = await win.evaluate(() => window.__xkc.game.moves.length);
  await win.click('#btnUndo');
  check('悔棋退回 2 步', (await win.evaluate(() => window.__xkc.game.moves.length)) === before - 2);
  await win.waitForTimeout(700);
  const pieceSync = () => win.evaluate(() => [window.__xkcBoard.allPieces.size, [...window.__xkc.game.pos.board].filter(Boolean).length]);
  let ps = await pieceSync();
  check('悔棋後 3D 棋子數與局面一致', ps[0] === ps[1], ps.join(' vs '));
  await win.screenshot({ path: path.join(outDir, '3-midgame.png') });

  // 認輸 → 存棋譜
  await win.click('#btnResign');
  await waitFor(() => document.querySelector('.modal'));
  await win.click('.modal button.primary');
  await waitFor(() => document.querySelector('.modal h3')?.textContent.includes('輸'));
  check('認輸後顯示結果', true);
  await win.click('.modal button:not(.primary)');
  const list = await win.evaluate(() => window.xk.games.list());
  check('棋譜自動存入棋譜庫', list.length === 1 && list[0].result === '0-1', JSON.stringify(list));
  check('AI 參考棋譜收錄 1 局', (await win.evaluate(() => window.__xkc.learned.games)) === 1);

  // 棋譜庫與重播
  await win.click('#btnHome');
  await win.click('text=棋譜庫');
  await waitFor(() => document.querySelectorAll('.rec-table tbody tr').length === 1);
  await win.screenshot({ path: path.join(outDir, '4-records.png') });
  await win.click('.rec-table .ops button:first-child');
  await waitFor(() => document.body.classList.contains('mode-replay'));
  await win.click('#rpNext'); await win.waitForTimeout(500);
  await win.click('#rpNext'); await win.waitForTimeout(500);
  check('重播前進 2 步', (await win.evaluate(() => window.__xkc.replay.ply)) === 2);
  await win.click('#rpLast');
  check('重播跳到終局', (await win.evaluate(() => window.__xkc.replay.ply === window.__xkc.replay.game.moves.length)));
  await win.click('#rpFirst'); await win.click('#rpNext'); await win.click('#rpNext'); await win.click('#rpNext'); await win.click('#rpLast');
  await win.waitForTimeout(1600);
  ps = await win.evaluate(() => [window.__xkcBoard.allPieces.size, [...window.__xkc.game.pos.board].filter(Boolean).length]);
  check('快速切換重播後 3D 棋子數一致', ps[0] === ps[1], ps.join(' vs '));
  await win.screenshot({ path: path.join(outDir, '5-replay.png') });

  // 匯入文字棋譜（模擬檔案選擇）
  const sample = '[測試棋譜]\n紅方：甲\n黑方：乙\n結果：紅勝\n1. 炮二平五 馬８進７\n2. 傌二進三 車９平８\n3. 俥一平二 馬２進３\n';
  await app.evaluate(({ ipcMain }, text) => {
    ipcMain.removeHandler('games:pickImport');
    ipcMain.handle('games:pickImport', () => [{ name: 'test.txt', text }]);
  }, sample);
  await win.click('#btnHome');
  await win.click('text=棋譜庫');
  await waitFor(() => document.querySelectorAll('.rec-table tbody tr').length === 1);
  await win.waitForTimeout(400);
  await win.click('text=匯入棋譜');
  await waitFor(() => document.querySelectorAll('.rec-table tbody tr').length === 2);
  check('匯入中文記譜文字棋譜', true);
  check('匯入的棋譜列入 AI 參考', (await win.evaluate(() => window.__xkc.learned.games)) === 2);

  // 音樂播放
  await win.click('text=返回首頁');
  await win.click('.home-links button:nth-child(3)');
  if (!(await win.evaluate(() => document.querySelector('.music').classList.contains('playing')))) await win.click('.mu-btn.big');
  await waitFor(() => document.querySelector('.music').classList.contains('playing'), null, 10000);
  await win.waitForTimeout(1500);
  const t = await win.evaluate(() => document.querySelector('.mu-time').textContent);
  check('背景音樂播放中', /^\d+:\d\d \/ 3:\d\d$/.test(t) && !t.startsWith('0:00'), t);
  await win.screenshot({ path: path.join(outDir, '6-music.png') });
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  await win.screenshot({ path: path.join(outDir, 'fail.png') }).catch(() => {});
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await app.close().catch(() => {});
  process.exit(fail ? 1 : 0);
}
