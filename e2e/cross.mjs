// 手機與電腦互連測試：手機（除錯版 APK）建立房間，電腦版加入，用正式的 PeerJS 配對伺服器
// 用法：手機解鎖、開著小柯象棋後執行 node e2e/cross.mjs [手機序號]
import { _electron as electron, chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const ADB = process.env.ADB || 'E:/小米觸控音箱/tools/android-sdk/platform-tools/adb.exe';
const SERIAL = process.argv[2] || process.env.ANDROID_SERIAL || 'R5CY236CQ3B';
const outDir = 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const adb = (...a) => execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const shotPhone = (name) => fs.writeFileSync(path.join(outDir, name), execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

// 安全守則：只有本 App 在前景、螢幕沒鎖時才操作
const dump = adb('shell', 'dumpsys', 'window');
if (/isKeyguardShowing=true/.test(dump)) { console.log('手機鎖著，請先解鎖'); process.exit(2); }
const fm = /mCurrentFocus=[^\r\n]*/.exec(dump);
if (!fm || !fm[0].includes('com.achir.xiaokechess')) { console.log('前景不是小柯象棋：', fm && fm[0]); process.exit(2); }
const sock = /@?(webview_devtools_remote_\d+)/.exec(adb('shell', 'cat', '/proc/net/unix'));
if (!sock) { console.log('找不到 WebView 偵錯通道（要用 python android/build.py debug 建置）'); process.exit(2); }
execFileSync(ADB, ['-s', SERIAL, 'forward', 'tcp:9333', 'localabstract:' + sock[1]]);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const phone = browser.contexts()[0].pages().find((p) => p.url().includes('appassets')) || browser.contexts()[0].pages()[0];

const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
fs.rmSync(path.join(appData, 'xiaoke-chess-e2eX'), { recursive: true, force: true });
const app = await electron.launch({ executablePath: require('electron'), args: ['.', '--profile=e2eX', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const pc = await app.firstWindow();
const waitOn = (page, label) => async (fn, arg, ms = 40000) => {
  const t = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => false);
    if (v) return v;
    if (Date.now() - t > ms) throw new Error(label + ' 等待逾時：' + fn);
    await new Promise((r) => setTimeout(r, 200));
  }
};
const waitPhone = waitOn(phone, '手機'), waitPC = waitOn(pc, '電腦');
const banner = (p) => p.evaluate(() => document.querySelector('#turnBanner').textContent);

try {
  // 回到首頁、預設配對伺服器
  await phone.reload();
  await waitPhone(() => window.__xkc && window.__xkcBoard);
  await phone.evaluate(async () => {
    window.__xkc.settings = await window.xk.settings.set({ playerName: '手機棋友', server: { mode: 'default' }, music: { autoplay: false } });
    document.querySelectorAll('.modal-back').forEach((b) => b.remove());
    document.querySelector('.kindbtn[data-k="full"]').click();
  });
  await pc.waitForSelector('#btnHost', { timeout: 20000 });
  await pc.evaluate(async () => {
    window.__xkc.settings = await window.xk.settings.set({ playerName: '電腦棋友', server: { mode: 'default' }, music: { autoplay: false }, profile: { avatar: 'f02', advisor: 'af03' } });
    document.querySelectorAll('.modal-back').forEach((b) => b.remove());
  });

  // 手機建立房間（執紅）
  await phone.evaluate(() => { document.querySelector('#hostSide').value = 'red'; document.querySelector('#btnHost').click(); });
  const code = (await waitPhone(() => document.querySelector('.room-code')?.textContent)).replace(/\s/g, '');
  check('手機建立房間取得房號', /^\d{6}$/.test(code), code);
  shotPhone('x1-phone-room.png');
  await pc.fill('#joinCode', code);
  await pc.click('#btnJoin');
  await waitPhone(() => window.__xkc.netStarted);
  await waitPC(() => window.__xkc.netStarted);
  check('手機與電腦連上、進入對局', true);
  check('手機「輪到您下棋」', (await banner(phone)) === '輪到您下棋', await banner(phone));
  check('電腦「換您觀棋」', (await banner(pc)).startsWith('換您觀棋'), await banner(pc));
  check('雙方名稱互通', (await pc.evaluate(() => window.__xkc.names.join('/'))) === '手機棋友/電腦棋友', await pc.evaluate(() => window.__xkc.names.join('/')));

  // 手機下 炮二平五 → 電腦收到；電腦回 馬8進7 → 手機收到
  await phone.evaluate(() => { const b = window.__xkcBoard; b.onSquareClick(7 * 9 + 7); b.onSquareClick(7 * 9 + 4); });
  await waitPC(() => window.__xkc.game.moves.length === 1 && !window.__xkc.animating);
  check('電腦收到手機的著法', (await pc.evaluate(() => window.__xkc.game.notes[0])) === '炮二平五', await pc.evaluate(() => window.__xkc.game.notes[0]));
  check('電腦換成「輪到您下棋」', (await banner(pc)) === '輪到您下棋', await banner(pc));
  await pc.evaluate(() => { const b = window.__xkcBoard; b.onSquareClick(0 * 9 + 7); b.onSquareClick(2 * 9 + 6); });
  await waitPhone(() => window.__xkc.game.moves.length === 2 && !window.__xkc.animating);
  check('手機收到電腦的著法', (await phone.evaluate(() => window.__xkc.game.notes[1])) === '馬８進７', await phone.evaluate(() => window.__xkc.game.notes[1]));

  // 聊天
  await pc.evaluate(() => { document.querySelector('#chatInput').value = '手機你好'; document.querySelector('#chatSend').click(); });
  await waitPhone(() => [...document.querySelectorAll('.chat-msg')].some((e) => e.textContent.includes('手機你好')));
  check('電腦傳文字給手機', true);
  await phone.waitForTimeout(800);
  shotPhone('x2-phone-game.png');
  await pc.screenshot({ path: path.join(outDir, 'x2-pc-game.png') });

  // 離開：手機按返回鍵 → 確認離開
  await phone.evaluate(() => window.__xkBack());
  await waitPhone(() => document.querySelector('.modal'));
  await phone.evaluate(() => document.querySelector('.modal button.primary').click());
  await waitPhone(() => document.querySelector('#scr-home').classList.contains('on'));
  await waitPC(() => /離開|斷線|中斷/.test(document.body.textContent));
  check('手機離開，電腦收到通知', true);
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  try { shotPhone('x-fail-phone.png'); await pc.screenshot({ path: path.join(outDir, 'x-fail-pc.png') }); } catch { /* 略 */ }
} finally {
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await app.close().catch(() => {});
  await browser.close().catch(() => {});
  try { execFileSync(ADB, ['-s', SERIAL, 'forward', '--remove', 'tcp:9333']); } catch { /* 略 */ }
  process.exit(fail ? 1 : 0);
}
