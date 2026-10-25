// AI 軍師小視窗：本機引擎分析＋（有金鑰時）Claude 白話解說
import { $, h, toast, uid } from './util.js';
import { Game, Position, iccsToMove, moveToChinese, boardText, RED, BLACK } from './xiangqi.js';
import { scoreText, isMateScore } from './engine.js';

const QUICK = [
  ['現在該怎麼走？', '現在輪到我，該怎麼走比較好？'],
  ['分析局勢', '請分析目前的局勢，雙方各有什麼優缺點？'],
  ['對方想幹嘛？', '對方上一步的意圖是什麼？我要注意哪些威脅？'],
  ['教我開局', '目前是什麼開局？接下來的佈局重點是什麼？'],
];

export class AdvisorPanel {
  // ctx(): { game, mySide, analyze(fen, hashes, ms) → Promise<lines>, showHint(iccs) }
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.history = []; // Claude 對話（role/content）
    this.busy = null;
    this.hasKey = false;
    this.build();
    xk.advisor.onDelta((d) => { if (this.busy && d.id === this.busy.id) { this.busy.text += d.text; this.busy.el.textContent = this.busy.text; this.scroll(); } });
    xk.advisor.onDone((d) => this.onDone(d));
  }

  setHasKey(v) {
    this.hasKey = v;
    this.modeEl.textContent = v ? '🟢 Claude 軍師（線上）' : '⚪ 離線軍師（本機引擎）';
    this.modeEl.title = v ? '使用 Claude 以白話解說引擎分析' : '尚未設定 Anthropic API 金鑰，只提供引擎建議。可到「設定」輸入金鑰。';
  }

  build() {
    this.modeEl = h('div', { class: 'adv-mode' });
    this.log = h('div', { class: 'adv-log' });
    this.input = h('textarea', { class: 'adv-input', rows: 2, placeholder: '問軍師，例如：我的馬要怎麼出來？（Enter 送出）', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } } });
    this.btnSend = h('button', { class: 'primary', onclick: () => this.send() }, '請教');
    this.root.append(
      h('div', { class: 'adv-head' }, h('span', { class: 'adv-avatar' }, '🧙'), h('div', {}, h('b', {}, '小柯軍師'), this.modeEl)),
      this.log,
      h('div', { class: 'adv-quick' }, QUICK.map(([label, q]) => h('button', { class: 'chip', onclick: () => this.send(q) }, label))),
      h('div', { class: 'adv-send' }, this.input, this.btnSend),
    );
    this.say('ai', '您好！我是小柯軍師。對局中有任何疑問都可以問我，我會先請電腦算一遍，再告訴您建議的著法和理由。');
  }

  reset() {
    this.history = [];
    this.log.innerHTML = '';
    this.say('ai', '新的一局開始了，需要建議隨時叫我！');
  }

  say(who, text) {
    const el = h('div', { class: 'adv-msg ' + who }, text);
    this.log.append(el);
    this.scroll();
    return el;
  }

  scroll() { this.log.scrollTop = this.log.scrollHeight; }

  // 把引擎主變換成中文記譜
  pvToChinese(fen, pv, n = 6) {
    const p = new Position(fen);
    const out = [];
    for (const ic of pv.slice(0, n)) {
      const m = iccsToMove(ic);
      if (!m || !p.legalMoves().includes(m)) break;
      out.push(moveToChinese(p, m));
      p.makeMove(m);
    }
    return out;
  }

  async buildContext() {
    const { game, mySide } = this.ctx();
    const pos = game.pos;
    const fen = pos.fen();
    const meName = mySide === RED ? '紅' : '黑';
    const toMove = pos.side;
    const lines = await this.ctx().analyze(fen, game.hashes, 1600);
    const sign = toMove === mySide ? 1 : -1;
    const moves = [];
    for (let i = 0; i < game.notes.length; i += 2) moves.push(`${i / 2 + 1}. ${game.notes[i]}${game.notes[i + 1] ? ' ' + game.notes[i + 1] : ''}`);
    const ana = lines.map((l, i) => {
      const zh = this.pvToChinese(fen, l.pv);
      const sc = sign * l.score;
      return `${i + 1}. ${zh[0] || l.best}（評分 ${scoreText(sc)}，搜尋深度 ${l.depth}）主要變化：${zh.join(' ')}`;
    });
    const text = [
      '【局面資訊】',
      `您執${meName}。現在輪到${toMove === RED ? '紅' : '黑'}方走${toMove === mySide ? '（輪到您）' : '（對方思考中）'}。`,
      `已走 ${game.notes.length} 步：${moves.length ? moves.join(' ') : '（尚未開始）'}`,
      `FEN：${fen}`,
      '文字棋盤（上方為黑方，下方為紅方）：',
      boardText(pos),
      `引擎分析（${toMove === mySide ? '您的候選著法' : '對方可能的著法'}，評分以您為準）：`,
      ...(ana.length ? ana : ['（對局已結束或無合法著法）']),
    ].join('\n');
    return { text, lines, fen, mine: toMove === mySide, sign };
  }

  async send(q) {
    const question = (q || this.input.value).trim();
    if (!question || this.busy) return;
    this.input.value = '';
    this.say('me', question);
    const pending = this.say('ai thinking', '軍師正在計算局面…');
    let c;
    try { c = await this.buildContext(); } catch (e) { pending.textContent = '分析失敗：' + e.message; pending.classList.remove('thinking'); return; }
    // 建議著法標在棋盤上
    if (c.mine && c.lines[0]) this.ctx().showHint(c.lines[0].best);
    if (!this.hasKey) {
      pending.classList.remove('thinking');
      pending.textContent = this.offlineAnswer(c);
      this.scroll();
      return;
    }
    pending.textContent = '';
    pending.classList.add('streaming');
    const id = uid();
    this.busy = { id, el: pending, text: '', question };
    this.btnSend.textContent = '停止';
    this.btnSend.onclick = () => xk.advisor.cancel(id);
    const userMsg = { role: 'user', content: `${c.text}\n\n【我的問題】${question}` };
    const msgs = [...this.history.slice(-12), userMsg];
    this.busy.userMsg = userMsg;
    this.busy.offline = this.offlineAnswer(c);
    xk.advisor.ask(id, { messages: msgs });
  }

  onDone(d) {
    const b = this.busy;
    if (!b || d.id !== b.id) return;
    this.busy = null;
    this.btnSend.textContent = '請教';
    this.btnSend.onclick = () => this.send();
    b.el.classList.remove('thinking', 'streaming');
    if (d.error) {
      if (d.error === 'cancelled') { b.el.textContent = (b.text || '') + '（已停止）'; return; }
      if (d.error === 'nokey') { this.setHasKey(false); b.el.textContent = b.offline; return; }
      b.el.textContent = `${b.offline}\n\n⚠ ${d.error}`;
      return;
    }
    const text = d.text || b.text;
    b.el.textContent = text + (d.truncated ? '…' : '');
    this.history.push(b.userMsg, { role: 'assistant', content: text });
    this.scroll();
  }

  offlineAnswer(c) {
    if (!c.lines.length) return '這盤棋已經結束了，可以到「棋譜庫」重播檢討喔。';
    const best = c.lines[0];
    const zh = this.pvToChinese(c.fen, best.pv, 5);
    const sc = c.sign * best.score;
    const judge = isMateScore(sc) ? (sc > 0 ? '您已經有殺棋了！' : '情況危急，要小心對方的殺著。')
      : sc > 150 ? '您目前明顯占優。' : sc > 40 ? '您稍微占優。' : sc < -150 ? '您目前明顯落後，要穩住防守。' : sc < -40 ? '您稍微落後。' : '雙方大致均勢。';
    const alts = c.lines.slice(1).map((l) => `${this.pvToChinese(c.fen, l.pv, 1)[0]}（${scoreText(c.sign * l.score)}）`).join('、');
    if (c.mine) {
      return `建議走「${zh[0]}」（評分 ${scoreText(sc)}）。${judge}\n預想變化：${zh.join(' → ')}${alts ? `\n其他可考慮：${alts}` : ''}\n（棋盤上綠色箭頭就是建議著法）`;
    }
    return `現在是對方走。電腦預測對方最可能走「${zh[0]}」，${judge}\n預想變化：${zh.join(' → ')}\n請先想好對方這步之後的應對。`;
  }
}
