// The process piping between the equipment and the automatic fire suppression, in the hangar's axes (metres).
//
// Piping: oils in brown, compressed air in blue (ГОСТ 14202-69: combustible liquids brown, air blue), runs at 1.0 m
// along the walls and at 3.6–3.9 m over the equipment; valves at the pumps, the tanks, the reactors and the branches;
// cones show the flow. Each line's bore is chosen for 1–2.5 m/s, the oil's usual range in pressure lines (≤ 1.2 m/s on
// suction), and its length is measured off its route.
//
// Suppression: modular powder (dry chemical, class B fires), no water main or tank needed at a remote site. Modules
// under the trusses (5.5 m up) at 5 m centres, each taken to cover 25 m² of a class B fire at that height (a typical module's
// datasheet value: check it against the chosen model), a control panel, the boards and the manual call points at the
// exits. The foam-sprinkler alternative is costed beside it.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the lines: name, purpose, flow (m³/h), bore (mm), fluid, route (points, orthogonal runs)
export const LINES = [
  {key: 'recv', name: 'Приём из автоцистерны → насос приёмки', q: 37.5, dn: 100, f: 'oil',
    pts: [V(0.15, 1.0, -8.0), V(7.4, 1.0, -8.0), V(7.4, 0.4, -8.0), V(7.4, 0.4, -7.4), V(7.7, 0.4, -7.4)]},
  {key: 'fillTanks', name: 'Насос приёмки → резервуары (коллектор сверху)', q: 37.5, dn: 80, f: 'oil',
    pts: [V(8.95, 0.6, -7.4), V(8.95, 3.95, -7.4), V(8.95, 3.95, -5.85), V(2.3, 3.95, -5.85)],
    drops: [[2.3, -6.6], [5.0, -6.6], [2.3, -5.1], [5.0, -5.1]]},
  {key: 'charge', name: 'Резервуары → насос → фильтр → реакторы (загрузка)', q: 10, dn: 50, f: 'oil',
    pts: [V(6.6, 0.35, -4.0), V(6.6, 0.35, -3.45), V(14.9, 0.35, -3.45), V(14.9, 0.3, -3.7)]},
  {key: 'chargeUp', name: 'Подъём на реакторы', q: 10, dn: 50, f: 'oil',
    pts: [V(16.0, 0.85, -3.4), V(16.0, 3.7, -3.4), V(16.0, 3.7, -5.3), V(13.0, 3.7, -5.3), V(13.0, 3.45, -5.6)],
    branch: [V(16.0, 3.7, -5.3), V(18.0, 3.7, -5.3), V(18.0, 3.45, -5.6)]},
  {key: 'add', name: 'Дозатор присадок → реакторы', q: 1, dn: 25, f: 'oil',
    pts: [V(15.5, 1.05, -7.6), V(15.5, 3.85, -7.6), V(13.0, 3.85, -7.6), V(13.0, 3.5, -6.9)],
    branch: [V(15.5, 3.85, -7.6), V(18.0, 3.85, -7.6), V(18.0, 3.5, -6.9)]},
  {key: 'product', name: 'Реакторы → насос → фильтр → расходная ёмкость', q: 10, dn: 50, f: 'oil',
    pts: [V(16.0, 0.85, -3.05), V(16.0, 3.2, -3.05), V(16.0, 3.2, 3.6), V(12.0, 3.2, 3.6), V(12.0, 1.85, 3.6)]},
  {key: 'filler', name: 'Расходная ёмкость → дозатор линии розлива', q: 3, dn: 40, f: 'oil',
    pts: [V(12.65, 0.45, 3.6), V(13.5, 0.45, 3.6), V(13.5, 2.3, 3.6), V(13.5, 2.3, 1.6), V(13.5, 1.95, 1.6)]},
  {key: 'drums', name: 'Расходная ёмкость → пост налива бочек/IBC', q: 3, dn: 40, f: 'oil',
    pts: [V(12.0, 0.35, 4.2), V(17.6, 0.35, 4.2), V(17.6, 2.55, 4.2), V(17.6, 2.55, 3.3), V(18.6, 2.55, 3.3)]},
  {key: 'air', name: 'Сжатый воздух: компрессор → линия розлива, пост бочек', q: 48, dn: 20, f: 'air',
    pts: [V(24.6, 1.1, -8.8), V(24.6, 2.4, -8.8), V(21.6, 2.4, -8.8), V(21.6, 4.3, -8.8), V(21.6, 4.3, 2.6), V(13.8, 4.3, 2.6), V(13.8, 2.0, 2.2)],
    branch: [V(21.6, 4.3, 2.6), V(18.0, 4.3, 2.6), V(18.0, 2.9, 3.3)]},
];
const len = (pts) => pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0);
for (const l of LINES) {
  l.L = len(l.pts) + (l.branch ? len(l.branch) : 0) + (l.drops ? l.drops.length * 0.4 : 0);
  // velocity: oil in m³/h through the bore; air at 8 bar in normal m³/h → its actual flow is 1/9 of it
  const qs = (l.f === 'air' ? l.q / 9 : l.q) / 3600;
  l.v = qs / ((Math.PI * (l.dn / 1000) ** 2) / 4);
}

