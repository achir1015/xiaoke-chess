// 產生手機版（Android）用的網頁：mobile/www
// 和桌面版同一份程式；把 node_modules 的函式庫複製到 vendor/、打包 Claude SDK、調整 index.html 路徑。
// 用法：node scripts/build-mobile.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'mobile', 'www');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copy = (from, to) => fs.cpSync(path.join(ROOT, from), path.join(OUT, to), { recursive: true });

// 1. 網頁本體
copy('src/renderer', '.');
fs.rmSync(path.join(OUT, 'package.json'), { force: true });
// 2. 素材（音樂、頭像）
copy('assets/music', 'assets/music');
copy('assets/portraits', 'assets/portraits');
fs.rmSync(path.join(OUT, 'assets/portraits/_sheet.html'), { force: true });
// 3. 函式庫
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'node_modules/three/build/three.module.js'), path.join(OUT, 'vendor/three.module.js'));
fs.copyFileSync(path.join(ROOT, 'node_modules/peerjs/dist/peerjs.min.js'), path.join(OUT, 'vendor/peerjs.min.js'));
fs.copyFileSync(path.join(ROOT, 'src/renderer/vendor/OrbitControls.js'), path.join(OUT, 'vendor/OrbitControls.js'));
await build({ entryPoints: [path.join(ROOT, 'mobile/anthropic-entry.mjs')], bundle: true, format: 'esm', platform: 'browser', minify: true, outfile: path.join(OUT, 'vendor/anthropic.js'), logLevel: 'warning' });
// 4. 版本號
fs.writeFileSync(path.join(OUT, 'js/version.js'), `window.XKC_VERSION = ${JSON.stringify(pkg.version)};\n`);
// 5. index.html：路徑改到 vendor/，重算 importmap 的 CSP 雜湊
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html.replace('../../node_modules/three/build/three.module.js', './vendor/three.module.js');
html = html.replace('../../node_modules/peerjs/dist/peerjs.min.js', 'vendor/peerjs.min.js');
html = html.replace('<script src="js/xk-mobile.js"></script>', '<script src="js/version.js"></script>\n<script src="js/xk-mobile.js"></script>');
const im = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1];
const hash = crypto.createHash('sha256').update(im, 'utf8').digest('base64');
html = html.replace(/'sha256-[^']*'/, `'sha256-${hash}'`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

let n = 0, bytes = 0;
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(OUT);
console.log(`手機版網頁 v${pkg.version}：${n} 個檔案、${(bytes / 1048576).toFixed(1)} MB → ${OUT}`);
