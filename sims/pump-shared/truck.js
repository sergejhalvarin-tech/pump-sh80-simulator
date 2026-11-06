// The pickup the unit rides in: a Ford F-150 Raptor R (the user's model), with a simple drawn stand-in to its
// dimensions shown until the model loads. Millimetres in the pump's frame: the unit's frame stands on the bed floor
// (y −110), the truck points to −z, its tow ball behind at +z, the road 904 mm under the bed floor.
//
// 2024 F-150 Raptor R, Ford's technical specifications: SuperCrew, 5.2 supercharged V8 720 hp / 640 lb·ft, 10-speed
// automatic, 4×4; wheelbase 145.4", length 232.6", width 87.0" without mirrors, height 80.6", clearance 13.1", track
// 74.3", 37×12.50R17 tyres, 36 gal tank. Bed 5.5 ft (67.1"), 21.4" deep. Curb weight ≈ 6000 lb, GVWR ≈ 7050 lb and
// towing 8200 lb are press figures for the Raptor line, not Ford's sheet. Bed floor height and inner width measured
// off the model at true scale.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import MODEL_B64 from './assets/raptor.glb';

export const T9 = {name: 'Ford F-150 Raptor R', length: 5908, width: 2210, height: 2047, base: 3693, clearance: 333, curb: 2720, gross: 3200, trailer: 3720, bed: [1704, 1680, 544], floor: 904, engine: '5,2 V8 с нагнетателем · 720 л.с. · 868 Н·м', gearbox: 'АКПП-10 · полный привод', tank: 136};
export const GROUND = -110 - T9.floor; // −1014
// what rides: the unit (manual, Appendix В: 280–290 kg), the drive with its stand and breaker, the hoses; the trailer under the
// set is an estimate for a braked single-axle 1.5 t trailer
export const LOAD = {unit: 290, drive: 40, hoses: 30};
export const TRAILER = {genset: 808, frame: 300, fuel: 67};
const BED = {z0: 1140 - T9.bed[0], z1: 1140, top: -110 + T9.bed[2]};
const REAR = BED.z1 + 140; // the tailgate's back face
const FRONT = REAR - T9.length;
const AXLE = {rear: REAR - 1271, front: REAR - 1271 - T9.base};
const TYRE = {r: 437, w: 316, track: 1874};
export const HITCH = new THREE.Vector3(0, GROUND + 520, REAR + 170);
const W = T9.width / 2;

