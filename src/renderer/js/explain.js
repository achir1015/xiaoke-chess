// 錯誤走法說明：告訴玩家「為什麼不能這樣走」
import { K, A, B, N, R, C, P, RED, typeOf, colorOf, rowOf, colOf, SQ, MOVE, NAMES } from './xiangqi.js';
import { rankOf, COLS as HC } from './banqi.js';

const nm = (code) => NAMES[colorOf(code)][typeOf(code)];
const pair = (t) => `${NAMES[0][t]}（${NAMES[1][t]}）`;

// 整盤：pos 為目前局面，from 為自己的棋子，to 為想去的位置；合法時回傳 ''
export function explainIllegal(pos, from, to) {
  const b = pos.board;
  const p = b[from];
  if (!p) return '';
  const me = colorOf(p), t = typeOf(p);
  const q = b[to];
  if (from === to) return '';
  if (q && colorOf(q) === me) return '不能吃自己的棋子';
  const fr = rowOf(from), fc = colOf(from), tr = rowOf(to), tc = colOf(to);
  const dr = tr - fr, dc = tc - fc, ar = Math.abs(dr), ac = Math.abs(dc);
  const inPalace = (r, c) => c >= 3 && c <= 5 && (me === RED ? r >= 7 : r <= 2);
  const between = () => {
    let n = 0;
    if (dr === 0) for (let c = Math.min(fc, tc) + 1; c < Math.max(fc, tc); c++) { if (b[SQ(fr, c)]) n++; }
    else for (let r = Math.min(fr, tr) + 1; r < Math.max(fr, tr); r++) { if (b[SQ(r, fc)]) n++; }
    return n;
  };
  const fwd = me === RED ? -1 : 1;
  switch (t) {
    case K:
      if (ar + ac !== 1) return `${pair(K)}每次只能直走或橫走一步`;
      if (!inPalace(tr, tc)) return `${pair(K)}不能走出九宮`;
      break;
    case A:
      if (!(ar === 1 && ac === 1)) return `${pair(A)}每次只能在九宮裡斜走一步`;
      if (!inPalace(tr, tc)) return `${pair(A)}不能走出九宮`;
      break;
    case B:
      if (!(ar === 2 && ac === 2)) return `${pair(B)}走「田」字：每次斜走兩格`;
      if (me === RED ? tr < 5 : tr > 4) return `${pair(B)}不能過河`;
      if (b[SQ(fr + dr / 2, fc + dc / 2)]) return `塞象眼：「田」字中心有棋子，${pair(B)}不能走`;
      break;
    case N: {
      if (!((ar === 2 && ac === 1) || (ar === 1 && ac === 2))) return `${pair(N)}走「日」字：直走一格再斜走一格`;
      const leg = ar === 2 ? SQ(fr + dr / 2, fc) : SQ(fr, fc + dc / 2);
      if (b[leg]) return `蹩馬腿：${pair(N)}前進方向緊鄰的位置有棋子擋住`;
      break;
    }
    case R:
      if (dr !== 0 && dc !== 0) return `${pair(R)}只能直走或橫走`;
      if (between()) return `${pair(R)}不能越過其他棋子`;
      break;
    case C:
      if (dr !== 0 && dc !== 0) return `${pair(C)}只能直走或橫走`;
      if (!q && between()) return `${pair(C)}不吃子時，走法和車一樣，不能越過棋子`;
      if (q) {
        const n = between();
        if (n === 0) return `${pair(C)}吃子時，中間一定要隔一顆棋子（炮架）`;
        if (n > 1) return `${pair(C)}吃子時，中間只能隔一顆棋子`;
      }
      break;
    case P: {
      const crossed = me === RED ? fr <= 4 : fr >= 5;
      if (dr === -fwd) return `${pair(P)}永遠不能後退`;
      if (ar + ac !== 1) return `${pair(P)}每次只能走一步`;
      if (dr === 0 && !crossed) return `${pair(P)}過河以前只能往前走，過河後才可以左右走`;
      break;
    }
  }
  // 走法本身沒問題，但會讓自己被將軍
  const m = MOVE(from, to);
  pos.makeMove(m);
  const ks = pos.kingSq[me], ek = pos.kingSq[me ^ 1];
  let facing = false;
  if (colOf(ks) === colOf(ek)) {
    facing = true;
    for (let r = Math.min(rowOf(ks), rowOf(ek)) + 1; r < Math.max(rowOf(ks), rowOf(ek)); r++) if (pos.board[SQ(r, colOf(ks))]) { facing = false; break; }
  }
  const check = pos.inCheck(me);
  pos.unmakeMove();
  if (facing) return '王不見王：帥和將不能在同一條直線上直接面對面';
  if (check) return pos.inCheck(me) ? '您正被將軍，這步沒有解除將軍，請先保護帥（將）' : `這步走完您的${pair(K)}會被對方吃掉（送將），不能這樣走`;
  return '';
}

// 半盤：g 為 HalfGame
export function explainIllegalHalf(g, from, to) {
  const p = g.board[from];
  if (!p || !g.up[from]) return '';
  const q = g.board[to];
  const fr = (from / HC) | 0, fc = from % HC, tr = (to / HC) | 0, tc = to % HC;
  const ar = Math.abs(fr - tr), ac = Math.abs(fc - tc);
  if (q && !g.up[to]) return '不能走到暗子上，暗子要先翻開';
  if (q && colorOf(q) === colorOf(p)) return '不能吃自己的棋子';
  if (typeOf(p) === C) {
    const jump = (ar === 2 && ac === 0) || (ar === 0 && ac === 2);
    if (ar + ac === 1 && q) return '炮不能直接吃相鄰的棋子，要隔一顆棋子打';
    if (jump) {
      const mid = ((fr + tr) / 2) * HC + (fc + tc) / 2;
      if (!g.board[mid]) return '炮打子時，中間一定要隔一顆棋子（明子暗子都可以）';
      if (!q) return '炮隔子跳過去時一定要打到對方的明子，不能跳到空格';
    } else if (ar + ac !== 1) return '炮只能走一步到空格，或隔一顆棋子打兩格外的明子';
    return '';
  }
  if (ar + ac !== 1) return '半盤的棋子每次只能上下左右走一步';
  if (q) {
    const a = rankOf(p), d = rankOf(q);
    if (a === 0 && d === 6) return `${nm(p)}不能吃${nm(q)}：帥（將）怕兵（卒）`;
    if (a === 6 && d === 0) return '';
    if (a > d) return `${nm(p)}比${nm(q)}小，小的不能吃大的（帥＞仕＞相＞車＞馬＞炮＞兵）`;
  }
  return '';
}
