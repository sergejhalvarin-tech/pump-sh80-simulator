// The rest of the electric pump unit around the Ш80-2,5: the АИР160S6 motor, a jaw coupling with its spider (the
// "звёздочка 100" of the manual's spare parts list), the coupling guard and the common base frame. Millimetres in the
// pump's frame: the motor shaft on the pump's drive axis (y 187), the motor behind the coupling on +z.
//
// АИР160S6, IM1081 (IEK DRIVE catalogue, pp. 14–15): 11 kW, 970 rpm, 380/660 V, 24.6/14.2 A, η 86.8 %, cos φ 0.79,
// 114 kg; l30 635 overall, h31 375 high, d30 330 across the fins, axis height h 160, shaft d1 48 × l1 110, feet
// b11 320 wide with holes b10 254 × l10 178, the first holes l31 108 behind the shaft shoulder, holes d10 15.
//
// Inside, built to the usual proportions of a 160-frame six-pole motor (the catalogue gives no internals): a stator
// stack of 170 with 54 slots and a three-phase winding in delta, its end turns at both ends; a squirrel-cage rotor with
// 44 cast bars and two end rings; ball bearings in both shields; the fan under its cowl; six studs and three delta
// links in the terminal box. The motor's section cuts everything that stands still along the plane x = 0 and takes
// the +x half away; the rotor turns whole inside. The stator iron and the rotor show the air-gap field: three pairs of
// poles, N warm and S cool, running round at the synchronous speed while the rotor lags by the slip.
import * as THREE from 'three';
import {EM, PHASE_COL, SLOT} from './elec.js';
import {Y_DRIVE} from './kin.js';

export const MOTOR = {name: 'АИР160S6', kw: 11, rpm: 970, volts: '380/660', amps: 24.6, eta: 0.868, cos: 0.79, mass: 114, h: 160, d1: 48, l1: 110, l30: 635, h31: 375, d30: 330, b10: 254, b11: 320, l10: 178, l31: 108};
// along z: the pump hub, the spider, the motor hub, the motor shaft's shoulder
export const Z = {hubP: [192, 240], spider: [240, 258], hubM: [258, 310], shoulder: 372};
const FEET_Y = Y_DRIVE - MOTOR.h; // 27: the motor's feet stand on a pad that high over the frame
export const FRAME_Y = -110; // the underside of the frame, the floor
// the motor's insides along z, and the radii of the magnetic circuit
const zs = Z.shoulder;
const zEnd = zs + MOTOR.l30 - MOTOR.l1; // 897, the fan cowl's back face
const zB0 = zs + 34; // the frame between the shields
const zB1 = zEnd - 98;
export const CORE = {z0: 518, z1: 688, rOut: 126, rBore: 90, rSlot: 112, rRotor: 89.4, rBar: 79.5, rShaft: 24};
CORE.zm = (CORE.z0 + CORE.z1) / 2;

const cylZ = (r, len, seg = 48) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
const at = (g, z0, z1) => g.translate(0, 0, (z0 + z1) / 2);
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const shapeOf = (pts) => {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], k) => (k ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  return sh;
};
const extrude = (sh, z0, z1, cs = 6) => new THREE.ExtrudeGeometry(sh, {depth: z1 - z0, bevelEnabled: false, curveSegments: cs}).translate(0, 0, z0);

/** a solid of revolution about the motor axis from a closed profile [[r, z], ...]: whole, or its x ≤ 0 half with flat
 *  caps on the cut (geometry pair {whole, half, cap}) */
function revolve(profile, seg = 72) {
  const pts = [...profile, profile[0]].map(([r, z]) => new THREE.Vector2(r, z));
  const whole = new THREE.LatheGeometry(pts, seg).rotateX(Math.PI / 2);
  const half = new THREE.LatheGeometry(pts, seg / 2, Math.PI, Math.PI).rotateX(Math.PI / 2);
  // the cut: the profile itself, laid in the plane x = 0 above and below the axis
  const tri = THREE.ShapeUtils.triangulateShape(profile.map(([r, z]) => new THREE.Vector2(r, z)), []);
  const pos = [];
  for (const s of [1, -1]) for (const t of tri) for (const i of t) pos.push(0, s * profile[i][0], profile[i][1]);
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cap.computeVertexNormals();
  return {whole, half, cap};
}

