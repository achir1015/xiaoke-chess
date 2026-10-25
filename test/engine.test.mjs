import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, MATE } from '../src/renderer/js/engine.js';
import { Position, Game, moveToIccs, iccsToMove, START_FEN } from '../src/renderer/js/xiangqi.js';

test('一步殺', () => {
  const e = new Engine();
  // 紅俥 g0 沉底悶宮
  const r = e.search('3ak4/4a4/9/9/9/9/9/9/9/4K1R2 w', { timeMs: 1000 });
  assert.equal(moveToIccs(r.best), 'g0g9');
  assert.ok(r.score > MATE - 10);
});

test('會吃掉白送的車', () => {
  const e = new Engine();
  // 黑車放在紅炮可吃的位置（炮架是兵）
  const r = e.search('rnbakabn1/9/1c5c1/p1p1p1p1p/9/9/P1P1P1PrP/1C5C1/9/RNBAKABNR w', { timeMs: 1000 });
  const g = new Game('rnbakabn1/9/1c5c1/p1p1p1p1p/9/9/P1P1P1PrP/1C5C1/9/RNBAKABNR w');
  const cap = g.pos.board[iccsToMove(moveToIccs(r.best)) >> 7];
  assert.ok(cap, '應該吃子，實際走 ' + moveToIccs(r.best));
});

test('開局搜尋速度與合理著法', () => {
  const e = new Engine();
  const t = Date.now();
  const r = e.search(START_FEN, { timeMs: 2000 });
  const ms = Date.now() - t;
  console.log('depth', r.depth, 'nodes', r.nodes, 'nps', Math.round(r.nodes / (ms / 1000)), 'best', moveToIccs(r.best), 'score', r.score);
  assert.ok(r.depth >= 5);
  assert.ok(new Position().legalMoves().includes(r.best));
});

test('AI 自我對弈 30 步不出錯', () => {
  const e = new Engine();
  const g = new Game();
  for (let i = 0; i < 30 && !g.result; i++) {
    const r = e.search(g.pos.fen(), { timeMs: 80, historyHashes: g.hashes });
    g.play(r.best);
  }
  console.log(g.notes.join(' '));
  assert.ok(g.moves.length > 0);
});
