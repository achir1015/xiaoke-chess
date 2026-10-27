import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Guide, FULL_LESSONS, HALF_LESSONS } from '../src/renderer/js/guide.js';

function check(kind, lessons) {
  const g = Object.create(Guide.prototype);
  g.kind = kind;
  const problems = [];
  for (const lesson of lessons) {
    let model = null;
    lesson.steps.forEach((st, i) => {
      const where = `${lesson.title} 第 ${i + 1} 步`;
      if (st.pieces) model = g.model(st.pieces);
      const selName = st.sel || (st.practice && st.practice.piece);
      if (!selName) return;
      const sel = g.sqOf(selName);
      const board = kind === 'half' ? model.board : model.board;
      if (!board[sel]) { problems.push(`${where}：${selName} 沒有棋子`); return; }
      const targets = g.targets(kind === 'half' ? model : g.model(st.pieces || lesson.steps.find((x) => x.pieces).pieces), sel);
      if (st.legal && !targets.length) problems.push(`${where}：沒有任何可走位置`);
      for (const b of st.bad || []) {
        const to = g.sqOf(b);
        if (targets.includes(to)) problems.push(`${where}：${b} 其實可以走`);
        else if (!g.why(model, sel, to)) problems.push(`${where}：${b} 沒有錯誤原因`);
      }
      if (st.practice) {
        if (!targets.length) problems.push(`${where}：練習沒有可走位置`);
        if (st.practice.goal && !targets.includes(g.sqOf(st.practice.goal))) problems.push(`${where}：練習答案 ${st.practice.goal} 不合法`);
      }
    });
  }
  return problems;
}

test('整盤說明：每一步示範都正確', () => { assert.deepEqual(check('full', FULL_LESSONS), []); });
test('半盤說明：每一步示範都正確', () => { assert.deepEqual(check('half', HALF_LESSONS), []); });
