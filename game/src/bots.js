// bots.js: enemy team - waypoint patrol, line of sight, engage, burst fire and
// a wounded "take cover" behaviour that breaks line of sight before re-peeking.
import * as THREE from 'three';
import { colliders, waypoints, waypointLinks } from './world.js';
import { createPlayer, eyePos } from './player.js';
import { WEAPONS } from './weapon.js';

const BOT_SPEED = 4.6, SIGHT = 55, FIRE_CD = 0.42;
// burst fire: 2-3 rounds fired 0.12s apart instead of a single lonely shot
const BURST_GAP = 0.12, BURST_MIN = 2, BURST_MAX = 3;
// take cover: a hurt bot hugs the nearest solid box and holds for 1.5s
const COVER_HEALTH = 40, COVER_WAIT = 1.5, COVER_RADIUS = 20, COVER_REENTER = 3.0;

function boxMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.45), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshLambertMaterial({ color: 0xf0e6d2 }));
  head.position.y = 1.72;
  head.name = 'head';
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), new THREE.MeshLambertMaterial({ color: 0x2b3038 }));
  legs.position.y = 0.15;
  g.add(body, head, legs);
  return g;
}

export function createBots(scene, team, count) {
  const bots = [];
  for (let i = 0; i < count; i++) {
    const p = createPlayer(team);
    p.isBot = true;
    p.mesh = boxMesh(team === 0 ? 0x3f7ac2 : 0xc25038);
    p.mesh.visible = false;
    scene.add(p.mesh);
    p.wp = 0; p.state = 'patrol'; p.fireCd = 0; p.strafe = Math.random() < 0.5 ? 1 : -1;
    p.reaction = 0.25 + Math.random() * 0.35;
    p.aimError = 0.05 + Math.random() * 0.1; // tuned: tighter base inaccuracy
    p.path = [];
    p.lastSeen = null;
    // burst + cover bookkeeping
    p.burst = 0; p.burstIdx = 0; p.burstCd = 0;
    p.coverPos = null; p.coverWait = 0; p.coverCd = 0;
    bots.push(p);
  }
  return bots;
}

function neighbours(i) {
  const out = [];
  for (const [a, b] of waypointLinks) { if (a === i) out.push(b); else if (b === i) out.push(a); }
  return out;
}

function blocked(a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const dist = dir.length();
  dir.normalize();
  for (let t = 0; t < dist; t += 1.2) {
    const x = a.x + dir.x * t, z = a.z + dir.z * t, y = a.y + 1.0;
    for (const c of colliders) {
      if (x > c[0] && x < c[3] && z > c[2] && z < c[5] && y > c[1] && y < c[4]) return true;
    }
  }
  return false;
}

export function lineOfSight(from, to) {
  const d = new THREE.Vector3().subVectors(to, from);
  const dist = d.length();
  if (dist > SIGHT) return false;
  d.normalize();
  for (let t = 1; t < dist; t += 1.0) {
    const x = from.x + d.x * t, y = from.y + d.y * t, z = from.z + d.z * t;
    for (const c of colliders) {
      if (x > c[0] && x < c[3] && y > c[1] && y < c[4] && z > c[2] && z < c[5]) return false;
    }
  }
  return true;
}

