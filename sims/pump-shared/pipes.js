// The pump's piping: a counter flange with a hose tail on each port, the hoses, the coarse filter on the suction line,
// the two gauges. The long runs out to the storage tank and the tanker are in site.js.
// Millimetres in the pump's frame: suction port +x, discharge port −x, both on y 170.
//
// From the pump manual (867-010-00-1 РЭ): port flanges Ø190, 8 × M14 threaded holes on Ø158 (Appendix Б), flanges to
// ГОСТ 1536-76 for 0.6 MPa (Appendix В); no pipe loads on the ports (2.1.3); a filter on the suction line with a mesh of
// at most 0.25 mm for oils and diesel, 1.0 mm for crude and fuel oil (2.2.3); a check valve on the suction line or a
// gooseneck at least as high as the pump (2.2.4); a pressure gauge 0..600 kPa and a compound gauge −100..150 kPa
// (Table 3). The counter flange is drawn to those pump dimensions (docs: Фланец ответный с ниппелем.pdf).
// Hose: Б-2-75-5 ГОСТ 5398-76 (oil resistant, 75 mm bore, 0.5 MPa, vacuum 0.08 MPa, bend radius ≥ 400, 4.0 kg/m).
// Filter: DN.ru YS-316 DN80 (passport): Y strainer, AISI 316, mesh 0.25 mm, PN 1.6 MPa, oils, threaded G3", L 200,
// H 300, mounted on a horizontal line with its cap down.
import * as THREE from 'three';
import {Y_PORT} from './kin.js';

export const FLANGE = {D: 190, pcd: 158, holes: 8, bolt: 'M14', t: 18, tail: 78, tailLen: 130, bore: 68};
export const HOSE = {name: 'Б-2-75-5 ГОСТ 5398-76', id: 75, od: 96, wp: 0.5, vac: 0.08, bend: 400, kgm: 4.0, temp: '−35…+90 °С'};
export const FILTER = {name: 'DN.ru YS-316 DN80', mesh: 0.25, pn: 1.6, L: 200, H: 300, mass: 1.7, steel: 'AISI 316'};

const cylX = (r, len, seg = 40) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const tube = (pts, r, seg = 80) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), seg, r, 16, false);

