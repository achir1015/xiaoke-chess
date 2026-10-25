// 遠端對賽連線：PeerJS（WebRTC 資料通道＋語音）
import { Emitter, errMsg } from './util.js';

const PeerCtor = () => window.Peer || (window.peerjs && window.peerjs.Peer);
export const PREFIX = 'xkchess-';
export const PROTOCOL = 2; // 2：支援半盤

export function iceServers(s) {
  const list = String(s.stun || '').split(/\s+/).filter(Boolean).map((u) => ({ urls: u }));
  if (s.turn && s.turn.urls) list.push({ urls: s.turn.urls.split(/[\s,]+/).filter(Boolean), username: s.turn.username, credential: s.turn.credential });
  return list;
}

function peerOptions(s) {
  const o = { debug: 1, config: { iceServers: iceServers(s), sdpSemantics: 'unified-plan' } };
  if (s.server && s.server.mode === 'custom' && s.server.host) {
    Object.assign(o, { host: s.server.host, port: Number(s.server.port) || (s.server.secure ? 443 : 9000), path: s.server.path || '/', key: s.server.key || 'peerjs', secure: !!s.server.secure });
  }
  return o;
}

function openPeer(id, settings) {
  return new Promise((resolve, reject) => {
    const Peer = PeerCtor();
    if (!Peer) { reject(new Error('連線元件載入失敗')); return; }
    const peer = id ? new Peer(id, peerOptions(settings)) : new Peer(peerOptions(settings));
    let opened = false;
    const t = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('連不上配對伺服器，請檢查網路或「設定」中的伺服器')); } }, 20000);
    peer.on('open', () => { opened = true; clearTimeout(t); resolve(peer); });
    peer.on('error', (e) => { if (!opened) { clearTimeout(t); peer.destroy(); reject(e); } });
  });
}

const randomCode = () => String(100000 + Math.floor(Math.random() * 900000));

// 一場遠端對局的連線
export class GameLink extends Emitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.peer = null;
    this.conn = null;
    this.role = null; // host | guest
    this.code = '';
    this.closed = false;
    this.lastSeen = 0;
  }

  // 建立房間：回傳房間號碼
  async host() {
    this.role = 'host';
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      try {
        this.peer = await openPeer(PREFIX + code, this.settings);
        this.code = code;
        break;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        throw new Error(e.type === 'unavailable-id' ? '房號重複' : errMsg(e));
      }
    }
    if (!this.peer) throw new Error('無法建立房間，請稍後再試');
    this._bindPeer();
    this.peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) {
        conn.on('open', () => { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 300); });
        return;
      }
      this._attach(conn);
    });
    return this.code;
  }

  // 加入房間
  async join(code) {
    this.role = 'guest';
    this.code = String(code).replace(/\D/g, '');
    if (this.code.length !== 6) throw new Error('房間號碼是 6 位數字');
    this.peer = await openPeer(null, this.settings);
    this._bindPeer();
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      const t = setTimeout(() => { reject(new Error('找不到這個房間，請確認房號或請對方重新建立')); }, 20000);
      const onErr = (e) => { if (e && e.type === 'peer-unavailable') { clearTimeout(t); reject(new Error('找不到這個房間，請確認房號')); } };
      this.peer.on('error', onErr);
      conn.on('open', () => { clearTimeout(t); this.peer.off('error', onErr); this._attach(conn); resolve(); });
    });
  }

  _bindPeer() {
    this.peer.on('call', (call) => this.emit('call', call));
    this.peer.on('disconnected', () => { if (!this.closed) { try { this.peer.reconnect(); } catch {} } });
    this.peer.on('error', (e) => { if (e && e.type !== 'peer-unavailable') console.warn('peer error', e.type, e); });
  }

  _attach(conn) {
    this.conn = conn;
    this.lastSeen = Date.now();
    const ready = () => {
      this.emit('connected', conn.peer);
      clearInterval(this.hb);
      this.hb = setInterval(() => {
        if (Date.now() - this.lastSeen > 15000) { this._lost(); return; }
        this.send({ t: 'ping' });
      }, 3000);
    };
    conn.on('data', (m) => {
      this.lastSeen = Date.now();
      if (!m || typeof m !== 'object') return;
      if (m.t === 'ping') return;
      if (m.t === 'bye') { this._lost('對方已離開'); return; }
      this.emit('msg', m);
    });
    conn.on('close', () => this._lost());
    conn.on('error', (e) => console.warn('conn error', e));
    if (conn.open) ready(); else conn.on('open', ready);
  }

  _lost(reason = '連線中斷') {
    if (!this.conn) return;
    clearInterval(this.hb);
    const c = this.conn;
    this.conn = null;
    try { c.close(); } catch {}
    this.emit('lost', reason);
  }

  get connected() { return !!(this.conn && this.conn.open); }
  get remotePeerId() { return this.conn ? this.conn.peer : ''; }

  send(m) { if (this.conn && this.conn.open) this.conn.send(m); }

  call(stream) { return this.peer.call(this.remotePeerId, stream, { metadata: { kind: 'voice' } }); }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.send({ t: 'bye' }); } catch {}
    clearInterval(this.hb);
    setTimeout(() => {
      try { this.conn && this.conn.close(); } catch {}
      try { this.peer && this.peer.destroy(); } catch {}
    }, 200);
  }
}
