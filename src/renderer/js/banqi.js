// 中國象棋半盤（暗棋）：規則與 AI
// 參考：https://github.com/lwher/Chinese-chess-half-mode
// 棋盤 4 列 × 8 行共 32 格，sq = r * 8 + c（r 0～3 由上到下，c 0～7 由左到右）。
// 棋子沿用整盤的編碼：type K=1 A=2 B=3 N=4 R=5 C=6 P=7；黑方 +8。
import { K, A, B, N, R, C, P, RED, BLACK, typeOf, colorOf, NAMES } from './xiangqi.js';

export const ROWS = 4, COLS = 8, CELLS = 32;
export const HIDDEN = -1; // AI 看到的暗子
export const DRAW_PLIES = 80; // 連續 80 步沒有吃子也沒有翻子 → 和棋（原專案沒有和棋規則，這裡補上）

// 大小：帥 0 > 士 1 > 相 2 > 車 3 > 馬 4 > 炮 5 > 兵 6
const RANK = [0, 0, 1, 2, 4, 3, 5, 6]; // 依 type 索引
export const rankOf = (code) => RANK[typeOf(code)];

const rc = (sq) => [(sq / COLS) | 0, sq % COLS];
const ROW_NAME = 'ABCD';
export const sqName = (sq) => ROW_NAME[(sq / COLS) | 0] + ((sq % COLS) + 1);
export const pieceLabel = (code) => (colorOf(code) === RED ? '紅' : '黑') + NAMES[colorOf(code)][typeOf(code)];

// 動作編碼：from | to << 5；from === to 代表翻子
export const ACT = (f, t) => f | (t << 5);
export const actFrom = (a) => a & 31;
export const actTo = (a) => (a >> 5) & 31;
export const isFlip = (a) => actFrom(a) === actTo(a);
export const actToStr = (a) => (isFlip(a) ? 'f' + sqName(actFrom(a)) : sqName(actFrom(a)) + '-' + sqName(actTo(a)));
export function strToAct(s) {
  s = String(s).trim().toUpperCase();
  const name = (t) => { const r = ROW_NAME.indexOf(t[0]); const c = Number(t.slice(1)) - 1; return r >= 0 && c >= 0 && c < COLS ? r * COLS + c : -1; };
  let m = /^F([A-D][1-8])$/.exec(s);
  if (m) { const q = name(m[1]); return q < 0 ? -1 : ACT(q, q); }
  m = /^([A-D][1-8])-([A-D][1-8])$/.exec(s);
  if (m) { const f = name(m[1]), t = name(m[2]); return f < 0 || t < 0 ? -1 : ACT(f, t); }
  return -1;
}

// 一副完整棋子（32 枚）
export function fullSet() {
  const set = [];
  for (const color of [RED, BLACK]) {
    const o = color === BLACK ? 8 : 0;
    set.push(K + o);
    for (const t of [A, B, N, R, C]) set.push(t + o, t + o);
    for (let i = 0; i < 5; i++) set.push(P + o);
  }
  return set;
}

function randInt(n) {
  if (globalThis.crypto && crypto.getRandomValues) { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] % n; }
  return Math.floor(Math.random() * n);
}
export function randomDeal() {
  const s = fullSet();
  for (let i = s.length - 1; i > 0; i--) { const j = randInt(i + 1); [s[i], s[j]] = [s[j], s[i]]; }
  return s;
}

// 走子規則（moverCode 為已翻開的己方棋子；board 中 HIDDEN 或 up=0 都算暗子）
// 回傳 true 表示 from → to 合法
function canMove(board, up, f, t) {
  const p = board[f];
  if (!p || p === HIDDEN || !up[f]) return false;
  const [fr, fc] = rc(f), [tr, tc] = rc(t);
  const dr = Math.abs(fr - tr), dc = Math.abs(fc - tc);
  const q = board[t];
  if (typeOf(p) === C) {
    if (dr + dc === 1) return q === 0; // 炮只能走到相鄰空格
    if ((dr === 2 && dc === 0) || (dr === 0 && dc === 2)) {
      const mid = ((fr + tr) / 2) * COLS + (fc + tc) / 2;
      if (!board[mid]) return false;                // 中間要有炮架（明暗皆可）
      if (!q || q === HIDDEN || !up[t]) return false; // 只能打明子
      return colorOf(q) !== colorOf(p);               // 炮可以打所有棋子
    }
    return false;
  }
  if (dr + dc !== 1) return false;
  if (!q) return true;
  if (q === HIDDEN || !up[t]) return false;
  if (colorOf(q) === colorOf(p)) return false;
  const a = rankOf(p), b = rankOf(q);
  if (a === 0 && b === 6) return false; // 帥不能吃兵
  if (a === 6 && b === 0) return true;  // 兵可以吃帥
  return a <= b;                        // 大吃小、同大小先動手者勝
}

