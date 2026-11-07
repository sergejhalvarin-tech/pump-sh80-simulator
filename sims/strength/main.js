// The Ш80-2,5 in CAD and in CalculiX: the assembly built from the manual's outline drawing (CAD/pump_sh80), the drive
// shaft and the casing coloured by their stress, the numbers beside. One page, the models fetched beside it.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import ASM from './assets/pump_sh80.glb';
import SHAFT from './assets/drive_shaft_stress.glb';
import BODY from './assets/body_stress.glb';
import R from './assets/fea_results.json';
import MASS from './assets/masses.json';

const f1 = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const VIEWS = [
  {key: 'asm', name: 'Насос в CAD', src: ASM},
  {key: 'shaft', name: 'Вал на кручение', src: SHAFT, max: R.shaft.vm_max_MPa, what: 'σ экв. по Мизесу, МПа'},
  {key: 'body', name: 'Корпус под давлением', src: BODY, max: R.body.sigma1_max_MPa, what: 'наибольшее главное σ₁, МПа'},
];

document.title = 'Ш80-2,5 · CAD и прочность';
document.body.style.cssText = 'margin:0;background:#ecedef;font-family:Inter,Segoe UI,sans-serif;color:#16181b;overflow:hidden';
const app = document.getElementById('app');
app.style.cssText = 'position:fixed;inset:0';
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ecedef');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(2, 4, 3);
scene.add(sun, new THREE.HemisphereLight('#ffffff', '#9aa0a8', 0.6));
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// the overlay: title, the view tabs, the result card, the colour bar
const ui = document.createElement('div');
ui.innerHTML = `
<style>
.s-top{position:fixed;left:20px;top:16px;right:20px;pointer-events:none}
.s-top h1{margin:0;font-size:22px;letter-spacing:-.3px}
.s-top p{margin:4px 0 0;font:600 10px 'JetBrains Mono',monospace;letter-spacing:1px;color:#6b7075;text-transform:uppercase}
.s-tabs{position:fixed;left:20px;bottom:18px;display:flex;gap:8px;flex-wrap:wrap}
.s-tabs button{height:34px;padding:0 14px;border:1px solid #d8dbdf;background:#fff;border-radius:17px;font:600 12px Inter,sans-serif;cursor:pointer}
.s-tabs button.on{background:#16181b;color:#fff;border-color:#16181b}
.s-card{position:fixed;right:20px;top:16px;width:300px;background:#fffffff2;border:1px solid #e1e3e6;padding:14px 16px;font-size:12.5px;line-height:1.45}
.s-card h2{margin:0 0 6px;font-size:13px;letter-spacing:.2px}
.s-card .big{font-size:30px;font-weight:800;color:#d6182b;letter-spacing:-1px}
.s-card .row{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #eef0f2;padding:3px 0}
.s-card .row span{color:#6b7075}
.s-bar{margin-top:10px}
.s-bar i{display:block;height:10px;background:linear-gradient(90deg,#30123b,#4686fb,#1ae4b6,#a2fc3c,#fabb39,#e4460a,#7a0403)}
.s-bar div{display:flex;justify-content:space-between;font-size:10.5px;color:#6b7075;margin-top:2px}
.s-back{position:fixed;left:20px;top:74px;font:600 11px Inter,sans-serif;color:#16181b}
@media (max-width:700px){.s-card{left:12px;right:12px;width:auto;top:auto;bottom:66px;max-height:42vh;overflow:auto}.s-tabs{left:12px;right:12px;bottom:12px}.s-top{left:12px}}
</style>
<div class="s-top"><h1>Ш80-2,5 · CAD и прочность</h1><p>Детали по габаритному чертежу руководства 867-010-00-1 РЭ · расчёт CalculiX</p></div>
<a class="s-back" href="./">← к симулятору</a>
<div class="s-tabs">${VIEWS.map((v) => `<button data-k="${v.key}">${v.name}</button>`).join('')}</div>
<div class="s-card"></div>`;
document.body.appendChild(ui);
const card = ui.querySelector('.s-card');
const row = (a, b) => `<div class="row"><span>${a}</span><b>${b}</b></div>`;
const CARDS = {
  asm: () => `<h2>Сборка из 8 деталей · STEP</h2>
    ${row('Габариты', `${MASS.size_mm.join(' × ')} мм`)}
    ${row('Масса модели', `${f1(MASS.total_kg)} кг (паспорт ≤ 93)`)}
    ${row('Роторы', 'm 6 · z 16 · b 180 · β 20°, шеврон')}
    ${row('Межосевое', '96 мм · подшипники 42308')}
    ${row('Порты', 'Ø100, фланцы Ø190, 8 × M14')}
    ${Object.entries(MASS.parts).map(([k, m]) => row(k.replace(/_/g, ' '), `${f1(m)} кг`)).join('')}`,
  shaft: () => `<h2>Ведущий вал · ${R.shaft.material}</h2>
    <div class="big">запас ${f1(R.shaft.safety)}</div>
    ${row('Момент (пуск, Mmax = 2,2 Mн)', `${R.shaft.torque_Nm} Н·м`)}
    ${row('σ экв. max (у шпоночного паза)', `${f1(R.shaft.vm_max_MPa)} МПа`)}
    ${row('Аналитически вдали от паза', `τ ${f1(R.shaft.tau_analytic_MPa)} → σэкв ${f1(R.shaft.vm_analytic_MPa)} МПа`)}
    ${row('Предел текучести', `${R.shaft.yield_MPa} МПа`)}
    ${row('Сетка', `${R.shaft.elements.toLocaleString('ru')} тетраэдров C3D10`)}`,
  body: () => `<h2>Корпус · ${R.body.material}</h2>
    <div class="big">запас ${f1(R.body.safety)}</div>
    ${row('Давление испытания', `${f1(R.body.pressure_MPa)} МПа (1,5 × 0,4)`)}
    ${row('σ₁ max (растяжение)', `${f1(R.body.sigma1_max_MPa)} МПа`)}
    ${row('σ экв. max', `${f1(R.body.vm_max_MPa)} МПа`)}
    ${row('Прочность на растяжение', `${R.body.tension_strength_MPa} МПа`)}
    ${row('Сетка', `${R.body.elements.toLocaleString('ru')} тетраэдров C3D10`)}
    ${row('Зубья (ГОСТ 21354)', `σF ${f1(R.teeth.sigma_F_MPa)} МПа · запас ${R.teeth.safety}`)}`,
};

