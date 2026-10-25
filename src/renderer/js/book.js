// 棋譜庫：內建開局庫＋「每局對弈自動收錄」的學習棋譜
import { Position, Game, parseMove, moveToIccs, iccsToMove, moveFrom, moveTo, rowOf, colOf, SQ, MOVE, RED, BLACK, replayRecord } from './xiangqi.js';

// 內建常見開局（中文記譜）
const OPENINGS = [
  ['中炮對屏風馬', '炮二平五 馬８進７ 傌二進三 車９平８ 俥一平二 馬２進３ 兵七進一 卒７進１ 俥二進六 象３進５ 傌八進七 士４進５'],
  ['五七炮對屏風馬', '炮二平五 馬８進７ 傌二進三 車９平８ 俥一平二 馬２進３ 兵七進一 卒７進１ 傌八進九 象３進５ 炮八平七 車１平２'],
  ['中炮過河車', '炮二平五 馬８進７ 傌二進三 車９平８ 俥一平二 卒７進１ 俥二進六 馬２進３ 兵七進一 象３進５'],
  ['中炮對反宮馬', '炮二平五 馬２進３ 傌二進三 包８平６ 俥一平二 馬８進７ 兵七進一 車９平８ 傌八進七 象７進５'],
  ['順炮直車', '炮二平五 包８平５ 傌二進三 馬８進７ 俥一平二 車９平８ 傌八進七 馬２進３'],
  ['列手炮', '炮二平五 包２平５ 傌二進三 馬８進７ 俥一平二 車９平８'],
  ['中炮對單提馬', '炮二平五 馬８進７ 傌二進三 馬２進１ 俥一平二 車９平８'],
  ['仙人指路對卒底炮', '兵七進一 包２平３ 炮二平五 象３進５ 傌二進三 馬８進７ 俥一平二 車９平８'],
  ['仙人指路對進卒', '兵七進一 卒７進１ 傌八進七 馬８進７ 傌二進三 象３進５ 相三進五 馬２進３'],
  ['飛相局對左中炮', '相三進五 包８平５ 傌二進三 馬８進７ 俥一平二 車９平８ 兵七進一 馬２進３'],
  ['飛相局對進卒', '相三進五 卒７進１ 傌二進三 馬８進７ 兵七進一 象３進５ 傌八進七 馬２進３'],
  ['起馬局', '傌八進七 卒７進１ 兵七進一 馬８進７ 傌二進三 象３進５ 相三進五 馬２進３'],
  ['仕角炮', '炮二平四 馬８進７ 傌二進三 車９平８ 俥一平二 馬２進３ 兵七進一 卒７進１'],
  ['過宮炮', '炮二平六 馬８進７ 傌二進三 車９平８ 俥一平二 馬２進３ 兵七進一 卒３進１'],
  ['中炮對龜背炮', '炮二平五 馬８進７ 傌二進三 包２退１ 俥一平二 車９平８'],
];

function mirrorSq(sq) { return SQ(rowOf(sq), 8 - colOf(sq)); }
function mirrorMove(m) { return MOVE(mirrorSq(moveFrom(m)), mirrorSq(moveTo(m))); }
function mirrorPos(pos) {
  const p = new Position(pos.fen());
  const b = new Int8Array(90);
  for (let sq = 0; sq < 90; sq++) b[mirrorSq(sq)] = pos.board[sq];
  p.board.set(b);
  p._rehash();
  return p;
}

