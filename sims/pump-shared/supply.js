// Powering the unit away from the mains: a three-phase diesel generator set on a site trailer, a frequency converter on
// a stand beside the motor, and the two cables between them. Millimetres in the pump's frame (the motor on +z, its
// terminal box gland on the −x side); the set stands off to −x.
//
// The set: ТСС АД-20С-Т400-1РКМ5 (passport): 20 kW / 25 kVA prime, 22 kW / 27.5 kVA standby, 3 × 400/230 V, 50 Hz,
// 36 A, cos φ 0.8, SHUNT excitation, 80 l tank, 3.0 / 4.5 / 6.1 l/h at 50 / 75 / 100 %, canopy 2100 × 900 × 1120 mm,
// 808 kg. The trailer is drawn for a mobile site; check the trailer version with the dealer.
// The converter: INVT GD20-011G-4 (GD20 manual V1.9, §2.5 and the outline table): 11 kW, input 3 × 380 V (−15 / +10 %)
// 32 A, output 0..400 Hz 25 A, 170 × 320 × 196.3 mm, 5.58 kg.
import * as THREE from 'three';
import {buildGensetCore} from './genset.js';
import {Z} from './motor.js';
import {GROUND, HITCH} from './truck.js';
import {Y_DRIVE} from './kin.js';

export const GENSET = {name: 'ТСС АД-20С-Т400-1РКМ5', kw: 20, kva: 25, kwMax: 22, amps: 36, volts: '3 × 400/230', hz: 50, tank: 80, fuel: [[0.5, 3.0], [0.75, 4.5], [1.0, 6.1]], size: [2100, 900, 1120], mass: 808, excitation: 'SHUNT', xd: 0.2};
export const VFD = {name: 'INVT GD20-011G-4', kw: 11, inA: 32, outA: 25, inV: '3 × 380 В −15/+10 %', outHz: '0–400 Гц', size: [170, 320, 196.3], mass: 5.58};
// where things stand
const G = {x: -1420, z: 380, deck: 430}; // the set's centre on its trailer, the trailer deck's height
const V = {x: -430, y: 560, z: 640}; // the converter's centre on its stand
const GLAND = new THREE.Vector3(-85 - 20, Y_DRIVE + 178, Z.shoulder + 250);
const FLOOR = -110;

/** fuel use, l/h, at a fraction of the set's prime power: the passport's three points, carried on linearly below half */
export const fuelAt = (k) => {
  const f = GENSET.fuel;
  if (k <= f[0][0]) return Math.max(0.6, f[0][1] - ((f[1][1] - f[0][1]) / (f[1][0] - f[0][0])) * (f[0][0] - k));
  for (let i = 0; i < f.length - 1; i++) if (k <= f[i + 1][0]) return f[i][1] + ((f[i + 1][1] - f[i][1]) * (k - f[i][0])) / (f[i + 1][0] - f[i][0]);
  return f[2][1];
};
/** the voltage dip at the set's terminals when a load of s kVA comes on at once, with a transient reactance xd (pu) */
export const dipFor = (sStart, sGen = GENSET.kva, xd = GENSET.xd) => (xd * sStart) / (sGen + xd * sStart);

