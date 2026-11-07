// The hangar for producing and packing industrial oils: 18 × 28 m, LSTK frame, mineral-wool sandwich panels, every
// building service as its own layer, the structural, heat, air, power and water numbers beside it.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {B, HEAT, LOADS, POST, POWER, SEC, SITE, solveTruss, WATER} from './calc.js';
import {buildHangar, ROOMS, ZONES} from './building.js';

const f = (x, n = 1) => (Math.round(x * 10 ** n) / 10 ** n).toFixed(n).replace('.', ',');
document.title = 'Ангар 504 м² · производство масел';
document.body.style.cssText = 'margin:0;background:#e9ebee;font-family:Inter,Segoe UI,sans-serif;color:#16181b;overflow:hidden';
const app = document.getElementById('app');
app.style.cssText = 'position:fixed;inset:0';
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9ebee');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(-20, 35, 25);
sun.target.position.set(14, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, {left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120});
scene.add(sun, sun.target, new THREE.HemisphereLight('#ffffff', '#a7adb4', 0.7));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({color: '#d5d8dc', roughness: 1}));
ground.rotation.x = -Math.PI / 2;
ground.position.set(14, -0.41, 0);
ground.receiveShadow = true;
scene.add(ground);

const H = buildHangar();
scene.add(H.root);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// ------------------------------------------------------------ the layers and the cladding's three states
const LAYERS = [
  ['frame', 'Каркас ЛСТК'],
  ['clad', 'Сэндвич-панели'],
  ['vent', 'Вентиляция'],
  ['heat', 'Отопление'],
  ['elec', 'Электрика'],
  ['water', 'Вода и стоки'],
  ['fire', 'Пожарная безопасность'],
  ['zones', 'Зоны под оборудование'],
  ['util', 'Расчёт ферм'],
];
const on = {frame: true, clad: true, vent: false, heat: false, elec: false, water: false, fire: false, zones: true, util: false};
let cladMode = 'solid'; // solid · glass
const applyLayers = () => {
  for (const [k] of LAYERS) if (H.layers[k]) H.layers[k].visible = on[k];
  H.layers.truss.visible = on.frame && !on.util;
  H.layers.util.visible = on.util;
  for (const m of H.cladding) {
    const glassy = m.material.userData.glassy ??= m.material.transparent;
    m.material.transparent = glassy || cladMode === 'glass';
    m.material.opacity = cladMode === 'glass' ? 0.18 : glassy ? 0.35 : 1;
    m.material.depthWrite = !glassy && cladMode !== 'glass';
    m.castShadow = cladMode !== 'glass';
  }
  for (const b of ui.querySelectorAll('[data-l]')) b.classList.toggle('on', !!on[b.dataset.l]);
  ui.querySelector('[data-g]').textContent = cladMode === 'glass' ? 'Панели: прозрачные' : 'Панели: сплошные';
};

// ------------------------------------------------------------ the camera presets
const VIEWS = {
  out: {name: 'Снаружи', pos: [-22, 17, 30], tgt: [14, 3, 0]},
  in: {name: 'Внутри', pos: [2.5, 2.2, 7.5], tgt: [18, 3, -3]},
  plan: {name: 'План', pos: [14, 52, 0.01], tgt: [14, 0, 0]},
  gable: {name: 'Торец A', pos: [-24, 5, 0], tgt: [14, 4, 0]},
  rooms: {name: 'Помещения', pos: [15.5, 4.2, 7.5], tgt: [25, 1.4, -1.5]},
};
let current = 'out';
const view = (k) => {
  const v = VIEWS[k];
  current = k;
  controls.target.set(...v.tgt);
  // on a narrow (upright) screen the view backs off, so the building still fits across
  const back = Math.max(1, (16 / 9 / (innerWidth / innerHeight)) ** 0.75);
  const t = controls.target;
  camera.position.set(t.x + (v.pos[0] - t.x) * back, t.y + (v.pos[1] - t.y) * back, t.z + (v.pos[2] - t.z) * back);
  controls.update();
  for (const b of ui.querySelectorAll('[data-v]')) b.classList.toggle('on', b.dataset.v === k);
};

