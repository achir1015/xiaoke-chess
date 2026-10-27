// v1.3.0：遊戲說明（動畫、語音、練習）與對局中的錯誤走法說明
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
fs.rmSync(path.join(appData, 'xiaoke-chess-e2eGuide'), { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };
const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=e2eGuide'] });
const win = await app.firstWindow();
const errors = [];
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
win.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const waitFor = async (fn, arg, ms = 40000) => {
  const t = Date.now();
  for (;;) {
    const v = await win.evaluate(fn, arg).catch(() => false);
    if (v) return v;
    if (Date.now() - t > ms) throw new Error('等待逾時：' + fn);
    await new Promise((r) => setTimeout(r, 150));
  }
};
const caption = () => win.evaluate(() => document.querySelector('.gd-caption').textContent);
// 點說明棋盤上的某一格（用 SVG 座標換算螢幕座標）
const clickSq = async (sq) => {
  const p = await win.evaluate((sq) => {
    const b = window.__guide.board; const [x, y] = b.xy(sq);
    const pt = b.svg.createSVGPoint(); pt.x = x; pt.y = y;
    const s = pt.matrixTransform(b.svg.getScreenCTM()); return [s.x, s.y];
  }, sq);
  await win.mouse.click(p[0], p[1]);
};

try {
  await win.waitForSelector('#startAI', { timeout: 20000 });
  await win.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false }, profile: { avatar: 'm03', advisor: 'am03' } }); document.querySelectorAll('.modal-back').forEach((b) => b.remove()); });
  const links = await win.evaluate(() => [...document.querySelectorAll('.home-links button')].map((b) => b.textContent));
  check('「遊戲說明」就在「關於與更新」旁邊', links.indexOf('📖 遊戲說明') === links.indexOf('ℹ 關於與更新') - 1, links.join('｜'));

  // 開啟說明（整盤）
  await win.click('#btnGuide');
  await waitFor(() => document.querySelector('#scr-guide').classList.contains('on'));
  check('整盤共 10 課', (await win.locator('.gd-item').count()) === 10);
  check('有中文語音', (await win.evaluate(() => document.querySelector('#gdVoice').textContent)).includes('語音解說：開'), await win.evaluate(() => document.querySelector('#gdVoice').title));
  await waitFor(() => speechSynthesis.speaking, null, 8000);
  check('語音正在解說', true);
  check('第一課顯示整副棋子', (await win.evaluate(() => document.querySelectorAll('.gb-svg .gp').length)) === 32);
  await win.screenshot({ path: path.join(outDir, 'g1-full-board.png') });

  // 關閉語音加快測試，到「傌（馬）」看蹩馬腿
  await win.click('#gdVoice');
  check('可以關閉語音', (await win.evaluate(() => document.querySelector('#gdVoice').textContent)).includes('關'));
  await win.click('.gd-item:nth-child(5)');
  await waitFor(() => document.querySelector('.gd-caption').textContent.includes('日字'));
  check('馬：顯示 8 個可走位置', (await win.evaluate(() => document.querySelectorAll('.gb-svg .gm-ok').length)) === 8);
  await waitFor(() => document.querySelector('.gd-caption').textContent.includes('蹩馬腿'), null, 30000);
  check('馬：紅色 ✕ 並說明蹩馬腿', (await win.evaluate(() => document.querySelectorAll('.gb-svg .gm-bad').length)) === 2 && (await caption()).includes('✕ 蹩馬腿'));
  await win.screenshot({ path: path.join(outDir, 'g2-horse-leg.png') });
  await waitFor(() => document.querySelector('.gd-caption').textContent.includes('吃掉'), null, 30000);
  await win.waitForTimeout(2600);
  check('動畫：馬跳過去吃子後棋子變少', (await win.evaluate(() => document.querySelectorAll('.gb-svg .gp').length)) === 3);

  // 練習：車
  await win.click('.gd-item:nth-child(6)');
  await waitFor(() => document.querySelector('.gd-caption').classList.contains('practice'), null, 60000);
  await win.waitForTimeout(300);
  check('進入練習', (await caption()).includes('換您試試'));
  await clickSq(3 * 9 + 1); // b6：不能斜著走到這裡
  await waitFor(() => document.querySelector('.gd-caption').textContent.startsWith('✕'));
  check('點錯會說明原因', (await caption()).includes('直走或橫走'), await caption());
  await win.screenshot({ path: path.join(outDir, 'g3-practice-wrong.png') });
  await clickSq(2 * 9 + 0); // a7：正確答案
  await waitFor(() => document.querySelector('.gd-caption').textContent.includes('答對了'));
  check('點對會說「答對了」', true);

  // 半盤
  await win.click('[data-gk="half"]');
  await waitFor(() => window.__guide.kind === 'half');
  check('半盤共 6 課', (await win.locator('.gd-item').count()) === 6);
  check('半盤棋盤：32 顆暗子', (await win.evaluate(() => document.querySelectorAll('.gb-svg .gp.down').length)) === 32);
  await waitFor(() => document.querySelectorAll('.gb-svg .gp.down').length === 31, null, 30000);
  check('翻子動畫：翻開一顆', true);
  await win.waitForTimeout(800);
  await win.screenshot({ path: path.join(outDir, 'g4-half-flip.png') });
  await win.click('.gd-item:nth-child(4)');
  await waitFor(() => document.querySelector('.gd-caption').textContent.includes('帥不能吃'), null, 30000);
  check('半盤：說明帥不能吃兵', (await caption()).includes('怕兵'));

  // 回首頁，對局中走錯會說明原因
  await win.click('.gd-head button');
  await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  check('離開說明時停止語音', !(await win.evaluate(() => speechSynthesis.speaking)));
  await win.click('.segbtn[data-v="red"]');
  await win.click('#startAI');
  await win.waitForTimeout(3300);
  await win.evaluate(() => { const b = window.__xkcBoard; b.onSquareClick(9 * 9 + 1); b.onSquareClick(8 * 9 + 1); });
  await waitFor(() => document.querySelector('.toast.why'));
  const why = await win.evaluate(() => document.querySelector('.toast.why').textContent);
  check('對局中馬走錯會說明「日字」', why.includes('日'), why);
  await win.screenshot({ path: path.join(outDir, 'g5-ingame-why.png') });
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  await win.screenshot({ path: path.join(outDir, 'fail-guide.png') }).catch(() => {});
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await app.close().catch(() => {});
  process.exit(fail ? 1 : 0);
}
