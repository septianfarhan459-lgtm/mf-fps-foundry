// engine.js: renderer, scene, lighting, the fixed-step simulation loop, and an
// adaptive pixel-ratio governor that trades resolution for frame rate.
import * as THREE from 'three';

// Fixed simulation step. The loop below may run 0..n sim ticks per rendered
// frame; gameplay code always sees exactly this dt so physics stays stable.
export const TICK = 1 / 60;

// Frame-rate thresholds for the resolution governor. Below LOW we are dropping
// frames badly enough to hurt aiming, so fall back to a pixel ratio of 1;
// above HIGH we have headroom and can spend it on sharpness again.
const FPS_LOW = 45;
const FPS_HIGH = 58;
// How many consecutive slow seconds before we give up on the high pixel ratio.
const LOW_SECONDS_LIMIT = 2;

export function createEngine(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Native device pixel ratio, capped at 2: beyond that the extra samples cost
  // real GPU time on high-DPI laptops while being invisible at arm's length.
  const nativeRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(nativeRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  scene.fog = new THREE.Fog(0x14161a, 40, 110);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0x9fb2cc, 0x3a3f46, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.1);
  sun.position.set(40, 60, 20);
  scene.add(sun);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const sim = { systems: [], accumulator: 0, last: performance.now(), tick: 0 };
  const view = { callbacks: [] };

  // Governor state, kept flat so the per-frame path allocates nothing: count
  // frames and elapsed ms in the current one-second sampling window.
  const perf = {
    frames: 0,
    windowMs: 0,
    lowStreak: 0,
    degraded: false,
    // Exposed for the HUD/debug overlay: last measured fps and what we chose.
    fps: 0,
    ratio: nativeRatio,
  };

  // Swap the pixel ratio only on an actual change - setPixelRatio resizes the
  // drawing buffer, so calling it every frame would be a per-frame realloc.
  function applyRatio(ratio) {
    if (ratio === perf.ratio) return;
    perf.ratio = ratio;
    renderer.setPixelRatio(ratio);
  }

  // Called once per rendered frame with that frame's dt in milliseconds.
  function samplePerf(dtMs) {
    perf.frames++;
    perf.windowMs += dtMs;
    if (perf.windowMs < 1000) return;
    const fps = (perf.frames * 1000) / perf.windowMs;
    perf.fps = fps;
    perf.frames = 0;
    perf.windowMs = 0;

    if (fps < FPS_LOW) {
      perf.lowStreak++;
      // Two slow seconds in a row: the machine cannot hold native resolution.
      if (perf.lowStreak >= LOW_SECONDS_LIMIT && !perf.degraded) {
        perf.degraded = true;
        applyRatio(1);
      }
    } else {
      perf.lowStreak = 0;
      // Comfortable headroom again: hand the pixels back, but only if we had
      // actually degraded (never fight a user who set a low ratio manually).
      if (perf.degraded && fps > FPS_HIGH) {
        perf.degraded = false;
        applyRatio(nativeRatio);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - sim.last) / 1000;
    sim.last = now;
    if (dt > 0.25) dt = 0.25; // clamp after tab switches
    samplePerf(dt * 1000);
    sim.accumulator += dt;
    while (sim.accumulator >= TICK) {
      for (const s of sim.systems) s(TICK, sim.tick);
      sim.accumulator -= TICK;
      sim.tick++;
    }
    const alpha = sim.accumulator / TICK;
    for (const cb of view.callbacks) cb(alpha, dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return { renderer, scene, camera, sim, view, perf };
}