// ------------------------------------------------------------ the overlay
const ui = document.createElement('div');
const truss = solveTruss();
const trussA = solveTruss(undefined, true);
const worst = (t) => t.mem.reduce((a, m) => (m.util > a.util ? m : a));
const tw = worst(trussA);
let kgTruss = 0;
for (const m of truss.mem) kgTruss += m.L * SEC[m.kind].kg;
const row = (a, b) => `<div class="r"><span>${a}</span><b>${b}</b></div>`;
const table = (head, rows) => `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</table>`;

// the truss in elevation, its members coloured by their use of capacity
const trussSvg = () => {
  const W = 300;
  const k = W / B.span;
  const Y = (y) => 70 - y * k;
  let h = `<svg viewBox="-6 0 312 96" width="100%">`;
  for (const m of trussA.mem) {
    const [x1, y1] = trussA.nodes[m.a];
    const [x2, y2] = trussA.nodes[m.b];
    const c = new THREE.Color().setHSL(Math.max(0, 0.33 - 0.33 * m.util), 0.85, 0.45).getStyle();
    h += `<line x1="${x1 * k}" y1="${Y(y1)}" x2="${x2 * k}" y2="${Y(y2)}" stroke="${c}" stroke-width="${m.kind === 'web' ? 1.4 : 2.6}"/>`;
  }
  h += `<text x="0" y="90" font-size="8" fill="#6b7075">использование несущей способности: </text><rect x="150" y="83" width="80" height="7" fill="url(#ug)"/><text x="234" y="90" font-size="8" fill="#6b7075">0 → 1</text>`;
  h += `<defs><linearGradient id="ug"><stop offset="0" stop-color="hsl(119,85%,45%)"/><stop offset=".5" stop-color="hsl(60,85%,45%)"/><stop offset="1" stop-color="hsl(0,85%,45%)"/></linearGradient></defs></svg>`;
  return h;
};

