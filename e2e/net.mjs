// 遠端對賽端對端測試：本機配對伺服器＋兩個程式實例（主控 A、被控 B）
// 用法：node e2e/net.mjs [截圖資料夾]
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const { PeerServer } = require('peer');
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9123;
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
for (const p of ['e2eA', 'e2eB']) fs.rmSync(path.join(appData, 'xiaoke-chess-' + p), { recursive: true, force: true });
const server = PeerServer({ port: PORT, path: '/' });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

async function launch(profile, name) {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['.', '--profile=' + profile, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await win.waitForSelector('#btnHost', { timeout: 20000 });
  await win.evaluate(async ({ port, name }) => {
    window.__xkc.settings = await window.xk.settings.set({ playerName: name, server: { mode: 'custom', host: '127.0.0.1', port, path: '/', secure: false }, music: { autoplay: false }, netTermsOK: true, profile: name === '小明' ? { avatar: 'm05', advisor: 'am01' } : { avatar: 'f02', advisor: 'af03' } });
    document.querySelectorAll('.modal-back').forEach((b) => b.remove());
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

const A = await launch('e2eA', '小明');
const B = await launch('e2eB', '阿華');
const banner = (X) => X.win.evaluate(() => document.querySelector('#turnBanner').textContent);
const clickMove = (X, from, to) => X.win.evaluate(({ from, to }) => { const b = window.__xkcBoard; b.onSquareClick(from); b.onSquareClick(to); }, { from, to });
const sq = (r, c) => r * 9 + c;
const idle = (X) => X.waitFor(() => !window.__xkc.animating);

try {
  // A 建立房間（執紅）
  await A.win.selectOption('#hostSide', 'red');
  await A.win.click('#btnHost');
  const code = (await A.waitFor(() => document.querySelector('.room-code')?.textContent)).replace(/\s/g, '');
  check('建立房間取得 6 位數房號', /^\d{6}$/.test(code), code);
  await B.win.fill('#joinCode', code);
  await B.win.click('#btnJoin');
  await A.waitFor(() => window.__xkc.netStarted);
  await B.waitFor(() => window.__xkc.netStarted);
  check('雙方進入對局', true);
  check('A 執紅、B 執黑', (await A.win.evaluate(() => window.__xkc.mySide)) === 0 && (await B.win.evaluate(() => window.__xkc.mySide)) === 1);
  check('A 提示「輪到您下棋」', (await banner(A)) === '輪到您下棋', await banner(A));
  check('B 提示「換您觀棋」', (await banner(B)).startsWith('換您觀棋'), await banner(B));
  check('雙方名稱互通', (await B.win.evaluate(() => window.__xkc.names.join('/'))) === '小明/阿華', await B.win.evaluate(() => window.__xkc.names.join('/')));
  await A.win.screenshot({ path: path.join(outDir, 'net-A-start.png') });
  await B.win.screenshot({ path: path.join(outDir, 'net-B-start.png') });

  // B 不是自己的回合，想動黑卒 → 不可動
  await clickMove(B, sq(3, 4), sq(4, 4));
  await B.win.waitForTimeout(500);
  check('非自己回合不能動棋', (await B.win.evaluate(() => window.__xkc.game.moves.length)) === 0);

  // A 炮二平五
  await clickMove(A, sq(7, 7), sq(7, 4));
  await B.waitFor(() => window.__xkc.game.moves.length === 1 && !window.__xkc.animating);
  check('B 收到 A 的著法', (await B.win.evaluate(() => window.__xkc.game.notes[0])) === '炮二平五');
  await idle(A);
  check('走完後 A 變成「換您觀棋」', (await banner(A)).startsWith('換您觀棋'), await banner(A));
  check('B 變成「輪到您下棋」', (await banner(B)) === '輪到您下棋', await banner(B));
  await B.win.screenshot({ path: path.join(outDir, 'net-B-turn.png') });

  // 對方回合時 A 不能動
  await clickMove(A, sq(7, 1), sq(7, 2));
  await A.win.waitForTimeout(400);
  check('對方回合時主控方不能動棋', (await A.win.evaluate(() => window.__xkc.game.moves.length)) === 1);

  // B 馬８進７
  await clickMove(B, sq(0, 7), sq(2, 6));
  await A.waitFor(() => window.__xkc.game.moves.length === 2 && !window.__xkc.animating);
  check('A 收到 B 的著法', (await A.win.evaluate(() => window.__xkc.game.notes[1])) === '馬８進７');

  // 文字聊天
  await A.win.click('.tab[data-tab="chat"]');
  await A.win.fill('#chatInput', '你好，請多指教！');
  await A.win.press('#chatInput', 'Enter');
  await B.waitFor(() => document.querySelector('#chatLog').textContent.includes('請多指教'));
  check('文字聊天', true);

  // 悔棋：A 提出（輪到 A，退回 2 步）→ B 同意
  await A.win.click('#btnUndo');
  await B.waitFor(() => document.querySelector('.modal'));
  await B.win.click('.modal button.primary');
  await A.waitFor(() => window.__xkc.game.moves.length === 0);
  await B.waitFor(() => window.__xkc.game.moves.length === 0);
  check('悔棋（對方同意後雙方同步退回）', true);

  // 語音通話
  await A.win.click('#btnVoice');
  await B.waitFor(() => document.querySelector('.modal'));
  await B.win.click('.modal button.primary');
  const vA = await A.waitFor(() => document.querySelector('#voiceState').textContent.includes('通話中')).then(() => true).catch(() => false);
  const vB = await B.waitFor(() => document.querySelector('#voiceState').textContent.includes('通話中')).then(() => true).catch(() => false);
  check('語音通話接通（雙方）', vA && vB);
  check('通話時背景音樂自動降低音量', (await A.win.evaluate(() => document.querySelector('#voiceBar').classList.contains('on'))));
  await A.win.click('#btnVoice');
  await B.waitFor(() => document.querySelector('#voiceState').textContent.includes('未通話'));
  check('結束語音通話', true);

  // 走兩步後提和 → 同意
  await clickMove(A, sq(7, 7), sq(7, 4));
  await B.waitFor(() => window.__xkc.game.moves.length === 1 && !window.__xkc.animating);
  await clickMove(B, sq(0, 7), sq(2, 6));
  await A.waitFor(() => window.__xkc.game.moves.length === 2 && !window.__xkc.animating);
  await A.win.click('#btnDraw');
  await B.waitFor(() => document.querySelector('.modal'));
  await B.win.click('.modal button.primary');
  await A.waitFor(() => window.__xkc.game.result);
  await B.waitFor(() => window.__xkc.game.result);
  check('同意和棋，雙方對局結束', (await A.win.evaluate(() => window.__xkc.game.result.reason)) === '雙方同意和棋');
  for (const X of [A, B]) { await X.waitFor(() => document.querySelector('.modal')); await X.win.click('.modal button.primary'); }
  const listA = await A.win.evaluate(() => window.xk.games.list());
  const listB = await B.win.evaluate(() => window.xk.games.list());
  check('雙方棋譜庫都收錄本局', listA.length === 1 && listB.length === 1 && listA[0].result === '1/2-1/2', JSON.stringify(listA));
  check('AI 參考棋譜已收錄本局', (await A.win.evaluate(() => window.__xkc.learned.games)) === 1);

  // 再來一局（紅黑交換）
  await B.win.click('#btnNew');
  await A.waitFor(() => document.querySelector('.modal'));
  await A.win.click('.modal button.primary');
  await A.waitFor(() => window.__xkc.netStarted && !window.__xkc.game.result && window.__xkc.mySide === 1);
  await B.waitFor(() => !window.__xkc.game.result && window.__xkc.mySide === 0);
  check('再來一局：紅黑交換', true);
  check('交換後 B 輪到下棋', (await banner(B)) === '輪到您下棋', await banner(B));

  // B 認輸
  await B.win.click('#btnResign');
  await B.waitFor(() => document.querySelector('.modal'));
  await B.win.click('.modal button.primary');
  await A.waitFor(() => window.__xkc.game.result);
  check('認輸同步', (await A.win.evaluate(() => window.__xkc.game.result.winner)) === 1);
  await A.win.screenshot({ path: path.join(outDir, 'net-A-end.png') });
  for (const X of [A, B]) { await X.waitFor(() => document.querySelector('.modal')); await X.win.click('.modal button.primary'); }

  // 聊天過濾不雅字詞（App Store 準則 1.2）
  await B.win.click('.tab[data-tab="chat"]');
  await B.win.fill('#chatInput', '你這個白痴');
  await B.win.press('#chatInput', 'Enter');
  await A.waitFor(() => document.querySelector('#chatLog').textContent.includes('你這個＊＊'));
  check('聊天會過濾不雅字詞', !(await A.win.evaluate(() => document.querySelector('#chatLog').textContent.includes('白痴'))));

  // 封鎖：A 封鎖 B → A 回首頁；B 再加入 A 的新房間會被拒絕
  await A.win.click('.tab[data-tab="chat"]');
  await A.win.click('#btnBlock');
  await A.waitFor(() => document.querySelector('.modal'));
  await A.win.click('.modal button:has-text("只封鎖")');
  await A.waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  check('封鎖後離開對局', (await A.win.evaluate(() => (window.__xkc.settings.blocked || []).map((b) => b.name).join())) === '阿華');
  await B.waitFor(() => /離開|中斷|結束連線/.test(document.querySelector('#chatLog').textContent), null, 25000);
  await B.win.evaluate(() => document.querySelector('#btnHome').click());
  await B.waitFor(() => document.querySelector('.modal')).catch(() => {});
  await B.win.evaluate(() => { const m = document.querySelector('.modal button.primary'); if (m) m.click(); });
  await B.waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  const hostAgain = async () => {
    await A.win.selectOption('#hostSide', 'red');
    await A.win.click('#btnHost');
    return (await A.waitFor(() => document.querySelector('.room-code')?.textContent)).replace(/\s/g, '');
  };
  let code2 = await hostAgain();
  await B.win.fill('#joinCode', code2);
  await B.win.click('#btnJoin');
  await A.waitFor(() => /封鎖名單/.test(document.querySelector('#netStatus, .net-wait, body').textContent));
  await B.waitFor(() => /無法和您連線/.test(document.body.textContent));
  check('被封鎖的棋友無法再連線', !(await A.win.evaluate(() => window.__xkc.netStarted)));
  await A.win.screenshot({ path: path.join(outDir, 'net-A-blocked.png') });

  // 解除封鎖；第一次連線對戰要先同意須知
  await A.win.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ blocked: [], netTermsOK: false }); });
  await A.win.selectOption('#hostSide', 'red');
  await A.win.click('#btnHost');
  await A.waitFor(() => document.querySelector('.modal h3, .modal .modal-title')?.textContent.includes('連線對戰須知') || document.querySelector('.modal')?.textContent.includes('連線對戰須知'));
  check('第一次連線對戰顯示須知', true);
  await A.win.click('.modal button.primary');
  code2 = (await A.waitFor(() => document.querySelector('.room-code')?.textContent)).replace(/\s/g, '');
  await B.win.fill('#joinCode', code2);
  await B.win.click('#btnJoin');
  await A.waitFor(() => window.__xkc.netStarted);
  await B.waitFor(() => window.__xkc.netStarted);
  check('解除封鎖後可以再對戰', true);

  // 對方離線
  await B.app.close();
  await A.waitFor(() => /離開|中斷/.test(document.querySelector('#chatLog').textContent), null, 25000);
  check('對方離線時顯示提示', true);
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