export function buildTruck(add) {
  const mat = {
    paint: new THREE.MeshPhysicalMaterial({color: '#4b4f55', roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08}),
    black: new THREE.MeshPhysicalMaterial({color: '#151618', roughness: 0.6, metalness: 0.1, clearcoat: 0.2}),
    glass: new THREE.MeshPhysicalMaterial({color: '#11151a', roughness: 0.08, metalness: 0.3, clearcoat: 1}),
    chrome: new THREE.MeshStandardMaterial({color: '#d9dde2', roughness: 0.15, metalness: 1}),
    tyre: new THREE.MeshStandardMaterial({color: '#141516', roughness: 0.92, metalness: 0}),
    rim: new THREE.MeshStandardMaterial({color: '#c9cdd2', roughness: 0.3, metalness: 0.9}),
    lamp: new THREE.MeshBasicMaterial({color: '#f4f8ff'}),
    tail: new THREE.MeshBasicMaterial({color: '#d6182b'}),
    liner: new THREE.MeshStandardMaterial({color: '#222427', roughness: 0.85, metalness: 0}),
    strap: new THREE.MeshStandardMaterial({color: '#f2a516', roughness: 0.6}),
  };
  const root = new THREE.Group();
  const arch = (z, r = 450) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI - (i / 16) * Math.PI;
      pts.push([z + r * Math.cos(a), GROUND + TYRE.r + 30 + r * Math.sin(a) * 0.92]);
    }
    return pts;
  };
  // a side profile in (z, y), extruded across x: the lower body with both arches notched out of its sill
  const prof = (pts, x0, x1, m, bevel = 18) => {
    const sh = new THREE.Shape();
    pts.forEach(([z, y], k) => (k ? sh.lineTo(-z, y) : sh.moveTo(-z, y)));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {depth: x1 - x0 - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6});
    // the shape was drawn in (−z, y) on the xy plane; turn it so the extrusion runs along x
    g.rotateY(Math.PI / 2).translate(x0 + bevel, 0, 0);
    return add(root, g, m);
  };
  const sill = GROUND + T9.clearance + 170;
  // the front body: bumper, grille face, bonnet, the cab's lower half to the belt line, down to the sill
  const belt = 330;
  prof([
    [FRONT, sill - 60], [FRONT, 120], [FRONT + 120, 210], [AXLE.front - 900, 250], [-1980, 290], [-1900, belt], [-430, belt], [-430, sill],
    ...arch(AXLE.front).reverse().map(([z, y]) => [z, Math.max(y, sill)]).filter(([z]) => z > AXLE.front - 460 && z < AXLE.front + 460),
  ], -W + 30, W - 30, mat.paint);
  // the greenhouse: dark glass all round, the roof and the pillars in paint
  prof([[-1960, belt], [-1350, 830], [-560, 850], [-440, 800], [-440, belt]], -W + 120, W - 120, mat.glass, 10);
  add(root, new RoundedBoxGeometry(W * 2 - 230, 30, 860, 3, 12).translate(0, 858, -950), mat.paint);
  for (const s of [-1, 1]) {
    // the pillars along the glass: A up the windscreen's rake, B upright, C leaning in from the cab's back
    for (const [z0, y0, z1, y1] of [[-1960, belt, -1350, 830], [-1020, belt, -1020, 845], [-440, belt, -560, 850]]) {
      const len = Math.hypot(z1 - z0, y1 - y0);
      const p = add(root, new THREE.BoxGeometry(14, len, 70).translate(0, len / 2, 0), mat.paint);
      p.position.set(s * (W - 118), y0, z0);
      p.rotation.x = Math.atan2(z1 - z0, y1 - y0);
    }
    // roof rails, the door handles, mirrors
    add(root, new THREE.BoxGeometry(30, 26, 1050).translate(s * (W - 260), 885, -980), mat.chrome);
    for (const z of [-1450, -820]) add(root, new THREE.BoxGeometry(10, 22, 140).translate(s * (W - 22), 230, z), mat.chrome);
    add(root, new THREE.BoxGeometry(150, 110, 220).translate(s * (W + 70), 430, -1840), mat.chrome);
    // wheel-arch flares and the side steps
    for (const z of [AXLE.front, AXLE.rear]) {
      const fl = new THREE.TorusGeometry(470, 42, 8, 24, Math.PI).rotateY(Math.PI / 2).translate(s * (W - 10), GROUND + TYRE.r + 30, z);
      add(root, fl, mat.black);
    }
    add(root, new THREE.BoxGeometry(160, 40, AXLE.rear - AXLE.front - 1000).translate(s * (W - 60), sill - 110, (AXLE.front + AXLE.rear) / 2 - 100), mat.black);
  }
  // the face: grille with its vertical bars, lamps, the lower bumper
  add(root, new THREE.BoxGeometry(1180, 520, 40).translate(0, -150, FRONT - 8), mat.black);
  for (let k = 0; k < 9; k++) add(root, new THREE.BoxGeometry(34, 470, 30).translate(-480 + k * 120, -150, FRONT - 26), mat.chrome);
  for (const s of [-1, 1]) {
    add(root, new THREE.BoxGeometry(300, 34, 30).translate(s * 750, 150, FRONT + 20), mat.lamp);
    add(root, new THREE.BoxGeometry(160, 90, 30).translate(s * 760, 20, FRONT + 10), mat.lamp);
    add(root, new THREE.BoxGeometry(60, 320, 30).translate(s * (W - 40), 30, BED.z1 + 62), mat.tail);
  }
  add(root, new RoundedBoxGeometry(W * 2 - 40, 260, 220, 3, 40).translate(0, sill + 60, FRONT + 110), mat.black);

  // ------------------------------------------------------------ the bed: floor, walls with the arch, housings, tailgate, bumper, tow bar
  add(root, new THREE.BoxGeometry(T9.bed[1], 30, BED.z1 - BED.z0).translate(0, -125, (BED.z0 + BED.z1) / 2), mat.liner);
  for (const s of [-1, 1]) {
    const pts = [[BED.z0 - 50, sill], [BED.z0 - 50, BED.top], [BED.z1 + 50, BED.top], [BED.z1 + 50, sill], ...arch(AXLE.rear).reverse()];
    const x0 = s > 0 ? T9.bed[1] / 2 : -W + 30;
    const x1 = s > 0 ? W - 30 : -T9.bed[1] / 2;
    prof(pts, x0, x1, mat.paint, 12);
    add(root, new THREE.BoxGeometry(200, 260, 860).translate(s * (T9.bed[1] / 2 - 100), -110 + 130, AXLE.rear), mat.liner);
  }
  add(root, new THREE.BoxGeometry(T9.bed[1] + 2 * 160, BED.top - sill, 50).translate(0, (BED.top + sill) / 2, BED.z0 - 25), mat.paint);
  add(root, new THREE.BoxGeometry(T9.bed[1] + 2 * 160, BED.top - sill, 50).translate(0, (BED.top + sill) / 2, BED.z1 + 25), mat.paint);
  add(root, new THREE.BoxGeometry(W * 2 - 60, 170, 120).translate(0, sill - 20, REAR - 60), mat.black);
  // the tow bar and ball stay when the scanned body comes in
  add(root, new THREE.BoxGeometry(70, 70, 260).translate(0, HITCH.y - 40, REAR + 40), mat.black).userData.keep = true;
  add(root, new THREE.SphereGeometry(25, 16, 12).translate(HITCH.x, HITCH.y, HITCH.z), mat.chrome).userData.keep = true;
  // the sport bar behind the cab: two hoops with a cross bar
  for (const s of [-1, 1]) {
    const pts = [new THREE.Vector3(s * 720, BED.top, BED.z0 + 40), new THREE.Vector3(s * 720, BED.top + 380, BED.z0 + 60), new THREE.Vector3(s * 640, BED.top + 470, BED.z0 + 140), new THREE.Vector3(s * 560, BED.top + 330, BED.z0 + 620), new THREE.Vector3(s * 560, BED.top, BED.z0 + 760)];
    add(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 28, 10), mat.black);
  }
  add(root, new THREE.CylinderGeometry(28, 28, 1280, 12).rotateZ(Math.PI / 2).translate(0, BED.top + 470, BED.z0 + 140), mat.black);
  // two ratchet straps across the unit's frame
  for (const z of [100, 760]) {
    const pts = [new THREE.Vector3(-560, -108, z), new THREE.Vector3(-200, -100, z), new THREE.Vector3(-190, 6, z), new THREE.Vector3(190, 6, z), new THREE.Vector3(200, -100, z), new THREE.Vector3(560, -108, z)];
    add(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 6, 6), mat.strap).userData.keep = true;
  }

  // ------------------------------------------------------------ wheels
  const wheels = [];
  for (const z of [AXLE.front, AXLE.rear]) {
    for (const s of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set((s * TYRE.track) / 2, GROUND + TYRE.r, z);
      root.add(wg);
      add(wg, new THREE.CylinderGeometry(TYRE.r, TYRE.r, TYRE.w, 48).rotateZ(Math.PI / 2), mat.tyre);
      add(wg, new THREE.CylinderGeometry(230, 230, TYRE.w + 6, 40).rotateZ(Math.PI / 2), mat.black);
      for (let k = 0; k < 6; k++) {
        const sp = add(wg, new THREE.BoxGeometry(14, 200, 48).translate(s * (TYRE.w / 2 + 2), 120, 0), mat.rim);
        sp.rotation.x = (k / 6) * Math.PI * 2;
      }
      add(wg, new THREE.CylinderGeometry(60, 60, TYRE.w + 14, 20).rotateZ(Math.PI / 2), mat.rim);
      wheels.push(wg);
    }
  }

  // the parts the scanned model replaces: everything drawn above except the hitch and the straps (they stay)
  const drawn = [...root.children];
  const mats = Object.values(mat);
  /** the user's Ford F-150 Raptor R (a game-ready model with its own paint, glass, lamps, tyres and interior), scaled
   *  uniformly to its real length (its wheelbase then comes out 3691 mm against Ford's 3693), turned to face −z, its
   *  rear face at REAR and its tyres on the road. Its bed floor lands 904 mm up, which is where T9.floor puts the unit's
   *  frame. The drawn body then goes. */
  const loadModel = async () => {
    const bin = Uint8Array.from(atob(MODEL_B64), (c) => c.charCodeAt(0)).buffer;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await new Promise((ok, no) => loader.parse(bin, '', ok, no));
    const model = gltf.scene;
    model.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = !m.material.transparent;
      m.receiveShadow = true;
      // own copies, to fade with the view; glass and lamp lenses keep their own transparency
      m.material = m.material.clone();
      // a viewer that could not decode a texture still gets the part's colour: its texture's mean, stored with it
      const avg = m.material.userData.avg;
      if (avg && !m.material.map && m.material.color.equals(new THREE.Color(1, 1, 1))) m.material.color.setRGB(...avg, THREE.SRGBColorSpace);
      m.material.userData.own = {transparent: m.material.transparent, opacity: m.material.opacity, depthWrite: m.material.depthWrite};
      mats.push(m.material);
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const k = T9.length / (box.max.z - box.min.z);
    const holder = new THREE.Group();
    holder.add(model);
    // the model's front is at its +z: put its rear face at the origin, then turn it round so it runs forward to −z
    model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -box.min.z);
    holder.scale.setScalar(k);
    holder.rotation.y = Math.PI;
    holder.position.set(0, GROUND, REAR);
    root.add(holder);
    for (const o of drawn) if (!o.userData.keep) o.visible = false;
    return {k, size: box.getSize(new THREE.Vector3()).multiplyScalar(k)};
  };
  /** shown: 0..1 the truck fades in for the mobile views and out of the others */
  const update = (shown) => {
    root.visible = shown > 0.02;
    if (!root.visible) return;
    const fade = shown < 0.985;
    for (const m of mats) {
      const own = m.userData.own ?? {transparent: false, opacity: 1, depthWrite: true};
      if (m.userData.fading !== fade) {
        m.userData.fading = fade;
        m.transparent = fade || own.transparent;
        m.depthWrite = !fade && own.depthWrite;
        m.needsUpdate = true;
      }
      m.opacity = own.opacity * (fade ? shown : 1);
    }
  };
  return {root, update, wheels, loadModel, at: {cab: new THREE.Vector3(W, 600, -1100), bed: new THREE.Vector3(W, BED.top, 700), hitch: HITCH}};
}
