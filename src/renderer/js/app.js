// 小柯機器人象棋遊戲：主控流程（整盤／半盤；與 AI、與真人、AI 對 AI）
import { $, $$, h, toast, modal, sleep, errMsg, fmtDate, uid } from './util.js';
import { Game, Position, RED, BLACK, typeOf, colorOf, pieceName, moveFrom, moveTo, moveToIccs, iccsToMove, parseMove, moveToChinese, replayRecord, parseTextRecord, START_FEN } from './xiangqi.js';
import { LEVELS, scoreText } from './engine.js';
import { HalfGame, HALF_LEVELS, ACT, actFrom, actTo, isFlip, actToStr, strToAct, replayHalf, sqName, pieceLabel } from './banqi.js';
import { OpeningBook, buildLearned, consultBooks } from './book.js';
import { Board3D } from './board3d.js';
import { GameLink, PROTOCOL } from './net.js';
import { MusicPlayer } from './music.js';
import { AdvisorPanel } from './advisor-ui.js';
import { sfx, setSfx } from './sfx.js';
import { loadPortraits, portraitUrl, labelOf, validProfile, randomProfile, pickProfile } from './portraits.js';

const SIDE_NAME = ['紅方', '黑方'];
const CREDIT = '遊戲開發：吳玉柱 與 Claude AI Opus 5.5';
const SPEEDS = [['fast', '快（0.3 秒）', 300], ['normal', '一般（1 秒）', 1000], ['slow', '慢（2 秒）', 2000]];

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
  half(view, opts) { return this.req('half', null, { ...opts, view }); }
}

const S = {
  settings: null,
  screen: 'home',
  kind: 'full',        // full 整盤 | half 半盤
  homeKind: 'full',
  mode: null,          // ai | net | aivai | replay | idle
  game: null,
  mySide: RED,         // 我是哪一位玩家（整盤＝顏色；半盤＝0 先手／1 後手）
  selected: -1,
  aiThinking: false,
  animating: false,
  paused: false,
  aivaiLevels: [2, 2],
  aivaiDelay: 1000,
  gameId: '',
  saved: false,
  names: ['', ''],     // 依玩家索引
  link: null,
  netStatus: '',
  hostSide: 'random',
  hostKind: 'full',
  opponentVer: 0,
  replay: null,
  clocks: [0, 0],
  clockSide: 0,
  clockStart: 0,
  voice: { call: null, mic: null },
  levelIdx: 2,
  opening: null,
  learned: null,
  lastHintTimer: 0,
  info: null,
  proxy: [false, false],   // 哪一方目前由 AI 軍師代打（依玩家索引）
  players: [null, null],   // 雙方頭像與軍師 { avatar, advisor }
  oppProfile: null,
};

let board, music, advisor, engineAI, engineAna;
const isHalf = () => S.kind === 'half';
const newGameId = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + uid().slice(-6);
const levelsOf = (kind) => (kind === 'half' ? HALF_LEVELS : LEVELS);

// ---------------- 啟動 ----------------
async function init() {
  S.settings = await xk.settings.get();
  S.info = await xk.sys.info();
  setSfx(S.settings.sfx);
  S.levelIdx = S.settings.level ?? 2;
  S.homeKind = S.settings.homeKind === 'half' ? 'half' : 'full';
  engineAI = new EngineClient();
  engineAna = new EngineClient();
  S.opening = new OpeningBook();
  await rebuildLearned();
  await loadPortraits();

  board = new Board3D($('#board'), { onSquareClick: onSquareClick });
  board.setPosition(new Position().board);
  board.setView(S.settings.view || 'tilt');

  music = new MusicPlayer($('#musicPanel'), S.settings, (patch) => saveSettings(patch));
  await music.load();
  if (S.settings.music.autoplay && S.settings.music.enabled !== false) {
    const start = () => { music.play(); document.removeEventListener('pointerdown', start); };
    document.addEventListener('pointerdown', start);
  }
  music.renderState();

  advisor = new AdvisorPanel($('#advisorPanel'), () => {
    const g = S.mode === 'replay' ? S.replay.game : S.game;
    return {
      game: g,
      mySide: S.mode === 'aivai' || S.mode === 'replay' ? (g ? g.turn : RED) : S.mySide,
      analyze: (fen, hashes, ms) => engineAna.analyze(fen, { lines: 3, timeMs: ms, historyHashes: hashes }),
      analyzeHalf: (view) => engineAna.half(view, HALF_LEVELS[3]),
      showHint: (iccs) => showHint(iccs),
      showHintAct: (a) => showHintAct(a),
    };
  });
  advisor.setHasKey(S.settings.advisor.hasKey);

  bindUI();
  renderHome();
  showScreen('home');
  if (!validProfile(S.settings.profile)) ensureProfile(); // 第一次使用：必須先選頭像（不阻擋其他初始化）
  setInterval(tickClock, 500);
  document.addEventListener('pointerdown', () => sfx.resume(), { once: true });
  window.__xkc = S; // 方便自動化測試
  window.__xkcBoard = board;
  if (S.settings.autoUpdate !== false && S.info.packaged && !S.info.profile) setTimeout(() => checkUpdate(false), 5000);
}

async function saveSettings(patch) {
  S.settings = await xk.settings.set(patch);
  return S.settings;
}

async function rebuildLearned() {
  const all = await xk.games.all();
  S.learned = buildLearned(all.filter((r) => r.kind !== 'half'));
  renderLearnStat();
}

function renderLearnStat() {
  const t = `AI 參考棋譜（整盤）：已收錄 ${S.learned.games} 局、${S.learned.positions} 個局面`;
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
  $('#btnFlip').onclick = () => { if (!isHalf()) board.setOrientation(board.orientation ^ 1); };
  $('#btnUndo').onclick = () => requestUndo();
  $('#btnDraw').onclick = () => offerDraw();
  $('#btnResign').onclick = () => resign();
  $('#btnHint').onclick = () => hint();
  $('#btnPause').onclick = () => togglePause();
  $('#btnProxy').onclick = () => toggleProxy();
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
function seg(options, value, onPick) {
  const el = h('div', { class: 'seg' }, ...options.map(([v, l]) => h('button', { class: 'segbtn' + (v === value ? ' on' : ''), 'data-v': v, onclick: () => { $$('.segbtn', el).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); el.dataset.v = v; onPick && onPick(v); } }, l)));
  el.dataset.v = value;
  return el;
}