function genActions(board, up, color, out = []) {
  for (let sq = 0; sq < CELLS; sq++) {
    const p = board[sq];
    if (!p) continue;
    if (p === HIDDEN || !up[sq]) { out.push(ACT(sq, sq)); continue; }
    if (color == null || colorOf(p) !== color) continue;
    const [r, c] = rc(sq);
    const targets = [];
    if (r > 0) targets.push(sq - COLS); if (r < ROWS - 1) targets.push(sq + COLS);
    if (c > 0) targets.push(sq - 1); if (c < COLS - 1) targets.push(sq + 1);
    if (typeOf(p) === C) {
      if (r > 1) targets.push(sq - 2 * COLS); if (r < ROWS - 2) targets.push(sq + 2 * COLS);
      if (c > 1) targets.push(sq - 2); if (c < COLS - 2) targets.push(sq + 2);
    }
    for (const t of targets) if (canMove(board, up, sq, t)) out.push(ACT(sq, t));
  }
  return out;
}

// ---------------- 對局 ----------------
export class HalfGame {
  constructor(deal) {
    this.kind = 'half';
    this.deal = (deal && deal.length === CELLS) ? deal.slice() : randomDeal();
    this.board = Int8Array.from(this.deal);
    this.up = new Uint8Array(CELLS);
    this.turn = 0;               // 輪到哪位玩家（0 = 先手）
    this.pcolor = [null, null];  // 玩家顏色（第一次翻子後決定）
    this.actions = [];
    this.notes = [];
    this.caps = [];              // 每一步吃掉的棋子（沒有則 0）
    this.flips = [];             // 每一步翻出的棋子（沒有則 0）
    this.quiet = [0];
    this.result = null;          // { winner: 玩家索引|null, winColor, reason }
  }

  get sideColor() { return this.pcolor[this.turn]; }
  get moves() { return this.actions; }
  legalMoves() { return this.legalActions(); }
  playerOfColor(color) { return this.pcolor[0] === color ? 0 : this.pcolor[1] === color ? 1 : null; }

  legalActions() {
    if (this.result) return [];
    return genActions(this.board, this.up, this.sideColor);
  }

  isLegal(a) { return this.legalActions().includes(a); }

  play(a) {
    if (this.result) throw new Error('對局已結束');
    if (!this.isLegal(a)) throw new Error('不合法的動作');
    const f = actFrom(a), t = actTo(a);
    let note, cap = 0, flip = 0;
    if (f === t) {
      this.up[f] = 1;
      flip = this.board[f];
      if (this.pcolor[0] == null) { // 第一次翻子決定顏色
        this.pcolor[this.turn] = colorOf(flip);
        this.pcolor[this.turn ^ 1] = colorOf(flip) ^ 1;
      }
      note = `翻出${pieceLabel(flip)}（${sqName(f)}）`;
    } else {
      const p = this.board[f];
      cap = this.board[t];
      this.board[t] = p; this.board[f] = 0;
      this.up[t] = 1; this.up[f] = 0;
      const jump = typeOf(p) === C && (Math.abs(f - t) === 2 || Math.abs(f - t) === 2 * COLS);
      note = `${pieceLabel(p)} ${sqName(f)}${jump ? '⇒' : '→'}${sqName(t)}${cap ? (jump ? ' 打' : ' 吃') + pieceLabel(cap) : ''}`;
    }
    this.actions.push(a); this.notes.push(note); this.caps.push(cap); this.flips.push(flip);
    this.quiet.push(cap || flip ? 0 : this.quiet[this.quiet.length - 1] + 1);
    this.turn ^= 1;
    this.result = this.evaluateEnd();
    return { note, cap, flip };
  }

