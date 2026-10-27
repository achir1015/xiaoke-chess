// v1.2：頭像必選、對陣畫面、軍師代打（與 AI 對賽）
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
fs.rmSync(path.join(appData, 'xiaoke-chess-e2eV12'), { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };
const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=e2eV12'] });
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
const shot = (n) => win.screenshot({ path: path.join(outDir, n) });

try {
  // 第一次開啟：必須選頭像
  await win.waitForSelector('.pf', { timeout: 20000 });
  await win.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false } }); });
  check('第一次開啟就要求選頭像', true);
  check('還沒選好時「確定」不能按', await win.evaluate(() => document.querySelector('.modal .pf-ok').disabled));
  check('男英雄 20 位', (await win.locator('.pf-pane:nth-of-type(1) .pf-item').count()) === 20 || (await win.evaluate(() => document.querySelectorAll('.pf-item[data-key="avatar"]').length)) === 40);
  check('英雄＋佳人共 40 位、軍師 20 位', (await win.evaluate(() => [document.querySelectorAll('.pf-item[data-key="avatar"]').length, document.querySelectorAll('.pf-item[data-key="advisor"]').length].join())) === '40,20');
  await win.click('.pf-tab[data-k="beauty"]');
  await win.click('.pf-item[data-id="f03"]');
  check('只選頭像仍不能確定', await win.evaluate(() => document.querySelector('.modal .pf-ok').disabled));
  await win.click('.pf-tab[data-k="advisor"]');
  await win.click('.pf-item[data-id="am01"]');
  await shot('v1-picker.png');
  check('頭像和軍師都選好才能確定', await win.evaluate(() => !document.querySelector('.modal .pf-ok').disabled));
  await win.click('.modal .pf-ok');
  await waitFor(() => window.__xkc.settings.profile && window.__xkc.settings.profile.avatar === 'f03');
  check('選擇已儲存', (await win.evaluate(() => JSON.stringify(window.__xkc.settings.profile))) === '{"avatar":"f03","advisor":"am01"}');
  check('首頁顯示我的頭像與軍師', (await win.evaluate(() => document.querySelector('.my-profile').textContent)).includes('貂佳人') && (await win.evaluate(() => document.querySelector('.my-profile').textContent)).includes('諸葛軍師'));
  await shot('v2-home.png');

  // 與 AI 對賽：雙方頭像與對陣畫面
  await win.click('.segbtn[data-v="red"]');
  await win.click('#startAI');
  await waitFor(() => document.querySelector('.versus'));
  check('開局顯示對陣畫面', true);
  await shot('v3-versus.png');
  await waitFor(() => !document.querySelector('.versus'), null, 8000);
  const cards = await win.evaluate(() => ['#pRed', '#pBlack'].map((s) => [document.querySelector(s + ' .pimg').getAttribute('src'), document.querySelector(s + ' .padvname').textContent]));
  check('我方卡片：自己的頭像與軍師', cards[0][0].includes('f03') && cards[0][1].includes('諸葛'), JSON.stringify(cards));
  check('AI 方也有頭像與軍師', /\/(m|f)\d\d\.svg$/.test(cards[1][0]) && cards[1][1].endsWith('軍師'), JSON.stringify(cards));
  check('軍師面板顯示我的軍師', (await win.evaluate(() => document.querySelector('.adv-head').textContent)).includes('諸葛軍師'));

  // 軍師代打（AI 對賽）
  await waitFor(() => document.querySelector('#turnBanner').textContent === '輪到您下棋');
  await win.click('#btnProxy');
  check('代打按鈕切換為「交還主位」', (await win.evaluate(() => document.querySelector('#btnProxy').textContent)).includes('交還主位'));
  check('我方卡片顯示「AI 軍師代打」', await win.evaluate(() => document.querySelector('#pRed').classList.contains('proxy')));
  check('卡片換成軍師頭像', (await win.evaluate(() => document.querySelector('#pRed .pimg').getAttribute('src'))).includes('am01'));
  await waitFor(() => window.__xkc.game.moves.length >= 4, null, 40000);
  check('軍師代打會自動替我下棋', true);
  check('代打時點棋盤不會動', await win.evaluate(() => { const n = window.__xkc.game.moves.length; window.__xkcBoard.onSquareClick(63); window.__xkcBoard.onSquareClick(54); return window.__xkc.game.moves.length <= n + 1; }));
  await shot('v4-proxy.png');
  await win.click('#btnProxy');
  check('交還主位', !(await win.evaluate(() => window.__xkc.proxy[0])));
  await waitFor(() => document.querySelector('#turnBanner').textContent === '輪到您下棋' && !window.__xkc.aiThinking && !window.__xkc.animating, null, 30000);
  const n0 = await win.evaluate(() => window.__xkc.game.moves.length);
  await win.waitForTimeout(2500);
  check('交還後不再自動下（等我下）', (await win.evaluate(() => window.__xkc.game.moves.length)) === n0);
  // 棋譜記下雙方頭像
  await win.click('#btnResign');
  await waitFor(() => document.querySelector('.modal'));
  await win.click('.modal button.primary');
  await waitFor(() => document.querySelector('.modal h3')?.textContent.includes('輸'));
  await win.click('.modal button:not(.primary)');
  const rec = await win.evaluate(async () => { const l = await window.xk.games.list(); return window.xk.games.get(l[0].id); });
  check('棋譜記下雙方頭像', Array.isArray(rec.players) && rec.players[0].avatar === 'f03');

  // 設定頁可更換
  await win.click('#btnHome');
  await win.click('#btnProfile');
  await waitFor(() => document.querySelector('.pf'));
  check('可以更換頭像（非必選時有取消）', (await win.evaluate(() => [...document.querySelectorAll('.modal-btns button')].map((b) => b.textContent).join())) === '取消,確定');
  await win.click('.modal-btns button:not(.primary)');
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  await shot('fail-v12.png').catch(() => {});
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await app.close().catch(() => {});
  process.exit(fail ? 1 : 0);
}
