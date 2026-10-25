// 中國象棋規則核心（純 JS，瀏覽器、Worker、Node 測試共用）
// 棋盤：90 格，sq = row * 9 + col；row 0 是黑方底線（畫面上方），row 9 是紅方底線。
// 棋子：type K=1 A=2 B=3 N=4 R=5 C=6 P=7；紅方 code = type，黑方 code = type + 8；空格 0。

export const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
export const RED = 0, BLACK = 1;
export const typeOf = (p) => p & 7;
export const colorOf = (p) => (p & 8 ? BLACK : RED);
export const rowOf = (sq) => (sq / 9) | 0;
export const colOf = (sq) => sq % 9;
export const SQ = (r, c) => r * 9 + c;
export const moveFrom = (m) => m & 127;
export const moveTo = (m) => (m >> 7) & 127;
export const MOVE = (f, t) => f | (t << 7);

export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const FEN_CH = { k: K, a: A, b: B, e: B, n: N, h: N, r: R, c: C, p: P };
const CH_OF = ['', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];

// 顯示用棋子名（台灣慣用）
export const NAMES = [
  ['', '帥', '仕', '相', '傌', '俥', '炮', '兵'],
  ['', '將', '士', '象', '馬', '車', '包', '卒'],
];
export const pieceName = (p) => NAMES[colorOf(p)][typeOf(p)];

// 子力分值（局面雜湊之外，評估與 MVV-LVA 用）
export const VALUE = [0, 0, 120, 120, 270, 600, 285, 30];

// ---------------- Zobrist（兩個 32 位元） ----------------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
}
const rnd = rng(20261026);
export const ZL = new Int32Array(16 * 90);
export const ZH = new Int32Array(16 * 90);
for (let i = 0; i < 16 * 90; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
const Z_SIDE_L = rnd(), Z_SIDE_H = rnd();

// ---------------- 位置判斷 ----------------
const inBoard = (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 8;
const inPalace = (r, c, color) => c >= 3 && c <= 5 && (color === RED ? r >= 7 : r <= 2);
const ownSide = (r, color) => (color === RED ? r >= 5 : r <= 4);
export const crossed = (r, color) => !ownSide(r, color);

// 預先計算各棋子在每格可走的目標（不含阻擋判斷所需的「腿/眼」格另列）
const KING_MOVES = [], ADV_MOVES = [], BISHOP_MOVES = [], KNIGHT_MOVES = [], PAWN_MOVES = [[], []];
for (let sq = 0; sq < 90; sq++) {
  const r = rowOf(sq), c = colOf(sq);
  const km = [], am = [], bm = [], nm = [];
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr, cc = c + dc;
    if (inBoard(rr, cc)) km.push(SQ(rr, cc));
  }
  for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const rr = r + dr, cc = c + dc;
    if (inBoard(rr, cc)) am.push(SQ(rr, cc));
    const r2 = r + 2 * dr, c2 = c + 2 * dc;
    if (inBoard(r2, c2)) bm.push([SQ(r2, c2), SQ(rr, cc)]);
  }
  for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]) {
    const rr = r + dr, cc = c + dc;
    if (!inBoard(rr, cc)) continue;
    const leg = Math.abs(dr) === 2 ? SQ(r + dr / 2, c) : SQ(r, c + dc / 2);
    nm.push([SQ(rr, cc), leg]);
  }
  KING_MOVES.push(km); ADV_MOVES.push(am); BISHOP_MOVES.push(bm); KNIGHT_MOVES.push(nm);
  for (const color of [RED, BLACK]) {
    const fwd = color === RED ? -1 : 1;
    const pm = [];
    if (inBoard(r + fwd, c)) pm.push(SQ(r + fwd, c));
    if (crossed(r, color)) { if (c > 0) pm.push(SQ(r, c - 1)); if (c < 8) pm.push(SQ(r, c + 1)); }
    PAWN_MOVES[color].push(pm);
  }
}
// 反查「攻擊王的馬」：從王位置出發，馬所在格與其腿
const KNIGHT_ATTACKERS = [];
for (let sq = 0; sq < 90; sq++) {
  const r = rowOf(sq), c = colOf(sq);
  const list = [];
  for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]) {
    const nr = r + dr, nc = c + dc; // 馬的位置
    if (!inBoard(nr, nc)) continue;
    // 馬從 (nr,nc) 走到 (r,c)，位移 (-dr,-dc)，腿在馬旁邊長邊方向
    const leg = Math.abs(dr) === 2 ? SQ(nr - dr / 2, nc) : SQ(nr, nc - dc / 2);
    list.push([SQ(nr, nc), leg]);
  }
  KNIGHT_ATTACKERS.push(list);
}