  undo() {
    if (!this.actions.length) return false;
    const a = this.actions.pop();
    const cap = this.caps.pop(), flip = this.flips.pop();
    this.notes.pop(); this.quiet.pop();
    const f = actFrom(a), t = actTo(a);
    this.turn ^= 1;
    if (f === t) {
      this.up[f] = 0;
      if (!this.actions.length) this.pcolor = [null, null];
    } else {
      this.board[f] = this.board[t]; this.up[f] = 1;
      this.board[t] = cap; this.up[t] = cap ? 1 : 0;
    }
    this.result = null;
    return true;
  }

  remaining(color) {
    let n = 0;
    for (let sq = 0; sq < CELLS; sq++) if (this.board[sq] && colorOf(this.board[sq]) === color) n++;
    return n;
  }

  evaluateEnd() {
    if (this.pcolor[0] == null) return null;
    for (const color of [RED, BLACK]) {
      if (this.remaining(color) === 0) {
        const w = color ^ 1;
        return { winner: this.playerOfColor(w), winColor: w, reason: `${color === RED ? '紅方' : '黑方'}棋子被吃光` };
      }
    }
    if (this.legalActions().length === 0) {
      const lose = this.sideColor;
      return { winner: this.turn ^ 1, winColor: lose ^ 1, reason: `${lose === RED ? '紅方' : '黑方'}無子可動` };
    }
    if (this.quiet[this.quiet.length - 1] >= DRAW_PLIES) return { winner: null, winColor: null, reason: `${DRAW_PLIES / 2} 回合沒有吃子或翻子，判和` };
    return null;
  }

  resign(player) {
    const lc = this.pcolor[player];
    this.result = { winner: player ^ 1, winColor: lc == null ? null : lc ^ 1, reason: `${lc == null ? '' : lc === RED ? '紅方' : '黑方'}認輸` };
  }
  agreeDraw() { this.result = { winner: null, winColor: null, reason: '雙方同意和棋' }; }

  // 給 AI 的「公開資訊」：暗子以 HIDDEN 表示，並附上未翻開棋子的種類數量
  publicView() {
    const board = new Array(CELLS);
    const pool = {};
    for (let sq = 0; sq < CELLS; sq++) {
      const p = this.board[sq];
      if (p && !this.up[sq]) { board[sq] = HIDDEN; pool[p] = (pool[p] || 0) + 1; }
      else board[sq] = p;
    }
    return { board, pool, color: this.sideColor, quiet: this.quiet[this.quiet.length - 1] };
  }

  toRecord(meta = {}) {
    const r = this.result;
    return {
      app: 'xiaoke-chess', ver: 1, kind: 'half',
      date: new Date().toISOString(),
      deal: this.deal.slice(),
      moves: this.actions.map(actToStr),
      notes: this.notes.slice(),
      firstColor: this.pcolor[0] == null ? null : (this.pcolor[0] === RED ? 'red' : 'black'),
      result: r ? (r.winColor === RED ? '1-0' : r.winColor === BLACK ? '0-1' : '1/2-1/2') : '*',
      reason: r ? r.reason : '',
      ...meta,
    };
  }
}

export function replayHalf(rec, upto = Infinity) {
  const g = new HalfGame(rec.deal);
  for (const s of (rec.moves || []).slice(0, upto)) {
    const a = strToAct(s);
    if (a < 0 || g.result || !g.isLegal(a)) break;
    g.play(a);
  }
  return g;
}

// 文字棋盤（給軍師看；暗子顯示「暗」）
export function halfBoardText(g) {
  const lines = ['　　１　２　３　４　５　６　７　８'];
  for (let r = 0; r < ROWS; r++) {
    let s = ROW_NAME[r] + '　';
    for (let c = 0; c < COLS; c++) {
      const sq = r * COLS + c, p = g.board[sq];
      s += (!p ? '．' : !g.up[sq] ? '暗' : (colorOf(p) === RED ? '紅' : '黑') + NAMES[colorOf(p)][typeOf(p)]).padEnd(2, '　');
    }
    lines.push(s);
  }
  return lines.join('\n');
}

