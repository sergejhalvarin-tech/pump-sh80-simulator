// The transfer site: the 80 m³ storage tank of И-20А the pump draws from, and the KAMAZ fuel tanker it fills (8 m³),
// both from the user's models, with the two long hoses and the oil itself: in the tank, in the tanker, falling into
// its hatch, running in the hoses. Millimetres in the pump's frame, the road at GROUND; the pickup with the pump in its
// bed in the middle, the tank off to +x with its nozzles toward the pickup, the tanker parked alongside on −x.
//
// The tank model is a procedural 3000 m³ vertical steel tank (shell Ø19.16 m, floor 0.45 m up on its slab, roof 11.6 m),
// scaled uniformly to 80 m³: (80 / 3000)^⅓ = 0.299 → shell Ø5.73 m, 80 m³ fills it 3.1 m deep. Its nozzles end
// 150 mm over the road (measured off the model). The tanker is a Sketchfab model in millimetres, Z up, 8.1 m long; its
// tank was measured with rays: 4.4 m long, an ellipse 2.22 × 1.22 m, top 2.47 m and the hatch 2.9 m over the road.
//
// Section: the storage tank loses its half toward the camera (+z), the tanker its half toward the pickup (+x); the oil
// stays whole inside. Glass: both go see-through. In either the hoses turn to glass and the oil shows moving in them.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import RES_B64 from './assets/reservoir.glb';
import KAMAZ_B64 from './assets/kamaz.glb';
import SCANIA_B64 from './assets/scania.glb';
import {HOSE} from './pipes.js';
import {CFG, KTANK, planTransfer, SCANIA, VESSELS, vesselDepth, Y} from './transfer.js';
import {GROUND} from './truck.js';

export const RES = {k: Math.cbrt(80 / 3000) * 1000, x: 9800, z: -1600, rShell: 9.58, floor: 0.45, volume: 80};
RES.r = RES.rShell * RES.k; // mm
RES.y0 = GROUND + RES.floor * RES.k;
export const KAMAZ = {x: -5600, z: -400, volume: 8};
const NOZZLE = new THREE.Vector3(5448, GROUND + 150, -1600);
const HATCH = new THREE.Vector3(KTANK.x, Y.hatch, 600);
export const OIL_COL = '#c9952b';

// a model is either inlined (base64) or, in the site build, a file next to the page ("url:name.glb") fetched once the
// page is up, so the pump shows at once and the trucks and the tank arrive after
export const fetchModel = async (src) => (src.startsWith('url:') ? (await fetch(src.slice(4))).arrayBuffer() : Uint8Array.from(atob(src), (c) => c.charCodeAt(0)).buffer);
const parse = (b64) => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return fetchModel(b64).then((buf) => new Promise((ok, no) => loader.parse(buf, '', ok, no))).then((g) => g.scene);
};
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// The tanker's paint. The model came with near-black placeholder colours, so every part gets its own material here,
// picked by the part (mapped once by colouring each mesh): a KAMAZ-orange cab, a silver tank, a black chassis, the
// tyres split from their rims by radius, tinted glass, lit lamps. Y up, the cab toward +z, millimetres.
const PAINT = {
  cab: {color: '#e8621c', roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08},
  tank: {color: '#c5cace', roughness: 0.28, metalness: 0.7, clearcoat: 0.6, clearcoatRoughness: 0.12},
  black: {color: '#1d1f22', roughness: 0.55, metalness: 0.3},
  chassis: {color: '#26282b', roughness: 0.6, metalness: 0.45},
  dark: {color: '#3a3d41', roughness: 0.5, metalness: 0.4},
  alu: {color: '#a7adb2', roughness: 0.35, metalness: 0.85},
  rubber: {color: '#161617', roughness: 0.93, metalness: 0, sheen: 0.3, sheenColor: '#3a3a3a'},
  rim: {color: '#9aa0a6', roughness: 0.45, metalness: 0.25, clearcoat: 0.5},
  seal: {color: '#0e0e0f', roughness: 0.8, metalness: 0},
  seat: {color: '#3a332e', roughness: 0.85, metalness: 0},
  white: {color: '#eceeef', roughness: 0.4, metalness: 0.1},
  red: {color: '#c11d1d', roughness: 0.35, metalness: 0.2, clearcoat: 0.8},
  amber: {color: '#ff9b22', roughness: 0.2, emissive: '#ff8a10', emissiveIntensity: 0.9},
  lamp: {color: '#fff4d6', roughness: 0.1, emissive: '#fff0c8', emissiveIntensity: 0.6},
  glass: {color: '#86a3b0', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, glass: true},
  lens: {color: '#f3f6f7', roughness: 0.05, transparent: true, opacity: 0.55, emissive: '#fffbe8', emissiveIntensity: 0.25, depthWrite: false, glass: true},
};
const PARTS = {
  Object_2: 'lamp', Object_3: 'seat', Object_4: 'black', Object_5: 'seal', Object_6: 'amber', Object_7: 'red', Object_8: 'black',
  Object_9: 'white', Object_10: 'glass', Object_11: 'white', Object_12: 'white', Object_13: 'white', Object_14: 'lens',
  Object_15: 'cab', Object_16: 'tank', Object_17: 'tank', Object_20: 'black', Object_21: 'chassis', Object_22: 'dark',
  Object_23: 'dark', Object_24: 'alu', Object_25: 'alu', Object_26: 'chassis', Object_27: 'chassis', Object_19: 'rim',
};
const WHEELS = ['Object_18', 'Object_28', 'Object_29', 'Object_30', 'Object_31', 'Object_32', 'Object_33'];
const CAB_Z = 2350; // the cab's back wall: the doors share a mesh with the tank

