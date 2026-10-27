// 產生 60 張半身頭像（原創向量插畫，SVG）
// 20 位男英雄、20 位女佳人（以古代人物姓氏命名）、20 位軍師（男女各 10）
// 用法：node scripts/gen_portraits.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'portraits');
fs.mkdirSync(OUT, { recursive: true });

// ---------------- 角色設定 ----------------
// skin：膚色；brow：眉形；eye：眼形；beard：鬍鬚；head：頭飾；outfit：服裝；prop：道具
const SKIN = { fair: '#f6dcc4', light: '#f0cfae', warm: '#e8bb93', tan: '#d29b6e', red: '#c4523a', dark: '#8a5a3c', bronze: '#b97a4f' };
const MALE = [
  ['關', { skin: 'red', brow: 'sword', eye: 'phoenix', beard: 'long', head: 'scarfGreen', outfit: 'robeArmor', main: '#2f7d4a', trim: '#d8b45a', bg: ['#3b5d3a', '#16261a'], prop: 'glaive' }],
  ['張', { skin: 'bronze', brow: 'thick', eye: 'round', beard: 'full', head: 'band', outfit: 'armor', main: '#3a3a44', trim: '#b8892f', bg: ['#4a3a2a', '#1d140c'], prop: 'spear' }],
  ['趙', { skin: 'fair', brow: 'sword', eye: 'calm', beard: 'none', head: 'helmetWhite', outfit: 'armorWhite', main: '#e8e8ee', trim: '#9fb6d6', bg: ['#2c4a6e', '#101c2c'], prop: 'spear' }],
  ['岳', { skin: 'light', brow: 'sword', eye: 'fierce', beard: 'mustache', head: 'helmet', outfit: 'armor', main: '#8f2a22', trim: '#e0b84a', bg: ['#6a2a1e', '#250e0a'], prop: 'none' }],
  ['項', { skin: 'warm', brow: 'thick', eye: 'fierce', beard: 'goatee', head: 'helmetHorn', outfit: 'armor', main: '#2b2b30', trim: '#c9a227', bg: ['#3a1818', '#140808'], prop: 'halberd' }],
  ['韓', { skin: 'light', brow: 'straight', eye: 'calm', beard: 'goatee', head: 'crown', outfit: 'robeArmor', main: '#3a4f7a', trim: '#d8b45a', bg: ['#2e3b5c', '#10172a'], prop: 'sword' }],
  ['霍', { skin: 'light', brow: 'sword', eye: 'fierce', beard: 'none', head: 'helmet', outfit: 'armor', main: '#7a2420', trim: '#e0b84a', bg: ['#5a3a1a', '#1f140a'], prop: 'none' }],
  ['衛', { skin: 'warm', brow: 'straight', eye: 'calm', beard: 'mustache', head: 'helmet', outfit: 'armor', main: '#3b5a3a', trim: '#cfae5a', bg: ['#2f4a3a', '#101c14'], prop: 'none' }],
  ['李', { skin: 'tan', brow: 'thick', eye: 'fierce', beard: 'full', head: 'band', outfit: 'armor', main: '#5a4022', trim: '#c69a3a', bg: ['#4a3a20', '#1a140a'], prop: 'bow' }],
  ['戚', { skin: 'warm', brow: 'sword', eye: 'calm', beard: 'goatee', head: 'helmet', outfit: 'armor', main: '#284a7a', trim: '#e0c060', bg: ['#1e3a5a', '#0a1420'], prop: 'sword' }],
  ['文', { skin: 'fair', brow: 'straight', eye: 'calm', beard: 'goatee', head: 'officialHat', outfit: 'robe', main: '#8a2c2c', trim: '#e8d5a0', bg: ['#5a3030', '#1f1010'], prop: 'none' }],
  ['秦', { skin: 'tan', brow: 'thick', eye: 'round', beard: 'full', head: 'helmet', outfit: 'armor', main: '#6a4a1a', trim: '#e0b84a', bg: ['#5a4020', '#20160a'], prop: 'mace' }],
  ['尉遲', { skin: 'bronze', brow: 'thick', eye: 'fierce', beard: 'full', head: 'helmetHorn', outfit: 'armor', main: '#2a2a2a', trim: '#b88a2a', bg: ['#2a2a3a', '#0c0c14'], prop: 'none' }],
  ['薛', { skin: 'fair', brow: 'sword', eye: 'calm', beard: 'none', head: 'helmetWhite', outfit: 'armorWhite', main: '#e6e6ea', trim: '#c8a24a', bg: ['#3a4a5a', '#121a22'], prop: 'halberd' }],
  ['楊', { skin: 'light', brow: 'sword', eye: 'calm', beard: 'long', head: 'helmet', outfit: 'armor', main: '#2c5a3a', trim: '#d8b45a', bg: ['#2a4a2a', '#0e1a0e'], prop: 'spear' }],
  ['狄', { skin: 'light', brow: 'sword', eye: 'fierce', beard: 'none', head: 'mask', outfit: 'armor', main: '#3a3a4a', trim: '#b8b8c8', bg: ['#3a3020', '#140f08'], prop: 'none' }],
  ['呂', { skin: 'light', brow: 'sword', eye: 'fierce', beard: 'none', head: 'helmetFeather', outfit: 'armor', main: '#8a1e1e', trim: '#e8c45a', bg: ['#5a1414', '#1f0606'], prop: 'halberd' }],
  ['馬', { skin: 'fair', brow: 'sword', eye: 'calm', beard: 'none', head: 'helmetWhite', outfit: 'armorWhite', main: '#dfe4ea', trim: '#8fb0d0', bg: ['#2a4a6a', '#0c1a28'], prop: 'spear' }],
  ['黃', { skin: 'warm', brow: 'straight', eye: 'calm', beard: 'longWhite', head: 'helmet', outfit: 'armor', main: '#7a5a1a', trim: '#e8c86a', bg: ['#5a4a20', '#201a0a'], prop: 'bow' }],
  ['鄭', { skin: 'warm', brow: 'sword', eye: 'calm', beard: 'mustache', head: 'officialHat', outfit: 'robeArmor', main: '#1f4a6e', trim: '#d8b45a', bg: ['#1e3c5a', '#0a1622'], prop: 'sword' }],
];
const FEMALE = [
  ['施', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunHigh', outfit: 'hanfu', main: '#e6a3b8', trim: '#ffffff', bg: ['#6a8aa0', '#2a3a48'], prop: 'flower', flower: '#f7c8d6' }],
  ['王', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'hood', outfit: 'cloak', main: '#b8262a', trim: '#f4e1c0', bg: ['#8a9ab0', '#2e3644'], prop: 'pipa' }],
  ['貂', { skin: 'fair', brow: 'arched', eye: 'phoenix', head: 'bunSide', outfit: 'hanfu', main: '#7a3a8a', trim: '#f0d0ff', bg: ['#2a2040', '#0c0818'], prop: 'moon' , mark: '#d8324a' }],
  ['楊', { skin: 'light', brow: 'arched', eye: 'phoenix', head: 'phoenixCrown', outfit: 'robeRich', main: '#d4542a', trim: '#f5d36a', bg: ['#7a3a2a', '#2a120c'], prop: 'peony', flower: '#e84a6a' , mark: '#e0303a' }],
  ['趙', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunDouble', outfit: 'hanfu', main: '#f0b0c8', trim: '#ffffff', bg: ['#a07890', '#3a2834'], prop: 'ribbon' }],
  ['甄', { skin: 'fair', brow: 'willow', eye: 'calm', head: 'bunHigh', outfit: 'robeRich', main: '#3a6a8a', trim: '#e8d5a0', bg: ['#3a5a6a', '#122028'], prop: 'none' }],
  ['喬', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunDouble', outfit: 'hanfu', main: '#7ab0d8', trim: '#ffffff', bg: ['#5a8aa8', '#1c2e3a'], prop: 'flower', flower: '#ffffff' }],
  ['班', { skin: 'light', brow: 'willow', eye: 'calm', head: 'bunHigh', outfit: 'robe', main: '#6a7a4a', trim: '#e8dcc0', bg: ['#5a6040', '#1e2014'], prop: 'fanRound' }],
  ['卓', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunSide', outfit: 'hanfu', main: '#c8a0d8', trim: '#ffffff', bg: ['#6a5a7a', '#221a2a'], prop: 'none' , mark: '#e86a8a' }],
  ['蔡', { skin: 'light', brow: 'willow', eye: 'calm', head: 'bunHigh', outfit: 'cloak', main: '#8a6a4a', trim: '#e8d8b8', bg: ['#6a5a4a', '#221c16'], prop: 'none' }],
  ['李', { skin: 'fair', brow: 'willow', eye: 'calm', head: 'bunSide', outfit: 'hanfu', main: '#d8c0a0', trim: '#7a5a3a', bg: ['#8a8060', '#2a2618'], prop: 'flower', flower: '#f4d24a' }],
  ['上官', { skin: 'fair', brow: 'arched', eye: 'phoenix', head: 'bunHigh', outfit: 'robeRich', main: '#2a4a8a', trim: '#e8c86a', bg: ['#2a3a6a', '#0c1228'], prop: 'none' , mark: '#e0303a' }],
  ['花', { skin: 'light', brow: 'arched', eye: 'fierce', head: 'helmetLady', outfit: 'armorLady', main: '#a8323a', trim: '#e8c86a', bg: ['#6a3a2a', '#24120c'], prop: 'sword' }],
  ['穆', { skin: 'light', brow: 'arched', eye: 'fierce', head: 'helmetFeatherLady', outfit: 'armorLady', main: '#c0392b', trim: '#f0d060', bg: ['#5a2a2a', '#200c0c'], prop: 'spear' }],
  ['梁', { skin: 'light', brow: 'arched', eye: 'calm', head: 'bunHigh', outfit: 'armorLady', main: '#3a5a8a', trim: '#e8c86a', bg: ['#2a3a5a', '#0c1420'], prop: 'drum' }],
  ['蘇', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunSide', outfit: 'hanfu', main: '#a8d0c0', trim: '#ffffff', bg: ['#5a8a7a', '#1c2e28'], prop: 'flower', flower: '#ffd0e0' }],
  ['陳', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunDouble', outfit: 'hanfu', main: '#e8909a', trim: '#fff0f0', bg: ['#8a5a6a', '#2e1c22'], prop: 'none' , mark: '#e0405a' }],
  ['董', { skin: 'fair', brow: 'willow', eye: 'calm', head: 'bunHigh', outfit: 'hanfu', main: '#e8e0c8', trim: '#8a6a4a', bg: ['#7a7060', '#26221c'], prop: 'flower', flower: '#ffffff' }],
  ['柳', { skin: 'light', brow: 'willow', eye: 'gentle', head: 'bunSide', outfit: 'cloak', main: '#4a7a6a', trim: '#e8e0c0', bg: ['#4a6a5a', '#16221c'], prop: 'none' }],
  ['虞', { skin: 'fair', brow: 'arched', eye: 'gentle', head: 'bunHigh', outfit: 'robeRich', main: '#8a1e3a', trim: '#e8c86a', bg: ['#4a1a2a', '#18080e'], prop: 'sword' , mark: '#c8323a' }],
];
const ADV_M = [
  ['諸葛', { skin: 'light', brow: 'straight', eye: 'calm', beard: 'goatee', head: 'scarf', outfit: 'robeSage', main: '#e8e4d8', trim: '#3a4a6a', bg: ['#3a4a5a', '#121a22'], prop: 'featherFan' }],
  ['張', { skin: 'fair', brow: 'straight', eye: 'gentle', beard: 'none', head: 'scarf', outfit: 'robeSage', main: '#d8e0e8', trim: '#4a5a7a', bg: ['#4a5a6a', '#161c24'], prop: 'scroll' }],
  ['劉', { skin: 'light', brow: 'straight', eye: 'calm', beard: 'long', head: 'daoHat', outfit: 'robeSage', main: '#3a4a6a', trim: '#d8c890', bg: ['#2a3a4a', '#0c1218'], prop: 'featherFan' }],
  ['孫', { skin: 'warm', brow: 'straight', eye: 'calm', beard: 'goatee', head: 'crown', outfit: 'robe', main: '#5a3a2a', trim: '#e8d8b0', bg: ['#4a3a2a', '#1a140c'], prop: 'scroll' }],
  ['姜', { skin: 'warm', brow: 'white', eye: 'calm', beard: 'longWhite', head: 'daoHat', outfit: 'robeSage', main: '#c8b890', trim: '#5a4a2a', bg: ['#5a5a4a', '#1e1e16'], prop: 'fishingRod' }],
  ['范', { skin: 'light', brow: 'straight', eye: 'gentle', beard: 'mustache', head: 'crown', outfit: 'robe', main: '#2a6a5a', trim: '#e8d8a0', bg: ['#2a5a4a', '#0c1e18'], prop: 'none' }],
  ['龐', { skin: 'tan', brow: 'thick', eye: 'round', beard: 'goatee', head: 'scarf', outfit: 'robeSage', main: '#6a5a3a', trim: '#e0d0a0', bg: ['#4a4030', '#18140e'], prop: 'featherFan' }],
  ['司馬', { skin: 'light', brow: 'sword', eye: 'phoenix', beard: 'long', head: 'officialHat', outfit: 'robe', main: '#4a2a4a', trim: '#d8b45a', bg: ['#3a2a3a', '#120a12'], prop: 'none' }],
  ['蕭', { skin: 'warm', brow: 'straight', eye: 'calm', beard: 'goatee', head: 'officialHat', outfit: 'robe', main: '#7a2a2a', trim: '#e8d8a0', bg: ['#5a2a2a', '#1e0c0c'], prop: 'scroll' }],
  ['郭', { skin: 'fair', brow: 'straight', eye: 'gentle', beard: 'none', head: 'scarf', outfit: 'robeSage', main: '#7a8aa0', trim: '#e8e0c8', bg: ['#4a5a6a', '#141c24'], prop: 'cup' }],
];
const ADV_F = [
  ['黃', { skin: 'light', brow: 'willow', eye: 'calm', head: 'bunHigh', outfit: 'robeSage', main: '#c8b070', trim: '#4a3a1a', bg: ['#5a4a2a', '#1e180c'], prop: 'featherFan' }],
  ['班', { skin: 'light', brow: 'willow', eye: 'calm', head: 'bunHigh', outfit: 'robeSage', main: '#8a9a7a', trim: '#e8e0c0', bg: ['#4a5a4a', '#161e16'], prop: 'scroll' }],
  ['冼', { skin: 'tan', brow: 'arched', eye: 'fierce', head: 'helmetLady', outfit: 'armorLady', main: '#5a3a7a', trim: '#e8c86a', bg: ['#3a2a4a', '#120c18'], prop: 'none' }],
  ['長孫', { skin: 'fair', brow: 'willow', eye: 'calm', head: 'phoenixCrown', outfit: 'robeRich', main: '#6a2a2a', trim: '#e8c86a', bg: ['#4a2020', '#180a0a'], prop: 'scroll' , mark: '#d8323a' }],
  ['謝', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunSide', outfit: 'robeSage', main: '#d0d8e8', trim: '#5a6a8a', bg: ['#5a6a8a', '#1c2230'], prop: 'brush' , mark: '#4a7ac0' }],
  ['秦', { skin: 'light', brow: 'arched', eye: 'fierce', head: 'helmetFeatherLady', outfit: 'armorLady', main: '#2a4a3a', trim: '#d8b45a', bg: ['#2a3a2a', '#0c140c'], prop: 'spear' }],
  ['鍾', { skin: 'warm', brow: 'arched', eye: 'calm', head: 'bunHigh', outfit: 'robe', main: '#3a3a5a', trim: '#e8d8b0', bg: ['#3a3a4a', '#121218'], prop: 'scroll' }],
  ['馮', { skin: 'light', brow: 'willow', eye: 'calm', head: 'hood', outfit: 'cloak', main: '#2a5a7a', trim: '#f0e0c0', bg: ['#5a7a8a', '#1a262c'], prop: 'none' }],
  ['荀', { skin: 'fair', brow: 'arched', eye: 'calm', head: 'bunDouble', outfit: 'armorLady', main: '#7a5a2a', trim: '#e8c86a', bg: ['#5a4a2a', '#1e180c'], prop: 'sword' }],
  ['許', { skin: 'fair', brow: 'willow', eye: 'gentle', head: 'bunHigh', outfit: 'robeSage', main: '#b0c8b8', trim: '#3a5a4a', bg: ['#5a7a6a', '#1a2620'], prop: 'fanRound' }],
];

// ---------------- 繪圖元件 ----------------
const W = 240, H = 300;
let uid = 0;
const id = (p) => `${p}${++uid}`;
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [f(r), f(g), f(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const HAIR = '#1b1512';

function background(c, female) {
  const g = id('bg');
  let s = `<defs><radialGradient id="${g}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${shade(c.bg[0], 0.15)}"/><stop offset="1" stop-color="${c.bg[1]}"/></radialGradient></defs>`;
  s += `<rect width="${W}" height="${H}" rx="18" fill="url(#${g})"/>`;
  // 祥雲／山水
  const o = 0.13;
  s += `<g fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="3" stroke-linecap="round">`;
  s += `<path d="M18 70 q14 -16 28 0 q14 16 28 0"/><path d="M168 46 q12 -14 24 0 q12 14 24 0"/><path d="M190 120 q10 -12 20 0"/>`;
  s += `</g>`;
  if (!female) s += `<path d="M0 230 L40 190 L70 215 L110 175 L150 210 L190 180 L240 220 L240 300 L0 300 Z" fill="#000" opacity="0.18"/>`;
  else s += `<circle cx="196" cy="62" r="26" fill="#fff" opacity="0.10"/>`;
  return s;
}

function prop(c, front) {
  const p = c.prop;
  const tr = c.trim;
  if (!front) {
    // 背後的長兵器
    if (p === 'glaive') return `<g><rect x="196" y="20" width="7" height="280" fill="#6a4a2a"/><path d="M199 8 C230 30 232 78 205 96 L199 96 Z" fill="#cfd6dc" stroke="#7a8a96" stroke-width="2"/><circle cx="200" cy="100" r="7" fill="${tr}"/><path d="M196 96 q-14 10 -6 26" stroke="#b8262a" stroke-width="5" fill="none"/></g>`;
    if (p === 'spear') return `<g><rect x="200" y="30" width="6" height="270" fill="#5a3a22"/><path d="M203 6 L214 40 L203 50 L192 40 Z" fill="#d6dde3" stroke="#7a8a96" stroke-width="2"/><path d="M196 52 q7 14 14 0 q-3 18 -7 22 q-4 -4 -7 -22" fill="#c0392b"/></g>`;
    if (p === 'halberd') return `<g><rect x="200" y="22" width="6" height="278" fill="#4a3020"/><path d="M203 4 L211 30 L195 30 Z" fill="#d6dde3"/><path d="M206 34 C228 36 232 60 214 70 C220 56 216 46 206 46 Z" fill="#d6dde3" stroke="#7a8a96" stroke-width="1.5"/><path d="M200 34 C182 38 180 54 192 62 C190 52 194 46 200 46 Z" fill="#d6dde3"/></g>`;
    if (p === 'bow') return `<path d="M210 40 C250 120 250 200 210 280" stroke="#6a3a1a" stroke-width="7" fill="none"/><path d="M210 40 L210 280" stroke="#e8e0c8" stroke-width="1.5"/>`;
    if (p === 'fishingRod') return `<g><path d="M30 300 L60 30" stroke="#6a4a2a" stroke-width="5"/><path d="M60 30 Q70 80 66 150" stroke="#ddd" stroke-width="1" fill="none"/></g>`;
    if (p === 'moon') return `<circle cx="188" cy="64" r="34" fill="#fff6d0" opacity="0.85"/><circle cx="200" cy="56" r="30" fill="${c.bg[1]}" opacity="0.6"/>`;
    return '';
  }
  // 前景道具
  if (p === 'featherFan') return `<g transform="translate(192 262) rotate(-14) scale(0.82)"><path d="M0 0 C-30 -20 -34 -70 0 -86 C34 -70 30 -20 0 0 Z" fill="#f4f1ea" stroke="#c8c0b0" stroke-width="2"/><g stroke="#cfc6b4" stroke-width="1.2">${[-60, -40, -20, 0, 20, 40, 60].map((a) => `<path d="M0 -4 L${Math.sin((a * Math.PI) / 180) * 30} ${-Math.cos((a * Math.PI) / 180) * 76}"/>`).join('')}</g><rect x="-4" y="0" width="8" height="40" rx="3" fill="#6a3a1a"/></g>`;
  if (p === 'scroll') return `<g transform="translate(160 236) rotate(-12)"><rect x="0" y="0" width="60" height="20" rx="4" fill="#efe2bf" stroke="#b89a5a" stroke-width="2"/><rect x="-6" y="-3" width="8" height="26" rx="3" fill="#7a4a2a"/><rect x="58" y="-3" width="8" height="26" rx="3" fill="#7a4a2a"/><path d="M8 7 h40 M8 13 h30" stroke="#8a6a3a" stroke-width="1.5"/></g>`;
  if (p === 'sword') return `<g transform="translate(184 300) rotate(-14)"><rect x="-3" y="-120" width="6" height="96" fill="#d6dde3" stroke="#8a96a0"/><rect x="-14" y="-26" width="28" height="7" rx="3" fill="${tr}"/><rect x="-3" y="-20" width="6" height="22" fill="#4a2a1a"/></g>`;
  if (p === 'mace') return `<g transform="translate(190 300) rotate(-16)"><rect x="-4" y="-110" width="8" height="110" fill="#5a5a60"/><rect x="-9" y="-140" width="18" height="36" rx="4" fill="#9aa0a8" stroke="#5a5a60" stroke-width="2"/></g>`;
  if (p === 'flower') return `<g transform="translate(182 238)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="${Math.cos((a * Math.PI) / 180) * 9}" cy="${Math.sin((a * Math.PI) / 180) * 9}" rx="9" ry="6" transform="rotate(${a} ${Math.cos((a * Math.PI) / 180) * 9} ${Math.sin((a * Math.PI) / 180) * 9})" fill="${c.flower || '#f7c8d6'}" stroke="#d48aa0" stroke-width="1"/>`).join('')}<circle r="5" fill="#f4c430"/><path d="M0 12 q-6 20 -16 40" stroke="#3a7a3a" stroke-width="3" fill="none"/></g>`;
  if (p === 'peony') return `<g transform="translate(180 236)"><circle r="17" fill="${c.flower}"/><circle r="11" fill="${shade(c.flower, 0.25)}"/><circle r="5" fill="${shade(c.flower, 0.5)}"/><path d="M-14 12 q-10 10 -4 22 M10 14 q8 10 4 22" stroke="#3a7a3a" stroke-width="5" fill="none"/></g>`;
  if (p === 'fanRound') return `<g transform="translate(178 222)"><circle r="26" fill="#f4ecd8" stroke="${tr}" stroke-width="3"/><path d="M-14 6 q8 -18 16 -4 q8 -14 14 2" stroke="#7a9a6a" stroke-width="2" fill="none"/><circle cx="8" cy="-8" r="5" fill="#e88a8a" opacity="0.8"/><rect x="-3" y="24" width="6" height="34" fill="#6a3a1a"/></g>`;
  if (p === 'pipa') return `<g transform="translate(172 230) rotate(-24)"><ellipse cx="0" cy="18" rx="24" ry="30" fill="#b06a2a" stroke="#6a3a1a" stroke-width="2"/><rect x="-4" y="-46" width="8" height="40" fill="#8a4a1a"/><circle cx="0" cy="22" r="6" fill="#3a1a0a"/><path d="M-2 -40 v66 M2 -40 v66" stroke="#f0e0c0" stroke-width="0.8"/></g>`;
  if (p === 'ribbon') return `<path d="M150 300 C170 250 230 260 214 210 C204 180 236 170 240 150" stroke="#f7b7d0" stroke-width="7" fill="none" opacity="0.9"/>`;
  if (p === 'drum') return `<g transform="translate(184 250)"><ellipse rx="26" ry="20" fill="#a8323a" stroke="#e8c86a" stroke-width="3"/><ellipse rx="20" ry="14" fill="#e8d8b0"/><path d="M-30 -30 L-6 -6" stroke="#6a3a1a" stroke-width="4"/></g>`;
  if (p === 'brush') return `<g transform="translate(184 236) rotate(-30)"><rect x="-3" y="-44" width="6" height="52" fill="#6a3a1a"/><path d="M-4 8 Q0 26 4 8 Z" fill="#1a1a1a"/></g>`;
  if (p === 'cup') return `<g transform="translate(180 240)"><path d="M-14 -10 h28 l-4 22 h-20 Z" fill="#c8a24a" stroke="#7a5a1a" stroke-width="2"/><rect x="-3" y="12" width="6" height="8" fill="#c8a24a"/><rect x="-10" y="20" width="20" height="4" rx="2" fill="#c8a24a"/></g>`;
  return '';
}

function body(c, female) {
  const g = id('rb');
  const m = c.main, tr = c.trim;
  let s = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(m, 0.12)}"/><stop offset="1" stop-color="${shade(m, -0.35)}"/></linearGradient></defs>`;
  const shoulders = female ? 'M28 300 C34 252 72 228 120 224 C168 228 206 252 212 300 Z' : 'M12 300 C18 244 66 218 120 214 C174 218 222 244 228 300 Z';
  s += `<path d="${shoulders}" fill="url(#${g})"/>`;
  const o = c.outfit;
  if (o.startsWith('armor') || o === 'robeArmor') {
    const lady = o === 'armorLady';
    const plate = o === 'armorWhite' ? '#f4f6f8' : shade(m, -0.1);
    // 魚鱗甲
    const pid = id('scale');
    s += `<defs><pattern id="${pid}" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 10 Q7 -2 14 10" fill="none" stroke="${shade(tr, -0.25)}" stroke-width="1.4"/></pattern></defs>`;
    s += `<path d="${lady ? 'M74 300 L82 244 Q120 232 158 244 L166 300 Z' : 'M64 300 L74 240 Q120 228 166 240 L176 300 Z'}" fill="${plate}"/>`;
    s += `<path d="${lady ? 'M74 300 L82 244 Q120 232 158 244 L166 300 Z' : 'M64 300 L74 240 Q120 228 166 240 L176 300 Z'}" fill="url(#${pid})"/>`;
    // 護心鏡
    s += `<circle cx="120" cy="${lady ? 268 : 264}" r="${lady ? 13 : 16}" fill="${tr}" stroke="${shade(tr, -0.4)}" stroke-width="2.5"/><circle cx="120" cy="${lady ? 268 : 264}" r="${lady ? 7 : 9}" fill="${shade(tr, 0.4)}"/>`;
    // 肩甲（獸頭）
    for (const x of lady ? [56, 184] : [44, 196]) {
      s += `<ellipse cx="${x}" cy="${lady ? 252 : 246}" rx="${lady ? 22 : 30}" ry="${lady ? 16 : 22}" fill="${shade(m, -0.15)}" stroke="${tr}" stroke-width="3"/>`;
      const cy = lady ? 250 : 244, r = lady ? 6 : 9;
      s += `<circle cx="${x}" cy="${cy}" r="${r}" fill="${tr}" stroke="${shade(tr, -0.45)}" stroke-width="1.5"/><circle cx="${x}" cy="${cy}" r="${r * 0.45}" fill="${shade(tr, 0.45)}"/>`;
      for (const dx of [-1, 1]) s += `<circle cx="${x + dx * (lady ? 13 : 18)}" cy="${cy + 4}" r="2.4" fill="${tr}"/>`;
    }
    // 披風
    if (o !== 'robeArmor') s += `<path d="M${lady ? 36 : 22} 300 C${lady ? 30 : 16} 280 ${lady ? 38 : 26} 262 ${lady ? 44 : 30} 258" stroke="${shade(m, -0.4)}" stroke-width="8" fill="none"/>`;
    if (o === 'robeArmor') s += `<path d="M86 228 L120 286 L154 228" fill="none" stroke="${tr}" stroke-width="5"/>`;
  } else {
    // 交領袍服
    const rich = o === 'robeRich', sage = o === 'robeSage', cloak = o === 'cloak';
    s += `<path d="M92 222 L120 278 L128 266 L104 222 Z" fill="${tr}"/>`;
    s += `<path d="M148 222 L120 278 L112 266 L136 222 Z" fill="${shade(tr, -0.08)}"/>`;
    s += `<path d="M96 224 L120 270 L144 224" fill="none" stroke="${shade(m, -0.45)}" stroke-width="2"/>`;
    if (rich) {
      // 刺繡紋樣
      s += `<g fill="none" stroke="${tr}" stroke-width="2" opacity="0.85">`;
      for (const [x, y] of [[62, 262], [176, 262], [84, 290], [156, 290]]) s += `<circle cx="${x}" cy="${y}" r="8"/><circle cx="${x}" cy="${y}" r="3" fill="${tr}"/>`;
      s += `</g>`;
    }
    if (sage) s += `<path d="M40 300 C60 256 90 236 104 226" stroke="${shade(c.trim, 0)}" stroke-width="6" fill="none" opacity="0.55"/><path d="M200 300 C180 256 150 236 136 226" stroke="${c.trim}" stroke-width="6" fill="none" opacity="0.55"/>`;
    if (cloak) s += `<path d="M${female ? 28 : 12} 300 C${female ? 32 : 16} 250 ${female ? 60 : 50} 228 100 220 L120 236 L140 220 C${female ? 180 : 190} 228 ${female ? 208 : 224} 250 ${female ? 212 : 228} 300 Z" fill="${shade(m, -0.05)}" opacity="0.9"/><path d="M100 222 Q120 246 140 222" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.92"/>`;
    // 腰帶
    s += `<rect x="${female ? 70 : 60}" y="290" width="${female ? 100 : 120}" height="10" fill="${shade(tr, -0.2)}"/>`;
  }
  return s;
}

function head(c, female) {
  const skin = SKIN[c.skin] || c.skin;
  const sk2 = shade(skin, -0.16);
  const g = id('sk');
  let s = `<defs><radialGradient id="${g}" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="${shade(skin, 0.1)}"/><stop offset="1" stop-color="${sk2}"/></radialGradient></defs>`;
  // 脖子
  s += `<path d="M104 176 L104 222 Q120 234 136 222 L136 176 Z" fill="${sk2}"/>`;
  // 耳朵
  s += `<ellipse cx="74" cy="132" rx="8" ry="14" fill="${sk2}"/><ellipse cx="166" cy="132" rx="8" ry="14" fill="${sk2}"/>`;
  if (female) s += `<circle cx="74" cy="148" r="3.2" fill="#e8c86a"/><path d="M74 151 v10" stroke="#e8c86a" stroke-width="1.5"/><circle cx="74" cy="163" r="3" fill="#7ac0a0"/><circle cx="166" cy="148" r="3.2" fill="#e8c86a"/><path d="M166 151 v10" stroke="#e8c86a" stroke-width="1.5"/><circle cx="166" cy="163" r="3" fill="#7ac0a0"/>`;
  // 臉型
  const face = female
    ? 'M78 118 C78 84 98 70 120 70 C142 70 162 84 162 118 C162 150 146 176 120 184 C94 176 78 150 78 118 Z'
    : 'M76 116 C76 82 96 68 120 68 C144 68 164 82 164 116 C164 150 152 176 120 186 C88 176 76 150 76 116 Z';
  s += `<path d="${face}" fill="url(#${g})"/>`;
  // 花鈿（額間花飾）
  if (female && c.mark) s += `<path d="M120 94 C114 100 116 106 120 108 C124 106 126 100 120 94 Z" fill="${c.mark}"/><circle cx="120" cy="102" r="1.6" fill="#ffe8a0"/>`;
  // 腮紅
  if (female) s += `<ellipse cx="95" cy="146" rx="10" ry="6" fill="#ff7a8a" opacity="0.28"/><ellipse cx="145" cy="146" rx="10" ry="6" fill="#ff7a8a" opacity="0.28"/>`;
  else if (c.skin !== 'red' && c.skin !== 'dark') s += `<ellipse cx="94" cy="148" rx="9" ry="5" fill="#d07060" opacity="0.15"/><ellipse cx="146" cy="148" rx="9" ry="5" fill="#d07060" opacity="0.15"/>`;
  // 眉
  const bc = c.brow === 'white' ? '#e8e8e8' : c.beard === 'longWhite' ? '#d8d8d8' : HAIR;
  const brows = {
    sword: ['M88 112 L112 104 L112 109 L90 115 Z', 'M152 112 L128 104 L128 109 L150 115 Z'],
    thick: ['M86 110 Q100 100 114 106 L113 112 Q100 108 87 115 Z', 'M154 110 Q140 100 126 106 L127 112 Q140 108 153 115 Z'],
    straight: ['M89 110 Q100 106 112 108 L112 111 Q100 110 89 113 Z', 'M151 110 Q140 106 128 108 L128 111 Q140 110 151 113 Z'],
    willow: ['M90 110 Q101 104 113 108 Q101 107 90 111 Z', 'M150 110 Q139 104 127 108 Q139 107 150 111 Z'],
    arched: ['M89 111 Q100 100 113 107 Q100 104 89 112 Z', 'M151 111 Q140 100 127 107 Q140 104 151 112 Z'],
    white: ['M86 110 Q100 102 114 106 L113 112 Q100 108 87 116 Z', 'M154 110 Q140 102 126 106 L127 112 Q140 108 153 116 Z'],
  }[c.brow] || ['', ''];
  s += `<path d="${brows[0]}" fill="${bc}"/><path d="${brows[1]}" fill="${bc}"/>`;
  // 眼
  const eye = (cx, dir) => {
    const t = c.eye;
    let shape;
    if (t === 'phoenix') shape = `M${cx - 11} ${125} Q${cx} ${117} ${cx + 11} ${122 - dir * 2} Q${cx} ${129} ${cx - 11} 125 Z`;
    else if (t === 'fierce') shape = `M${cx - 11} 124 Q${cx} 116 ${cx + 11} 122 Q${cx} 130 ${cx - 11} 124 Z`;
    else if (t === 'round') shape = `M${cx - 10} 124 Q${cx} 113 ${cx + 10} 124 Q${cx} 133 ${cx - 10} 124 Z`;
    else if (t === 'gentle') shape = `M${cx - 11} 125 Q${cx} 116 ${cx + 11} 125 Q${cx} 131 ${cx - 11} 125 Z`;
    else shape = `M${cx - 11} 125 Q${cx} 118 ${cx + 11} 125 Q${cx} 130 ${cx - 11} 125 Z`;
    let e = `<path d="${shape}" fill="#fffaf2"/>`;
    e += `<circle cx="${cx}" cy="124.5" r="${t === 'round' ? 5 : 4.6}" fill="#2a1a10"/><circle cx="${cx}" cy="124.5" r="2.2" fill="#000"/><circle cx="${cx + 1.6}" cy="122.8" r="1.4" fill="#fff"/>`;
    e += `<path d="${shape}" fill="none" stroke="#2a1a10" stroke-width="${female ? 2 : 1.6}"/>`;
    if (female) e += `<path d="M${cx + (dir > 0 ? 9 : -9)} 121 l${dir * 5} -3" stroke="#2a1a10" stroke-width="1.6"/>`;
    return e;
  };
  s += eye(100, -1) + eye(140, 1);
  // 鼻、口
  s += `<path d="M120 128 Q117 146 114 150 Q120 154 126 150" fill="none" stroke="${shade(skin, -0.35)}" stroke-width="1.8" stroke-linecap="round"/>`;
  if (female) s += `<path d="M110 163 Q115 159 120 161 Q125 159 130 163 Q120 170 110 163 Z" fill="#c8323a"/><path d="M110 163 Q120 165 130 163" stroke="#8a1a22" stroke-width="1" fill="none"/>`;
  else s += `<path d="M108 164 Q120 168 132 164" fill="none" stroke="#6a2a20" stroke-width="2.4" stroke-linecap="round"/>`;
  // 紅臉額外的深色描邊
  if (c.skin === 'red') s += `<path d="M96 100 q24 -8 48 0" stroke="#8a2a1a" stroke-width="1.5" fill="none" opacity="0.6"/>`;
  return s;
}

function beard(c) {
  const col = c.beard === 'longWhite' ? '#e4e4e4' : HAIR;
  switch (c.beard) {
    case 'long':
    case 'longWhite':
      return `<path d="M104 156 Q120 150 136 156 Q134 164 120 166 Q106 164 104 156 Z" fill="${col}"/><path d="M98 162 Q96 220 120 250 Q144 220 142 162 Q132 176 120 176 Q108 176 98 162 Z" fill="${col}"/><path d="M110 178 Q112 214 120 240 M130 178 Q128 214 120 240" stroke="${c.beard === 'longWhite' ? '#bbb' : '#3a2a20'}" stroke-width="1.2" fill="none"/>`;
    case 'full':
      return `<path d="M80 136 Q84 176 104 190 Q120 200 136 190 Q156 176 160 136 Q152 160 136 168 Q120 172 104 168 Q88 160 80 136 Z" fill="${col}"/><path d="M84 150 l-6 8 M90 166 l-6 8 M156 150 l6 8 M150 166 l6 8 M110 190 l-2 10 M130 190 l2 10" stroke="${col}" stroke-width="4" stroke-linecap="round"/><path d="M104 156 Q120 150 136 156 Q134 162 120 162 Q106 162 104 156 Z" fill="${col}"/>`;
    case 'goatee':
      return `<path d="M106 156 Q120 151 134 156 Q130 160 120 159 Q110 160 106 156 Z" fill="${col}"/><path d="M112 172 Q120 200 128 172 Q120 178 112 172 Z" fill="${col}"/>`;
    case 'mustache':
      return `<path d="M104 157 Q120 150 136 157 Q128 160 120 158 Q112 160 104 157 Z" fill="${col}"/><path d="M114 173 Q120 182 126 173 Q120 176 114 173 Z" fill="${col}"/>`;
    default:
      return '';
  }
}

function hair(c, female, layer) {
  const h = c.head;
  const tr = c.trim;
  if (layer === 'back') {
    if (female) {
      if (h === 'hood') return '';
      return `<path d="M72 110 C64 170 70 220 84 238 L156 238 C170 220 176 170 168 110 Z" fill="${HAIR}"/>`;
    }
    return '';
  }
  // 前面：頭髮與頭飾
  let s = '';
  if (!female) {
    const cap = `<path d="M74 118 C70 72 96 54 120 54 C144 54 170 72 166 118 C160 96 146 86 120 86 C94 86 80 96 74 118 Z" fill="${c.beard === 'longWhite' ? '#d8d8d8' : HAIR}"/>`;
    if (h.startsWith('helmet') || h === 'mask') {
      const white = h === 'helmetWhite';
      const metal = white ? '#eef1f4' : '#8a8f98';
      s += `<path d="M70 120 C64 66 94 44 120 44 C146 44 176 66 170 120 L160 120 C158 92 144 80 120 80 C96 80 82 92 80 120 Z" fill="${metal}" stroke="${tr}" stroke-width="3"/>`;
      s += `<path d="M72 120 C70 150 74 170 84 182 L88 128 Z" fill="${metal}" stroke="${tr}" stroke-width="2"/><path d="M168 120 C170 150 166 170 156 182 L152 128 Z" fill="${metal}" stroke="${tr}" stroke-width="2"/>`;
      s += `<path d="M84 84 Q120 68 156 84" stroke="${tr}" stroke-width="5" fill="none"/>`;
      s += `<path d="M120 44 L120 26" stroke="${tr}" stroke-width="5"/><circle cx="120" cy="24" r="6" fill="${tr}"/>`;
      if (h === 'helmetFeather') s += `<path d="M118 22 C96 -6 70 4 56 14 C80 10 100 14 116 28" fill="#d43a2a"/><path d="M122 22 C144 -6 170 4 184 14 C160 10 140 14 124 28" fill="#d43a2a"/><path d="M118 22 C100 -10 74 -2 60 8" stroke="#8a1a10" stroke-width="1.5" fill="none"/><path d="M122 22 C140 -10 166 -2 180 8" stroke="#8a1a10" stroke-width="1.5" fill="none"/>`;
      else if (h === 'helmetHorn') s += `<path d="M82 70 C64 52 60 30 66 16 C72 40 86 52 96 58 Z" fill="${tr}"/><path d="M158 70 C176 52 180 30 174 16 C168 40 154 52 144 58 Z" fill="${tr}"/>`;
      else s += `<path d="M120 22 C110 6 128 0 124 -6 C140 8 130 16 122 26 Z" fill="#c0392b"/><path d="M112 26 q8 -20 16 0" fill="#c0392b"/>`;
      if (h === 'mask') s += `<path d="M86 108 Q120 96 154 108 L150 134 Q138 128 132 138 L120 142 L108 138 Q102 128 90 134 Z" fill="#9aa0aa" stroke="#5a5f68" stroke-width="2"/><ellipse cx="100" cy="122" rx="8" ry="4" fill="#1a1a1a"/><ellipse cx="140" cy="122" rx="8" ry="4" fill="#1a1a1a"/>`;
      return s;
    }
    s += cap;
    if (h === 'crown') s += `<ellipse cx="120" cy="56" rx="16" ry="12" fill="${HAIR}"/><path d="M104 58 L106 40 L114 50 L120 36 L126 50 L134 40 L136 58 Z" fill="${tr}" stroke="${shade(tr, -0.4)}" stroke-width="1.5"/><path d="M96 54 L144 54" stroke="${tr}" stroke-width="3"/>`;
    else if (h === 'band') s += `<ellipse cx="120" cy="54" rx="15" ry="11" fill="${HAIR}"/><path d="M76 98 Q120 80 164 98 L164 108 Q120 90 76 108 Z" fill="#b8262a"/><path d="M164 100 q14 6 18 22 M164 104 q8 12 8 26" stroke="#b8262a" stroke-width="5" fill="none"/>`;
    else if (h === 'scarfGreen' || h === 'scarf') {
      const col = h === 'scarfGreen' ? '#2f7d4a' : '#3a4a6a';
      s += `<path d="M72 112 C68 60 94 36 120 36 C146 36 172 60 168 112 C160 90 146 80 120 80 C94 80 80 90 72 112 Z" fill="${col}"/><path d="M120 36 L120 82" stroke="${shade(col, -0.35)}" stroke-width="3"/><path d="M160 92 C184 102 188 140 180 168 C176 140 172 118 158 104 Z" fill="${col}"/><path d="M80 92 C56 102 52 140 60 168 C64 140 68 118 82 104 Z" fill="${col}"/>`;
      if (h === 'scarf') s += `<path d="M96 52 Q120 44 144 52" stroke="${shade(col, 0.3)}" stroke-width="2" fill="none"/>`;
    } else if (h === 'officialHat') s += `<path d="M78 92 C78 56 162 56 162 92 Z" fill="#1a1a1a"/><rect x="78" y="88" width="84" height="12" rx="3" fill="#2a2a2a"/><path d="M80 94 L22 86 L22 98 L80 100 Z M160 94 L218 86 L218 98 L160 100 Z" fill="#1a1a1a"/>`;
    else if (h === 'daoHat') s += `<path d="M82 90 L92 44 L148 44 L158 90 Z" fill="#2a2a3a"/><path d="M84 86 L156 86" stroke="${tr}" stroke-width="3"/><circle cx="120" cy="64" r="7" fill="${tr}"/>`;
    return s;
  }
  // 女性
  const front = `<path d="M76 120 C70 70 96 56 120 56 C144 56 170 70 164 120 C156 94 136 86 122 92 L120 82 L118 92 C104 86 84 94 76 120 Z" fill="${HAIR}"/>`;
  if (h === 'hood') {
    // 昭君帽：紅色斗篷帽、白毛邊
    s += `<path d="M64 140 C58 66 92 40 120 40 C148 40 182 66 176 140 C172 110 160 84 120 84 C80 84 68 110 64 140 Z" fill="${c.main}"/>`;
    s += `<path d="M70 126 C68 82 96 64 120 64 C144 64 172 82 170 126" stroke="#f8f4ee" stroke-width="12" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M86 118 C84 92 100 82 120 82 C140 82 156 92 154 118 C146 100 134 96 120 98 C106 96 94 100 86 118 Z" fill="${HAIR}"/>`;
    return s;
  }
  if (h === 'helmetLady' || h === 'helmetFeatherLady') {
    s += front;
    s += `<path d="M76 108 C72 64 96 46 120 46 C144 46 168 64 164 108 C156 90 144 82 120 82 C96 82 84 90 76 108 Z" fill="#c8ccd2" stroke="${tr}" stroke-width="3"/>`;
    s += `<path d="M86 86 Q120 72 154 86" stroke="${tr}" stroke-width="4" fill="none"/><path d="M120 46 v-14" stroke="${tr}" stroke-width="4"/><circle cx="120" cy="30" r="5" fill="${tr}"/>`;
    if (h === 'helmetFeatherLady') s += `<path d="M116 30 C94 2 66 8 50 18 C76 14 98 18 114 34" fill="#e84a3a"/><path d="M124 30 C146 2 174 8 190 18 C164 14 142 18 126 34" fill="#e84a3a"/>`;
    else s += `<path d="M120 28 C112 12 128 6 124 0 C138 14 130 20 122 30 Z" fill="#c0392b"/>`;
    return s;
  }
  s += front;
  if (h === 'bunHigh') s += `<ellipse cx="120" cy="46" rx="26" ry="20" fill="${HAIR}"/><ellipse cx="120" cy="30" rx="16" ry="12" fill="${HAIR}"/><path d="M96 46 L146 40" stroke="${tr === '#ffffff' ? '#e8c86a' : tr}" stroke-width="3"/><circle cx="146" cy="40" r="4" fill="#e8c86a"/><path d="M146 44 v18 M150 44 v14" stroke="#e8c86a" stroke-width="1.2"/><circle cx="146" cy="63" r="2.5" fill="#d84a5a"/><circle cx="150" cy="59" r="2.5" fill="#7ac0a0"/>`;
  else if (h === 'bunDouble') s += `<circle cx="90" cy="56" r="17" fill="${HAIR}"/><circle cx="150" cy="56" r="17" fill="${HAIR}"/><path d="M78 50 q12 -8 24 0 M138 50 q12 -8 24 0" stroke="#f7b7d0" stroke-width="4" fill="none"/><circle cx="90" cy="44" r="4" fill="#f7b7d0"/><circle cx="150" cy="44" r="4" fill="#f7b7d0"/>`;
  else if (h === 'bunSide') s += `<ellipse cx="146" cy="56" rx="24" ry="18" fill="${HAIR}" transform="rotate(-20 146 56)"/><path d="M128 50 L170 40" stroke="#e8c86a" stroke-width="2.5"/><circle cx="170" cy="40" r="4" fill="#e8c86a"/><path d="M170 44 q4 10 0 20 M174 42 q6 10 4 18" stroke="#e8c86a" stroke-width="1.2" fill="none"/><circle cx="170" cy="65" r="2.5" fill="#d84a5a"/><circle cx="96" cy="68" r="7" fill="#f7c8d6"/><circle cx="96" cy="68" r="3" fill="#e88aa0"/>`;
  else if (h === 'phoenixCrown') s += `<ellipse cx="120" cy="50" rx="30" ry="18" fill="${HAIR}"/><path d="M84 66 L90 40 L102 54 L110 30 L120 48 L130 30 L138 54 L150 40 L156 66 Z" fill="${tr}" stroke="${shade(tr, -0.4)}" stroke-width="1.5"/><circle cx="120" cy="44" r="5" fill="#d84a5a"/><circle cx="102" cy="54" r="3" fill="#4aa0c0"/><circle cx="138" cy="54" r="3" fill="#4aa0c0"/><path d="M84 66 q-8 16 -4 34 M156 66 q8 16 4 34" stroke="${tr}" stroke-width="1.5" fill="none"/><circle cx="80" cy="100" r="3" fill="${tr}"/><circle cx="160" cy="100" r="3" fill="${tr}"/>`;
  return s;
}

function seal(surname, group) {
  // 右下角朱印：姓氏
  const two = surname.length > 1;
  const w = 44, x = W - w - 10, y = H - (two ? 70 : 52) - 10;
  const h = two ? 70 : 52;
  let s = `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#b3161f" stroke="#f3d27a" stroke-width="2"/>`;
  const font = `font-family="DFKai-SB, BiauKai, 'Kaiti TC', KaiTi, serif" font-weight="900" fill="#fff7e6" text-anchor="middle"`;
  if (two) s += `<text x="${x + w / 2}" y="${y + 31}" font-size="28" ${font}>${surname[0]}</text><text x="${x + w / 2}" y="${y + 62}" font-size="28" ${font}>${surname[1]}</text>`;
  else s += `<text x="${x + w / 2}" y="${y + 39}" font-size="36" ${font}>${surname}</text>`;
  s += `</g>`;
  if (group === 'advisor') s += `<g><rect x="10" y="${H - 34}" width="58" height="24" rx="12" fill="#1d140c" stroke="#e8b84a" stroke-width="1.5" opacity="0.92"/><text x="39" y="${H - 16.5}" font-size="16" font-family="'Microsoft JhengHei', 'PingFang TC', sans-serif" font-weight="700" fill="#f3d27a" text-anchor="middle">軍師</text></g>`;
  return s;
}

function portrait(surname, c, group, female) {
  uid = 0;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  s += `<clipPath id="clip"><rect width="${W}" height="${H}" rx="18"/></clipPath><g clip-path="url(#clip)">`;
  s += background(c, female);
  s += prop(c, false);
  s += hair(c, female, 'back');
  s += body(c, female);
  s += head(c, female);
  s += beard(c);
  s += hair(c, female, 'front');
  s += prop(c, true);
  s += seal(surname, group);
  s += `</g><rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17" fill="none" stroke="#e8b84a" stroke-width="3"/></svg>`;
  return s;
}

const meta = [];
const make = (list, prefix, group, female, title) => list.forEach(([surname, c], i) => {
  const pid = `${prefix}${String(i + 1).padStart(2, '0')}`;
  fs.writeFileSync(path.join(OUT, pid + '.svg'), portrait(surname, c, group, female), 'utf8');
  meta.push({ id: pid, group, gender: female ? 'f' : 'm', surname, title, label: `${surname}${title}` });
});
make(MALE, 'm', 'hero', false, '英雄');
make(FEMALE, 'f', 'beauty', true, '佳人');
make(ADV_M, 'am', 'advisor', false, '軍師');
make(ADV_F, 'af', 'advisor', true, '軍師');
fs.writeFileSync(path.join(OUT, 'portraits.json'), JSON.stringify(meta, null, 1), 'utf8');
// 總覽頁（檢查用）
const sheet = `<!doctype html><meta charset="utf-8"><body style="background:#1a120b;color:#eee;font-family:sans-serif;margin:10px">` +
  ['hero', 'beauty', 'advisor'].map((g) => `<h3>${g}</h3><div style="display:grid;grid-template-columns:repeat(10,120px);gap:8px">` + meta.filter((m) => m.group === g).map((m) => `<div style="text-align:center"><img src="${m.id}.svg" width="120"><br>${m.label}</div>`).join('') + '</div>').join('') + '</body>';
fs.writeFileSync(path.join(OUT, '_sheet.html'), sheet, 'utf8');
console.log('產生', meta.length, '張頭像 →', OUT);
