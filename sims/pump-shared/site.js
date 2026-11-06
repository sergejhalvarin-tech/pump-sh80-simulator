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
import {HOSE} from './pipes.js';
import {kamDepth, KTANK, planTransfer, Y} from './transfer.js';
import {GROUND} from './truck.js';

export const RES = {k: Math.cbrt(80 / 3000) * 1000, x: 9800, z: -1600, rShell: 9.58, floor: 0.45, volume: 80};
RES.r = RES.rShell * RES.k; // mm
RES.y0 = GROUND + RES.floor * RES.k;
export const KAMAZ = {x: -5600, z: -400, volume: 8};
const NOZZLE = new THREE.Vector3(5448, GROUND + 150, -1600);
const HATCH = new THREE.Vector3(KTANK.x, Y.hatch, 600);
export const OIL_COL = '#c9952b';

const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
const parse = (b64) => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((ok, no) => loader.parse(decode(b64), '', ok, no)).then((g) => g.scene);
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
  const disCurve = new THREE.CatmullRomCurve3([v(-262, Y.pumpOut, 0), v(-560, Y.pumpOut + 60, -40), v(-820, 530, -140), v(-1040, 520, -200), v(-1180, 0, -320), v(-1300, GROUND + 60, -420), v(-2500, GROUND + 55, 200), v(-4150, GROUND + 60, 560), v(-4250, GROUND + 900, 600), v(-4330, 1500, 600), v(-4600, 2080, 600), v(-5150, 2120, 600), v(HATCH.x, 1980, HATCH.z), v(HATCH.x, Y.hatch - 120, HATCH.z)]);
  const hoses = [add(root, new THREE.TubeGeometry(sucCurve, 260, HOSE.od / 2, 14, false), mat.hose), add(root, new THREE.TubeGeometry(disCurve, 300, HOSE.od / 2, 14, false), mat.hose)];
  // the tank's end: a tail and a clamp on the nozzle
  add(root, new THREE.CylinderGeometry(39, 39, 130, 24).rotateZ(Math.PI / 2).translate(NOZZLE.x - 20, NOZZLE.y, NOZZLE.z), mat.steel);
  add(root, new THREE.TorusGeometry(51, 5, 8, 32).rotateY(Math.PI / 2).translate(NOZZLE.x - 60, NOZZLE.y, NOZZLE.z), mat.steel);

  // ------------------------------------------------------------ the oil: in the tank, in the tanker, the stream into the hatch
  const resOil = add(root, new THREE.CylinderGeometry(RES.r - 25, RES.r - 25, 1, 72).translate(0, 0.5, 0), mat.oil);
  resOil.position.set(RES.x, RES.y0, RES.z);
  resOil.renderOrder = 2;
  // the tanker's oil: the part of the tank's ellipse under the surface, run the tank's length; rebuilt as it rises
  const kamOil = add(root, new THREE.BufferGeometry(), mat.oil);
  kamOil.position.set(KTANK.x, KTANK.yc, KTANK.zc - KTANK.len / 2);
  kamOil.renderOrder = 2;
  let kamBuilt = -1;
  const buildKamOil = (depth) => {
    const a = KTANK.a - 15;
    const b = KTANK.b - 15;
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
    kamOil.geometry.dispose();
    kamOil.geometry = new THREE.ExtrudeGeometry(sh, {depth: KTANK.len - 30, bevelEnabled: false, curveSegments: 1});
  };
  const stream = add(root, new THREE.CylinderGeometry(22, 30, 1, 16).translate(0, -0.5, 0), mat.oil);
  stream.position.set(HATCH.x, Y.hatch - 120, HATCH.z);
  // the oil moving in the hoses: suction blue, discharge orange, as in the pump
  const NP = 70;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(24, 10, 8), mat.blue, NP);
  const dropsD = new THREE.InstancedMesh(new THREE.SphereGeometry(24, 10, 8), mat.orange, NP);
  root.add(drops, dropsD);
  const lenS = sucCurve.getLength();
  const lenD = disCurve.getLength();

  // ------------------------------------------------------------ the transfer, planned once over these hoses
  const plan = planTransfer({lenS: lenS + 900, lenD: lenD + 300, resR: RES.r - 25, resFloor: RES.y0});
  const st0 = plan.state(0);

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
  const lv0 = RES.y0 + st0.resLevel;
  add(gauge, new THREE.BoxGeometry(200, 22, 8).rotateY(-GA).translate(gx - 30 * Math.cos(GA), lv0, gz - 30 * Math.sin(GA) + 40), mat.mark);
  const ring0 = add(root, new THREE.TorusGeometry(RES.r - 20, 14, 6, 120).rotateX(Math.PI / 2).translate(RES.x, lv0, RES.z), mat.target);
  // the tanker's 95 % line: a red rim inside its tank where the filling has to stop
  const d95 = kamDepth(plan.vEnd);
  const half95 = (KTANK.a - 15) * Math.sqrt(Math.max(0, 1 - ((d95 - KTANK.b) / (KTANK.b - 15)) ** 2));
  const ring95 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * half95, 1, KTANK.len - 40)), new THREE.LineBasicMaterial({color: '#e0262b'}));
  ring95.position.set(KTANK.x, KTANK.yc - KTANK.b + d95, KTANK.zc);
  root.add(ring95);

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
    const [res, kam] = await Promise.all([parse(RES_B64), parse(KAMAZ_B64)]);
    paintKamaz(kam);
    paintReservoir(res);
    // section planes in world units (m): the tank keeps z ≤ its axis, the tanker x ≤ its middle
    const cutRes = new THREE.Plane(new THREE.Vector3(0, 0, -1), RES.z * 0.001);
    const cutKam = new THREE.Plane(new THREE.Vector3(-1, 0, 0), KAMAZ.x * 0.001);
    for (const [scene, cut] of [[res, cutRes], [kam, cutKam]]) {
      scene.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = !m.userData.glass;
        m.receiveShadow = true;
        const list = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
          const c = scene === kam ? x : x.clone();
          c.side = THREE.DoubleSide;
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
    const surf = KTANK.yc - KTANK.b + st.kamDepth;
    kamOil.visible = open && st.kamDepth > 3;
    if (kamOil.visible && Math.abs(st.kamDepth - kamBuilt) > 2) {
      buildKamOil(st.kamDepth);
      kamBuilt = st.kamDepth;
    }
    gOil.scale.y = Math.max(1, Math.min(GH, st.resLevel));
    ring0.visible = open;
    ring95.visible = open;
    // the stream from the hose's end down to the surface while the pump runs
    stream.visible = st.running && open;
    stream.scale.y = Math.max(1, Y.hatch - 120 - surf);
    ripples.forEach((r, i) => {
      const u = (run / 1400 + i / 3) % 1;
      r.visible = stream.visible && st.kamDepth > 20;
      const half = (KTANK.a - 30) * Math.sqrt(Math.max(0, 1 - ((st.kamDepth - KTANK.b) / KTANK.b) ** 2));
      r.scale.setScalar(40 + u * Math.min(700, half));
      r.position.set(HATCH.x, surf + 3, HATCH.z);
      r.material.opacity = 0.7 * (1 - u);
    });
    // the drops: evenly along each hose, moving with the flow
    for (const [im, curve, len] of [[drops, sucCurve, lenS], [dropsD, disCurve, lenD]]) {
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
  return {root, load, update, plan, holders, at: {res: v(RES.x - RES.r * 0.7, RES.y0 + 3200, RES.z + RES.r * 0.7), kam: v(KTANK.x + 900, 1600, KTANK.zc), nozzle: NOZZLE, hatch: HATCH, hoseD: disCurve.getPointAt(0.45), hoseS: sucCurve.getPointAt(0.4)}};
}
