// 小柯機器人象棋遊戲：主控流程
import { $, $$, h, toast, modal, sleep, errMsg, fmtDate, uid } from './util.js';
import { Game, Position, RED, BLACK, K, typeOf, colorOf, pieceName, moveFrom, moveTo, moveToIccs, iccsToMove, parseMove, moveToChinese, replayRecord, parseTextRecord, START_FEN } from './xiangqi.js';
import { LEVELS, scoreText } from './engine.js';
import { OpeningBook, buildLearned, consultBooks } from './book.js';
import { Board3D } from './board3d.js';
import { GameLink, PROTOCOL } from './net.js';
import { MusicPlayer } from './music.js';
import { AdvisorPanel } from './advisor-ui.js';
import { sfx, setSfx } from './sfx.js';

const SIDE_NAME = ['紅方', '黑方'];

// ---------------- 引擎（背景執行緒） ----------------
class EngineClient {
  constructor() {
    this.w = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
    this.seq = 0;
    this.pending = new Map();
    this.w.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data.r) : p.reject(new Error(e.data.e));
    };
    this.w.onerror = (e) => console.error('engine worker', e);
  }
  req(cmd, fen, opts) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.w.postMessage({ id, cmd, fen, opts }); });
  }
  search(fen, opts) { return this.req('search', fen, opts); }
  analyze(fen, opts) { return this.req('analyze', fen, opts); }
}

const S = {
  settings: null,
  screen: 'home',
  mode: null,          // ai | net | replay
  game: null,
  mySide: RED,
  selected: -1,
  aiThinking: false,
  animating: false,
  gameId: '',
  saved: false,
  names: ['', ''],
  link: null,
  netStatus: '',
  hostSide: 'random',
  opponentVer: 0,
  replay: null,       // { rec, game, ply }
  clocks: [0, 0],
  clockSide: RED,
  clockStart: 0,
  voice: { call: null, mic: null },
  levelIdx: 2,
  opening: null,
  learned: null,
  lastHintTimer: 0,
};

let board, music, advisor, engineAI, engineAna;

// ---------------- 啟動 ----------------
async function init() {
  S.settings = await xk.settings.get();
  setSfx(S.settings.sfx);
  S.levelIdx = S.settings.level ?? 2;
  engineAI = new EngineClient();
  engineAna = new EngineClient();
  S.opening = new OpeningBook();
  await rebuildLearned();

  board = new Board3D($('#board'), { onSquareClick: onSquareClick });
  board.setPosition(new Position().board);
  board.setView(S.settings.view || 'tilt');

  music = new MusicPlayer($('#musicPanel'), S.settings, (patch) => saveSettings(patch));
  await music.load();
  if (S.settings.music.autoplay && S.settings.music.enabled !== false) {
    // 瀏覽器政策：需要使用者操作後才能自動播放
    const start = () => { music.play(); document.removeEventListener('pointerdown', start); };
    document.addEventListener('pointerdown', start);
  }
  music.renderState();

  advisor = new AdvisorPanel($('#advisorPanel'), () => ({
    game: S.mode === 'replay' ? S.replay.game : S.game,
    mySide: S.mySide,
    analyze: (fen, hashes, ms) => engineAna.analyze(fen, { lines: 3, timeMs: ms, historyHashes: hashes }),
    showHint: (iccs) => showHint(iccs),
  }));
  advisor.setHasKey(S.settings.advisor.hasKey);

  bindUI();
  renderHome();
  showScreen('home');
  setInterval(tickClock, 500);
  document.addEventListener('pointerdown', () => sfx.resume(), { once: true });
  window.__xkc = S; // 方便自動化測試
  window.__xkcBoard = board;
}

async function saveSettings(patch) {
  S.settings = await xk.settings.set(patch);
  return S.settings;
}

async function rebuildLearned() {
  const all = await xk.games.all();
  S.learned = buildLearned(all);
  renderLearnStat();
}

function renderLearnStat() {
  const t = `AI 參考棋譜：已收錄 ${S.learned.games} 局、${S.learned.positions} 個局面`;
  $$('.learn-stat').forEach((el) => { el.textContent = t; });
}

// ---------------- 畫面切換 ----------------
function showScreen(name) {
  S.screen = name;
  $$('.screen').forEach((el) => el.classList.toggle('on', el.id === 'scr-' + name));
  if (name === 'game') setTimeout(() => board.resize(), 30);
  if (name === 'records') renderRecords();
}

function bindUI() {
  $('#btnHome').onclick = () => leaveGame();
  $('#viewTilt').onclick = () => setView('tilt');
  $('#viewTop').onclick = () => setView('top');
  $('#viewLow').onclick = () => setView('low');
  $('#btnFlip').onclick = () => { board.setOrientation(board.orientation ^ 1); };
  $('#btnUndo').onclick = () => requestUndo();
  $('#btnDraw').onclick = () => offerDraw();
  $('#btnResign').onclick = () => resign();
  $('#btnHint').onclick = () => hint();
  $('#btnNew').onclick = () => newGameSameMode();
  $('#btnExport').onclick = () => exportCurrent();
  $('#miniMusic').onclick = () => { selectTab('music'); music.toggle(); };
  $$('.tab').forEach((t) => { t.onclick = () => selectTab(t.dataset.tab); });
  $('#chatSend').onclick = () => sendChat();
  $('#chatInput').onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };
  $('#btnVoice').onclick = () => toggleVoice();
  $('#btnMute').onclick = () => toggleMute();
  $('#rpFirst').onclick = () => replayGo(0);
  $('#rpPrev').onclick = () => replayGo(S.replay.ply - 1);
  $('#rpNext').onclick = () => replayGo(S.replay.ply + 1);
  $('#rpLast').onclick = () => replayGo(S.replay.game.moves.length);
  $('#rpPlay').onclick = () => replayAuto();
  $('#rpExport').onclick = () => exportCurrent();
  document.addEventListener('keydown', (e) => {
    if (S.mode !== 'replay' || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') replayGo(S.replay.ply - 1);
    if (e.key === 'ArrowRight') replayGo(S.replay.ply + 1);
  });
}

function selectTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  $$('.tabpane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + name));
}

function setView(v) {
  board.setView(v);
  $$('.viewbtn').forEach((b) => b.classList.toggle('on', b.id === 'view' + v[0].toUpperCase() + v.slice(1)));
  saveSettings({ view: v });
}

