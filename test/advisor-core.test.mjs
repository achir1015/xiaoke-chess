import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { SYSTEM, FALLBACK_MODELS, buildParams } from '../src/renderer/js/advisor-core.js';
const require = createRequire(import.meta.url);
const desk = require('../src/main/advisor.js');

test('手機版與桌面版 AI 軍師提示詞一致', () => {
  assert.equal(SYSTEM, desk.SYSTEM);
  assert.deepEqual([...FALLBACK_MODELS], [...desk.FALLBACK_MODELS]);
});
test('請求參數：預設 Opus 5.5、effort、備援', () => {
  const p = buildParams({}, [{ role: 'user', content: 'hi' }], 4000);
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.output_config.effort, 'low');
  assert.equal(p.fallbacks, 'default');
  assert.ok(!('fallbacks' in buildParams({ model: 'claude-haiku-5-5' }, [], 10)));
});
