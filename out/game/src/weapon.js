// weapon.js: the rifle - hitscan, recoil (exponential recovery), spread that
// blooms while firing and decays once you stop, reload, tracers.
import * as THREE from 'three';

export const WEAPONS = {
  rifle:  { name: 'Rifle',  dmg: 26, mag: 30, reserve: 90, rpm: 600, spread: 0.012, moveSpread: 0.05, recoil: 0.019, reloadTime: 2.2, price: 0 },
  smg:    { name: 'SMG',    dmg: 18, mag: 30, reserve: 120, rpm: 800, spread: 0.02, moveSpread: 0.035, recoil: 0.011, reloadTime: 1.8, price: 1000 },
  sniper: { name: 'DMR',    dmg: 70, mag: 10, reserve: 30, rpm: 90, spread: 0.001, moveSpread: 0.08, recoil: 0.05, reloadTime: 3.1, price: 2500 },
};
export const BUYABLE = ['rifle', 'smg', 'sniper'];

// recoil recovery: exponential decay toward 0 at RECOIL_RECOVER per second
const RECOIL_RECOVER = 3.5;
// spread settle: how fast movement bloom fades after you stop moving
const SPREAD_DECAY = 3.5;

export function createWeapon() {
  return { type: 'rifle', mag: 30, reserve: 90, cooldown: 0, reloading: 0, recoilPitch: 0, shotsFired: 0, spreadKick: 0, sinceShot: 0 };
}

export function switchWeapon(w, type) { w.type = type; w.mag = WEAPONS[type].mag; w.reserve = WEAPONS[type].reserve; w.reloading = 0; w.shotsFired = 0; w.spreadKick = 0; }

export function updateWeapon(w, dt, moving, airborne) {
  w.cooldown = Math.max(0, w.cooldown - dt);

  // exponential recoil recovery: pitch decays toward zero, rate 3.5/s.
  // exp(-k*dt) is frame-rate independent, unlike the old linear crawl.
  if (w.recoilPitch > 0) {
    w.recoilPitch *= Math.exp(-RECOIL_RECOVER * dt);
    if (w.recoilPitch < 1e-4) w.recoilPitch = 0;
  }

  // spread bloom decays after stopping: shotsFired fades toward 0 when the
  // weapon has not fired recently, so the extra accuracy penalty from
  // sustained fire unwinds instead of sticking forever.
  if (w.cooldown > 0) w.sinceShot = 0;
  else w.sinceShot += dt;
  if (w.sinceShot > 0.25 && w.shotsFired > 0) {
    w.shotsFired = Math.max(0, w.shotsFired - SPREAD_DECAY * dt);
  }
  // movement settle: going from run to aim eases the moveSpread off smoothly
  const targetKick = moving ? 1 : 0;
  w.spreadKick += (targetKick - w.spreadKick) * Math.min(1, SPREAD_DECAY * dt);

  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) {
      const spec = WEAPONS[w.type];
      const need = spec.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take; w.reserve -= take;
    }
  }
  const spec = WEAPONS[w.type];
  const moveBloom = spec.moveSpread * w.spreadKick;
  w.currentSpread = spec.spread + moveBloom + (airborne ? 0.07 : 0) + Math.min(0.03, w.shotsFired * 0.002);
}

export function tryFire(w, holdingFire) {
  const spec = WEAPONS[w.type];
  if (w.reloading > 0 || w.cooldown > 0 || !holdingFire) return false;
  if (w.mag <= 0) { startReload(w); return false; }
  w.cooldown = 60 / spec.rpm;
  w.mag--;
  w.shotsFired++;
  w.sinceShot = 0;
  w.recoilPitch += spec.recoil;
  return true;
}

export function startReload(w) {
  const spec = WEAPONS[w.type];
  if (w.reloading <= 0 && w.mag < spec.mag && w.reserve > 0) w.reloading = spec.reloadTime;
}

const tracers = [];
export function addTracer(scene, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85 }));
  scene.add(line);
  tracers.push({ line, life: 0.06 });
}
export function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) {
      tracers[i].line.parent.remove(tracers[i].line);
      tracers[i].line.geometry.dispose();
      tracers.splice(i, 1);
    }
  }
}