const TABS = {
  bld: ['Здание', () => `
    ${row('Габариты в осях', `${B.span} × ${B.length} м`)}
    ${row('Площадь пола', `${B.area} м²`)}
    ${row('Высота до карниза / конька', `${f(B.eave)} / ${f(B.ridge, 2)} м`)}
    ${row('Объём внутри', `${Math.round(B.volume).toLocaleString('ru')} м³`)}
    ${row('Кровля', `двускатная ${B.pitch}°`)}
    ${row('Каркас', `ЛСТК, фермы и стойки с шагом ${B.step} м (${B.trusses} шт.)`)}
    ${row('Стены', 'сэндвич-панель 150 мм, минвата, НГ')}
    ${row('Кровля', 'сэндвич-панель 200 мм, минвата, НГ')}
    ${row('Ворота', 'секционные 4,0 × 4,5 (торец) и 3,5 × 4,0 (бок)')}
    ${row('Двери, окна', '4 двери · 12 окон ПВХ 2 × 1 м')}
    ${row('Пол', 'плита 250 мм, маслостойкое покрытие, лотки')}
    ${row('Категория пожарной опасности', 'В (В1–В3 — после расстановки оборудования)')}
    ${row('Район', SITE.name)}
    <h4>Зоны и помещения</h4>
    ${table(['', 'м²'], [...ZONES, ...ROOMS].map((z) => [z.name.split(':')[0], f((z.x[1] - z.x[0]) * (z.z[1] - z.z[0]), 0)]))}`],
  str: ['Конструкции', () => `
    ${row('Снег, район ' + SITE.snowDistrict, `${f(SITE.Sg)} кПа × 1,4 = ${f(LOADS.snowD, 2)} кПа`)}
    ${row('Постоянная (панели, фермы, сети)', `${f(LOADS.deadN, 2)} → ${f(LOADS.deadD, 2)} кПа`)}
    ${row('Ветер, район ' + SITE.windDistrict, `${f(SITE.w0, 2)} кПа · на стену ${f(POST.wPress, 2)} кПа`)}
    <h4>Ферма 18 м · шаг 2 м · снег несимметричный 1,25 / 0,75</h4>
    ${trussSvg()}
    ${table(['Элемент', 'Сечение', 'N, кН', 'Исп.'], ['top', 'bottom', 'webH', 'web'].map((kd) => {
    const ms = trussA.mem.filter((m) => m.kind === kd);
    const m = ms.reduce((a, x) => (x.util > a.util ? x : a));
    return [{top: 'Верхний пояс', bottom: 'Нижний пояс', webH: 'Решётка длинная', web: 'Решётка короткая'}[kd], SEC[kd].name, f(m.N, 0), `${Math.round(m.util * 100)} %`];
  }))}
    ${row('Наибольшее использование', `${Math.round(tw.util * 100)} % (${tw.kind === 'top' ? 'верхний пояс' : 'решётка'})`)}
    ${row('Прогиб в середине', `${f(trussA.deflection, 0)} мм = L/${Math.round((B.span * 1000) / trussA.deflection)} (доп. L/250)`)}
    ${row('Масса фермы', `${Math.round(kgTruss)} кг · всего ${f((kgTruss * B.trusses) / 1000)} т`)}
    <h4>Стойка ${SEC.post.name}, ${B.eave} м</h4>
    ${row('N от фермы и стены', `${f(POST.Npost)} кН`)}
    ${row('M от ветра', `${f(POST.M, 2)} кН·м`)}
    ${row('Использование (N + M)', `${Math.round(POST.util * 100)} %`)}
    <p class="note">Расчёт фермы — прямой метод перемещений, проверка устойчивости по EN 1993-1-1 (кривая b) с понижением площади тонкостенного профиля. Оценка для выбора сечений; рабочий проект ЛСТК выполняет завод-изготовитель.</p>`],
  heat: ['Тепло', () => `
    ${row('Внутри / снаружи (пятидневка)', `+${B.tIn} / ${SITE.tOut} °С`)}
    ${row('ГСОП', `${Math.round(HEAT.gsop).toLocaleString('ru')} °С·сут`)}
    ${row('R стен: требуется / есть', `${f(HEAT.Rreq.wall, 2)} / ${f(HEAT.env.wall, 2)} м²·°С/Вт`)}
    ${row('R кровли: требуется / есть', `${f(HEAT.Rreq.roof, 2)} / ${f(HEAT.env.roof, 2)} м²·°С/Вт`)}
    <h4>Теплопотери через ограждения</h4>
    ${table(['', 'м²', 'R', 'кВт'], HEAT.rows.map((r) => [r.name, f(r.A, 0), f(r.R, 2), f(r.kW)]))}
    ${row('Итого с добавками 10 %', `${f(HEAT.trans)} кВт`)}
    ${row('Нагрев приточного воздуха после рекуператора', `${f(HEAT.ventKw)} кВт (без рекуператора ${f(HEAT.ventNoRec, 0)})`)}
    ${row('Тепловые завесы ворот', `${HEAT.curtains} кВт`)}
    <p class="note">Отопление электрическое: 7 воздушно-отопительных агрегатов на стойках + догрев в ПВУ. Если на участке есть газ — газовый котёл и водяные агрегаты будут дешевле в эксплуатации в 3–4 раза.</p>`],
  vent: ['Вентиляция', () => `
    ${row('Общеобменная, 1,5 крат/ч', `${Math.round(HEAT.Lgen).toLocaleString('ru')} м³/ч`)}
    ${row('Местные отсосы: 2 над смесителями, 2 над фасовкой', `${HEAT.Lloc.toLocaleString('ru')} м³/ч`)}
    ${row('ПВУ (приток = вытяжка)', `${HEAT.L.toLocaleString('ru')} м³/ч`)}
    ${row('Рекуператор пластинчатый', `η ${Math.round(HEAT.eta * 100)} % · воздух после него ${f(HEAT.tAfterRec)} °С`)}
    ${row('Догрев до +18 °С', `${f(HEAT.ventKw)} кВт`)}
    ${row('Раздача', 'сопла вниз вдоль южной стены, Ø630')}
    ${row('Вытяжка', 'решётки и зонты, Ø560, к ПВУ')}
    ${row('Крышные вентиляторы (лето)', '2 шт.')}
    <p class="note">Масла со вспышкой ≥ 180 °С не образуют взрывоопасной среды: вентиляция общепромышленная. Пары и масляный туман при подогреве и розливе удаляются местными отсосами у источника.</p>`],
  elec: ['Электрика', () => `
    ${table(['Потребитель', 'кВт', 'Kс', 'Расч.'], POWER.rows.map((r) => [r.name, f(r.kw, 0), f(r.kc, 1), f(r.calc)]))}
    ${row('Установленная мощность', `${f(POWER.installed, 0)} кВт`)}
    ${row('Расчётная', `${f(POWER.calc, 0)} кВт · ${f(POWER.kva, 0)} кВА`)}
    ${row('Ток на вводе 0,4 кВ', `${f(POWER.I, 0)} А → ввод 250 А`)}
    ${row('Источник', 'КТП 250 кВА / ТУ сети на 160 кВт, кабель в земле')}
    ${row('Освещение', `${7 * 4} светильников LED 150 Вт на 6 м, 300 лк`)}
    ${row('Молниезащита, заземление', 'стержень на коньке, контур вокруг плиты')}
    <p class="note">ДГУ 20 кВт с площадки налива такую нагрузку не потянет — для ангара нужен ввод от сети или ДГУ на 200 кВА.</p>`],
  water: ['Вода', () => `
    ${row('Хоз-питьевая, 8 работающих', `${f(WATER.domestic, 2)} м³/смену`)}
    ${row('Технологическая (мойка ёмкостей, пола)', `${f(WATER.process, 1)} м³/смену`)}
    ${row('Внутренний пожарный водопровод', `${WATER.fireJets} струя × ${f(WATER.fireFlow)} л/с, 3 пожарных крана`)}
    ${row('Бытовые стоки', 'в септик / ЛОС')}
    ${row('Производственные стоки', 'лотки в полу → маслоуловитель')}
    ${row('Проливы масла', 'обвалование резервуаров, сбор в приямок')}
    <p class="note">Масло в канализацию не сбрасывается: лотки собирают проливы и воду от мойки в маслоуловитель, отделённое масло — на утилизацию.</p>`],
  fire: ['Пожарная', () => `
    ${row('Категория помещения', 'В1–В3 (ГЖ, вспышка ≥ 180 °С)')}
    ${row('Панели', 'минвата — НГ, класс К0')}
    ${row('Пожарная сигнализация', '15 дымовых извещателей, ручные у выходов')}
    ${row('Оповещение', 'СОУЭ 2-го типа, табло «Выход»')}
    ${row('Огнетушители', '6 × ОП-8 + 3 пожарных крана')}
    ${row('Эвакуация', '4 двери + 2 ворот, путь ≤ 60 м')}
    ${row('АУПТ', 'по СП 486.1311500 — определяется по категории после расстановки оборудования')}
    <p class="note">Зона резервуаров базовых масел — с обвалованием на объём наибольшей ёмкости.</p>`],
};

