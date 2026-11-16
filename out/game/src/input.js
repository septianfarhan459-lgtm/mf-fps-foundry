// input.js: pointer-lock mouse look, keyboard movement intents, and optional
// gamepad polling (left stick moves, right stick looks) when the API exists.
export const keys = {};
export const mouse = { dx: 0, dy: 0, fire: false, locked: false };

// Gamepad intents, refreshed by pollGamepad() from the sim loop:
// - move: [-1..1] strafe (x) and [1..-1] forward (y), from the left stick
// - look: right-stick deltas in [dx, dy], consumed like mouse deltas
// - fire / jump mirror the triggers and face button so pads stay viable.
export const gamepad = {
  connected: false,
  move: [0, 0],
  look: [0, 0],
  fire: false,
  jump: false,
  index: -1,
};

// Stick deadzone: cheap pads idle slightly off-centre, which would otherwise
// read as a permanent slow drift in both movement and camera aim.
const DEADZONE = 0.18;

// Right stick maps to look deltas of roughly mouse magnitude per poll tick.
const LOOK_SCALE = 18;

function applyDeadzone(v) {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  // Re-scale the live range so the stick reaches full throw right past the
  // deadzone instead of wasting the first 18% of travel.
  return (Math.sign(v) * (a - DEADZONE)) / (1 - DEADZONE);
}

export function initInput(canvas) {
  const down = (e) => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); };
  const up = (e) => { keys[e.code] = false; };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);

  document.addEventListener('mousemove', (e) => {
    if (mouse.locked) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });
  document.addEventListener('mousedown', (e) => { if (mouse.locked && e.button === 0) mouse.fire = true; });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.fire = false; });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => { if (!mouse.locked) canvas.requestPointerLock(); });
}

export function consumeLook() {
  const dx = mouse.dx, dy = mouse.dy;
  mouse.dx = 0; mouse.dy = 0;
  return [dx, dy];
}

// Poll the first connected pad into `gamepad`. Guarded so non-supporting
// browsers (and headless capture runs, which lack the API entirely) pay
// nothing. Returns true when a pad is actively driving input.
export function pollGamepad() {
  if (!navigator.getGamepads) { gamepad.connected = false; return false; }
  const pads = navigator.getGamepads();
  let pad = null;
  for (const p of pads) { if (p && p.connected) { pad = p; break; } }
  if (!pad) { gamepad.connected = false; return false; }

  gamepad.connected = true;
  gamepad.index = pad.index;
  // Standard mapping axes: 0/1 = left stick (move), 2/3 = right stick (look).
  gamepad.move[0] = applyDeadzone(pad.axes[0] || 0);
  gamepad.move[1] = -applyDeadzone(pad.axes[1] || 0); // stick up = forward
  gamepad.look[0] = applyDeadzone(pad.axes[2] || 0) * LOOK_SCALE;
  gamepad.look[1] = applyDeadzone(pad.axes[3] || 0) * LOOK_SCALE;
  // Right trigger (7) is the fire button; right bumper (5) is a backup.
  const rt = pad.buttons[7];
  const rb = pad.buttons[5];
  gamepad.fire = (rt && rt.value > 0.5) || !!(rb && rb.pressed);
  gamepad.jump = !!(pad.buttons[0] && pad.buttons[0].pressed);
  return true;
}
