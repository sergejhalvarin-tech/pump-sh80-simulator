// The hangar built from code, in metres: x along the 28 m length (gable A with the main gate at x 0, gable B with the
// rooms at x 28), z across the 18 m span (−9 … +9), y up from the finished floor. Every system is its own layer, so
// the equipment can be placed later against the zones on the floor.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {B, solveTruss} from './calc.js';

const HZ = B.span / 2;
const TAN = Math.tan((B.pitch * Math.PI) / 180);
// the roof's underside at a point across the span
export const roofY = (z) => B.eave + (HZ - Math.abs(z)) * TAN;

// openings, by wall: gable A (x 0), the long wall north (z +9), gable B (x 28)
export const OPEN = {
  gateA: {wall: 'A', c: -3, w: 4, y0: 0, h: 4.5, kind: 'gate'},
  doorA: {wall: 'A', c: 3.5, w: 1, y0: 0, h: 2.1, kind: 'door'},
  gateN: {wall: 'N', c: 13.75, w: 3.5, y0: 0, h: 4.0, kind: 'gate'},
  doorN: {wall: 'N', c: 25, w: 1, y0: 0, h: 2.1, kind: 'door'},
  doorB: {wall: 'B', c: -1.5, w: 1, y0: 0, h: 2.1, kind: 'door'},
  doorS: {wall: 'S', c: 6, w: 1, y0: 0, h: 2.1, kind: 'door'},
};
// windows: a row on each long wall at 3.0 … 4.0 m, every other bay of the main hall
for (const [wall, list] of [['N', [3, 7, 19]], ['S', [3, 11, 15, 19, 23]], ['B', [-6.5, 6.5]], ['A', [-7.5]]]) list.forEach((c, i) => (OPEN[`win${wall}${i}`] = {wall, c, w: 2, y0: 3, h: 1, kind: 'window'}));

// the zones for the equipment and the rooms (x0, x1, z0, z1)
export const ZONES = [
  {key: 'raw', name: 'Приёмка сырья и резервуары базовых масел', x: [0.8, 10], z: [-8.5, -3.2], col: '#d9a441', bund: true},
  {key: 'mix', name: 'Смешение: реакторы-смесители с подогревом', x: [10.8, 20.5], z: [-8.5, -3.2], col: '#e06b3a'},
  {key: 'aisle', name: 'Проезд погрузчика 3 м', x: [0.3, 21.5], z: [-3, 0], col: '#9aa3ad'},
  {key: 'fill', name: 'Линия фасовки: 1–20 л, бочки 200 л, IBC 1000 л', x: [10.8, 21], z: [0.4, 4.4], col: '#3d8fe0'},
  {key: 'store', name: 'Склад готовой продукции (стеллажи)', x: [0.8, 10], z: [0.4, 8.5], col: '#4caf7a'},
  {key: 'ship', name: 'Отгрузка, упаковка, паллеты', x: [10.8, 21], z: [5, 8.5], col: '#7c6fd6'},
];
export const ROOMS = [
  {key: 'tech', name: 'Техпомещение: ВРУ, насосная ВПВ, компрессор; над ним ПВУ', x: [22, 28], z: [-9, -4]},
  {key: 'lab', name: 'Лаборатория ОТК', x: [22, 28], z: [1, 4.5]},
  {key: 'abk', name: 'Бытовые: раздевалка, душ, санузел', x: [22, 28], z: [4.5, 9]},
];

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// a straight member of a w × h section from a to b
const bar = (a, b, w, h) => {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = box(w, h, d.length());
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, Math.abs(d.y) > 0.99 * d.length() ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  return g.applyMatrix4(m);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const canvasTex = (w, h, draw, rep = [1, 1]) => {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...rep);
  t.anisotropy = 8;
  return t;
};