// the suppression: the main hall in 5 × 5 m squares, a module in each; one more for the technical room
export const AUPT = (() => {
  const xs = [2.75, 8.25, 13.75, 19.25];
  const zs = [-6.75, -2.25, 2.25, 6.75];
  const hall = 22 * 18;
  const cover = 25; // m², class B, per module at this height (datasheet value to confirm)
  const cells = xs.flatMap((x) => zs.map((z) => [x, z]));
  const modules = [...cells, [25, -6.5]];
  const kg = 8;
  // the foam-sprinkler alternative (СП 485.1311500, a production room with combustible liquids: low-expansion foam,
  // its numbers taken as ≈ 0.15 l/(s·m²) over 180 m² for 15 min — to confirm in the design)
  const foam = {i: 0.15, area: 180, min: 15};
  foam.flow = foam.i * foam.area; // l/s
  foam.water = (foam.flow * foam.min * 60) / 1000 + (2.5 * 60 * 60) / 1000; // m³ incl. the hydrant's hour
  return {xs, zs, hall, cover, modules, kg, powder: modules.length * kg, need: Math.ceil(hall / cover), foam, delay: 30};
})();

export function buildPiping(pipesLayer, auptLayer) {
  const M = {
    oil: new THREE.MeshStandardMaterial({color: '#7a4a22', roughness: 0.45, metalness: 0.4}),
    air: new THREE.MeshStandardMaterial({color: '#4b8fe0', roughness: 0.45, metalness: 0.4}),
    ring: new THREE.MeshStandardMaterial({color: '#f2c518', roughness: 0.5}),
    valve: new THREE.MeshStandardMaterial({color: '#d0262b', roughness: 0.4, metalness: 0.3}),
    body: new THREE.MeshStandardMaterial({color: '#3b4148', roughness: 0.5, metalness: 0.5}),
    module: new THREE.MeshStandardMaterial({color: '#cf1f25', roughness: 0.35, metalness: 0.3}),
    white: new THREE.MeshStandardMaterial({color: '#f3f4f5', roughness: 0.5}),
    board: new THREE.MeshStandardMaterial({color: '#ffde3b', emissive: '#c99a00', emissiveIntensity: 0.5}),
    boardRed: new THREE.MeshStandardMaterial({color: '#ff4a3d', emissive: '#c4221a', emissiveIntensity: 0.6}),
    yellow: new THREE.MeshStandardMaterial({color: '#f2c518', roughness: 0.5}),
  };
  const parts = {};
  const put = (m, g) => (parts[m] ??= []).push(g.index ? g.toNonIndexed() : g);
  const seg = (a, b, r, m) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 14);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    put(m, g);
  };
  const run = (pts, r, m, arrows = true) => {
    for (let i = 1; i < pts.length; i++) {
      seg(pts[i - 1], pts[i], r, m);
      put(m, new THREE.SphereGeometry(r * 1.15, 12, 8).translate(pts[i].x, pts[i].y, pts[i].z));
      const d = new THREE.Vector3().subVectors(pts[i], pts[i - 1]);
      // a flow cone mid-run on every run longer than 1.5 m, and a yellow band (the combustible-liquid warning ring)
      if (arrows && d.length() > 1.5) {
        const mid = pts[i - 1].clone().lerp(pts[i], 0.5);
        const c = new THREE.ConeGeometry(r * 2.2, r * 4, 12);
        c.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())));
        put(m === 'air' ? 'air' : 'ring', c.translate(mid.x, mid.y, mid.z));
      }
    }
  };
  const valve = (p, r) => {
    put('body', new THREE.BoxGeometry(r * 3, r * 3, r * 3).translate(p.x, p.y, p.z));
    put('valve', new THREE.TorusGeometry(r * 2.4, r * 0.4, 6, 16).rotateX(Math.PI / 2).translate(p.x, p.y + r * 3.2, p.z));
    put('body', new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 3.2, 6).translate(p.x, p.y + r * 1.6, p.z));
  };
  for (const l of LINES) {
    const r = Math.max(0.025, l.dn / 2000 + 0.006);
    const m = l.f === 'air' ? 'air' : 'oil';
    run(l.pts, r, m);
    if (l.branch) run(l.branch, r, m);
    if (l.drops) for (const [x, z] of l.drops) run([V(x, 3.95, -5.85), V(x, 3.95, z), V(x, 3.6, z)], r * 0.9, m, false);
    // valves at both ends of every line, and at a branch's end
    valve(l.pts[0], r);
    valve(l.pts[l.pts.length - 1], r * 0.9);
    if (l.branch) valve(l.branch[l.branch.length - 1], r * 0.9);
  }
  // the receiving connection on gable A: a camlock coupling in a drip tray
  put('body', new THREE.BoxGeometry(0.25, 0.25, 0.25).translate(-0.05, 1.0, -8.0));
  put('yellow', new THREE.BoxGeometry(0.4, 0.06, 0.6).translate(0.25, 0.4, -8.0));
  for (const [k, list] of Object.entries(parts)) {
    const o = new THREE.Mesh(mergeGeometries(list), M[k]);
    o.castShadow = true;
    pipesLayer.add(o);
  }

  // ------------------------------------------------------------ the suppression
  const ap = {};
  const add = (m, g) => (ap[m] ??= []).push(g.index ? g.toNonIndexed() : g);
  for (const [x, z] of AUPT.modules) {
    const y = z === -6.5 && x === 25 ? 2.75 : 5.55;
    add('module', new THREE.CylinderGeometry(0.17, 0.17, 0.42, 18).translate(x, y, z));
    add('white', new THREE.CylinderGeometry(0.2, 0.06, 0.12, 18).translate(x, y - 0.27, z));
    add('body', new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6).translate(x, y + 0.42, z));
  }
  // the control panel (ППКУП) by the north door, the boards and the start buttons at the exits
  add('white', new THREE.BoxGeometry(0.5, 0.6, 0.18).translate(23.0, 1.5, 8.85));
  for (const [x, y, z, rot] of [[0.12, 2.6, 3.5, true], [0.12, 5.0, -3, true], [25, 2.55, 8.85, false], [27.88, 2.55, -1.5, true], [6, 2.55, -8.85, false], [13.75, 4.4, 8.85, false]]) {
    const g = new THREE.BoxGeometry(rot ? 0.05 : 0.7, 0.25, rot ? 0.7 : 0.05);
    add('boardRed', g.translate(x, y, z));
    add('board', new THREE.BoxGeometry(rot ? 0.05 : 0.7, 0.2, rot ? 0.7 : 0.05).translate(x, y - 0.32, z));
    add('yellow', new THREE.BoxGeometry(rot ? 0.06 : 0.14, 0.14, rot ? 0.14 : 0.06).translate(x, 1.5, z + (rot ? 0.8 : 0)).translate(rot ? 0 : 0.8, 0, 0));
  }
  for (const [k, list] of Object.entries(ap)) auptLayer.add(new THREE.Mesh(mergeGeometries(list), M[k]));
}