// ---------------- Position ----------------
export class Position {
  constructor(fen = START_FEN) {
    this.board = new Int8Array(90);
    this.side = RED;
    this.kingSq = [0, 0];
    this.hl = 0; this.hh = 0;
    this.stack = []; // {m, cap, hl, hh}
    this.setFen(fen);
  }

  clone() {
    const p = new Position(this.fen());
    return p;
  }

  setFen(fen) {
    this.board.fill(0);
    const [placement, side] = String(fen).trim().split(/\s+/);
    const rows = placement.split('/');
    if (rows.length !== 10) throw new Error('FEN 格式錯誤');
    for (let r = 0; r < 10; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) { c += Number(ch); continue; }
        const t = FEN_CH[ch.toLowerCase()];
        if (!t || c > 8) throw new Error('FEN 格式錯誤：' + ch);
        this.board[SQ(r, c)] = ch === ch.toUpperCase() ? t : t + 8;
        c++;
      }
    }
    this.side = side === 'b' ? BLACK : RED;
    this.stack = [];
    this._rehash();
  }

  _rehash() {
    this.hl = 0; this.hh = 0;
    for (let sq = 0; sq < 90; sq++) {
      const p = this.board[sq];
      if (!p) continue;
      this.hl ^= ZL[p * 90 + sq]; this.hh ^= ZH[p * 90 + sq];
      if (typeOf(p) === K) this.kingSq[colorOf(p)] = sq;
    }
    if (this.side === BLACK) { this.hl ^= Z_SIDE_L; this.hh ^= Z_SIDE_H; }
  }

  fen() {
    let s = '';
    for (let r = 0; r < 10; r++) {
      let empty = 0;
      for (let c = 0; c < 9; c++) {
        const p = this.board[SQ(r, c)];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        const ch = CH_OF[typeOf(p)];
        s += colorOf(p) === RED ? ch.toUpperCase() : ch;
      }
      if (empty) s += empty;
      if (r < 9) s += '/';
    }
    return `${s} ${this.side === RED ? 'w' : 'b'}`;
  }

  // 局面鍵（棋盤＋輪走方），棋譜庫用
  key() { return this.fen(); }
  hash() { return (this.hh >>> 0).toString(16).padStart(8, '0') + (this.hl >>> 0).toString(16).padStart(8, '0'); }

  makeMove(m) {
    const f = moveFrom(m), t = moveTo(m);
    const p = this.board[f], cap = this.board[t];
    this.stack.push({ m, cap, hl: this.hl, hh: this.hh });
    if (cap) { this.hl ^= ZL[cap * 90 + t]; this.hh ^= ZH[cap * 90 + t]; }
    this.hl ^= ZL[p * 90 + f] ^ ZL[p * 90 + t] ^ Z_SIDE_L;
    this.hh ^= ZH[p * 90 + f] ^ ZH[p * 90 + t] ^ Z_SIDE_H;
    this.board[t] = p; this.board[f] = 0;
    if (typeOf(p) === K) this.kingSq[colorOf(p)] = t;
    this.side ^= 1;
    return cap;
  }

  unmakeMove() {
    const u = this.stack.pop();
    const f = moveFrom(u.m), t = moveTo(u.m);
    const p = this.board[t];
    this.board[f] = p; this.board[t] = u.cap;
    if (typeOf(p) === K) this.kingSq[colorOf(p)] = f;
    this.side ^= 1;
    this.hl = u.hl; this.hh = u.hh;
    return u;
  }

  // 空步（null move，搜尋用）
  makeNull() { this.stack.push({ m: 0, cap: 0, hl: this.hl, hh: this.hh, nul: true }); this.side ^= 1; this.hl ^= Z_SIDE_L; this.hh ^= Z_SIDE_H; }
  unmakeNull() { const u = this.stack.pop(); this.side ^= 1; this.hl = u.hl; this.hh = u.hh; }

  // color 方的王是否被攻擊（含王見王）
  inCheck(color = this.side) {
    const b = this.board;
    const ks = this.kingSq[color];
    const enemy = color ^ 1, eo = enemy << 3;
    const kr = rowOf(ks), kc = colOf(ks);
    // 直線：車、王見王、炮
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let r = kr + dr, c = kc + dc, screens = 0;
      while (r >= 0 && r <= 9 && c >= 0 && c <= 8) {
        const p = b[r * 9 + c];
        if (p) {
          if (screens === 0) {
            if (p === (R | eo)) return true;
            if (p === (K | eo) && dc === 0) return true;
            screens = 1;
          } else {
            if (p === (C | eo)) return true;
            break;
          }
        }
        r += dr; c += dc;
      }
    }
    // 馬
    for (const [nsq, leg] of KNIGHT_ATTACKERS[ks]) {
      if (b[nsq] === (N | eo) && !b[leg]) return true;
    }
    // 兵卒：敵兵在王前方一格，或已過河在王左右
    const fwd = color === RED ? -1 : 1; // 我方前進方向；敵兵從前方攻來
    const fr = kr + fwd;
    if (fr >= 0 && fr <= 9 && b[fr * 9 + kc] === (P | eo)) return true;
    if (kc > 0 && b[ks - 1] === (P | eo)) return true; // 王在己方九宮，左右的敵兵必然已過河
    if (kc < 8 && b[ks + 1] === (P | eo)) return true;
    return false;
  }

  // 產生偽合法著法（未檢查自己被將）；capturesOnly 只產生吃子
  genMoves(capturesOnly = false, out = []) {
    const b = this.board, side = this.side;
    const own = (p) => p && colorOf(p) === side;
    const add = (f, t) => {
      const q = b[t];
      if (q) { if (colorOf(q) !== side) out.push(f | (t << 7)); }
      else if (!capturesOnly) out.push(f | (t << 7));
    };
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (!own(p)) continue;
      const t = typeOf(p);
      const r = rowOf(sq), c = colOf(sq);
      switch (t) {
        case K:
          for (const to of KING_MOVES[sq]) if (inPalace(rowOf(to), colOf(to), side)) add(sq, to);
          break;
        case A:
          for (const to of ADV_MOVES[sq]) if (inPalace(rowOf(to), colOf(to), side)) add(sq, to);
          break;
        case B:
          for (const [to, eye] of BISHOP_MOVES[sq]) if (ownSide(rowOf(to), side) && !b[eye]) add(sq, to);
          break;
        case N:
          for (const [to, leg] of KNIGHT_MOVES[sq]) if (!b[leg]) add(sq, to);
          break;
        case P:
          for (const to of PAWN_MOVES[side][sq]) add(sq, to);
          break;
        case R:
        case C:
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let rr = r + dr, cc = c + dc, jumped = false;
            while (rr >= 0 && rr <= 9 && cc >= 0 && cc <= 8) {
              const to = rr * 9 + cc, q = b[to];
              if (t === R) {
                if (q) { if (colorOf(q) !== side) out.push(sq | (to << 7)); break; }
                if (!capturesOnly) out.push(sq | (to << 7));
              } else if (!jumped) {
                if (q) jumped = true;
                else if (!capturesOnly) out.push(sq | (to << 7));
              } else if (q) {
                if (colorOf(q) !== side) out.push(sq | (to << 7));
                break;
              }
              rr += dr; cc += dc;
            }
          }
          break;
      }
    }
    return out;
  }

  // 合法著法
  legalMoves() {
    const res = [];
    const me = this.side;
    for (const m of this.genMoves()) {
      this.makeMove(m);
      if (!this.inCheck(me)) res.push(m);
      this.unmakeMove();
    }
    return res;
  }

  isLegal(m) { return this.legalMoves().includes(m); }

  // 攻擊性子力（車馬炮兵）數量
  attackers(color) {
    let n = 0;
    for (let sq = 0; sq < 90; sq++) {
      const p = this.board[sq];
      if (p && colorOf(p) === color) { const t = typeOf(p); if (t === R || t === N || t === C || t === P) n++; }
    }
    return n;
  }
}