export function paintKamaz(kam) {
  const mats = {};
  for (const [k, o] of Object.entries(PAINT)) {
    const {glass, ...p} = o;
    mats[k] = new THREE.MeshPhysicalMaterial(p);
    mats[k].userData.glass = !!glass;
  }
  kam.updateMatrixWorld(true);
  const split = (m, test, a, b) => sortTris(m, (q) => (test(q) ? 1 : 0), [a, b]);
  kam.traverse((m) => {
    if (!m.isMesh) return;
    if (WHEELS.includes(m.name)) {
      // the tyre is everything beyond 0.5 of the wheel's radius from its axle (the smallest of its three sizes)
      const box = new THREE.Box3().setFromObject(m);
      const ctr = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3()).toArray();
      const ax = sz.indexOf(Math.min(...sz));
      const R = Math.max(...sz) / 2;
      split(m, (q) => {
        const d = q.clone().sub(ctr).toArray();
        d[ax] = 0;
        return Math.hypot(...d) < 0.5 * R;
      }, mats.rubber, mats.rim);
    } else if (m.name === 'Object_16') split(m, (q) => q.z > CAB_Z, mats.tank, mats.cab);
    else m.material = mats[PARTS[m.name] ?? 'dark'];
    m.userData.glass = !Array.isArray(m.material) && m.material.userData.glass;
  });
}

// Reorder a mesh's triangles into groups by where their centres lie (in the model's frame), each its own material.
function sortTris(m, which, mats) {
  const g = m.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const at = (i) => (idx ? idx.getX(i) : i);
  const n = (idx ? idx.count : pos.count) / 3;
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  const groups = mats.map(() => []);
  for (let t = 0; t < n; t++) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(p.fromBufferAttribute(pos, at(3 * t + k)).applyMatrix4(m.matrixWorld));
    groups[which(c.multiplyScalar(1 / 3))].push(at(3 * t), at(3 * t + 1), at(3 * t + 2));
  }
  g.setIndex(groups.flat());
  g.clearGroups();
  let start = 0;
  groups.forEach((gr, i) => {
    g.addGroup(start, gr.length, i);
    start += gr.length;
  });
  m.material = mats;
}

// The storage tank in plant colours, by where each triangle sits (the model in metres, axis at x = z = 0): a concrete
// ring foundation, a white-enamel shell, an aluminium-paint roof, safety-yellow handrails over it; nozzles, stairs and
// pipes keep the model's own colours. A banded decal ring carries the tank's stencil: product, number, capacity.
const SHELL = {r: 9.62, top: 11.0, apex: 11.6, base: 0.46};
export function paintReservoir(res) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mats = [
    M({color: '#a29e96', roughness: 0.95, metalness: 0}),
    M({color: '#eef0f1', roughness: 0.38, metalness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.2}),
    M({color: '#b9bec3', roughness: 0.42, metalness: 0.7}),
    M({color: '#f2b705', roughness: 0.4, metalness: 0.1, clearcoat: 0.6}),
  ];
  res.updateMatrixWorld(true);
  res.traverse((m) => {
    if (!m.isMesh || m.userData.decal) return;
    const own = m.material;
    sortTris(m, (q) => {
      const r = Math.hypot(q.x, q.z);
      if (q.y < SHELL.base && r > SHELL.r - 0.3) return 0;
      if (r > SHELL.r + 0.25) return 4;
      if (q.y < SHELL.top) return 1;
      const roof = SHELL.top + ((SHELL.r - r) / SHELL.r) * (SHELL.apex - SHELL.top);
      return q.y > roof + 0.25 ? 3 : 2;
    }, [...mats, own]);
  });
  // the stencil: blue band near the top, a thin red one under it, the lettering three times round
  const cv = document.createElement('canvas');
  cv.width = 4096;
  cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#1f5aa6';
  g.fillRect(0, 0, 4096, 70);
  g.fillStyle = '#c8202a';
  g.fillRect(0, 88, 4096, 18);
  for (let i = 0; i < 3; i++) {
    const x = (i + 0.5) * (4096 / 3);
    g.textAlign = 'center';
    g.fillStyle = '#16325c';
    g.font = '800 120px Inter, Arial, sans-serif';
    g.fillText('МАСЛО И-20А', x, 260);
    g.font = '700 62px Inter, Arial, sans-serif';
    g.fillText('РВС-80  №1  ·  80 м³', x, 350);
    g.fillStyle = '#c8202a';
    g.font = '800 54px Inter, Arial, sans-serif';
    g.fillText('ОГНЕОПАСНО', x, 430);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const h = 4.2;
  const decal = new THREE.Mesh(new THREE.CylinderGeometry(9.57, 9.57, h, 160, 1, true).translate(0, SHELL.top - 0.35 - h / 2, 0), new THREE.MeshPhysicalMaterial({map: tex, transparent: true, roughness: 0.4, clearcoat: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2}));
  decal.material.userData.glass = true;
  decal.userData = {decal: true, glass: true};
  decal.renderOrder = 1;
  res.add(decal);
}

