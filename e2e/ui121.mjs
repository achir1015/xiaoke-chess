// v1.2.1：日期時間、直立音量滑桿（音樂在右、落子音效在左；往上大聲）
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const outDir = process.argv[2] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
fs.rmSync(path.join(appData, 'xiaoke-chess-e2eUI'), { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };
const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=e2eUI'] });
const win = await app.firstWindow();
const errors = [];
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
win.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const rect = (sel) => win.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);

try {
  await win.waitForSelector('#startAI', { timeout: 20000 });
  await win.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false }, profile: { avatar: 'm02', advisor: 'am02' } }); document.querySelectorAll('.modal-back').forEach((b) => b.remove()); });
  await win.click('#startAI');
  await win.waitForTimeout(3400); // 等對陣畫面消失

  // 一、日期時間
  const t1 = await win.evaluate(() => document.querySelector('#clock').textContent);
  check('顯示西元年月日與時間', /^西元 \d{4} 年 \d{1,2} 月 \d{1,2} 日（星期[日一二三四五六]）\d\d:\d\d:\d\d$/.test(t1), t1);
  const now = new Date();
  check('日期正確', t1.includes(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`), t1);
  await win.waitForTimeout(1300);
  check('時間每秒更新', (await win.evaluate(() => document.querySelector('#clock').textContent)) !== t1);
  const c = await rect('#clock'), b = await rect('#turnBanner');
  check('日期時間在「輪到您下棋」上方', c.b <= b.t + 1 && Math.abs((c.l + c.r) / 2 - (b.l + b.r) / 2) < 30, JSON.stringify({ c, b }));

  // 二、背景音樂音量（右側、直立）
  await win.hover('#miniMusic');
  await win.waitForTimeout(200);
  const mi = await rect('#miniMusic'), mp = await rect('.music-vol .vol-pop'), ms = await rect('#musicVol');
  check('音樂音量出現在圖示右側', mp.w > 0 && mp.l >= mi.r - 2, JSON.stringify({ mi, mp }));
  check('音樂音量是直立的', ms.h > ms.w * 3, JSON.stringify(ms));
  const vw = await win.evaluate(() => window.innerWidth);
  check('音樂音量沒有超出視窗', mp.r <= vw, `${mp.r} > ${vw}`);
  await win.screenshot({ path: path.join(outDir, 'u1-music-vol.png') });
  await win.mouse.click(ms.l + ms.w / 2, ms.t + 4);
  const mTop = await win.evaluate(() => [Number(document.querySelector('#musicVol').value), window.__xkc && document.querySelector('.mu-vol').value]);
  await win.mouse.click(ms.l + ms.w / 2, ms.b - 4);
  const mBot = await win.evaluate(() => Number(document.querySelector('#musicVol').value));
  check('音樂：往上大聲、往下小聲', mTop[0] >= 90 && mBot <= 10, `上=${mTop[0]} 下=${mBot}`);
  await win.mouse.click(ms.l + ms.w / 2, ms.t + ms.h * 0.4);
  const mMid = await win.evaluate(() => Number(document.querySelector('#musicVol').value));
  check('音樂音量同步到音樂分頁的滑桿', (await win.evaluate(() => Number(document.querySelector('.mu-vol').value))) === mMid);
  await win.waitForTimeout(600);
  check('音樂音量已儲存', Math.round((await win.evaluate(() => window.xk.settings.get().then((s) => s.music.volume))) * 100) === mMid);

  // 三、落子音效音量（左側、直立）
  await win.mouse.move(5, 400);
  await win.hover('#btnSfx');
  await win.waitForTimeout(200);
  const si = await rect('#btnSfx'), sp = await rect('.sfx-vol .vol-pop'), ss = await rect('#sfxVol');
  check('落子音效圖示存在', si.w > 0);
  check('落子音效音量出現在圖示左側', sp.w > 0 && sp.r <= si.l + 2, JSON.stringify({ si, sp }));
  check('落子音效音量是直立的', ss.h > ss.w * 3, JSON.stringify(ss));
  await win.screenshot({ path: path.join(outDir, 'u2-sfx-vol.png') });
  await win.mouse.click(ss.l + ss.w / 2, ss.t + 4);
  const sTop = await win.evaluate(() => Number(document.querySelector('#sfxVol').value));
  await win.mouse.click(ss.l + ss.w / 2, ss.b - 4);
  const sBot = await win.evaluate(() => Number(document.querySelector('#sfxVol').value));
  check('落子音效：往上大聲、往下小聲', sTop >= 90 && sBot <= 10, `上=${sTop} 下=${sBot}`);
  check('音效調到 0 時圖示變成靜音', (await win.evaluate(() => document.querySelector('#btnSfx').textContent)).includes('🔕'));
  await win.mouse.click(ss.l + ss.w / 2, ss.t + ss.h * 0.3);
  await win.waitForTimeout(600);
  const sv = await win.evaluate(() => Number(document.querySelector('#sfxVol').value));
  check('落子音效音量已儲存', Math.round((await win.evaluate(() => window.xk.settings.get().then((s) => s.sfxVolume))) * 100) === sv, String(sv));
  await win.click('#btnSfx');
  check('按落子圖示可靜音', (await win.evaluate(() => Number(document.querySelector('#sfxVol').value))) === 0);
  await win.click('#btnSfx');
  check('再按一次恢復原音量', (await win.evaluate(() => Number(document.querySelector('#sfxVol').value))) === sv);

  // 四、設定中的檢查更新
  await win.click('#btnHome');
  await win.waitForTimeout(400);
  await win.click('text=⚙ 設定');
  await win.waitForSelector('#btnCheckUpdate', { timeout: 5000 });
  check('設定裡有「檢查更新」與目前版本', (await win.evaluate(() => document.querySelector('.settings').textContent)).includes('目前版本 v'));
  await win.click('#btnCheckUpdate');
  const st = await (async () => { const t = Date.now(); for (;;) { const v = await win.evaluate(() => document.querySelector('#setUpdStatus').textContent); if (!/正在檢查|按「檢查更新」/.test(v)) return v; if (Date.now() - t > 20000) return v; await new Promise((r) => setTimeout(r, 200)); } })();
  console.log('  更新狀態：', st);
  check('設定裡檢查更新有結果', /最新版本|有新版本/.test(st), st);
  await win.screenshot({ path: path.join(outDir, 'u3-settings-update.png') });
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  await win.screenshot({ path: path.join(outDir, 'fail-ui.png') }).catch(() => {});
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await app.close().catch(() => {});
  process.exit(fail ? 1 : 0);
}