// ---------------- ICCS 座標記譜（例：h2e2） ----------------
export function moveToIccs(m) {
  const f = moveFrom(m), t = moveTo(m);
  const s = (sq) => 'abcdefghi'[colOf(sq)] + (9 - rowOf(sq));
  return s(f) + s(t);
}
export function iccsToMove(str) {
  const m = /^([a-i])(\d)-?([a-i])(\d)$/i.exec(String(str).trim());
  if (!m) return 0;
  const sq = (c, r) => SQ(9 - Number(r), 'abcdefghi'.indexOf(c.toLowerCase()));
  return MOVE(sq(m[1], m[2]), sq(m[3], m[4]));
}

// ---------------- 中文記譜（例：炮二平五、馬８進７） ----------------
const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const FW_NUM = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const numOf = (color, n) => (color === RED ? CN_NUM[n] : FW_NUM[n]);
// 縱線編號：紅方由右至左 一～九；黑方由（黑方的）右至左 １～９
const fileOf = (color, col) => (color === RED ? 9 - col : col + 1);

export function moveToChinese(pos, m) {
  const f = moveFrom(m), t = moveTo(m);
  const p = pos.board[f];
  if (!p) return '??';
  const color = colorOf(p), type = typeOf(p);
  const fr = rowOf(f), fc = colOf(f), tr = rowOf(t), tc = colOf(t);
  const name = NAMES[color][type];
  // 同一縱線上的同種棋子
  let head = name + numOf(color, fileOf(color, fc));
  if (type !== K) {
    const same = [];
    for (let r = 0; r < 10; r++) if (pos.board[SQ(r, fc)] === p) same.push(r);
    if (same.length >= 2) {
      // 由前到後（前＝靠近敵方）
      same.sort((a, b) => (color === RED ? a - b : b - a));
      const idx = same.indexOf(fr);
      let prefix;
      if (same.length === 2) prefix = ['前', '後'][idx];
      else if (same.length === 3) prefix = ['前', '中', '後'][idx];
      else prefix = CN_NUM[idx + 1];
      // 兵卒若有兩條以上縱線各有多枚，改用「前＋縱線」
      let multiFiles = false;
      if (type === P) {
        let filesWithDup = 0;
        for (let c = 0; c < 9; c++) {
          let n = 0;
          for (let r = 0; r < 10; r++) if (pos.board[SQ(r, c)] === p) n++;
          if (n >= 2) filesWithDup++;
        }
        multiFiles = filesWithDup >= 2;
      }
      head = multiFiles ? prefix + numOf(color, fileOf(color, fc)) : prefix + name;
    }
  }
  let act, num;
  const forward = color === RED ? tr < fr : tr > fr;
  if (tr === fr) { act = '平'; num = fileOf(color, tc); }
  else {
    act = forward ? '進' : '退';
    num = (type === A || type === B || type === N) ? fileOf(color, tc) : Math.abs(tr - fr);
  }
  return head + act + numOf(color, num);
}

