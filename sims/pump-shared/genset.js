// Inside the generator set's canopy: the diesel engine and the alternator it turns, the radiator with its fan, the fuel
// tank, the battery and the exhaust. Millimetres in the set's own frame: x across, z along the shaft (the radiator at
// −z, the alternator at +z), y up in the pump's frame. The section cuts every still part along x = 0 and takes the +x
// half away; the moving parts (crank, pistons, rods, valves, the alternator's rotor, the fans) turn whole inside.
//
// From the passport of the ТСС АД-20С-Т400-1РКМ5: engine TSS Diesel TDY 27 4L, 27 kW (29.7 max), four cylinders in
// line, liquid cooled; alternator TSS-SA-20: brushless synchronous, four poles, single bearing, self-excited (SHUNT)
// with an AVR to ±1 %, η 94 %, insulation H, IP21/23, 160 kg, 640 × 490 × 560. The engine's bore, stroke and valve
// timing are typical for a four-cylinder diesel of this size, not from the passport.
import * as THREE from 'three';
import {PHASE_COL} from './elec.js';

export const ENGINE = {name: 'TSS Diesel TDY 27 4L', kw: 27, kwMax: 29.7, cyl: 4, bore: 98, stroke: 110, rod: 175, rpm: 1500, order: [1, 3, 4, 2], cr: 17.5};
export const ALT = {name: 'TSS-SA-20', poles: 4, eta: 0.94, mass: 160, size: [640, 490, 560], slots: 36};
// the crank: 1 and 4 share a throw, 2 and 3 the opposite one; firing 1-3-4-2, one power stroke every 180°
const PIN = {1: 0, 2: 180, 3: 180, 4: 0};
export const FIRE = {1: 0, 3: 180, 4: 360, 2: 540};
const R = ENGINE.stroke / 2;
const mod = (a, m) => ((a % m) + m) % m;
export const STROKES = ['РАБОЧИЙ ХОД', 'ВЫПУСК', 'ВПУСК', 'СЖАТИЕ'];
/** cylinder c's phase in degrees after its firing TDC: 0–180 power, 180–360 exhaust, 360–540 intake, 540–720 compression */
export const cylPsi = (c, th) => mod(th - FIRE[c], 720);
export const strokeOf = (ps) => Math.floor(mod(ps, 720) / 180);
const pinS = (c, th) => {
  const a = ((th + PIN[c]) * Math.PI) / 180;
  return R * Math.cos(a) + Math.sqrt(ENGINE.rod ** 2 - (R * Math.sin(a)) ** 2);
};
const bump = (ps, a, b) => {
  const x = mod(ps - a, 720) / (b - a);
  return x >= 0 && x <= 1 ? Math.sin(Math.PI * x) ** 2 : 0;
};
const liftEx = (ps) => bump(ps, 140, 380);
const liftIn = (ps) => bump(ps, 340, 580);

