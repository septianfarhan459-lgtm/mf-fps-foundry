// minimap.js: bottom-left 2D canvas radar. Draws AABB colliders as rectangles,
// the local player as a heading arrow, and every other combatant as a dot
// colored by team. Wired into the view loop, so update() runs every frame and
// must not allocate: all scratch state lives in module scope.
import { TEAM_BLUE, TEAM_ORANGE } from './world.js';

const SIZE = 160;          // canvas edge in CSS pixels
const RANGE = 60;          // world units mapped to the radar radius
const BLUE = '#6fb1ff';
const ORANGE = '#ff8a5e';
const SELF = '#ffffff';
const BG = 'rgba(16, 18, 22, 0.72)';

export function initMinimap(scene, colliders, players) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.id = 'minimap';
  // Styled to match the HUD overlay layer (see hud.js / index.css patterns):
  // pinned bottom-left above the crosshair layer, no pointer events.
  canvas.style.cssText =
    'position:fixed;left:12px;bottom:12px;width:160px;height:160px;' +
    'border:1px solid rgba(255,255,255,0.25);border-radius:6px;z-index:20;pointer-events:none;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // players[0] is the human; the rest are bots. Copy only once at init.
  const me = players[0];

  // World-to-radar transform: rotate so the player always faces up. One
  // premultiplied scale, applied with save/restore-free math per draw.
  const scale = SIZE / (2 * RANGE);

  function drawRect(b) {
    // AABB [minX,minY,minZ,maxX,maxY,maxZ] -> player-relative rotated rect.
    const dx1 = b[0] - me.pos.x, dz1 = b[2] - me.pos.z;
    const dx2 = b[3] - me.pos.x, dz2 = b[5] - me.pos.z;
    const c = Math.cos(me.yaw), s = Math.sin(me.yaw);
    // rotate about the player, then scale into canvas space
    const x1 = (dx1 * c - dz1 * s) * scale + SIZE / 2;
    const z1 = (dx1 * s + dz1 * c) * scale + SIZE / 2;
    const x2 = (dx2 * c - dz2 * s) * scale + SIZE / 2;
    const z2 = (dx2 * s + dz2 * c) * scale + SIZE / 2;
    ctx.fillStyle = 'rgba(120, 130, 145, 0.55)';
    ctx.fillRect(Math.min(x1, x2), Math.min(z1, z2), Math.abs(x2 - x1), Math.abs(z2 - z1));
  }

  return function update(alpha) {
    const c = Math.cos(me.yaw), s = Math.sin(me.yaw);
    const cx = SIZE / 2, cy = SIZE / 2;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // colliders (skip the giant floor plane via its height: walls/boxes only)
    for (let i = 0; i < colliders.length; i++) {
      if (colliders[i][4] - colliders[i][1] < 0.6) continue;
      drawRect(colliders[i]);
    }

    // combatants as team dots; skip the dead and the local player
    for (let i = 1; i < players.length; i++) {
      const p = players[i];
      if (!p.alive) continue;
      const dx = p.pos.x - me.pos.x, dz = p.pos.z - me.pos.z;
      const x = (dx * c - dz * s) * scale + cx;
      const z = (dx * s + dz * c) * scale + cy;
      ctx.fillStyle = p.team === TEAM_ORANGE ? ORANGE : BLUE;
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // self arrow, always pointing up because the map rotates with us
    ctx.fillStyle = SELF;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4.5, cy + 5);
    ctx.lineTo(cx + 4.5, cy + 5);
    ctx.closePath();
    ctx.fill();
  };
}