// 中文記譜正規化：繁簡、全半形、各種棋子別名統一
export function normalizeNotation(s) {
  const map = {
    '帥': 'K', '帅': 'K', '將': 'K', '将': 'K',
    '仕': 'A', '士': 'A',
    '相': 'B', '象': 'B',
    '傌': 'N', '馬': 'N', '马': 'N', '㐷': 'N',
    '俥': 'R', '車': 'R', '车': 'R', '伡': 'R',
    '炮': 'C', '砲': 'C', '包': 'C',
    '兵': 'P', '卒': 'P',
    '進': '+', '进': '+', '退': '-', '平': '=',
    '後': '後', '后': '後', '前': '前', '中': '中',
  };
  let out = '';
  for (const ch of String(s).replace(/\s/g, '')) {
    if (map[ch]) { out += map[ch]; continue; }
    const cn = CN_NUM.indexOf(ch); if (cn > 0) { out += cn; continue; }
    const fw = FW_NUM.indexOf(ch); if (fw > 0) { out += fw; continue; }
    if (/[1-9]/.test(ch)) { out += ch; continue; }
    if (ch === '０' || ch === '0') continue;
  }
  return out;
}

// 依中文記譜或 ICCS 在目前局面找出合法著法；找不到回傳 0
export function parseMove(pos, text) {
  const s = String(text).trim();
  if (!s) return 0;
  const legal = pos.legalMoves();
  const ic = iccsToMove(s);
  if (ic && legal.includes(ic)) return ic;
  const want = normalizeNotation(s);
  if (!want) return 0;
  for (const m of legal) if (normalizeNotation(moveToChinese(pos, m)) === want) return m;
  return 0;
}

