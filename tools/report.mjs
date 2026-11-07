#!/usr/bin/env node
// The technical report as a PDF: the run planned by the simulator itself (pump-live.html, the same model the panels
// show) at four oil temperatures, pictures from it and from the strength page, the CAD and CalculiX results, the
// equipment and the safety list. Needs a build (npm run build, plus sims/strength) and a server on the dist folder
// for the strength page (it fetches its models): node tools/report.mjs [http://127.0.0.1:8765]
//
// Playwright is the teardown kit's: TEARDOWN_DEPS=<skill>/node_modules node tools/report.mjs
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {playwright, CHROMIUM_ARGS} from './teardown/paths.mjs';

const SERVE = process.argv[2] || 'http://127.0.0.1:8765';
const DIST = path.resolve('teardown-out/dist');
const OUT = path.resolve('report');
fs.mkdirSync(OUT, {recursive: true});
const CAD = JSON.parse(fs.readFileSync('sims/strength/assets/masses.json', 'utf8'));
const FEA = JSON.parse(fs.readFileSync('sims/strength/assets/fea_results.json', 'utf8'));

const {chromium} = playwright();
const browser = await chromium.launch({args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: 1600, height: 900}});
await page.goto(pathToFileURL(path.join(DIST, 'pump-live.html')).href);
await page.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 120000});
await page.waitForTimeout(6000);

// the run at four temperatures, everything else as the panel's defaults
const runs = await page.evaluate(() => {
  const {cfg, st} = window.LIVE;
  const out = [];
  for (const t of [20, 10, 0, -10]) {
    cfg.temp = t;
    const plan = st.pump.site.replan();
    const s0 = plan.state(0);
    const end = plan.state(plan.T);
    const fills = plan.steps.filter((x) => x.active >= 0);
    const qAvg = fills.reduce((a, x) => a + x.q, 0) / Math.max(1, fills.length);
    out.push({t, nu: s0.nu, rho: s0.rho, q0: s0.q, qAvg, pIn0: s0.pIn, pOut0: s0.pOut, hVacMax: Math.max(...fills.map((x) => x.hVac)), T: plan.T,
      delivered: end.delivered, totalEnd: end.totalEnd, energy: end.energy, fuel: end.fuel, vRes: end.vRes, warnings: plan.warnings,
      vessels: [0, 1, 2, 3].map((k) => ({vol: end.vols[k], end: end.ends[k], dt: end.tEnd[k] - end.tStart[k]}))});
  }
  cfg.temp = 20;
  st.pump.site.replan();
  return out;
});

// pictures from the simulator: the site whole and in glass, the pump in section
const shoot = async (view, cut, file, wait = 3500) => {
  await page.evaluate((v) => {
    window.LIVE.takeOver();
    window.LIVE.setView(v);
  }, view);
  await page.click(`text=${cut}`);
  await page.waitForTimeout(wait);
  await page.keyboard.press('h');
  await page.waitForTimeout(500);
  await page.screenshot({path: path.join(OUT, file), type: 'jpeg', quality: 86});
  await page.keyboard.press('h');
};
await shoot('site', 'КОРПУС', 'img_site.jpg', 6000);
await shoot('site', 'СТЕКЛО', 'img_site_glass.jpg', 4000);
await shoot('rotors', 'СЕЧЕНИЕ', 'img_rotors.jpg');
await shoot('unit', 'КОРПУС', 'img_unit.jpg');
await shoot('truck', 'КОРПУС', 'img_truck.jpg');

// pictures of the strength page
for (const v of ['asm', 'shaft', 'body']) {
  const p = await browser.newPage({viewport: {width: 1400, height: 900}});
  await p.goto(`${SERVE}/strength.html?v=${v}`);
  await p.waitForTimeout(5000);
  await p.screenshot({path: path.join(OUT, `img_fea_${v}.jpg`), type: 'jpeg', quality: 86});
  await p.close();
}

