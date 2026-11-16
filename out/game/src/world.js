// world.js: the FOUNDRY map - an original industrial yard with a mid lane,
// two side lanes, bombsites A/B and box colliders exported as AABBs.
import * as THREE from 'three';

export const TEAM_BLUE = 0, TEAM_ORANGE = 1;

// [minX, minY, minZ, maxX, maxY, maxZ] AABBs for movement and bullets
export const colliders = [];
function box(x, y, z, w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y + h / 2, z);
  m.updateMatrixWorld();
  colliders.push([x - w / 2, 0, z - d / 2, x + w / 2, y + h, z + d / 2]);
  return m;
}

const STEEL = 0x5a6472, CRATE = 0x8a6a3a, WALL = 0x46505c, FLOOR = 0x2e343c, ACCENT_A = 0xc25038, ACCENT_B = 0x3f7ac2;

export function buildWorld(scene) {
  // ground
  const ground = new THREE.Mesh(new THREE.BoxGeometry(120, 0.5, 120), new THREE.MeshLambertMaterial({ color: FLOOR }));
  ground.position.y = -0.25;
  scene.add(ground);
  // perimeter walls
  scene.add(box(0, 0, -60, 120, 8, 2, WALL));
  scene.add(box(0, 0, 60, 120, 8, 2, WALL));
  scene.add(box(-60, 0, 0, 2, 8, 120, WALL));
  scene.add(box(60, 0, 0, 2, 8, 120, WALL));
  // mid lane: long corridor with cover crates. The two inner crates sit
  // diagonal to the originals so a mid push can stagger cover-to-cover
  // instead of crossing one long open stretch.
  scene.add(box(-10, 0, -10, 4, 3, 4, CRATE));
  scene.add(box(10, 0, 10, 4, 3, 4, CRATE));
  scene.add(box(-7, 0, 6, 4, 2.6, 4, CRATE));
  scene.add(box(7, 0, -6, 4, 2.6, 4, CRATE));
  scene.add(box(0, 0, -24, 6, 2.5, 3, WALL));
  scene.add(box(0, 0, 24, 6, 2.5, 3, WALL));
  scene.add(box(-24, 0, 0, 3, 2.5, 6, WALL));
  scene.add(box(24, 0, 0, 3, 2.5, 6, WALL));
  // side lane west
  scene.add(box(-38, 0, -30, 8, 4, 3, WALL));
  scene.add(box(-38, 0, 30, 8, 4, 3, WALL));
  scene.add(box(-45, 0, 0, 3, 2.5, 14, WALL));
  scene.add(box(-30, 0, -14, 3, 2.5, 8, CRATE));
  scene.add(box(-30, 0, 14, 3, 2.5, 8, CRATE));
  // side lane east
  scene.add(box(38, 0, -30, 8, 4, 3, WALL));
  scene.add(box(38, 0, 30, 8, 4, 3, WALL));
  scene.add(box(45, 0, 0, 3, 2.5, 14, WALL));
  scene.add(box(30, 0, -14, 3, 2.5, 8, CRATE));
  scene.add(box(30, 0, 14, 3, 2.5, 8, CRATE));
  // bombsite A (west) marker floor
  const a = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), new THREE.MeshLambertMaterial({ color: ACCENT_A }));
  a.position.set(-40, 0.1, 0); scene.add(a);
  // bombsite B (east)
  const b = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), new THREE.MeshLambertMaterial({ color: ACCENT_B }));
  // bombsite cover: steel crates so pushes onto A/B have somewhere to break LOS
  scene.add(box(-45, 0, -5, 2.5, 2, 2.5, STEEL));
  scene.add(box(-33, 0, 8, 2.5, 2, 2.5, STEEL));
  scene.add(box(41, 0, -6, 2.5, 2, 2.5, STEEL));
  b.position.set(40, 0.1, 0); scene.add(b);
  // catwalks (low platforms you can jump on)
  scene.add(box(-18, 0, -44, 20, 1.5, 6, STEEL));
  scene.add(box(18, 0, 44, 20, 1.5, 6, STEEL));
  // scattered cover
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2, r = 15 + (i % 3) * 8;
    scene.add(box(Math.cos(ang) * r, 0, Math.sin(ang) * r, 2.5, 1.8 + (i % 2), 2.5, CRATE));
  }
}

export const spawns = [
  [ [0, 0, 50], [-6, 0, 52], [6, 0, 52], [-12, 0, 50], [12, 0, 50] ],   // blue south
  [ [0, 0, -50], [-6, 0, -52], [6, 0, -52], [-12, 0, -50], [12, 0, -50] ], // orange north
];

// waypoint graph: ring + lanes (bot patrol routes)
export const waypoints = [
  [0,0,-40],[0,0,-20],[0,0,0],[0,0,20],[0,0,40],
  [-30,0,-40],[-30,0,-20],[-30,0,0],[-30,0,20],[-30,0,40],
  [30,0,-40],[30,0,-20],[30,0,0],[30,0,20],[30,0,40],
  [-45,0,0],[-45,0,-20],[-45,0,20],[45,0,0],[45,0,-20],[45,0,20],
];
export const waypointLinks = [
  [0,1],[1,2],[2,3],[3,4],
  [5,6],[6,7],[7,8],[8,9],
  [10,11],[11,12],[12,13],[13,14],
  [0,5],[1,6],[2,7],[3,8],[4,9],
  [0,10],[1,11],[2,12],[3,13],[4,14],
  [7,15],[15,16],[16,7],[8,17],[17,15],
  [12,18],[18,19],[19,12],[13,20],[20,18],
];