// ---------------- Game：對局（含歷史、勝負判定） ----------------
export class Game {
  constructor(fen = START_FEN) {
    this.startFen = fen;
    this.pos = new Position(fen);
    this.moves = [];      // 著法 int
    this.notes = [];      // 中文記譜
    this.hashes = [this.pos.hash()];
    this.checks = [];     // 該步走完後是否將軍
    this.caps = [];       // 該步吃到的棋子 code
    this.quiet = [0];     // 連續未吃子步數
    this.result = null;   // {winner: RED|BLACK|null, reason}
  }

  get side() { return this.pos.side; }
  legalMoves() { return this.result ? [] : this.pos.legalMoves(); }

  play(m) {
    if (this.result) throw new Error('對局已結束');
    if (!this.pos.legalMoves().includes(m)) throw new Error('不合法的著法');
    const note = moveToChinese(this.pos, m);
    const cap = this.pos.makeMove(m);
    this.moves.push(m);
    this.notes.push(note);
    this.caps.push(cap);
    this.checks.push(this.pos.inCheck(this.pos.side));
    this.hashes.push(this.pos.hash());
    this.quiet.push(cap ? 0 : this.quiet[this.quiet.length - 1] + 1);
    this.result = this.evaluateEnd();
    return { note, cap, check: this.checks[this.checks.length - 1] };
  }

  undo() {
    if (!this.moves.length) return false;
    this.pos.unmakeMove();
    this.moves.pop(); this.notes.pop(); this.caps.pop(); this.checks.pop(); this.hashes.pop(); this.quiet.pop();
    this.result = null;
    return true;
  }

  resign(color) { this.result = { winner: color ^ 1, reason: (color === RED ? '紅方' : '黑方') + '認輸' }; }
  agreeDraw() { this.result = { winner: null, reason: '雙方同意和棋' }; }

