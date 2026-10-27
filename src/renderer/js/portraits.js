// 半身頭像：英雄（男）、佳人（女）、軍師（男女各半）
import { $$, h, modal } from './util.js';

const BASE = '../../assets/portraits/';
let list = [];
let byId = new Map();

export async function loadPortraits() {
  const r = await fetch(BASE + 'portraits.json');
  list = await r.json();
  byId = new Map(list.map((p) => [p.id, p]));
  return list;
}

export const portraitUrl = (id) => BASE + (byId.has(id) ? id : 'm01') + '.svg';
export const portraitOf = (id) => byId.get(id) || null;
export const players = () => list.filter((p) => p.group !== 'advisor');
export const advisors = () => list.filter((p) => p.group === 'advisor');
export const labelOf = (id) => (byId.get(id) ? byId.get(id).label : '');
export const validProfile = (pr) => !!(pr && byId.get(pr.avatar) && byId.get(pr.avatar).group !== 'advisor' && byId.get(pr.advisor) && byId.get(pr.advisor).group === 'advisor');

// 隨機挑選（避開已用的）
export function randomProfile(avoid = []) {
  const pick = (arr) => { const a = arr.filter((p) => !avoid.includes(p.id)); const s = a.length ? a : arr; return s[Math.floor(Math.random() * s.length)].id; };
  return { avatar: pick(players()), advisor: pick(advisors()) };
}

// 選擇頭像與軍師（required：必須選好才能關閉）
export function pickProfile(current, { required = false } = {}) {
  const sel = { avatar: current && current.avatar, advisor: current && current.advisor };
  const grid = (items, key) => h('div', { class: 'pf-grid' }, items.map((p) => h('button', {
    class: 'pf-item' + (sel[key] === p.id ? ' on' : ''), 'data-id': p.id, 'data-key': key, title: p.label,
    onclick: (e) => {
      sel[key] = p.id;
      $$(`.pf-item[data-key="${key}"]`).forEach((b) => b.classList.toggle('on', b.dataset.id === p.id));
      refresh();
    },
  }, h('img', { src: portraitUrl(p.id), alt: p.label, loading: 'lazy' }), h('span', {}, p.label))));
  const preview = h('div', { class: 'pf-preview' });
  const okHint = h('div', { class: 'pf-hint' });
  const refresh = () => {
    preview.innerHTML = '';
    preview.append(
      h('div', { class: 'pf-slot' }, sel.avatar ? h('img', { src: portraitUrl(sel.avatar) }) : h('div', { class: 'pf-empty' }, '請選擇'), h('b', {}, sel.avatar ? labelOf(sel.avatar) : '我的頭像')),
      h('div', { class: 'pf-slot small' }, sel.advisor ? h('img', { src: portraitUrl(sel.advisor) }) : h('div', { class: 'pf-empty' }, '請選擇'), h('b', {}, sel.advisor ? labelOf(sel.advisor) : '我的 AI 軍師')));
    okHint.textContent = sel.avatar && sel.advisor ? '' : '頭像和 AI 軍師都要選好喔';
    const ok = document.querySelector('.modal .pf-ok');
    if (ok) ok.disabled = !(sel.avatar && sel.advisor);
  };
  const tabs = h('div', { class: 'pf-tabs' });
  const panes = {
    hero: h('div', { class: 'pf-pane on' }, h('h4', {}, '男英雄（依姓氏）'), grid(list.filter((p) => p.group === 'hero'), 'avatar')),
    beauty: h('div', { class: 'pf-pane' }, h('h4', {}, '女佳人（依姓氏）'), grid(list.filter((p) => p.group === 'beauty'), 'avatar')),
    advisor: h('div', { class: 'pf-pane' }, h('h4', {}, 'AI 軍師（男女各 10 位）'), grid(advisors(), 'advisor')),
  };
  for (const [k, t] of [['hero', '① 男英雄'], ['beauty', '① 女佳人'], ['advisor', '② AI 軍師']]) {
    tabs.append(h('button', { class: 'pf-tab' + (k === 'hero' ? ' on' : ''), 'data-k': k, onclick: () => {
      $$('.pf-tab').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      Object.entries(panes).forEach(([kk, el]) => el.classList.toggle('on', kk === k));
    } }, t));
  }
  if (sel.avatar && portraitOf(sel.avatar)?.group === 'beauty') setTimeout(() => document.querySelector('.pf-tab[data-k="beauty"]')?.click(), 0);
  const body = h('div', { class: 'pf' }, h('p', { class: 'muted' }, '比賽時雙方都會顯示自己的頭像和 AI 軍師。請先選一位英雄或佳人當作您的頭像，再選一位 AI 軍師（需要時可以請軍師代打）。'),
    h('div', { class: 'pf-body' }, h('div', { class: 'pf-left' }, tabs, ...Object.values(panes)), h('div', { class: 'pf-right' }, preview, okHint)));
  setTimeout(refresh, 0);
  const buttons = required ? [{ label: '確定', value: true, primary: true }] : [{ label: '取消', value: false }, { label: '確定', value: true, primary: true }];
  return modal('選擇頭像與 AI 軍師', body, buttons, { okClass: 'pf-ok' }).then((v) => (v && sel.avatar && sel.advisor ? { avatar: sel.avatar, advisor: sel.advisor } : null));
}
