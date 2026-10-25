import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, Game, START_FEN, moveToChinese, parseMove, iccsToMove, moveToIccs, parseTextRecord, RED, BLACK } from '../src/renderer/js/xiangqi.js';

function perft(pos, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of pos.legalMoves()) { pos.makeMove(m); n += perft(pos, d - 1); pos.unmakeMove(); }
  return n;
}

test('perft 起始局面', () => {
  const p = new Position();
  assert.equal(perft(p, 1), 44);
  assert.equal(perft(p, 2), 1920);
  assert.equal(perft(p, 3), 79666);
});

test('FEN 往返與雜湊還原', () => {
  const p = new Position();
  assert.equal(p.fen(), START_FEN.split(' ').slice(0, 2).join(' '));
  const h = p.hash();
  for (const m of p.legalMoves()) { p.makeMove(m); p.unmakeMove(); }
  assert.equal(p.hash(), h);
});

test('中文記譜：開局常見著法', () => {
  const g = new Game();
  const play = (s) => { const m = parseMove(g.pos, s); assert.ok(m, '找不到 ' + s); return g.play(m).note; };
  assert.equal(play('h2e2'), '炮二平五');
  assert.equal(play('h9g7'), '馬８進７');
  assert.equal(play('馬二進三'), '傌二進三');
  assert.equal(play('車9平8'), '車９平８');
  assert.equal(play('车一平二'), '俥一平二');
  assert.equal(play('卒７進１'), '卒７進１');
  assert.equal(moveToIccs(iccsToMove('b0c2')), 'b0c2');
});

test('王見王不可走', () => {
  // 紅帥 e0、黑將 e9 之間只有一顆紅兵，紅兵若橫移就會王見王
  const p = new Position('4k4/9/9/9/9/4P4/9/9/9/4K4 w');
  const ms = p.legalMoves().map(moveToIccs);
  assert.ok(ms.includes('e4e5'));
  // 兵未過河不能橫走；帥橫走 OK
  assert.ok(ms.includes('e0d0'));
});

test('將死判定', () => {
  // 雙車錯殺
  const g = new Game('3k5/9/9/9/9/9/9/9/R8/R3K4 w');
  g.play(iccsToMove('a1a9'));
  assert.equal(g.result, null);
  g.play(parseMove(g.pos, g.pos.legalMoves().map(moveToIccs)[0]));
  const before = g.pos.legalMoves().map(moveToIccs);
  assert.ok(before.length > 0);
});

test('悶宮：無合法著法判負', () => {
  const g = new Game('3ak4/4a4/9/9/9/9/9/9/9/4K1R2 w');
  // 俥移到 f 列 → 黑將被困且被將
  g.play(iccsToMove('g0g9'));
  assert.ok(g.result);
  assert.equal(g.result.winner, RED);
});

test('長將判負', () => {
  const g = new Game('4k4/9/9/9/9/9/9/9/9/3R1K3 w');
  // 紅俥 d0 來回將軍，黑將左右閃
  const seq = ['d0d9', 'e9e8', 'd9d8', 'e8e9', 'd8d9', 'e9e8', 'd9d8', 'e8e9', 'd8d9'];
  for (const s of seq) { if (g.result) break; g.play(iccsToMove(s)); }
  assert.ok(g.result, '應判定結果');
  assert.equal(g.result.winner, BLACK);
});

test('文字棋譜匯入', () => {
  const rec = parseTextRecord('1. 炮二平五 馬８進７ 2. 傌二進三 車９平８ 1-0');
  assert.equal(rec.moves.length, 4);
  assert.equal(rec.result, '1-0');
});
