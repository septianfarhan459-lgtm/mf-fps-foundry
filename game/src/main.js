// main.js: wires the game together - boot, loop, shooting, grenades, pickups, scoreboard, rounds.
import * as THREE from 'three';
import { createEngine, TICK } from './engine.js';
import { initInput, consumeLook, mouse, keys, pollGamepad, gamepad } from './input.js';
import { buildWorld, spawns, TEAM_BLUE, TEAM_ORANGE, colliders } from './world.js';
import { createPlayer, updatePlayer, eyePos, damage } from './player.js';
import { createWeapon, updateWeapon, tryFire, startReload, switchWeapon, WEAPONS, addTracer, updateTracers, HITMARKER_DELAY } from './weapon.js';
import { createBots, updateBot } from './bots.js';
import { createRounds, startRound, updateRounds, KILL_REWARD } from './rounds.js';
import { createHud, updateHud, addFeed, toggleBuyMenu, handleBuyClick, renderScoreboard, setAmmoHint } from './hud.js';
import { createGrenades, throwGrenade, updateGrenades, GRENADE_COUNT } from './grenade.js';
import { createPickups, updatePickups } from './pickups.js';
import { initMinimap } from './minimap.js';
import { initDamageFeed } from './damagefeed.js';
import { unlockAudio, playShot, playFootstep, playReload } from './sfx.js';

const container = document.getElementById('game');
const engine = createEngine(container);
const { scene, camera, view, sim } = engine;

buildWorld(scene);
initInput(engine.renderer.domElement);

// players: human on blue, 5 bots orange, 4 bot teammates blue
const player = createPlayer(TEAM_BLUE);
player.pos.set(...spawns[TEAM_BLUE][0]);
const botsBlue = createBots(scene, TEAM_BLUE, 4);
const botsOrange = createBots(scene, TEAM_ORANGE, 5);
botsBlue.forEach((b, i) => { b.pos.set(...spawns[TEAM_BLUE][i + 1]); });
botsOrange.forEach((b, i) => { b.pos.set(...spawns[TEAM_ORANGE][i]); });
const everyone = [player, ...botsBlue, ...botsOrange];

const weapon = createWeapon();
const rounds = createRounds();
const hud = createHud();
const grenades = createGrenades();
const pickups = createPickups(scene);
const damageFeed = initDamageFeed(camera);
let kills = 0;

// radar overlay: canvas built from colliders + roster once, updated per frame
const updateMinimap = initMinimap(scene, colliders, everyone);

// scratch objects: reused every shot so the fire loop allocates nothing per frame
const _eye = new THREE.Vector3(), _dir = new THREE.Vector3(), _ray = new THREE.Raycaster();
const _tmp = new THREE.Vector3();
const _hitDir = new THREE.Vector3();
const _bodyBox = new THREE.Box3(), _headBox = new THREE.Box3();
const _bodySize = new THREE.Vector3(0.7, 1.1, 0.5), _bodyCenter = new THREE.Vector3();
const _headSize = new THREE.Vector3(0.45, 0.45, 0.45), _headCenter = new THREE.Vector3();
const _bodyHit = new THREE.Vector3(), _headHit = new THREE.Vector3();
const _end = new THREE.Vector3();

function teamLabel(team) { return team === TEAM_ORANGE ? 'orange' : 'blue'; }

function killCredit(killerName, victim, head) {
  const t = teamLabel(victim.team);
  addFeed(hud, `<b>${killerName}</b> killed <span class="${t}">${t === 'orange' ? 'Orange' : 'Blue'}</span>${head ? ' HEADSHOT' : ''}`);
  checkRoundEnd();
}