const f = (x, n = 1) => (Math.round(x * 10 ** n) / 10 ** n).toFixed(n).replace('.', ',');
const hms = (s) => `${Math.floor(s / 3600)} ч ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} мин`;
const img = (file) => `data:image/jpeg;base64,${fs.readFileSync(path.join(OUT, file)).toString('base64')}`;
const r20 = runs[0];
const names = ['КАМАЗ, 8 м³', 'Scania №1, 20 м³', 'Scania №2, 20 м³', 'Scania №3, 20 м³'];
const today = new Date().toLocaleDateString('ru-RU');

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 15mm 16mm 15mm}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.2pt;color:#16181b;line-height:1.4}
h1{font-size:21pt;margin:0 0 4mm;letter-spacing:-.3px}
h2{font-size:13pt;margin:7mm 0 2.5mm;border-bottom:2px solid #d6182b;padding-bottom:1mm}
h3{font-size:11pt;margin:4mm 0 1.5mm}
table{border-collapse:collapse;width:100%;margin:1.5mm 0 3mm}
td,th{border:1px solid #d8dbdf;padding:1.2mm 2mm;text-align:left;vertical-align:top}
th{background:#f1f2f4;font-weight:600}
td.n,th.n{text-align:right;white-space:nowrap}
.mute{color:#6b7075}
.warn{color:#c8161d;font-weight:600}
.ok{color:#2f9e44;font-weight:600}
img{width:100%;border:1px solid #e1e3e6;margin:1mm 0}
.two{display:flex;gap:4mm}.two>div{flex:1}
.title{height:250mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
.bar{width:40mm;height:3px;background:#d6182b;margin-bottom:6mm}
.pb{page-break-before:always}
</style></head><body>

<div class="title"><div>
<div class="bar"></div>
<h1>Мобильная установка перекачки масла И-20А</h1>
<div style="font-size:13pt">на базе шестерённого насоса Ш80-2,5</div>
<p class="mute" style="margin-top:8mm">Технический отчёт: состав оборудования, гидравлический расчёт налива в четыре автоцистерны, проверка всасывания, прочность вала и корпуса насоса, CAD-модель, требования безопасности.</p>
<img src="${img('img_site.jpg')}" style="margin-top:8mm">
</div><div class="mute">Дата: ${today}<br>Интерактивная модель: https://sergejhalvarin-tech.github.io/pump-sh80-simulator/<br>Подготовлено с помощью Claude (Anthropic) по документации производителей; оценочные величины отмечены.</div></div>

<h2>1. Состав установки</h2>
<table>
<tr><th>Узел</th><th>Модель</th><th>Основные данные</th></tr>
<tr><td>Насос</td><td>Ш80-2,5-37,5/2,5-1 (АО «ГМС Ливгидромаш»)</td><td>37,5 м³/ч при 980 об/мин, до 0,25 МПа, перепуск 0,4 МПа, вакуум на входе до 5 м, вязкость 20–280 мм²/с, до 70 °С</td></tr>
<tr><td>Двигатель</td><td>АИР160S6</td><td>11 кВт, 970 об/мин, 380 В, Iн 24,6 А, КПД 86,8 %, cos φ 0,79, Mmax/Mн 2,2</td></tr>
<tr><td>Преобразователь частоты</td><td>INVT GD20-011G-4</td><td>11 кВт, вход 3 × 380 В 32 А, выход 0–400 Гц 25 А; плавный пуск, регулирование подачи частотой</td></tr>
<tr><td>Дизель-генератор</td><td>ТСС АД-20С-Т400-1РКМ5</td><td>20 кВт / 25 кВА, 3 × 400 В, бак 80 л, 3,0–6,1 л/ч; на одноосном прицепе ≈ 1175 кг</td></tr>
<tr><td>Транспорт агрегата</td><td>Ford F-150 Raptor R</td><td>агрегат с ПЧ ≈ 360 кг в кузове 1704 × 1680 мм; буксировка до 3720 кг</td></tr>
<tr><td>Рукава</td><td>Б-2-75-5 ГОСТ 5398-76</td><td>Ø75 мм, для масел и нефтепродуктов, с хвостовиками и хомутами</td></tr>
<tr><td>Фильтр</td><td>YS-316 DN80</td><td>сетчатый Y-фильтр на всасывании (руководство: ячейка ≤ 0,25 мм для масел)</td></tr>
<tr><td>Резервуар</td><td>РВС-80</td><td>Ø5,73 м, 80 м³, в начале 72 м³ И-20А; неснижаемый остаток 0,3 м (7,7 м³)</td></tr>
<tr><td>Автоцистерны</td><td>КАМАЗ 8 м³; 3 × Scania S730 + полуприцеп 20 м³</td><td>налив по очереди одним насосом, до 95 % объёма</td></tr>
</table>

<h2>2. Расчёт налива (масло +20 °С)</h2>
<p>Расход насоса находится итерацией по его характеристике против сопротивления линии: потери по Дарси (λ = 64/Re, ламинарный режим), местные сопротивления, фильтр; утечки в насосе пересчитаны на вязкость масла (∝ 1/ν от 75 мм²/с паспорта). Уровни пересчитываются каждую секунду. Между машинами — ${f(5, 0)} мин на перестановку рукава.</p>
<table><tr><th>Машина</th><th class="n">Налить</th><th class="n">Налито</th><th class="n">Время</th></tr>
${r20.vessels.map((v, k) => `<tr><td>${names[k]}</td><td class="n">${f(v.end)} м³</td><td class="n">${f(v.vol, 2)} м³</td><td class="n">${hms(v.dt)}</td></tr>`).join('')}
<tr><th>Итого</th><th class="n">${f(r20.totalEnd)} м³</th><th class="n">${f(r20.delivered, 2)} м³ · ${f((r20.delivered * r20.rho) / 1000)} т</th><th class="n">${hms(r20.T)}</th></tr></table>
<table>
<tr><td>Подача в начале / средняя</td><td class="n">${f(r20.q0)} / ${f(r20.qAvg)} м³/ч</td></tr>
<tr><td>Давление на входе / выходе в начале</td><td class="n">${Math.round(r20.pIn0 * 1000)} кПа / ${f(r20.pOut0, 2)} МПа</td></tr>
<tr><td>Наибольшее разрежение на входе (допуск 5 м)</td><td class="n">${f(r20.hVacMax, 2)} м</td></tr>
<tr><td>Электроэнергия / дизель ДГУ</td><td class="n">${f(r20.energy)} кВт·ч / ${f(r20.fuel)} л</td></tr>
<tr><td>Остаток в резервуаре</td><td class="n">${f(r20.vRes)} м³</td></tr>
</table>
${r20.warnings.length ? `<p class="warn">${r20.warnings.map((w) => '⚠ ' + w).join('<br>')}</p><p>Вывод: при 72 м³ в резервуаре четыре машины по 95 % (64,6 м³) налить нельзя без захвата воздуха — последней Scania не хватает около 0,2 м³. Нужно либо начинать с ${f(64.6 + 7.7 + 0.5, 0)} м³ и более, либо наливать последнюю машину на 94 %.</p>` : ''}

<h2 class="pb">3. Влияние температуры масла</h2>
<p>Вязкость И-20А по ASTM D341 через 32 мм²/с при 40 °С и 5,3 мм²/с при 100 °С. Насос допускает до 280 мм²/с и 5 м вакуума на входе; при большем разрежении подача урезается (кавитация).</p>
<table><tr><th class="n">Масло</th><th class="n">ν, мм²/с</th><th class="n">Подача, м³/ч</th><th class="n">Вакуум max, м</th><th class="n">Время</th><th class="n">кВт·ч</th><th>Замечания</th></tr>
${runs.map((r) => `<tr><td class="n">${r.t > 0 ? '+' : ''}${r.t} °С</td><td class="n">${Math.round(r.nu)}</td><td class="n">${f(r.q0)} → ${f(r.qAvg)}</td><td class="n">${f(r.hVacMax, 2)}</td><td class="n">${hms(r.T)}</td><td class="n">${f(r.energy)}</td><td>${r.warnings.filter((w) => !w.startsWith('Резервуар')).map((w) => `<span class="warn">${w.split(':')[0].split('—')[0]}</span>`).join('<br>') || '<span class="ok">в пределах насоса</span>'}</td></tr>`).join('')}
</table>
<p>Вывод: ниже ≈ +5 °С масло выходит за допустимую вязкость насоса, всасывание упирается в 5 м вакуума, подача падает, налив растягивается в разы. Зимой нужен подогрев масла в резервуаре (или рукавов) до +10…+20 °С, либо работа на пониженной частоте ПЧ.</p>
<img src="${img('img_site_glass.jpg')}">

<h2 class="pb">4. CAD-модель насоса</h2>
<p>Детали построены в build123d по габаритному чертежу (приложение Б руководства): габариты ${CAD.size_mm.join(' × ')} мм (чертёж 345 × 370 × 395), роторы шевронные m 6, z 16, b 180, β 20°, межосевое 96 мм, подшипники 42308, порты Ø100 с фланцами Ø190 (8 × M14 на Ø158). Толщины стенок и крышек — оценка, поэтому масса модели ${f(CAD.total_kg)} кг против «не более 93 кг» паспорта. Файлы STEP/STL каждой детали и сборки — в папке CAD\\pump_sh80\\out.</p>
<table><tr><th>Деталь</th><th class="n">Масса, кг</th></tr>${Object.entries(CAD.parts).map(([k, m]) => `<tr><td>${k}</td><td class="n">${f(m, 2)}</td></tr>`).join('')}</table>
<img src="${img('img_fea_asm.jpg')}">

<h2 class="pb">5. Прочность (CalculiX)</h2>
<h3>Ведущий вал — кручение при пуске</h3>
<p>Момент ${FEA.shaft.torque_Nm} Н·м (Mmax двигателя 2,2 × 108 Н·м — заклинивание при пуске), передаётся через шпонку 10 мм на конце Ø35; посадочная поверхность шестерён закреплена. ${FEA.shaft.material}, σт ${FEA.shaft.yield_MPa} МПа. Сетка ${FEA.shaft.elements.toLocaleString('ru')} тетраэдров C3D10.</p>
<table><tr><td>σ экв. max (у шпоночного паза)</td><td class="n">${f(FEA.shaft.vm_max_MPa)} МПа</td></tr>
<tr><td>Аналитически вдали от паза: τ = 16M/(πd³), σэкв = √3 τ</td><td class="n">${f(FEA.shaft.tau_analytic_MPa)} → ${f(FEA.shaft.vm_analytic_MPa)} МПа</td></tr>
<tr><td><b>Запас по текучести</b></td><td class="n"><b>${f(FEA.shaft.safety)}</b></td></tr></table>
<img src="${img('img_fea_shaft.jpg')}">
<h3>Корпус — гидроиспытание</h3>
<p>Давление ${f(FEA.body.pressure_MPa)} МПа (1,5 × 0,4 МПа полного перепуска) на расточки и порты, корпус стоит на лапах. ${FEA.body.material}: чугун разрушается от растяжения, поэтому проверка по наибольшему главному напряжению, прочность ${FEA.body.tension_strength_MPa} МПа.</p>
<table><tr><td>σ₁ max</td><td class="n">${f(FEA.body.sigma1_max_MPa)} МПа</td></tr><tr><td>σ экв. max</td><td class="n">${f(FEA.body.vm_max_MPa)} МПа</td></tr>
<tr><td><b>Запас</b></td><td class="n"><b>${f(FEA.body.safety)}</b></td></tr></table>
<img src="${img('img_fea_body.jpg')}">
<h3>Зубья — изгиб (ГОСТ 21354)</h3>
<p>Момент насоса при полном перепуске ${f(FEA.teeth.pump_torque_Nm)} Н·м, окружная сила ${FEA.teeth.Ft_N} Н на ширине 180 мм: σF = YF·Ft/(b·m) = ${f(FEA.teeth.sigma_F_MPa, 2)} МПа при допускаемом ≈ ${FEA.teeth.allowable_MPa} МПа — зубья нагружены слабо, их ресурс определяет износ, а не прочность.</p>

<h2 class="pb">6. Безопасность налива</h2>
<table>
<tr><th>Требование</th><th>Как в установке</th></tr>
<tr><td>Защита от статического электричества</td><td>все цистерны, пикап, ДГУ и резервуар заземлены штырём до открытия люка; заземление снимается после закрытия люка</td></tr>
<tr><td>Налив под уровень</td><td>рукав опускается в люк до дна, без падающей струи; скорость в рукаве ${f(r20.q0 / 3600 / (Math.PI * 0.075 ** 2 / 4))} м/с при норме ≤ 5 м/с</td></tr>
<tr><td>Ограничение налива</td><td>не выше 95 % объёма — запас на тепловое расширение</td></tr>
<tr><td>Пожарная безопасность</td><td>два огнетушителя ОП-5 у насоса, поддон и сорбент под агрегатом, табличка «Огнеопасно», без открытого огня в зоне налива</td></tr>
<tr><td>Аварийный останов</td><td>кнопка «СТОП» у ПЧ, проверка перед пуском</td></tr>
<tr><td>Двигатели машин</td><td>заглушены, ключи вынуты; работает только ДГУ</td></tr>
<tr><td>Контроль после пуска</td><td>осмотр фланцев и хомутов на течь; в грозу налив не вести</td></tr>
<tr><td>Права водителя</td><td>Raptor с прицепом ДГУ: разрешённая масса 6920 кг &gt; 3500 кг — категория BE</td></tr>
</table>
<div class="two"><div><img src="${img('img_unit.jpg')}"></div><div><img src="${img('img_rotors.jpg')}"></div></div>
<img src="${img('img_truck.jpg')}">

<h2>7. Источники и допущения</h2>
<p>Руководство 867-010-00-1 РЭ (насос Ш80-2,5); каталог IEK (АИР160S6); руководство INVT GD20; паспорт ТСС АД-20С; ГОСТ 20799-88 (И-20А), ГОСТ 5398-76 (рукава), ГОСТ 1412 (СЧ20), ГОСТ 4543 (40Х), ГОСТ 21354 (зубчатые передачи); технические характеристики Ford F-150 Raptor R 2024. Допущения: вязкость по ASTM D341 через две точки; трение в насосе 0,35 кВт при 75 мм²/с (оценка); 5 мин на перестановку рукава; толщины стенок CAD-модели — оценка; цистерны Scania 20 м³ построены по объёму (модель пользователя рассчитана на ≈ 12 м³).</p>
</body></html>`;

fs.writeFileSync(path.join(OUT, 'report.html'), html);
const pdf = await browser.newPage();
await pdf.setContent(html, {waitUntil: 'load'});
await pdf.pdf({path: path.join(OUT, 'report.pdf'), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">Мобильная установка перекачки И-20А · Ш80-2,5 · стр. <span class="pageNumber"></span> из <span class="totalPages"></span></div>',
  margin: {top: '14mm', bottom: '16mm', left: '14mm', right: '14mm'}});
await browser.close();
for (const fn of fs.readdirSync(OUT)) if (fn.startsWith('img_')) fs.rmSync(path.join(OUT, fn));
fs.rmSync(path.join(OUT, 'report.html'));
console.log('report/report.pdf', (fs.statSync(path.join(OUT, 'report.pdf')).size / 1048576).toFixed(1), 'MB');