export function buildPiping(M, add) {
  const mat = {
    flange: new THREE.MeshStandardMaterial({color: '#9aa1a8', roughness: 0.4, metalness: 0.85}),
    gasket: new THREE.MeshStandardMaterial({color: '#3b3f44', roughness: 0.8}),
    hose: new THREE.MeshPhysicalMaterial({color: '#202225', roughness: 0.55, metalness: 0, clearcoat: 0.25}),
    clamp: new THREE.MeshStandardMaterial({color: '#e3e6ea', roughness: 0.25, metalness: 1}),
    filter: new THREE.MeshStandardMaterial({color: '#c8ccd1', roughness: 0.28, metalness: 1}),
    dial: new THREE.MeshStandardMaterial({color: '#f5f6f7', roughness: 0.5}),
    needle: new THREE.MeshBasicMaterial({color: '#d6182b'}),
  };
  // the far parts fade on their own materials, so nothing at the pump goes see-through with them
  mat.hoseFar = mat.hose.clone();
  mat.steelFar = mat.flange.clone();
  const farMats = [mat.hoseFar, mat.steelFar];
  const near = new THREE.Group(); // at the pump: shown in every view
  const far = new THREE.Group(); // kept for the update's fade; the site draws the long runs
  const glassy = [];
  const hoseMesh = (parent, geo) => {
    const m = add(parent, geo, parent === far ? mat.hoseFar : mat.hose);
    glassy.push(m);
    return m;
  };

  // ------------------------------------------------------------ a counter flange with its hose tail on each port
  const gauges = [];
  for (const s of [1, -1]) {
    const x0 = s * 140;
    add(near, cylX(95, 2, 48).translate(x0 + s * 1, Y_PORT, 0), mat.gasket);
    add(near, cylX(FLANGE.D / 2, FLANGE.t, 48).translate(x0 + s * (2 + FLANGE.t / 2), Y_PORT, 0), mat.flange);
    for (let k = 0; k < FLANGE.holes; k++) {
      const a = ((k + 0.5) * Math.PI) / 4;
      add(near, cylX(11, 9, 6).translate(x0 + s * (2 + FLANGE.t + 4.5), Y_PORT + (FLANGE.pcd / 2) * Math.sin(a), (FLANGE.pcd / 2) * Math.cos(a)), M.dark);
    }
    // the welded tail with three barbs, the hose pushed over it, two clamps
    const t0 = x0 + s * (2 + FLANGE.t);
    add(near, cylX(FLANGE.tail / 2, FLANGE.tailLen).translate(t0 + (s * FLANGE.tailLen) / 2, Y_PORT, 0), mat.flange);
    for (const d of [40, 70, 100]) add(near, new THREE.TorusGeometry(FLANGE.tail / 2 + 1, 2.6, 8, 32).rotateY(Math.PI / 2).translate(t0 + s * d, Y_PORT, 0), mat.flange);
    for (const d of [62, 104]) add(near, new THREE.TorusGeometry(HOSE.od / 2 + 3, 5, 8, 36).rotateY(Math.PI / 2).translate(t0 + s * d, Y_PORT, 0), mat.clamp);
    // the gauge on a tapped boss on top of the tail: compound gauge on suction, pressure gauge on discharge
    const gx = t0 + s * 22;
    // the boss points forward (+z), level with the port: on top it would sit in the relief valve's cap
    add(near, new THREE.CylinderGeometry(9, 9, 70, 12).rotateX(Math.PI / 2).translate(gx, Y_PORT, FLANGE.tail / 2 + 35), mat.flange);
    const g = new THREE.Group();
    g.position.set(gx, Y_PORT, FLANGE.tail / 2 + 70 + 13);
    near.add(g);
    add(g, new THREE.CylinderGeometry(52, 52, 26, 40).rotateX(Math.PI / 2), mat.clamp);
    add(g, new THREE.CylinderGeometry(46, 46, 2, 40).rotateX(Math.PI / 2).translate(0, 0, 14), mat.dial);
    for (let k = 0; k <= 10; k++) {
      const a = (-135 + k * 27) * (Math.PI / 180);
      add(g, new THREE.BoxGeometry(2, 8, 1).translate(0, 38, 15.5).applyMatrix4(new THREE.Matrix4().makeRotationZ(-a)), M.dark);
    }
    const needle = add(g, new THREE.BoxGeometry(3, 36, 2).translate(0, 16, 17), mat.needle);
    gauges.push({needle, suction: s > 0});
  }

  // ------------------------------------------------------------ the suction line: a short hose to the filter, the filter, the hose tail out
  const fx = 480; // the filter's middle
  hoseMesh(near, cylX(HOSE.od / 2, 380 - 262, 32).translate((262 + 380) / 2, Y_PORT, 0));
  // the Y strainer: the run with its two hex ends, the screen leg down and toward the outlet, the cap
  const filter = new THREE.Group();
  near.add(filter);
  add(filter, cylX(52, FILTER.L - 50, 40).translate(fx, Y_PORT, 0), mat.filter);
  for (const s of [-1, 1]) add(filter, cylX(58, 26, 6).translate(fx + s * (FILTER.L / 2 - 13), Y_PORT, 0), mat.filter);
  const leg = new THREE.Group();
  leg.position.set(fx, Y_PORT, 0);
  leg.rotation.z = -Math.PI / 4;
  filter.add(leg);
  add(leg, new THREE.CylinderGeometry(42, 42, 150, 32).translate(0, -75, 0), mat.filter);
  add(leg, new THREE.CylinderGeometry(50, 50, 30, 6).translate(0, -165, 0), mat.filter);
  // the arrow cast on the body: flow toward the pump
  add(filter, new THREE.ConeGeometry(10, 26, 12).rotateZ(Math.PI / 2).translate(fx - 20, Y_PORT + 53, 0), M.dark);
  add(filter, new THREE.BoxGeometry(50, 5, 5).translate(fx + 18, Y_PORT + 53, 0), M.dark);
  // the threaded hose tail out of the filter's inlet
  add(near, cylX(FLANGE.tail / 2, 90).translate(fx + FILTER.L / 2 + 45, Y_PORT, 0), mat.flange);
  for (const d of [60, 80]) add(near, new THREE.TorusGeometry(HOSE.od / 2 + 3, 5, 8, 36).rotateY(Math.PI / 2).translate(fx + FILTER.L / 2 + d, Y_PORT, 0), mat.clamp);

  // the long runs to the storage tank and the tanker are the site's (site.js)

  /** p: the outlet pressure (MPa), pv: the suction's (MPa, below 0 is vacuum); mobile: 0..1 the far parts' fade;
   *  glass: the hoses turn to glass so the oil shows */
  const update = (p, pv, mobile, glass, glassMat) => {
    for (const g of gauges) {
      // compound gauge −100..+150 kPa over 270°, pressure gauge 0..600 kPa over 270°
      const k = g.suction ? (pv * 1000 + 100) / 250 : (p * 1000) / 600;
      g.needle.rotation.z = -(-135 + 270 * Math.min(1, Math.max(0, k))) * (Math.PI / 180);
    }
    for (const m of glassy) m.material = glass ? glassMat : m.parent === far ? mat.hoseFar : mat.hose;
    far.visible = mobile > 0.02;
    if (!far.visible) return;
    const fade = mobile < 0.985;
    for (const m of farMats) {
      if (m.userData.fading !== fade) {
        m.userData.fading = fade;
        m.transparent = fade;
        m.needsUpdate = true;
      }
      m.opacity = fade ? mobile : 1;
    }
  };
  return {near, far, update, at: {flangeIn: new THREE.Vector3(160, Y_PORT + 95, 0), filter: new THREE.Vector3(fx, Y_PORT + 60, 0), gaugeIn: new THREE.Vector3(182, Y_PORT + 50, 140), hose: new THREE.Vector3(900, 300, 80), gaugeOut: new THREE.Vector3(-182, Y_PORT + 50, 140)}};
}

