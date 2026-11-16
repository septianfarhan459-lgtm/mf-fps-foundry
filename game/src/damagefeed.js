// damagefeed.js: directional damage indicators + floating damage numbers.
//
// Purely DOM-based so it costs the WebGL renderer nothing: no extra draw
// calls, no shader work. Two visual channels share one fixed-position root:
//
//   1. The directional arc. A 120px circle around the crosshair whose top
//      border is the only painted segment; rotating the whole element puts
//      the red segment toward the attacker. The rotation angle is the
//      attacker's world yaw minus the camera's current yaw, recomputed every
//      frame so the indicator stays honest while the player turns. It fades
//      out quadratically over ARC_LIFE (0.8s), which reads as a quick punch
//      rather than a lingering warning.
//
//   2. Floating damage numbers. A pool of exactly 6 divs, consumed
//      round-robin, so taking rapid fire never allocates nodes and never
//      grows the DOM. Each number spawns at a random angle on a 46px ring
//      around the crosshair, floats upward at 34px/s and fades over 1s.
//
// Every call from the hot path (botShoot fires up to several times per
// second) allocates nothing: vectors are scratch members, elements are pooled,
// text is written via textContent into existing nodes.

const ARC_LIFE = 0.8;   // seconds the directional arc stays visible
const NUM_LIFE = 1.0;   // seconds a damage number floats for
const POOL = 6;         // damage-number pool size
const RING_RADIUS = 46; // px from screen center where numbers spawn
const FLOAT_SPEED = 34; // px/s upward drift for numbers

export function initDamageFeed(camera) {
  // one fixed, pointer-transparent root holds everything; it never scrolls
  // with the page and never intercepts clicks.
  const root = document.createElement('div');
  root.id = 'damagefeed';
  root.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden;';
  document.body.appendChild(root);

  // The arc: a circle with only the top border painted red. Rotating the
  // element by `rel` radians places the red segment toward the attacker,
  // because border-top on a circular border-radius always paints the
  // segment centered on the element's local "up" direction.
  const arc = document.createElement('div');
  arc.id = 'damage-arc';
  arc.style.cssText =
    'position:absolute;left:50%;top:50%;width:120px;height:120px;' +
    'margin:-60px 0 0 -60px;' +
    'border-radius:50%;border:6px solid transparent;' +
    'border-top-color:rgba(255,40,40,0.9);' +
    'opacity:0;will-change:transform,opacity;';
  root.appendChild(arc);

  // Pooled floating damage numbers, consumed round-robin by numCursor.
  // Reusing 6 divs keeps rapid fire from fragmenting the DOM or triggering
  // per-call layout of newly inserted nodes.
  const nums = [];
  for (let i = 0; i < POOL; i++) {
    const el = document.createElement('div');
    el.className = 'damage-num';
    el.style.cssText =
      'position:absolute;font:bold 18px monospace;color:#ff5544;' +
      'text-shadow:0 0 4px #000;' +
      'transform:translate(-50%,-50%);white-space:nowrap;' +
      'opacity:0;will-change:opacity;';
    root.appendChild(el);
    nums.push({ el, t: 0, x: 0, y: 0, active: false });
  }
  let numCursor = 0;

  // feed state
  let arcT = 0;    // remaining life of the arc, in seconds
  let arcYaw = 0;  // attacker world yaw captured at showHitFrom time

  // scratch vector created once from the camera's own vector class, so the
  // update loop never allocates (important: it runs every frame).
  const _v = new camera.position.constructor();

  // showHitFrom(direction, amount):
  //   direction - world-space vector from the player toward the attacker.
  //               Only XZ is used; the arc is yaw-only by design.
  //   amount    - damage taken, shown as the floating number.
  function showHitFrom(direction, amount) {
    // attacker yaw in the same atan2(x, z) convention the game uses
    arcYaw = Math.atan2(direction.x, direction.z);
    arcT = ARC_LIFE;
    arc.style.opacity = '1';

    // claim the next pooled number (round-robin, zero allocation)
    const n = nums[numCursor];
    numCursor = (numCursor + 1) % POOL;
    n.active = true;
    n.t = NUM_LIFE;

    // random position on a ring around the crosshair so stacked hits
    // don't overlap into an unreadable blob
    const ang = Math.random() * Math.PI * 2;
    n.x = window.innerWidth / 2 + Math.cos(ang) * RING_RADIUS;
    n.y = window.innerHeight / 2 + Math.sin(ang) * RING_RADIUS - 10;
    n.el.textContent = String(Math.round(amount) || '?');
    n.el.style.left = `${n.x}px`;
    n.el.style.top = `${n.y}px`;
    n.el.style.opacity = '1';
  }

  // update(dt) - call once per frame. Rotates the arc to track camera yaw,
  // fades it quadratically, and drifts/fades any live damage numbers.
  function update(dt) {
    if (arcT > 0) {
      arcT -= dt;
      // camera forward (-Z in camera space) converted to the same atan2(x, z)
      // yaw convention, then the relative angle drives the arc rotation.
      camera.getWorldDirection(_v);
      const camYaw = Math.atan2(-_v.x, -_v.z);
      const rel = arcYaw - camYaw;
      arc.style.transform = `rotate(${-rel}rad)`;
      // quadratic ease-out on opacity: bright at first, quick tail-off
      const k = Math.max(0, arcT / ARC_LIFE);
      arc.style.opacity = String(k * k);
    }
    for (const n of nums) {
      if (!n.active) continue;
      n.t -= dt;
      if (n.t <= 0) {
        n.active = false;
        n.el.style.opacity = '0';
        continue;
      }
      n.y -= FLOAT_SPEED * dt;
      n.el.style.top = `${n.y}px`;
      // fade with a head-up ramp so freshly spawned numbers are fully opaque
      n.el.style.opacity = String(Math.min(1, (n.t / NUM_LIFE) * 1.6));
    }
  }

  return { showHitFrom, update };
}