// A 20 m³ semitrailer tank in the pump's frame, its axis along z at x = 0, its rear head SCANIA.z0 ahead of the
// trailer's rear face (at SCANIA.zRear, the front toward −z): an elliptic barrel 2.5 × 1.6 m with dished heads, painted
// orange with the hazard plates and the yellow stripe, two filling hatches, the walkway with its folding rails, the
// rear ladder, the saddles down to the frame.
function buildScaniaTank() {
  const g = new THREE.Group();
  const {a, b, len} = SCANIA;
  const zr = SCANIA.zRear - SCANIA.z0; // rear head's seam
  const zf = zr - len; // front head's seam
  const yc = SCANIA.yc;
  // the paint with its markings, wrapped round the barrel (u round, v along)
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 1024;
  const c = cv.getContext('2d');
  c.fillStyle = '#e8601f';
  c.fillRect(0, 0, 2048, 1024);
  const side = (u, flip) => {
    c.save();
    c.translate(u * 2048, 512);
    c.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
    c.fillStyle = '#f6c21a';
    for (let x = -460; x < 460; x += 60) c.fillRect(x, 150, 34, 16);
    c.fillStyle = '#ffffff';
    c.font = '700 92px Arial, sans-serif';
    c.textAlign = 'center';
    c.fillText('ОГНЕОПАСНО', 140, 20);
    c.fillStyle = '#d7262b';
    c.beginPath();
    c.moveTo(-330, -60);
    c.lineTo(-250, 20);
    c.lineTo(-330, 100);
    c.lineTo(-410, 20);
    c.closePath();
    c.fill();
    c.fillStyle = '#fff';
    c.font = '700 44px Arial';
    c.fillText('3', -330, 40);
    c.fillStyle = '#f2f2f2';
    c.fillRect(-470, 60, 0, 0);
    c.font = '700 46px Arial';
    c.fillText('И-20А · 20 м³', 140, 90);
    c.restore();
  };
  side(0.25, false);
  side(0.75, true);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const paint = new THREE.MeshPhysicalMaterial({map: tex, roughness: 0.42, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide});
  const orange = new THREE.MeshPhysicalMaterial({color: '#e8601f', roughness: 0.42, metalness: 0.15, clearcoat: 0.7, side: THREE.DoubleSide});
  const steel = new THREE.MeshStandardMaterial({color: '#b9bec4', roughness: 0.35, metalness: 0.85});
  const dark = new THREE.MeshStandardMaterial({color: '#25272a', roughness: 0.6, metalness: 0.4});
  const add = (geo, m) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  // the barrel: a unit cylinder along z scaled to the ellipse
  const barrel = add(new THREE.CylinderGeometry(1, 1, len, 72, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), paint);
  barrel.scale.set(a, b, 1);
  barrel.position.set(0, yc, (zr + zf) / 2);
  // dished heads: half ellipsoids 420 mm deep
  for (const [z, s] of [[zr, 1], [zf, -1]]) {
    const h = add(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateX((s * Math.PI) / 2), orange);
    h.scale.set(a, b, 420);
    h.position.set(0, yc, z);
  }
  const top = yc + b;
  // two hatches with their dark lids, the forward one a little smaller
  for (const [dz, r] of [[SCANIA.hatchZ - SCANIA.z0, 290], [len - 1300, 250]]) {
    const z = zr - dz;
    add(new THREE.CylinderGeometry(r, r, 160, 40).translate(0, top + 60, z), orange);
    add(new THREE.CylinderGeometry(r - 30, r - 30, 40, 40).translate(0, top + 160, z), dark);
    add(new THREE.BoxGeometry(70, 50, 120).translate(0, top + 200, z), dark);
  }
  // the walkway and its rails, posts every 1.2 m
  add(new THREE.BoxGeometry(560, 24, len - 600).translate(0, top + 30, (zr + zf) / 2), steel);
  for (const s of [-1, 1]) {
    const rail = new THREE.CatmullRomCurve3([v(s * 520, top + 520, zr - 250), v(s * 520, top + 520, zf + 250)]);
    add(new THREE.TubeGeometry(rail, 8, 18, 8), steel);
    for (let z = zr - 250; z >= zf + 250; z -= 1200) add(new THREE.CylinderGeometry(14, 14, 520, 8).translate(s * 520, top + 260, z), steel);
  }
  // the rear ladder from the frame up to the walkway
  const lz = zr + 470;
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(16, 16, top - GROUND - 500, 8).translate(s * 220, (top + GROUND + 500) / 2, lz), steel);
  for (let y = GROUND + 650; y < top; y += 300) add(new THREE.CylinderGeometry(12, 12, 440, 8).rotateZ(Math.PI / 2).translate(0, y, lz), steel);
  // saddles down to the frame
  for (const z of [zr - 500, (zr + zf) / 2, zf + 500]) add(new THREE.BoxGeometry(1900, 140, 260).translate(0, GROUND + SCANIA.floor + 40, z), dark);
  return g;
}

