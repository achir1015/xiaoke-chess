// AI 搜尋在背景執行緒，避免卡住 3D 畫面
import { Engine } from './engine.js';
import { iccsToMove, moveToIccs } from './xiangqi.js';

const engine = new Engine();

self.onmessage = (e) => {
  const { id, cmd, fen, opts = {} } = e.data || {};
  try {
    if (cmd === 'search') {
      const o = {
        ...opts,
        exclude: (opts.exclude || []).map(iccsToMove),
        only: (opts.only || []).map(iccsToMove),
      };
      const r = engine.search(fen, o);
      self.postMessage({ id, ok: true, r: { best: r.best ? moveToIccs(r.best) : '', score: r.score, depth: r.depth, nodes: r.nodes, pv: (r.pv || []).map(moveToIccs) } });
    } else if (cmd === 'analyze') {
      // 多重主變（給軍師）：依序排除前一個最佳著法
      const n = opts.lines || 3;
      const each = Math.max(200, Math.floor((opts.timeMs || 1500) / n));
      const out = [];
      const exclude = [];
      for (let i = 0; i < n; i++) {
        const r = engine.search(fen, { timeMs: i === 0 ? each * 1.5 : each, exclude, analyze: true, historyHashes: opts.historyHashes });
        if (!r.best) break;
        out.push({ best: moveToIccs(r.best), score: r.score, depth: r.depth, pv: r.pv.map(moveToIccs) });
        exclude.push(r.best);
      }
      self.postMessage({ id, ok: true, r: out });
    } else if (cmd === 'clear') {
      engine.clearTT();
      self.postMessage({ id, ok: true, r: true });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, e: String(err && err.message || err) });
  }
};