  evaluateEnd() {
    const pos = this.pos;
    const side = pos.side;
    if (pos.legalMoves().length === 0) {
      const mated = pos.inCheck(side);
      return { winner: side ^ 1, reason: (side === RED ? '紅方' : '黑方') + (mated ? '被將死' : '無子可動（困斃）') };
    }
    // 重複局面：三次同形
    const h = this.hashes[this.hashes.length - 1];
    const idx = [];
    for (let i = this.hashes.length - 1; i >= 0; i -= 2) if (this.hashes[i] === h) idx.push(i);
    if (idx.length >= 3) {
      const from = idx[idx.length - 1];
      // 循環中每一步誰在將軍：checks[k] 表示第 k+1 手走完後將軍
      let redAll = true, blackAll = true;
      for (let k = from; k < this.moves.length; k++) {
        const mover = (this.startSide() + k) % 2;
        if (mover === RED) redAll = redAll && this.checks[k];
        else blackAll = blackAll && this.checks[k];
      }
      if (redAll && !blackAll) return { winner: BLACK, reason: '紅方長將判負' };
      if (blackAll && !redAll) return { winner: RED, reason: '黑方長將判負' };
      return { winner: null, reason: '重複局面，判和' };
    }
    if (this.quiet[this.quiet.length - 1] >= 120) return { winner: null, reason: '六十回合未吃子，判和' };
    if (pos.attackers(RED) === 0 && pos.attackers(BLACK) === 0) return { winner: null, reason: '雙方均無攻擊子力，判和' };
    return null;
  }

  startSide() { return new Position(this.startFen).side; }

  // 匯出棋譜
  toRecord(meta = {}) {
    const r = this.result;
    return {
      app: 'xiaoke-chess', ver: 1,
      date: new Date().toISOString(),
      startFen: this.startFen,
      moves: this.moves.map(moveToIccs),
      notes: this.notes.slice(),
      result: r ? (r.winner === RED ? '1-0' : r.winner === BLACK ? '0-1' : '1/2-1/2') : '*',
      reason: r ? r.reason : '',
      ...meta,
    };
  }
}

// 從棋譜紀錄重建對局（遇到不合法著法即停止）
export function replayRecord(rec) {
  const g = new Game(rec.startFen || START_FEN);
  for (const s of rec.moves || []) {
    const m = parseMove(g.pos, s);
    if (!m || g.result) break;
    g.play(m);
  }
  return g;
}

// 純文字棋譜解析（每步可為 ICCS 或中文記譜，可含回合編號）
export function parseTextRecord(text) {
  const g = new Game();
  const tokens = String(text)
    .replace(/\d+\s*[.、．]/g, ' ')
    .split(/[\s,，;；]+/)
    .filter(Boolean);
  let result = '*';
  for (const tok of tokens) {
    if (/^(1-0|0-1|1\/2-1\/2|½-½)$/.test(tok)) { result = tok.replace('½-½', '1/2-1/2'); continue; }
    if (/^(紅勝|红胜)$/.test(tok)) { result = '1-0'; continue; }
    if (/^(黑勝|黑胜)$/.test(tok)) { result = '0-1'; continue; }
    if (/^(和棋|和局)$/.test(tok)) { result = '1/2-1/2'; continue; }
    if (g.result) break;
    const m = parseMove(g.pos, tok);
    if (!m) continue;
    g.play(m);
  }
  const rec = g.toRecord({ source: 'import' });
  if (result !== '*') rec.result = result;
  return rec;
}

// 文字棋盤（給 AI 軍師看）
export function boardText(pos) {
  const lines = [];
  lines.push('　１２３４５６７８９　（黑方縱線）');
  for (let r = 0; r < 10; r++) {
    let s = '';
    for (let c = 0; c < 9; c++) {
      const p = pos.board[SQ(r, c)];
      s += p ? pieceName(p) : '＋';
    }
    lines.push(`${r === 5 ? '　' : '　'}${s}`);
    if (r === 4) lines.push('　～～楚河　漢界～～');
  }
  lines.push('　九八七六五四三二一　（紅方縱線）');
  return lines.join('\n');
}