export function buildSupply(M, add) {
  const mat = {
    canopy: new THREE.MeshPhysicalMaterial({color: '#5a6672', roughness: 0.5, metalness: 0.3, clearcoat: 0.3}),
    louvre: new THREE.MeshStandardMaterial({color: '#262a2f', roughness: 0.7, metalness: 0.2}),
    trailer: new THREE.MeshStandardMaterial({color: '#2a2d31', roughness: 0.6, metalness: 0.4}),
    tyre: new THREE.MeshStandardMaterial({color: '#18191b', roughness: 0.9, metalness: 0}),
    drive: new THREE.MeshPhysicalMaterial({color: '#2f3338', roughness: 0.45, metalness: 0.2, clearcoat: 0.4}),
    keypad: new THREE.MeshStandardMaterial({color: '#41464c', roughness: 0.6}),
    screen: new THREE.MeshBasicMaterial({color: '#7dffa0'}),
    cable: new THREE.MeshStandardMaterial({color: '#1c1d20', roughness: 0.55, metalness: 0.1}),
    spark: new THREE.MeshBasicMaterial({color: '#ffb21e', transparent: true, opacity: 0.95, depthWrite: false}),
    stripe: new THREE.MeshStandardMaterial({color: '#f2a516', roughness: 0.5}),
  };
  const root = new THREE.Group();

  // ------------------------------------------------------------ the generator set on a single-axle trailer
  // the set is built standing at (G.x, G.z) on the floor; on the road it hangs off the pickup's tow ball: turned half
  // a turn so its drawbar points at the truck, dropped 890 mm to the road, its hitch eye on the ball
  const genTow = new THREE.Group();
  root.add(genTow);
  const gen = new THREE.Group();
  genTow.add(gen);
  gen.position.set(-G.x, 0, -G.z);
  genTow.rotation.y = Math.PI;
  const TOW_Z = HITCH.z + GENSET.size[0] / 2 + 980;
  genTow.position.set(0, GROUND - FLOOR, TOW_Z);
  /** a point of the set as built → where it is on the road */
  const tow = (v) => new THREE.Vector3(-(v.x - G.x), v.y + GROUND - FLOOR, TOW_Z - (v.z - G.z));
  const [L, W, H] = GENSET.size;
  const y0 = G.deck;
  // trailer: two rails, the axle under the middle, two wheels with mudguards, the drawbar toward +z with a jockey wheel
  for (const s of [-1, 1]) add(gen, new THREE.BoxGeometry(70, 90, L + 200).translate(G.x + s * (W / 2 - 60), y0 - 45, G.z), mat.trailer);
  add(gen, new THREE.CylinderGeometry(35, 35, W + 260, 16).rotateZ(Math.PI / 2).translate(G.x, FLOOR + 290, G.z), mat.trailer);
  for (const s of [-1, 1]) {
    const x = G.x + s * (W / 2 + 90);
    add(gen, new THREE.CylinderGeometry(290, 290, 170, 40).rotateZ(Math.PI / 2).translate(x, FLOOR + 290, G.z), mat.tyre);
    add(gen, new THREE.CylinderGeometry(170, 170, 176, 32).rotateZ(Math.PI / 2).translate(x, FLOOR + 290, G.z), mat.trailer);
    add(gen, new THREE.CylinderGeometry(330, 330, 190, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(x, FLOOR + 290, G.z), mat.trailer).material.side = THREE.DoubleSide;
  }
  add(gen, new THREE.BoxGeometry(70, 70, 900).rotateY(0).translate(G.x, y0 - 60, G.z + L / 2 + 520), mat.trailer);
  add(gen, new THREE.TorusGeometry(40, 12, 8, 20).translate(G.x, y0 - 60, G.z + L / 2 + 980), mat.trailer);
  add(gen, new THREE.CylinderGeometry(22, 22, y0 - 60 - FLOOR - 70, 12).translate(G.x, (y0 - 60 + FLOOR + 70) / 2, G.z + L / 2 + 760), mat.trailer);
  add(gen, new THREE.CylinderGeometry(70, 70, 50, 20).rotateZ(Math.PI / 2).translate(G.x, FLOOR + 70, G.z + L / 2 + 760), mat.tyre);
  // the canopy: base frame, then a sheet box in walls (the section takes its +x wall and the +x halves of the roof and
  // ends), louvres on both long sides, the control panel door on +x, the exhaust pipe and the lifting eye on top
  add(gen, new THREE.BoxGeometry(W + 20, 90, L + 20).translate(G.x, y0 + 45, G.z), mat.trailer);
  const cut = []; // the parts the section takes away
  const walls = [];
  const wall = (geo, away = false) => {
    const m = add(gen, geo, mat.canopy);
    walls.push(m);
    if (away) cut.push(m);
    return m;
  };
  const hc = H - 90;
  const yc = y0 + 90 + hc / 2;
  wall(new THREE.BoxGeometry(4, hc, L).translate(G.x - W / 2 + 2, yc, G.z));
  wall(new THREE.BoxGeometry(4, hc, L).translate(G.x + W / 2 - 2, yc, G.z), true);
  for (const sx of [-1, 1]) {
    wall(new THREE.BoxGeometry(W / 2, 4, L).translate(G.x + (sx * W) / 4, y0 + H - 2, G.z), sx > 0);
    for (const sz of [-1, 1]) wall(new THREE.BoxGeometry(W / 2, hc, 4).translate(G.x + (sx * W) / 4, yc, G.z + sz * (L / 2 - 2)), sx > 0);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const m = add(gen, new THREE.BoxGeometry(6, 26, 520).translate(G.x + s * (W / 2 + 3), y0 + 330 + k * 60, G.z - L / 2 + 360), mat.louvre);
      if (s > 0) cut.push(m);
    }
    const m = add(gen, new THREE.BoxGeometry(6, 40, L - 40).translate(G.x + s * (W / 2 + 3), y0 + 140, G.z), mat.stripe);
    if (s > 0) cut.push(m);
  }
  for (const m of [
    add(gen, new THREE.BoxGeometry(6, 520, 600).translate(G.x + W / 2 + 4, y0 + 640, G.z + L / 2 - 420), mat.louvre),
    add(gen, new THREE.BoxGeometry(8, 200, 300).translate(G.x + W / 2 + 7, y0 + 760, G.z + L / 2 - 420), mat.keypad),
    add(gen, new THREE.BoxGeometry(4, 70, 120).translate(G.x + W / 2 + 12, y0 + 800, G.z + L / 2 - 420), mat.screen),
  ])
    cut.push(m);
  add(gen, new THREE.CylinderGeometry(45, 45, 260, 20).translate(G.x - 260, y0 + H + 130, G.z - L / 2 + 420), mat.louvre);
  add(gen, new THREE.TorusGeometry(50, 14, 8, 24).rotateY(Math.PI / 2).translate(G.x, y0 + H + 50, G.z), mat.trailer);
  // the output terminals' socket box low on the +x side, toward the pump
  const out = new THREE.Vector3(G.x + W / 2 + 40, y0 + 260, G.z + L / 2 - 200);
  add(gen, new THREE.BoxGeometry(80, 160, 220).translate(out.x - 30, out.y, out.z), mat.keypad);
  // inside: the engine, the alternator, the radiator, the tank (genset.js)
  const coreG = new THREE.Group();
  coreG.position.set(G.x, 0, G.z);
  gen.add(coreG);
  const core = buildGensetCore(coreG, add, M, {y0, W, L, H});

  // ------------------------------------------------------------ the converter on a stand by the motor, with its breaker
  const drive = new THREE.Group();
  root.add(drive);
  const [dw, dh, dd] = VFD.size;
  add(drive, new THREE.BoxGeometry(60, V.y - dh / 2 - FLOOR + 200, 60).translate(V.x - 90, (V.y - dh / 2 + 200 + FLOOR) / 2, V.z), mat.trailer);
  add(drive, new THREE.BoxGeometry(400, 20, 400).translate(V.x - 90, FLOOR + 10, V.z), mat.trailer);
  add(drive, new THREE.BoxGeometry(20, dh + 300, 360).translate(V.x - dd / 2 - 10, V.y + 90, V.z), mat.trailer);
  // the drive faces +x, toward the motor and whoever stands at the unit
  add(drive, new THREE.BoxGeometry(dd, dh, dw).translate(V.x, V.y, V.z), mat.drive);
  add(drive, new THREE.BoxGeometry(6, 120, 90).translate(V.x + dd / 2 + 3, V.y + 70, V.z), mat.keypad);
  add(drive, new THREE.BoxGeometry(4, 34, 66).translate(V.x + dd / 2 + 7, V.y + 100, V.z), mat.screen);
  for (let k = 0; k < 6; k++) add(drive, new THREE.BoxGeometry(5, 40, 3).translate(V.x + dd / 2 + 2, V.y - 100, V.z - 50 + k * 20), mat.louvre);
  // the breaker QF1, 3P 40 A, in a small box above the drive
  add(drive, new THREE.BoxGeometry(120, 160, 150).translate(V.x + 20, V.y + dh / 2 + 120, V.z), mat.keypad);
  add(drive, new THREE.BoxGeometry(6, 40, 70).translate(V.x + 83, V.y + dh / 2 + 130, V.z), mat.stripe);

  // ------------------------------------------------------------ the cables: set → breaker → drive, drive → motor
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // from the set's socket on the trailer, along the drawbar to the truck, over the tailgate, across the bed to QF1
  const o = tow(out);
  const cableIn = new THREE.CatmullRomCurve3([o, v(o.x - 120, o.y - 40, o.z), v(o.x - 260, GROUND + 520, o.z - 600), v(-260, GROUND + 560, HITCH.z + 300), v(-300, 380, HITCH.z - 120), v(-330, 400, 1100), v(-380, -60, 980), v(V.x - 60, FLOOR + 40, V.z + 200), v(V.x - 40, V.y + dh / 2 + 40, V.z + 60), v(V.x + 20, V.y + dh / 2 + 60, V.z + 40)]);
  const cableOut = new THREE.CatmullRomCurve3([v(V.x, V.y - dh / 2, V.z + 40), v(V.x + 10, V.y - dh / 2 - 120, V.z + 60), v(V.x + 160, GLAND.y - 40, GLAND.z - 20), v(GLAND.x - 60, GLAND.y, GLAND.z), GLAND]);
  // the cables and the drive stand between a camera on the set's +x side and the set: the set's own view hides them
  const cables = [add(root, new THREE.TubeGeometry(cableIn, 120, 13, 10, false), mat.cable), add(root, new THREE.TubeGeometry(cableOut, 80, 11, 10, false), mat.cable)];
  // the energy along them: small amber pulses, faster with more current
  const NP = 26;
  const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(16, 12, 8), mat.spark, 2 * NP);
  sparks.renderOrder = 6;
  root.add(sparks);
  const tm = new THREE.Matrix4();
  const tp = new THREE.Vector3();
  const tq = new THREE.Quaternion();
  const ts = new THREE.Vector3();
  const lenIn = cableIn.getLength();
  const lenOut = cableOut.getLength();

  /** travel: mm the pulses have run; on: 0..1 the energy layer shown; shown: 0..1 the whole supply, which fades in for
   *  the power view and out of the others, where it would only stand behind the unit */
  const mats = [...new Set(Object.values(mat))];
  const update = (travel, on, shown = 1, {th = 0, section = false, glass = false, load = 0.3, near = false} = {}) => {
    root.visible = shown > 0.02;
    if (!root.visible) return;
    drive.visible = !near;
    for (const c of cables) c.visible = !near;
    if (near) on = 0;
    for (const m of cut) m.visible = !section;
    for (const m of walls) m.material = glass ? M.glass : mat.canopy;
    core.update(th, section, load);
    for (const m of mats) {
      const fade = shown < 0.985;
      if (m.userData.fading !== fade) {
        m.userData.fading = fade;
        m.transparent = fade || m === mat.spark;
        m.depthWrite = !fade && m !== mat.spark;
        m.needsUpdate = true;
      }
      m.opacity = (m === mat.spark ? 0.95 : 1) * (fade ? shown : 1);
    }
    for (let i = 0; i < 2 * NP; i++) {
      const first = i < NP;
      const k = first ? i : i - NP;
      const len = first ? lenIn : lenOut;
      const u = (((k / NP + travel / len) % 1) + 1) % 1;
      (first ? cableIn : cableOut).getPointAt(u, tp);
      const s = on * Math.min(1, u / 0.04, (1 - u) / 0.04);
      sparks.setMatrixAt(i, tm.compose(tp, tq, ts.setScalar(Math.max(0, s))));
    }
    sparks.instanceMatrix.needsUpdate = true;
    sparks.visible = on > 0.01;
  };
  return {root, gen, drive, update, at: {core: tow(new THREE.Vector3(G.x, 960, G.z - 500)), alt: tow(new THREE.Vector3(G.x, 960 + 245, G.z + 170)), tank: tow(new THREE.Vector3(G.x - 300, G.deck + 200, G.z + 300)), rad: tow(new THREE.Vector3(G.x - 200, 1200, G.z - 1000)), gen: tow(new THREE.Vector3(G.x, y0 + H + 60, G.z)), centre: tow(new THREE.Vector3(G.x, 960, G.z)), drive: new THREE.Vector3(V.x + dd / 2, V.y + 60, V.z), cable: cableIn.getPointAt(0.45), gland: GLAND, out: o}};
}

