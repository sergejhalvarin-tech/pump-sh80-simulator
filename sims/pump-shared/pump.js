// The Ш80-2,5 itself, built from code in millimetres: a cast-iron body in RAL 5017 blue with the figure-eight bore
// for the rotors, Ø100 ports through both side walls into flanges Ø190 on 8 × M14, the relief valve along the top,
// front and rear covers carrying four roller bearings 42308, the single face seal on the drive end, and two chevron
// rotors with involute teeth. The oil rides in the tooth spaces: each space is a pocket that fills from the root as it
// leaves the mesh and takes its colour from the pressure in it. update(phi, ops) poses everything for the drive
// shaft angle phi (degrees).
//
// The casing is cut with three-bvh-csg once at load: the bore, the ports and the passages are real holes, and the
// section is the same casing with everything ahead of z = 0 subtracted, so the cut gets a true face of its own colour.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {ADDITION, Brush, Evaluator, SUBTRACTION} from 'three-bvh-csg';
import {DA, fillOf, G, gapPressure, keyOf, PORT_R, travelU, Y_DRIVE, Y_DRIVEN, Y_PORT} from './kin.js';
import {rng} from 'teardown-kit/util.js';
import {phaseCurrents} from './elec.js';
import {buildMotor} from './motor.js';
import {buildSupply} from './supply.js';
import {buildTruck} from './truck.js';
import {buildPiping} from './pipes.js';
import {buildSite} from './site.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};

// valve line: the barrel along x on top of the casing
export const VALVE_Y = 312;
export const VALVE = {seat: -56, lift: 9, washer: 110};
export const COL = {suction: new THREE.Color('#3d8fe0'), pressure: new THREE.Color('#f05a23'), bypass: new THREE.Color('#f2a516')};