export function buildSite() {
  const root = new THREE.Group();
  const mat = {
    hose: new THREE.MeshPhysicalMaterial({color: '#202225', roughness: 0.55, metalness: 0, clearcoat: 0.25}),
    hoseGlass: new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide}),
    steel: new THREE.MeshStandardMaterial({color: '#9aa1a8', roughness: 0.4, metalness: 0.85}),
    oil: new THREE.MeshPhysicalMaterial({color: OIL_COL, roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.86, emissive: '#6b4206', emissiveIntensity: 0.35, side: THREE.DoubleSide}),
    blue: new THREE.MeshBasicMaterial({color: '#3d8fe0'}),
    orange: new THREE.MeshBasicMaterial({color: '#f05a23'}),
  };
  const add = (parent, geo, m) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = m === mat.hose || m === mat.steel;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // ------------------------------------------------------------ the two long hoses (Б-2-75-5), each ending in a hose tail
  // suction: from the tank's nozzle along the road, up over the pickup's right side to the filter's inlet tail
  const sucCurve = new THREE.CatmullRomCurve3([NOZZLE.clone().add(v(-80, 0, 0)), v(5000, GROUND + 55, -1500), v(3600, GROUND + 50, -1100), v(1700, GROUND + 55, -560), v(1300, GROUND + 60, -300), v(1180, 0, -160), v(1040, 520, -60), v(820, 530, -20), v(700, Y.pumpIn + 40, 0), v(620, Y.pumpIn, 0)]);
  // discharge: from the pump over the left side, along the road to the tanker, up its side and into the hatch
  const pumpEnd = [v(-262, Y.pumpOut, 0), v(-560, Y.pumpOut + 60, -40), v(-820, 530, -140), v(-1040, 520, -200), v(-1180, 0, -320), v(-1300, GROUND + 60, -420)];
  // the four vessels: where each one's tank and hatch are; the KAMAZ's from its own model, the Scanias' from theirs
  // (each turned to face −z like the KAMAZ, its trailer's rear face at SCANIA.zRear)
  const tanks = VESSELS.map((ve, k) => {
    if (!k) return {...ve, x: KTANK.x, yc: KTANK.yc, z0: KTANK.zc - KTANK.len / 2, vis: KTANK.len, hatch: HATCH};
    return {...ve, yc: SCANIA.yc, z0: SCANIA.zRear - SCANIA.z0 - SCANIA.len, vis: SCANIA.len, hatch: v(ve.x, SCANIA.hatchY, SCANIA.zRear - SCANIA.hatchZ)};
  });
  // one discharge hose, moved from truck to truck: to the KAMAZ up its near side; to a Scania round behind the trucks
  // along the road, up the gap on its near side, over the walkway into the hatch
  const disCurves = tanks.map(({x, hatch}, k) => {
    if (!k) return new THREE.CatmullRomCurve3([...pumpEnd, v(-2500, GROUND + 55, 200), v(-4150, GROUND + 60, 560), v(-4250, GROUND + 900, 600), v(-4330, 1500, 600), v(-4600, 2080, 600), v(-5150, 2120, 600), v(HATCH.x, 1980, HATCH.z), v(HATCH.x, Y.hatch - 120, HATCH.z)]);
    const gx = x + 1800;
    return new THREE.CatmullRomCurve3([...pumpEnd, v(-2400, GROUND + 55, 2600), v(-4000, GROUND + 55, 5000), v(gx + 600, GROUND + 55, 5300), v(gx, GROUND + 55, 4400), v(gx, GROUND + 55, 1500), v(gx, GROUND + 600, 800), v(gx - 120, GROUND + 1900, 650), v(gx - 400, GROUND + 3000, 620), v(x + 1000, hatch.y + 420, 600), v(x + 250, hatch.y + 380, hatch.z), v(x, hatch.y - 120, hatch.z)]);
  });
  const sucHose = add(root, new THREE.TubeGeometry(sucCurve, 260, HOSE.od / 2, 14, false), mat.hose);
  const disHoses = disCurves.map((c) => add(root, new THREE.TubeGeometry(c, 360, HOSE.od / 2, 14, false), mat.hose));
  const hoses = [sucHose, ...disHoses];
  // the tank's end: a tail and a clamp on the nozzle
  add(root, new THREE.CylinderGeometry(39, 39, 130, 24).rotateZ(Math.PI / 2).translate(NOZZLE.x - 20, NOZZLE.y, NOZZLE.z), mat.steel);
  add(root, new THREE.TorusGeometry(51, 5, 8, 32).rotateY(Math.PI / 2).translate(NOZZLE.x - 60, NOZZLE.y, NOZZLE.z), mat.steel);

  // ------------------------------------------------------------ safety on the site
  // Every tanker, the pickup and the storage tank earthed before a hatch opens (static from the flowing oil): a
  // green-yellow lead from the frame to a copper rod driven into the ground. Two ОП-5 extinguishers by the pump, a
  // drip tray under the unit in the bed, the emergency stop on its post by the pickup, the hazard sign on the path.
  const stripes = (() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 8;
    const c = cv.getContext('2d');
    c.fillStyle = '#2f9e44';
    c.fillRect(0, 0, 64, 8);
    c.fillStyle = '#f2c518';
    c.fillRect(0, 0, 32, 8);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  mat.copper = new THREE.MeshStandardMaterial({color: '#b87333', roughness: 0.35, metalness: 0.9});
  mat.red = new THREE.MeshPhysicalMaterial({color: '#c8161d', roughness: 0.3, metalness: 0.1, clearcoat: 1});
  mat.black = new THREE.MeshStandardMaterial({color: '#1c1d1f', roughness: 0.7});
  mat.yellow = new THREE.MeshStandardMaterial({color: '#f2c518', roughness: 0.5});
  mat.tray = new THREE.MeshStandardMaterial({color: '#3c4148', roughness: 0.6, metalness: 0.5});
  const earth = (rod, to) => {
    add(root, new THREE.CylinderGeometry(9, 9, 420, 10).translate(rod.x, GROUND + 160, rod.z), mat.copper);
    add(root, new THREE.CylinderGeometry(22, 22, 40, 12).translate(rod.x, GROUND + 330, rod.z), mat.copper);
    const mid = rod.clone().lerp(to, 0.5);
    mid.y = GROUND + 40;
    const curve = new THREE.CatmullRomCurve3([v(rod.x, GROUND + 340, rod.z), v(rod.x + (mid.x - rod.x) * 0.3, GROUND + 30, rod.z + (mid.z - rod.z) * 0.3), mid, v(to.x, to.y - 300, to.z), to]);
    const m = new THREE.MeshStandardMaterial({map: stripes.clone(), roughness: 0.6});
    m.map.repeat.set(curve.getLength() / 120, 1);
    m.map.needsUpdate = true;
    add(root, new THREE.TubeGeometry(curve, 60, 7, 6), m);
    add(root, new THREE.BoxGeometry(50, 70, 30).translate(to.x, to.y, to.z), mat.copper);
  };
  earth(v(1700, 0, 2200), v(1050, GROUND + 520, 1150));
  earth(v(KTANK.x + 1500, 0, 4400), v(KTANK.x + 1000, GROUND + 900, 3300));
  for (const x of SCANIA.xs) earth(v(x + 1450, 0, SCANIA.zRear + 900), v(x + 1000, GROUND + 1100, SCANIA.zRear - 300));
  earth(v(RES.x - RES.r - 700, 0, RES.z + 1600), v(RES.x - RES.r * Math.cos(0.4), GROUND + 300, RES.z + RES.r * Math.sin(0.4)));
  // two extinguishers on the road by the pickup's left side
  for (const dz of [0, 260]) {
    const z = -1500 + dz;
    add(root, new THREE.CylinderGeometry(80, 80, 470, 20).translate(-1700, GROUND + 235, z), mat.red);
    add(root, new THREE.SphereGeometry(80, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(-1700, GROUND + 470, z), mat.red);
    add(root, new THREE.BoxGeometry(40, 90, 120).translate(-1700, GROUND + 560, z), mat.black);
    add(root, new THREE.TorusGeometry(70, 9, 6, 20, Math.PI).rotateY(Math.PI / 2).translate(-1640, GROUND + 420, z), mat.black);
  }
  // the drip tray's rim round the unit's frame in the bed
  for (const [w, d, x, z] of [[1340, 16, 0, -520], [1340, 16, 0, 1110], [16, 1630, -670, 295], [16, 1630, 670, 295]]) add(root, new THREE.BoxGeometry(w, 70, d).translate(x, -110 + 35, z), mat.tray);
  // the emergency stop: a yellow post and box with the red mushroom, by the pickup's right rear
  add(root, new THREE.BoxGeometry(70, 1050, 70).translate(1700, GROUND + 525, 1500), mat.yellow);
  add(root, new THREE.BoxGeometry(180, 200, 120).translate(1700, GROUND + 1150, 1500), mat.yellow);
  add(root, new THREE.CylinderGeometry(55, 45, 50, 20).rotateZ(Math.PI / 2).translate(1610, GROUND + 1160, 1500), mat.red);
  // the hazard sign by the path to the tank
  {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 320;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 512, 320);
    c.strokeStyle = '#c8161d';
    c.lineWidth = 18;
    c.strokeRect(9, 9, 494, 302);
    c.fillStyle = '#c8161d';
    c.font = '800 66px Arial';
    c.textAlign = 'center';
    c.fillText('ОГНЕОПАСНО', 256, 120);
    c.fillStyle = '#1c1d1f';
    c.font = '700 40px Arial';
    c.fillText('НЕ КУРИТЬ · НЕ ПОДХОДИТЬ', 256, 200);
    c.fillText('С ОТКРЫТЫМ ОГНЁМ', 256, 252);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    add(root, new THREE.BoxGeometry(50, 1500, 50).translate(3400, GROUND + 750, 1200), mat.steel);
    add(root, new THREE.PlaneGeometry(900, 560).translate(3400, GROUND + 1700, 1230), new THREE.MeshStandardMaterial({map: t, roughness: 0.6, side: THREE.DoubleSide}));
  }

  // ------------------------------------------------------------ the oil: in the tank, in the tanker, the stream into the hatch
  const resOil = add(root, new THREE.CylinderGeometry(RES.r - 25, RES.r - 25, 1, 72).translate(0, 0.5, 0), mat.oil);
  resOil.position.set(RES.x, RES.y0, RES.z);
  resOil.renderOrder = 2;
  // each tanker's oil: the part of its tank's ellipse under the surface, run the tank's length; rebuilt as it rises
  const segment = (ta, depth) => {
    const a = ta.a - 15;
    const b = ta.b - 15;
    const yl = Math.min(b - 0.5, -b + depth);
    const t1 = Math.asin(Math.max(-1, Math.min(1, yl / b)));
    const sh = new THREE.Shape();
    const n = 48;
    // from the surface on the right, down round the bottom, up to the surface on the left; the top edge closes it
    for (let i = 0; i <= n; i++) {
      const t = t1 - (i / n) * (Math.PI + 2 * t1);
      const x = a * Math.cos(t);
      const y = b * Math.sin(t);
      if (i) sh.lineTo(x, y);
      else sh.moveTo(x, y);
    }
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, {depth: ta.vis - 30, bevelEnabled: false, curveSegments: 1});
  };
  const oils = tanks.map((ta) => {
    const o = add(root, new THREE.BufferGeometry(), mat.oil);
    o.position.set(ta.x, ta.yc, ta.z0);
    o.renderOrder = 2;
    o.userData.built = -1;
    return o;
  });
  const stream = add(root, new THREE.CylinderGeometry(22, 30, 1, 16).translate(0, -0.5, 0), mat.oil);
  // the oil moving in the hoses: suction blue, discharge orange, as in the pump
  const NP = 70;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(24, 10, 8), mat.blue, NP);
  const dropsD = new THREE.InstancedMesh(new THREE.SphereGeometry(24, 10, 8), mat.orange, NP);
  root.add(drops, dropsD);
  const lenS = sucCurve.getLength();
  const lenD = disCurves.map((c) => c.getLength());

  // ------------------------------------------------------------ the transfer, planned once over these hoses
  const planArgs = {lenS: lenS + 900, lenD: lenD.map((l) => l + 300), resR: RES.r - 25, resFloor: RES.y0};
  let plan = planTransfer({...planArgs, cfg: CFG});
  let st0 = plan.state(0);

  // ------------------------------------------------------------ what makes the levels readable
  // the tank's sight gauge: a glass tube on the shell facing the pickup, the oil column in it, a tick every 0.5 m —
  // a real tank's own level glass, so the level is seen falling even with the shell solid
  const GA = Math.PI / 6;
  const gx = RES.x - (RES.r + 90) * Math.sin(GA);
  const gz = RES.z + (RES.r + 90) * Math.cos(GA);
  const GH = 3300;
  const gauge = new THREE.Group();
  root.add(gauge);
  mat.tube = new THREE.MeshPhysicalMaterial({color: '#e8f2f6', roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false});
  mat.oilGauge = new THREE.MeshStandardMaterial({color: OIL_COL, roughness: 0.25, emissive: '#5a3a08', emissiveIntensity: 0.6});
  mat.tick = new THREE.MeshBasicMaterial({color: '#1d1f22'});
  mat.mark = new THREE.MeshBasicMaterial({color: '#e0262b'});
  mat.target = new THREE.MeshBasicMaterial({color: '#e0262b', transparent: true, opacity: 0.75, depthWrite: false});
  for (const dx of [-70, 70]) add(gauge, new THREE.BoxGeometry(18, GH + 120, 18).translate(gx + dx * Math.cos(GA), RES.y0 + GH / 2, gz + dx * Math.sin(GA)), mat.steel);
  add(gauge, new THREE.CylinderGeometry(34, 34, GH, 20).translate(gx, RES.y0 + GH / 2, gz), mat.tube).renderOrder = 3;
  const gOil = add(gauge, new THREE.CylinderGeometry(27, 27, 1, 16).translate(0, 0.5, 0), mat.oilGauge);
  gOil.position.set(gx, RES.y0, gz);
  for (let h = 0; h <= GH; h += 250) {
    const w = h % 1000 === 0 ? 150 : h % 500 === 0 ? 110 : 70;
    add(gauge, new THREE.BoxGeometry(w, h % 500 === 0 ? 14 : 8, 6).rotateY(-GA).translate(gx + (60 + w / 2) * Math.cos(GA), RES.y0 + h, gz + (60 + w / 2) * Math.sin(GA) + 20), mat.tick);
  }
  // the start level, a red mark on the gauge and a red ring round the shell's oil, so the drop stays measured
  const mark0 = add(gauge, new THREE.BoxGeometry(200, 22, 8).rotateY(-GA).translate(gx - 30 * Math.cos(GA), 0, gz - 30 * Math.sin(GA) + 40), mat.mark);
  const ring0 = add(root, new THREE.TorusGeometry(RES.r - 20, 14, 6, 120).rotateX(Math.PI / 2).translate(RES.x, 0, RES.z), mat.target);
  // each tanker's 95 % line: a red rim inside its tank where the filling has to stop
  const rings95 = tanks.map(() => {
    const r = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color: '#e0262b'}));
    root.add(r);
    return r;
  });
  // where the start level and each tanker's fill line sit: set again whenever the conditions are
  const place = () => {
    const lv0 = RES.y0 + st0.resLevel;
    mark0.position.y = lv0;
    ring0.position.y = lv0;
    tanks.forEach((ta, k) => {
      const r = rings95[k];
      r.userData.on = VESSELS[k].on;
      if (!VESSELS[k].on) return;
      const d = vesselDepth(VESSELS[k], plan.ends[k]);
      const half = (ta.a - 15) * Math.sqrt(Math.max(0, 1 - ((d - ta.b) / (ta.b - 15)) ** 2));
      r.geometry.dispose();
      r.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * half, 1, ta.vis - 40));
      r.position.set(ta.x, ta.yc - ta.b + d, ta.z0 + ta.vis / 2);
    });
  };
  place();
  /** plan the run again under new conditions (the panel's CFG) */
  const replan = () => {
    plan = planTransfer({...planArgs, cfg: CFG});
    st0 = plan.state(0);
    place();
    return plan;
  };

  // rings spreading from where the stream hits the oil in the tanker
  const ripples = [0, 1, 2].map(() => {
    const m = new THREE.MeshBasicMaterial({color: '#fff1c9', transparent: true, depthWrite: false, side: THREE.DoubleSide});
    const r = add(root, new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), m);
    r.renderOrder = 4;
    return r;
  });

  // ------------------------------------------------------------ the models
  const models = [];
  const holders = {};
  const load = async () => {
    const [res, kam, sc] = await Promise.all([parse(RES_B64), parse(KAMAZ_B64), parse(SCANIA_B64)]);
    paintKamaz(kam);
    paintReservoir(res);
    // the Scanias: one model, three copies sharing its geometry; each its own materials, for its own section plane.
    // The scanned tank's texture reads as plastic at its own gloss: a painted steel's sheen instead. A viewer that
    // cannot decode the texture gets its mean colour.
    // the model's own tank is a third too small: its triangles above the trailer's frame go (the frame, the axles,
    // the cabinets stay), and a real 20 m³ tank is built in their place
    sc.updateMatrixWorld(true);
    const hide = new THREE.MeshBasicMaterial({visible: false});
    sc.traverse((m) => {
      if (m.isMesh && m.material.map) sortTris(m, (q) => (q.y > 1.27 ? 1 : 0), [m.material, hide]);
    });
    const scs = SCANIA.xs.map(() => sc.clone(true));
    const scCuts = SCANIA.xs.map((x) => new THREE.Plane(new THREE.Vector3(-1, 0, 0), x * 0.001));
    // section planes in world units (m): the tank keeps z ≤ its axis, the tanker x ≤ its middle
    const cutRes = new THREE.Plane(new THREE.Vector3(0, 0, -1), RES.z * 0.001);
    const cutKam = new THREE.Plane(new THREE.Vector3(-1, 0, 0), KAMAZ.x * 0.001);
    for (const [scene, cut] of [[res, cutRes], [kam, cutKam], ...scs.map((o, i) => [o, scCuts[i]])]) {
      scene.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = !m.userData.glass;
        m.receiveShadow = true;
        const list = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
          const c = scene === kam ? x : x.clone();
          c.side = THREE.DoubleSide;
          const avg = c.userData.avg;
          if (avg && !c.map && c.color.equals(new THREE.Color(1, 1, 1))) c.color.setRGB(...avg, THREE.SRGBColorSpace);
          if (c.map && scs.includes(scene)) {
            c.metalnessMap = null;
            c.roughnessMap = null;
            c.metalness = 0.25;
            c.roughness = 0.5;
          }
          if (c.transparent) c.userData.glass = true;
          models.push({m: c, cut, opacity: c.opacity, glass: c.userData.glass});
          return c;
        });
        m.material = list.length > 1 ? list : list[0];
      });
    }
    const hr = new THREE.Group();
    hr.add(res);
    hr.scale.setScalar(RES.k);
    hr.rotation.y = -Math.PI / 2;
    hr.position.set(RES.x, GROUND, RES.z);
    root.add(hr);
    const box = new THREE.Box3().setFromObject(kam);
    const hk = new THREE.Group();
    hk.add(kam);
    kam.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    hk.rotation.y = Math.PI;
    hk.position.set(KAMAZ.x, GROUND, KAMAZ.z);
    root.add(hk);
    holders.sc = scs.map((o, i) => {
      const b = new THREE.Box3().setFromObject(o);
      const h = new THREE.Group();
      h.add(o);
      // its rear face at the holder, its front out to +z: turned round, the cab faces −z like the KAMAZ's
      o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -b.min.z);
      h.scale.setScalar(1000);
      h.rotation.y = Math.PI;
      h.position.set(SCANIA.xs[i], GROUND, SCANIA.zRear);
      root.add(h);
      return h;
    });
    SCANIA.xs.forEach((x, i) => {
      const t = buildScaniaTank();
      t.position.x = x;
      root.add(t);
      t.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        models.push({m: m.material, cut: scCuts[i], opacity: 1, glass: false});
      });
    });
    holders.res = hr;
    holders.kam = hk;
    return {kamaz: new THREE.Box3().setFromObject(hk).min.toArray()};
  };

  const tm = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  const ts = new THREE.Vector3();
  const tp = new THREE.Vector3();
  let modeNow = '';
  /** shown: 0..1 the site fades in for the mobile views; s: seconds into the transfer; cut: the cut mode;
   *  run: mm the oil drops have travelled along the hoses */
  const update = (shown, s, cut, run) => {
    root.visible = shown > 0.02;
    if (!root.visible) return plan.state(s);
    const st = plan.state(s);
    const open = cut === 'section' || cut === 'glass';
    // the models: whole, cut or glass; the oil shows through in the last two
    const mode = `${cut}:${shown < 0.985}`;
    if (mode !== modeNow) {
      modeNow = mode;
      for (const {m, cut: plane, opacity, glass} of models) {
        m.clippingPlanes = cut === 'section' ? [plane] : null;
        m.transparent = glass || cut === 'glass' || shown < 0.985;
        m.depthWrite = !glass && cut !== 'glass';
        m.needsUpdate = true;
        m.userData.base = cut === 'glass' ? Math.min(opacity, 0.14) : opacity;
      }
    }
    for (const {m} of models) m.opacity = (m.userData.base ?? 1) * (shown < 0.985 ? shown : 1);
    for (const h of hoses) h.material = open ? mat.hoseGlass : mat.hose;
    // the levels
    // solid, the oil stays hidden: its skin lies a few mm inside the shell and would show through it at a distance
    resOil.visible = open;
    resOil.scale.y = Math.max(1, st.resLevel);
    oils.forEach((o, k) => {
      const dep = st.depths[k];
      o.visible = open && dep > 3 && VESSELS[k].on;
      if (o.visible && Math.abs(dep - o.userData.built) > 2) {
        o.geometry.dispose();
        o.geometry = segment(tanks[k], dep);
        o.userData.built = dep;
      }
    });
    // the hose lies to the vessel being filled, or to the next one while it is being moved
    const cur = Math.max(0, st.cur);
    const ta = tanks[cur];
    disHoses.forEach((h, k) => (h.visible = k === cur));
    const surf = ta.yc - ta.b + st.depths[cur];
    gOil.scale.y = Math.max(1, Math.min(GH, st.resLevel));
    ring0.visible = open;
    for (const r of rings95) r.visible = open && r.userData.on;
    // the stream from the hose's end down to the surface while the pump runs
    stream.visible = st.running && open;
    stream.position.set(ta.hatch.x, ta.hatch.y - 120, ta.hatch.z);
    stream.scale.y = Math.max(1, ta.hatch.y - 120 - surf);
    ripples.forEach((r, i) => {
      const u = (run / 1400 + i / 3) % 1;
      r.visible = stream.visible && st.depths[cur] > 20;
      const half = (ta.a - 30) * Math.sqrt(Math.max(0, 1 - ((st.depths[cur] - ta.b) / ta.b) ** 2));
      r.scale.setScalar(40 + u * Math.min(700, half));
      r.position.set(ta.hatch.x, surf + 3, ta.hatch.z);
      r.material.opacity = 0.7 * (1 - u);
    });
    // the drops: evenly along each hose, moving with the flow
    for (const [im, curve, len] of [[drops, sucCurve, lenS], [dropsD, disCurves[cur], lenD[cur]]]) {
      im.visible = open && st.running;
      if (!im.visible) continue;
      for (let i = 0; i < NP; i++) {
        const u = (((i / NP + run / len) % 1) + 1) % 1;
        curve.getPointAt(u, tp);
        im.setMatrixAt(i, tm.compose(tp, tq, ts.setScalar(1)));
      }
      im.instanceMatrix.needsUpdate = true;
    }
    return st;
  };
  return {root, load, update, replan, get plan() {
    return plan;
  }, holders, at: {res: v(RES.x - RES.r * 0.7, RES.y0 + 3200, RES.z + RES.r * 0.7), kam: v(KTANK.x + 900, 1600, KTANK.zc), sc: tanks.slice(1).map((ta) => v(ta.x + 900, ta.yc + ta.b, ta.z0 + ta.vis / 2)), nozzle: NOZZLE, hatch: HATCH, hoseD: disCurves[0].getPointAt(0.45), hoseS: sucCurve.getPointAt(0.4)}};
}