// ---------------- 首頁 ----------------
function renderHome() {
  const home = $('#homeBody');
  home.innerHTML = '';
  const nameInput = h('input', { class: 'name-in', value: S.settings.playerName, maxLength: 16, onchange: (e) => saveSettings({ playerName: e.target.value.trim() || '棋友' }) });
  // A：與 AI 對賽
  const sideSel = h('div', { class: 'seg' },
    ...[['red', '執紅先走'], ['black', '執黑後走'], ['random', '隨機']].map(([v, l]) => h('button', { class: 'segbtn', 'data-v': v, onclick: (e) => { $$('.segbtn', sideSel).forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); sideSel.dataset.v = v; } }, l)));
  sideSel.dataset.v = ['red', 'black', 'random'].includes(S.settings.aiSide) ? S.settings.aiSide : 'red';
  $$('.segbtn', sideSel).forEach((b) => b.classList.toggle('on', b.dataset.v === sideSel.dataset.v));
  const lvSel = h('select', { class: 'lv', onchange: (e) => { S.levelIdx = Number(e.target.value); saveSettings({ level: S.levelIdx }); } },
    LEVELS.map((l, i) => h('option', { value: i, selected: i === S.levelIdx }, `${l.name}`)));
  const cardAI = h('div', { class: 'card mode-card' },
    h('div', { class: 'card-icon' }, '🤖'),
    h('h2', {}, 'A　與 AI 對賽'),
    h('p', { class: 'muted' }, '不需要網路連線，電腦會參考您過去的對局棋譜越下越聰明。'),
    h('label', {}, '我方：'), sideSel,
    h('label', {}, '難度：'), lvSel,
    h('p', { class: 'learn-stat small muted' }),
    h('button', { class: 'primary big', id: 'startAI', onclick: () => startAIGame(sideSel.dataset.v) }, '開始對局'));
  // B：與真人對賽
  const hostSideSel = h('select', { class: 'lv', id: 'hostSide' },
    h('option', { value: 'random' }, '隨機分配紅黑'), h('option', { value: 'red' }, '我執紅（先走）'), h('option', { value: 'black' }, '我執黑（後走）'));
  const codeIn = h('input', { class: 'code-in', id: 'joinCode', placeholder: '輸入 6 位數房號', maxLength: 7, inputMode: 'numeric' });
  const cardNet = h('div', { class: 'card mode-card' },
    h('div', { class: 'card-icon' }, '🌐'),
    h('h2', {}, 'B　與真人對賽'),
    h('p', { class: 'muted' }, '透過網路遠端連線，輪流下棋、可以語音聊天，雙方各自聽自己的背景音樂。'),
    h('div', { class: 'net-row' }, hostSideSel, h('button', { class: 'primary', id: 'btnHost', onclick: () => hostRoom(hostSideSel.value) }, '建立房間')),
    h('div', { class: 'net-or' }, '或'),
    h('div', { class: 'net-row' }, codeIn, h('button', { class: 'primary', id: 'btnJoin', onclick: () => joinRoom(codeIn.value) }, '加入房間')),
    h('div', { id: 'netWait', class: 'net-wait hidden' }));
  const cardHalf = h('div', { class: 'card mode-card disabled' },
    h('div', { class: 'card-icon' }, '🀄'),
    h('h2', {}, '半盤象棋'),
    h('p', { class: 'muted' }, '即將推出，敬請期待。'));
  home.append(
    h('div', { class: 'home-hero' },
      h('div', { class: 'hero-piece' }, '帥'),
      h('div', {}, h('h1', {}, '小柯機器人象棋遊戲'), h('p', { class: 'muted' }, '3D 中國象棋．整盤對弈')),
      h('div', { class: 'hero-name' }, h('label', {}, '我的暱稱'), nameInput)),
    h('div', { class: 'mode-grid' }, cardAI, cardNet, cardHalf),
    h('div', { class: 'home-links' },
      h('button', { onclick: () => showScreen('records') }, '📜 棋譜庫'),
      h('button', { onclick: () => openSettings() }, '⚙ 設定'),
      h('button', { onclick: () => { selectTab('music'); showScreen('game'); enterIdleBoard(); } }, '♫ 背景音樂')),
  );
  renderLearnStat();
}

function enterIdleBoard() {
  if (S.mode && S.mode !== 'idle') return;
  S.game = new Game();
  S.mode = 'idle';
  S.names = ['紅方', '黑方'];
  S.clocks = [0, 0];
  board.setPosition(S.game.pos.board);
  board.setLastMove(-1, -1); board.setCheck(-1); board.setHint(-1); board.setSelected(-1); board.setTargets([]);
  board.setInteractive(false);
  updateGameUI();
}

// ---------------- 對局共用 ----------------
function setupGame(mode, mySide, names, startFen = START_FEN) {
  S.mode = mode;
  S.game = new Game(startFen);
  S.mySide = mySide;
  S.names = names;
  S.selected = -1;
  S.aiThinking = false;
  S.animating = false;
  S.saved = false;
  S.gameId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + uid().slice(-6);
  S.clocks = [0, 0]; S.clockSide = S.game.side; S.clockStart = Date.now();
  board.setOrientation(mySide);
  board.setPosition(S.game.pos.board);
  board.setLastMove(-1, -1); board.setCheck(-1); board.setHint(-1); board.setSelected(-1); board.setTargets([]);
  advisor.reset();
  document.body.classList.toggle('mode-net', mode === 'net');
  document.body.classList.toggle('mode-ai', mode === 'ai');
  document.body.classList.toggle('mode-replay', mode === 'replay');
  $('#chatLog').innerHTML = '';
  showScreen('game');
  selectTab(mode === 'net' ? 'chat' : 'advisor');
  updateGameUI();
}

function canMove() {
  const g = S.game;
  if (!g || g.result || S.animating) return false;
  if (S.mode === 'ai') return !S.aiThinking && g.side === S.mySide;
  if (S.mode === 'net') return !!(S.link && S.link.connected) && g.side === S.mySide && S.netStarted;
  return false;
}

function onSquareClick(sq) {
  if (S.mode === 'replay' || S.mode === 'idle' || !S.game) return;
  const g = S.game;
  if (!canMove()) {
    if (!g.result && g.side !== S.mySide) { flashBanner(); sfx.illegal(); }
    return;
  }
  const p = g.pos.board[sq];
  if (p && colorOf(p) === S.mySide) {
    S.selected = sq;
    board.setSelected(sq);
    const targets = g.legalMoves().filter((m) => moveFrom(m) === sq).map(moveTo);
    board.setTargets(targets, g.pos.board);
    sfx.select();
    return;
  }
  if (S.selected >= 0) {
    const m = g.legalMoves().find((mv) => moveFrom(mv) === S.selected && moveTo(mv) === sq);
    if (m) { localMove(m); return; }
    sfx.illegal();
  }
}

async function localMove(m) {
  if (S.mode === 'net') S.link.send({ t: 'move', ply: S.game.moves.length, mv: moveToIccs(m) });
  await applyMove(m);
  if (S.mode === 'ai' && !S.game.result) aiMove();
}