// ------------------------------------------------------------ geometry helpers
const inv = (a) => Math.tan(a) - a;
// half the angular thickness of a tooth at radius r: involute above the base circle, radial below it
const halfThick = (r) => {
  const ap = G.alpha * D2R;
  const psiP = Math.PI / (2 * G.z) - 0.014;
  const ar = Math.acos(G.rb / Math.max(r, G.rb));
  return psiP + inv(ap) - inv(ar);
};
const radii = (r0, r1, n) => Array.from({length: n + 1}, (_, k) => r0 + (r1 - r0) * (1 - Math.cos((k / n) * Math.PI * 0.5)));
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
// the gear outline, tooth 0 centred on angle 0
function gearShape(holeR) {
  const sh = new THREE.Shape();
  const pts = [];
  const rs = radii(G.rf, G.ra, 8);
  const da = (2 * Math.PI) / G.z;
  for (let i = 0; i < G.z; i++) {
    const c = i * da;
    for (const r of rs) pts.push(polar(r, c - halfThick(r)));
    for (let k = 1; k < 4; k++) {
      const h = halfThick(G.ra);
      pts.push(polar(G.ra, c - h + (2 * h * k) / 4));
    }
    for (const r of [...rs].reverse()) pts.push(polar(r, c + halfThick(r)));
    const a0 = c + halfThick(G.rf);
    const a1 = c + da - halfThick(G.rf);
    for (let k = 1; k < 5; k++) pts.push(polar(G.rf, a0 + ((a1 - a0) * k) / 5));
  }
  pts.forEach(([x, y], k) => (k ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
  sh.holes.push(h);
  return sh;
}
// the oil in gap 0 (between teeth 0 and 1): the space between the flanks from just above the root to just under the tips
function gapShape() {
  const sh = new THREE.Shape();
  const da = (2 * Math.PI) / G.z;
  const r0 = G.rf + 0.6;
  const r1 = G.ra - 0.5;
  const rs = radii(r0, r1, 8);
  const pts = [];
  for (const r of rs) pts.push(polar(r, halfThick(r) + 0.006));
  for (let k = 1; k < 5; k++) pts.push(polar(r1, halfThick(r1) + 0.006 + ((da - 2 * halfThick(r1) - 0.012) * k) / 5));
  for (const r of [...rs].reverse()) pts.push(polar(r, da - halfThick(r) - 0.006));
  for (let k = 1; k < 5; k++) pts.push(polar(r0, da - halfThick(r0) - 0.006 - ((da - 2 * halfThick(r0) - 0.012) * k) / 5));
  pts.forEach(([x, y], k) => (k ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  return sh;
}
// chevron twist: each half a helix of opposite hand, the apex in the middle, the mean phase at the quarter widths
const K_HELIX = Math.tan(G.beta * D2R) / G.r;
const twistAt = (z, hand) => hand * K_HELIX * (Math.abs(z) - G.b / 4);
function chevron(shape, hand, steps = 24) {
  const g = new THREE.ExtrudeGeometry(shape, {depth: G.b, steps, bevelEnabled: false, curveSegments: 4});
  g.translate(0, 0, -G.b / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = twistAt(p.getZ(i), hand);
    const x = p.getX(i);
    const y = p.getY(i);
    p.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
  }
  g.computeVertexNormals();
  return g;
}
const cylX = (r, len, seg = 48) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const cylY = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg);
const cylZ = (r, len, seg = 48) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
// a ring (tube with flat ends) of radii r0..r1, len long, centred on the origin, along z
function ringZ(r0, r1, len, seg = 48) {
  const pts = [new THREE.Vector2(r0, -len / 2), new THREE.Vector2(r1, -len / 2), new THREE.Vector2(r1, len / 2), new THREE.Vector2(r0, len / 2), new THREE.Vector2(r0, -len / 2)];
  return new THREE.LatheGeometry(pts, seg).rotateX(Math.PI / 2);
}
const ringX = (r0, r1, len, seg) => ringZ(r0, r1, len, seg).rotateY(Math.PI / 2);
function helixGeo(r, wire, turns, len, seg = 260) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = u * turns * Math.PI * 2;
    pts.push(new V3(Math.cos(a) * r, u * len, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, wire, 8, false);
}

export function buildPump() {
  const root = new THREE.Group();
  const M = {
    body: new THREE.MeshPhysicalMaterial({color: '#1d5e94', roughness: 0.5, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.3}),
    glass: new THREE.MeshPhysicalMaterial({color: '#4f8fc6', roughness: 0.1, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2}),
    cap: new THREE.MeshStandardMaterial({color: '#c9d2db', roughness: 0.85, metalness: 0}),
    steel: new THREE.MeshStandardMaterial({color: '#c9cdd2', roughness: 0.42, metalness: 1, envMapIntensity: 0.6}),
    gear: new THREE.MeshStandardMaterial({color: '#d3d6da', roughness: 0.45, metalness: 1, envMapIntensity: 0.55}),
    dark: new THREE.MeshPhysicalMaterial({color: '#1d1f23', roughness: 0.45, metalness: 0.3, clearcoat: 0.4}),
    bronze: new THREE.MeshStandardMaterial({color: '#b98a55', roughness: 0.4, metalness: 0.9}),
    graphite: new THREE.MeshStandardMaterial({color: '#3a3d42', roughness: 0.7, metalness: 0.1}),
    red: new THREE.MeshBasicMaterial({color: '#e3172c', transparent: true, opacity: 0.9, depthWrite: false}),
  };
  const add = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ the casing, cut once with CSG
  const ev = new Evaluator();
  ev.useGroups = true;
  ev.attributes = ['position', 'normal'];
  // every brush sits at the origin with its geometry moved into place: a result keeps its first brush's frame
  const B = (geo, pos = [0, 0, 0], mat = M.body) => {
    const b = new Brush(geo.translate(...pos), mat);
    b.updateMatrixWorld();
    return b;
  };
  const op = (a, b, kind) => {
    const r = ev.evaluate(a, b, kind);
    r.updateMatrixWorld();
    return r;
  };
  const plus = (a, ...bs) => bs.reduce((acc, b) => op(acc, b, ADDITION), a);
  const minus = (a, ...bs) => bs.reduce((acc, b) => op(acc, b, SUBTRACTION), a);

  let body = B(new RoundedBoxGeometry(200, 244, 184, 4, 14), [0, 144, 0]);
  body = plus(
    body,
    B(new THREE.BoxGeometry(200, 60, 120), [0, 280, 0]),
    B(cylX(46, 250), [25, VALVE_Y, 0]),
    B(cylY(15, 18, 6), [60, VALVE_Y + 50, 0]),
    B(new THREE.BoxGeometry(180, 24, 130), [0, 12, 0]),
    ...[-1, 1].flatMap((s) => [B(cylX(68, 30), [s * 110, Y_PORT, 0]), B(cylX(95, 20), [s * 130, Y_PORT, 0])]),
  );
  const flangeHoles = [-1, 1].flatMap((s) => Array.from({length: 8}, (_, k) => {
    const a = ((k + 0.5) * Math.PI) / 4;
    return B(cylX(7, 26, 16), [s * 130, Y_PORT + 79 * Math.sin(a), 79 * Math.cos(a)]);
  }));
  body = minus(
    body,
    B(cylZ(G.ra + 0.6, 186, 96), [0, Y_DRIVE, 0]),
    B(cylZ(G.ra + 0.6, 186, 96), [0, Y_DRIVEN, 0]),
    B(cylX(PORT_R, 330, 64), [0, Y_PORT, 0]),
    B(cylX(32, 262), [43, VALVE_Y, 0]),
    B(cylY(14, 100), [-70, VALVE_Y - 50, 0]),
    B(cylY(14, 100), [60, VALVE_Y - 50, 0]),
    ...flangeHoles,
    ...[[-70, -45], [-70, 45], [70, -45], [70, 45]].map(([x, z]) => B(cylY(9.5, 30, 20), [x, 12, z])),
  );

  const cover = (front) => {
    const s = front ? 1 : -1;
    let c = B(new RoundedBoxGeometry(200, 244, 32, 3, 10), [0, 144, s * 108]);
    if (front) c = plus(c, B(cylZ(42, 46), [0, Y_DRIVE, 146]));
    c = minus(c, B(cylZ(45.5, 26.4), [0, Y_DRIVE, s * 104.9]), B(cylZ(45.5, 26.4), [0, Y_DRIVEN, s * 104.9]));
    if (front) c = minus(c, B(cylZ(32, 40), [0, Y_DRIVE, 147.5]), B(cylZ(19.5, 200), [0, Y_DRIVE, 150]));
    return c;
  };
  const coverF = cover(true);
  const coverB = cover(false);
  let vflange = B(cylX(50, 12), [156, VALVE_Y, 0]);
  vflange = minus(vflange, B(cylX(9, 30, 20), [156, VALVE_Y, 0]));

  // the section: the same parts with everything ahead of z = 0 taken away; the cut face wears the cap colour
  const cutOf = (b) => minus(b, B(new THREE.BoxGeometry(1200, 1200, 600), [0, 150, 300], M.cap));
  const casing = [
    {name: 'body', solid: body, cut: cutOf(body)},
    {name: 'coverF', solid: coverF, cut: null},
    {name: 'coverB', solid: coverB, cut: coverB},
    {name: 'vflange', solid: vflange, cut: cutOf(vflange)},
  ].map((c) => {
    const mesh = new THREE.Mesh(c.solid.geometry, [M.body]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.mats = {solid: c.solid.material, cut: c.cut?.material};
    root.add(mesh);
    return {...c, mesh};
  });
  const [bodyC, coverFC, coverBC, vflangeC] = casing;

  // bolts on both covers, the valve flange studs
  const frontBolts = new THREE.Group();
  const backBolts = new THREE.Group();
  root.add(frontBolts, backBolts);
  const BOLTS = [[-84, 40], [-84, 110], [-84, 178], [-84, 248], [84, 40], [84, 110], [84, 178], [84, 248], [0, 34], [-40, 256], [40, 256]];
  const hex = cylZ(8.5, 7, 6);
  for (const [x, y] of BOLTS) {
    add(frontBolts, hex, M.dark).position.set(x, y, 127.5);
    add(backBolts, hex, M.dark).position.set(x, y, -127.5);
  }

  // ------------------------------------------------------------ rotors
  const rotors = new THREE.Group();
  root.add(rotors);
  const gearSh = gearShape(22);
  const mkRotor = (y, hand) => {
    const g = new THREE.Group();
    g.position.y = y;
    rotors.add(g);
    add(g, chevron(gearSh, hand), M.gear);
    return g;
  };
  const drive = mkRotor(Y_DRIVE, 1);
  const driven = mkRotor(Y_DRIVEN, -1);
  // shafts: through the gear, the bearing journals, the seal and the drive end with its key
  // the parts ahead of the gears' front faces go away in the section, so the cut looks straight at the teeth
  const ahead = [];
  add(drive, cylZ(22, 184, 40), M.steel);
  add(drive, cylZ(20, 32, 40), M.steel).position.z = -106;
  ahead.push(add(drive, cylZ(20, 44, 40), M.steel));
  ahead.at(-1).position.z = 112;
  ahead.push(add(drive, cylZ(19, 44, 40), M.steel));
  ahead.at(-1).position.z = 154;
  ahead.push(add(drive, cylZ(17.5, 70, 40), M.steel));
  ahead.at(-1).position.z = 210;
  ahead.push(add(drive, new THREE.BoxGeometry(10, 6, 52), M.dark));
  ahead.at(-1).position.set(0, 18, 214);
  add(driven, cylZ(22, 184, 40), M.steel);
  add(driven, cylZ(20, 30, 40), M.steel).position.z = -105;
  ahead.push(add(driven, cylZ(20, 30, 40), M.steel));
  ahead.at(-1).position.z = 105;

  // oil pockets: one instanced mesh per gear, the fill raised from the root in the vertex shader
  const gapSh = gapShape();
  const oilMat = new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.28, metalness: 0, envMapIntensity: 0.8});
  oilMat.onBeforeCompile = (sh) => {
    sh.uniforms.rRoot = {value: G.rf + 0.6};
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFill;\nuniform float rRoot;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n{ float r = length(transformed.xy); float rr = rRoot + (r - rRoot) * aFill; transformed.xy *= rr / max(r, 1e-3); }',
      );
  };
  oilMat.customProgramCacheKey = () => 'oil-fill';
  const mkOil = (gear, hand) => {
    const geo = chevron(gapSh, hand, 24);
    const fill = new THREE.InstancedBufferAttribute(new Float32Array(G.z).fill(1), 1);
    geo.setAttribute('aFill', fill);
    const m = new THREE.InstancedMesh(geo, oilMat, G.z);
    const mat = new THREE.Matrix4();
    for (let j = 0; j < G.z; j++) {
      m.setMatrixAt(j, mat.makeRotationZ(j * DA * D2R));
      m.setColorAt(j, COL.suction);
    }
    m.castShadow = false;
    m.receiveShadow = true;
    gear.add(m);
    return {m, fill};
  };
  const oilD = mkOil(drive, 1);
  const oilN = mkOil(driven, -1);
  // the tracked space (gap 0 of the drive gear): a red outline on its front face and a dot at its mouth
  const track = new THREE.Group();
  drive.add(track);
  {
    const pts = gapSh.getPoints().map((p) => {
      const a = twistAt(G.b / 2, 1);
      return new V3(p.x * Math.cos(a) - p.y * Math.sin(a), p.x * Math.sin(a) + p.y * Math.cos(a), G.b / 2 + 0.8);
    });
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color: '#e3172c', transparent: true, depthWrite: false}));
    line.renderOrder = 6;
    track.add(line);
    const a = twistAt(G.b / 2, 1) + (DA / 2) * D2R;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 12), M.red);
    dot.position.set(G.ra * Math.cos(a), G.ra * Math.sin(a), G.b / 2 + 2);
    dot.renderOrder = 6;
    track.add(dot);
  }

  // ------------------------------------------------------------ bearings 42308 (d 40, D 90, B 23) and the face seal
  const bearings = [];
  const roller = cylZ(6, 18, 14);
  const mkBearing = (y, z) => {
    const g = new THREE.Group();
    g.position.set(0, y, z);
    root.add(g);
    add(g, ringZ(38, 45, 23), M.steel);
    const inner = add(g, ringZ(20, 26.5, 23), M.steel);
    const cage = new THREE.Group();
    g.add(cage);
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2;
      add(cage, roller, M.steel).position.set(Math.cos(a) * 32.3, Math.sin(a) * 32.3, 0);
    }
    const b = {g, inner, cage, y, z, drive: y === Y_DRIVE};
    bearings.push(b);
    return b;
  };
  for (const y of [Y_DRIVE, Y_DRIVEN]) for (const z of [-105, 105]) mkBearing(y, z);
  const seal = new THREE.Group();
  seal.position.set(0, Y_DRIVE, 0);
  root.add(seal);
  add(seal, ringZ(20, 31, 6), M.steel).position.z = 130; // упорная втулка
  const sealSpring = add(seal, helixGeo(25.5, 2.2, 6, 20).rotateX(Math.PI / 2), M.steel);
  sealSpring.position.z = 133;
  const sealRot = add(seal, ringZ(20, 30, 7), M.bronze); // пята
  sealRot.position.z = 156.5;
  add(seal, ringZ(20, 31, 6), M.graphite).position.z = 163; // подпятник
  const sealTurn = [sealSpring, sealRot];

  // ------------------------------------------------------------ relief valve: seat, poppet, spring, washer, screw, nut, cap
  const valve = new THREE.Group();
  valve.position.y = VALVE_Y;
  root.add(valve);
  add(valve, ringX(20, 32, 6), M.steel).position.x = VALVE.seat;
  const poppet = new THREE.Group();
  valve.add(poppet);
  add(poppet, cylX(27, 6, 40), M.steel).position.x = VALVE.seat + 6.5;
  add(poppet, ringX(22, 27, 52, 40), M.steel).position.x = VALVE.seat + 35.5;
  const oring = add(poppet, new THREE.TorusGeometry(27.2, 2, 8, 40).rotateY(Math.PI / 2), M.dark);
  oring.position.x = VALVE.seat + 6.5;
  const SPRING0 = VALVE.seat + 15;
  const SPRING_LEN = VALVE.washer - SPRING0;
  const vSpring = new THREE.Group();
  valve.add(vSpring);
  add(vSpring, helixGeo(17, 3.2, 11, SPRING_LEN).rotateZ(-Math.PI / 2), M.steel);
  const washer = new THREE.Group();
  valve.add(washer);
  add(washer, cylX(26, 8, 40), M.steel).position.x = VALVE.washer + 4;
  const screw = new THREE.Group();
  valve.add(screw);
  add(screw, cylX(8, 80, 24), M.steel).position.x = VALVE.washer + 48;
  const nut = new THREE.Group();
  valve.add(nut);
  add(nut, cylX(11, 10, 6), M.dark).position.x = 167;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    add(nut, cylX(7.5, 8, 6), M.dark).position.set(166, 36 * Math.sin(a), 36 * Math.cos(a));
  }
  const cap = new THREE.Group();
  valve.add(cap);
  {
    const prof = [];
    prof.push(new THREE.Vector2(0.01, 0), new THREE.Vector2(18, 0), new THREE.Vector2(18, 20));
    for (let k = 1; k <= 8; k++) {
      const a = (k / 8) * (Math.PI / 2);
      prof.push(new THREE.Vector2(18 * Math.cos(a), 20 + 12 * Math.sin(a)));
    }
    add(cap, new THREE.LatheGeometry(prof, 32).rotateZ(-Math.PI / 2), M.body).position.x = 173;
  }

  // ------------------------------------------------------------ the oil outside the bore: streams in the ports and the bypass
  const R = rng(5017);
  const NS = 70;
  const NB = 34;
  const part = new THREE.InstancedMesh(new THREE.SphereGeometry(4.2, 12, 8), new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.3}), 2 * NS + NB);
  part.castShadow = false;
  root.add(part);
  const seeds = Array.from({length: 2 * NS + NB}, (_, i) => {
    const a = R() * Math.PI * 2;
    const rr = Math.sqrt(R()) * (i < 2 * NS ? 38 : 3);
    return {s: R(), dy: Math.sin(a) * rr, dz: Math.cos(a) * rr};
  });
  for (let i = 0; i < part.count; i++) part.setColorAt(i, i < NS ? COL.suction : i < 2 * NS ? COL.pressure : COL.bypass);
  // up the discharge passage, through the seat, round the lifted poppet's rim, along the barrel and down to suction
  const BYPASS = [[-70, 214], [-70, VALVE_Y - 6], [VALVE.seat - 6, VALVE_Y], [VALVE.seat + 6, VALVE_Y + 29], [40, VALVE_Y + 29], [60, VALVE_Y + 8], [60, 214]].map(([x, y]) => new V3(x, y, 0));
  const bpLen = [];
  let bpTotal = 0;
  for (let i = 0; i < BYPASS.length - 1; i++) {
    const l = BYPASS[i].distanceTo(BYPASS[i + 1]);
    bpLen.push(l);
    bpTotal += l;
  }
  const bpAt = (s, out) => {
    let d = s * bpTotal;
    for (let i = 0; i < bpLen.length; i++) {
      if (d <= bpLen[i] || i === bpLen.length - 1) return out.lerpVectors(BYPASS[i], BYPASS[i + 1], Math.min(1, d / bpLen[i]));
      d -= bpLen[i];
    }
    return out;
  };

  // ------------------------------------------------------------ red overlay arrows: rotation arcs at the drive end, flow arrows at the ports
  const arcs = new THREE.Group();
  root.add(arcs);
  const mkArc = (y, sign) => {
    const g = new THREE.Group();
    g.position.set(0, y, 150);
    arcs.add(g);
    for (const a0 of [0, Math.PI]) {
      const len = Math.PI * 0.55;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(66, 3.4, 8, 40, len), M.red);
      arc.rotation.z = a0;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(8.5, 20, 16), M.red);
      const ta = sign > 0 ? a0 + len : a0;
      tip.position.set(Math.cos(ta) * 66, Math.sin(ta) * 66, 0);
      tip.rotation.z = ta + (sign > 0 ? 0 : Math.PI);
      g.add(arc, tip);
    }
    g.renderOrder = 5;
    return g;
  };
  const arcD = mkArc(Y_DRIVE, 1);
  const arcN = mkArc(Y_DRIVEN, -1);
  const portArrows = new THREE.Group();
  root.add(portArrows);
  // above the gauges, clear of the flanges and the filter
  for (const x of [330, -330]) {
    const g = new THREE.Group();
    g.position.set(x, Y_PORT + 260, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 56, 12).rotateZ(Math.PI / 2), M.red);
    shaft.position.x = 10;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(14, 30, 18).rotateZ(Math.PI / 2), M.red);
    tip.position.x = -30;
    g.add(shaft, tip);
    g.renderOrder = 5;
    portArrows.add(g);
  }

  // ------------------------------------------------------------ the rest of the unit: motor, coupling, guard, frame
  const unit = buildMotor(M, add);
  root.add(unit.root);
  // the supply away from the mains: the generator set, the converter, the cables
  const supply = buildSupply(M, add);
  root.add(supply.root);
  // the pickup the unit rides in
  const truck = buildTruck(add);
  root.add(truck.root);
  // the counter flanges, hoses, the suction filter and the gauges
  const piping = buildPiping(M, add);
  root.add(piping.near, piping.far);
  // the storage tank and the tanker
  const site = buildSite();
  root.add(site.root);
  const unitParts = [unit.motor, unit.turnM, unit.turnP, unit.spider, unit.guard];

  // ------------------------------------------------------------ modes: cut, isolate (ghosting the casing), refraction
  const GHOST = new Map(
    Object.values(M).map((m) => {
      const g = m.clone();
      g.transparent = true;
      g.depthWrite = false;
      return [m, g];
    }),
  );
  // the motor's own see-through twins: it fades out of the close views on its own opacity, apart from the isolate's
  const MGHOST = new Map();
  for (const o of unitParts) o.traverse((m) => {
    if (m.isMesh && !MGHOST.has(m.material)) {
      const g = m.material.clone();
      g.transparent = true;
      g.depthWrite = false;
      MGHOST.set(m.material, g);
    }
  });
  root.traverse((m) => m.isMesh && !Array.isArray(m.material) && (m.userData.mat0 = m.material));
  const casingParts = [frontBolts, backBolts, valve, seal, ...bearings.map((b) => b.g)];
  let cut = 'solid';
  const setCut = (mode) => (cut = mode);
  const casingMat = (src, k) => {
    // src: the material a CSG group was built with (M.body or M.cap)
    const base = src === M.cap ? M.cap : cut === 'glass' ? M.glass : M.body;
    if (k <= 0.001) return base;
    const g = GHOST.get(base);
    g.opacity = (base.transparent ? base.opacity : 1) * (1 - 0.92 * k);
    return g;
  };

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new V3();
  const tmpP = new V3();
  const col = new THREE.Color();
  /** ops: p (outlet pressure, MPa), open (relief valve 0..1), flowS / bypassS (mm the oil has travelled, for the
   *  streams), flow (0..1 the oil overlay), arrows (0..1), isolate (0..1 the casing fades to a ghost), explode (0..1),
   *  dir (1, or −1 turning backwards: the ports swap, every stream and arrow mirrors across the pump), motor (0..1 the
   *  motor's fade), elec / cosPhi / load / field (the motor's supply angle in degrees, power factor, load, field shown) */
  const update = (phi, ops = {}) => {
    const p = ops.p ?? 0.25;
    const dir = ops.dir ?? 1;
    const flowOn = ops.flow ?? 1;
    const iso = ops.isolate ?? 0;
    const ex = ops.explode ?? 0;
    const lay = (a, w = 0.5) => smoother((ex - a) / w);
    const eV = lay(0);
    const eC = lay(0.12);
    const eR = lay(0.42);
    const zF = 250 * eC;
    const zB = -190 * eC;
    const zR = 135 * eR;

    // casing: solid or cut geometry, the material by cut mode and isolation
    for (const c of casing) {
      const useCut = cut === 'section';
      const src = useCut ? c.cut : c.solid;
      c.mesh.visible = !!src;
      if (!src) continue;
      if (c.mesh.geometry !== src.geometry) c.mesh.geometry = src.geometry;
      const mats = useCut ? c.mesh.userData.mats.cut : c.mesh.userData.mats.solid;
      c.mesh.material = mats.map((m) => casingMat(m, iso));
      c.mesh.renderOrder = cut === 'glass' ? 3 : 0;
      c.mesh.castShadow = cut !== 'glass';
    }
    coverFC.mesh.position.z = zF;
    coverBC.mesh.position.z = zB;
    frontBolts.position.z = zF;
    frontBolts.visible = cut !== 'section';
    backBolts.position.z = zB;
    for (const o of casingParts) {
      o.traverse((m) => {
        if (!m.isMesh || !m.userData.mat0) return;
        const base = m.userData.mat0;
        if (iso > 0.001 && GHOST.has(base)) {
          const g = GHOST.get(base);
          g.opacity = (base.transparent ? base.opacity : 1) * (1 - 0.92 * iso);
          m.material = g;
        } else m.material = base;
      });
    }

    // rotors: the drive gear turns +phi, the driven one −phi; both carry their pockets
    const a = phi * D2R;
    drive.rotation.z = a - Math.PI / 2;
    driven.rotation.z = Math.PI / 2 - (DA / 2) * D2R - a;
    rotors.position.z = zR;
    for (const [o, gear] of [[oilD, 1], [oilN, -1]]) {
      o.m.visible = flowOn > 0.01;
      for (let j = 0; j < G.z; j++) {
        const u = travelU(gear, j, phi, dir);
        const f = fillOf(u);
        o.fill.array[j] = f;
        const key = keyOf(gapPressure(u, p, gear), p);
        col.copy(COL.suction).lerp(COL.pressure, key);
        o.m.setColorAt(j, col);
        o.m.setMatrixAt(j, tmpM.makeRotationZ(j * DA * D2R).scale(tmpS.setScalar(f > 0.02 ? 1 : 0)));
      }
      o.fill.needsUpdate = true;
      o.m.instanceMatrix.needsUpdate = true;
      o.m.instanceColor.needsUpdate = true;
    }
    track.visible = (ops.track ?? 1) > 0.01;

    // bearings: inner rings with their shafts, the rollers' cage at 0.39 of shaft speed; front ones go with the cover
    const section = cut === 'section';
    for (const b of bearings) {
      const s = b.drive ? 1 : -1;
      b.inner.rotation.z = s * a;
      b.cage.rotation.z = s * a * 0.39;
      b.g.position.z = b.z + (b.z > 0 ? zF : zB);
      b.g.visible = !(section && b.z > 0);
    }
    for (const m of ahead) m.visible = !section;
    seal.position.z = zF;
    seal.visible = !section;
    for (const m of sealTurn) m.rotation.z = a;

    // relief valve: the poppet lifts off its seat, the spring shortens; exploded, the parts leave along the barrel
    const L = VALVE.lift * (ops.open ?? 0);
    poppet.position.x = L + 70 * eV;
    vSpring.position.x = SPRING0 + L + 95 * eV;
    vSpring.scale.x = (SPRING_LEN - L) / SPRING_LEN;
    washer.position.x = 120 * eV;
    screw.position.x = 150 * eV;
    nut.position.x = 175 * eV;
    vflangeC.mesh.position.x = 175 * eV;
    cap.position.x = 215 * eV;

    // the streams: suction in from +x, discharge out to −x, the bypass from the discharge port round to suction
    const fs = ops.flowS ?? 0;
    const bs = ops.bypassS ?? 0;
    const open = ops.open ?? 0;
    for (let i = 0; i < part.count; i++) {
      const sd = seeds[i];
      let sc = 0;
      if (i < 2 * NS) {
        const span = 270;
        const s = (((sd.s + fs / span) % 1) + 1) % 1;
        const x = i < NS ? 312 - span * s : -42 - span * s;
        tmpP.set(x, Y_PORT + sd.dy, sd.dz);
        sc = Math.min(1, s / 0.08, (1 - s) / 0.12);
        if (i < NS && x < 100) sc *= Math.max(0, (x - 42) / 58);
        if (i >= NS && x > -100) sc *= Math.max(0, (-42 - x) / 58);
      } else {
        const s = (((sd.s + bs / bpTotal) % 1) + 1) % 1;
        bpAt(s, tmpP);
        tmpP.y += sd.dy;
        tmpP.z += sd.dz;
        const k = (i - 2 * NS) / NB;
        sc = k < open * 1.4 ? Math.min(1, s / 0.05, (1 - s) / 0.08, open * 4) : 0;
      }
      // reversed, suction comes in from −x and the discharge leaves to +x
      if (i < 2 * NS) tmpP.x *= dir;
      // in the section the oil keeps to the half of the passages that is still there
      if (section) tmpP.z = -Math.abs(tmpP.z) - 5;
      sc *= flowOn;
      tmpM.compose(tmpP, tmpQ, tmpS.setScalar(Math.max(0, sc)));
      part.setMatrixAt(i, tmpM);
    }
    part.instanceMatrix.needsUpdate = true;
    part.visible = flowOn > 0.01 && ex < 0.02;

    // arrows: the arcs turn slowly with their gears, the port arrows point the way the oil goes
    const arOn = ops.arrows ?? 1;
    arcs.visible = arOn > 0.01 && ex < 0.05 && !section;
    portArrows.visible = arOn > 0.01 && ex < 0.05;
    arcD.rotation.z = a * 0.25;
    arcN.rotation.z = -a * 0.25;
    // mirrored across x: the arcs turn the other way, the port arrows point to +x
    arcs.scale.x = dir;
    portArrows.scale.x = dir;
    arcs.position.z = zF;

    // the unit: the coupling turns with the drive shaft; the motor fades out of the views it would stand in front of;
    // taken apart, the motor backs off first, the hubs and the spider come off the shafts, the guard lifts away
    const mk = (ops.motor ?? 1) * (1 - 0.92 * iso);
    for (const o of [unit.turnM, unit.turnP, unit.spider]) o.rotation.z = a;
    unit.motor.position.z = 430 * eV;
    unit.turnM.position.z = 430 * eV;
    unit.spider.position.z = 390 * eV;
    unit.turnP.position.z = 330 * eV;
    unit.guard.position.y = 180 * eV;
    for (const o of unitParts) {
      // the coupling and its guard sit ahead of the cut, so the section takes them away with the shaft end
      const base = !(section && (o === unit.turnP || o === unit.spider || o === unit.guard));
      o.visible = base && mk > 0.02;
      if (!o.visible) continue;
      o.traverse((m) => {
        if (!m.isMesh || !m.userData.mat0) return;
        let base = m.userData.mat0;
        if ((o === unit.guard || m.userData.glassable) && cut === 'glass') base = M.glass;
        if (mk >= 0.999) m.material = base;
        else {
          const g = base === M.glass ? GHOST.get(M.glass) : MGHOST.get(base);
          g.opacity = (base.transparent ? base.opacity : 1) * mk;
          m.material = g;
        }
      });
    }
    // the motor's insides: the field round the bore, the phase currents in the slots, the slip's current in the bars.
    // ops.elec is the supply's electrical angle (degrees), ops.cosPhi and ops.load the motor's state at this load
    const th = ops.elec ?? 0;
    const lag = Math.acos(ops.cosPhi ?? 0.79);
    unit.update(a, {
      phase: dir * ((th * Math.PI) / 180 - lag) + (2 * Math.PI) / 3,
      currents: phaseCurrents(th, lag, dir),
      rotor: Math.min(1, 0.25 + (ops.load ?? 0.5) * 1.2),
      on: ops.field ?? 1,
    }, section);
    truck.update(ops.supply ?? 1);
    site.update(ops.site ?? ops.supply ?? 1, ops.transferS ?? 0, cut, ops.oilRun ?? 0);
    piping.update(p, ops.pv ?? -0.04, ops.supply ?? 1, cut === 'glass', M.glass);
    supply.update(ops.power ?? 0, ops.powerOn ?? 1, ops.supply ?? 1, {th: ops.genAngle ?? 0, section, glass: cut === 'glass', load: ops.genLoad ?? 0.3, near: !!ops.gensetNear});
  };
  // the pump is modelled in mm; one world unit is a metre
  root.scale.setScalar(0.001);
  return {root, update, setCut, M, drive, driven, valve, supply, truck, piping, site};
}
