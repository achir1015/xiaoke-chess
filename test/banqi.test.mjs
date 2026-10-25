import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HalfGame, HalfAI, ACT, actToStr, strToAct, fullSet, replayHalf, HALF_LEVELS, CELLS } from '../src/renderer/js/banqi.js';
import { K, A, B, N, R, C, P, RED, BLACK } from '../src/renderer/js/xiangqi.js';

const BK = 8;
// 建立一個「全部翻開」的測試局面：pieces = { 'A1': code, ... }，其餘空格；先手為紅
function setup(pieces, turnColor = RED) {
  const g = new HalfGame(fullSet());
  g.board.fill(0); g.up.fill(0);
  for (const [name, code] of Object.entries(pieces)) {
    const sq = 'ABCD'.indexOf(name[0]) * 8 + Number(name.slice(1)) - 1;
    g.board[sq] = code; g.up[sq] = 1;
  }
  g.pcolor = turnColor === RED ? [RED, BLACK] : [BLACK, RED];
  g.turn = 0;
  return g;
}
const mv = (s) => strToAct(s);

test('發牌：32 枚、各 16 枚', () => {
  const g = new HalfGame();
  assert.equal(g.deal.length, 32);
  assert.equal(g.deal.filter((c) => c < 8).length, 16);
  // 開局只能翻子
  assert.equal(g.legalActions().length, 32);
});

test('第一次翻子決定顏色', () => {
  const g = new HalfGame();
  const code = g.board[0];
  g.play(ACT(0, 0));
  assert.equal(g.pcolor[0], code & 8 ? BLACK : RED);
  assert.equal(g.pcolor[1], g.pcolor[0] ^ 1);
  assert.equal(g.turn, 1);
  g.undo();
  assert.deepEqual(g.pcolor, [null, null]);
});

test('大吃小、同大小可吃、小不能吃大', () => {
  const g = setup({ B2: R, B3: N + BK, C2: N, C3: R + BK, A1: A, A2: A + BK });
  const acts = g.legalActions().map(actToStr);
  assert.ok(acts.includes('B2-B3'), '車吃馬');
  assert.ok(!acts.includes('C2-C3'), '馬不能吃車');
  assert.ok(acts.includes('A1-A2'), '士吃士（同大小）');
});

test('帥不能吃兵、兵可以吃帥', () => {
  let g = setup({ B2: K, B3: P + BK });
  assert.ok(!g.legalActions().map(actToStr).includes('B2-B3'));
  g = setup({ B2: P, B3: K + BK });
  assert.ok(g.legalActions().map(actToStr).includes('B2-B3'));
});

test('炮：隔一子打、不能吃相鄰、只能打明子', () => {
  let g = setup({ B1: C, B2: P + BK, B3: K + BK });
  let acts = g.legalActions().map(actToStr);
  assert.ok(acts.includes('B1-B3'), '炮打帥');
  assert.ok(!acts.includes('B1-B2'), '炮不能吃相鄰');
  // 炮架是暗子也可以
  g = setup({ B1: C, B3: K + BK, D8: R + BK });
  g.board[1 * 8 + 1] = A; g.up[1 * 8 + 1] = 0;
  assert.ok(g.legalActions().map(actToStr).includes('B1-B3'));
  // 目標是暗子不行
  g = setup({ B1: C, B2: P + BK, D8: R + BK });
  g.board[1 * 8 + 2] = K + BK; g.up[1 * 8 + 2] = 0;
  assert.ok(!g.legalActions().map(actToStr).includes('B1-B3'));
  // 沒有炮架不行
  g = setup({ B1: C, B3: K + BK });
  assert.ok(!g.legalActions().map(actToStr).includes('B1-B3'));
});

test('只能上下左右走一步、不能走到暗子', () => {
  const g = setup({ B2: R, D8: P + BK });
  g.board[1 * 8 + 2] = A + BK; g.up[1 * 8 + 2] = 0;
  const acts = g.legalActions().map(actToStr).filter((s) => s.startsWith('B2'));
  assert.deepEqual(acts.sort(), ['B2-A2', 'B2-B1', 'B2-C2'].sort());
});

test('吃光對方即勝', () => {
  const g = setup({ B2: R, B3: N + BK });
  g.play(mv('B2-B3'));
  assert.ok(g.result);
  assert.equal(g.result.winColor, RED);
  assert.equal(g.result.winner, 0);
});

test('AI 不偷看暗子，且會吃白送的子', () => {
  const g = setup({ B2: R, B3: N + BK, D8: K + BK, A8: K });
  const view = g.publicView();
  assert.ok(view.board.every((x) => x !== undefined));
  const ai = new HalfAI();
  const r = ai.choose(view, { timeMs: 300 });
  assert.equal(actToStr(r.act), 'B2-B3');
});

test('AI 不會把子送給對方吃', () => {
  // 紅馬在 B2，旁邊 B4 有黑車；紅馬走到 B3 會被黑車吃掉
  const g = setup({ B2: N, B4: R + BK, A1: P + BK, D1: A });
  const ai = new HalfAI();
  const r = ai.choose(g.publicView(), { timeMs: 400 });
  assert.notEqual(actToStr(r.act), 'B2-B3');
});

test('AI 對 AI：各難度都能下完整盤', () => {
  for (const lv of [HALF_LEVELS[0], HALF_LEVELS[2]]) {
    for (let k = 0; k < 3; k++) {
      const g = new HalfGame();
      const ai = new HalfAI();
      let n = 0;
      while (!g.result && n < 600) {
        const r = ai.choose(g.publicView(), { ...lv, timeMs: 40 });
        assert.ok(g.isLegal(r.act), '不合法：' + actToStr(r.act));
        g.play(r.act);
        n++;
      }
      assert.ok(g.result, '應該分出勝負或和棋');
      // 棋譜可重播
      const rp = replayHalf(g.toRecord());
      assert.equal(rp.actions.length, g.actions.length);
      assert.deepEqual(rp.result, g.result);
    }
  }
});