// Find the closest solid collider and return a stand point on the face that is
// hidden from `threat`. We walk from the box centre along (centre - threat)
// until we leave the AABB, then step out by 1.2 so the bot body clears the box.
function nearestCover(bot, threat) {
  let best = null, bestD = COVER_RADIUS;
  for (const c of colliders) {
    if (c[4] - c[1] < 1.5) continue;              // too low to hide behind
    const cx = (c[0] + c[3]) * 0.5, cz = (c[2] + c[5]) * 0.5;
    const d = Math.hypot(cx - bot.pos.x, cz - bot.pos.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return null;
  const cx = (best[0] + best[3]) * 0.5, cz = (best[2] + best[5]) * 0.5;
  const hx = (best[3] - best[0]) * 0.5, hz = (best[5] - best[2]) * 0.5;
  let ux = cx - threat.x, uz = cz - threat.z;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul; uz /= ul;
  const sx = Math.abs(ux) > 1e-4 ? hx / Math.abs(ux) : Infinity;
  const sz = Math.abs(uz) > 1e-4 ? hz / Math.abs(uz) : Infinity;
  const surf = Math.min(sx, sz);
  return {
    x: Math.max(-56, Math.min(56, cx + ux * (surf + 1.2))),
    z: Math.max(-56, Math.min(56, cz + uz * (surf + 1.2))),
  };
}

// One round of a burst. Later rounds climb a little, so the opening shot is the
// accurate one and holding a burst is not a free DPS upgrade.
function fireRound(bot, target, dist, onShot, index) {
  const tSpeed = Math.hypot(target.vel ? target.vel.x : 0, target.vel ? target.vel.z : 0);
  const leadBonus = Math.min(0.15, tSpeed * 0.012);
  const climb = index * 0.05;
  const raw = (Math.max(0.10, 0.85 - dist / 70) + leadBonus) * (1 - bot.aimError) - climb;
  if (Math.random() < Math.max(0.05, Math.min(0.75, raw))) {
    const head = Math.random() < 0.12;
    onShot(bot, target, head ? WEAPONS.rifle.dmg * 3 : WEAPONS.rifle.dmg * 0.8);
  } else onShot(bot, null, 0);
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

export function updateBot(bot, dt, target, others, onShot) {
  if (!bot.alive) return;
  bot.fireCd = Math.max(0, bot.fireCd - dt);
  bot.burstCd = Math.max(0, bot.burstCd - dt);
  bot.coverCd = Math.max(0, bot.coverCd - dt);

  if (target && target.alive) {
    eyePos(bot, tmpA); eyePos(target, tmpB);
    const sees = lineOfSight(tmpA, tmpB);
    if (sees) {
      bot.lastSeen = tmpB.clone();
      bot.reaction -= dt;
      if (bot.state === 'cover') {
        // stay put: hold the box until the cover timer runs out
      } else if (bot.state === 'engage' && bot.health < COVER_HEALTH && bot.coverCd <= 0) {
        const c = nearestCover(bot, target.pos);
        if (c) {
          bot.state = 'cover'; bot.coverPos = c; bot.coverWait = COVER_WAIT;
          bot.burst = 0; bot.burstIdx = 0;
        } else bot.state = 'engage';
      } else bot.state = 'engage';
    } else if (bot.state === 'engage') bot.state = 'seek';
  } else bot.state = 'patrol';

  if (bot.state === 'patrol') {
    const goal = new THREE.Vector3(...waypoints[bot.wp]);
    const dir = goal.sub(bot.pos);
    dir.y = 0;
    if (dir.length() < 1.5) {
      const nb = neighbours(bot.wp);
      bot.wp = nb.length ? nb[(Math.random() * nb.length) | 0] : 0;
    } else {
      dir.normalize();
      bot.pos.x += dir.x * BOT_SPEED * dt;
      bot.pos.z += dir.z * BOT_SPEED * dt;
      bot.yaw = Math.atan2(-dir.x, -dir.z);
    }
  } else if (bot.state === 'seek' && bot.lastSeen) {
    const dir = bot.lastSeen.clone().sub(bot.pos); dir.y = 0;
    if (dir.length() < 2) { bot.state = 'patrol'; bot.lastSeen = null; }
    else { dir.normalize(); bot.pos.x += dir.x * BOT_SPEED * dt; bot.pos.z += dir.z * BOT_SPEED * dt; }
  } else if (bot.state === 'cover' && bot.coverPos) {
    const dx = bot.coverPos.x - bot.pos.x, dz = bot.coverPos.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.6) {
      // sprint to the box, then hold
      const nx = dx / d, nz = dz / d;
      bot.pos.x += nx * BOT_SPEED * 1.15 * dt;
      bot.pos.z += nz * BOT_SPEED * 1.15 * dt;
      bot.yaw = Math.atan2(-nx, -nz);
    } else if (target) {
      const tt = new THREE.Vector3().subVectors(target.pos, bot.pos);
      bot.yaw = Math.atan2(-tt.x, -tt.z);        // keep eyes on the threat while pinned
      bot.coverWait -= dt;
      if (bot.coverWait <= 0) {
        bot.state = 'engage';
        bot.coverPos = null;
        bot.coverCd = COVER_REENTER + Math.random();  // no instant re-hide
        bot.reaction = 0.25;                          // fresh peek delay
      }
    }
  } else if (bot.state === 'engage' && target) {
    // strafe + face target + burst fire
    const toT = new THREE.Vector3().subVectors(target.pos, bot.pos); toT.y = 0;
    const dist = toT.length();
    toT.normalize();
    bot.yaw = Math.atan2(-toT.x, -toT.z);
    bot.strafeT = (bot.strafeT || 0) - dt;
    if (bot.strafeT <= 0) { bot.strafe = -bot.strafe; bot.strafeT = 0.7 + Math.random() * 0.9; }
    bot.pos.x += (-toT.z) * bot.strafe * BOT_SPEED * 0.55 * dt;
    bot.pos.z += (toT.x) * bot.strafe * BOT_SPEED * 0.55 * dt;

    if (bot.burst > 0) {
      if (bot.burstCd <= 0 && dist < 55) {
        bot.burst--; bot.burstIdx++;
        bot.burstCd = BURST_GAP;
        fireRound(bot, target, dist, onShot, bot.burstIdx);
      }
    } else if (bot.reaction <= 0 && bot.fireCd <= 0 && dist < 50) {
      const n = BURST_MIN + (Math.random() < 0.5 ? 1 : 0);   // 2 or 3 rounds
      bot.fireCd = FIRE_CD * (0.85 + Math.random() * 0.4);
      bot.burst = n - 1;
      bot.burstIdx = 0;
      bot.burstCd = BURST_GAP;
      fireRound(bot, target, dist, onShot, 0);               // opening shot is on target
    }
  }
  // keep bots inside map bounds
  bot.pos.x = Math.max(-56, Math.min(56, bot.pos.x));
  bot.pos.z = Math.max(-56, Math.min(56, bot.pos.z));
  bot.mesh.position.copy(bot.pos);
  bot.mesh.rotation.y = bot.yaw;
  bot.mesh.visible = true;
}