export class OpeningBook {
  constructor() {
    this.map = new Map(); // key → Map(iccs → {w, names:Set})
    for (const [name, line] of OPENINGS) {
      const g = new Game();
      for (const tok of line.split(/\s+/)) {
        const m = parseMove(g.pos, tok);
        if (!m) { console.warn('開局庫解析失敗', name, tok); break; }
        this._add(g.pos, m, name);
        this._add(mirrorPos(g.pos), mirrorMove(m), name);
        g.play(m);
      }
    }
  }
  _add(pos, m, name) {
    const k = pos.key();
    if (!this.map.has(k)) this.map.set(k, new Map());
    const e = this.map.get(k);
    const ic = moveToIccs(m);
    if (!e.has(ic)) e.set(ic, { w: 0, names: new Set() });
    const x = e.get(ic); x.w++; x.names.add(name);
  }
  lookup(pos) {
    const e = this.map.get(pos.key());
    if (!e) return [];
    return [...e.entries()].map(([iccs, x]) => ({ iccs, move: iccsToMove(iccs), w: x.w, names: [...x.names] }));
  }
  // 依局面猜開局名稱
  nameOf(game) {
    const g = new Game(game.startFen);
    let name = '';
    for (const m of game.moves) {
      const hits = this.lookup(g.pos).find((x) => x.move === m);
      if (!hits) break;
      name = hits.names[0];
      g.play(m);
    }
    return name;
  }
}

// 學習棋譜：每個局面下過哪些著法、結果如何（以下該步那方的視角統計）
export class LearnedBook {
  constructor() { this.map = new Map(); this.games = 0; }

  addRecord(rec) {
    if (!rec || !rec.moves || !rec.moves.length) return;
    const res = rec.result;
    if (res !== '1-0' && res !== '0-1' && res !== '1/2-1/2') return; // 沒有結果的不列入
    let g;
    try { g = new Game(rec.startFen || undefined); } catch { return; }
    let added = 0;
    for (const s of rec.moves) {
      const m = parseMove(g.pos, s);
      if (!m) break;
      const mover = g.pos.side;
      const outcome = res === '1/2-1/2' ? 'd' : ((res === '1-0') === (mover === RED) ? 'w' : 'l');
      this._add(g.pos.key(), moveToIccs(m), outcome);
      this._add(mirrorPos(g.pos).key(), moveToIccs(mirrorMove(m)), outcome, true);
      g.play(m);
      added++;
      if (g.result) break;
    }
    if (added) this.games++;
  }

  _add(key, iccs, outcome, mirrored = false) {
    if (!this.map.has(key)) this.map.set(key, new Map());
    const e = this.map.get(key);
    if (!e.has(iccs)) e.set(iccs, { w: 0, d: 0, l: 0, n: 0, mir: 0 });
    const x = e.get(iccs);
    x[outcome]++; x.n++;
    if (mirrored) x.mir++;
  }

  get positions() { return this.map.size; }

  lookup(pos) {
    const e = this.map.get(pos.key());
    if (!e) return [];
    const legal = pos.legalMoves();
    return [...e.entries()]
      .map(([iccs, x]) => ({ iccs, move: iccsToMove(iccs), ...x, score: (x.w + 0.5 * x.d) / x.n }))
      .filter((x) => legal.includes(x.move))
      .sort((a, b) => b.score - a.score || b.n - a.n);
  }
}

// 依棋譜決定 AI 是否有「現成」著法；回傳 { book, good, bad }
export function consultBooks(pos, ply, opening, learned) {
  const learnedHits = learned ? learned.lookup(pos) : [];
  const bad = learnedHits.filter((x) => x.n >= 2 && x.score <= 0.25).map((x) => x.move);
  const good = learnedHits.filter((x) => x.score >= 0.6 && x.w >= 1);
  let book = null;
  if (ply < 20 && opening) {
    const cands = opening.lookup(pos).filter((x) => !bad.includes(x.move));
    if (cands.length) {
      // 學習棋譜裡贏過的開局著法加權
      const weight = (x) => x.w + (learnedHits.find((y) => y.move === x.move)?.w || 0) * 2;
      const total = cands.reduce((s, x) => s + weight(x), 0);
      let r = Math.random() * total;
      for (const x of cands) { r -= weight(x); if (r <= 0) { book = x; break; } }
      book = book || cands[0];
    }
  }
  return { book, good, bad, learnedHits };
}

export function buildLearned(records) {
  const lb = new LearnedBook();
  for (const r of records) lb.addRecord(r);
  return lb;
}

export { replayRecord };