/** the supply at the motor's state ms (elec.js motorState), the pump's shaft power n2 kW and its oil power hydKw: the
 *  set's load, current and fuel, and the two ways to start the motor from it */
export function powerState(ms, n2, hydKw, eM) {
  const genKw = ms.pIn / 0.975; // the converter's own losses, about 2.5 %
  const load = genKw / GENSET.kw;
  // the converter's diode front end draws with a power factor of about 0.93
  const genA = (genKw * 1000) / (Math.sqrt(3) * 400 * 0.93);
  const fuel = fuelAt(load);
  const dolPeak = eM.kI * eM.iN;
  const run = ms.iLine;
  // straight on the line: the locked-rotor current for the run-up (a pump on a gear pump's torque is quick), then the
  // load current; through the converter: a 5 s ramp, the set only ever sees the power the motor is taking
  const dol = (t) => (t < 0.45 ? dolPeak * (1 - (0.15 * t) / 0.45) : run + (dolPeak * 0.85 - run) * Math.exp(-(t - 0.45) / 0.08));
  const soft = (t) => {
    const k = Math.min(1, t / 5);
    return genA * (0.12 + 0.88 * k ** 1.5) + 0.25 * genA * Math.sin(Math.PI * k);
  };
  return {
    genKw,
    load,
    genA,
    fuel,
    fuelKw: fuel * 10,
    hydKw,
    dolPeak,
    dol,
    soft,
    dipDol: dipFor((Math.sqrt(3) * 0.4 * dolPeak)),
    dipSoft: dipFor((1.3 * genKw) / 0.93),
    speed: 140 + 30 * genA, // mm/s the pulses run along the cables
  };
}
