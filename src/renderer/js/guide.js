// 遊戲說明：動畫棋盤＋語音解說＋練習（整盤／半盤）
import { $, $$, h, sleep } from './util.js';
import { Position, K, A, B, N, R, C, P, RED, BLACK, typeOf, colorOf, rowOf, colOf, SQ, MOVE, NAMES, moveFrom, moveTo } from './xiangqi.js';
import { HalfGame, fullSet, ACT, actFrom, actTo, isFlip, sqName } from './banqi.js';
import { explainIllegal, explainIllegalHalf } from './explain.js';

const TYPE = { K, A, B, N, R, C, P };
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of kids) el.append(c);
  return el;
};

// ---------------- 座標 ----------------
// 整盤用 ICCS：a～i 由左到右、0～9 由紅方底線往上；半盤用 A1～D8
const fullSq = (s) => SQ(9 - Number(s[1]), 'abcdefghi'.indexOf(s[0]));
const halfSq = (s) => 'ABCD'.indexOf(s[0]) * 8 + Number(s.slice(1)) - 1;
// 「K:e0 k:e9 ?n:A1」→ { sq: { code, up } }
function parsePieces(spec, half) {
  const out = new Map();
  for (const tok of spec.trim().split(/\s+/)) {
    const m = /^(\?)?([KABNRCPkabnrcp]):(\w\d)$/.exec(tok);
    if (!m) continue;
    const t = TYPE[m[2].toUpperCase()];
    const code = m[2] === m[2].toUpperCase() ? t : t + 8;
    out.set(half ? halfSq(m[3]) : fullSq(m[3]), { code, up: !m[1] });
  }
  return out;
}

// ---------------- 小棋盤（SVG） ----------------
class MiniBoard {
  constructor(host, onClick) {
    this.host = host;
    this.onClick = onClick;
    this.pieces = new Map(); // sq → { g, code, up }
    this.layout('full');
  }

