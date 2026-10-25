// 遠端半盤對賽端對端測試：本機配對伺服器＋兩個程式實例
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const { PeerServer } = require('peer');
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9124;
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
for (const p of ['e2eHA', 'e2eHB']) fs.rmSync(path.join(appData, 'xiaoke-chess-' + p), { recursive: true, force: true });
PeerServer({ port: PORT, path: '/' });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

async function launch(profile, name) {
  const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=' + profile] });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await win.waitForSelector('#btnHost', { timeout: 20000 });
  await win.evaluate(async ({ port, name }) => {
    window.__xkc.settings = await window.xk.settings.set({ playerName: name, server: { mode: 'custom', host: '127.0.0.1', port, path: '/', secure: false }, music: { autoplay: false } });
  }, { port: PORT, name });
  const waitFor = async (fn, arg, ms = 20000) => {
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

const A = await launch('e2eHA', '小明');
const B = await launch('e2eHB', '阿華');
const banner = (X) => X.win.evaluate(() => document.querySelector('#turnBanner').textContent);
const click = (X, f, t) => X.win.evaluate(({ f, t }) => { const b = window.__xkcBoard; b.onSquareClick(f); if (t != null && t !== f) b.onSquareClick(t); }, { f, t });
const n = (X) => X.win.evaluate(() => window.__xkc.game.moves.length);
// 找一個合法動作（優先移動）
const pick = (X) => X.win.evaluate(() => { const l = window.__xkc.game.legalActions(); const mv = l.filter((a) => (a & 31) !== ((a >> 5) & 31)); const a = mv.length ? mv[0] : l[0]; return { f: a & 31, t: (a >> 5) & 31 }; });

try {
  // A 選半盤、我先翻，建立房間
  await A.win.click('.kindbtn[data-k="half"]');
  await A.waitFor(() => document.querySelector('.kindbtn.on')?.dataset.k === 'half');
  await A.win.selectOption('#hostSide', 'first');
  await A.win.click('#btnHost');
  const code = (await A.waitFor(() => document.querySelector('.room-code')?.textContent)).replace(/\s/g, '');
  check('建立半盤房間', /^\d{6}$/.test(code));
  // B 停在整盤首頁直接加入，應自動變成半盤
  await B.win.fill('#joinCode', code);
  await B.win.click('#btnJoin');
  await A.waitFor(() => window.__xkc.netStarted);
  await B.waitFor(() => window.__xkc.netStarted);
  check('加入者自動進入半盤', (await B.win.evaluate(() => window.__xkc.kind)) === 'half' && (await B.win.evaluate(() => window.__xkcBoard.layout)) === 'half');
  check('雙方牌局相同', (await A.win.evaluate(() => window.__xkc.game.deal.join())) === (await B.win.evaluate(() => window.__xkc.game.deal.join())));
  check('A 先手「輪到您下棋」', (await banner(A)) === '輪到您下棋', await banner(A));
  check('B「換您觀棋」', (await banner(B)).startsWith('換您觀棋'), await banner(B));
  // B 不能先翻
  await click(B, 12);
  await B.win.waitForTimeout(400);
  check('非自己回合不能翻棋', (await n(B)) === 0);
  // A 翻 B5（sq 12）
  await click(A, 12);
  await B.waitFor(() => window.__xkc.game.moves.length === 1 && !window.__xkc.animating);
  check('B 看到 A 翻的棋子', await B.win.evaluate(() => window.__xkc.game.up[12] === 1 && window.__xkcBoard.pieces.get(12).userData.faceUp));
  const colors = await B.win.evaluate(() => window.__xkc.game.pcolor.join(','));
  check('雙方顏色一致', colors === (await A.win.evaluate(() => window.__xkc.game.pcolor.join(','))), colors);
  await B.win.screenshot({ path: path.join(outDir, 'nh-B.png') });
  // 輪流下 6 步
  for (let i = 0; i < 6; i++) {
    const X = i % 2 === 0 ? B : A, Y = i % 2 === 0 ? A : B;
    await X.waitFor(() => document.querySelector('#turnBanner').textContent === '輪到您下棋' && !window.__xkc.animating);
    const before = await n(X);
    const a = await pick(X);
    await click(X, a.f, a.t);
    await Y.waitFor((k) => window.__xkc.game.moves.length === k + 1 && !window.__xkc.animating, before);
  }
  check('輪流翻棋、走棋同步 6 步', (await A.win.evaluate(() => window.__xkc.game.notes.join())) === (await B.win.evaluate(() => window.__xkc.game.notes.join())));
  // 悔棋（對方同意）
  const before = await n(A);
  await A.waitFor(() => !window.__xkc.animating);
  await A.win.click('#btnUndo');
  await B.waitFor(() => document.querySelector('.modal'));
  await B.win.click('.modal button.primary');
  await A.waitFor((k) => window.__xkc.game.moves.length < k, before);
  await B.waitFor((k) => window.__xkc.game.moves.length < k, before);
  check('半盤悔棋同步', (await n(A)) === (await n(B)));
  await A.win.waitForTimeout(600);
  const ps = await A.win.evaluate(() => [window.__xkcBoard.allPieces.size, [...window.__xkc.game.board].filter(Boolean).length, [...window.__xkcBoard.pieces.entries()].filter(([sq, g]) => g.userData.faceUp !== !!window.__xkc.game.up[sq]).length]);
  check('悔棋後 3D 棋子與明暗狀態一致', ps[0] === ps[1] && ps[2] === 0, ps.join(','));
  // 認輸
  await B.win.click('#btnResign');
  await B.waitFor(() => document.querySelector('.modal'));
  await B.win.click('.modal button.primary');
  await A.waitFor(() => window.__xkc.game.result);
  check('認輸同步', (await A.win.evaluate(() => window.__xkc.game.result.winner)) === 0);
  for (const X of [A, B]) { await X.waitFor(() => document.querySelector('.modal')); await X.win.click('.modal button.primary'); }
  const la = await A.win.evaluate(() => window.xk.games.list()), lb = await B.win.evaluate(() => window.xk.games.list());
  check('雙方都存了半盤棋譜', la.length === 1 && lb.length === 1 && la[0].kind === 'half' && lb[0].kind === 'half');
  // 再來一局：先後交換、新牌局
  const oldDeal = await A.win.evaluate(() => window.__xkc.game.deal.join());
  await B.win.click('#btnNew');
  await A.waitFor(() => document.querySelector('.modal'));
  await A.win.click('.modal button.primary');
  await A.waitFor(() => !window.__xkc.game.result && window.__xkc.mySide === 1);
  await B.waitFor(() => !window.__xkc.game.result && window.__xkc.mySide === 0);
  check('再來一局：先後交換', (await banner(B)) === '輪到您下棋');
  check('再來一局：重新洗牌', (await A.win.evaluate(() => window.__xkc.game.deal.join())) !== oldDeal);
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
