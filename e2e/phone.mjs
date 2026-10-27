// 實機測試：透過 adb 連到手機上小柯象棋（除錯版 APK）的 WebView，用 DevTools 協定檢查功能
// 用法：python android/build.py debug install，手機解鎖後執行 node e2e/phone.mjs [手機序號]
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB = process.env.ADB || 'E:/小米觸控音箱/tools/android-sdk/platform-tools/adb.exe';
const SERIAL = process.argv[2] || process.env.ANDROID_SERIAL || 'R5CY236CQ3B';
const outDir = process.argv[3] || 'e2e/out';
fs.mkdirSync(outDir, { recursive: true });
const adb = (...a) => execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const shotPhone = (name) => fs.writeFileSync(path.join(outDir, name), execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } };

// 安全守則：只有本 App 在前景、螢幕沒鎖時才操作
const focus = adb('shell', 'dumpsys', 'window');
if (/isKeyguardShowing=true/.test(focus)) { console.log('手機鎖著，請先解鎖'); process.exit(2); }
const fm = focus.match(/mCurrentFocus=[^\r\n]*/g) || [];
if (!fm.some((f) => f.includes('com.achir.xiaokechess'))) {
  console.log('前景不是小柯象棋：', fm.join(' '));
  process.exit(2);
}
const sock = /@?(webview_devtools_remote_\d+)/.exec(adb('shell', 'cat', '/proc/net/unix'));
if (!sock) { console.log('找不到 WebView 偵錯通道（要用 python android/build.py debug 建置）'); process.exit(2); }
execFileSync(ADB, ['-s', SERIAL, 'forward', 'tcp:9333', 'localabstract:' + sock[1]]);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('appassets')) || browser.contexts()[0].pages()[0];
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const waitFor = async (fn, arg, ms = 30000) => {
  const t = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => false);
    if (v) return v;
    if (Date.now() - t > ms) throw new Error('等待逾時：' + fn);
    await new Promise((r) => setTimeout(r, 200));
  }
};

