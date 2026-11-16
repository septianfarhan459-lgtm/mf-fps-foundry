// player.js: the first-person controller - movement, collision, health, head-bob.
import * as THREE from 'three';
import { keys } from './input.js';
import { colliders } from './world.js';

const EYE = 1.7, EYE_CROUCH = 1.1, RADIUS = 0.4, ACCEL = 42, FRICTION = 9, SPEED = 7.2, CROUCH_SPEED = 3.6, JUMP = 7.4, GRAVITY = 22;
// head-bob: subtle vertical sway while running on the ground. Amplitude is
// hard-capped at 0.03 and eases in with speed so it never looks like a glitch.
const BOB_MAX = 0.03, BOB_MIN_SPEED = 2, BOB_RATE = 9.5;

export function createPlayer(team) {
  return {
    team,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, onGround: true, crouch: false,
    health: 100, armor: 0, alive: true,
    money: 800, kills: 0, deaths: 0,
    height: EYE,
    bobPhase: 0, bobAmp: 0,      // head-bob state
  };
}

function collideAxis(pos, axis, dir) {
  for (const c of colliders) {
    const inX = pos.x + RADIUS > c[0] && pos.x - RADIUS < c[3];
    const inZ = pos.z + RADIUS > c[2] && pos.z - RADIUS < c[5];
    const inY = pos.y + 1.7 > c[1] && pos.y < c[4];
    if (inX && inZ && inY) {
      if (axis === 0) pos.x = dir > 0 ? c[0] - RADIUS : c[3] + RADIUS;
      else if (axis === 2) pos.z = dir > 0 ? c[2] - RADIUS : c[5] + RADIUS;
      else { pos.y = dir > 0 ? c[1] - 1.7 : c[4]; return true; }
    }
  }
  return false;
}

export function updatePlayer(p, dt, look) {
  // look
  p.yaw -= look[0] * 0.0023;
  p.pitch -= look[1] * 0.0023;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));

  if (!p.alive) return;

  // move intent in yaw space
  let ix = 0, iz = 0;
  if (keys.KeyW) iz -= 1;
  if (keys.KeyS) iz += 1;
  if (keys.KeyA) ix -= 1;
  if (keys.KeyD) ix += 1;
  p.crouch = !!(keys.ControlLeft || keys.ControlRight);
  const maxSpeed = p.crouch ? CROUCH_SPEED : SPEED;
  const len = Math.hypot(ix, iz) || 1;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const wx = (ix * cy - iz * sy) / len * maxSpeed;
  const wz = (ix * sy + iz * cy) / len * maxSpeed;

  // accelerate, friction, gravity
  p.vel.x += wx * ACCEL / SPEED * dt - p.vel.x * FRICTION * dt;
  p.vel.z += wz * ACCEL / SPEED * dt - p.vel.z * FRICTION * dt;
  p.vel.y -= GRAVITY * dt;
  if (p.onGround && keys.Space) { p.vel.y = JUMP; p.onGround = false; }

  // integrate per axis
  p.pos.x += p.vel.x * dt;
  if (collideAxis(p.pos, 0, Math.sign(p.vel.x))) p.vel.x = 0;
  p.pos.z += p.vel.z * dt;
  if (collideAxis(p.pos, 2, Math.sign(p.vel.z))) p.vel.z = 0;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }
  else if (collideAxis(p.pos, 1, Math.sign(p.vel.y))) { p.onGround = p.vel.y <= 0; p.vel.y = 0; }
  if (p.pos.y < -5) { p.pos.set(0, 0.1, 44); p.vel.set(0,0,0); } // safety respawn

  p.height = p.crouch ? EYE_CROUCH : EYE;

  // head-bob: only on the ground, only above a walk threshold, eased toward
  // the cap as speed rises; the phase accumulator keeps step rhythm stable.
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && speed > BOB_MIN_SPEED) {
    const target = Math.min(BOB_MAX, BOB_MAX * (speed - BOB_MIN_SPEED) / (SPEED - BOB_MIN_SPEED));
    p.bobAmp += (target - p.bobAmp) * Math.min(1, 6 * dt);
    p.bobPhase += BOB_RATE * dt;
  } else {
    p.bobAmp += (0 - p.bobAmp) * Math.min(1, 6 * dt);
    if (p.bobAmp < 1e-4) p.bobAmp = 0;
  }
}

export function eyePos(p, out) {
  const bob = p.bobAmp ? Math.sin(p.bobPhase) * p.bobAmp : 0;
  return out.set(p.pos.x, p.pos.y + p.height + bob, p.pos.z);
}

export function damage(p, amount, headshot) {
  if (!p.alive) return false;
  let dmg = headshot ? amount * 4 : amount;
  if (p.armor > 0) { const absorbed = Math.min(p.armor, dmg * 0.5); p.armor -= absorbed; dmg -= absorbed; }
  p.health -= dmg;
  if (p.health <= 0) { p.health = 0; p.alive = false; p.deaths++; return true; }
  return false;
}
