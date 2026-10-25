import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpeningBook, LearnedBook, consultBooks } from '../src/renderer/js/book.js';
import { Game, Position, parseMove, moveToIccs } from '../src/renderer/js/xiangqi.js';

test('開局庫全部可解析', () => {
  const warn = console.warn; let warned = 0; console.warn = () => warned++;
  const ob = new OpeningBook();
  console.warn = warn;
  assert.equal(warned, 0);
  const hits = ob.lookup(new Position());
  assert.ok(hits.length >= 5);
  // 左右對稱：炮八平五也在庫裡
  assert.ok(hits.some((h) => h.iccs === 'b2e2'));
});

test('學習棋譜：贏的著法被記住、輸的被避開', () => {
  const lb = new LearnedBook();
  const mk = (line, result) => { const g = new Game(); for (const t of line.split(' ')) g.play(parseMove(g.pos, t)); return g.toRecord({ result }); };
  lb.addRecord({ ...mk('炮二平五 馬８進７', '*'), result: '1-0' });
  lb.addRecord({ ...mk('炮二平五 包８平５', '*'), result: '0-1' });
  lb.addRecord({ ...mk('炮二平五 包８平５', '*'), result: '0-1' });
  assert.equal(lb.games, 3);
  const g = new Game(); g.play(parseMove(g.pos, '炮二平五'));
  const hits = lb.lookup(g.pos);
  const h7 = hits.find((h) => h.iccs === 'h9g7');
  const c5 = hits.find((h) => h.iccs === 'h7e7');
  assert.equal(h7.l, 1); // 黑方走馬８進７輸了
  assert.equal(c5.w, 2); // 黑方走包８平５贏了兩次
  const c = consultBooks(g.pos, 1, null, lb);
  assert.ok(c.good.some((x) => x.iccs === 'h7e7'));
  // 紅方第一手：炮二平五 1 勝 2 負 → n=3, score=1/3 → 不算 bad（門檻 0.25）
  const r = consultBooks(new Position(), 0, new OpeningBook(), lb);
  assert.ok(r.book);
});