function shoot() {
  const spec = WEAPONS[weapon.type];
  eyePos(player, _eye);
  camera.getWorldDirection(_dir);
  // spread
  const s = weapon.currentSpread || spec.spread;
  _dir.x += (Math.random() - 0.5) * s * 2;
  _dir.y += (Math.random() - 0.5) * s * 2;
  _dir.z += (Math.random() - 0.5) * s * 2;
  _dir.normalize();
  _ray.set(_eye, _dir);
  _ray.far = 120;

  let bestDist = Infinity, bestPoint = null, victim = null, headshot = false;
  for (const other of everyone) {
    if (other === player || !other.alive || other.team === player.team) continue;
    _bodyCenter.set(other.pos.x, other.pos.y + 0.9, other.pos.z);
    _headCenter.set(other.pos.x, other.pos.y + 1.72, other.pos.z);
    _bodyBox.setFromCenterAndSize(_bodyCenter, _bodySize);
    _headBox.setFromCenterAndSize(_headCenter, _headSize);
    const hitBody = _ray.ray.intersectBox(_bodyBox, _bodyHit);
    const hitHead = _ray.ray.intersectBox(_headBox, _headHit);
    const hit = hitHead || hitBody;
    if (hit) {
      const d = hit.distanceTo(_eye);
      if (d < bestDist) { bestDist = d; bestPoint = hit; victim = other; headshot = !!hitHead; }
    }
  }
  // world hit for tracer endpoint
  const wallHit = _ray.intersectObjects(scene.children, true).filter((h) => !h.object.parent || !h.object.parent.isGroup)[0];
  if (bestPoint) _end.copy(bestPoint);
  else if (wallHit) _end.copy(wallHit.point);
  else _end.copy(_eye).addScaledVector(_dir, 120);
  addTracer(scene, _eye, _end);
  playShot(weapon.type);
  if (victim) {
    const falloff = Math.max(0.55, 1 - bestDist / 90);
    const killed = damage(victim, spec.dmg * falloff, headshot);
    showHitmarker();
    if (killed) {
      player.money = Math.min(16000, player.money + KILL_REWARD);
      player.kills++;
      kills++;
      killCredit('You', victim, headshot);
    }
  }
}

function botShoot(bot, target, dmg) {
  eyePos(bot, _eye);
  if (target) {
    eyePos(target, _tmp);
    _tmp.x += (Math.random() - 0.5) * 0.3;
    _tmp.z += (Math.random() - 0.5) * 0.3;
    addTracer(scene, _eye, _tmp);
    const killed = damage(target, dmg, false);
    // when the player is the victim, flash the directional indicator toward
    // the attacker and pop a floating damage number
    if (target === player && player.alive) {
      _hitDir.subVectors(_eye, player.pos);
      damageFeed.showHitFrom(_hitDir, dmg);
    }
    if (killed) {
      bot.kills++;
      if (target === player) respawnPlayer();
      const bn = bot.team === TEAM_ORANGE ? 'Orange' : 'Blue';
      const vt = teamLabel(target.team);
      addFeed(hud, `<b>${bn}</b> killed <span class="${vt}">${vt === 'orange' ? 'Orange' : 'Blue'}</span>`);
      checkRoundEnd();
    }
  }
}

function showHitmarker() {
  const hm = document.getElementById('hitmarker');
  if (!hm) return;
  hm.classList.add('on');
  clearTimeout(hm._t);
  hm._t = setTimeout(() => hm.classList.remove('on'), HITMARKER_DELAY);
}

function respawnPlayer() {
  player.alive = false;
  setTimeout(() => {
    const s = spawns[TEAM_BLUE][(kills + 1) % spawns[TEAM_BLUE].length];
    player.pos.set(s[0], 0.1, s[2]);
    player.vel.set(0, 0, 0);
    player.alive = true;
    player.health = 100;
  }, 2500);
}

function checkRoundEnd() {
  let blueAlive = 0, orangeAlive = 0;
  for (const p of everyone) {
    if (!p.alive) continue;
    if (p.team === TEAM_BLUE) blueAlive++; else orangeAlive++;
  }
  if (rounds.phase === 'live' && (blueAlive === 0 || orangeAlive === 0)) updateRounds(rounds, 0.001, everyone);
}

// start: click-to-play unlocks audio and locks the pointer; ?shot=... starts
// headlessly without pointer lock for reproducible automation captures.
function begin() {
  startRound(rounds, everyone);
}
document.getElementById('play').addEventListener('click', () => {
  document.getElementById('overlay').hidden = true;
  unlockAudio();
  engine.renderer.domElement.requestPointerLock();
  begin();
});
if (new URLSearchParams(location.search).has('shot')) {
  const q = new URLSearchParams(location.search);
  const yaw = parseFloat(q.get('yaw')); if (!Number.isNaN(yaw)) player.yaw = yaw;
  const pitch = parseFloat(q.get('pitch')); if (!Number.isNaN(pitch)) player.pitch = pitch;
  const pos = q.get('pos');
  if (pos) { const [x, z] = pos.split(',').map(Number); if (!Number.isNaN(x) && !Number.isNaN(z)) { player.pos.x = x; player.pos.z = z; } }
  begin();
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') { if (startReload(weapon)) playReload(); }
  if (e.code === 'KeyB' && rounds.phase === 'buy') toggleBuyMenu(hud, player);
  if (e.code === 'Digit1') switchWeapon(weapon, 'rifle');
  if (e.code === 'Digit2') switchWeapon(weapon, 'smg');
  if (e.code === 'Digit3') switchWeapon(weapon, 'sniper');
  if (e.code === 'KeyG' && player.alive && grenades.held > 0) {
    eyePos(player, _eye);
    camera.getWorldDirection(_dir);
    if (throwGrenade(grenades, scene, _eye, _dir)) {
      addFeed(hud, `<b>You</b> threw a grenade (${grenades.held} left)`);
    }
  }
  if (e.code === 'Tab') { e.preventDefault(); hud.scoreboard = true; }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.scoreboard = false;
});
handleBuyClick(hud, player, (key) => { switchWeapon(weapon, key); });

