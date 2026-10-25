// 象棋 AI：迭代加深 PVS（alpha-beta）＋置換表＋靜態搜尋＋空步裁剪＋殺手/歷史啟發
import { Position, K, A, B, N, R, C, P, RED, BLACK, typeOf, colorOf, rowOf, colOf, moveFrom, moveTo, VALUE, SQ } from './xiangqi.js';

export const MATE = 30000;
const MATE_BOUND = MATE - 200;

// ---------------- 位置分（紅方視角，row 0 在上方/敵陣） ----------------
const PST = [];
for (let t = 0; t < 8; t++) PST.push(new Int16Array(90));
const CENTER = [0, 1, 3, 5, 6, 5, 3, 1, 0];
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 9; c++) {
    const sq = SQ(r, c);
    // 兵
    let pv;
    if (r >= 5) pv = (r === 6 && (c === 0 || c === 2 || c === 4 || c === 6 || c === 8)) ? (c === 4 ? 6 : 2) : (r === 5 ? 4 : 0);
    else if (r === 4) pv = 18 + CENTER[c];
    else if (r === 3) pv = 28 + CENTER[c] * 2;
    else if (r === 2) pv = 36 + CENTER[c] * 3;
    else if (r === 1) pv = 38 + CENTER[c] * 3;
    else pv = 12 + CENTER[c];
    PST[P][sq] = pv;
    // 馬
    const nRow = [4, 16, 22, 20, 14, 10, 8, 6, 0, -8][r];
    let nv = nRow + CENTER[c] * 2 - (c === 0 || c === 8 ? 8 : 0);
    if ((r === 2 && (c === 3 || c === 5)) || (r === 1 && (c === 2 || c === 6))) nv += 10; // 臥槽、掛角附近
    PST[N][sq] = nv;
    // 車
    const rRow = [6, 12, 10, 8, 8, 6, 4, 2, 0, -6][r];
    PST[R][sq] = rRow + [-2, 4, 2, 6, 6, 6, 2, 4, -2][c];
    // 炮
    let cv = [8, 6, 4, 2, 2, 2, 2, 4, 0, 0][r] + [0, 0, 2, 4, 8, 4, 2, 0, 0][c];
    if (r === 7 && c === 4) cv += 8; // 中炮
    PST[C][sq] = cv;
    // 仕、相
    PST[A][sq] = (r === 8 && c === 4) ? 4 : 0;
    PST[B][sq] = (r === 7 && c === 4) ? 4 : (r === 7 && (c === 0 || c === 8) ? -3 : 0);
    // 帥
    PST[K][sq] = (r === 9 ? 0 : r === 8 ? -8 : -18) - (c === 4 ? 0 : 2);
  }
}
const mirror = (sq) => SQ(9 - rowOf(sq), colOf(sq));

// 靜態評估：回傳「輪走方」視角的分數
export function evaluate(pos) {
  const b = pos.board;
  let s = 0;
  const heavy = [0, 0], defenders = [0, 0];
  for (let sq = 0; sq < 90; sq++) {
    const p = b[sq];
    if (!p) continue;
    const t = typeOf(p), col = colorOf(p);
    let v = VALUE[t] + (col === RED ? PST[t][sq] : PST[t][mirror(sq)]);
    if (t === R) {
      // 車的機動性
      const r = rowOf(sq), c = colOf(sq);
      let mob = 0;
      for (let rr = r - 1; rr >= 0 && !b[SQ(rr, c)]; rr--) mob++;
      for (let rr = r + 1; rr <= 9 && !b[SQ(rr, c)]; rr++) mob++;
      for (let cc = c - 1; cc >= 0 && !b[SQ(r, cc)]; cc--) mob++;
      for (let cc = c + 1; cc <= 8 && !b[SQ(r, cc)]; cc++) mob++;
      v += mob * 2;
      heavy[col] += 2;
    } else if (t === C || t === N) heavy[col] += 1;
    else if (t === A || t === B) defenders[col]++;
    s += col === RED ? v : -v;
  }
  // 王的安全：對方攻擊子力越多，缺仕相越危險
  for (const col of [RED, BLACK]) {
    const danger = heavy[col ^ 1];
    if (danger >= 3) {
      const pen = (4 - defenders[col]) * (danger >= 5 ? 14 : 8);
      s += col === RED ? -pen : pen;
    }
  }
  const v = pos.side === RED ? s : -s;
  return v + 10; // 先手優勢
}