export function buildHangar() {
  const root = new THREE.Group();
  const layers = {};
  const layer = (k) => (layers[k] ??= (() => {
    const g = new THREE.Group();
    g.name = k;
    root.add(g);
    return g;
  })());
  const M = {
    post: new THREE.MeshStandardMaterial({color: '#2335a8', roughness: 0.45, metalness: 0.5}),
    truss: new THREE.MeshStandardMaterial({color: '#f2d21b', roughness: 0.45, metalness: 0.4}),
    node: new THREE.MeshStandardMaterial({color: '#7fe0e6', roughness: 0.4, metalness: 0.4}),
    brace: new THREE.MeshStandardMaterial({color: '#d8262b', roughness: 0.45, metalness: 0.4}),
    purlin: new THREE.MeshStandardMaterial({color: '#9fb3c8', roughness: 0.4, metalness: 0.6}),
    concrete: new THREE.MeshStandardMaterial({color: '#b9b6ae', roughness: 0.95}),
    floor: new THREE.MeshStandardMaterial({color: '#c9cfc9', roughness: 0.5, metalness: 0.05}),
    steel: new THREE.MeshStandardMaterial({color: '#b6bdc4', roughness: 0.35, metalness: 0.85}),
    dark: new THREE.MeshStandardMaterial({color: '#2b2e33', roughness: 0.6, metalness: 0.3}),
    white: new THREE.MeshStandardMaterial({color: '#eef0f1', roughness: 0.5}),
    red: new THREE.MeshStandardMaterial({color: '#cf1f25', roughness: 0.4, metalness: 0.1}),
    green: new THREE.MeshStandardMaterial({color: '#18a058', roughness: 0.4, emissive: '#0d6b38', emissiveIntensity: 0.6}),
    blue: new THREE.MeshStandardMaterial({color: '#2f7fd6', roughness: 0.35, metalness: 0.4}),
    grey: new THREE.MeshStandardMaterial({color: '#7d848c', roughness: 0.5, metalness: 0.3}),
    orange: new THREE.MeshStandardMaterial({color: '#e8731c', roughness: 0.5}),
    yellow: new THREE.MeshStandardMaterial({color: '#f2c518', roughness: 0.5, metalness: 0.2}),
    glass: new THREE.MeshPhysicalMaterial({color: '#a9c7d6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false}),
    lamp: new THREE.MeshStandardMaterial({color: '#ffffff', emissive: '#fff6dc', emissiveIntensity: 1.2}),
  };
  const parts = {}; // merged geometry per layer|material
  const put = (lay, mat, geo) => (parts[`${lay}|${mat}`] ??= []).push(geo);
  const mesh = (lay, geo, mat) => {
    const o = new THREE.Mesh(geo, mat);
    o.castShadow = true;
    o.receiveShadow = true;
    layer(lay).add(o);
    return o;
  };

  // ------------------------------------------------------------ the slab, the floor, the drainage trays
  mesh('base', box(B.length + 3, 0.4, B.span + 3).translate(B.length / 2, -0.2 - 0.001, 0), M.concrete);
  mesh('base', box(B.length - 0.2, 0.02, B.span - 0.2).translate(B.length / 2, 0.0, 0), M.floor);
  // trays along the raw and mixing zones and across the filling line, to the oil separator outside gable A
  for (const [a, b] of [[V(0.6, 0.012, -2.9), V(21, 0.012, -2.9)], [V(10.5, 0.012, -2.9), V(10.5, 0.012, 4.6)]]) mesh('water', bar(a, b, 0.3, 0.025), M.dark);

  // ------------------------------------------------------------ the frame: posts, trusses, purlins, girts, bracing
  const truss = solveTruss();
  const xs = Array.from({length: B.trusses}, (_, i) => i * B.step);
  const T = (x, s, y) => V(x, B.eave + y, -HZ + s);
  const secDim = {top: [0.12, 0.2], bottom: [0.12, 0.2], web: [0.06, 0.1], webH: [0.12, 0.1]};
  const trussUtil = [];
  for (const x of xs) {
    for (const m of truss.mem) {
      const [s1, y1] = truss.nodes[m.a];
      const [s2, y2] = truss.nodes[m.b];
      const [w, h] = secDim[m.kind];
      const g = bar(T(x, s1, y1), T(x, s2, y2), w, h);
      put('truss', 'truss', g);
      // the same member coloured by its use of capacity, for the strength view
      const c = new THREE.Color().setHSL(Math.max(0, 0.33 - 0.33 * m.util), 0.85, 0.5);
      const gu = g.clone();
      gu.setAttribute('color', new THREE.Float32BufferAttribute(new Array(gu.attributes.position.count).fill(0).flatMap(() => [c.r, c.g, c.b]), 3));
      trussUtil.push(gu);
    }
    // the node plates at the supports
    for (const z of [-HZ, HZ]) put('truss', 'node', box(0.16, 0.5, 0.5).translate(x, B.eave + 0.15, z - Math.sign(z) * 0.2));
  }
  // posts under every truss on the long walls; the gables' posts every 1.5 m up to the roof line
  for (const x of xs) for (const z of [-HZ, HZ]) put('frame', 'post', bar(V(x, 0, z), V(x, B.eave, z), 0.12, 0.2));
  for (const x of [0, B.length]) {
    for (let z = -HZ + 1.5; z < HZ - 0.1; z += 1.5) {
      // leave the gate's width clear: posts frame it at its edges instead
      const gate = x === 0 ? OPEN.gateA : null;
      if (gate && z > gate.c - gate.w / 2 - 0.05 && z < gate.c + gate.w / 2 + 0.05) continue;
      put('frame', 'post', bar(V(x, 0, z), V(x, roofY(z) - 0.1, z), 0.2, 0.12));
    }
    if (x === 0) for (const z of [OPEN.gateA.c - OPEN.gateA.w / 2 - 0.1, OPEN.gateA.c + OPEN.gateA.w / 2 + 0.1]) put('frame', 'post', bar(V(x, 0, z), V(x, roofY(z) - 0.1, z), 0.2, 0.14));
  }
  // girts (wall rails) at 1.5, 3, 4.5 m on all four walls, broken at the openings
  const inOpening = (wall, c, y) => Object.values(OPEN).some((o) => o.wall === wall && Math.abs(c - o.c) < o.w / 2 + 0.05 && y > o.y0 - 0.05 && y < o.y0 + o.h + 0.05);
  for (const y of [1.5, 3, 4.5]) {
    for (const [wall, z] of [['N', HZ], ['S', -HZ]]) {
      for (let x = 0; x < B.length - 0.01; x += 0.5) if (!inOpening(wall, x + 0.25, y)) put('frame', 'purlin', bar(V(x, y, z), V(x + 0.5, y, z), 0.08, 0.15));
    }
    for (const [wall, x] of [['A', 0], ['B', B.length]]) {
      for (let z = -HZ; z < HZ - 0.01; z += 0.5) if (!inOpening(wall, z + 0.25, y)) put('frame', 'purlin', bar(V(x, y, z), V(x, y, z + 0.5), 0.15, 0.08));
    }
  }
  // the gate's lintels
  for (const o of Object.values(OPEN)) {
    if (o.kind === 'window') continue;
    const top = o.y0 + o.h + 0.1;
    if (o.wall === 'A' || o.wall === 'B') put('frame', 'post', bar(V(o.wall === 'A' ? 0 : B.length, top, o.c - o.w / 2 - 0.1), V(o.wall === 'A' ? 0 : B.length, top, o.c + o.w / 2 + 0.1), 0.2, 0.15));
    else put('frame', 'post', bar(V(o.c - o.w / 2 - 0.1, top, o.wall === 'N' ? HZ : -HZ), V(o.c + o.w / 2 + 0.1, top, o.wall === 'N' ? HZ : -HZ), 0.15, 0.2));
  }
  // purlins along the building on the top chords, every top-chord node (1.5 m in plan)
  for (const ni of truss.top) {
    const [s, y] = truss.nodes[ni];
    if (s === 0 || s === B.span) continue;
    put('frame', 'purlin', bar(V(-0.3, B.eave + y + 0.15, -HZ + s), V(B.length + 0.3, B.eave + y + 0.15, -HZ + s), 0.1, 0.1));
  }
  // vertical X bracing in the end bays and the middle bay of the long walls, roof bracing in the end bays
  for (const x0 of [0, 12, B.length - B.step]) {
    for (const z of [-HZ, HZ]) {
      put('frame', 'brace', bar(V(x0, 0.2, z), V(x0 + B.step, B.eave - 0.2, z), 0.05, 0.05));
      put('frame', 'brace', bar(V(x0 + B.step, 0.2, z), V(x0, B.eave - 0.2, z), 0.05, 0.05));
    }
  }
  for (const x0 of [0, B.length - B.step]) {
    for (const side of [-1, 1]) {
      const zA = side * HZ;
      put('frame', 'brace', bar(V(x0, B.eave + 0.25, zA), V(x0 + B.step, roofY(0) + 0.25, 0), 0.05, 0.05));
      put('frame', 'brace', bar(V(x0 + B.step, B.eave + 0.25, zA), V(x0, roofY(0) + 0.25, 0), 0.05, 0.05));
    }
  }

  // ------------------------------------------------------------ the sandwich panels: walls 150 mm, roof 200 mm
  const wallTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#eef1f3';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#dde2e6';
    for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 3, h);
    c.fillStyle = '#b9c0c6';
    c.fillRect(0, 0, 4, h);
  });
  const roofTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#7f8a94';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#6d7782';
    for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 14, h);
  }, [B.length / 1, 1]);
  const plinthTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#244a8f';
    c.fillRect(0, 0, w, h);
  });
  M.wall = new THREE.MeshStandardMaterial({map: wallTex, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide});
  M.roof = new THREE.MeshStandardMaterial({map: roofTex, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide});
  M.plinth = new THREE.MeshStandardMaterial({map: plinthTex, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide});
  // a wall as a shape with its openings as holes, extruded by the panel's thickness; u in metres along the wall
  const wallShape = (len, top, wall) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(len, 0);
    if (typeof top === 'number') {
      sh.lineTo(len, top);
      sh.lineTo(0, top);
    } else for (let i = 0; i <= 18; i++) sh.lineTo(len - (i / 18) * len, top((len - (i / 18) * len) - len / 2));
    sh.closePath();
    for (const o of Object.values(OPEN)) {
      if (o.wall !== wall) continue;
      const u = wall === 'A' || wall === 'B' ? o.c + HZ : o.c;
      const hole = new THREE.Path();
      hole.moveTo(u - o.w / 2, o.y0 + (o.y0 === 0 ? 0.001 : 0));
      hole.lineTo(u + o.w / 2, o.y0 + (o.y0 === 0 ? 0.001 : 0));
      hole.lineTo(u + o.w / 2, o.y0 + o.h);
      hole.lineTo(u - o.w / 2, o.y0 + o.h);
      hole.closePath();
      sh.holes.push(hole);
    }
    return sh;
  };
  const extrude = (sh, d) => new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false});
  const cladding = [];
  const clad = (geo, mat) => cladding.push(mesh('clad', geo, mat));
  // long walls: drawn in (x, y), pushed out to z ±(9 + panel)
  clad(extrude(wallShape(B.length, B.eave + 0.2, 'N'), 0.15).translate(0, 0, HZ + 0.1), M.wall);
  clad(extrude(wallShape(B.length, B.eave + 0.2, 'S'), 0.15).translate(0, 0, -HZ - 0.25), M.wall);
  // gables: drawn in (z + 9, y), turned so the shape's x runs along z
  const gable = (wall) => extrude(wallShape(B.span, (u) => roofY(u) + 0.2, wall), 0.15).rotateY(Math.PI / 2).translate(0, 0, HZ);
  clad(gable('A').translate(-0.25, 0, 0).applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1)), M.wall);
  clad(gable('B').translate(B.length + 0.1, 0, 0).applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1)), M.wall);
  // the blue plinth band 0.5 m round the bottom
  for (const z of [HZ + 0.26, -HZ - 0.26]) clad(box(B.length + 0.5, 0.5, 0.02).translate(B.length / 2, 0.25, z), M.plinth);
  // roof: two slabs from the eaves (0.4 m overhang) to the ridge, 0.2 thick, the ridge capped
  const slope = HZ / Math.cos((B.pitch * Math.PI) / 180) + 0.45;
  for (const s of [-1, 1]) {
    const g = box(B.length + 0.6, 0.2, slope);
    g.rotateX(s * (B.pitch * Math.PI) / 180);
    const zc = s * (HZ / 2 + 0.2);
    clad(g.translate(B.length / 2, roofY(zc) + 0.38, zc), M.roof);
  }
  clad(box(B.length + 0.6, 0.12, 0.5).translate(B.length / 2, roofY(0) + 0.5, 0), M.grey);
  // the openings' fillings: sectional gates, doors, windows (not cladding: they stay when it goes)
  const gateTex = canvasTex(64, 256, (c, w, h) => {
    c.fillStyle = '#d8dde1';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#a9b1b8';
    for (let y = 0; y < h; y += 52) c.fillRect(0, y, w, 4);
  });
  M.gate = new THREE.MeshStandardMaterial({map: gateTex, roughness: 0.5, metalness: 0.3});
  for (const o of Object.values(OPEN)) {
    const mat = o.kind === 'gate' ? M.gate : o.kind === 'door' ? M.dark : M.glass;
    const t = o.kind === 'window' ? 0.03 : 0.06;
    let g;
    if (o.wall === 'A' || o.wall === 'B') g = box(t, o.h, o.w).translate(o.wall === 'A' ? -0.05 : B.length + 0.15, o.y0 + o.h / 2, o.c);
    else g = box(o.w, o.h, t).translate(o.c, o.y0 + o.h / 2, o.wall === 'N' ? HZ + 0.15 : -HZ - 0.15);
    cladding.push(mesh('clad', g, mat));
  }

  // ------------------------------------------------------------ rooms: partitions of 100 mm panels, 3 m high, the
  // mezzanine over the technical room carrying the air-handling unit
  const RH = 3;
  for (const r of ROOMS) {
    const [x0, x1] = r.x;
    const [z0, z1] = r.z;
    if (x0 > 0.1) mesh('rooms', box(0.1, RH, z1 - z0).translate(x0, RH / 2, (z0 + z1) / 2), M.white);
    if (z0 > -HZ + 0.1) mesh('rooms', box(x1 - x0, RH, 0.1).translate((x0 + x1) / 2, RH / 2, z0), M.white);
    if (z1 < HZ - 0.1) mesh('rooms', box(x1 - x0, RH, 0.1).translate((x0 + x1) / 2, RH / 2, z1), M.white);
    mesh('rooms', box(x1 - x0, 0.12, z1 - z0).translate((x0 + x1) / 2, RH + 0.06, (z0 + z1) / 2), r.key === 'tech' ? M.grey : M.white);
    // a door into each room from the hall
    mesh('rooms', box(0.06, 2.1, 0.9).translate(x0 - 0.04, 1.05, (z0 + z1) / 2), M.dark);
  }
  // the mezzanine's rail and stair
  mesh('rooms', box(6, 1.0, 0.04).translate(25, RH + 0.6, -4), M.yellow);
  for (let i = 0; i < 10; i++) mesh('rooms', box(0.25, 0.04, 0.9).translate(21.6 - i * 0.25, 0.3 * (i + 1), -8.4), M.steel);

  // ------------------------------------------------------------ ventilation: the AHU on the mezzanine, supply and
  // exhaust mains under the trusses, nozzles down, local hoods over mixing and filling, roof fans, the louvres on B
  const ahu = {x: 25, y: RH + 0.12 + 0.75, z: -6.6};
  mesh('vent', box(4.2, 1.5, 1.6).translate(ahu.x, ahu.y, ahu.z), M.grey);
  mesh('vent', box(0.6, 0.6, 1.62).translate(ahu.x - 1.2, ahu.y, ahu.z), M.blue);
  for (const z of [-7.6, -5.6]) mesh('vent', box(0.06, 1.0, 1.0).translate(B.length + 0.2, 4.6, z), M.dark);
  const duct = (pts, r, mat = M.steel) => mesh('vent', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 64, r, 16), mat);
  const yD = B.eave - 0.55;
  duct([V(ahu.x - 2, ahu.y + 0.3, -6.6), V(22, yD, -5.8), V(16, yD, -5.8), V(1.5, yD, -5.8)], 0.32);
  duct([V(ahu.x - 2, ahu.y - 0.3, -6.9), V(21.5, yD - 0.2, -2), V(16, yD - 0.2, 2.5), V(1.5, yD - 0.2, 2.5)], 0.28, M.purlin);
  for (let x = 2; x <= 20; x += 3) {
    mesh('vent', new THREE.CylinderGeometry(0.12, 0.22, 0.6, 16).translate(x, yD - 0.55, -5.8), M.steel);
    mesh('vent', box(0.6, 0.3, 0.05).translate(x + 1.5, yD - 0.2, 2.24), M.dark);
  }
  // local hoods: two over the mixers, two over the filling line, their risers up to the exhaust main
  for (const [x, z] of [[13, -6], [18, -6], [13.5, 2.4], [18.5, 2.4]]) {
    mesh('vent', new THREE.ConeGeometry(0.9, 0.6, 4, 1, true).rotateY(Math.PI / 4).translate(x, 3.0, z), M.purlin);
    duct([V(x, 3.3, z), V(x, yD - 0.2, z), V(x, yD - 0.2, 2.5)], 0.12, M.purlin);
  }
  for (const x of [8, 20]) {
    mesh('vent', new THREE.CylinderGeometry(0.45, 0.55, 0.7, 20).translate(x, roofY(0) + 0.85, 0), M.grey);
    mesh('vent', new THREE.CylinderGeometry(0.6, 0.6, 0.1, 20).translate(x, roofY(0) + 1.25, 0), M.dark);
  }
  // air curtains over the two gates
  mesh('heat', box(0.4, 0.35, OPEN.gateA.w).translate(0.35, OPEN.gateA.h + 0.35, OPEN.gateA.c), M.white);
  mesh('heat', box(OPEN.gateN.w, 0.35, 0.4).translate(OPEN.gateN.c, OPEN.gateN.h + 0.35, HZ - 0.35), M.white);

  // ------------------------------------------------------------ heating: electric air heaters on the posts
  for (const [x, z] of [[4, -HZ + 0.5], [10, -HZ + 0.5], [16, -HZ + 0.5], [6, HZ - 0.5], [18, HZ - 0.5], [0.5, 6], [21, HZ - 0.5]]) {
    const g = box(0.7, 0.7, 0.45);
    mesh('heat', g.translate(x, 3.6, z), M.orange);
    mesh('heat', box(0.55, 0.55, 0.02).translate(x, 3.6, z - Math.sign(z) * 0.235), M.dark);
  }

  // ------------------------------------------------------------ electrics: switchboard, trays, high-bay lights, sockets,
  // the lightning rod and the earth loop round the slab, the incoming cable from the substation
  mesh('elec', box(0.6, 2.0, 1.6).translate(27.6, 1.0, -8.0), M.grey);
  for (const z of [-HZ + 0.45, HZ - 0.45]) for (let x = 0.5; x < 21.8; x += 1) mesh('elec', box(1.0, 0.06, 0.4).translate(x + 0.5, 4.7, z), M.yellow);
  for (let x = 2; x <= 20; x += 3) for (const z of [-7, -1.8, 2.2, 7]) {
    mesh('elec', new THREE.CylinderGeometry(0.22, 0.3, 0.22, 20).translate(x, B.eave - 0.15, z), M.grey);
    mesh('elec', new THREE.CircleGeometry(0.27, 20).rotateX(Math.PI / 2).translate(x, B.eave - 0.27, z), M.lamp);
  }
  for (const x of [2, 6, 10, 14, 18]) for (const z of [-HZ + 0.25, HZ - 0.25]) mesh('elec', box(0.3, 0.4, 0.15).translate(x, 1.2, z), M.grey);
  mesh('elec', new THREE.CylinderGeometry(0.02, 0.02, 3, 6).translate(B.length / 2, roofY(0) + 2, 0), M.steel);
  const loop = new THREE.CatmullRomCurve3([V(-1, 0.02, -HZ - 1), V(B.length + 1, 0.02, -HZ - 1), V(B.length + 1, 0.02, HZ + 1), V(-1, 0.02, HZ + 1)], true, 'catmullrom', 0);
  mesh('elec', new THREE.TubeGeometry(loop, 120, 0.03, 6, true), M.yellow);
  mesh('elec', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(27.6, 0.3, -8), V(29.5, -0.3, -8), V(36, -0.3, -8)]), 30, 0.05, 8), M.dark);
  mesh('elec', box(2.4, 2.2, 2.0).translate(37.5, 1.1, -8), M.grey);

  // ------------------------------------------------------------ water and sewers: the main in, the fire hydrant
  // cabinets by the gates, the domestic drains to the septic, the oil separator for the floor's trays
  const pipe = (pts, r, mat) => mesh('water', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), 48, r, 10), mat);
  pipe([V(36, -0.6, -4.5), V(28.3, -0.6, -4.5), V(27.6, 0.4, -4.6), V(27.6, 2.6, -4.6), V(22.3, 2.6, -4.6), V(22.3, 2.6, 4.5), V(26, 2.6, 8.6)], 0.04, M.blue);
  pipe([V(22.3, 2.6, -2.5), V(10.6, 2.6, -2.5), V(10.6, 1.0, -2.5)], 0.03, M.blue);
  pipe([V(27.6, 2.4, -4.4), V(27.6, 2.4, -HZ + 0.4), V(1.0, 2.4, -HZ + 0.4), V(0.4, 1.5, -HZ + 0.4)], 0.05, M.red);
  for (const [x, z] of [[0.6, -HZ + 0.35], [0.6, HZ - 0.4], [16, HZ - 0.35]]) mesh('water', box(0.65, 0.85, 0.25).translate(x, 1.35, z), M.red);
  pipe([V(26, 0.05, 7.5), V(26, -0.4, 7.5), V(26, -0.6, 10.5), V(26, -0.6, 14)], 0.06, M.grey);
  mesh('water', new THREE.CylinderGeometry(1.0, 1.0, 1.2, 24).translate(26, 0.1, 15.2), M.grey);
  pipe([V(0.6, 0.0, -2.9), V(-1.2, -0.5, -2.9), V(-4, -0.6, -2.9)], 0.06, M.dark);
  mesh('water', new THREE.CylinderGeometry(0.9, 0.9, 0.9, 24).translate(-5, 0.0, -2.9), M.orange);

  // ------------------------------------------------------------ fire: smoke detectors, call points and sounders at the
  // exits, exit signs over the doors, extinguishers
  for (let x = 2; x <= 20; x += 4.5) for (const z of [-6, 0, 6]) mesh('fire', new THREE.CylinderGeometry(0.08, 0.1, 0.06, 12).translate(x, roofY(z) - 0.2, z), M.white);
  for (const o of Object.values(OPEN)) {
    if (o.kind !== 'door' && o.kind !== 'gate') continue;
    const inX = o.wall === 'A' ? 0.15 : o.wall === 'B' ? B.length - 0.15 : o.c;
    const inZ = o.wall === 'N' ? HZ - 0.15 : o.wall === 'S' ? -HZ + 0.15 : o.c;
    const side = o.wall === 'A' || o.wall === 'B' ? [0, 0, o.w / 2 + 0.4] : [o.w / 2 + 0.4, 0, 0];
    mesh('fire', box(0.12, 0.12, 0.08).translate(inX + side[0], 1.5, inZ + side[2]), M.red);
    mesh('fire', box(o.wall === 'A' || o.wall === 'B' ? 0.05 : 0.6, 0.22, o.wall === 'A' || o.wall === 'B' ? 0.6 : 0.05).translate(inX, o.h + 0.35, inZ), M.green);
  }
  for (const [x, z] of [[1.2, -HZ + 0.3], [9.5, -3.1], [21, -3.1], [21, 4.6], [9.5, 8.8], [21.5, -HZ + 0.3]]) {
    mesh('fire', new THREE.CylinderGeometry(0.09, 0.09, 0.55, 14).translate(x, 0.3, z), M.red);
    mesh('fire', new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).translate(x, 0.63, z), M.dark);
  }

  // ------------------------------------------------------------ the zones on the floor, labelled
  const label = (text, sub, col) => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 200;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(255,255,255,0.94)';
    c.beginPath();
    c.roundRect(4, 4, 1016, 192, 22);
    c.fill();
    c.fillStyle = col;
    c.fillRect(4, 4, 16, 192);
    c.fillStyle = '#16181b';
    c.font = '700 54px Inter, Segoe UI, sans-serif';
    c.fillText(text, 44, 86);
    c.fillStyle = '#5d636a';
    c.font = '500 40px Inter, Segoe UI, sans-serif';
    c.fillText(sub, 44, 152);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: t, transparent: true}));
    sp.scale.set(4.6, 0.9, 1);
    sp.renderOrder = 10;
    return sp;
  };
  for (const zn of ZONES) {
    const [x0, x1] = zn.x;
    const [z0, z1] = zn.z;
    const m = new THREE.MeshBasicMaterial({color: zn.col, transparent: true, opacity: 0.22, depthWrite: false});
    mesh('zones', new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2), m).renderOrder = 1;
    // the zone's yellow-black floor line, and the bund's kerb round the raw-oil tanks
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, 0.001, z1 - z0)), new THREE.LineBasicMaterial({color: zn.col}));
    edge.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    layer('zones').add(edge);
    if (zn.bund) for (const [a, b] of [[V(x0, 0.1, z0), V(x1, 0.1, z0)], [V(x0, 0.1, z1), V(x1, 0.1, z1)], [V(x0, 0.1, z0), V(x0, 0.1, z1)], [V(x1, 0.1, z0), V(x1, 0.1, z1)]]) mesh('zones', bar(a, b, 0.15, 0.2), M.concrete);
    const area = ((x1 - x0) * (z1 - z0)).toFixed(0);
    const sp = label(zn.name.split(':')[0], `${area} м² · ${zn.name.includes(':') ? zn.name.split(':')[1].trim() : zn.name}`.slice(0, 48), zn.col);
    sp.position.set((x0 + x1) / 2, 1.4, (z0 + z1) / 2);
    layer('zones').add(sp);
  }
  for (const r of ROOMS) {
    const sp = label(r.name.split(':')[0], `${((r.x[1] - r.x[0]) * (r.z[1] - r.z[0])).toFixed(0)} м²${r.name.includes(':') ? ' · ' + r.name.split(':')[1].trim() : ''}`.slice(0, 48), '#6b7075');
    sp.position.set((r.x[0] + r.x[1]) / 2, RH + 1.0, (r.z[0] + r.z[1]) / 2);
    layer('zones').add(sp);
  }

  // merge the many small members into one mesh per layer and material
  for (const [k, list] of Object.entries(parts)) {
    const [lay, mat] = k.split('|');
    mesh(lay, mergeGeometries(list.map((g) => g.toNonIndexed ? g.toNonIndexed() : g)), M[mat]);
  }
  const util = mesh('util', mergeGeometries(trussUtil.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.5}));
  util.parent.visible = false;
  return {root, layers, M, cladding, truss};
}