// camera update per frame
view.callbacks.push(() => {
  eyePos(player, _eye);
  camera.position.copy(_eye);
  camera.rotation.set(player.pitch - weapon.recoilPitch, player.yaw, 0, 'YXZ');
});

// fixed-step systems
let footTimer = 0;
let ammoHint = false;
sim.systems.push((dt, tick) => {
  const look = consumeLook();
  // gamepad: poll the pad each tick; its look deltas ride the same channel
  // as the mouse (added into `look`), its stick feeds movement intents.
  const padLive = pollGamepad();
  // Pad movement maps onto the WASD intents, but only while the stick is
  // actually deflected - a centred stick must release the mirrored keys so
  // a tap of the keyboard afterwards is not fought by a stale pad hold.
  const padAxes = { KeyW: 0, KeyS: 0, KeyA: 0, KeyD: 0 };
  if (padLive) {
    look[0] += gamepad.look[0];
    look[1] += gamepad.look[1];
    if (gamepad.move[1] > 0.01) padAxes.KeyW = 1;
    if (gamepad.move[1] < -0.01) padAxes.KeyS = 1;
    if (gamepad.move[0] > 0.01) padAxes.KeyD = 1;
    if (gamepad.move[0] < -0.01) padAxes.KeyA = 1;
    if (gamepad.fire) mouse.fire = true;
  }
  for (const k in padAxes) keys[k] = keys[k] || padAxes[k];
  const moving = Math.hypot(player.vel.x, player.vel.z) > 1;
  updatePlayer(player, dt, look);
  updateWeapon(weapon, dt, moving, !player.onGround);

  // footsteps
  if (player.alive && player.onGround && moving) {
    footTimer -= dt;
    if (footTimer <= 0) { playFootstep(!player.crouch); footTimer = player.crouch ? 0.55 : 0.38; }
  } else footTimer = 0;

  // ammo hint: when the mag runs dry, point the player at the yellow crates
  const wantHint = weapon.mag === 0 && player.alive;
  if (wantHint !== ammoHint) { ammoHint = wantHint; setAmmoHint(ammoHint); }

  if (mouse.fire && player.alive && rounds.phase === 'live' && tryFire(weapon, true)) shoot();
  updateTracers(dt);

  // grenades
  updateGrenades(grenades, scene, dt, everyone, (victim) => {
    if (victim === player) { respawnPlayer(); }
    else {
      player.money = Math.min(16000, player.money + KILL_REWARD);
      player.kills++;
    }
    killCredit('Your grenade', victim, false);
  });
  if (rounds.phase === 'buy' && grenades.held < GRENADE_COUNT) grenades.held = GRENADE_COUNT;

  // ammo pickups
  updatePickups(pickups, dt, player, weapon);

  for (const bot of botsOrange) updateBot(bot, dt, player.alive ? player : botsBlue.find((m) => m.alive) || null, everyone, botShoot);
  const orangeTarget = botsOrange.find((m) => m.alive) || null;
  for (const bot of botsBlue) updateBot(bot, dt, orangeTarget, everyone, botShoot);

  updateRounds(rounds, dt, everyone, (winner) => {
    if (rounds.drawn) addFeed(hud, `<b>round drawn</b> - even teams at time`);
    else addFeed(hud, `<b>${winner === TEAM_BLUE ? 'BLUE' : 'ORANGE'} wins the round</b>`);
    if (rounds.matchOver) hud.scoreboard = true;
  });
  if (rounds.phase === 'over' && rounds.timer <= 0 && !rounds.matchOver) startRound(rounds, everyone);
});

// HUD per frame
const hudState = { player, weapon, rounds, everyone, grenades, scoreboard: false };
view.callbacks.push(() => {
  updateMinimap(); // radar redraw, allocation-free
  damageFeed.update(engine.view.delta);
  updateHud(hud, { ...hudState, scoreboard: hud.scoreboard });
  const copy = document.getElementById('overlay-copy');
  if (copy && rounds.phase === 'over') copy.textContent = rounds.matchOver
    ? `Match over - ${rounds.score[0]} : ${rounds.score[1]} - reload to play again`
    : `Round ${rounds.round} over - ${rounds.score[0]} : ${rounds.score[1]}`;
});