function renderHome() {
  const home = $('#homeBody');
  home.innerHTML = '';
  const kind = S.homeKind;
  const half = kind === 'half';
  const levels = levelsOf(kind);
  const nameInput = h('input', { class: 'name-in', value: S.settings.playerName, maxLength: 16, onchange: (e) => saveSettings({ playerName: e.target.value.trim() || '棋友' }) });
  const kindSel = h('div', { class: 'kind-tabs' },
    ...[['full', '整盤象棋', '9×10 正式對弈'], ['half', '半盤象棋', '4×8 暗棋，翻子決勝']].map(([k, t, sub]) =>
      h('button', { class: 'kindbtn' + (k === kind ? ' on' : ''), 'data-k': k, onclick: () => { S.homeKind = k; saveSettings({ homeKind: k }); renderHome(); } }, h('b', {}, t), h('span', {}, sub))));

  // A：與 AI 對賽
  const sideOpts = half ? [['first', '我先翻'], ['second', 'AI 先翻'], ['random', '隨機']] : [['red', '執紅先走'], ['black', '執黑後走'], ['random', '隨機']];
  const savedSide = half ? (S.settings.aiSideHalf || 'first') : (['red', 'black', 'random'].includes(S.settings.aiSide) ? S.settings.aiSide : 'red');
  const sideSel = seg(sideOpts, sideOpts.some(([v]) => v === savedSide) ? savedSide : sideOpts[0][0]);
  const lvSel = h('select', { class: 'lv', onchange: (e) => { S.levelIdx = Number(e.target.value); saveSettings({ level: S.levelIdx }); } },
    levels.map((l, i) => h('option', { value: i, selected: i === S.levelIdx }, l.name)));
  const cardAI = h('div', { class: 'card mode-card' },
    h('div', { class: 'card-icon' }, '🤖'),
    h('h2', {}, 'A　與 AI 對賽'),
    h('p', { class: 'muted' }, half ? '不需要網路連線。AI 只看得到翻開的棋子，跟您一樣靠機率判斷。' : '不需要網路連線，電腦會參考您過去的對局棋譜越下越聰明。'),
    h('label', {}, '我方：'), sideSel,
    h('label', {}, '難度：'), lvSel,
    half ? h('p', { class: 'small muted' }, '翻出的第一顆棋子是什麼顏色，翻的人就執那個顏色。') : h('p', { class: 'learn-stat small muted' }),
    h('button', { class: 'primary big', id: 'startAI', onclick: () => startAIGame(sideSel.dataset.v, kind) }, '開始對局'));

  // B：與真人對賽
  const hostOpts = half ? [['random', '隨機決定誰先翻'], ['first', '我先翻'], ['second', '對方先翻']] : [['random', '隨機分配紅黑'], ['red', '我執紅（先走）'], ['black', '我執黑（後走）']];
  const hostSideSel = h('select', { class: 'lv', id: 'hostSide' }, hostOpts.map(([v, l]) => h('option', { value: v }, l)));
  const codeIn = h('input', { class: 'code-in', id: 'joinCode', placeholder: '輸入 6 位數房號', maxLength: 7, inputMode: 'numeric' });
  const cardNet = h('div', { class: 'card mode-card' },
    h('div', { class: 'card-icon' }, '🌐'),
    h('h2', {}, 'B　與真人對賽'),
    h('p', { class: 'muted' }, `透過網路遠端連線下${half ? '半盤' : '整盤'}，輪流下棋、可以語音聊天，雙方各自聽自己的背景音樂。`),
    h('div', { class: 'net-row' }, hostSideSel, h('button', { class: 'primary', id: 'btnHost', onclick: () => hostRoom(hostSideSel.value, kind) }, '建立房間')),
    h('div', { class: 'net-or' }, '或'),
    h('div', { class: 'net-row' }, codeIn, h('button', { class: 'primary', id: 'btnJoin', onclick: () => joinRoom(codeIn.value) }, '加入房間')),
    h('p', { class: 'small muted' }, '加入房間時會自動使用房主選的整盤或半盤。'),
    h('div', { id: 'netWait', class: 'net-wait hidden' }));

  // C：AI 對 AI
  const av = S.settings.aivai || {};
  const aLv = (key, def) => h('select', { class: 'lv', id: key }, levels.map((l, i) => h('option', { value: i, selected: i === (av[key] ?? def) }, l.name)));
  const lvA = aLv('aivaiA', 2), lvB = aLv('aivaiB', 2);
  const speedSel = seg(SPEEDS.map(([v, l]) => [v, l.split('（')[0]]), av.speed || 'normal');
  const cardAivai = h('div', { class: 'card mode-card' },
    h('div', { class: 'card-icon' }, '🎬'),
    h('h2', {}, 'C　AI 與 AI 對賽'),
    h('p', { class: 'muted' }, '坐下來觀戰，看兩個 AI 怎麼下。可以暫停、請軍師講解，棋譜也會收錄。'),
    h('div', { class: 'two-col' },
      h('div', {}, h('label', {}, half ? '先手 AI：' : '紅方 AI：'), lvA),
      h('div', {}, h('label', {}, half ? '後手 AI：' : '黑方 AI：'), lvB)),
    h('label', {}, '每步速度：'), speedSel,
    h('button', { class: 'primary big', id: 'startAivai', onclick: () => {
      const cfg = { levels: [Number(lvA.value), Number(lvB.value)], speed: speedSel.dataset.v };
      saveSettings({ aivai: { aivaiA: cfg.levels[0], aivaiB: cfg.levels[1], speed: cfg.speed } });
      startAIvAI(cfg, kind);
    } }, '開始觀戰'));

  home.append(
    h('div', { class: 'home-hero' },
      h('div', { class: 'hero-piece' }, '帥'),
      h('div', {}, h('h1', {}, '小柯機器人象棋遊戲'), h('p', { class: 'muted' }, '3D 中國象棋．整盤與半盤')),
      myProfileCard(),
      h('div', { class: 'hero-name' }, h('label', {}, '我的暱稱'), nameInput)),
    kindSel,
    h('div', { class: 'mode-grid' }, cardAI, cardNet, cardAivai),
    h('div', { class: 'home-links' },
      h('button', { onclick: () => showScreen('records') }, '📜 棋譜庫'),
      h('button', { onclick: () => openSettings() }, '⚙ 設定'),
      h('button', { onclick: () => { selectTab('music'); showScreen('game'); enterIdleBoard(); } }, '♫ 背景音樂'),
      h('button', { id: 'btnAbout', onclick: () => openAbout() }, 'ℹ 關於與更新')),
    h('div', { class: 'credit muted small' }, `v${S.info.version}　${CREDIT}`),
  );
  if (!half) renderLearnStat();
}

// 首頁上的「我的頭像＋AI 軍師」
function myProfileCard() {
  const pr = S.settings.profile;
  if (!validProfile(pr)) return h('button', { class: 'my-profile empty', id: 'btnProfile', onclick: () => ensureProfile(true) }, '選擇頭像與 AI 軍師');
  return h('button', { class: 'my-profile', id: 'btnProfile', title: '更換頭像與 AI 軍師', onclick: () => ensureProfile(true) },
    h('img', { class: 'mp-main', src: portraitUrl(pr.avatar) }),
    h('div', { class: 'mp-text' }, h('b', {}, labelOf(pr.avatar)), h('span', {}, '我的 AI 軍師'),
      h('div', { class: 'mp-adv' }, h('img', { src: portraitUrl(pr.advisor) }), h('span', {}, labelOf(pr.advisor)))),
    h('span', { class: 'mp-change' }, '更換'));
}

// 確認已選頭像（必選）；force=true 表示一定打開選擇視窗
async function ensureProfile(force = false) {
  const cur = S.settings.profile;
  if (!force && validProfile(cur)) return true;
  const required = !validProfile(cur);
  const r = await pickProfile(cur, { required });
  if (r) { await saveSettings({ profile: r }); renderHome(); return true; }
  return validProfile(S.settings.profile);
}

const myProfile = () => S.settings.profile;