try {
  const info = await page.evaluate(() => ({
    url: location.href, android: !!window.XiaokeAndroid, mobile: document.documentElement.classList.contains('mobile'),
    w: innerWidth, h: innerHeight, dpr: devicePixelRatio, ver: window.xk && JSON.parse(window.XiaokeAndroid.appInfo()).version,
    webgl: !!document.createElement('canvas').getContext('webgl2'),
  }));
  console.log('  ', JSON.stringify(info));
  check('在 Android App 裡執行（原生橋接）', info.android && info.mobile);
  check('WebGL2（3D 棋盤）可用', info.webgl);
  check('直立畫面', info.h > info.w);
  await page.reload();
  await waitFor(() => window.__xkc && window.__xkcBoard);
  // 頭像必選：若是第一次開啟，選好頭像
  if (await page.evaluate(() => !!document.querySelector('.pf'))) {
    check('第一次開啟要選頭像', true);
    await page.evaluate(() => { document.querySelector('.pf-item[data-id="m02"]').click(); document.querySelector('.pf-item[data-id="am01"]').click(); document.querySelector('.modal .pf-ok').click(); });
  }
  await page.evaluate(async () => { window.__xkc.settings = await window.xk.settings.set({ music: { autoplay: false } }); });
  await page.waitForTimeout(800);
  shotPhone('p1-home.png');
  check('文字轉語音（遊戲說明用）', await page.evaluate(() => window.xk.tts && window.xk.tts.available()), await page.evaluate(() => window.XiaokeAndroid.ttsVoice()));
  console.log('   語音：', await page.evaluate(() => window.XiaokeAndroid.ttsVoice()));
  const nTracks = await page.evaluate(() => window.xk.music.list().then((l) => l.length));
  check('20 首背景音樂', nTracks === 20, String(nTracks));
  const seek = await page.evaluate(async () => {
    const r = await fetch('../../assets/music/track02.mp3', { headers: { Range: 'bytes=1000-1999' } });
    return [r.status, r.headers.get('content-range'), (await r.arrayBuffer()).byteLength];
  });
  check('音樂支援拖曳進度（Range）', seek[0] === 206 && seek[2] === 1000, JSON.stringify(seek));

  // 與 AI 對賽
  await page.evaluate(() => document.querySelector('.kindbtn[data-k="full"]').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('.segbtn[data-v="red"]').click(); document.querySelector('#startAI').click(); });
  await waitFor(() => window.__xkc.mode === 'ai');
  await page.waitForTimeout(3500);
  shotPhone('p2-game.png');
  await page.evaluate(() => { const b = window.__xkcBoard; b.onSquareClick(7 * 9 + 7); b.onSquareClick(7 * 9 + 4); });
  await waitFor(() => window.__xkc.game.moves.length >= 2, null, 30000);
  check('手機上下棋、AI 回應', true);
  console.log('   ', await page.evaluate(() => document.querySelector('#aiInfo').textContent));
  await page.waitForTimeout(800);
  shotPhone('p3-after-move.png');
  // 抽屜與軍師
  await page.evaluate(() => document.querySelector('.tab[data-tab="advisor"]').click());
  await page.evaluate(() => document.querySelector('.adv-quick button').click());
  await waitFor(() => [...document.querySelectorAll('.adv-msg.ai')].some((e) => e.textContent.includes('建議')), null, 30000);
  check('軍師（本機引擎）在手機上可用', true);
  shotPhone('p4-advisor.png');
  await page.evaluate(() => document.querySelector('.tab[data-tab="advisor"]').click());
  // 音樂播放
  await page.evaluate(() => { document.querySelector('#miniMusic').click(); });
  await page.evaluate(() => { document.querySelector('#musicPlay').click(); });
  await page.waitForTimeout(2500);
  const playing = await page.evaluate(() => document.querySelector('.music').classList.contains('playing'));
  check('手機背景音樂播放', playing);
  shotPhone('p5-volume.png');
  if (playing) await page.evaluate(() => document.querySelector('#musicPlay').click());
  await page.evaluate(() => window.__xkBack());
  check('返回鍵先收起音量面板', await page.evaluate(() => !document.querySelector('.vol.open')));
  // 半盤
  await page.evaluate(() => window.__xkBack());
  await waitFor(() => document.querySelector('.modal'));
  await page.evaluate(() => document.querySelector('.modal button.primary').click());
  await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  await page.evaluate(() => { document.querySelector('.kindbtn[data-k="half"]').click(); });
  await page.evaluate(() => { document.querySelector('.segbtn[data-v="first"]').click(); document.querySelector('#startAI').click(); });
  await waitFor(() => window.__xkc.kind === 'half');
  await page.waitForTimeout(3500);
  check('半盤在手機上是直的', await page.evaluate(() => Math.abs(window.__xkcBoard.yaw - Math.PI / 2) < 1e-6));
  await page.evaluate(() => window.__xkcBoard.onSquareClick(12));
  await waitFor(() => window.__xkc.game.moves.length >= 2, null, 30000);
  await page.waitForTimeout(1000);
  shotPhone('p6-half.png');
  check('半盤翻棋、AI 回應', true);
  await page.evaluate(() => window.__xkBack());
  await waitFor(() => document.querySelector('.modal'));
  await page.evaluate(() => document.querySelector('.modal button.primary').click());
  // 遊戲說明（原生語音）
  await page.evaluate(() => document.querySelector('#btnGuide').click());
  await waitFor(() => document.querySelector('#scr-guide').classList.contains('on'));
  await page.waitForTimeout(2500);
  check('說明的語音按鈕可用', (await page.evaluate(() => document.querySelector('#gdVoice').textContent)).includes('開'));
  shotPhone('p7-guide.png');
  await page.evaluate(() => window.__xkBack());
  await waitFor(() => document.querySelector('#scr-home').classList.contains('on'));
  // 檢查更新（原生）
  const upd = await page.evaluate(() => window.xk.update.check().then((i) => i, (e) => ({ error: e.message })));
  console.log('   更新：', JSON.stringify(upd).slice(0, 200));
  check('檢查更新可以連到 GitHub', !upd.error, upd.error);
} catch (e) {
  fail++;
  console.log('✘ 例外：', e.message);
  try { shotPhone('fail-phone.png'); } catch { /* 略 */ }
} finally {
  console.log('errors:', errors.join(' | ') || 'none');
  console.log(`\n結果：${pass} 通過，${fail} 失敗`);
  await browser.close().catch(() => {});
  try { execFileSync(ADB, ['-s', SERIAL, 'forward', '--remove', 'tcp:9333']); } catch { /* 略 */ }
  process.exit(fail ? 1 : 0);
}
