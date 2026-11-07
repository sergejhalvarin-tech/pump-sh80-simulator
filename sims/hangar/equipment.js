// The equipment in the hangar, in the zones building.js marks (metres, the same axes): the base oil tanks in their
// bund with the receiving pump and the additive drums, the two blending reactors under their hoods with the dosing and
// transfer skids, the filling line and the drum/IBC station under theirs, the pallet racks, the wrapper, the forklift,
// the compressor in the technical room, the laboratory's benches. All in the 'equip' layer.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EQ} from './equip_calc.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, n = 28) => new THREE.CylinderGeometry(r, r, h, n);

export function buildEquipment(layer) {
  const M = {
    tank: new THREE.MeshStandardMaterial({color: '#d4d8dc', roughness: 0.35, metalness: 0.7}),
    reactor: new THREE.MeshStandardMaterial({color: '#e5e8eb', roughness: 0.2, metalness: 0.9}),
    jacket: new THREE.MeshStandardMaterial({color: '#9aa3ab', roughness: 0.35, metalness: 0.8}),
    motor: new THREE.MeshStandardMaterial({color: '#2a5fae', roughness: 0.45, metalness: 0.4}),
    frame: new THREE.MeshStandardMaterial({color: '#3b4148', roughness: 0.6, metalness: 0.4}),
    rackUp: new THREE.MeshStandardMaterial({color: '#e2711d', roughness: 0.5, metalness: 0.3}),
    rackBeam: new THREE.MeshStandardMaterial({color: '#2b55a3', roughness: 0.5, metalness: 0.3}),
    pallet: new THREE.MeshStandardMaterial({color: '#b7925f', roughness: 0.9}),
    canBlue: new THREE.MeshStandardMaterial({color: '#2f6fd0', roughness: 0.5}),
    canGreen: new THREE.MeshStandardMaterial({color: '#2e9b57', roughness: 0.5}),
    drum: new THREE.MeshStandardMaterial({color: '#2e4c8f', roughness: 0.45, metalness: 0.5}),
    drumRed: new THREE.MeshStandardMaterial({color: '#b8322a', roughness: 0.45, metalness: 0.5}),
    ibc: new THREE.MeshStandardMaterial({color: '#f1f2ee', roughness: 0.3, transparent: true, opacity: 0.85}),
    cage: new THREE.MeshStandardMaterial({color: '#a9b0b6', roughness: 0.4, metalness: 0.8, wireframe: true}),
    yellow: new THREE.MeshStandardMaterial({color: '#f2c518', roughness: 0.5}),
    pump: new THREE.MeshStandardMaterial({color: '#1f57a8', roughness: 0.4, metalness: 0.4}),
    steel: new THREE.MeshStandardMaterial({color: '#b6bdc4', roughness: 0.35, metalness: 0.85}),
    white: new THREE.MeshStandardMaterial({color: '#f4f5f6', roughness: 0.5}),
    dark: new THREE.MeshStandardMaterial({color: '#25282c', roughness: 0.6}),
    roller: new THREE.MeshStandardMaterial({color: '#8e969e', roughness: 0.3, metalness: 0.9}),
    film: new THREE.MeshStandardMaterial({color: '#dfe9ee', roughness: 0.15, transparent: true, opacity: 0.55}),
    concrete: new THREE.MeshStandardMaterial({color: '#b2aea6', roughness: 0.95}),
  };
  const parts = {};
  const put = (mat, geo) => (parts[mat] ??= []).push(geo.index ? geo.toNonIndexed() : geo);
  const bar = (a, b, w, mat) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = box(w, w, d.length());
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, Math.abs(d.y) > 0.99 * d.length() ? V(1, 0, 0) : V(0, 1, 0));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    put(mat, g.applyMatrix4(m));
  };

  // ------------------------------------------------------------ the bund's kerb, raised to the computed height
  const kh = Math.ceil(EQ.bundH * 20) / 20;
  for (const [x0, x1, z0, z1] of [[0.8, 10, -8.5, -8.35], [0.8, 10, -3.35, -3.2], [0.8, 0.95, -8.5, -3.2], [9.85, 10, -8.5, -3.2]]) put('concrete', box(x1 - x0, kh, z1 - z0).translate((x0 + x1) / 2, kh / 2, (z0 + z1) / 2));

  // ------------------------------------------------------------ the four base oil tanks: shell, cone roof, manway,
  // level gauge, a ladder, the nozzles at the bottom to a common manifold
  for (const [x, z] of [[2.3, -7.1], [5.0, -7.1], [2.3, -4.6], [5.0, -4.6]]) {
    put('tank', cyl(1.1, 3.2, 40).translate(x, 0.1 + 1.6, z));
    put('tank', new THREE.ConeGeometry(1.12, 0.35, 40).translate(x, 3.3 + 0.175, z));
    put('dark', cyl(0.25, 0.12).translate(x + 0.4, 3.55, z));
    put('steel', box(0.06, 2.8, 0.06).translate(x + 1.13, 1.7, z + 0.3));
    for (const dz of [-0.2, 0.2]) put('yellow', box(0.04, 3.0, 0.04).translate(x - 1.25, 1.6, z + dz));
    for (let y = 0.4; y < 3.2; y += 0.3) put('yellow', box(0.03, 0.03, 0.44).translate(x - 1.25, y, z));
    bar(V(x + 0.8, 0.35, z - 0.6), V(x + 1.6, 0.35, z - 0.6), 0.09, 'steel');
  }
  bar(V(6.6, 0.35, -7.7), V(6.6, 0.35, -4.0), 0.1, 'steel');
  // the receiving pump: a skid with the motor, the pump and the strainer, the hose stub toward gate A
  put('frame', box(1.6, 0.15, 0.6).translate(8.3, 0.08, -7.4));
  put('pump', cyl(0.18, 0.6).rotateZ(Math.PI / 2).translate(8.0, 0.4, -7.4));
  put('pump', box(0.4, 0.4, 0.4).translate(8.6, 0.38, -7.4));
  put('steel', cyl(0.12, 0.35).translate(8.95, 0.45, -7.4));
  bar(V(8.6, 0.6, -7.4), V(6.6, 0.6, -7.4), 0.09, 'steel');
  // the additive drums on two spill pallets
  for (const [x, z] of [[7.6, -4.6], [8.9, -4.6]]) {
    put('yellow', box(1.2, 0.3, 1.2).translate(x, 0.15, z));
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) put(x > 8 ? 'drumRed' : 'drum', cyl(0.29, 0.88, 22).translate(x + dx, 0.3 + 0.44, z + dz));
  }

  // ------------------------------------------------------------ the two blending reactors under their hoods
  for (const [x, z] of [[13, -6.2], [18, -6.2]]) {
    put('reactor', cyl(0.95, 1.9, 40).translate(x, 1.35 + 0.95, z));
    put('reactor', new THREE.ConeGeometry(0.95, 0.55, 40).rotateX(Math.PI).translate(x, 1.35 - 0.275, z));
    put('reactor', new THREE.SphereGeometry(0.95, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(x, 3.25, z));
    put('jacket', cyl(1.0, 1.4, 40).translate(x, 1.5 + 0.7, z));
    for (const [dx, dz] of [[0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]]) put('frame', box(0.1, 1.6, 0.1).translate(x + dx, 0.8, z + dz));
    // the agitator's motor and gearbox on top, the bottom valve
    put('motor', cyl(0.2, 0.5).translate(x, 3.8, z));
    put('jacket', box(0.4, 0.3, 0.4).translate(x, 3.45, z));
    put('steel', cyl(0.07, 0.4).translate(x, 0.6, z));
  }
  // the service platform between and round them, its rail and stair
  put('frame', box(7.2, 0.08, 1.2).translate(15.5, 2.6, -4.6));
  bar(V(11.9, 3.6, -4.0), V(19.1, 3.6, -4.0), 0.04, 'yellow');
  for (let x = 12; x <= 19; x += 1.75) bar(V(x, 2.6, -4.0), V(x, 3.6, -4.0), 0.04, 'yellow');
  for (let i = 0; i < 8; i++) put('steel', box(0.25, 0.04, 0.8).translate(20.0 + i * 0.22, 2.6 - (i + 1) * 0.32, -4.6));
  // the dosing tank on its scale, the transfer pump with the bag filter
  put('frame', box(0.9, 0.12, 0.9).translate(15.5, 0.06, -7.6));
  put('reactor', cyl(0.38, 0.9).translate(15.5, 0.12 + 0.45, -7.6));
  put('frame', box(1.2, 0.12, 0.5).translate(15.5, 0.06, -3.7));
  put('pump', cyl(0.13, 0.45).rotateZ(Math.PI / 2).translate(15.2, 0.3, -3.7));
  put('steel', cyl(0.16, 0.7).translate(16.0, 0.5, -3.7));
  bar(V(13, 0.45, -5.3), V(13, 0.45, -3.7), 0.08, 'steel');
  bar(V(13, 0.45, -3.7), V(18, 0.45, -3.7), 0.08, 'steel');
  bar(V(18, 0.45, -5.3), V(18, 0.45, -3.7), 0.08, 'steel');
  // the product line under the aisle's edge to the filling zone's day tank
  bar(V(16.0, 0.85, -3.7), V(16.0, 0.85, -3.05), 0.08, 'steel');
  bar(V(16.0, 3.2, -3.05), V(12.0, 3.2, 3.6), 0.08, 'steel');
  bar(V(16.0, 0.85, -3.05), V(16.0, 3.2, -3.05), 0.08, 'steel');

  // ------------------------------------------------------------ the filling line: day tank, roller conveyor, the
  // 4-head filler, the capper, the labeller; the drum/IBC station on its scale
  put('reactor', cyl(0.65, 1.5).translate(12.0, 0.3 + 0.75, 3.6));
  for (const [dx, dz] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) put('frame', box(0.08, 0.3, 0.08).translate(12 + dx, 0.15, 3.6 + dz));
  for (const z of [1.35, 1.85]) put('frame', box(7.6, 0.08, 0.06).translate(15.3, 0.8, z));
  for (let x = 11.6; x <= 19.0; x += 0.12) put('roller', cyl(0.025, 0.5, 8).rotateX(Math.PI / 2).translate(x, 0.84, 1.6));
  for (let x = 11.8; x <= 18.8; x += 1.4) for (const z of [1.35, 1.85]) put('frame', box(0.06, 0.8, 0.06).translate(x, 0.4, z));
  // the machines straddling it
  put('white', box(1.2, 1.6, 1.0).translate(13.5, 1.1 + 0.8, 1.6).translate(0, 0.0, 0));
  for (let i = 0; i < 4; i++) put('steel', cyl(0.025, 0.4, 8).translate(13.05 + i * 0.3, 1.1, 1.6));
  put('white', box(0.9, 1.4, 0.9).translate(15.5, 1.1 + 0.7, 1.6));
  put('white', box(0.8, 1.2, 0.8).translate(17.0, 1.1 + 0.6, 1.6));
  // cans on the conveyor
  for (let x = 11.8; x <= 18.6; x += 0.45) put(x > 15 ? 'canGreen' : 'canBlue', box(0.19, 0.3, 0.28).translate(x, 1.02, 1.6));
  // the drum/IBC station: a scale, a frame with the filling lance, a drum and an IBC
  put('frame', box(1.4, 0.1, 1.4).translate(18.6, 0.05, 3.3));
  put('frame', box(0.08, 2.4, 0.08).translate(17.8, 1.2, 3.3));
  put('frame', box(0.9, 0.08, 0.08).translate(18.25, 2.4, 3.3));
  put('steel', cyl(0.03, 1.0, 8).translate(18.6, 1.9, 3.3));
  put('drum', cyl(0.29, 0.88, 22).translate(18.6, 0.1 + 0.44, 3.3));
  put('pallet', box(1.2, 0.15, 1.0).translate(20.2, 0.075, 3.4));
  put('ibc', box(1.1, 1.0, 0.95).translate(20.2, 0.65, 3.4));
  put('cage', box(1.14, 1.04, 0.99).translate(20.2, 0.65, 3.4));

  // ------------------------------------------------------------ the pallet racks: 3 runs of 3 bays (2.7 m) × 4 levels,
  // half of the places loaded with cans, drums or IBCs
  const loadPallet = (x, y, z, k) => {
    put('pallet', box(1.2, 0.15, 0.8).translate(x, y + 0.075, z));
    if (k % 3 === 0) for (const dx of [-0.3, 0.3]) for (const dz of [-0.2, 0.2]) put('drum', cyl(0.28, 0.88, 18).translate(x + dx, y + 0.15 + 0.44, z + dz));
    else put(k % 3 === 1 ? 'canBlue' : 'canGreen', box(1.15, 0.9, 0.78).translate(x, y + 0.15 + 0.45, z));
  };
  const rackRun = (zFront, depth) => {
    for (let b = 0; b <= 3; b++) {
      const x = 1.2 + b * 2.7;
      for (const z of [zFront, zFront + depth]) put('rackUp', box(0.08, 5.0, 0.08).translate(x, 2.5, z));
    }
    for (const y of [0.15, 1.6, 3.05, 4.5]) for (const z of [zFront, zFront + depth]) put('rackBeam', box(8.1, 0.12, 0.06).translate(1.2 + 4.05, y, z));
    let k = 0;
    for (let b = 0; b < 3; b++) for (const y of [0.2, 1.66, 3.11, 4.56]) for (let p = 0; p < 3; p++) {
      if ((b + p + Math.round(y)) % 2 && y > 0.3) continue;
      loadPallet(1.2 + b * 2.7 + 0.45 + p * 0.9, y, zFront + depth / 2, k++);
    }
  };
  rackRun(0.6, 1.1);
  rackRun(4.6, 1.1);
  rackRun(5.75, 1.1);

  // ------------------------------------------------------------ shipping: the wrapper, the scale, pallets staged
  put('dark', cyl(0.85, 0.12, 36).translate(19.4, 0.06, 6.9));
  put('frame', box(0.25, 2.6, 0.25).translate(19.4, 1.3, 7.95));
  put('pallet', box(1.2, 0.15, 0.8).translate(19.4, 0.2, 6.9));
  put('canBlue', box(1.15, 1.2, 0.78).translate(19.4, 0.88, 6.9));
  put('film', box(1.2, 1.25, 0.83).translate(19.4, 0.88, 6.9));
  put('frame', box(1.3, 0.08, 1.3).translate(16.6, 0.04, 6.9));
  for (const [x, z] of [[12.4, 6.1], [13.8, 6.1], [12.4, 7.5], [13.8, 7.5]]) loadPallet(x, 0, z, Math.round(x + z));

  // ------------------------------------------------------------ the forklift parked in the aisle, its charger, a pallet truck
  const fl = new THREE.Group();
  const flp = [];
  flp.push(['yellow', box(1.1, 0.9, 1.0).translate(0, 0.65, 0)]);
  flp.push(['dark', box(1.0, 0.08, 1.0).translate(0, 2.1, 0)]);
  for (const dz of [-0.45, 0.45]) flp.push(['dark', box(0.06, 1.9, 0.06).translate(-0.45, 1.15, dz)], ['dark', box(0.06, 1.9, 0.06).translate(0.45, 1.15, dz)]);
  flp.push(['frame', box(0.12, 2.3, 0.9).translate(-0.65, 1.2, 0)]);
  for (const dz of [-0.3, 0.3]) flp.push(['frame', box(1.1, 0.05, 0.12).translate(-1.2, 0.12, dz)]);
  for (const [dx, dz] of [[-0.35, -0.5], [-0.35, 0.5], [0.4, -0.5], [0.4, 0.5]]) flp.push(['dark', cyl(0.2, 0.15, 16).rotateX(Math.PI / 2).translate(dx, 0.2, dz)]);
  for (const [m, g] of flp) put(m, g.rotateY(Math.PI / 2).translate(8.2, 0, -1.5));
  put('white', box(0.5, 0.9, 0.35).translate(9.8, 0.45, -2.75));
  put('frame', box(0.55, 0.12, 1.5).translate(6.2, 0.1, -0.6));

  // ------------------------------------------------------------ the technical room: compressor and receiver; the lab's
  // benches and fume cupboard; lockers in the amenity room
  put('motor', box(0.8, 1.0, 0.7).translate(24.6, 0.5, -8.4));
  put('steel', cyl(0.38, 1.6).translate(23.3, 0.8, -8.4));
  for (const z of [1.4, 4.1]) put('white', box(4.5, 0.9, 0.7).translate(25.2, 0.45, z));
  put('steel', box(1.2, 2.2, 0.8).translate(27.3, 1.1, 2.8));
  for (let x = 22.6; x < 27.8; x += 0.5) put('steel', box(0.45, 1.8, 0.5).translate(x, 0.9, 8.6));

  // merge per material into the layer
  for (const [k, list] of Object.entries(parts)) {
    const o = new THREE.Mesh(mergeGeometries(list), M[k]);
    o.castShadow = true;
    o.receiveShadow = true;
    layer.add(o);
  }
  layer.add(fl);
  return {kerb: kh};
}