const loader = new GLTFLoader();
const cache = {};
let current = null;
const fetchGlb = async (src) => (src.startsWith('url:') ? (await fetch(src.slice(4))).arrayBuffer() : Uint8Array.from(atob(src), (c) => c.charCodeAt(0)).buffer);
const show = async (key) => {
  const v = VIEWS.find((x) => x.key === key);
  for (const b of ui.querySelectorAll('.s-tabs button')) b.classList.toggle('on', b.dataset.k === key);
  card.innerHTML = CARDS[key]() + (v.max ? `<div class="s-bar"><i></i><div><span>0</span><span>${v.what}</span><span>${f1(v.max)}</span></div></div>` : '');
  if (!cache[key]) {
    const g = await new Promise(async (ok, no) => loader.parse(await fetchGlb(v.src), '', ok, no));
    const root = g.scene;
    root.traverse((m) => {
      if (!m.isMesh) return;
      const col = m.geometry.attributes.color;
      if (col) {
        // the stress colours are written as sRGB; the renderer works in linear light
        const c = new THREE.Color();
        for (let i = 0; i < col.count; i++) {
          c.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.SRGBColorSpace);
          col.setXYZ(i, c.r, c.g, c.b);
        }
        m.material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide});
      }
      else m.material.side = THREE.DoubleSide;
    });
    const box = new THREE.Box3().setFromObject(root);
    root.position.sub(box.getCenter(new THREE.Vector3()));
    cache[key] = {root, r: box.getSize(new THREE.Vector3()).length() / 2};
  }
  // the CAD model under filmic tone mapping; the stress maps without, so their colours read as the bar shows them
  renderer.toneMapping = v.max ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  if (current) scene.remove(current.root);
  current = cache[key];
  scene.add(current.root);
  const d = current.r / Math.tan((camera.fov * Math.PI) / 360) * 1.15;
  camera.position.set(d * 0.62, d * 0.42, d * 0.66);
  controls.target.set(0, 0, 0);
  controls.update();
};
ui.querySelector('.s-tabs').addEventListener('click', (e) => e.target.dataset.k && show(e.target.dataset.k));
const fit = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', fit);
fit();
show(new URLSearchParams(location.search).get('v') || 'asm');
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