/** What the suction line costs, for oil at the manual's test viscosity (0.75 × 10⁻⁴ m²/s, 10 °ВУ, ρ ≈ 880 kg/m³) and
 *  q m³/h through it: the hose's friction over len m, its entry and two bends, the filter, the velocity head; and how
 *  much lift that leaves of the pump's 5 m (Table 2). The filter's Kv is not in its passport: 131 m³/h is the clean
 *  0.25 mm screen of a DN80 Y strainer of the same pattern (Danfoss FVF), and ×1.5 a correction for the oil's
 *  viscosity — an estimate. dirty: ×3 the filter's loss, a screen half blocked. */
export function suctionBudget(q, {len = 6, lift = 1.5, dirty = false} = {}) {
  const g = 9.81;
  const rho = 880;
  const nu = 0.75e-4;
  const d = HOSE.id / 1000;
  const v = q / 3600 / ((Math.PI * d * d) / 4);
  const hv = (v * v) / (2 * g);
  const re = (v * d) / nu;
  const lam = re < 2300 ? 64 / Math.max(re, 1) : 0.3164 / re ** 0.25;
  const hHose = lam * (len / d) * hv;
  const hLocal = (0.5 + 2 * 0.3) * hv;
  const dpBar = 0.88 * (q / 131) ** 2 * 1.5 * (dirty ? 3 : 1);
  const hFilter = (dpBar * 1e5) / (rho * g);
  const allowed = 5 - hHose - hLocal - hFilter - hv;
  // the compound gauge at the pump's inlet: the lift plus every loss, as a vacuum
  const pv = -((lift + hHose + hLocal + hFilter + hv) * rho * g) / 1e6;
  return {v, re, hv, hHose, hLocal, hFilter, dpBar, allowed, pv, len, lift};
}