export function buildMotor(M, add) {
  const mat = {
    motor: new THREE.MeshPhysicalMaterial({color: '#4a525b', roughness: 0.5, metalness: 0.25, clearcoat: 0.3, clearcoatRoughness: 0.35, side: THREE.DoubleSide}),
    frame: new THREE.MeshPhysicalMaterial({color: '#3d4855', roughness: 0.55, metalness: 0.2, clearcoat: 0.2}),
    plate: new THREE.MeshStandardMaterial({color: '#dfe2e6', roughness: 0.6, metalness: 0.2}),
    grille: new THREE.MeshStandardMaterial({color: '#1d2024', roughness: 0.6, metalness: 0.3}),
    cut: new THREE.MeshStandardMaterial({color: '#cfd4da', roughness: 0.85, metalness: 0, side: THREE.DoubleSide}),
    copper: new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.35, metalness: 0.6}),
    alu: new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.4, metalness: 0.7}),
    brass: new THREE.MeshStandardMaterial({color: '#c9a548', roughness: 0.35, metalness: 0.9}),
    board: new THREE.MeshStandardMaterial({color: '#2a2c30', roughness: 0.7, metalness: 0}),
    fan: new THREE.MeshStandardMaterial({color: '#5b6168', roughness: 0.6, metalness: 0}),
    // the guard is sheet steel in the casing's blue; seen from inside as well, it needs both faces
    guard: M.body.clone(),
  };
  mat.guard.side = THREE.DoubleSide;
  // the field on the iron: N warm, S cool, |B| in strength, three pole pairs round the bore. uPhase sets where the
  // poles are (electrical radians); uRot is the part's own turn (the rotor's, so its colours stay with the field)
  const field = {uPhase: {value: 0}, uOn: {value: 0}};
  const fieldMat = (color, rot) => {
    const m = new THREE.MeshStandardMaterial({color, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide});
    const uRot = {value: 0};
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {uPhase: field.uPhase, uOn: field.uOn, uRot});
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vAxial;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAxial = position.xy;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vAxial;\nuniform float uPhase;\nuniform float uOn;\nuniform float uRot;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          { float th = atan(vAxial.y, vAxial.x) + uRot;
            float b = cos(${EM.p}.0 * th - uPhase);
            vec3 pole = b > 0.0 ? vec3(1.0, 0.36, 0.2) : vec3(0.2, 0.52, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, pole, uOn * 0.78 * pow(abs(b), 0.8)); }`,
        );
    };
    m.customProgramCacheKey = () => `field-${rot}`;
    m.userData.uRot = uRot;
    return m;
  };
  mat.stator = fieldMat('#8d939a', 's');
  mat.rotor = fieldMat('#9aa0a6', 'r');
  const root = new THREE.Group();

  // ------------------------------------------------------------ the base frame: two channels, cross members, a deck plate
  const frame = new THREE.Group();
  root.add(frame);
  for (const x of [-150, 150]) add(frame, at(new THREE.BoxGeometry(70, 96, 1160), -200, 960).translate(x, FRAME_Y + 48, 0), mat.frame);
  for (const z of [-170, 150, 430, 930]) add(frame, new THREE.BoxGeometry(230, 70, 60).translate(0, FRAME_Y + 35, z), mat.frame);
  add(frame, at(new THREE.BoxGeometry(380, 14, 1160), -200, 960).translate(0, -7, 0), mat.frame);
  // the motor pad, so its axis meets the pump's
  for (const z of [Z.shoulder + MOTOR.l31, Z.shoulder + MOTOR.l31 + MOTOR.l10]) add(frame, new THREE.BoxGeometry(MOTOR.b11 + 20, FEET_Y, 80).translate(0, FEET_Y / 2, z), mat.frame);

  // ------------------------------------------------------------ the motor's still parts: each whole, or its half with a cut face
  const motor = new THREE.Group();
  root.add(motor);
  const body = new THREE.Group();
  body.position.y = Y_DRIVE;
  motor.add(body);
  const shells = []; // {whole, half, cap}: meshes swapped by the section; the shells go to glass with the casing
  const shell = (profile, m = mat.motor) => {
    const g = revolve(profile);
    const s = {whole: add(body, g.whole, m), half: add(body, g.half, m), cap: add(body, g.cap, mat.cut, false)};
    s.whole.userData.glassable = s.half.userData.glassable = m === mat.motor;
    shells.push(s);
    return s;
  };
  // the frame between the shields, the drive-end shield with its bearing hub, the rear shield, the fan cowl
  shell([[CORE.rOut, zB0], [140, zB0], [140, zB1], [CORE.rOut, zB1]]);
  shell([[46, zs], [62, zs], [62, zs + 14], [134, zs + 26], [140, zB0], [CORE.rOut, zB0], [CORE.rOut, zB0 - 4], [60, zs + 26], [46, zs + 26]]);
  shell([[46, zB1], [144, zB1], [144, zB1 + 14], [62, zB1 + 14], [62, zB1 + 26], [46, zB1 + 26]]);
  shell([[MOTOR.d30 / 2 - 12, zB1 + 14], [MOTOR.d30 / 2 - 8, zB1 + 14], [MOTOR.d30 / 2 - 8, zEnd], [MOTOR.d30 / 2 - 12, zEnd]]);
  // cooling fins along the frame, clear of the feet below; in the section the +x ones go
  const fins = [];
  const finGeo = at(new THREE.BoxGeometry(5, MOTOR.d30 / 2 - 140, zB1 - zB0 - 20), zB0 + 10, zB1 - 10).translate(0, 140 + (MOTOR.d30 / 2 - 140) / 2 - 1, 0);
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), -Math.cos(a))) < 0.5) continue;
    const f = add(body, finGeo.clone(), mat.motor);
    f.rotation.z = a;
    f.userData.glassable = true;
    fins.push({f, x: -Math.sin(a)});
  }
  // the grille on the cowl: an end disc with rings and spokes, half of it in the section
  const grille = new THREE.Group();
  body.add(grille);
  const grilleHalf = [];
  for (const [r0, r1] of [[0, 40], [72, 78], [107, 113], [137, 143]]) {
    for (const half of [false, true]) {
      const g = new THREE.RingGeometry(r0, r1, 64, 1, half ? Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2).translate(0, 0, zEnd + 1);
      const m = add(grille, g, r0 === 0 ? mat.grille : mat.motor);
      if (half) grilleHalf.push(m);
      else m.userData.whole = true;
    }
  }
  for (let k = 0; k < 8; k++) {
    const s = add(grille, new THREE.BoxGeometry(5, MOTOR.d30 / 2 - 14, 4).translate(0, (MOTOR.d30 / 2 - 14) / 2, zEnd + 1), mat.motor);
    s.rotation.z = (k / 8) * Math.PI * 2;
    s.userData.x = -Math.sin(s.rotation.z);
  }

  // the stator stack: 54 slots round the bore; the half is the same outline cut along x = 0
  const slotHalf = (r) => 3.4 / r;
  const statorShape = (half) => {
    const da = (2 * Math.PI) / EM.slots;
    const bore = [];
    for (let k = 0; k < EM.slots; k++) {
      const c = (k + 0.5) * da;
      const tooth = [c - da / 2, c - slotHalf(CORE.rBore)];
      bore.push([CORE.rBore, tooth[0]], [CORE.rBore, tooth[1]], [CORE.rSlot, c - slotHalf(CORE.rSlot)], [CORE.rSlot, c + slotHalf(CORE.rSlot)], [CORE.rBore, c + slotHalf(CORE.rBore)]);
    }
    if (!half) {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, CORE.rOut, 0, Math.PI * 2, false);
      sh.holes.push(new THREE.Path(bore.map(([r, a]) => new THREE.Vector2(...polar(r, a))).reverse()));
      return sh;
    }
    // x ≤ 0: the outer arc from the top round the left to the bottom, then the bore back up, walked the other way
    const pts = [];
    for (let i = 0; i <= 48; i++) pts.push(polar(CORE.rOut, Math.PI / 2 + (i / 48) * Math.PI));
    const inner = bore.filter(([, a]) => a > Math.PI / 2 && a < (3 * Math.PI) / 2).sort((p, q) => q[1] - p[1]);
    pts.push([0, -CORE.rBore], ...inner.map(([r, a]) => polar(r, a)), [0, CORE.rBore]);
    return shapeOf(pts);
  };
  const stator = {whole: add(body, extrude(statorShape(false), CORE.z0, CORE.z1, 2), mat.stator), half: add(body, extrude(statorShape(true), CORE.z0, CORE.z1, 2), mat.stator)};
  // the winding in the slots: one instanced copper bar per slot, lit in its phase's colour by the current in it
  const da = (2 * Math.PI) / EM.slots;
  const slotGeo = extrude(shapeOf([polar(CORE.rBore + 1.5, -slotHalf(CORE.rBore + 1.5) * 0.85), polar(CORE.rSlot - 1, -slotHalf(CORE.rSlot) * 0.85), polar(CORE.rSlot - 1, slotHalf(CORE.rSlot) * 0.85), polar(CORE.rBore + 1.5, slotHalf(CORE.rBore + 1.5) * 0.85)]), CORE.z0 - 6, CORE.z1 + 6);
  const slots = new THREE.InstancedMesh(slotGeo, mat.copper, EM.slots);
  body.add(slots);
  const slotX = [];
  const tm = new THREE.Matrix4();
  for (let k = 0; k < EM.slots; k++) {
    const a = (k + 0.5) * da;
    slots.setMatrixAt(k, tm.makeRotationZ(a));
    slotX.push(Math.cos(a));
  }
  slots.setColorAt(0, new THREE.Color('#b87333'));
  // the end turns: every coil spans a pole pitch (9 slots) and bows out past the stack; one material per phase
  const phaseMat = PHASE_COL.map((c) => new THREE.MeshStandardMaterial({color: c, roughness: 0.4, metalness: 0.3, emissive: c, emissiveIntensity: 0}));
  const coils = [];
  for (const end of [-1, 1]) {
    const zEdge = end > 0 ? CORE.z1 + 4 : CORE.z0 - 4;
    for (let b = 0; b < EM.slots / 3; b++) {
      const [ph] = SLOT[b * 3];
      const a0 = (b * 3 + 1.5) * da;
      const a1 = a0 + 9 * da;
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const a = a0 + (a1 - a0) * u;
        const r = 101 + (b % 3) * 2.2 + 6 * Math.sin(Math.PI * u);
        pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), zEdge + end * (6 + 34 * Math.sin(Math.PI * u))));
      }
      const m = add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 5.2, 8, false), phaseMat[ph]);
      coils.push({m, x: Math.cos((a0 + a1) / 2)});
    }
  }
  // the shields' bearings: outer rings still, the balls with their cage at 0.4 of shaft speed
  const bearings = [];
  for (const z of [zs + 13, zB1 + 13]) {
    const outer = revolve([[44, z - 8], [50, z - 8], [50, z + 8], [44, z + 8]], 48);
    const b = {whole: add(body, outer.whole, M.steel), half: add(body, outer.half, M.steel), cap: add(body, outer.cap, mat.cut, false)};
    shells.push(b);
    bearings.push(z);
  }

  // the terminal box: walls round a board with six studs and the three delta links, the supply cable through a gland
  const tb = new THREE.Group();
  body.add(tb);
  const TB = {y0: 140, y1: MOTOR.h31 - MOTOR.h, z: zs + 250, w: 150, d: 160};
  const tbParts = [];
  const tbPart = (geo, m, cutAway = false) => {
    const o = add(tb, geo, m);
    o.userData.cutAway = cutAway;
    o.userData.glassable = m === mat.motor;
    tbParts.push(o);
    return o;
  };
  const wallH = TB.y1 - 8 - TB.y0;
  const wy = TB.y0 + wallH / 2;
  tbPart(new THREE.BoxGeometry(5, wallH, TB.d).translate(-TB.w / 2 + 2.5, wy, TB.z), mat.motor);
  tbPart(new THREE.BoxGeometry(5, wallH, TB.d).translate(TB.w / 2 - 2.5, wy, TB.z), mat.motor, true);
  for (const s of [-1, 1]) {
    // the walls across z come in two halves so the section can take the +x one
    tbPart(new THREE.BoxGeometry(TB.w / 2, wallH, 5).translate(-TB.w / 4, wy, TB.z + s * (TB.d / 2 - 2.5)), mat.motor);
    tbPart(new THREE.BoxGeometry(TB.w / 2, wallH, 5).translate(TB.w / 4, wy, TB.z + s * (TB.d / 2 - 2.5)), mat.motor, true);
  }
  tbPart(new THREE.BoxGeometry(TB.w / 2 + 5, 8, TB.d + 10).translate(-TB.w / 4 - 2.5, TB.y1 - 4, TB.z), mat.motor);
  tbPart(new THREE.BoxGeometry(TB.w / 2 + 5, 8, TB.d + 10).translate(TB.w / 4 + 2.5, TB.y1 - 4, TB.z), mat.motor, true);
  add(tb, new THREE.BoxGeometry(110, 6, 120).translate(0, 158, TB.z), mat.board);
  // studs: the top row W2 U2 V2, the bottom row U1 V1 W1; the links join each column, which makes the delta
  const STUD = {xs: [-34, 0, 34], zs: [TB.z - 28, TB.z + 28]};
  for (const x of STUD.xs) for (const z of STUD.zs) add(tb, new THREE.CylinderGeometry(5, 5, 22, 12).translate(x, 172, z), mat.brass);
  for (const x of STUD.xs) add(tb, new THREE.BoxGeometry(14, 3, 70).translate(x, 177, TB.z), mat.copper);
  // the three cores of the supply from the gland on the −x wall to U1 V1 W1, in their phase colours
  add(tb, cylZ(16, 30, 20).rotateY(Math.PI / 2).translate(-TB.w / 2 - 10, 178, TB.z), M.dark);
  STUD.xs.forEach((x, i) => {
    const pts = [new THREE.Vector3(-TB.w / 2 - 20, 178 + (i - 1) * 5, TB.z), new THREE.Vector3(-TB.w / 2 + 20, 182, TB.z + 4), new THREE.Vector3(x - 8, 186, STUD.zs[1] - 12), new THREE.Vector3(x, 183, STUD.zs[1])];
    add(tb, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 3.4, 8, false), phaseMat[i]);
  });
  // feet, a lifting eye, the nameplate
  for (const z of [zs + MOTOR.l31, zs + MOTOR.l31 + MOTOR.l10]) {
    for (const s of [-1, 1]) {
      const foot = add(motor, new THREE.BoxGeometry(60, 40, 70), mat.motor);
      foot.position.set(s * (MOTOR.b11 / 2 - 30), FEET_Y + 20, z);
      const web = add(motor, new THREE.BoxGeometry(40, 60, 60), mat.motor);
      web.position.set(s * (MOTOR.b11 / 2 - 50), FEET_Y + 60, z);
      add(motor, new THREE.CylinderGeometry(12, 12, 8, 6), M.dark).position.set(s * (MOTOR.b10 / 2), FEET_Y + 44, z);
    }
  }
  add(body, new THREE.TorusGeometry(18, 5, 8, 24).rotateY(Math.PI / 2).translate(0, 140 + 34, zs + 70), mat.motor);
  const plate = add(body, new THREE.BoxGeometry(2, 60, 100), mat.plate);
  plate.position.set(-140 - 26, 10, zs + 300);

  // ------------------------------------------------------------ the turning parts: motor shaft with the cage rotor and fan, the hubs, the spider
  const turnM = new THREE.Group(); // on the motor shaft
  turnM.position.y = Y_DRIVE;
  root.add(turnM);
  add(turnM, at(cylZ(MOTOR.d1 / 2, MOTOR.l1 + 20, 40), Z.hubM[0], zs + 20), M.steel);
  add(turnM, at(cylZ(CORE.rShaft, zEnd - 30 - zs, 40), zs, zEnd - 30), M.steel);
  add(turnM, at(cylZ(50, Z.hubM[1] - Z.hubM[0], 48), Z.hubM[0] + 8, Z.hubM[1]), M.steel);
  // the rotor stack with 44 open slots, the cast aluminium bars flush in them, the end rings with their vanes
  {
    const db = (2 * Math.PI) / EM.bars;
    const pts = [];
    for (let k = 0; k < EM.bars; k++) {
      const c = k * db;
      const w = 2.9 / CORE.rRotor;
      for (const a of [c - db / 2 + 0.001, c - w]) pts.push(polar(CORE.rRotor, a));
      pts.push(polar(CORE.rBar, c - 2.9 / CORE.rBar), polar(CORE.rBar, c + 2.9 / CORE.rBar), polar(CORE.rRotor, c + w));
    }
    const sh = shapeOf(pts);
    const hole = new THREE.Path();
    hole.absarc(0, 0, CORE.rShaft, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    add(turnM, extrude(sh, CORE.z0, CORE.z1, 2), mat.rotor);
  }
  const barGeo = extrude(shapeOf([polar(CORE.rBar + 0.4, -2.6 / CORE.rBar), polar(CORE.rRotor - 0.2, -2.6 / CORE.rRotor), polar(CORE.rRotor - 0.2, 2.6 / CORE.rRotor), polar(CORE.rBar + 0.4, 2.6 / CORE.rBar)]), CORE.z0 - 10, CORE.z1 + 10);
  const bars = new THREE.InstancedMesh(barGeo, mat.alu, EM.bars);
  turnM.add(bars);
  for (let k = 0; k < EM.bars; k++) bars.setMatrixAt(k, tm.makeRotationZ((k * 2 * Math.PI) / EM.bars));
  bars.setColorAt(0, new THREE.Color('#c9ccd0'));
  const ringMat = mat.alu.clone();
  ringMat.color.set('#c3c7cc');
  for (const [z0, z1] of [[CORE.z0 - 22, CORE.z0 - 2], [CORE.z1 + 2, CORE.z1 + 22]]) {
    add(turnM, revolve([[64, z0], [CORE.rRotor - 0.5, z0], [CORE.rRotor - 0.5, z1], [64, z1]], 64).whole, ringMat);
    const zf = z0 < CORE.z0 ? z0 - 10 : z1 + 10;
    for (let k = 0; k < 10; k++) {
      const v = add(turnM, new THREE.BoxGeometry(3, 18, 20).translate(0, 76, zf), ringMat);
      v.rotation.z = (k / 10) * Math.PI * 2;
    }
  }
  // the bearings' turning half: inner rings and balls on the shaft
  const cages = [];
  for (const z of bearings) {
    add(turnM, revolve([[CORE.rShaft, z - 8], [30, z - 8], [30, z + 8], [CORE.rShaft, z + 8]], 48).whole, M.steel);
    const cage = new THREE.Group();
    turnM.add(cage);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      add(cage, new THREE.SphereGeometry(6.6, 14, 10).translate(37 * Math.cos(a), 37 * Math.sin(a), z), M.steel);
    }
    cages.push(cage);
  }
  // the fan under the cowl
  add(turnM, at(cylZ(36, 30, 32), zEnd - 60, zEnd - 30), mat.fan);
  for (let k = 0; k < 9; k++) {
    // each blade pitched about its own radius before it goes out to the hub
    const b = add(turnM, at(new THREE.BoxGeometry(5, 110, 30).rotateY(0.35), zEnd - 62, zEnd - 32).translate(0, 85, 0), mat.fan);
    b.rotation.z = (k / 9) * Math.PI * 2;
  }
  const turnP = new THREE.Group(); // on the pump's drive shaft
  turnP.position.y = Y_DRIVE;
  root.add(turnP);
  add(turnP, at(cylZ(50, Z.hubP[1] - Z.hubP[0] - 8, 48), Z.hubP[0], Z.hubP[1] - 8), M.steel);
  // the jaws: three on each hub reaching into the spider's gaps, the motor's set turned 60°
  const jaw = new THREE.CylinderGeometry(48, 48, 1, 24, 1, false, -0.42, 0.84);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const jp = add(turnP, jaw.clone().scale(1, Z.spider[1] - Z.spider[0] + 8, 1).rotateX(Math.PI / 2).translate(0, 0, (Z.spider[0] + Z.spider[1]) / 2 - 4), M.steel);
    jp.rotation.z = a;
    const jm = add(turnM, jaw.clone().scale(1, Z.spider[1] - Z.spider[0] + 8, 1).rotateX(Math.PI / 2).translate(0, 0, (Z.spider[0] + Z.spider[1]) / 2 + 4), M.steel);
    jm.rotation.z = a + Math.PI / 3;
  }
  const spider = new THREE.Group();
  spider.position.y = Y_DRIVE;
  root.add(spider);
  {
    const sh = new THREE.Shape();
    const n = 6;
    // six arms between the jaws: the outline steps out to 47 over each arm and back to 30 between them
    for (let k = 0; k <= n * 8; k++) {
      const a = (k / (n * 8)) * Math.PI * 2;
      const r = Math.cos(n * a) > 0.2 ? 47 : 30;
      if (k === 0) sh.moveTo(r * Math.cos(a), r * Math.sin(a));
      else sh.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, 20, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    add(spider, new THREE.ExtrudeGeometry(sh, {depth: Z.spider[1] - Z.spider[0] - 2, bevelEnabled: false}).translate(0, 0, Z.spider[0] + 1), M.graphite);
  }

  // ------------------------------------------------------------ the coupling guard: a half shell over the coupling on two legs
  const guard = new THREE.Group();
  root.add(guard);
  const guardMeshes = [];
  const gz0 = 176;
  const gz1 = 352;
  guardMeshes.push(add(guard, at(new THREE.CylinderGeometry(92, 92, gz1 - gz0, 48, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI), gz0, gz1).translate(0, Y_DRIVE, 0), mat.guard));
  for (const s of [-1, 1]) guardMeshes.push(add(guard, at(new THREE.BoxGeometry(4, Y_DRIVE, gz1 - gz0), gz0, gz1).translate(s * 92, Y_DRIVE / 2, 0), mat.guard));

  // ------------------------------------------------------------ the motor's own update
  const col = new THREE.Color();
  const one = new THREE.Vector3();
  const copper = new THREE.Color('#b87333');
  const aluC = new THREE.Color('#c9ccd0');
  const hot = new THREE.Color('#ffb21e');
  const phaseC = PHASE_COL.map((c) => new THREE.Color(c));
  /** a: shaft angle (rad); el: {phase (rad, where the poles are), currents [iA, iB, iC] per unit, rotor (0..1 the
   *  bars' current), on (0..1 the field shown)}; section: the motor cut open. Materials (glass, the fade) are the
   *  pump's to set: it reads userData.glassable. */
  const update = (a, el, section) => {
    field.uPhase.value = el.phase;
    field.uOn.value = el.on;
    mat.rotor.userData.uRot.value = a;
    for (const s of shells) {
      s.whole.visible = !section;
      s.half.visible = section;
      s.cap.visible = section;
    }
    // the fins go with the section: cut ones would stand out of the half shell like loose plates
    for (const {f} of fins) f.visible = !section;
    for (const m of grille.children) {
      if (m.userData.whole) m.visible = !section;
      else if (m.userData.x !== undefined) m.visible = !(section && m.userData.x > 0.05);
    }
    for (const m of grilleHalf) m.visible = section;
    stator.whole.visible = !section;
    stator.half.visible = section;
    for (const o of tbParts) o.visible = !(section && o.userData.cutAway);
    // the slots: each lit in its phase's colour by the current through it; the +x half gone in the section
    for (let k = 0; k < EM.slots; k++) {
      const [ph] = SLOT[k];
      col.copy(copper).lerp(phaseC[ph], el.on * Math.min(1, 0.15 + 0.85 * Math.abs(el.currents[ph])));
      slots.setColorAt(k, col);
      slots.setMatrixAt(k, tm.makeRotationZ((k + 0.5) * da).scale(one.setScalar(section && slotX[k] > 0.05 ? 0 : 1)));
    }
    slots.instanceColor.needsUpdate = true;
    slots.instanceMatrix.needsUpdate = true;
    phaseMat.forEach((m, i) => (m.emissiveIntensity = el.on * 0.55 * Math.abs(el.currents[i])));
    for (const c of coils) c.m.visible = !(section && c.x > 0.05);
    // the bars: the current the slip induces, strongest under the poles, in the rotor's own frame
    for (let k = 0; k < EM.bars; k++) {
      const th = (k * 2 * Math.PI) / EM.bars + a;
      const i = Math.cos(EM.p * th - el.phase - Math.PI / 2);
      bars.setColorAt(k, col.copy(aluC).lerp(hot, el.on * el.rotor * Math.abs(i)));
    }
    bars.instanceColor.needsUpdate = true;
    for (const c of cages) c.rotation.z = a * 0.4 - a;
  };

  return {root, motor, frame, guard, guardMeshes, turnM, turnP, spider, mat, update};
}