// ---------------- AI（只看公開資訊，翻子以機率期望值計算） ----------------
const VAL = [0, 100, 45, 22, 7, 12, 35, 6]; // 依 type：帥 士 相 馬 車 炮 兵

export class HalfAI {
  // view: { board(含 HIDDEN), pool{code: n}, color }
  choose(view, { timeMs = 800, maxDepth = 8, noise = 0, flipPlies = 1 } = {}) {
    const board = Int8Array.from(view.board.map((x) => (x === HIDDEN ? HIDDEN : x)));
    const up = new Uint8Array(CELLS);
    for (let sq = 0; sq < CELLS; sq++) up[sq] = board[sq] && board[sq] !== HIDDEN ? 1 : 0;
    this.board = board; this.up = up;
    this.pool = new Map(Object.entries(view.pool || {}).map(([k, v]) => [Number(k), v]));
    this.noise = noise;
    this.flipPlies = flipPlies;
    this.deadline = Date.now() + timeMs;
    this.stop = false;
    this.nodes = 0;
    const color = view.color;
    let acts = genActions(board, up, color);
    if (!acts.length) return { act: -1, score: 0, depth: 0 };
    // 第一手：還沒決定顏色，挑一個靠中間的暗子翻
    if (color == null) {
      const center = acts.filter((a) => { const [r, c] = rc(actFrom(a)); return r >= 1 && r <= 2 && c >= 2 && c <= 5; });
      const pick = center.length ? center : acts;
      return { act: pick[randInt(pick.length)], score: 0, depth: 0 };
    }
    let best = acts[0], bestScore = -Infinity, bestDepth = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      let iterBest = -1, iterScore = -Infinity;
      const scored = [];
      acts.sort((a, b) => (a === best ? -1 : b === best ? 1 : 0));
      for (const a of acts) {
        const v = this.actionValue(a, color, depth, 0, -1e9, 1e9);
        if (this.stop) break;
        const jitter = noise ? (Math.random() - 0.5) * 2 * noise : 0;
        scored.push([a, v + jitter]);
        if (v + jitter > iterScore) { iterScore = v + jitter; iterBest = a; }
      }
      if (this.stop) break;
      best = iterBest; bestScore = iterScore; bestDepth = depth;
      this.lastScores = scored;
      if (Date.now() > this.deadline - timeMs * 0.45) break;
    }
    return { act: best, score: Math.round(bestScore), depth: bestDepth, nodes: this.nodes };
  }

  // 執行動作 a 後（對 color 而言）的價值
  actionValue(a, color, depth, ply, alpha, beta) {
    const f = actFrom(a), t = actTo(a);
    const b = this.board, up = this.up;
    if (f === t) {
      // 機會節點：依剩餘暗子比例取期望值
      let total = 0;
      for (const n of this.pool.values()) total += n;
      if (!total) return -1e6;
      let ev = 0;
      for (const [code, n] of this.pool) {
        if (!n) continue;
        b[f] = code; up[f] = 1; this.pool.set(code, n - 1);
        ev += (n / total) * -this.search(depth - 1, color ^ 1, ply + 1, -1e9, 1e9);
        this.pool.set(code, n); b[f] = HIDDEN; up[f] = 0;
        if (this.stop) return 0;
      }
      return ev;
    }
    const p = b[f], cap = b[t];
    b[t] = p; b[f] = 0; up[t] = 1; up[f] = 0;
    let v;
    if (cap && this.remainingAfter(colorOf(cap)) === 0) v = 1e6 - ply; // 吃光對方
    else v = -this.search(depth - 1, color ^ 1, ply + 1, -beta, -alpha);
    b[f] = p; b[t] = cap; up[f] = 1; up[t] = cap ? 1 : 0;
    return v;
  }

  remainingAfter(color) {
    for (let sq = 0; sq < CELLS; sq++) { const p = this.board[sq]; if (p && p !== HIDDEN && colorOf(p) === color) return 1; }
    for (const [code, n] of this.pool) if (n && colorOf(code) === color) return 1;
    return 0;
  }

  search(depth, color, ply, alpha, beta) {
    if ((++this.nodes & 511) === 0 && Date.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    if (depth <= 0) return this.evaluate(color);
    const allowFlip = ply < this.flipPlies;
    let acts = genActions(this.board, this.up, color);
    if (!allowFlip) acts = acts.filter((a) => !isFlip(a));
    if (!acts.length) {
      // 沒有可走的明子：若還有暗子可翻，以靜態評估代替；否則判負
      return genActions(this.board, this.up, color).length ? this.evaluate(color) : -1e6 + ply;
    }
    // 吃子優先
    acts.sort((x, y) => this.capValue(y) - this.capValue(x));
    let best = -1e9;
    for (const a of acts) {
      const v = this.actionValue(a, color, depth, ply, alpha, beta);
      if (this.stop) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  capValue(a) {
    if (isFlip(a)) return -1;
    const q = this.board[actTo(a)];
    return q ? VAL[typeOf(q)] : 0;
  }

  evaluate(color) {
    const b = this.board, up = this.up;
    let s = 0;
    // 子力（含暗子；暗子的歸屬可由剩餘棋子推算）
    const pawns = [0, 0], kings = [0, 0];
    const tally = (code, n = 1) => { const c = colorOf(code); if (typeOf(code) === P) pawns[c] += n; if (typeOf(code) === K) kings[c] += n; };
    for (let sq = 0; sq < CELLS; sq++) { const p = b[sq]; if (p && p !== HIDDEN) tally(p); }
    for (const [code, n] of this.pool) if (n) tally(code, n);
    const value = (code) => {
      const t = typeOf(code), c = colorOf(code);
      let v = VAL[t];
      if (t === K) v -= pawns[c ^ 1] * 6;      // 對方兵越多，帥越危險
      if (t === P && kings[c ^ 1]) v += 5;     // 對方帥還在，兵有價值
      return v;
    };
    for (let sq = 0; sq < CELLS; sq++) { const p = b[sq]; if (p && p !== HIDDEN) s += colorOf(p) === color ? value(p) : -value(p); }
    for (const [code, n] of this.pool) if (n) s += (colorOf(code) === color ? 1 : -1) * value(code) * n;
    // 威脅：明子被對方可吃的扣分（輪到 color 走，所以自己的威脅較有利）
    for (let sq = 0; sq < CELLS; sq++) {
      const p = b[sq];
      if (!p || p === HIDDEN) continue;
      const [r, c] = rc(sq);
      for (const t of [r > 0 ? sq - COLS : -1, r < ROWS - 1 ? sq + COLS : -1, c > 0 ? sq - 1 : -1, c < COLS - 1 ? sq + 1 : -1]) {
        if (t < 0) continue;
        if (canMove(b, up, sq, t) && b[t]) {
          const gain = value(b[t]);
          s += colorOf(p) === color ? gain * 0.3 : -gain * 0.6;
        }
      }
      // 殘局追擊：有能吃的目標就靠近
      if (typeOf(p) !== C) {
        let near = 99;
        for (let q = 0; q < CELLS; q++) {
          const e = b[q];
          if (!e || e === HIDDEN || colorOf(e) === colorOf(p)) continue;
          const a = rankOf(p), d = rankOf(e);
          if ((a <= d && !(a === 0 && d === 6)) || (a === 6 && d === 0)) {
            const [er, ec] = rc(q);
            near = Math.min(near, Math.abs(er - r) + Math.abs(ec - c));
          }
        }
        if (near < 99) s += (colorOf(p) === color ? 1 : -1) * (6 - near) * 0.4;
      }
    }
    if (this.noise) s += (Math.random() - 0.5) * this.noise * 0.2;
    return s;
  }
}

export const HALF_LEVELS = [
  { name: '入門', timeMs: 300, maxDepth: 1, noise: 30, flipPlies: 1 },
  { name: '初級', timeMs: 500, maxDepth: 2, noise: 10, flipPlies: 1 },
  { name: '中級', timeMs: 900, maxDepth: 6, noise: 0, flipPlies: 1 },
  { name: '高級', timeMs: 1800, maxDepth: 8, noise: 0, flipPlies: 2 },
  { name: '大師', timeMs: 3500, maxDepth: 10, noise: 0, flipPlies: 2 },
];