function enterIdleBoard() {
  if (S.mode && S.mode !== 'idle') return;
  S.kind = 'full';
  board.setLayout('full');
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
function boardOf(g) { return g.kind === 'half' ? g.board : g.pos.board; }
function showBoard(g) { if (g.kind === 'half') board.setPosition(g.board, g.up); else board.setPosition(g.pos.board); }
function colorName(c) { return c === RED ? '紅方' : c === BLACK ? '黑方' : ''; }
// 玩家 idx 的顏色（半盤翻子前為 null）
function colorOfPlayer(g, idx) { return g.kind === 'half' ? g.pcolor[idx] : idx; }
// 卡片位置（紅/黑）對應哪位玩家
function playerAtSlot(g, slot) {
  if (g.kind !== 'half') return slot;
  if (g.pcolor[0] == null) return slot === RED ? 0 : 1;
  return g.playerOfColor(slot);
}

function setupGame(mode, mySide, names, opts = {}) {
  S.kind = opts.kind === 'half' ? 'half' : 'full';
  S.mode = mode;
  board.setLayout(S.kind);
  S.game = isHalf() ? new HalfGame(opts.deal) : new Game(opts.startFen || START_FEN);
  S.mySide = mySide;
  S.names = names;
  S.players = opts.players || [randomProfile(), randomProfile()];
  S.proxy = [false, false];
  S.selected = -1;
  S.aiThinking = false;
  S.animating = false;
  S.paused = false;
  S.saved = false;
  S.gameId = newGameId();
  S.clocks = [0, 0]; S.clockSide = S.game.turn; S.clockStart = Date.now();
  if (!isHalf()) board.setOrientation(mode === 'aivai' ? RED : mySide);
  showBoard(S.game);
  board.setLastMove(-1, -1); board.setCheck(-1); board.setHint(-1); board.setSelected(-1); board.setTargets([]);
  advisor.reset();
  for (const m of ['net', 'ai', 'aivai', 'replay']) document.body.classList.toggle('mode-' + m, mode === m);
  document.body.classList.toggle('kind-half', isHalf());
  $('#chatLog').innerHTML = '';
  $('#aiInfo').textContent = '';
  showScreen('game');
  selectTab(mode === 'net' ? 'chat' : 'advisor');
  updateAdvisorHead();
  updateGameUI();
  if (mode !== 'replay') showVersus();
}

// 軍師面板顯示我的軍師（觀戰時顯示輪到那一方的軍師）
function updateAdvisorHead() {
  const g = S.game;
  const idx = ['ai', 'net'].includes(S.mode) ? S.mySide : (g ? g.turn : 0);
  const pr = S.players[idx];
  advisor.setAdvisor(pr ? labelOf(pr.advisor) : '小柯軍師', pr ? portraitUrl(pr.advisor) : '');
}

// 開局對陣畫面
function showVersus() {
  const g = S.game;
  const side = (idx) => {
    const pr = S.players[idx];
    if (!pr) return h('div');
    const c = colorOfPlayer(g, idx);
    const tag = g.kind === 'half' ? (idx === 0 ? '先手' : '後手') : colorName(c);
    return h('div', { class: 'vs-side ' + (g.kind === 'half' ? '' : c === RED ? 'red' : 'black') },
      h('img', { class: 'vs-main', src: portraitUrl(pr.avatar) }),
      h('div', { class: 'vs-name' }, S.names[idx] || ''),
      h('div', { class: 'vs-tag' }, `${tag}．${labelOf(pr.avatar)}`),
      h('div', { class: 'vs-adv' }, h('img', { src: portraitUrl(pr.advisor) }), h('span', {}, labelOf(pr.advisor))));
  };
  const el = h('div', { class: 'versus', onclick: () => el.remove() }, side(0), h('div', { class: 'vs-mid' }, 'VS'), side(1));
  $('#boardWrap').append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
}

function canMove() {
  const g = S.game;
  if (!g || g.result || S.animating) return false;
  if (S.proxy[S.mySide]) return false;
  if (S.mode === 'ai') return !S.aiThinking && g.turn === S.mySide;
  if (S.mode === 'net') return !!(S.link && S.link.connected) && g.turn === S.mySide && S.netStarted;
  return false;
}

function onSquareClick(sq) {
  if (!S.game || !['ai', 'net'].includes(S.mode)) return;
  const g = S.game;
  if (!canMove()) {
    if (!g.result && S.proxy[S.mySide]) toast('目前由 AI 軍師代打，按「交還主位」就能自己下', 'info', 2500);
    else if (!g.result && g.turn !== S.mySide) { flashBanner(); sfx.illegal(); }
    return;
  }
  if (g.kind === 'half') { halfClick(sq); return; }
  const p = g.pos.board[sq];
  if (p && colorOf(p) === S.mySide) {
    S.selected = sq;
    board.setSelected(sq);
    board.setTargets(g.legalMoves().filter((m) => moveFrom(m) === sq).map(moveTo), g.pos.board);
    sfx.select();
    return;
  }
  if (S.selected >= 0) {
    const m = g.legalMoves().find((mv) => moveFrom(mv) === S.selected && moveTo(mv) === sq);
    if (m) { localMove(m); return; }
    sfx.illegal();
  }
}

function halfClick(sq) {
  const g = S.game;
  const legal = g.legalActions();
  const p = g.board[sq];
  if (p && !g.up[sq]) { // 暗子：翻開
    const a = ACT(sq, sq);
    if (legal.includes(a)) localMove(a);
    return;
  }
  const my = g.sideColor;
  if (p && my != null && colorOf(p) === my) {
    S.selected = sq;
    board.setSelected(sq);
    board.setTargets(legal.filter((a) => !isFlip(a) && actFrom(a) === sq).map(actTo), g.board);
    sfx.select();
    return;
  }
  if (S.selected >= 0) {
    const a = legal.find((x) => !isFlip(x) && actFrom(x) === S.selected && actTo(x) === sq);
    if (a !== undefined) { localMove(a); return; }
    sfx.illegal();
  } else if (p && my != null && colorOf(p) !== my) {
    toast('這是對方的棋子', 'info', 1500);
  }
}

const moveToStr = (g, m) => (g.kind === 'half' ? actToStr(m) : moveToIccs(m));
const strToMove = (g, s) => (g.kind === 'half' ? strToAct(s) : iccsToMove(s));

async function localMove(m) {
  if (S.mode === 'net') S.link.send({ t: 'move', ply: S.game.moves.length, mv: moveToStr(S.game, m) });
  await applyMove(m);
}

async function applyMove(m) {
  const g = S.game;
  const half = g.kind === 'half';
  S.selected = -1;
  board.setSelected(-1);
  board.setTargets([]);
  board.setHint(-1);
  const mover = g.turn;
  const before = half ? (isFlip(m) ? 0 : g.board[actTo(m)]) : g.pos.board[moveTo(m)];
  S.clocks[mover] += Date.now() - S.clockStart;
  S.clockStart = Date.now();
  const firstFlip = half && g.pcolor[0] == null;
  const res = g.play(m);
  S.clockSide = g.turn;
  S.animating = true;
  updateGameUI();
  const ply = g.moves.length;
  if (half && isFlip(m)) { sfx.flip(); await board.flipPiece(actFrom(m)); }
  else await board.animateMove(half ? actFrom(m) : moveFrom(m), half ? actTo(m) : moveTo(m));
  S.animating = false;
  if (S.game !== g || g.moves.length !== ply) { updateGameUI(); return; } // 動畫期間已悔棋或離開
  if (half) {
    board.setLastMove(actFrom(m), actTo(m));
    if (before) sfx.capture(); else if (!isFlip(m)) sfx.move();
    if (firstFlip) {
      const c = g.pcolor[S.mode === 'aivai' ? 0 : S.mySide];
      if (S.mode === 'aivai') popText(`先手 AI 執${colorName(g.pcolor[0])}`);
      else popText(`您執${colorName(c)}`, c === RED ? 'red' : 'black');
    }
  } else {
    board.setLastMove(moveFrom(m), moveTo(m));
    if (before) sfx.capture(); else sfx.move();
    if (res.check && !g.result) {
      board.setCheck(g.pos.kingSq[g.side]);
      sfx.check();
      popText(g.side === S.mySide && S.mode !== 'aivai' ? '將軍！小心' : '將軍！', 'check');
    } else board.setCheck(-1);
  }
  updateGameUI();
  if (g.result) await onGameOver();
  else {
    if (S.mode === 'net' && g.turn === S.mySide && !S.proxy[S.mySide]) {
      sfx.turn();
      xk.win.attention('輪到您下棋', `對方：${res.note}`);
    }
    maybeAutoMove();
  }
}

function updateGameUI() {
  const g = S.game;
  if (!g) return;
  const half = g.kind === 'half';
  const view = S.mode === 'replay' ? S.replay.game : g;
  // 玩家卡片
  for (const slot of [RED, BLACK]) {
    const card = $(slot === RED ? '#pRed' : '#pBlack');
    const idx = playerAtSlot(g, slot);
    const color = colorOfPlayer(g, idx);
    card.querySelector('.pname').textContent = S.names[idx] || (half ? (idx === 0 ? '先手' : '後手') : SIDE_NAME[slot]);
    card.querySelector('.ptag').textContent = idx === S.mySide && ['ai', 'net'].includes(S.mode) ? '（我）' : '';
    const pr = S.players[idx];
    const proxied = !!S.proxy[idx];
    card.classList.toggle('proxy', proxied);
    const img = card.querySelector('.pimg');
    const want = pr ? portraitUrl(proxied ? pr.advisor : pr.avatar) : '';
    if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    img.classList.toggle('hidden', !pr);
    const advImg = card.querySelector('.padvimg');
    const advWant = pr ? portraitUrl(proxied ? pr.avatar : pr.advisor) : '';
    if (advImg.getAttribute('src') !== advWant) advImg.setAttribute('src', advWant);
    card.querySelector('.padv').classList.toggle('hidden', !pr);
    card.querySelector('.padvname').textContent = pr ? (proxied ? `主位暫離：${labelOf(pr.avatar)}` : labelOf(pr.advisor)) : '';
    card.title = pr ? `${labelOf(pr.avatar)}．軍師 ${labelOf(pr.advisor)}` : '';
    const chip = card.querySelector('.pchip');
    chip.textContent = color == null ? (idx === 0 ? '先' : '後') : color === RED ? '帥' : '將';
    card.classList.toggle('red', color === RED || (color == null && slot === RED));
    card.classList.toggle('black', color === BLACK || (color == null && slot === BLACK));
    card.classList.toggle('active', !g.result && g.turn === idx && S.mode !== 'replay' && S.mode !== 'idle');
    const caps = card.querySelector('.pcaps');
    caps.innerHTML = '';
    if (color != null) for (const c of g.caps) if (c && colorOf(c) !== color) caps.append(h('span', { class: 'pcap ' + (colorOf(c) === RED ? 'r' : 'b') }, pieceName(c)));
  }
  // 著法列表
  const list = $('#moveList');
  list.innerHTML = '';
  const notes = view.notes;
  const cur = S.mode === 'replay' ? S.replay.ply : notes.length;
  if (half) {
    notes.forEach((n, i) => {
      const c = view.pcolor[i % 2];
      list.append(h('div', { class: 'mv-row one' },
        h('span', { class: 'mv-no' }, `${i + 1}.`),
        h('span', { class: 'mv ' + (c === BLACK ? 'black' : 'red') + (cur === i + 1 ? ' cur' : ''), onclick: () => S.mode === 'replay' && replayGo(i + 1) }, n)));
    });
  } else {
    for (let i = 0; i < notes.length; i += 2) {
      list.append(h('div', { class: 'mv-row' },
        h('span', { class: 'mv-no' }, `${i / 2 + 1}.`),
        h('span', { class: 'mv red' + (cur === i + 1 ? ' cur' : ''), onclick: () => S.mode === 'replay' && replayGo(i + 1) }, notes[i]),
        h('span', { class: 'mv black' + (cur === i + 2 ? ' cur' : ''), onclick: () => S.mode === 'replay' && replayGo(i + 2) }, notes[i + 1] || '')));
    }
  }
  list.scrollTop = list.scrollHeight;
  const opening = half ? '' : S.opening.nameOf(view);
  $('#openingName').textContent = half ? '半盤（暗棋）' : opening ? '開局：' + opening : '';
  // 輪次提示
  const banner = $('#turnBanner');
  let text = '', cls = '';
  if (S.mode === 'replay') { text = `棋譜重播　第 ${S.replay.ply} / ${S.replay.game.moves.length} 步`; cls = 'replay'; }
  else if (S.mode === 'idle') { text = '請回首頁選擇對局模式'; cls = 'watch'; }
  else if (g.result) { text = resultText(g.result); cls = 'over'; }
  else if (S.mode === 'aivai') {
    const who = half ? (colorOfPlayer(g, g.turn) == null ? (g.turn === 0 ? '先手' : '後手') : colorName(colorOfPlayer(g, g.turn))) : colorName(g.turn);
    text = S.paused ? `AI 對 AI．已暫停（輪到${who}）` : `AI 對 AI．${who}（${levelsOf(S.kind)[S.aivaiLevels[g.turn]].name}）思考中…`;
    cls = 'watch';
  }
  else if (S.mode === 'net' && !(S.link && S.link.connected)) { text = S.netStatus || '等待對手連線…'; cls = 'watch'; }
  else if (S.mode === 'net' && !S.netStarted) { text = '對手已連線，準備開局…'; cls = 'watch'; }
  else if (g.turn === S.mySide && S.proxy[S.mySide]) { text = `${labelOf(S.players[S.mySide]?.advisor)}代打中`; cls = 'proxy'; }
  else if (g.turn === S.mySide) { text = '輪到您下棋'; cls = 'mine'; }
  else if (S.mode === 'net' && S.proxy[g.turn]) { text = '換您觀棋（對方由 AI 軍師代打）'; cls = 'watch'; }
  else { text = S.mode === 'ai' ? '換您觀棋（AI 思考中…）' : '換您觀棋（對方思考中）'; cls = 'watch'; }
  banner.textContent = text;
  banner.className = 'turn-banner ' + cls;
  board.setInteractive(canMove());
  // 半盤提示語
  const tip = $('#halfTip');
  tip.textContent = half && !g.result && g.pcolor[0] == null && S.mode !== 'replay' ? '先翻開一顆暗子，翻出的顏色就是翻的人的顏色。' : half && !g.result && S.mode !== 'replay' ? '點暗子翻開；點自己的明子再點目標格移動或吃子。' : '';
  // 按鈕狀態
  const playing = (S.mode === 'ai' || S.mode === 'net') && !g.result;
  $('#btnUndo').disabled = !playing || g.moves.length === 0 || S.animating || (S.mode === 'ai' && (S.aiThinking || half));
  $('#btnUndo').title = S.mode === 'ai' && half ? '半盤與 AI 對賽不能悔棋' : '';
  $('#btnDraw').disabled = !playing || S.mode !== 'net';
  $('#btnResign').disabled = !playing;
  $('#btnHint').disabled = !playing || g.turn !== S.mySide || S.proxy[S.mySide];
  const proxyBtn = $('#btnProxy');
  proxyBtn.classList.toggle('hidden', !['ai', 'net'].includes(S.mode));
  proxyBtn.disabled = !playing || (S.mode === 'net' && !(S.link && S.link.connected && S.netStarted));
  proxyBtn.textContent = S.proxy[S.mySide] ? '↩ 交還主位' : '🧙 軍師代打';
  proxyBtn.classList.toggle('on', !!S.proxy[S.mySide]);
  $('#btnPause').textContent = S.paused ? '▶ 繼續' : '⏸ 暫停';
  $('#btnPause').disabled = S.mode !== 'aivai' || !!g.result;
  $('#btnNew').textContent = S.mode === 'net' ? '再來一局' : '新局';
  $('#btnNew').disabled = S.mode === 'replay' || S.mode === 'idle' || (S.mode === 'net' && !g.result);
  $('#btnExport').disabled = !(view.moves.length);
  renderClocks();
}

function renderClocks() {
  const g = S.game;
  if (!g) return;
  for (const slot of [RED, BLACK]) {
    const idx = playerAtSlot(g, slot);
    let ms = S.clocks[idx] || 0;
    if (!g.result && S.clockSide === idx && (S.mode === 'ai' || S.mode === 'aivai' || (S.mode === 'net' && S.netStarted))) ms += Date.now() - S.clockStart;
    const s = Math.floor(ms / 1000);
    $(slot === RED ? '#pRed' : '#pBlack').querySelector('.pclock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

function winColorOf(r) { return 'winColor' in r ? r.winColor : r.winner; }
function resultText(r) {
  if (!r) return '';
  if (r.winner == null) return `和棋（${r.reason}）`;
  const mine = ['ai', 'net'].includes(S.mode) ? r.winner === S.mySide : null;
  const wc = winColorOf(r);
  const who = wc == null ? (r.winner === 0 ? '先手' : '後手') : colorName(wc);
  return `${who}勝${mine == null ? '' : mine ? '　🎉 您贏了！' : '　您輸了'}（${r.reason}）`;
}

async function onGameOver() {
  const g = S.game;
  const r = g.result;
  board.setInteractive(false);
  if (g.kind === 'half') board.setPosition(g.board, new Uint8Array(32).fill(1)); // 結束時亮出所有暗子
  const mine = ['ai', 'net'].includes(S.mode);
  if (!mine || r.winner === S.mySide) sfx.win(); else if (r.winner != null) sfx.lose(); else sfx.move();
  await saveGame();
  updateGameUI();
  const btns = S.mode === 'ai' ? [{ label: '檢視棋盤', value: 'stay' }, { label: '再下一局', value: 'again', primary: true }]
    : S.mode === 'aivai' ? [{ label: '檢視棋盤', value: 'stay' }, { label: '再看一局', value: 'again', primary: true }]
    : [{ label: '知道了', value: 'stay', primary: true }];
  const title = !mine ? (r.winner == null ? '和棋' : '對局結束') : r.winner == null ? '和棋' : r.winner === S.mySide ? '恭喜獲勝！' : '這局輸了';
  const v = await modal(title, h('div', {},
    h('p', {}, resultText(r)),
    h('p', { class: 'muted small' }, g.kind === 'half' ? '本局棋譜已自動存入棋譜庫，可以重播。' : '本局棋譜已自動存入棋譜庫，AI 會參考這局的著法。')), btns);
  if (v === 'again') newGameSameMode();
}

function recordMeta(g) {
  const half = g.kind === 'half';
  const nameOfColor = (c) => {
    if (!half) return S.names[c];
    const idx = g.pcolor[0] == null ? (c === RED ? 0 : 1) : g.playerOfColor(c);
    return S.names[idx];
  };
  const myColor = colorOfPlayer(g, S.mySide);
  const lv = levelsOf(g.kind);
  return {
    id: S.gameId,
    mode: S.mode,
    kind: g.kind,
    red: nameOfColor(RED), black: nameOfColor(BLACK),
    mySide: S.mode === 'aivai' ? '' : myColor === RED ? 'red' : myColor === BLACK ? 'black' : '',
    level: S.mode === 'ai' ? lv[S.levelIdx].name : S.mode === 'aivai' ? `${lv[S.aivaiLevels[0]].name} 對 ${lv[S.aivaiLevels[1]].name}` : '',
    opening: half ? '' : S.opening.nameOf(g),
    players: S.players,
  };
}

async function saveGame() {
  if (S.saved || !S.game || !S.game.moves.length) return;
  if (!['ai', 'net', 'aivai'].includes(S.mode)) return;
  S.saved = true;
  const g = S.game;
  const rec = g.toRecord(recordMeta(g));
  try {
    await xk.games.save(rec);
    if (g.kind !== 'half' && S.settings.learnFromGames !== false && rec.result !== '*') { S.learned.addRecord(rec); renderLearnStat(); }
  } catch (e) { toast('棋譜儲存失敗：' + errMsg(e), 'err'); }
}

// 中途離開：未完成的對局也存檔（結果 *，不列入 AI 學習）
async function saveUnfinished() {
  if (S.saved || !S.game || S.game.result || S.game.moves.length < 2) return;
  if (!['ai', 'net', 'aivai'].includes(S.mode)) return;
  S.saved = true;
  const rec = S.game.toRecord({ ...recordMeta(S.game), reason: '未完成' });
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
  document.body.classList.remove('mode-net', 'mode-ai', 'mode-replay', 'mode-aivai', 'kind-half');
  renderHome();
  showScreen('home');
}

function newGameSameMode() {
  if (S.mode === 'ai') startAIGame(S.lastAIChoice || 'red', S.kind);
  else if (S.mode === 'aivai') startAIvAI(S.lastAivai, S.kind);
  else if (S.mode === 'net') requestRematch();
}

// ---------------- 與 AI 對賽 ----------------
async function startAIGame(choice, kind = 'full') {
  if (!(await ensureProfile())) return;
  S.lastAIChoice = choice;
  const half = kind === 'half';
  let me;
  if (half) me = choice === 'second' ? 1 : choice === 'first' ? 0 : (Math.random() < 0.5 ? 0 : 1);
  else me = choice === 'black' ? BLACK : choice === 'red' ? RED : (Math.random() < 0.5 ? RED : BLACK);
  saveSettings(half ? { aiSideHalf: choice } : { aiSide: choice });
  const lv = levelsOf(kind);
  const aiName = `小柯 AI（${lv[Math.min(S.levelIdx, lv.length - 1)].name}）`;
  const myName = S.settings.playerName || '我';
  const mine = myProfile(), ai = randomProfile([mine.avatar, mine.advisor]);
  setupGame('ai', me, me === 0 ? [myName, aiName] : [aiName, myName], { kind, players: me === 0 ? [mine, ai] : [ai, mine] });
  if (half) popText(me === 0 ? '您先翻' : 'AI 先翻');
  setTimeout(() => maybeAutoMove(), 900);
}

// ---------------- AI 對 AI ----------------
async function startAIvAI(cfg, kind = 'full') {
  if (!(await ensureProfile())) return;
  cfg = cfg || { levels: [2, 2], speed: 'normal' };
  S.lastAivai = cfg;
  const lv = levelsOf(kind);
  const names = kind === 'half'
    ? [`先手 AI（${lv[cfg.levels[0]].name}）`, `後手 AI（${lv[cfg.levels[1]].name}）`]
    : [`紅方 AI（${lv[cfg.levels[0]].name}）`, `黑方 AI（${lv[cfg.levels[1]].name}）`];
  const p0 = randomProfile(), p1 = randomProfile([p0.avatar, p0.advisor]);
  setupGame('aivai', RED, names, { kind, players: [p0, p1] });
  S.aivaiLevels = cfg.levels.slice();
  S.aivaiDelay = (SPEEDS.find(([v]) => v === cfg.speed) || SPEEDS[1])[2];
  updateGameUI();
  setTimeout(() => maybeAutoMove(), 1200);
}

function togglePause() {
  if (S.mode !== 'aivai' || !S.game || S.game.result) return;
  S.paused = !S.paused;
  updateGameUI();
  if (!S.paused) maybeAutoMove();
}

// 計算 AI 著法：回傳 { move, source }
async function computeAIMove(g, levelIdx) {
  if (g.kind === 'half') {
    const lv = HALF_LEVELS[Math.min(levelIdx, HALF_LEVELS.length - 1)];
    const r = await engineAI.half(g.publicView(), lv);
    return { move: r.act, source: r.depth ? `思考 ${r.depth} 層` : '開局翻子' };
  }
  const level = LEVELS[levelIdx];
  const learned = S.settings.learnFromGames !== false ? S.learned : null;
  const c = consultBooks(g.pos, g.moves.length, S.opening, learned);
  if (c.book && levelIdx >= 1) return { move: c.book.move, source: '開局庫' };
  const hashes = g.hashes.slice(0, -1);
  const r = await engineAI.search(g.pos.fen(), { timeMs: level.timeMs, maxDepth: level.maxDepth, noise: level.noise, historyHashes: hashes });
  let move = iccsToMove(r.best), bestScore = r.score, source = '';
  if (learned && levelIdx >= 1) {
    // 學習棋譜：曾經贏過的著法，若電腦算起來也不差就採用
    for (const x of c.good.filter((y) => y.move !== move).slice(0, 2)) {
      const v = await engineAI.search(g.pos.fen(), { timeMs: Math.max(250, level.timeMs * 0.3), only: [x.iccs], historyHashes: hashes, analyze: true });
      if (v.score >= bestScore - 50) { move = x.move; bestScore = v.score; source = `參考棋譜（${x.w} 勝 ${x.d} 和 ${x.l} 負）`; break; }
    }
    // 曾經輸過的著法盡量避開
    if (!source && c.bad.includes(move)) {
      const alt = await engineAI.search(g.pos.fen(), { timeMs: Math.max(300, level.timeMs * 0.5), exclude: c.bad.map(moveToIccs), historyHashes: hashes });
      if (alt.best && alt.score >= bestScore - 80) { move = iccsToMove(alt.best); source = '避開曾輸棋的著法'; }
    }
  }
  return { move, source: source || `搜尋 ${r.depth} 層，AI 自評 ${scoreText(bestScore)}` };
}

// 現在輪到的一方是否由電腦下（AI 對手、AI 對 AI、或 AI 軍師代打）
function isAITurn() {
  const g = S.game;
  if (!g || g.result || S.animating) return false;
  if (S.mode === 'aivai') return !S.paused;
  if (S.mode === 'ai') return g.turn !== S.mySide || !!S.proxy[S.mySide];
  if (S.mode === 'net') return g.turn === S.mySide && !!S.proxy[S.mySide] && !!(S.link && S.link.connected) && S.netStarted;
  return false;
}

function maybeAutoMove() {
  if (isAITurn() && !S.aiThinking) aiMove();
}

const proxyLevel = (kind) => Math.min(S.settings.proxyLevel ?? 3, levelsOf(kind).length - 1);

async function aiMove() {
  const g = S.game;
  if (!isAITurn() || S.aiThinking) return;
  const mode = S.mode;
  const turn = g.turn;
  const isProxy = mode !== 'aivai' && turn === S.mySide;
  S.aiThinking = true;
  updateGameUI();
  const t0 = Date.now();
  const levelIdx = mode === 'aivai' ? S.aivaiLevels[turn] : isProxy ? proxyLevel(g.kind) : S.levelIdx;
  let move, source;
  try { ({ move, source } = await computeAIMove(g, levelIdx)); }
  catch (e) { console.error(e); move = g.legalMoves()[0]; source = '備用著法'; }
  const minWait = mode === 'aivai' ? S.aivaiDelay : isProxy ? 700 : 450;
  const wait = minWait - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  S.aiThinking = false;
  // 已離開、重開、暫停或主位已收回：放棄這步
  if (S.game !== g || S.mode !== mode || g.turn !== turn || !isAITurn()) { updateGameUI(); maybeAutoMove(); return; }
  const who = mode === 'aivai' ? S.names[turn] : isProxy ? `軍師 ${labelOf(S.players[turn]?.advisor)}` : 'AI';
  $('#aiInfo').textContent = `${who}：${source}`;
  if (move != null && move >= 0 && g.legalMoves().includes(move)) {
    if (mode === 'net') S.link.send({ t: 'move', ply: g.moves.length, mv: moveToStr(g, move), proxy: true });
    await applyMove(move);
  } else updateGameUI();
}

// 軍師代打：暫時離開時讓 AI 軍師接手，回來後交還主位
function toggleProxy() {
  const g = S.game;
  if (!g || g.result || !['ai', 'net'].includes(S.mode)) return;
  const on = !S.proxy[S.mySide];
  S.proxy[S.mySide] = on;
  const adv = labelOf(S.players[S.mySide]?.advisor);
  if (S.mode === 'net') S.link.send({ t: 'proxy', on, advisor: S.players[S.mySide]?.advisor, ply: g.moves.length });
  if (on) { popText(`AI 軍師「${adv}」接手`, 'proxy'); chatSys(`您暫時離開，由 AI 軍師「${adv}」代打`); }
  else { popText('主位回來了', 'proxy'); chatSys('您已交還主位，換回自己下棋'); }
  updateGameUI();
  updateAdvisorHead();
  maybeAutoMove();
}

// ---------------- 悔棋、和棋、認輸、提示 ----------------
async function requestUndo() {
  const g = S.game;
  if (!g || g.result || !g.moves.length || S.animating) return;
  const n = g.turn === S.mySide ? 2 : 1;
  if (S.mode === 'ai') {
    if (S.aiThinking || g.kind === 'half') return;
    doUndo(Math.min(n, g.moves.length));
    return;
  }
  if (S.mode === 'net') {
    if (n > g.moves.length) return;
    S.link.send({ t: 'undo-req', n, ply: g.moves.length });
    toast('已向對方提出悔棋請求…');
  }
}

function doUndo(n) {
  const g = S.game;
  if (!g) return;
  for (let i = 0; i < n; i++) g.undo();
  showBoard(g);
  const last = g.moves[g.moves.length - 1];
  if (g.kind === 'half') board.setLastMove(last != null ? actFrom(last) : -1, last != null ? actTo(last) : -1);
  else {
    board.setLastMove(last ? moveFrom(last) : -1, last ? moveTo(last) : -1);
    board.setCheck(g.pos.inCheck() ? g.pos.kingSq[g.side] : -1);
  }
  board.setHint(-1);
  S.clockSide = g.turn;
  updateGameUI();
  maybeAutoMove();
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

function describeHalf(g, a) {
  if (isFlip(a)) return `翻開 ${sqName(actFrom(a))}`;
  const p = g.board[actFrom(a)], q = g.board[actTo(a)];
  return `${pieceLabel(p)} ${sqName(actFrom(a))}→${sqName(actTo(a))}${q ? ' 吃' + pieceLabel(q) : ''}`;
}

async function hint() {
  const g = S.game;
  if (!g || g.result || g.turn !== S.mySide) return;
  $('#btnHint').disabled = true;
  try {
    if (g.kind === 'half') {
      const r = await engineAna.half(g.publicView(), HALF_LEVELS[3]);
      if (S.game === g && g.turn === S.mySide && r.act >= 0) { showHintAct(r.act); toast(`提示：${describeHalf(g, r.act)}`, 'ok'); }
      return;
    }
    const lines = await engineAna.analyze(g.pos.fen(), { lines: 1, timeMs: 1200, historyHashes: g.hashes });
    if (lines[0] && S.game === g && g.side === S.mySide) {
      showHint(lines[0].best);
      toast(`提示：${moveToChinese(g.pos, iccsToMove(lines[0].best))}（${scoreText(lines[0].score)}）`, 'ok');
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
function showHintAct(a) {
  if (a == null || a < 0) return;
  board.setHint(actFrom(a), actTo(a));
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

async function hostRoom(sideChoice, kind = 'full') {
  if (!(await ensureProfile())) return;
  closeNet();
  S.hostSide = sideChoice;
  S.hostKind = kind;
  netWait(h('span', {}, '正在建立房間…'));
  const link = new GameLink(S.settings);
  S.link = link;
  try {
    const code = await link.host();
    netWait(h('div', {},
      h('div', { class: 'room-code' }, code.replace(/(\d{3})(\d{3})/, '$1 $2')),
      h('div', {}, `${kind === 'half' ? '半盤' : '整盤'}房間已建立，請把房號告訴對方，對方在「加入房間」輸入即可。`),
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
  if (!(await ensureProfile())) return;
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
    link.send({ t: 'hello', name: S.settings.playerName || '棋友', ver: PROTOCOL, profile: myProfile() });
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

// 房主建立新局的開局訊息
function makeStart(hostSide, kind) {
  const me = S.settings.playerName || '棋友';
  const names = hostSide === 0 ? [me, S.oppName] : [S.oppName, me];
  const opp = validProfile(S.oppProfile) ? S.oppProfile : randomProfile([myProfile().avatar]);
  const players = hostSide === 0 ? [myProfile(), opp] : [opp, myProfile()];
  const start = { t: 'start', kind, hostSide, gameId: newGameId(), names, players };
  if (kind === 'half') start.deal = new HalfGame().deal;
  else start.fen = START_FEN;
  return start;
}

function startNetGame(m) {
  const kind = m.kind === 'half' ? 'half' : 'full';
  const mySide = S.link.role === 'host' ? m.hostSide : m.hostSide ^ 1;
  setupGame('net', mySide, m.names, { kind, startFen: m.fen || START_FEN, deal: m.deal, players: Array.isArray(m.players) && m.players.length === 2 ? m.players.map((p) => (validProfile(p) ? p : randomProfile())) : null });
  if (Array.isArray(m.proxy)) S.proxy = m.proxy.map(Boolean);
  S.gameId = m.gameId;
  S.netStarted = true;
  S.netStatus = '';
  S.curHostSide = m.hostSide;
  S.curStart = m;
  const g = S.game;
  for (const s of m.moves || []) { const mv = strToMove(g, s); if (mv != null && mv >= 0 && g.legalMoves().includes(mv)) g.play(mv); }
  if ((m.moves || []).length) showBoard(g);
  netWait(null);
  if (kind === 'half') chatSys(`半盤對局開始！您是${mySide === 0 ? '先手，請先翻一顆棋子' : '後手，對方先翻'}。翻出的第一顆棋子顏色就是翻的人的顏色。`);
  else chatSys(`對局開始！您執${SIDE_NAME[mySide]}${mySide === RED ? '，請先走' : '，紅方先走'}。`);
  updateGameUI();
  if (mySide === g.turn) sfx.turn();
  xk.win.attention('對局開始', kind === 'half' ? '半盤對局' : `您執${SIDE_NAME[mySide]}`);
}

async function onNetMsg(link, m) {
  const g = S.game;
  switch (m.t) {
    case 'busy':
      netWait(h('span', { class: 'err' }, '這個房間已經有人在下棋了'));
      link.close(); S.link = null;
      break;
    case 'old':
      netWait(h('span', { class: 'err' }, m.text || '版本不相容'));
      toast(m.text || '版本不相容', 'err', 8000);
      break;
    case 'hello':
      S.oppName = String(m.name || '對手').slice(0, 16);
      S.opponentVer = m.ver || 1;
      S.oppProfile = validProfile(m.profile) ? { avatar: m.profile.avatar, advisor: m.profile.advisor } : null;
      if (link.role === 'host') {
        if (S.hostKind === 'half' && S.opponentVer < 2) {
          link.send({ t: 'old', text: '房主開的是半盤，您的程式版本太舊，請先更新到最新版。' });
          link.send({ t: 'chat', text: '（系統）您的程式版本太舊，無法下半盤，請先更新。' });
          netWait(h('span', { class: 'err' }, `${S.oppName} 的程式版本太舊，無法下半盤，請對方先更新。`));
          return;
        }
        if (S.mode === 'net' && S.game && !S.game.result && S.netStarted) {
          // 斷線重連：把目前棋局送給對方
          link.send({ ...S.curStart, moves: S.game.moves.map((x) => moveToStr(S.game, x)), proxy: S.proxy });
          S.netStatus = '';
          chatSys('對手已重新連線');
          updateGameUI();
        } else {
          const half = S.hostKind === 'half';
          const hostSide = S.hostSide === (half ? 'first' : 'red') ? 0 : S.hostSide === (half ? 'second' : 'black') ? 1 : (Math.random() < 0.5 ? 0 : 1);
          const start = makeStart(hostSide, S.hostKind);
          link.send(start);
          startNetGame(start);
        }
      }
      break;
    case 'start':
      if (link.role === 'guest') { startNetGame(m); setTimeout(() => maybeAutoMove(), 800); }
      break;
    case 'move': {
      if (!g || S.mode !== 'net' || g.result) return;
      if (m.ply !== g.moves.length || g.turn === S.mySide) { link.send({ t: 'sync-req' }); return; }
      const mv = strToMove(g, m.mv);
      if (mv == null || mv < 0 || !g.legalMoves().includes(mv)) { link.send({ t: 'sync-req' }); return; }
      await applyMove(mv);
      break;
    }
    case 'sync-req':
      if (g && S.curStart) link.send({ t: 'sync', moves: g.moves.map((x) => moveToStr(g, x)) });
      break;
    case 'sync':
      if (g && link.role === 'guest' && S.curStart) {
        const ng = S.curStart.kind === 'half' ? new HalfGame(S.curStart.deal) : new Game(S.curStart.fen || START_FEN);
        for (const s of m.moves) { const mv = strToMove(ng, s); if (mv != null && mv >= 0 && ng.legalMoves().includes(mv)) ng.play(mv); }
        S.game = ng;
        showBoard(ng);
        updateGameUI();
      }
      break;
    case 'proxy': {
      if (!g) return;
      const oppIdx = S.mySide ^ 1;
      S.proxy[oppIdx] = !!m.on;
      const pr = S.players[oppIdx];
      const adv = labelOf(m.advisor || pr?.advisor);
      if (m.on) {
        popText(`對方換由 AI 軍師「${adv}」代打`, 'proxy');
        chatSys(`${S.oppName || '對方'} 暫時離開，主位換由 AI 軍師「${adv}」代打`);
        toast(`對方暫時離開，換 AI 軍師「${adv}」代打`, 'info', 5000);
      } else {
        popText(`${S.oppName || '對方'} 回到主位`, 'proxy');
        chatSys(`${S.oppName || '對方'} 回來了，主位換回「${labelOf(pr?.avatar)}」親自下棋`);
        toast('對方回到主位，親自下棋', 'info', 4000);
      }
      xk.win.attention('主位換人', m.on ? `對方改由 AI 軍師「${adv}」代打` : '對方回到主位');
      updateGameUI();
      break;
    }
    case 'undo-req': {
      if (!g || g.result) return;
      if (S.proxy[S.mySide]) { link.send({ t: 'undo-no' }); link.send({ t: 'chat', text: '（AI 軍師代打中，主位暫時離開，無法回覆悔棋）' }); return; }
      const ok = await modal('悔棋請求', `${S.oppName} 想要悔棋（退回 ${m.n} 步），同意嗎？`, [{ label: '不同意', value: false }, { label: '同意', value: true, primary: true }], { timeout: 30000, timeoutValue: false });
      if (ok && S.game === g && g.moves.length === m.ply) { link.send({ t: 'undo-ok', n: m.n }); doUndo(m.n); chatSys(`同意對方悔棋 ${m.n} 步`); }
      else link.send({ t: 'undo-no' });
      break;
    }
    case 'undo-ok': if (g) { doUndo(m.n); toast('對方同意悔棋', 'ok'); chatSys(`悔棋 ${m.n} 步`); } break;
    case 'undo-no': toast('對方不同意悔棋'); break;
    case 'draw-req': {
      if (!g || g.result) return;
      if (S.proxy[S.mySide]) { link.send({ t: 'draw-no' }); link.send({ t: 'chat', text: '（AI 軍師代打中，主位暫時離開，無法回覆和棋）' }); return; }
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
      if (S.proxy[S.mySide]) { link.send({ t: 'rematch-no' }); link.send({ t: 'chat', text: '（主位暫時離開，回來後再約下一局）' }); break; }
      const ok = await modal('再來一局', `${S.oppName} 想再下一局（${isHalf() ? '先後交換' : '紅黑交換'}），同意嗎？`, [{ label: '不要', value: false }, { label: '好啊', value: true, primary: true }], { timeout: 45000, timeoutValue: false });
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
  const hostSide = (S.curHostSide ?? 0) ^ 1; // 先後（紅黑）交換
  const start = makeStart(hostSide, S.kind);
  S.link.send(start);
  startNetGame(start);
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
const MODE_NAME = { ai: 'AI 對賽', net: '真人對賽', aivai: 'AI 對 AI', import: '匯入' };
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
    body.append(h('div', { class: 'empty' }, '還沒有棋譜。每下完一局都會自動收錄在這裡，AI 也會從整盤棋譜中學習。也可以「匯入棋譜」（支援中文記譜文字檔或本程式匯出的檔案）。'));
  } else {
    const table = h('table', { class: 'rec-table' },
      h('thead', {}, h('tr', {}, ...['日期', '盤式', '類型', '紅方', '黑方', '結果', '步數', '開局', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((g) => h('tr', {},
        h('td', {}, fmtDate(g.date)),
        h('td', {}, g.kind === 'half' ? '半盤' : '整盤'),
        h('td', {}, MODE_NAME[g.mode] || (g.source === 'import' ? '匯入' : g.mode || '')),
        h('td', {}, g.red || ''), h('td', {}, g.black || ''),
        h('td', { class: 'res' }, g.result === '1-0' ? '紅勝' : g.result === '0-1' ? '黑勝' : g.result === '1/2-1/2' ? '和棋' : '未完成'),
        h('td', {}, String(g.kind === 'half' ? g.plies : Math.ceil(g.plies / 2))),
        h('td', {}, g.opening || ''),
        h('td', { class: 'ops' },
          h('button', { onclick: () => openReplay(g.id) }, '重播'),
          h('button', { onclick: () => exportRecord(g.id) }, '匯出'),
          h('button', { class: 'danger', onclick: async () => { if (await modal('刪除棋譜', '確定刪除這份棋譜？', [{ label: '取消', value: false }, { label: '刪除', value: true, primary: true }])) { await xk.games.delete(g.id); await rebuildLearned(); renderRecords(); } } }, '刪除'))))));
    body.append(h('div', { class: 'rec-wrap' }, table));
  }
  renderLearnStat();
}

// 半盤文字棋譜：牌局（32 枚棋子代碼）＋動作
function parseHalfText(t) {
  const deal = /牌局[:：]\s*([\d\s,]+)/.exec(t);
  const acts = /動作[:：]\s*([^\r\n]+)/.exec(t);
  if (!deal) return null;
  const codes = deal[1].trim().split(/[\s,]+/).map(Number);
  if (codes.length !== 32) return null;
  return { kind: 'half', deal: codes, moves: acts ? acts[1].trim().split(/\s+/) : [] };
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
      if (j) recs = (Array.isArray(j) ? j : [j]).map((r) => ({ ...r, id: undefined }));
      else {
        const rec = parseHalfText(t) || parseTextRecord(t);
        const red = /紅方[:：]\s*(.+)/.exec(t), black = /黑方[:：]\s*(.+)/.exec(t);
        if (red) rec.red = red[1].trim().slice(0, 20);
        if (black) rec.black = black[1].trim().slice(0, 20);
        if (/結果[:：]\s*紅勝/.test(t)) rec.result = '1-0';
        else if (/結果[:：]\s*黑勝/.test(t)) rec.result = '0-1';
        else if (/結果[:：]\s*和/.test(t)) rec.result = '1/2-1/2';
        recs = [rec];
      }
      for (const r of recs) {
        const half = r.kind === 'half';
        const g = half ? replayHalf(r) : replayRecord(r);
        if (!g.moves.length) { bad++; continue; }
        const rec = g.toRecord({ mode: 'import', source: 'import', kind: half ? 'half' : 'full', red: r.red || f.name, black: r.black || '', opening: half ? '' : S.opening.nameOf(g) });
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
  const half = g.kind === 'half';
  const lines = [`[小柯機器人象棋遊戲 ${half ? '半盤' : ''}棋譜]`, `日期：${fmtDate(rec.date)}`, `紅方：${rec.red || ''}`, `黑方：${rec.black || ''}`,
    `結果：${rec.result === '1-0' ? '紅勝' : rec.result === '0-1' ? '黑勝' : rec.result === '1/2-1/2' ? '和棋' : '未完成'}${rec.reason ? '（' + rec.reason + '）' : ''}`];
  if (half) {
    lines.push('');
    g.notes.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
    lines.push('', `${rec.result || '*'}`, '', `牌局：${g.deal.join(' ')}`, `動作：${g.moves.map(actToStr).join(' ')}`);
    return lines.join('\r\n');
  }
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
  const g = rec.kind === 'half' ? replayHalf(rec) : replayRecord(rec);
  const name = `${rec.kind === 'half' ? '半盤' : ''}棋譜_${(rec.red || '紅方').replace(/[\\/:*?"<>|]/g, '')}_vs_${(rec.black || '黑方').replace(/[\\/:*?"<>|]/g, '')}_${(rec.id || '').slice(0, 8)}.txt`;
  const p = await xk.games.export(name, recordText(rec, g));
  if (p) toast('已匯出：' + p, 'ok', 5000);
}

async function exportCurrent() {
  if (S.mode === 'replay') return exportRecord(S.replay.rec.id);
  const g = S.game;
  if (!g || !g.moves.length) return;
  const rec = g.toRecord(recordMeta(g));
  const p = await xk.games.export(`${g.kind === 'half' ? '半盤' : ''}棋譜_${S.gameId.slice(0, 8)}.txt`, recordText(rec, g));
  if (p) toast('已匯出：' + p, 'ok', 5000);
}

// ---------------- 棋譜重播 ----------------
async function openReplay(id) {
  const rec = await xk.games.get(id);
  if (!rec) return;
  const half = rec.kind === 'half';
  const full = half ? replayHalf(rec) : replayRecord(rec);
  S.replay = { rec, game: full, ply: 0, timer: 0 };
  let names;
  if (half) {
    const firstRed = rec.firstColor !== 'black';
    names = firstRed ? [rec.red || '紅方', rec.black || '黑方'] : [rec.black || '黑方', rec.red || '紅方'];
  } else names = [rec.red || '紅方', rec.black || '黑方'];
  const recPlayers = Array.isArray(rec.players) && rec.players.length === 2 && rec.players.every(validProfile) ? rec.players : null;
  setupGame('replay', rec.mySide === 'black' && !half ? BLACK : RED, names, { kind: half ? 'half' : 'full', startFen: rec.startFen || START_FEN, deal: rec.deal, players: recPlayers });
  S.replay.game = full;
  replayGo(0);
  if (full.result) toast(resultText(full.result));
}

function replayGo(ply) {
  const r = S.replay;
  if (!r) return;
  const half = r.rec.kind === 'half';
  ply = Math.max(0, Math.min(r.game.moves.length, ply));
  let g;
  if (half) g = replayHalf(r.rec, ply);
  else { g = new Game(r.rec.startFen || START_FEN); for (let i = 0; i < ply; i++) g.play(r.game.moves[i]); }
  const forwardOne = ply === r.ply + 1;
  r.ply = ply;
  if (forwardOne && S.game) {
    const m = r.game.moves[ply - 1];
    S.game = g;
    if (half && isFlip(m)) { board.flipPiece(actFrom(m)); sfx.flip(); }
    else {
      board.animateMove(half ? actFrom(m) : moveFrom(m), half ? actTo(m) : moveTo(m));
      if (g.caps[ply - 1]) sfx.capture(); else sfx.move();
    }
  } else {
    S.game = g;
    showBoard(g);
  }
  const last = g.moves[g.moves.length - 1];
  if (half) board.setLastMove(last != null ? actFrom(last) : -1, last != null ? actTo(last) : -1);
  else {
    board.setLastMove(last ? moveFrom(last) : -1, last ? moveTo(last) : -1);
    board.setCheck(g.moves.length && g.checks[g.checks.length - 1] ? g.pos.kingSq[g.side] : -1);
  }
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

// ---------------- 關於與版本更新 ----------------
async function openAbout() {
  const status = h('div', { class: 'upd-status muted' }, '正在檢查是否有新版本…');
  const body = h('div', { class: 'about' },
    h('div', { class: 'about-head' }, h('div', { class: 'hero-piece small' }, '帥'),
      h('div', {}, h('h2', {}, '小柯機器人象棋遊戲'), h('div', { class: 'muted' }, `版本 v${S.info.version}　（${S.info.platform === 'darwin' ? 'macOS' : S.info.platform === 'win32' ? 'Windows' : S.info.platform}）`))),
    h('p', { class: 'credit-line' }, CREDIT),
    h('p', { class: 'muted small' }, '3D 中國象棋：整盤與半盤（暗棋）；與 AI 對賽、與真人遠端對賽（含語音）、AI 與 AI 對賽；20 首原創背景音樂；AI 軍師；自動收錄棋譜。'),
    h('p', { class: 'muted small' }, '半盤規則參考：github.com/lwher/Chinese-chess-half-mode'),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.settings.autoUpdate !== false, onchange: (e) => saveSettings({ autoUpdate: e.target.checked }) }), ' 開啟程式時自動檢查新版本'),
    status);
  const p = modal('關於與更新', body, [{ label: '關閉', value: false, primary: true }]);
  checkUpdate(true, status);
  await p;
}

// manual：使用者自己按的（沒有新版也要告知）；statusEl：關於視窗裡的狀態列
async function checkUpdate(manual, statusEl) {
  let info;
  try { info = await xk.update.check(); }
  catch (e) {
    if (statusEl) statusEl.textContent = '無法檢查更新：' + errMsg(e);
    return;
  }
  if (!info.newer) {
    if (statusEl) statusEl.textContent = `✅ 已經是最新版本（v${info.current}）`;
    return;
  }
  const go = () => startUpdate(info);
  if (statusEl) {
    statusEl.innerHTML = '';
    statusEl.append(h('span', {}, `🔔 有新版本 v${info.latest}（目前 v${info.current}）　`),
      h('button', { class: 'primary', id: 'btnDoUpdate', onclick: () => { $$('.modal-back').forEach((b) => b.remove()); go(); } }, '立即更新'));
    return;
  }
  const v = await modal(`發現新版本 v${info.latest}`, h('div', {},
    h('p', {}, `目前版本 v${info.current}，要更新到 v${info.latest} 嗎？`),
    info.notes ? h('pre', { class: 'upd-notes' }, info.notes) : null), [{ label: '稍後再說', value: false }, { label: '立即更新', value: true, primary: true }]);
  if (v) go();
}

async function startUpdate(info) {
  if (!info.canInstall) {
    const v = await modal('下載新版本', h('p', {}, info.flavor === 'dev' ? '目前是開發版，請到 GitHub 下載安裝檔。' : '找不到這個平台的安裝檔，請到 GitHub 下載。'), [{ label: '取消', value: false }, { label: '開啟下載頁', value: true, primary: true }]);
    if (v) xk.update.openPage();
    return;
  }
  const bar = h('div', { class: 'upd-bar' }, h('div', { class: 'upd-fill' }));
  const txt = h('div', { class: 'muted small' }, '準備下載…');
  const box = h('div', { class: 'upd-box' }, h('b', {}, `正在下載 v${info.latest}`), bar, txt);
  document.body.append(box);
  const off = xk.update.onProgress(({ got, total }) => {
    const pct = total ? Math.floor((got / total) * 100) : 0;
    bar.firstChild.style.width = pct + '%';
    txt.textContent = `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB（${pct}%）`;
  });
  try {
    const file = await xk.update.download();
    off();
    if (S.game && ['ai', 'net', 'aivai'].includes(S.mode)) await saveUnfinished();
    txt.textContent = info.flavor === 'mac' ? '下載完成，正在開啟安裝檔…' : '下載完成，正在安裝，程式會自動重新開啟…';
    const r = await xk.update.install(file);
    if (r.manual) {
      box.remove();
      await modal('請完成安裝', h('div', {},
        h('p', {}, '新版安裝檔已開啟（也放在「下載」資料夾）。'),
        h('p', {}, info.flavor === 'mac' ? '請先結束本程式，再把「小柯機器人象棋遊戲」拖到「應用程式」資料夾覆蓋舊版。' : '請依照畫面指示完成安裝。')));
    }
  } catch (e) {
    off();
    box.remove();
    toast('更新失敗：' + errMsg(e), 'err', 8000);
  }
}

// ---------------- 設定 ----------------
async function openSettings() {
  const s = S.settings;
  const f = {};
  const row = (label, el, tip) => h('div', { class: 'set-row' }, h('label', {}, label), el, tip ? h('div', { class: 'muted small' }, tip) : null);
  f.name = h('input', { value: s.playerName });
  f.sfx = h('input', { type: 'checkbox', checked: s.sfx });
  f.autoplay = h('input', { type: 'checkbox', checked: s.music.autoplay });
  f.autoUpdate = h('input', { type: 'checkbox', checked: s.autoUpdate !== false });
  f.proxyLevel = h('select', {}, LEVELS.map((l, i) => h('option', { value: i, selected: i === (s.proxyLevel ?? 3) }, l.name)));
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
    row('音效', h('label', { class: 'chk' }, f.sfx, ' 落子、吃子、翻子、將軍音效')),
    row('背景音樂', h('label', { class: 'chk' }, f.autoplay, ' 開啟程式後自動播放')),
    row('版本更新', h('label', { class: 'chk' }, f.autoUpdate, ' 開啟程式時自動檢查新版本')),
    row('頭像與 AI 軍師', h('button', { onclick: async () => { await ensureProfile(true); } }, '更換頭像與軍師')),
    row('軍師代打的棋力', f.proxyLevel, '暫時離開時，AI 軍師用這個難度替您下棋。'),
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
    h('p', { class: 'credit-line small' }, `小柯機器人象棋遊戲 v${S.info.version}．${CREDIT}`),
  );
  const ok = await modal('設定', body, [{ label: '取消', value: false }, { label: '儲存', value: true, primary: true }]);
  if (ok) { await applySettings(f); toast('設定已儲存', 'ok'); renderHome(); }
}

async function applySettings(f) {
  const patch = {
    playerName: f.name.value.trim() || '棋友',
    sfx: f.sfx.checked,
    autoUpdate: f.autoUpdate.checked,
    proxyLevel: Number(f.proxyLevel.value),
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