async function applyMove(m, { animate = true } = {}) {
  const g = S.game;
  S.selected = -1;
  board.setSelected(-1);
  board.setTargets([]);
  board.setHint(-1);
  const mover = g.side;
  const before = g.pos.board[moveTo(m)];
  // 計時
  S.clocks[mover] += Date.now() - S.clockStart;
  S.clockStart = Date.now();
  const res = g.play(m);
  S.clockSide = g.side;
  S.animating = true;
  updateGameUI();
  const ply = g.moves.length;
  if (animate) await board.animateMove(moveFrom(m), moveTo(m));
  else board.setPosition(g.pos.board);
  S.animating = false;
  if (S.game !== g || g.moves.length !== ply) { updateGameUI(); return; } // 動畫期間已悔棋或離開
  board.setLastMove(moveFrom(m), moveTo(m));
  if (before) sfx.capture(); else sfx.move();
  if (res.check && !g.result) {
    board.setCheck(g.pos.kingSq[g.side]);
    sfx.check();
    popText(g.side === S.mySide ? '將軍！小心' : '將軍！', 'check');
  } else board.setCheck(-1);
  updateGameUI();
  if (g.result) await onGameOver();
  else if (S.mode === 'net' && g.side === S.mySide) {
    sfx.turn();
    xk.win.attention('輪到您下棋', `對方走了 ${res.note}`);
  }
}

function updateGameUI() {
  const g = S.game;
  if (!g) return;
  // 玩家卡片
  for (const side of [RED, BLACK]) {
    const card = $(side === RED ? '#pRed' : '#pBlack');
    card.querySelector('.pname').textContent = S.names[side] || SIDE_NAME[side];
    card.querySelector('.ptag').textContent = side === S.mySide && S.mode !== 'replay' ? '（我）' : '';
    card.classList.toggle('active', !g.result && g.side === side && S.mode !== 'replay');
    // 這一方吃掉的對方棋子
    const caps = card.querySelector('.pcaps');
    caps.innerHTML = '';
    for (const c of g.caps) if (c && colorOf(c) !== side) caps.append(h('span', { class: 'pcap ' + (colorOf(c) === RED ? 'r' : 'b') }, pieceName(c)));
  }
  // 著法列表
  const list = $('#moveList');
  list.innerHTML = '';
  const notes = S.mode === 'replay' ? S.replay.game.notes : g.notes;
  for (let i = 0; i < notes.length; i += 2) {
    const cur = S.mode === 'replay' ? S.replay.ply : notes.length;
    list.append(h('div', { class: 'mv-row' },
      h('span', { class: 'mv-no' }, `${i / 2 + 1}.`),
      h('span', { class: 'mv red' + (cur === i + 1 ? ' cur' : ''), onclick: () => S.mode === 'replay' && replayGo(i + 1) }, notes[i]),
      h('span', { class: 'mv black' + (cur === i + 2 ? ' cur' : ''), onclick: () => S.mode === 'replay' && replayGo(i + 2) }, notes[i + 1] || '')));
  }
  list.scrollTop = list.scrollHeight;
  const opening = S.opening.nameOf(S.mode === 'replay' ? S.replay.game : g);
  $('#openingName').textContent = opening ? '開局：' + opening : '';
  // 輪次提示
  const banner = $('#turnBanner');
  let text = '', cls = '';
  if (S.mode === 'replay') { text = `棋譜重播　第 ${S.replay.ply} / ${S.replay.game.moves.length} 步`; cls = 'replay'; }
  else if (S.mode === 'idle') { text = '請回首頁選擇對局模式'; cls = 'watch'; }
  else if (g.result) { text = resultText(g.result); cls = 'over'; }
  else if (S.mode === 'net' && !(S.link && S.link.connected)) { text = S.netStatus || '等待對手連線…'; cls = 'watch'; }
  else if (S.mode === 'net' && !S.netStarted) { text = '對手已連線，準備開局…'; cls = 'watch'; }
  else if (g.side === S.mySide) { text = '輪到您下棋'; cls = 'mine'; }
  else { text = S.mode === 'ai' ? '換您觀棋（AI 思考中…）' : '換您觀棋（對方思考中）'; cls = 'watch'; }
  banner.textContent = text;
  banner.className = 'turn-banner ' + cls;
  board.setInteractive(canMove());
  // 按鈕狀態
  const playing = (S.mode === 'ai' || S.mode === 'net') && !g.result;
  $('#btnUndo').disabled = !playing || g.moves.length === 0 || S.animating || (S.mode === 'ai' && S.aiThinking);
  $('#btnDraw').disabled = !playing || S.mode !== 'net';
  $('#btnResign').disabled = !playing;
  $('#btnHint').disabled = !playing || g.side !== S.mySide;
  $('#btnNew').textContent = S.mode === 'net' ? '再來一局' : '新局';
  $('#btnNew').disabled = S.mode === 'replay' || S.mode === 'idle' || (S.mode === 'net' && !g.result);
  $('#btnExport').disabled = !(S.mode === 'replay' ? S.replay.game.moves.length : g.moves.length);
  renderClocks();
}