  layout(kind) {
    this.kind = kind;
    this.host.innerHTML = '';
    const half = kind === 'half';
    // 手機直立：半盤改成直的，棋子才不會太小
    this.vertical = half && this.host.clientWidth > 0 && this.host.clientWidth < 560;
    const V = this.vertical;
    const W = half ? (V ? 380 : 700) : 520, H = half ? (V ? 720 : 380) : 590;
    this.svg = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'gb-svg' });
    const bg = svg('rect', { x: 2, y: 2, width: W - 4, height: H - 4, rx: 16, class: 'gb-bg' });
    this.svg.append(bg);
    this.zones = svg('g');
    this.grid = svg('g', { class: 'gb-grid' });
    this.marks = svg('g');
    this.layer = svg('g');
    this.top = svg('g');
    this.svg.append(this.zones, this.grid, this.marks, this.layer, this.top);
    if (half) {
      this.cell = 82; this.ox = V ? 26 : 22; this.oy = 26;
      const line = (x1, y1, x2, y2) => this.grid.append(svg('line', { x1, y1, x2, y2 }));
      const nx = V ? 4 : 8, ny = V ? 8 : 4;
      for (let r = 0; r <= ny; r++) line(this.ox, this.oy + r * this.cell, this.ox + nx * this.cell, this.oy + r * this.cell);
      for (let c = 0; c <= nx; c++) line(this.ox + c * this.cell, this.oy, this.ox + c * this.cell, this.oy + ny * this.cell);
      const colLab = V ? 'ABCD' : '12345678', rowLab = V ? '12345678' : 'ABCD';
      for (let c = 0; c < nx; c++) this.grid.append(svg('text', { x: this.ox + c * this.cell + this.cell / 2, y: this.oy - 8, class: 'gb-coord' }, colLab[c]));
      for (let r = 0; r < ny; r++) this.grid.append(svg('text', { x: this.ox - 13, y: this.oy + r * this.cell + this.cell / 2 + 6, class: 'gb-coord' }, rowLab[r]));
      this.R = 32;
    } else {
      this.cell = 56; this.ox = 36; this.oy = 36;
      const X = (c) => this.ox + c * this.cell, Y = (r) => this.oy + r * this.cell;
      const line = (x1, y1, x2, y2) => this.grid.append(svg('line', { x1, y1, x2, y2 }));
      for (let r = 0; r < 10; r++) line(X(0), Y(r), X(8), Y(r));
      for (let c = 0; c < 9; c++) {
        if (c === 0 || c === 8) line(X(c), Y(0), X(c), Y(9));
        else { line(X(c), Y(0), X(c), Y(4)); line(X(c), Y(5), X(c), Y(9)); }
      }
      for (const [a, b] of [[0, 2], [7, 9]]) { line(X(3), Y(a), X(5), Y(b)); line(X(5), Y(a), X(3), Y(b)); }
      this.grid.append(svg('text', { x: X(2), y: (Y(4) + Y(5)) / 2 + 10, class: 'gb-river' }, '楚 河'), svg('text', { x: X(6), y: (Y(4) + Y(5)) / 2 + 10, class: 'gb-river' }, '漢 界'));
      this.R = 24;
    }
    this.svg.addEventListener('click', (e) => {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
      const sq = this.pick(p.x, p.y);
      if (sq >= 0 && this.onClick) this.onClick(sq);
    });
    this.host.append(this.svg);
    this.pieces.clear();
  }

  xy(sq) {
    if (this.kind === 'half' && this.vertical) return [this.ox + ((sq / 8) | 0) * this.cell + this.cell / 2, this.oy + (sq % 8) * this.cell + this.cell / 2];
    if (this.kind === 'half') return [this.ox + (sq % 8) * this.cell + this.cell / 2, this.oy + ((sq / 8) | 0) * this.cell + this.cell / 2];
    return [this.ox + colOf(sq) * this.cell, this.oy + rowOf(sq) * this.cell];
  }

  pick(x, y) {
    if (this.kind === 'half') {
      let c = Math.floor((x - this.ox) / this.cell), r = Math.floor((y - this.oy) / this.cell);
      if (this.vertical) [c, r] = [r, c];
      return c >= 0 && c < 8 && r >= 0 && r < 4 ? r * 8 + c : -1;
    }
    const c = Math.round((x - this.ox) / this.cell), r = Math.round((y - this.oy) / this.cell);
    if (c < 0 || c > 8 || r < 0 || r > 9) return -1;
    return Math.hypot(x - this.ox - c * this.cell, y - this.oy - r * this.cell) < this.cell * 0.48 ? SQ(r, c) : -1;
  }

  pieceEl(code, up) {
    const red = colorOf(code) === RED;
    const g = svg('g', { class: 'gp' + (up ? '' : ' down') });
    const face = svg('g', { class: 'gp-face' });
    face.append(
      svg('circle', { r: this.R + 2, class: 'gp-shadow' }),
      svg('circle', { r: this.R, class: 'gp-body ' + (red ? 'red' : 'black') }),
      svg('circle', { r: this.R - 5, class: 'gp-ring ' + (red ? 'red' : 'black') }),
      svg('text', { y: this.R * 0.36, class: 'gp-ch ' + (red ? 'red' : 'black'), 'font-size': this.R * 1.08 }, NAMES[colorOf(code)][typeOf(code)]));
    const back = svg('g', { class: 'gp-back' });
    back.append(svg('circle', { r: this.R + 2, class: 'gp-shadow' }), svg('circle', { r: this.R, class: 'gp-bodyback' }), svg('text', { y: this.R * 0.3, class: 'gp-backch', 'font-size': this.R * 0.62 }, '小柯'));
    g.append(back, face);
    return g;
  }

  setPieces(map) {
    this.layer.innerHTML = '';
    this.pieces.clear();
    for (const [sq, { code, up }] of map) {
      const g = this.pieceEl(code, up);
      const [x, y] = this.xy(sq);
      g.style.transform = `translate(${x}px, ${y}px)`;
      this.layer.append(g);
      this.pieces.set(sq, { g, code, up });
    }
  }

  clearMarks() { this.marks.innerHTML = ''; this.top.innerHTML = ''; this.zones.innerHTML = ''; }

  select(sq) {
    if (sq == null || sq < 0) return;
    const [x, y] = this.xy(sq);
    this.marks.append(svg('circle', { cx: x, cy: y, r: this.R + 7, class: 'gm-sel' }));
  }

  legal(list) {
    for (const sq of list) {
      const [x, y] = this.xy(sq);
      const cap = this.pieces.has(sq);
      this.marks.append(cap ? svg('circle', { cx: x, cy: y, r: this.R + 5, class: 'gm-cap' }) : svg('circle', { cx: x, cy: y, r: 9, class: 'gm-ok' }));
    }
  }

  bad(list) {
    for (const [sq, why] of list) {
      const [x, y] = this.xy(sq);
      const s = 11;
      const g = svg('g', { class: 'gm-bad' });
      g.append(svg('circle', { cx: x, cy: y, r: s + 6 }), svg('path', { d: `M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s}` }));
      if (why) g.append(svg('title', {}, why));
      this.top.append(g);
    }
  }

  arrow(from, to) {
    const [x1, y1] = this.xy(from), [x2, y2] = this.xy(to);
    const ang = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1) - this.R;
    const ex = x1 + Math.cos(ang) * len, ey = y1 + Math.sin(ang) * len;
    this.top.append(svg('path', { d: `M${x1} ${y1} L${ex} ${ey}`, class: 'gm-arrow' }),
      svg('path', { d: `M${ex} ${ey} l${-14 * Math.cos(ang - 0.45)} ${-14 * Math.sin(ang - 0.45)} M${ex} ${ey} l${-14 * Math.cos(ang + 0.45)} ${-14 * Math.sin(ang + 0.45)}`, class: 'gm-arrow' }));
  }

  zone(name) {
    if (this.kind !== 'full') return;
    const X = (c) => this.ox + c * this.cell, Y = (r) => this.oy + r * this.cell;
    if (name === 'river') this.zones.append(svg('rect', { x: X(0), y: Y(4), width: X(8) - X(0), height: this.cell, class: 'gz' }));
    if (name === 'palace') for (const r of [0, 7]) this.zones.append(svg('rect', { x: X(3) - 8, y: Y(r) - 8, width: this.cell * 2 + 16, height: this.cell * 2 + 16, rx: 8, class: 'gz' }));
    if (name === 'redside') this.zones.append(svg('rect', { x: X(0) - 10, y: Y(5) - 10, width: X(8) - X(0) + 20, height: this.cell * 4 + 20, rx: 8, class: 'gz' }));
  }

  move(from, to) {
    const p = this.pieces.get(from);
    if (!p) return sleep(10);
    const victim = this.pieces.get(to);
    this.pieces.delete(from);
    this.pieces.set(to, p);
    const [x, y] = this.xy(to);
    p.g.classList.add('lift');
    p.g.style.transform = `translate(${x}px, ${y}px)`;
    if (victim) setTimeout(() => { victim.g.classList.add('gone'); setTimeout(() => victim.g.remove(), 500); }, 550);
    return sleep(750).then(() => p.g.classList.remove('lift'));
  }

  flip(sq) {
    const p = this.pieces.get(sq);
    if (!p || p.up) return sleep(10);
    p.up = true;
    p.g.classList.add('flipping');
    setTimeout(() => p.g.classList.remove('down'), 260);
    return sleep(600).then(() => p.g.classList.remove('flipping'));
  }

  flash(sq, cls) {
    const [x, y] = this.xy(sq);
    const c = svg('circle', { cx: x, cy: y, r: this.R + 8, class: cls });
    this.top.append(c);
    setTimeout(() => c.remove(), 900);
  }
}