const cyl = (r, len, axis = 'y', seg = 40, half = false, open = false) => {
  const g = new THREE.CylinderGeometry(r, r, len, half ? seg / 2 : seg, 1, open, half ? Math.PI : 0, half ? Math.PI : Math.PI * 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  return g;
};
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a box and its x ≤ 0 half
const boxPair = (w, h, d, x, y, z) => ({whole: box(w, h, d, x, y, z), half: x - w / 2 < 0 ? box(Math.min(w, -(x - w / 2)), h, d, (x - w / 2 + Math.min(0, x + w / 2)) / 2, y, z) : null});

/** builds the insides into group g (the set's frame); add(parent, geo, mat) is the pump's mesh helper */
export function buildGensetCore(g, add, M, {y0, W, L, H}) {
  const mat = {
    block: new THREE.MeshPhysicalMaterial({color: '#4f6f8f', roughness: 0.45, metalness: 0.35, clearcoat: 0.3, side: THREE.DoubleSide}),
    head: new THREE.MeshPhysicalMaterial({color: '#3f5c78', roughness: 0.45, metalness: 0.35, clearcoat: 0.3, side: THREE.DoubleSide}),
    liner: new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide}),
    alt: new THREE.MeshPhysicalMaterial({color: '#2d3136', roughness: 0.5, metalness: 0.3, clearcoat: 0.3, side: THREE.DoubleSide}),
    core: new THREE.MeshStandardMaterial({color: '#8d939a', roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide}),
    rad: new THREE.MeshStandardMaterial({color: '#2b2e33', roughness: 0.6, metalness: 0.4}),
    radFin: new THREE.MeshStandardMaterial({color: '#7f868e', roughness: 0.4, metalness: 0.7}),
    tank: new THREE.MeshStandardMaterial({color: '#3a3f45', roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide}),
    fuel: new THREE.MeshPhysicalMaterial({color: '#e0b840', roughness: 0.2, metalness: 0, transparent: true, opacity: 0.7, depthWrite: false}),
    exhaust: new THREE.MeshStandardMaterial({color: '#5d544c', roughness: 0.6, metalness: 0.6}),
    battery: new THREE.MeshStandardMaterial({color: '#202326', roughness: 0.6}),
    n: new THREE.MeshStandardMaterial({color: '#ff5c33', roughness: 0.45, metalness: 0.3}),
    s: new THREE.MeshStandardMaterial({color: '#3385ff', roughness: 0.45, metalness: 0.3}),
    copper: new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.35, metalness: 0.6}),
    diode: new THREE.MeshStandardMaterial({color: '#1d1f22', roughness: 0.5}),
    coil: new THREE.MeshStandardMaterial({color: '#b87333', roughness: 0.35, metalness: 0.6}),
    charge: new THREE.MeshBasicMaterial({color: '#4a90e2', transparent: true, opacity: 0.4, depthWrite: false}),
  };
  const still = []; // {whole, half}: swapped by the section
  const pair = (p, m, parent = g) => {
    const s = {whole: add(parent, p.whole, m), half: p.half ? add(parent, p.half, m) : null};
    still.push(s);
    return s;
  };

  // heights: the crank and the alternator share one axis
  const yC = 960;
  const zCyl = [-680, -560, -440, -320]; // cylinders 1..4 from the radiator end
  const deck = yC + R + ENGINE.rod + 50; // the block's top face

  // ------------------------------------------------------------ the fuel tank in the bottom of the canopy, a battery beside it
  pair(boxPair(760, 170, 1500, 0, y0 + 180, -40), mat.tank);
  pair(boxPair(740, 110, 1480, 0, y0 + 152, -40), mat.fuel);
  pair(boxPair(170, 190, 260, -260, y0 + 360, 820), mat.battery);
  for (const x of [-300, -220]) add(g, cyl(8, 16, 'y', 12).translate(x, y0 + 463, 760), x < -260 ? mat.n : M.dark);

  // ------------------------------------------------------------ the engine: block with four liners, head, rocker cover, sump, flywheel housing
  const blockZ = [-760, -240];
  const bh = deck - (yC - 40);
  pair(boxPair(300, bh, blockZ[1] - blockZ[0], 0, yC - 40 + bh / 2, (blockZ[0] + blockZ[1]) / 2), mat.block);
  pair(boxPair(340, 150, blockZ[1] - blockZ[0] + 20, 0, yC - 120, (blockZ[0] + blockZ[1]) / 2), mat.block);
  pair(boxPair(300, 110, blockZ[1] - blockZ[0], 0, deck + 55, (blockZ[0] + blockZ[1]) / 2), mat.head);
  pair(boxPair(230, 70, blockZ[1] - blockZ[0] - 40, 0, deck + 145, (blockZ[0] + blockZ[1]) / 2), mat.head);
  // the bores: glass liners so the charge shows, the cut through the block opens them
  const liners = zCyl.map((z) => pair({whole: cyl(ENGINE.bore / 2 + 2, bh - 40, 'y', 40, false, true).translate(0, deck - (bh - 40) / 2, z), half: cyl(ENGINE.bore / 2 + 2, bh - 40, 'y', 40, true, true).translate(0, deck - (bh - 40) / 2, z)}, mat.liner));
  for (const l of liners) for (const m of [l.whole, l.half]) if (m) m.renderOrder = 3;
  // flywheel housing (a short drum) and the engine mounts
  pair({whole: cyl(260, 90, 'z', 64).translate(0, yC, -195), half: cyl(260, 90, 'z', 64, true).translate(0, yC, -195)}, mat.block);
  for (const z of [-700, -300]) for (const x of [-190, 190]) add(g, box(60, yC - 160 - (y0 + 265), 60, x, (yC - 160 + y0 + 265) / 2, z), M.dark);
  // exhaust: a manifold along the −x side, up to the muffler under the roof and out of the canopy's pipe
  add(g, box(60, 60, 470, -190, deck + 40, -500), mat.exhaust);
  const exPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-190, deck + 40, -730), new THREE.Vector3(-230, deck + 160, -760), new THREE.Vector3(-260, y0 + H - 190, -690), new THREE.Vector3(-260, y0 + H - 150, -630)]);
  add(g, new THREE.TubeGeometry(exPath, 30, 30, 12), mat.exhaust);
  add(g, cyl(95, 520, 'z', 32).translate(-260, y0 + H - 150, -380), mat.exhaust);
  // the air filter on the +x side (gone in the section)
  const airFilter = add(g, cyl(70, 230, 'z', 28).translate(200, deck + 90, -380), M.dark);

  // ------------------------------------------------------------ the moving engine parts
  const crank = new THREE.Group();
  crank.position.y = yC;
  g.add(crank);
  add(crank, cyl(32, blockZ[1] - blockZ[0] + 120, 'z', 28).translate(0, 0, (blockZ[0] + blockZ[1]) / 2 + 40), M.steel);
  for (const [k, z] of zCyl.entries()) {
    const c = k + 1;
    const a = (PIN[c] * Math.PI) / 180;
    // two webs per throw: the counterweight below the axis, the pin boss above it, turned to the throw's phase
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = ((200 + (140 * i) / 12) * Math.PI) / 180;
      pts.push(new THREE.Vector2(62 * Math.cos(t), 62 * Math.sin(t)));
    }
    for (let i = 0; i <= 10; i++) {
      const t = (i / 10) * Math.PI;
      pts.push(new THREE.Vector2(30 * Math.cos(t), R + 30 * Math.sin(t)));
    }
    for (const dz of [-34, 34]) add(crank, new THREE.ExtrudeGeometry(new THREE.Shape(pts), {depth: 18, bevelEnabled: false}).translate(0, 0, z + dz - 9).rotateZ(-a), M.steel);
    add(crank, cyl(26, 50, 'z', 20).translate(R * Math.sin(a), R * Math.cos(a), z), M.steel);
  }
  // the flywheel and the fan pulley turn with the crank
  add(crank, cyl(240, 50, 'z', 64).translate(0, 0, -195), M.steel);
  add(crank, cyl(70, 40, 'z', 32).translate(0, 0, -800), M.steel);
  const pistons = zCyl.map((z) => {
    const p = new THREE.Group();
    p.position.z = z;
    g.add(p);
    add(p, cyl(ENGINE.bore / 2 - 1, 80, 'y', 36).translate(0, 40, 0), new THREE.MeshStandardMaterial({color: '#d9dbdf', roughness: 0.3, metalness: 0.85}));
    for (let k = 0; k < 3; k++) add(p, new THREE.TorusGeometry(ENGINE.bore / 2 - 0.8, 1.4, 6, 36).rotateX(Math.PI / 2).translate(0, 66 - k * 8, 0), M.dark);
    const rod = new THREE.Group();
    g.add(rod);
    const beam = add(rod, box(16, 1, 12, 0, 0, 0), M.steel);
    const charge = new THREE.Mesh(cyl(ENGINE.bore / 2 - 2, 1, 'y', 32), mat.charge.clone());
    charge.renderOrder = 2;
    g.add(charge);
    charge.position.z = z;
    const valves = [-1, 1].map((s) => {
      const v = new THREE.Group();
      v.position.set(s * 22, deck, z);
      g.add(v);
      add(v, cyl(3, 110, 'y', 8).translate(0, 55, 0), M.steel);
      add(v, new THREE.CylinderGeometry(16, 6, 5, 20).translate(0, 2, 0), M.steel);
      return {v, kind: s < 0 ? 'ex' : 'in'};
    });
    return {p, rod, beam, charge, valves, z};
  });

  // ------------------------------------------------------------ the radiator at the front, its fan on the crank pulley's belt
  const radZ = -1000;
  add(g, box(720, 640, 70, 0, yC + 60, radZ), mat.rad);
  for (let k = 0; k < 34; k++) add(g, box(680, 2, 64, 0, yC - 240 + k * 18, radZ), mat.radFin);
  const fan = new THREE.Group();
  fan.position.set(0, yC, -900);
  g.add(fan);
  add(fan, cyl(60, 40, 'z', 24), M.dark);
  for (let k = 0; k < 6; k++) {
    const b = add(fan, box(80, 250, 6, 0, 150, 0).rotateY(0.4), M.dark);
    b.rotation.z = (k / 6) * Math.PI * 2;
  }

  // ------------------------------------------------------------ the alternator: housing, stator with 36 slots, four-pole rotor, exciter, diodes, AVR
  const aZ = [-150, 490];
  const rH = ALT.size[1] / 2;
  pair({whole: cyl(rH, aZ[1] - aZ[0], 'z', 72, false, true).translate(0, yC, (aZ[0] + aZ[1]) / 2), half: cyl(rH, aZ[1] - aZ[0], 'z', 72, true, true).translate(0, yC, (aZ[0] + aZ[1]) / 2)}, mat.alt);
  pair({whole: cyl(rH - 12, 30, 'z', 72).translate(0, yC, aZ[1] + 15), half: cyl(rH - 12, 30, 'z', 72, true).translate(0, yC, aZ[1] + 15)}, mat.alt);
  const sZ = [-40, 360];
  pair({whole: cyl(205, sZ[1] - sZ[0], 'z', 72, false, true).translate(0, yC, (sZ[0] + sZ[1]) / 2), half: cyl(205, sZ[1] - sZ[0], 'z', 72, true, true).translate(0, yC, (sZ[0] + sZ[1]) / 2)}, mat.core);
  pair({whole: cyl(152, sZ[1] - sZ[0], 'z', 72, false, true).translate(0, yC, (sZ[0] + sZ[1]) / 2), half: cyl(152, sZ[1] - sZ[0], 'z', 72, true, true).translate(0, yC, (sZ[0] + sZ[1]) / 2)}, mat.core);
  const slotGeo = box(10, 34, sZ[1] - sZ[0] + 50, 0, 172, (sZ[0] + sZ[1]) / 2);
  const slots = new THREE.InstancedMesh(slotGeo, mat.copper, ALT.slots);
  slots.position.y = yC;
  g.add(slots);
  const SLOTS = Array.from({length: ALT.slots}, (_, k) => [[0, 1], [2, -1], [1, 1], [0, -1], [2, 1], [1, -1]][Math.floor(k / 3) % 6]);
  slots.setColorAt(0, new THREE.Color('#b87333'));
  // AVR box on top, the output terminal box on the +x side
  add(g, box(160, 90, 220, 0, yC + rH + 45, 160), M.dark);
  add(g, box(10, 40, 80, 0, yC + rH + 95, 160), mat.n);
  const rotor = new THREE.Group();
  rotor.position.y = yC;
  g.add(rotor);
  add(rotor, cyl(40, aZ[1] - aZ[0] + 60, 'z', 28).translate(0, 0, (aZ[0] + aZ[1]) / 2), M.steel);
  for (let k = 0; k < ALT.poles; k++) {
    const pole = new THREE.Group();
    pole.rotation.z = (k / ALT.poles) * Math.PI * 2;
    rotor.add(pole);
    const m = k % 2 ? mat.s : mat.n;
    add(pole, box(90, 70, sZ[1] - sZ[0] - 10, 0, 80, (sZ[0] + sZ[1]) / 2), M.steel);
    // the pole shoe, curved to the bore
    const shoe = new THREE.CylinderGeometry(148, 148, sZ[1] - sZ[0] - 10, 24, 1, false, -0.5, 1.0).rotateX(Math.PI / 2).translate(0, 0, (sZ[0] + sZ[1]) / 2);
    // the sector opens toward −y as built; turned half a turn it sits over the pole
    add(pole, shoe.rotateZ(Math.PI), m);
    add(pole, box(124, 40, sZ[1] - sZ[0] + 16, 0, 80, (sZ[0] + sZ[1]) / 2), mat.coil);
  }
  // the exciter and its rotating diodes at the non-drive end, the cooling fan at the drive end
  add(rotor, cyl(80, 60, 'z', 32).translate(0, 0, 430), mat.core);
  for (let k = 0; k < 6; k++) {
    const d = add(rotor, box(18, 12, 10, 0, 62, 466), mat.diode);
    d.rotation.z = (k / 6) * Math.PI * 2;
  }
  for (let k = 0; k < 10; k++) {
    const b = add(rotor, box(5, 120, 50, 0, 110, -100), M.steel);
    b.rotation.z = (k / 10) * Math.PI * 2;
  }

  // ------------------------------------------------------------ the update
  const col = new THREE.Color();
  const copper = new THREE.Color('#b87333');
  const phaseC = PHASE_COL.map((c) => new THREE.Color(c));
  const tm = new THREE.Matrix4();
  const one = new THREE.Vector3();
  const CHARGE = [new THREE.Color('#ff6a1f'), new THREE.Color('#8b8f95'), new THREE.Color('#3f8de0'), new THREE.Color('#9aa0a7')];
  /** th: crank angle (degrees); section: the cut open; load: 0..1 the set's load (the slots' glow) */
  const update = (th, section, load = 0.3) => {
    for (const s of still) {
      s.whole.visible = !section || !s.half;
      if (s.half) s.half.visible = section;
      if (section && !s.half) s.whole.visible = false;
    }
    airFilter.visible = !section;
    const a = (th * Math.PI) / 180;
    crank.rotation.z = -a;
    fan.rotation.z = -a * 1.2;
    rotor.rotation.z = -a;
    pistons.forEach((pp, k) => {
      const c = k + 1;
      const s = pinS(c, th);
      pp.p.position.y = yC + s;
      const pa = ((th + PIN[c]) * Math.PI) / 180;
      // the crank turns −a about z: the pin is at angle (th + phase) clockwise from +y seen from +z
      const pin = new THREE.Vector3(R * Math.sin(pa), yC + R * Math.cos(pa), pp.z);
      const top = new THREE.Vector3(0, yC + s, pp.z);
      pp.rod.position.copy(pin).add(top).multiplyScalar(0.5);
      pp.rod.rotation.z = Math.atan2(top.y - pin.y, top.x - pin.x) - Math.PI / 2;
      pp.beam.scale.y = pin.distanceTo(top);
      const ps = cylPsi(c, th);
      const st = strokeOf(ps);
      const crown = yC + s + 80;
      pp.charge.position.y = (crown + deck) / 2;
      pp.charge.scale.y = Math.max(1, deck - crown);
      const burn = st === 0 && ps < 70;
      pp.charge.material.color.copy(burn ? CHARGE[0] : CHARGE[st === 0 ? 1 : st === 1 ? 1 : st === 2 ? 2 : 3]);
      pp.charge.material.opacity = burn ? 0.75 - 0.5 * (ps / 70) : st === 2 ? 0.35 : 0.22;
      for (const v of pp.valves) v.v.position.y = deck - 9 * (v.kind === 'in' ? liftIn(ps) : liftEx(ps));
    });
    // the stator: three phases at 50 Hz, two pole pairs: two electrical turns per shaft turn
    const e = 2 * a;
    for (let k = 0; k < ALT.slots; k++) {
      const [ph] = SLOTS[k];
      const i = Math.cos(e - (ph * 2 * Math.PI) / 3);
      col.copy(copper).lerp(phaseC[ph], Math.min(1, 0.2 + load * 1.4) * Math.abs(i));
      slots.setColorAt(k, col);
      const ang = ((k + 0.5) / ALT.slots) * Math.PI * 2;
      slots.setMatrixAt(k, tm.makeRotationZ(ang).scale(one.setScalar(section && -Math.sin(ang) > 0.05 ? 0 : 1)));
    }
    slots.instanceMatrix.needsUpdate = true;
    slots.instanceColor.needsUpdate = true;
  };
  return {update, mat};
}