ui.innerHTML = `
<style>
.h-top{position:fixed;left:20px;top:14px;pointer-events:none}
.h-top h1{margin:0;font-size:21px;letter-spacing:-.3px}
.h-top p{margin:4px 0 0;font:600 10px 'JetBrains Mono',monospace;letter-spacing:1px;color:#6b7075;text-transform:uppercase}
.h-bar{position:fixed;left:20px;right:20px;bottom:14px;display:flex;flex-direction:column;gap:6px;pointer-events:none}
.h-row{display:flex;gap:6px;flex-wrap:wrap;pointer-events:auto}
.h-row button{height:30px;padding:0 12px;border:1px solid #d6d9dd;background:#fff;border-radius:15px;font:600 11.5px Inter,sans-serif;cursor:pointer;color:#16181b}
.h-row button.on{background:#16181b;color:#fff;border-color:#16181b}
.h-card{position:fixed;right:16px;top:14px;bottom:96px;width:350px;background:#fffffff4;border:1px solid #e1e3e6;display:flex;flex-direction:column;font-size:12px;line-height:1.4}
.h-tabs{display:flex;flex-wrap:wrap;border-bottom:1px solid #e6e8ea}
.h-tabs button{flex:1 0 auto;padding:7px 6px;border:0;background:none;font:600 11px Inter,sans-serif;color:#6b7075;cursor:pointer;border-bottom:2px solid transparent}
.h-tabs button.on{color:#16181b;border-bottom-color:#d6182b}
.h-body{overflow:auto;padding:10px 14px 14px}
.h-body .r{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #f0f1f3;padding:3px 0}
.h-body .r span{color:#5d636a}
.h-body .r b{text-align:right}
.h-body h4{margin:12px 0 4px;font-size:11.5px;letter-spacing:.2px}
.h-body table{width:100%;border-collapse:collapse;font-size:11px;margin:2px 0 6px}
.h-body td,.h-body th{border-bottom:1px solid #eef0f2;padding:2px 3px;text-align:left;vertical-align:top}
.h-body th{color:#6b7075;font-weight:600}
.h-body td.n{text-align:right;white-space:nowrap}
.h-body .note{color:#6b7075;font-size:11px;margin:8px 0 0}
.h-back{position:fixed;left:20px;top:70px;font:600 11px Inter,sans-serif;color:#16181b}
@media (max-width:760px){.h-card{left:10px;right:10px;width:auto;top:auto;bottom:112px;height:34vh}.h-top p{display:none}.h-bar{left:10px;right:10px}.h-row{flex-wrap:nowrap;overflow-x:auto}.h-row button{flex:none}.h-top{left:12px}.h-top h1{font-size:17px}.h-back{left:12px;top:42px}}
</style>
<div class="h-top"><h1>Ангар 18 × 28 м · производство и фасовка масел</h1><p>${B.area} м² · ${Math.round(B.volume).toLocaleString('ru')} м³ · ЛСТК · сэндвич-панели · ${SITE.name}</p></div>
<a class="h-back" href="./">← к перекачке и насосу</a>
<div class="h-card"><div class="h-tabs">${Object.entries(TABS).map(([k, [n]]) => `<button data-t="${k}">${n}</button>`).join('')}</div><div class="h-body"></div></div>
<div class="h-bar">
<div class="h-row">${Object.entries(VIEWS).map(([k, v]) => `<button data-v="${k}">${v.name}</button>`).join('')}<button data-g="1"></button></div>
<div class="h-row">${LAYERS.map(([k, n]) => `<button data-l="${k}">${n}</button>`).join('')}</div>
</div>`;
document.body.appendChild(ui);
const body = ui.querySelector('.h-body');
const tab = (k) => {
  body.innerHTML = TABS[k][1]();
  for (const b of ui.querySelectorAll('[data-t]')) b.classList.toggle('on', b.dataset.t === k);
  // a tab brings its own layer up, and the panels go see-through so the system shows
  const lay = {vent: 'vent', heat: 'heat', elec: 'elec', water: 'water', fire: 'fire', str: 'util'}[k];
  if (lay) {
    on[lay] = true;
    cladMode = 'glass';
  }
  applyLayers();
};
ui.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.t) tab(b.dataset.t);
  if (b.dataset.v) view(b.dataset.v);
  if (b.dataset.g) {
    cladMode = cladMode === 'glass' ? 'solid' : 'glass';
    applyLayers();
  }
  if (b.dataset.l) {
    on[b.dataset.l] = !on[b.dataset.l];
    applyLayers();
  }
});

const fit = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', fit);
fit();
const q = new URLSearchParams(location.search);
view(q.get('v') || 'out');
tab(q.get('t') || 'bld');
if (q.get('l')) for (const k of q.get('l').split(',')) on[k] = true;
if (q.get('g')) cladMode = 'glass';
applyLayers();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
window.HANGAR = {H, on, view, tab, applyLayers};