// ---------------- 語音 ----------------
class Narrator {
  constructor() {
    this.on = true;
    this.rate = 1;
    this.voice = null;
    this.onReady = null;
    this.pick();
    // 語音清單是非同步載入的，載入後再挑一次並通知畫面
    if ('speechSynthesis' in window) {
      speechSynthesis.addEventListener('voiceschanged', () => { this.pick(); if (this.onReady) this.onReady(); });
      let n = 0;
      const poll = () => { if (this.voice || ++n > 30) { if (this.onReady) this.onReady(); return; } this.pick(); setTimeout(poll, 200); };
      poll();
    }
  }
  pick() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    const pref = [/Yating/i, /Hanhan/i, /Mei-?Jia/i, /Zhiwei/i];
    this.voice = pref.map((re) => vs.find((v) => re.test(v.name))).find(Boolean)
      || vs.find((v) => /zh[-_]TW/i.test(v.lang)) || vs.find((v) => /zh[-_]HK/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  get native() { return window.xk && window.xk.tts && window.xk.tts.available() ? window.xk.tts : null; }
  get available() { if (this.native) return true; if (!this.voice) this.pick(); return 'speechSynthesis' in window && !!this.voice; }
  get voiceName() { return this.native ? this.native.voiceName() : this.voice ? this.voice.name : ''; }
  stop() { if (this.native) this.native.stop(); else if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  pause() { if (this.native) this.native.stop(); else if ('speechSynthesis' in window) speechSynthesis.pause(); }
  resume() { if (!this.native && 'speechSynthesis' in window) speechSynthesis.resume(); }
  // 說完才 resolve；沒有語音時依字數等待
  speak(text) {
    const plain = String(text).replace(/[「」（）()]/g, ' ');
    const est = 700 + plain.length * 210 / this.rate;
    if (!this.on || !this.available) return sleep(Math.min(9000, 900 + plain.length * 95));
    if (this.native) { this.native.stop(); return this.native.speak(plain, this.rate); }
    return new Promise((resolve) => {
      this.stop();
      const u = new SpeechSynthesisUtterance(plain);
      u.voice = this.voice; u.lang = this.voice.lang; u.rate = this.rate; u.pitch = 1;
      let done = false;
      const fin = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
      const t = setTimeout(fin, est * 2 + 4000);
      u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    });
  }
}

// ---------------- 課程 ----------------
// 步驟欄位：say 解說、pieces 擺子、sel 選子、legal 自動顯示可走位置、bad 錯誤位置（自動說明原因）、
// move/flip 動畫、arrow 箭頭、zones 標示區域、practice 練習（piece：要移動的棋子；goal：正確目標，可省略＝任一合法位置）
const KINGS = 'K:e0 k:f9'; // 兩個王不在同一直線，避免王不見王影響示範
export const FULL_LESSONS = [
  { title: '棋盤與勝負', steps: [
    { pieces: 'start', say: '歡迎來到中國象棋。棋盤由九條直線和十條橫線組成，棋子放在線的交叉點上，不是放在格子裡。' },
    { zones: ['river'], say: '中間沒有直線的地方叫做楚河漢界，是雙方的分界線。' },
    { zones: ['palace'], say: '上下兩個畫著叉叉的方框叫九宮，帥、將和仕、士只能在九宮裡活動。' },
    { say: '紅方先走，雙方輪流各走一步。把對方的帥或將將死，就贏得這盤棋。' },
  ] },
  { title: '帥（將）', steps: [
    { pieces: 'K:e1 k:f9', sel: 'e1', legal: true, say: '帥和將是最重要的棋子。每次只能直走或橫走一步，而且只能在九宮裡。' },
    { pieces: 'K:e1 k:f9', sel: 'e1', bad: ['d2', 'f0'], say: '帥不能斜著走。' },
    { pieces: 'K:d0 k:f9', sel: 'd0', legal: true, bad: ['c0'], say: '帥也不能走出九宮。' },
    { pieces: 'K:e0 k:d9', sel: 'e0', bad: ['d0'], arrow: ['e0', 'd0'], say: '還有一條特別的規則：王不見王。帥和將不能在同一條直線上、中間沒有任何棋子直接面對面。' },
    { pieces: 'K:e1 k:d9', practice: { piece: 'e1' }, say: '換您試試：點帥，再點一個可以走的位置。' },
  ] },
  { title: '仕（士）', steps: [
    { pieces: KINGS + ' A:e1', sel: 'e1', legal: true, say: '仕和士負責保護帥將，只能在九宮裡斜走一步。' },
    { pieces: KINGS + ' A:e1', sel: 'e1', bad: ['e2', 'd1'], say: '仕不能直走或橫走。' },
    { pieces: KINGS + ' A:d0', sel: 'd0', legal: true, bad: ['c1'], say: '仕也不能走出九宮，所以仕總共只有五個位置可以站。' },
    { pieces: KINGS + ' A:d2', practice: { piece: 'd2' }, say: '換您試試：把仕走一步。' },
  ] },
  { title: '相（象）', steps: [
    { pieces: KINGS + ' B:e2', sel: 'e2', legal: true, say: '相和象走田字，也就是斜走兩格。' },
    { pieces: KINGS + ' B:e2 P:d3', sel: 'e2', legal: true, bad: ['c4'], say: '如果田字的中心有棋子擋住，就叫塞象眼，不能往那個方向走。' },
    { pieces: KINGS + ' B:c4', sel: 'c4', legal: true, bad: ['a6', 'e6'], zones: ['redside'], say: '相和象不能過河，只能在自己這一邊防守。' },
    { pieces: KINGS + ' B:g0', practice: { piece: 'g0' }, say: '換您試試：把相走一個田字。' },
  ] },
  { title: '傌（馬）', steps: [
    { pieces: KINGS + ' N:e4', sel: 'e4', legal: true, say: '馬走日字：先直走一格，再斜走一格。在空曠的地方最多有八個位置可以去。' },
    { pieces: KINGS + ' N:e4', sel: 'e4', bad: ['e6', 'f5'], say: '馬不能直走兩格，也不能只斜走一格。' },
    { pieces: KINGS + ' N:e4 P:e5', sel: 'e4', legal: true, bad: ['d6', 'f6'], say: '如果馬要前進的方向，緊鄰的那一格有棋子，就會擋住馬腳，叫做蹩馬腿。' },
    { pieces: KINGS + ' N:e4 r:f6', sel: 'e4', arrow: ['e4', 'f6'], move: ['e4', 'f6'], say: '馬跳到對方棋子的位置，就把它吃掉。' },
    { pieces: KINGS + ' N:b0 P:b1', practice: { piece: 'b0' }, say: '換您試試：這匹馬的前方被擋住了，找出可以跳的位置。' },
  ] },
  { title: '俥（車）', steps: [
    { pieces: KINGS + ' R:a0', sel: 'a0', legal: true, say: '車是威力最大的棋子，可以直走或橫走，沒有棋子擋住時，想走幾格就走幾格。' },
    { pieces: KINGS + ' R:a0 P:a3 n:c0', sel: 'a0', legal: true, bad: ['a5', 'd0'], say: '但車不能越過其他棋子。碰到對方的棋子可以吃掉，碰到自己的棋子就要停下來。' },
    { pieces: KINGS + ' R:a0 P:a3 n:c0', move: ['a0', 'c0'], say: '車橫走吃掉對方的馬。' },
    { pieces: KINGS + ' R:a0 P:b0 n:a7', practice: { piece: 'a0', goal: 'a7' }, say: '換您試試：用車吃掉對方的馬。' },
  ] },
  { title: '炮（包）', steps: [
    { pieces: KINGS + ' C:b2', sel: 'b2', legal: true, say: '炮不吃子的時候，走法和車一樣，可以直走或橫走任意格，但不能越過棋子。' },
    { pieces: KINGS + ' C:b2 P:b4 n:b7', sel: 'b2', legal: true, say: '炮吃子的時候，中間一定要隔一顆棋子，這顆棋子叫做炮架，敵我都可以。' },
    { pieces: KINGS + ' C:b2 P:b4 n:b7', move: ['b2', 'b7'], say: '炮跳過炮架，吃掉對方的馬，這叫隔山打牛。' },
    { pieces: KINGS + ' C:b2 n:b5 r:h2', sel: 'b2', bad: ['b5', 'h2'], say: '如果中間沒有炮架，炮就不能吃子。' },
    { pieces: KINGS + ' C:b2 P:b4 P:b6 n:b8', sel: 'b2', bad: ['b8'], say: '中間有兩顆以上的棋子也不行，只能剛好隔一顆。' },
    { pieces: KINGS + ' C:h2 P:h5 r:h9 n:h7', practice: { piece: 'h2', goal: 'h7' }, say: '換您試試：用炮隔著兵，吃掉對方的馬。' },
  ] },
  { title: '兵（卒）', steps: [
    { pieces: KINGS + ' P:e3', sel: 'e3', legal: true, say: '兵和卒在過河以前，每次只能向前走一步。' },
    { pieces: KINGS + ' P:e3', sel: 'e3', bad: ['d3', 'e2'], say: '過河前不能左右走，而且兵卒永遠不能後退。' },
    { pieces: KINGS + ' P:e3', move: ['e3', 'e4'], say: '往前一步。' },
    { pieces: KINGS + ' P:e5', sel: 'e5', legal: true, bad: ['e4'], say: '過了河以後，兵可以向前，也可以向左右走一步，但還是不能後退。' },
    { pieces: KINGS + ' P:c6', practice: { piece: 'c6' }, say: '換您試試：這個兵已經過河了，走一步看看。' },
  ] },
  { title: '將軍與勝負', steps: [
    { pieces: 'K:d0 k:e9 R:a8', move: ['a8', 'a9'], say: '如果下一步就能吃掉對方的帥或將，這叫將軍。' },
    { pieces: 'K:d0 k:e9 R:a9', sel: 'e9', legal: true, say: '被將軍的一方一定要立刻解圍，例如把將移開，這叫應將。' },
    { pieces: 'K:e0 k:d9 R:a9 r:i1', sel: 'i1', bad: ['i9'], say: '不理會將軍、或走了會讓自己被吃的棋，都叫送將，是不合法的。' },
    { pieces: 'K:e0 k:d9 R:a8 R:b7', move: ['b7', 'b9'], say: '如果被將軍時已經無路可走，就是被將死，輸了這盤棋。' },
    { say: '另外，一直重複將軍叫長將，會被判輸；六十回合都沒有吃子會判和棋；沒有任何棋可走也算輸。' },
  ] },
  { title: '避免常見錯誤', steps: [
    { pieces: 'start', sel: 'b0', bad: ['b1'], say: '常見錯誤一：馬直直往前走。記得馬走日字，而且要看看馬腳有沒有被擋住。' },
    { pieces: 'start', sel: 'c0', bad: ['c2'], say: '常見錯誤二：相走直線。相走田字，也不能過河。' },
    { pieces: 'start', sel: 'b2', bad: ['b7'], say: '常見錯誤三：炮吃子沒有炮架，或中間隔了兩顆棋子。' },
    { pieces: 'start', sel: 'a3', bad: ['b3', 'a2'], say: '常見錯誤四：兵還沒過河就左右走，或是往後退。' },
    { say: '不用擔心，在遊戲中走錯的時候，畫面會告訴您原因。點棋子時出現的綠點，就是可以走的位置。' },
  ] },
];

export const HALF_LESSONS = [
  { title: '棋盤與開局', steps: [
    { pieces: 'hidden', say: '半盤象棋又叫暗棋，用半張棋盤，四列八行，三十二顆棋子全部蓋著，隨機擺放。' },
    { flip: 'B4', say: '第一個翻棋的人，翻出什麼顏色，這盤就執什麼顏色。' },
    { say: '之後雙方輪流，每一回合可以翻開一顆暗子，或是移動自己的一顆明子。' },
  ] },
  { title: '走法', steps: [
    { pieces: 'R:B4 k:D8', sel: 'B4', legal: true, say: '每顆棋子每次只能上下左右走一步，不能斜走，也不能一次走兩格。' },
    { pieces: 'R:B4 k:D8', sel: 'B4', bad: ['C5', 'B6'], say: '斜走或一次走兩格都不行。' },
    { pieces: 'R:B4 k:D8 ?a:B5', sel: 'B4', legal: true, bad: ['B5'], say: '也不能走到暗子上，暗子要先翻開。' },
    { pieces: 'N:C3 k:A8', practice: { piece: 'C3' }, say: '換您試試：把馬走一步。' },
  ] },
  { title: '大小與吃子', steps: [
    { pieces: 'K:B1 A:B2 B:B3 R:B4 N:B5 C:B6 P:B7', say: '棋子有大小之分：帥最大，再來是仕、相、車、馬、炮，兵最小。' },
    { pieces: 'R:B4 n:B5 k:D8', sel: 'B4', legal: true, say: '大的可以吃小的，例如車可以吃馬。' },
    { pieces: 'N:B4 r:B5 k:D8', sel: 'B4', bad: ['B5'], say: '小的不能吃大的，馬不能吃車。' },
    { pieces: 'N:B4 n:B5 k:D8', move: ['B4', 'B5'], say: '一樣大的可以互吃，誰先動手誰就吃掉對方。' },
    { pieces: 'A:C4 b:C5 p:D4 k:A8', practice: { piece: 'C4', goal: 'C5' }, say: '換您試試：用仕吃掉對方的象。' },
  ] },
  { title: '帥與兵', steps: [
    { pieces: 'K:B4 p:B5 a:C4 k:D8', sel: 'B4', legal: true, bad: ['B5'], say: '帥最大，可以吃其他棋子，但有一個例外：帥不能吃兵。' },
    { pieces: 'P:B4 k:B5 K:D1', sel: 'B4', legal: true, say: '反過來，最小的兵卻可以吃帥，這是半盤最有趣的地方。' },
    { pieces: 'P:B4 k:B5 K:D1', move: ['B4', 'B5'], say: '兵吃掉了將！' },
  ] },
  { title: '炮的打法', steps: [
    { pieces: 'C:B2 k:D8', sel: 'B2', legal: true, say: '炮平常只能走一步到空格。' },
    { pieces: 'C:B2 ?p:B3 r:B4 k:D8', sel: 'B2', legal: true, say: '炮要吃子時，中間要隔一顆棋子，明子暗子都可以，去打兩格外的明子。' },
    { pieces: 'C:B2 ?p:B3 r:B4 k:D8', move: ['B2', 'B4'], say: '炮跳過去，打掉了對方的車。炮可以打任何棋子，連帥將也能打。' },
    { pieces: 'C:B2 r:B3 k:D8', sel: 'B2', bad: ['B3'], say: '炮不能直接吃相鄰的棋子。' },
    { pieces: 'C:C2 ?a:C3 n:C4 k:A8', practice: { piece: 'C2', goal: 'C4' }, say: '換您試試：用炮隔著暗子，打掉對方的馬。' },
  ] },
  { title: '勝負與小技巧', steps: [
    { pieces: 'R:B4 n:B5', move: ['B4', 'B5'], say: '把對方的棋子全部吃光就獲勝。輪到自己卻沒有任何棋可以走，也算輸。' },
    { say: '如果連續八十步都沒有吃子也沒有翻子，就判和棋。' },
    { pieces: 'r:B5 ?p:B4 ?a:A1 ?b:D8 K:D1', sel: 'B4', say: '小技巧：翻棋前先看看旁邊有沒有對方的大子，翻出小的棋子，可能馬上被吃掉。' },
  ] },
];

// ---------------- 說明畫面 ----------------
export class Guide {
  constructor(root, { onBack, settings, save }) {
    this.root = root;
    this.onBack = onBack;
    this.save = save;
    this.narr = new Narrator();
    this.narr.on = settings.guideVoice !== false;
    this.narr.rate = settings.guideRate || 1;
    this.narr.onReady = () => this.renderVoice();
    this.kind = 'full';
    this.lesson = 0;
    this.token = 0;
    this.paused = false;
    this.practice = null;
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    this.list = h('div', { class: 'gd-list' });
    this.caption = h('div', { class: 'gd-caption' }, '');
    this.boardHost = h('div', { class: 'gd-board' });
    this.board = new MiniBoard(this.boardHost, (sq) => this.onBoardClick(sq));
    this.btnPlay = h('button', { class: 'primary', id: 'gdPlay', onclick: () => this.togglePlay() }, '⏸ 暫停');
    this.btnVoice = h('button', { id: 'gdVoice', onclick: () => this.toggleVoice() });
    this.rateSel = h('select', { id: 'gdRate', onchange: () => { this.narr.rate = Number(this.rateSel.value); this.save({ guideRate: this.narr.rate }); } },
      [[0.8, '慢'], [1, '一般'], [1.2, '快']].map(([v, l]) => h('option', { value: v, selected: v === this.narr.rate }, `語速：${l}`)));
    this.status = h('div', { class: 'gd-status muted small' });
    this.tabs = h('div', { class: 'kind-tabs gd-tabs' },
      ...[['full', '整盤象棋'], ['half', '半盤象棋（暗棋）']].map(([k, t]) => h('button', { class: 'kindbtn' + (k === this.kind ? ' on' : ''), 'data-gk': k, onclick: () => this.setKind(k) }, h('b', {}, t))));
    r.append(
      h('div', { class: 'gd-head' }, h('button', { class: 'ghost', onclick: () => this.close() }, '⟵ 首頁'), h('h2', {}, '📖 遊戲說明'), this.tabs),
      h('div', { class: 'gd-body' },
        this.list,
        h('div', { class: 'gd-main' },
          this.caption,
          this.boardHost,
          h('div', { class: 'gd-ctrl' },
            h('button', { onclick: () => this.go(this.lesson - 1) }, '⏮ 上一課'),
            h('button', { onclick: () => this.go(this.lesson) }, '↺ 重播'),
            this.btnPlay,
            h('button', { onclick: () => this.go(this.lesson + 1) }, '下一課 ⏭'),
            this.btnVoice, this.rateSel),
          this.status)));
    this.renderVoice();
    this.renderList();
  }

  get lessons() { return this.kind === 'half' ? HALF_LESSONS : FULL_LESSONS; }

  open(kind = 'full') {
    this.setKind(kind);
  }

  close() {
    this.token++;
    this.narr.stop();
    this.onBack && this.onBack();
  }

  setKind(k) {
    this.kind = k;
    $$('[data-gk]', this.root).forEach((b) => b.classList.toggle('on', b.dataset.gk === k));
    this.board.layout(k);
    this.renderList();
    this.go(0);
  }

  renderList() {
    this.list.innerHTML = '';
    this.lessons.forEach((l, i) => this.list.append(h('button', { class: 'gd-item' + (i === this.lesson ? ' on' : ''), onclick: () => this.go(i) }, h('span', { class: 'n' }, String(i + 1)), l.title)));
  }

  renderVoice() {
    const ok = this.narr.available;
    this.btnVoice.textContent = !ok ? '🔇 無語音' : this.narr.on ? '🔊 語音解說：開' : '🔈 語音解說：關';
    this.btnVoice.disabled = !ok;
    this.btnVoice.title = ok ? `使用語音：${this.narr.voiceName}` : '這台裝置沒有中文語音，解說會以文字顯示';
  }

  toggleVoice() {
    this.narr.on = !this.narr.on;
    if (!this.narr.on) this.narr.stop();
    this.save({ guideVoice: this.narr.on });
    this.renderVoice();
  }

  togglePlay() {
    this.paused = !this.paused;
    this.btnPlay.textContent = this.paused ? '▶ 繼續' : '⏸ 暫停';
    if (this.paused) this.narr.pause(); else { this.narr.resume(); if (this.resumeGate) this.resumeGate(); }
  }

  async gate(tok) {
    while (this.paused && tok === this.token) await new Promise((r) => { this.resumeGate = r; setTimeout(r, 300); });
    return tok === this.token;
  }

  go(i) {
    if (i < 0 || i >= this.lessons.length) return;
    this.lesson = i;
    this.renderList();
    this.paused = false;
    this.btnPlay.textContent = '⏸ 暫停';
    this.run(++this.token);
  }

  // 依步驟建立局面物件（用來算合法著法與錯誤原因）
  model(spec) {
    if (this.kind === 'half') {
      const g = new HalfGame(fullSet());
      g.board.fill(0); g.up.fill(0);
      if (spec === 'hidden') { g.board.set(g.deal); return g; }
      for (const [sq, { code, up }] of parsePieces(spec, true)) { g.board[sq] = code; g.up[sq] = up ? 1 : 0; }
      return g;
    }
    if (spec === 'start') return new Position();
    const b = Array.from({ length: 10 }, () => Array(9).fill(''));
    for (const [sq, { code }] of parsePieces(spec, false)) b[rowOf(sq)][colOf(sq)] = ' KABNRCP'[typeOf(code)][colorOf(code) === RED ? 'toUpperCase' : 'toLowerCase']();
    const fen = b.map((row) => row.map((x) => x || '1').join('').replace(/1+/g, (m) => String(m.length))).join('/');
    return new Position(fen + ' w');
  }

  piecesOf(model) {
    const map = new Map();
    if (this.kind === 'half') { for (let sq = 0; sq < 32; sq++) if (model.board[sq]) map.set(sq, { code: model.board[sq], up: !!model.up[sq] }); }
    else for (let sq = 0; sq < 90; sq++) if (model.board[sq]) map.set(sq, { code: model.board[sq], up: true });
    return map;
  }

  sqOf(s) { return this.kind === 'half' ? halfSq(s) : fullSq(s); }

  // 某顆棋子的合法目標
  targets(model, from) {
    if (this.kind === 'half') {
      const p = model.board[from];
      model.pcolor = colorOf(p) === RED ? [RED, BLACK] : [BLACK, RED];
      model.turn = 0;
      model.result = null;
      return model.legalActions().filter((a) => !isFlip(a) && actFrom(a) === from).map(actTo);
    }
    model.side = colorOf(model.board[from]);
    model._rehash();
    return model.legalMoves().filter((m) => moveFrom(m) === from).map(moveTo);
  }

  why(model, from, to) {
    if (this.kind === 'half') return explainIllegalHalf(model, from, to);
    model.side = colorOf(model.board[from]);
    return explainIllegal(model, from, to);
  }

  async run(tok) {
    this.narr.stop();
    this.practice = null;
    const lesson = this.lessons[this.lesson];
    this.status.textContent = `第 ${this.lesson + 1} 課：${lesson.title}（共 ${lesson.steps.length} 步）`;
    let model = null;
    for (let i = 0; i < lesson.steps.length; i++) {
      if (!(await this.gate(tok))) return;
      const st = lesson.steps[i];
      if (st.pieces) { model = this.model(st.pieces); this.board.setPieces(this.piecesOf(model)); }
      this.board.clearMarks();
      for (const z of st.zones || []) this.board.zone(z);
      let sel = st.sel ? this.sqOf(st.sel) : (st.practice ? this.sqOf(st.practice.piece) : -1);
      if (sel >= 0) this.board.select(sel);
      if (st.legal && sel >= 0) this.board.legal(this.targets(model, sel));
      if (st.bad && sel >= 0) this.board.bad(st.bad.map((s) => { const to = this.sqOf(s); return [to, this.why(model, sel, to)]; }));
      if (st.arrow) this.board.arrow(this.sqOf(st.arrow[0]), this.sqOf(st.arrow[1]));
      // 解說文字：錯誤位置附上原因
      let text = st.say;
      if (st.bad && sel >= 0) {
        const reasons = [...new Set(st.bad.map((s) => this.why(model, sel, this.sqOf(s))).filter(Boolean))];
        if (reasons.length) text += '\n✕ ' + reasons.join('\n✕ ');
      }
      this.caption.textContent = text;
      this.caption.classList.toggle('practice', !!st.practice);
      const talk = this.narr.speak(st.say);
      if (st.move) {
        await sleep(900);
        if (tok !== this.token) return;
        const [f, t] = st.move.map((s) => this.sqOf(s));
        this.board.arrow(f, t);
        await this.board.move(f, t);
        if (this.kind === 'half') { model.board[t] = model.board[f]; model.board[f] = 0; model.up[t] = 1; model.up[f] = 0; }
        else { model.makeMove(MOVE(f, t)); }
      }
      if (st.flip) {
        await sleep(600);
        const sq = this.sqOf(st.flip);
        await this.board.flip(sq);
        model.up[sq] = 1;
        const code = model.board[sq];
        this.caption.textContent += `\n翻出的是${colorOf(code) === RED ? '紅色' : '黑色'}的${NAMES[colorOf(code)][typeOf(code)]}，所以翻的人這盤執${colorOf(code) === RED ? '紅' : '黑'}。`;
      }
      if (st.practice) {
        // 練習一出現就可以作答，不必等解說講完
        const ok = await this.runPractice(tok, model, st.practice);
        if (!ok) return;
      } else {
        await talk;
        if (tok !== this.token) return;
        await sleep(st.pause || 700);
      }
    }
    if (tok !== this.token) return;
    const next = this.lesson + 1 < this.lessons.length;
    this.caption.textContent = next ? `「${lesson.title}」說明完畢。按「下一課」繼續學「${this.lessons[this.lesson + 1].title}」。` : `${this.kind === 'half' ? '半盤' : '整盤'}象棋的說明全部看完了，祝您下棋愉快！`;
    this.narr.speak(next ? '這一課說明完畢。' : '說明全部看完了，祝您下棋愉快！');
  }

  // 練習：玩家點目標格，錯了說明原因
  runPractice(tok, model, pr) {
    const from = this.sqOf(pr.piece);
    const targets = this.targets(model, from);
    const goal = pr.goal ? this.sqOf(pr.goal) : null;
    this.status.textContent = '練習中：在棋盤上點選目標位置（點錯會告訴您原因）';
    return new Promise((resolve) => {
      this.practice = {
        tok,
        click: async (sq) => {
          if (tok !== this.token) return;
          if (sq === from) return;
          const good = targets.includes(sq) && (goal == null || sq === goal);
          if (good) {
            this.practice = null;
            this.board.clearMarks();
            this.board.flash(sq, 'gm-good');
            await this.board.move(from, sq);
            this.caption.textContent = '答對了！做得好。';
            await this.narr.speak('答對了！做得好。');
            this.status.textContent = '';
            resolve(tok === this.token);
            return;
          }
          this.board.flash(sq, 'gm-wrong');
          const why = targets.includes(sq) ? '這一步可以走，但這題要找另一個位置喔。' : (this.why(model, from, sq) || '這個位置不能走喔。');
          this.caption.textContent = `✕ ${why}\n再試一次，或按「看答案」。`;
          this.narr.speak(why);
        },
      };
      const show = h('button', { class: 'gd-answer', onclick: async () => {
        if (!this.practice) return;
        this.board.legal(goal != null ? [goal] : targets);
        this.caption.textContent = '綠色的位置就是答案，點它試試看。';
        show.remove();
      } }, '看答案');
      this.status.append(' ', show);
    });
  }

  onBoardClick(sq) {
    if (this.practice) this.practice.click(sq);
  }
}