// ---------------- 置換表 ----------------
const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const EXACT = 1, LOWER = 2, UPPER = 3;

export class Engine {
  constructor() {
    this.ttKeyH = new Int32Array(TT_SIZE);
    this.ttKeyL = new Int32Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.history = new Int32Array(90 * 90);
    this.killers = [];
    for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
  }

  clearTT() { this.ttFlag.fill(0); }

  ttProbe(pos) {
    const i = pos.hl & TT_MASK;
    if (this.ttFlag[i] && this.ttKeyH[i] === pos.hh && this.ttKeyL[i] === pos.hl) return i;
    return -1;
  }

  ttStore(pos, depth, flag, score, move, ply) {
    const i = pos.hl & TT_MASK;
    if (this.ttFlag[i] && this.ttDepth[i] > depth && this.ttKeyH[i] === pos.hh) return;
    if (score > MATE_BOUND) score += ply; else if (score < -MATE_BOUND) score -= ply;
    this.ttKeyH[i] = pos.hh; this.ttKeyL[i] = pos.hl;
    this.ttMove[i] = move; this.ttScore[i] = score; this.ttDepth[i] = depth; this.ttFlag[i] = flag;
  }

  // opts: { timeMs, maxDepth, noise, exclude:[move], only:[move], historyHashes:[string], onInfo }
  search(fen, opts = {}) {
    const pos = new Position(fen);
    this.pos = pos;
    this.nodes = 0;
    this.stop = false;
    this.deadline = Date.now() + (opts.timeMs || 1000);
    this.noise = opts.noise || 0;
    this.noiseSeed = (Math.random() * 0x7fffffff) | 0;
    this.history.fill(0);
    for (const k of this.killers) { k[0] = 0; k[1] = 0; }
    // 遊戲歷史中的局面（重複判和用）
    this.gameHashes = new Set(opts.historyHashes || []);
    this.path = [];

    let rootMoves = pos.legalMoves();
    if (opts.only && opts.only.length) rootMoves = rootMoves.filter((m) => opts.only.includes(m));
    if (opts.exclude && opts.exclude.length) rootMoves = rootMoves.filter((m) => !opts.exclude.includes(m));
    if (!rootMoves.length) return { best: 0, score: pos.inCheck() ? -MATE : -MATE, depth: 0, pv: [], nodes: 0 };
    if (rootMoves.length === 1 && !opts.analyze) return { best: rootMoves[0], score: 0, depth: 1, pv: [rootMoves[0]], nodes: 1 };

    const maxDepth = opts.maxDepth || 64;
    let best = rootMoves[0], bestScore = -MATE, bestDepth = 0, pv = [best];
    const scores = new Map();
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -MATE - 1, beta = MATE + 1;
      let iterBest = 0, iterScore = -MATE - 1;
      // 根節點排序：上一輪最佳優先，其次依上一輪分數
      rootMoves.sort((a, b2) => (b2 === best) - (a === best) || (scores.get(b2) ?? -1e9) - (scores.get(a) ?? -1e9));
      let first = true;
      for (const m of rootMoves) {
        pos.makeMove(m);
        this.path.push(pos.hash());
        let sc;
        const givesCheck = pos.inCheck();
        const ext = givesCheck ? 1 : 0;
        if (first) sc = -this.pvs(depth - 1 + ext, -beta, -alpha, 1, true);
        else {
          sc = -this.pvs(depth - 1 + ext, -alpha - 1, -alpha, 1, true);
          if (!this.stop && sc > alpha) sc = -this.pvs(depth - 1 + ext, -beta, -alpha, 1, true);
        }
        this.path.pop();
        pos.unmakeMove();
        if (this.stop) break;
        scores.set(m, sc);
        if (sc > iterScore) { iterScore = sc; iterBest = m; }
        if (sc > alpha) alpha = sc;
        first = false;
      }
      if (this.stop && !iterBest) break;
      if (iterBest) {
        best = iterBest; bestScore = iterScore; bestDepth = depth;
        pv = this.extractPV(pos, best);
        if (opts.onInfo) opts.onInfo({ depth, score: bestScore, best, pv, nodes: this.nodes });
      }
      if (this.stop) break;
      if (Math.abs(bestScore) > MATE_BOUND) break; // 找到殺棋
      // 預估下一層耗時：若已用掉超過一半時間就停
      if (Date.now() > this.deadline - (opts.timeMs || 1000) * 0.5) break;
    }
    return { best, score: bestScore, depth: bestDepth, pv, nodes: this.nodes, scores: [...scores.entries()] };
  }

  extractPV(pos, first) {
    const pv = [first];
    pos.makeMove(first);
    let n = 1;
    const seen = new Set([pos.hash()]);
    while (n < 12) {
      const i = this.ttProbe(pos);
      if (i < 0 || !this.ttMove[i]) break;
      const m = this.ttMove[i];
      if (!pos.legalMoves().includes(m)) break;
      pos.makeMove(m); n++;
      pv.push(m);
      const h = pos.hash();
      if (seen.has(h)) break;
      seen.add(h);
    }
    while (n-- > 0) pos.unmakeMove();
    return pv;
  }

  checkTime() {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) this.stop = true;
  }

  leafEval(pos) {
    let v = evaluate(pos);
    if (this.noise) {
      // 依局面雜湊產生固定雜訊（低難度用）
      let x = (pos.hl ^ this.noiseSeed) | 0;
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
      x ^= x >>> 16;
      v += ((x & 0xffff) / 0xffff - 0.5) * 2 * this.noise;
    }
    return v | 0;
  }

  isRepetition(pos) {
    const h = pos.hash();
    if (this.gameHashes.has(h)) return true;
    const p = this.path;
    for (let i = p.length - 3; i >= 0; i -= 2) if (p[i] === h) return true;
    return false;
  }

  orderMoves(pos, moves, ttMove, ply) {
    const b = pos.board;
    const k = this.killers[ply] || [0, 0];
    const scored = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      let s;
      if (m === ttMove) s = 1e9;
      else {
        const cap = b[moveTo(m)];
        if (cap) s = 1e8 + VALUE[typeOf(cap)] * 16 - VALUE[typeOf(b[moveFrom(m)])] + (typeOf(cap) === P ? 200 : 0);
        else if (m === k[0]) s = 9e7;
        else if (m === k[1]) s = 8e7;
        else s = this.history[moveFrom(m) * 90 + moveTo(m)];
      }
      scored[i] = [s, m];
    }
    scored.sort((x, y) => y[0] - x[0]);
    for (let i = 0; i < moves.length; i++) moves[i] = scored[i][1];
    return moves;
  }

  pvs(depth, alpha, beta, ply, allowNull) {
    const pos = this.pos;
    this.checkTime();
    if (this.stop) return 0;
    if (ply > 0 && this.isRepetition(pos)) return 0;
    // 殺棋距離裁剪
    alpha = Math.max(alpha, -MATE + ply);
    beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const inCheck = pos.inCheck();
    if (depth <= 0 && !inCheck) return this.quiesce(alpha, beta, ply, 0);
    if (depth < 0) depth = 0;
    if (ply >= 100) return this.leafEval(pos);

    let ttMove = 0;
    const ti = this.ttProbe(pos);
    const isPV = beta - alpha > 1;
    if (ti >= 0) {
      ttMove = this.ttMove[ti];
      if (this.ttDepth[ti] >= depth && !isPV) {
        let sc = this.ttScore[ti];
        if (sc > MATE_BOUND) sc -= ply; else if (sc < -MATE_BOUND) sc += ply;
        const f = this.ttFlag[ti];
        if (f === EXACT || (f === LOWER && sc >= beta) || (f === UPPER && sc <= alpha)) return sc;
      }
    }

    // 空步裁剪
    if (allowNull && !inCheck && !isPV && depth >= 3 && this.hasMajors(pos.side)) {
      const staticEval = this.leafEval(pos);
      if (staticEval >= beta) {
        pos.makeNull();
        const Rr = depth >= 6 ? 3 : 2;
        const sc = -this.pvs(depth - 1 - Rr, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (this.stop) return 0;
        if (sc >= beta) return sc > MATE_BOUND ? beta : sc;
      }
    }

    const moves = this.orderMoves(pos, pos.genMoves(), ttMove, ply);
    const me = pos.side;
    let legal = 0, bestScore = -MATE - 1, bestMove = 0;
    const alpha0 = alpha;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const cap = pos.board[moveTo(m)];
      pos.makeMove(m);
      if (pos.inCheck(me)) { pos.unmakeMove(); continue; }
      legal++;
      const givesCheck = pos.inCheck();
      this.path.push(pos.hash());
      const ext = givesCheck ? 1 : 0;
      let sc;
      if (legal === 1) sc = -this.pvs(depth - 1 + ext, -beta, -alpha, ply + 1, true);
      else {
        // 延遲著法縮減（LMR）
        let red = 0;
        if (depth >= 3 && legal > 4 && !cap && !givesCheck && !inCheck) red = legal > 10 ? 2 : 1;
        sc = -this.pvs(depth - 1 - red + ext, -alpha - 1, -alpha, ply + 1, true);
        if (!this.stop && sc > alpha && red) sc = -this.pvs(depth - 1 + ext, -alpha - 1, -alpha, ply + 1, true);
        if (!this.stop && sc > alpha && sc < beta) sc = -this.pvs(depth - 1 + ext, -beta, -alpha, ply + 1, true);
      }
      this.path.pop();
      pos.unmakeMove();
      if (this.stop) return 0;
      if (sc > bestScore) {
        bestScore = sc; bestMove = m;
        if (sc > alpha) {
          alpha = sc;
          if (sc >= beta) {
            if (!cap) {
              const k = this.killers[ply];
              if (k && k[0] !== m) { k[1] = k[0]; k[0] = m; }
              this.history[moveFrom(m) * 90 + moveTo(m)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (!legal) return -MATE + ply; // 被將死或困斃都判負
    const flag = bestScore >= beta ? LOWER : bestScore > alpha0 ? EXACT : UPPER;
    this.ttStore(pos, depth, flag, bestScore, bestMove, ply);
    return bestScore;
  }

  quiesce(alpha, beta, ply, qply) {
    const pos = this.pos;
    this.checkTime();
    if (this.stop) return 0;
    const inCheck = pos.inCheck();
    const me = pos.side;
    let bestScore;
    if (!inCheck) {
      const stand = this.leafEval(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      bestScore = stand;
      if (qply > 10) return stand;
    } else {
      if (qply > 6) return this.leafEval(pos);
      bestScore = -MATE + ply;
    }
    const moves = this.orderMoves(pos, pos.genMoves(!inCheck), 0, Math.min(ply, 127));
    let legal = 0;
    for (const m of moves) {
      pos.makeMove(m);
      if (pos.inCheck(me)) { pos.unmakeMove(); continue; }
      legal++;
      const sc = -this.quiesce(-beta, -alpha, ply + 1, qply + 1);
      pos.unmakeMove();
      if (this.stop) return 0;
      if (sc > bestScore) {
        bestScore = sc;
        if (sc > alpha) { alpha = sc; if (sc >= beta) break; }
      }
    }
    if (inCheck && !legal) return -MATE + ply;
    return bestScore;
  }

  hasMajors(side) {
    const b = this.pos.board;
    let n = 0;
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (p && colorOf(p) === side) { const t = typeOf(p); if (t === R || t === N || t === C) n++; }
    }
    return n >= 2;
  }
}

// 難度設定
export const LEVELS = [
  { name: '入門', timeMs: 300, maxDepth: 2, noise: 70 },
  { name: '初級', timeMs: 600, maxDepth: 3, noise: 30 },
  { name: '中級', timeMs: 1200, maxDepth: 64, noise: 0 },
  { name: '高級', timeMs: 3000, maxDepth: 64, noise: 0 },
  { name: '大師', timeMs: 8000, maxDepth: 64, noise: 0 },
];

// 分數轉成白話（輪走方視角）
export function scoreText(score) {
  if (score > MATE_BOUND) return `${Math.ceil((MATE - score) / 2)} 步內可殺棋`;
  if (score < -MATE_BOUND) return `${Math.ceil((MATE + score) / 2)} 步內會被殺`;
  const s = score / 100;
  return (s >= 0 ? '+' : '') + s.toFixed(2);
}
export const isMateScore = (s) => Math.abs(s) > MATE_BOUND;
