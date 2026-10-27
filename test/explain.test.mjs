import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, SQ } from '../src/renderer/js/xiangqi.js';
import { explainIllegal, explainIllegalHalf } from '../src/renderer/js/explain.js';
import { HalfGame, fullSet } from '../src/renderer/js/banqi.js';
import { K, A, B, N, R, C, P } from '../src/renderer/js/xiangqi.js';

const start = () => new Position();
test('整盤：各種錯誤走法都有說明', () => {
  const p = start();
  assert.match(explainIllegal(p, SQ(9, 1), SQ(8, 1)), /日/);            // 馬走直線
  assert.match(explainIllegal(p, SQ(9, 2), SQ(7, 2)), /田/);             // 相走直線
  assert.match(explainIllegal(p, SQ(9, 0), SQ(5, 0)), /越過/);          // 車被兵擋
  assert.match(explainIllegal(p, SQ(7, 1), SQ(2, 1)), /中間一定要隔一顆/); // 炮直接吃包（沒有炮架）
  assert.equal(explainIllegal(p, SQ(7, 1), SQ(0, 1)), '');                // 炮八進七打馬（合法）
  const p2 = new Position('rnbakabnr/9/1c5c1/p1p1p1p1p/1P7/9/P3P1P1P/1C5C1/9/RNBAKABNR w');
  assert.match(explainIllegal(p2, SQ(7, 1), SQ(0, 1)), /中間只能隔一顆/); // 隔兩顆
  assert.match(explainIllegal(p, SQ(6, 0), SQ(6, 1)), /過河以前/);       // 兵橫走
  assert.match(explainIllegal(p, SQ(6, 0), SQ(7, 0)), /後退/);
  assert.match(explainIllegal(p, SQ(9, 4), SQ(8, 3)), /直走或橫走一步/);  // 帥斜走
  assert.match(explainIllegal(p, SQ(9, 3), SQ(9, 4)), /自己/);           // 仕吃帥
  assert.equal(explainIllegal(p, SQ(7, 7), SQ(7, 4)), '');                // 炮二平五合法
});

test('整盤：蹩馬腿、王見王', () => {
  let p = new Position('4k4/9/9/9/9/9/9/9/3P5/3NK4 w');
  assert.match(explainIllegal(p, SQ(9, 3), SQ(7, 4)), /蹩馬腿/);
  p = new Position('4k4/9/9/9/9/9/9/9/4R4/4K4 w');
  assert.match(explainIllegal(p, SQ(8, 4), SQ(8, 0)), /王不見王/);
});

test('半盤：錯誤走法說明', () => {
  const g = new HalfGame(fullSet());
  g.board.fill(0); g.up.fill(0);
  const put = (sq, code, up = 1) => { g.board[sq] = code; g.up[sq] = up; };
  put(9, K); put(10, P + 8); put(17, N); put(18, R + 8); put(25, C); put(27, A + 8); put(1, A + 8, 0);
  assert.match(explainIllegalHalf(g, 9, 10), /怕兵/);
  assert.match(explainIllegalHalf(g, 17, 18), /小的不能吃大的/);
  assert.match(explainIllegalHalf(g, 9, 1), /暗子/);
  assert.match(explainIllegalHalf(g, 25, 27), /中間一定要隔一顆/);
  assert.match(explainIllegalHalf(g, 17, 19), /上下左右走一步/);
});