function renderClocks() {
  for (const side of [RED, BLACK]) {
    let ms = S.clocks[side];
    if (S.game && !S.game.result && S.clockSide === side && (S.mode === 'ai' || (S.mode === 'net' && S.netStarted))) ms += Date.now() - S.clockStart;
    const s = Math.floor(ms / 1000);
    $(side === RED ? '#pRed' : '#pBlack').querySelector('.pclock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
function tickClock() { if (S.screen === 'game' && S.game) renderClocks(); }

function flashBanner() {
  const b = $('#turnBanner');
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
}

function popText(text, cls = '') {
  const el = h('div', { class: 'pop ' + cls }, text);
  $('#boardWrap').append(el);
  setTimeout(() => el.remove(), 1600);
}

function resultText(r) {
  if (!r) return '';
  if (r.winner == null) return `和棋（${r.reason}）`;
  const me = S.mode === 'replay' ? null : r.winner === S.mySide;
  return `${SIDE_NAME[r.winner]}勝${me == null ? '' : me ? '　🎉 您贏了！' : '　您輸了'}（${r.reason}）`;
}

async function onGameOver() {
  const g = S.game;
  const r = g.result;
  board.setInteractive(false);
  if (r.winner === S.mySide) sfx.win(); else if (r.winner != null) sfx.lose(); else sfx.move();
  await saveGame();
  updateGameUI();
  if (S.mode === 'net' && S.voice.call) { /* 語音保持 */ }
  const btns = S.mode === 'ai' ? [{ label: '檢視棋盤', value: 'stay' }, { label: '再下一局', value: 'again', primary: true }]
    : [{ label: '知道了', value: 'stay', primary: true }];
  const v = await modal(r.winner == null ? '和棋' : r.winner === S.mySide ? '恭喜獲勝！' : '這局輸了', h('div', {},
    h('p', {}, resultText(r)),
    h('p', { class: 'muted small' }, '本局棋譜已自動存入棋譜庫，AI 會參考這局的著法。')), btns);
  if (v === 'again') newGameSameMode();
}

async function saveGame() {
  if (S.saved || !S.game || !S.game.moves.length) return;
  if (S.mode !== 'ai' && S.mode !== 'net') return;
  S.saved = true;
  const rec = S.game.toRecord({
    id: S.gameId,
    mode: S.mode,
    red: S.names[RED], black: S.names[BLACK],
    mySide: S.mySide === RED ? 'red' : 'black',
    level: S.mode === 'ai' ? LEVELS[S.levelIdx].name : '',
    opening: S.opening.nameOf(S.game),
  });
  try {
    await xk.games.save(rec);
    if (S.settings.learnFromGames !== false && rec.result !== '*') { S.learned.addRecord(rec); renderLearnStat(); }
  } catch (e) { toast('棋譜儲存失敗：' + errMsg(e), 'err'); }
}

// 中途離開：未完成的對局也存檔（結果 *，不列入 AI 學習）
async function saveUnfinished() {
  if (S.saved || !S.game || S.game.result || S.game.moves.length < 2) return;
  if (S.mode !== 'ai' && S.mode !== 'net') return;
  S.saved = true;
  const rec = S.game.toRecord({ id: S.gameId, mode: S.mode, red: S.names[RED], black: S.names[BLACK], mySide: S.mySide === RED ? 'red' : 'black', opening: S.opening.nameOf(S.game), reason: '未完成' });
  try { await xk.games.save(rec); } catch {}
}

async function leaveGame() {
  if ((S.mode === 'ai' || S.mode === 'net') && S.game && !S.game.result && S.game.moves.length) {
    const ok = await modal('離開對局', S.mode === 'net' ? '離開會中斷與對手的連線，確定要離開嗎？' : '這局還沒下完，確定要離開嗎？（棋譜會保留）', [{ label: '繼續下棋', value: false }, { label: '離開', value: true, primary: true }]);
    if (!ok) return;
  }
  await saveUnfinished();
  closeNet();
  S.mode = null;
  S.game = null;
  stopReplayAuto();
  document.body.classList.remove('mode-net', 'mode-ai', 'mode-replay');
  renderHome();
  showScreen('home');
}

function newGameSameMode() {
  if (S.mode === 'ai') startAIGame(S.lastAISide || 'red');
  else if (S.mode === 'net') requestRematch();
}

// ---------------- 與 AI 對賽 ----------------
function startAIGame(sideChoice) {
  S.lastAISide = sideChoice;
  let side = sideChoice === 'black' ? BLACK : sideChoice === 'red' ? RED : (Math.random() < 0.5 ? RED : BLACK);
  saveSettings({ aiSide: sideChoice });
  const aiName = `小柯 AI（${LEVELS[S.levelIdx].name}）`;
  const me = S.settings.playerName || '我';
  setupGame('ai', side, side === RED ? [me, aiName] : [aiName, me]);
  if (side === BLACK) setTimeout(() => aiMove(), 600);
}

async function aiMove() {
  const g = S.game;
  if (!g || g.result || S.mode !== 'ai') return;
  S.aiThinking = true;
  updateGameUI();
  const t0 = Date.now();
  const myGame = g;
  const level = LEVELS[S.levelIdx];
  let move = 0, source = '';
  try {
    const learned = S.settings.learnFromGames !== false ? S.learned : null;
    const c = consultBooks(g.pos, g.moves.length, S.opening, learned);
    if (c.book && S.levelIdx >= 1) { move = c.book.move; source = '開局庫'; }
    else {
      const hashes = g.hashes.slice(0, -1);
      const r = await engineAI.search(g.pos.fen(), { timeMs: level.timeMs, maxDepth: level.maxDepth, noise: level.noise, historyHashes: hashes });
      move = iccsToMove(r.best);
      let bestScore = r.score;
      // 學習棋譜：曾經贏過的著法，若電腦算起來也不差就採用
      if (learned && S.levelIdx >= 1) {
        const good = c.good.filter((x) => x.move !== move).slice(0, 2);
        for (const x of good) {
          const v = await engineAI.search(g.pos.fen(), { timeMs: Math.max(250, level.timeMs * 0.3), only: [x.iccs], historyHashes: hashes, analyze: true });
          if (v.score >= bestScore - 50) { move = x.move; bestScore = v.score; source = `參考棋譜（${x.w} 勝 ${x.d} 和 ${x.l} 負）`; break; }
        }
        // 曾經輸過的著法盡量避開
        if (!source && c.bad.includes(move)) {
          const alt = await engineAI.search(g.pos.fen(), { timeMs: Math.max(300, level.timeMs * 0.5), exclude: c.bad.map(moveToIccs), historyHashes: hashes });
          if (alt.best && alt.score >= bestScore - 80) { move = iccsToMove(alt.best); source = '避開曾輸棋的著法'; }
        }
      }
      if (!source) source = `搜尋 ${r.depth} 層，AI 自評 ${scoreText(bestScore)}`;
    }
  } catch (e) {
    console.error(e);
    const legal = g.legalMoves();
    move = legal[0];
    source = '備用著法';
  }
  const wait = 450 - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  if (S.game !== myGame || S.mode !== 'ai') return; // 已離開或重開
  S.aiThinking = false;
  $('#aiInfo').textContent = 'AI：' + source;
  if (move && g.legalMoves().includes(move)) await applyMove(move);
  else updateGameUI();
}

// ---------------- 悔棋、和棋、認輸、提示 ----------------
async function requestUndo() {
  const g = S.game;
  if (!g || g.result || !g.moves.length) return;
  if (S.animating) return;
  if (S.mode === 'ai') {
    if (S.aiThinking) return;
    const n = g.side === S.mySide ? 2 : 1;
    doUndo(Math.min(n, g.moves.length));
    return;
  }
  if (S.mode === 'net') {
    const n = g.side === S.mySide ? 2 : 1;
    if (n > g.moves.length) return;
    S.link.send({ t: 'undo-req', n, ply: g.moves.length });
    toast('已向對方提出悔棋請求…');
  }
}

function doUndo(n) {
  const g = S.game;
  if (!g) return;
  for (let i = 0; i < n; i++) g.undo();
  board.setPosition(g.pos.board);
  board.setCaptured(g.caps.filter(Boolean));
  const last = g.moves[g.moves.length - 1];
  board.setLastMove(last ? moveFrom(last) : -1, last ? moveTo(last) : -1);
  board.setCheck(g.pos.inCheck() ? g.pos.kingSq[g.side] : -1);
  board.setHint(-1);
  S.clockSide = g.side;
  updateGameUI();
}

async function offerDraw() {
  if (S.mode !== 'net' || !S.game || S.game.result) return;
  S.link.send({ t: 'draw-req' });
  toast('已向對方提出和棋…');
}

async function resign() {
  const g = S.game;
  if (!g || g.result) return;
  const ok = await modal('認輸', '確定要認輸嗎？', [{ label: '取消', value: false }, { label: '認輸', value: true, primary: true }]);
  if (!ok) return;
  if (S.mode === 'net') S.link.send({ t: 'resign', ply: g.moves.length });
  g.resign(S.mySide);
  if (S.mode === 'ai') S.aiThinking = false;
  await onGameOver();
}

async function hint() {
  const g = S.game;
  if (!g || g.result || g.side !== S.mySide) return;
  $('#btnHint').disabled = true;
  try {
    const lines = await engineAna.analyze(g.pos.fen(), { lines: 1, timeMs: 1200, historyHashes: g.hashes });
    if (lines[0] && S.game === g && g.side === S.mySide) {
      showHint(lines[0].best);
      const m = iccsToMove(lines[0].best);
      toast(`提示：${moveToChinese(g.pos, m)}（${scoreText(lines[0].score)}）`, 'ok');
    }
  } finally { updateGameUI(); }
}

function showHint(iccs) {
  const m = iccsToMove(iccs);
  if (!m) return;
  board.setHint(moveFrom(m), moveTo(m));
  clearTimeout(S.lastHintTimer);
  S.lastHintTimer = setTimeout(() => board.setHint(-1), 12000);
}

// ---------------- 與真人對賽（遠端） ----------------
function netWait(html) {
  const w = $('#netWait');
  if (!w) return;
  w.classList.toggle('hidden', !html);
  w.innerHTML = '';
  if (html) w.append(html);
}

async function hostRoom(sideChoice) {
  closeNet();
  S.hostSide = sideChoice;
  netWait(h('span', {}, '正在建立房間…'));
  const link = new GameLink(S.settings);
  S.link = link;
  try {
    const code = await link.host();
    netWait(h('div', {},
      h('div', { class: 'room-code' }, code.replace(/(\d{3})(\d{3})/, '$1 $2')),
      h('div', {}, '請把房號告訴對方，對方在「加入房間」輸入即可。'),
      h('div', { class: 'net-row' },
        h('button', { onclick: () => { navigator.clipboard.writeText(code); toast('已複製房號', 'ok'); } }, '複製房號'),
        h('button', { onclick: () => { closeNet(); netWait(null); } }, '取消')),
      h('div', { class: 'muted small spin' }, '等待對手加入…')));
    bindLink(link);
  } catch (e) {
    netWait(h('span', { class: 'err' }, '建立房間失敗：' + errMsg(e)));
    S.link = null;
  }
}

async function joinRoom(code) {
  closeNet();
  netWait(h('span', {}, '正在連線…'));
  const link = new GameLink(S.settings);
  S.link = link;
  bindLink(link);
  try {
    await link.join(code);
  } catch (e) {
    netWait(h('span', { class: 'err' }, errMsg(e)));
    S.link = null;
    link.close();
  }
}

function bindLink(link) {
  link.on('connected', () => {
    S.netStarted = false;
    link.send({ t: 'hello', name: S.settings.playerName || '棋友', ver: PROTOCOL });
  });
  link.on('msg', (m) => onNetMsg(link, m));
  link.on('lost', (reason) => {
    if (S.link !== link) return;
    S.netStatus = '⚠ ' + reason + '，對局暫停';
    endVoice(false);
    if (S.screen === 'game' && S.mode === 'net') {
      chatSys(reason);
      updateGameUI();
      if (S.game && !S.game.result) toast('與對手的連線中斷了', 'err', 6000);
    } else netWait(h('span', { class: 'err' }, reason));
  });
  link.on('call', (call) => onVoiceCall(call));
}

function startNetGame(hostSide, startFen, gameId, names, moves = []) {
  const mySide = S.link.role === 'host' ? hostSide : hostSide ^ 1;
  setupGame('net', mySide, names, startFen);
  S.gameId = gameId;
  S.netStarted = true;
  S.netStatus = '';
  S.curHostSide = hostSide;
  for (const ic of moves) { const mv = parseMove(S.game.pos, ic); if (mv) S.game.play(mv); }
  if (moves.length) { board.setPosition(S.game.pos.board); board.setCaptured(S.game.caps.filter(Boolean)); }
  netWait(null);
  chatSys(`對局開始！您執${SIDE_NAME[mySide]}${mySide === RED ? '，請先走' : '，紅方先走'}。`);
  updateGameUI();
  if (mySide === S.game.side) sfx.turn();
  xk.win.attention('對局開始', `您執${SIDE_NAME[mySide]}`);
}

async function onNetMsg(link, m) {
  const g = S.game;
  switch (m.t) {
    case 'busy':
      netWait(h('span', { class: 'err' }, '這個房間已經有人在下棋了'));
      link.close(); S.link = null;
      break;
    case 'hello':
      S.oppName = String(m.name || '對手').slice(0, 16);
      S.opponentVer = m.ver;
      if (link.role === 'host') {
        const hostSide = S.hostSide === 'red' ? RED : S.hostSide === 'black' ? BLACK : (Math.random() < 0.5 ? RED : BLACK);
        const me = S.settings.playerName || '棋友';
        const names = hostSide === RED ? [me, S.oppName] : [S.oppName, me];
        const gameId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + uid().slice(-6);
        if (S.mode === 'net' && S.game && !S.game.result && S.netStarted) {
          // 斷線重連：把目前棋局送給對方
          link.send({ t: 'start', hostSide: S.curHostSide, fen: S.game.startFen, gameId: S.gameId, names: S.names, moves: S.game.moves.map(moveToIccs) });
          S.netStatus = '';
          chatSys('對手已重新連線');
          updateGameUI();
        } else {
          link.send({ t: 'start', hostSide, fen: START_FEN, gameId, names });
          startNetGame(hostSide, START_FEN, gameId, names);
        }
      }
      break;
    case 'start':
      if (link.role === 'guest') startNetGame(m.hostSide, m.fen || START_FEN, m.gameId, m.names, m.moves || []);
      break;
    case 'move': {
      if (!g || S.mode !== 'net' || g.result) return;
      if (m.ply !== g.moves.length || g.side === S.mySide) { link.send({ t: 'sync-req' }); return; }
      const mv = iccsToMove(m.mv);
      if (!g.legalMoves().includes(mv)) { link.send({ t: 'sync-req' }); return; }
      await applyMove(mv);
      break;
    }
    case 'sync-req':
      if (g) link.send({ t: 'sync', fen: g.startFen, moves: g.moves.map(moveToIccs) });
      break;
    case 'sync':
      if (g && link.role === 'guest') {
        const ng = new Game(m.fen);
        for (const ic of m.moves) { const mv = parseMove(ng.pos, ic); if (mv) ng.play(mv); }
        S.game = ng;
        board.setPosition(ng.pos.board);
        board.setCaptured(ng.caps.filter(Boolean));
        updateGameUI();
      }
      break;
    case 'undo-req': {
      if (!g || g.result) return;
      const ok = await modal('悔棋請求', `${S.oppName} 想要悔棋（退回 ${m.n} 步），同意嗎？`, [{ label: '不同意', value: false }, { label: '同意', value: true, primary: true }], { timeout: 30000, timeoutValue: false });
      if (ok && S.game === g && g.moves.length === m.ply) { link.send({ t: 'undo-ok', n: m.n }); doUndo(m.n); chatSys(`同意對方悔棋 ${m.n} 步`); }
      else link.send({ t: 'undo-no' });
      break;
    }
    case 'undo-ok': if (g) { doUndo(m.n); toast('對方同意悔棋', 'ok'); chatSys(`悔棋 ${m.n} 步`); } break;
    case 'undo-no': toast('對方不同意悔棋'); break;
    case 'draw-req': {
      if (!g || g.result) return;
      const ok = await modal('和棋提議', `${S.oppName} 提議和棋，同意嗎？`, [{ label: '繼續下', value: false }, { label: '同意和棋', value: true, primary: true }], { timeout: 30000, timeoutValue: false });
      if (ok && !g.result) { link.send({ t: 'draw-ok' }); g.agreeDraw(); await onGameOver(); }
      else link.send({ t: 'draw-no' });
      break;
    }
    case 'draw-ok': if (g && !g.result) { g.agreeDraw(); await onGameOver(); } break;
    case 'draw-no': toast('對方不同意和棋，繼續下棋'); break;
    case 'resign':
      if (g && !g.result) { g.resign(S.mySide ^ 1); await onGameOver(); }
      break;
    case 'rematch-req': {
      const ok = await modal('再來一局', `${S.oppName} 想再下一局（紅黑交換），同意嗎？`, [{ label: '不要', value: false }, { label: '好啊', value: true, primary: true }], { timeout: 45000, timeoutValue: false });
      if (!ok) { link.send({ t: 'rematch-no' }); break; }
      if (link.role === 'host') startRematchAsHost();
      else link.send({ t: 'rematch-ok' });
      break;
    }
    case 'rematch-ok': if (link.role === 'host') startRematchAsHost(); break;
    case 'rematch-no': toast('對方暫時不想再下'); break;
    case 'chat': chatLine('opp', String(m.text || '').slice(0, 500)); if (S.screen === 'game') { $('.tab[data-tab="chat"]').classList.add('ping'); } break;
    case 'voice-end': endVoice(true); break;
    case 'voice-reject': toast('對方沒有接聽語音'); endVoice(false); break;
  }
}

function requestRematch() {
  if (!S.link || !S.link.connected) { toast('對手已離線', 'err'); return; }
  S.link.send({ t: 'rematch-req' });
  toast('已邀請對方再下一局…');
}

async function startRematchAsHost() {
  await saveUnfinished();
  const hostSide = (S.curHostSide ?? RED) ^ 1; // 紅黑交換
  const me = S.settings.playerName || '棋友';
  const names = hostSide === RED ? [me, S.oppName] : [S.oppName, me];
  const gameId = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + uid().slice(-6);
  S.link.send({ t: 'start', hostSide, fen: START_FEN, gameId, names });
  startNetGame(hostSide, START_FEN, gameId, names);
}

function closeNet() {
  endVoice(false, true);
  if (S.link) { S.link.close(); S.link = null; }
  S.netStarted = false;
}

// ---------------- 文字聊天 ----------------
function chatLine(who, text) {
  const log = $('#chatLog');
  log.append(h('div', { class: 'chat-msg ' + who }, h('b', {}, who === 'me' ? '我' : (S.oppName || '對手')), h('span', {}, text)));
  log.scrollTop = log.scrollHeight;
}
function chatSys(text) {
  const log = $('#chatLog');
  log.append(h('div', { class: 'chat-msg sys' }, text));
  log.scrollTop = log.scrollHeight;
}
function sendChat() {
  const inp = $('#chatInput');
  const text = inp.value.trim();
  if (!text || !S.link || !S.link.connected) return;
  S.link.send({ t: 'chat', text });
  chatLine('me', text);
  inp.value = '';
}

// ---------------- 語音通話 ----------------
async function getMic() {
  await xk.sys.askMicrophone();
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
}

function setVoiceUI(state) {
  $('#voiceState').textContent = { off: '語音：未通話', calling: '語音：撥號中…', on: '🟢 語音通話中' }[state];
  $('#btnVoice').textContent = state === 'off' ? '🎤 語音通話' : '⏹ 結束通話';
  $('#btnMute').classList.toggle('hidden', state !== 'on');
  $('#voiceBar').classList.toggle('on', state === 'on');
  music.setDuck(state === 'on');
}

async function toggleVoice() {
  if (S.voice.call || S.voice.mic) { endVoice(false, true); return; }
  if (!S.link || !S.link.connected) { toast('尚未連線到對手', 'err'); return; }
  try {
    S.voice.mic = await getMic();
    setVoiceUI('calling');
    const call = S.link.call(S.voice.mic);
    setupCall(call);
  } catch (e) { toast('無法開啟麥克風：' + errMsg(e), 'err'); endVoice(false); }
}

async function onVoiceCall(call) {
  if (S.voice.call) { call.close(); return; }
  xk.win.attention('語音通話邀請', `${S.oppName || '對手'} 邀請您語音通話`);
  const ok = await modal('語音通話邀請', `${S.oppName || '對手'} 邀請您語音通話，要接聽嗎？`, [{ label: '拒絕', value: false }, { label: '接聽', value: true, primary: true }], { timeout: 45000, timeoutValue: false });
  if (!ok) { call.close(); S.link && S.link.send({ t: 'voice-reject' }); return; }
  try {
    S.voice.mic = await getMic();
    call.answer(S.voice.mic);
    setupCall(call);
  } catch (e) { toast('無法開啟麥克風：' + errMsg(e), 'err'); call.close(); S.link && S.link.send({ t: 'voice-reject' }); }
}

function setupCall(call) {
  S.voice.call = call;
  call.on('stream', (s) => { const a = $('#remoteAudio'); a.srcObject = s; a.play().catch(() => {}); setVoiceUI('on'); chatSys('語音通話已接通'); });
  call.on('close', () => { if (S.voice.call === call) endVoice(false); });
  call.on('error', () => { if (S.voice.call === call) endVoice(false); });
}

function toggleMute() {
  if (!S.voice.mic) return;
  const t = S.voice.mic.getAudioTracks()[0];
  t.enabled = !t.enabled;
  $('#btnMute').textContent = t.enabled ? '🔇 靜音' : '🔈 取消靜音';
}

function endVoice(remote, notify) {
  const had = !!(S.voice.call || S.voice.mic);
  if (notify && S.link) S.link.send({ t: 'voice-end' });
  if (S.voice.call) { try { S.voice.call.close(); } catch {} S.voice.call = null; }
  if (S.voice.mic) { S.voice.mic.getTracks().forEach((t) => t.stop()); S.voice.mic = null; }
  const a = $('#remoteAudio'); if (a) a.srcObject = null;
  if (music) setVoiceUI('off');
  if (had && S.screen === 'game') chatSys(remote ? '對方結束了語音通話' : '語音通話已結束');
}

// ---------------- 棋譜庫 ----------------
async function renderRecords() {
  const body = $('#recordsBody');
  body.innerHTML = '';
  const list = await xk.games.list();
  const head = h('div', { class: 'rec-head' },
    h('div', {}, h('h2', {}, '📜 棋譜庫'), h('p', { class: 'learn-stat muted' })),
    h('div', { class: 'rec-actions' },
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.settings.learnFromGames !== false, onchange: async (e) => { await saveSettings({ learnFromGames: e.target.checked }); toast(e.target.checked ? 'AI 會參考棋譜庫' : 'AI 不再參考棋譜庫'); } }), ' AI 參考棋譜庫'),
      h('button', { onclick: importRecords }, '匯入棋譜'),
      h('button', { onclick: () => showScreen('home') }, '返回首頁')));
  body.append(head);
  if (!list.length) {
    body.append(h('div', { class: 'empty' }, '還沒有棋譜。每下完一局都會自動收錄在這裡，AI 也會從中學習。也可以「匯入棋譜」（支援中文記譜文字檔或本程式匯出的 JSON）。'));
  } else {
    const table = h('table', { class: 'rec-table' },
      h('thead', {}, h('tr', {}, ...['日期', '類型', '紅方', '黑方', '結果', '步數', '開局', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((g) => h('tr', {},
        h('td', {}, fmtDate(g.date)),
        h('td', {}, g.mode === 'ai' ? 'AI 對賽' : g.mode === 'net' ? '真人對賽' : g.source === 'import' ? '匯入' : (g.mode || '')),
        h('td', {}, g.red || ''), h('td', {}, g.black || ''),
        h('td', { class: 'res' }, g.result === '1-0' ? '紅勝' : g.result === '0-1' ? '黑勝' : g.result === '1/2-1/2' ? '和棋' : '未完成'),
        h('td', {}, String(Math.ceil(g.plies / 2))),
        h('td', {}, g.opening || ''),
        h('td', { class: 'ops' },
          h('button', { onclick: () => openReplay(g.id) }, '重播'),
          h('button', { onclick: () => exportRecord(g.id) }, '匯出'),
          h('button', { class: 'danger', onclick: async () => { if (await modal('刪除棋譜', '確定刪除這份棋譜？', [{ label: '取消', value: false }, { label: '刪除', value: true, primary: true }])) { await xk.games.delete(g.id); await rebuildLearned(); renderRecords(); } } }, '刪除'))))));
    body.append(h('div', { class: 'rec-wrap' }, table));
  }
  renderLearnStat();
}

async function importRecords() {
  const files = await xk.games.pickImport();
  if (!files.length) return;
  let ok = 0, bad = 0;
  for (const f of files) {
    if (f.error) { bad++; continue; }
    try {
      let recs = [];
      const t = f.text.trim();
      let j = null;
      if (t.startsWith('{') || t.startsWith('[')) { try { j = JSON.parse(t); } catch { j = null; } }
      if (j) {
        recs = (Array.isArray(j) ? j : [j]).map((r) => ({ ...r, id: undefined }));
      } else {
        const rec = parseTextRecord(t);
        // 從文字標頭讀取對手名稱、結果
        const red = /紅方[:：]\s*(.+)/.exec(t), black = /黑方[:：]\s*(.+)/.exec(t);
        if (red) rec.red = red[1].trim().slice(0, 20);
        if (black) rec.black = black[1].trim().slice(0, 20);
        if (/結果[:：]\s*紅勝/.test(t)) rec.result = '1-0';
        else if (/結果[:：]\s*黑勝/.test(t)) rec.result = '0-1';
        else if (/結果[:：]\s*和/.test(t)) rec.result = '1/2-1/2';
        recs = [rec];
      }
      for (const r of recs) {
        const g = replayRecord(r);
        if (!g.moves.length) { bad++; continue; }
        const rec = g.toRecord({ mode: 'import', source: 'import', red: r.red || f.name, black: r.black || '', opening: S.opening.nameOf(g) });
        if (r.result && rec.result === '*') rec.result = r.result;
        await xk.games.save(rec);
        ok++;
      }
    } catch { bad++; }
  }
  await rebuildLearned();
  toast(`匯入 ${ok} 份棋譜${bad ? `，${bad} 份無法辨識` : ''}`, ok ? 'ok' : 'err');
  renderRecords();
}

function recordText(rec, g) {
  const lines = ['[小柯機器人象棋遊戲 棋譜]', `日期：${fmtDate(rec.date)}`, `紅方：${rec.red || ''}`, `黑方：${rec.black || ''}`,
    `結果：${rec.result === '1-0' ? '紅勝' : rec.result === '0-1' ? '黑勝' : rec.result === '1/2-1/2' ? '和棋' : '未完成'}${rec.reason ? '（' + rec.reason + '）' : ''}`];
  const op = S.opening.nameOf(g);
  if (op) lines.push(`開局：${op}`);
  lines.push('');
  for (let i = 0; i < g.notes.length; i += 2) lines.push(`${i / 2 + 1}. ${g.notes[i]}${g.notes[i + 1] ? '　' + g.notes[i + 1] : ''}`);
  lines.push('', `${rec.result || '*'}`, '', `ICCS：${g.moves.map(moveToIccs).join(' ')}`);
  return lines.join('\r\n');
}

async function exportRecord(id) {
  const rec = await xk.games.get(id);
  if (!rec) return;
  const g = replayRecord(rec);
  const name = `棋譜_${(rec.red || '紅方').replace(/[\\/:*?"<>|]/g, '')}_vs_${(rec.black || '黑方').replace(/[\\/:*?"<>|]/g, '')}_${(rec.id || '').slice(0, 8)}.txt`;
  const p = await xk.games.export(name, recordText(rec, g));
  if (p) toast('已匯出：' + p, 'ok', 5000);
}

async function exportCurrent() {
  if (S.mode === 'replay') return exportRecord(S.replay.rec.id);
  const g = S.game;
  if (!g || !g.moves.length) return;
  const rec = g.toRecord({ red: S.names[RED], black: S.names[BLACK], id: S.gameId });
  const p = await xk.games.export(`棋譜_${S.gameId.slice(0, 8)}.txt`, recordText(rec, g));
  if (p) toast('已匯出：' + p, 'ok', 5000);
}

// ---------------- 棋譜重播 ----------------
async function openReplay(id) {
  const rec = await xk.games.get(id);
  if (!rec) return;
  const full = replayRecord(rec);
  S.replay = { rec, game: full, ply: 0, timer: 0 };
  setupGame('replay', rec.mySide === 'black' ? BLACK : RED, [rec.red || '紅方', rec.black || '黑方'], rec.startFen || START_FEN);
  S.replay.game = full;
  replayGo(0);
  if (full.result) toast(resultText(full.result));
}

function replayGo(ply) {
  const r = S.replay;
  if (!r) return;
  ply = Math.max(0, Math.min(r.game.moves.length, ply));
  const g = new Game(r.rec.startFen || START_FEN);
  for (let i = 0; i < ply; i++) g.play(r.game.moves[i]);
  const forwardOne = ply === r.ply + 1;
  r.ply = ply;
  if (forwardOne && S.game) {
    const m = r.game.moves[ply - 1];
    S.game = g;
    board.animateMove(moveFrom(m), moveTo(m));
    if (g.caps[ply - 1]) sfx.capture(); else sfx.move();
  } else {
    S.game = g;
    board.setPosition(g.pos.board);
    board.setCaptured(g.caps.filter(Boolean));
  }
  const last = g.moves[g.moves.length - 1];
  board.setLastMove(last ? moveFrom(last) : -1, last ? moveTo(last) : -1);
  board.setCheck(g.moves.length && g.checks[g.checks.length - 1] ? g.pos.kingSq[g.side] : -1);
  updateGameUI();
}

function replayAuto() {
  const r = S.replay;
  if (!r) return;
  if (r.timer) { stopReplayAuto(); return; }
  $('#rpPlay').textContent = '⏸';
  r.timer = setInterval(() => {
    if (r.ply >= r.game.moves.length) { stopReplayAuto(); return; }
    replayGo(r.ply + 1);
  }, 1200);
}
function stopReplayAuto() {
  if (S.replay && S.replay.timer) { clearInterval(S.replay.timer); S.replay.timer = 0; }
  const b = $('#rpPlay'); if (b) b.textContent = '▶';
}

// ---------------- 設定 ----------------
async function openSettings() {
  const s = S.settings;
  const f = {};
  const row = (label, el, tip) => h('div', { class: 'set-row' }, h('label', {}, label), el, tip ? h('div', { class: 'muted small' }, tip) : null);
  f.name = h('input', { value: s.playerName });
  f.sfx = h('input', { type: 'checkbox', checked: s.sfx });
  f.autoplay = h('input', { type: 'checkbox', checked: s.music.autoplay });
  f.key = h('input', { type: 'password', placeholder: s.advisor.hasKey ? '（已設定，留空表示不變更）' : 'sk-ant-…' });
  f.model = h('select', {}, ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].map((m) => h('option', { value: m, selected: s.advisor.model === m }, m)));
  f.effort = h('select', {}, [['low', '快速（low）'], ['medium', '一般（medium）'], ['high', '深入（high）']].map(([v, l]) => h('option', { value: v, selected: s.advisor.effort === v }, l)));
  f.srvMode = h('select', {}, h('option', { value: 'public', selected: s.server.mode !== 'custom' }, '公用配對伺服器（PeerJS Cloud）'), h('option', { value: 'custom', selected: s.server.mode === 'custom' }, '自架伺服器'));
  f.host = h('input', { value: s.server.host, placeholder: '例如 peer.example.com' });
  f.port = h('input', { value: s.server.port, type: 'number', style: { width: '90px' } });
  f.path = h('input', { value: s.server.path, style: { width: '90px' } });
  f.secure = h('input', { type: 'checkbox', checked: s.server.secure });
  f.stun = h('textarea', { rows: 2, value: s.stun });
  f.turnUrls = h('input', { value: s.turn.urls, placeholder: 'turn:turn.example.com:3478' });
  f.turnUser = h('input', { value: s.turn.username, placeholder: '帳號' });
  f.turnPass = h('input', { type: 'password', value: s.turn.credential, placeholder: '密碼' });
  const testOut = h('div', { class: 'muted small' });
  const body = h('div', { class: 'settings' },
    h('h4', {}, '一般'),
    row('我的暱稱', f.name),
    row('音效', h('label', { class: 'chk' }, f.sfx, ' 落子、吃子、將軍音效')),
    row('背景音樂', h('label', { class: 'chk' }, f.autoplay, ' 開啟程式後自動播放')),
    h('h4', {}, 'AI 軍師（Claude）'),
    row('Anthropic API 金鑰', f.key, s.advisor.envKey && !s.advisor.hasKey ? '已偵測到環境變數 ANTHROPIC_API_KEY。' : '金鑰會加密存在本機，只用來呼叫 Claude。沒有金鑰時軍師仍會提供電腦引擎的建議。'),
    row('模型', f.model),
    row('思考深度', f.effort),
    h('div', { class: 'set-row' }, h('label', {}, ''), h('button', { onclick: async () => { testOut.textContent = '測試中…'; await applySettings(f); const r = await xk.advisor.test(); testOut.textContent = r.ok ? `✅ ${r.text}` : `❌ ${r.error}`; } }, '測試金鑰'), testOut),
    h('h4', {}, '遠端對賽連線'),
    row('配對伺服器', f.srvMode),
    row('自架伺服器', h('div', { class: 'inline' }, f.host, f.port, f.path, h('label', { class: 'chk' }, f.secure, ' HTTPS'))),
    row('STUN', f.stun),
    row('TURN（跨網路連不上時）', h('div', { class: 'inline' }, f.turnUrls, f.turnUser, f.turnPass)),
  );
  const ok = await modal('設定', body, [{ label: '取消', value: false }, { label: '儲存', value: true, primary: true }]);
  if (ok) { await applySettings(f); toast('設定已儲存', 'ok'); renderHome(); }
}

async function applySettings(f) {
  const patch = {
    playerName: f.name.value.trim() || '棋友',
    sfx: f.sfx.checked,
    music: { autoplay: f.autoplay.checked },
    advisor: { model: f.model.value, effort: f.effort.value },
    server: { mode: f.srvMode.value, host: f.host.value.trim(), port: Number(f.port.value) || 9000, path: f.path.value.trim() || '/', secure: f.secure.checked },
    stun: f.stun.value,
    turn: { urls: f.turnUrls.value.trim(), username: f.turnUser.value.trim(), credential: f.turnPass.value },
  };
  if (f.key.value.trim()) patch.advisor.apiKey = f.key.value.trim();
  await saveSettings(patch);
  f.key.value = '';
  setSfx(S.settings.sfx);
  advisor.setHasKey(S.settings.advisor.hasKey);
}

window.addEventListener('beforeunload', () => { closeNet(); });
init().catch((e) => { console.error(e); document.body.append(h('pre', { class: 'fatal' }, '啟動失敗：' + (e.stack || e))); });
