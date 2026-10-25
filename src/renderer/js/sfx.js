// 音效（WebAudio 即時合成：落子木頭聲、吃子、將軍、勝負）
let ctx = null;
let enabled = true;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

export function setSfx(on) { enabled = !!on; }

function tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.002, decay = dur, when = 0, slide = 0 } = {}) {
  const c = ac();
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, { gain = 0.3, freq = 2000, q = 1, when = 0 } = {}) {
  const c = ac();
  const t = c.currentTime + when;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.18));
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  move() {
    if (!enabled) return;
    noise(0.08, { gain: 0.5, freq: 1800, q: 2.5 });
    tone(520, 0.09, { gain: 0.22, slide: 0.7 });
    tone(1150, 0.05, { gain: 0.08 });
  },
  capture() {
    if (!enabled) return;
    noise(0.12, { gain: 0.6, freq: 1300, q: 1.8 });
    tone(380, 0.14, { gain: 0.3, slide: 0.6 });
    noise(0.08, { gain: 0.35, freq: 2400, q: 3, when: 0.07 });
    tone(700, 0.08, { gain: 0.12, when: 0.07, slide: 0.8 });
  },
  check() {
    if (!enabled) return;
    tone(880, 0.25, { type: 'triangle', gain: 0.18, when: 0.02 });
    tone(1320, 0.35, { type: 'triangle', gain: 0.14, when: 0.12 });
  },
  flip() {
    if (!enabled) return;
    noise(0.06, { gain: 0.35, freq: 2600, q: 2 });
    tone(760, 0.12, { type: 'triangle', gain: 0.12, slide: 1.4 });
    noise(0.07, { gain: 0.45, freq: 1500, q: 2.2, when: 0.42 });
    tone(480, 0.08, { gain: 0.18, slide: 0.7, when: 0.42 });
  },
  select() {
    if (!enabled) return;
    tone(1400, 0.05, { gain: 0.06 });
  },
  illegal() {
    if (!enabled) return;
    tone(220, 0.15, { type: 'square', gain: 0.05, slide: 0.8 });
  },
  win() {
    if (!enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.16, when: i * 0.13 }));
  },
  lose() {
    if (!enabled) return;
    [440, 392, 349, 262].forEach((f, i) => tone(f, 0.55, { type: 'triangle', gain: 0.14, when: i * 0.17 }));
  },
  turn() {
    if (!enabled) return;
    tone(988, 0.12, { type: 'sine', gain: 0.12 });
    tone(1319, 0.2, { type: 'sine', gain: 0.1, when: 0.1 });
  },
  resume() { try { ac().resume(); } catch {} },
};
