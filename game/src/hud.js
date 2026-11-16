// hud.js: health, ammo, round timer, money, scores, kill feed and the buy menu.
import { WEAPONS, BUYABLE } from './weapon.js';

const el = (id) => document.getElementById(id);

export function createHud(onBuy) {
  return {
    onBuy,
    feed: [],
    buyOpen: false,
    lastHealth: -1,
  };
}

export function addFeed(hud, text) {
  hud.feed.unshift(text);
  if (hud.feed.length > 4) hud.feed.pop();
  const box = el('killfeed');
  if (box) box.innerHTML = hud.feed.map((t) => `<li>${t}</li>`).join('');
}

// One-time DOM: status strip under the ammo counter for RELOADING / empty-mag.
// Elements are created lazily and only toggled, never rebuilt per frame.
let statusEl = null;
function status() {
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'ammo-status';
    statusEl.style.cssText = 'font-size:11px;letter-spacing:1px;margin-top:2px;color:var(--accent, #c25038);min-height:14px;';
    const ammo = el('ammo');
    if (ammo && ammo.parentNode) ammo.parentNode.insertBefore(statusEl, ammo.nextSibling);
  }
  return statusEl;
}

export function setAmmoHint(show) {
  const s = status();
  s.dataset.hint = show ? '1' : '';
  refreshStatus();
}

function refreshStatus() {
  if (!statusEl) return;
  const reloading = statusEl.dataset.reloading === '1';
  const hint = statusEl.dataset.hint === '1';
  statusEl.textContent = reloading ? 'RELOADING' : (hint ? 'MAG EMPTY - grab an ammo crate' : '');
}

export function updateHud(hud, state) {
  const { player, weapon, rounds, phase } = state;
  const hp = el('hud-health');
  if (hp) { hp.textContent = Math.round(player.health); hp.classList.toggle('low', player.health < 35); }
  const ar = el('hud-armor'); if (ar) ar.textContent = Math.round(player.armor);
  const mag = el('ammo-mag'); if (mag) mag.textContent = weapon.reloading > 0 ? '--' : weapon.mag;
  const res = el('ammo-reserve'); if (res) res.textContent = `/ ${weapon.reserve}`;
  const ammo = el('ammo'); if (ammo) ammo.classList.toggle('empty', weapon.mag <= 5);
  // RELOADING indicator: on while a reload is in progress
  const reloading = weapon.reloading > 0;
  const s = status();
  if (s) {
    const was = s.dataset.reloading === '1';
    if (was !== reloading) { s.dataset.reloading = reloading ? '1' : ''; refreshStatus(); }
  }
  const timer = el('hud-timer');
  if (timer) {
    const t = Math.max(0, Math.ceil(rounds.timer));
    timer.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    timer.classList.toggle('buy', rounds.phase === 'buy');
  }
  const money = el('hud-money'); if (money) money.textContent = `$${player.money}`;
  const b = el('score-blue'); if (b) b.textContent = rounds.score[0];
  const o = el('score-orange'); if (o) o.textContent = rounds.score[1];
  const rn = el('hud-round'); if (rn) rn.textContent = `ROUND ${rounds.round}`;
  const wpn = el('hud-weapon'); if (wpn) wpn.textContent = WEAPONS[weapon.type].name;
  renderScoreboard(hud, state);
  const ch = el('crosshair');
  if (ch) ch.style.transform = `translate(-50%, -50%) scale(${1 + (weapon.currentSpread || 0) * 18})`;
}

export function toggleBuyMenu(hud, player) {
  hud.buyOpen = !hud.buyOpen;
  const menu = el('buymenu');
  if (!menu) return;
  menu.hidden = !hud.buyOpen;
  if (hud.buyOpen) {
    menu.innerHTML = BUYABLE.map((k) => {
      const w = WEAPONS[k];
      const afford = player.money >= w.price;
      return `<button data-buy="${k}" ${afford ? '' : 'disabled'}><b>${w.name}</b><span>$${w.price}</span></button>`;
    }).join('');
  }
}

export function handleBuyClick(hud, player, onEquip) {
  const menu = el('buymenu');
  if (!menu) return;
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-buy]');
    if (!btn) return;
    const key = btn.dataset.buy;
    const price = WEAPONS[key].price;
    if (player.money < price) return;
    player.money -= price;
    onEquip(key);
    toggleBuyMenu(hud, player);
  });
}

// scoreboard: hold Tab (or shown automatically at match end); lists kills/deaths
export function renderScoreboard(hud, state) {
  const sb = el('scoreboard');
  if (!sb) return;
  const show = !!(state.scoreboard || state.rounds.matchOver);
  sb.hidden = !show;
  if (!show) return;
  const rows = state.everyone
    .slice()
    .sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths))
    .map((p) => {
      const name = p === state.player ? 'You' : (p.team === 0 ? 'Blue bot' : 'Orange bot');
      const cls = p.team === 0 ? 'blue' : 'orange';
      return `<tr><td class="${cls}">${name}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`;
    })
    .join('');
  sb.innerHTML = `<h2>SCOREBOARD - ${state.rounds.score[0]} : ${state.rounds.score[1]}</h2>
    <table><tr><th>Player</th><th>K</th><th>D</th></tr>${rows}</table>`;
}
