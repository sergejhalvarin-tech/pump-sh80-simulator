// Ш80-2,5 · the explorer film: the pump unit (pump.js, motor.js) on the pale studio (stage.js) under the overlay
// (console.js). The shafts turn at 980 rpm × playback (1/20: 294° a second on screen). The film opens on the whole
// unit with its АИР160S6 motor, comes in to the pump, and an operator turns the casing to glass, looks down the drive
// end (the motor fading out of the way), cuts the casing open, closes in on the mesh, loads the outlet past the valve's setting so the
// bypass opens, looks at the valve, lets the pressure back down, and takes the pump apart. A pure function of t.
import {runSim} from 'teardown-kit/runtime.js';
import {createConsole} from './console.js';
import {efficiency, flow, G, gapU, P_MAX, power, RATED, RPM_MAX, torque, travelU, valveOpen, Y_DRIVE, Y_DRIVEN, Y_PORT} from './kin.js';
import {EM, motorState} from './elec.js';
import {powerState} from './supply.js';
import {suctionBudget} from './pipes.js';
import {PLAN, VESSELS} from './transfer.js';
import {CORE, MOTOR, Z} from './motor.js';
import {VALVE_Y} from './pump.js';
import {createPumpStage} from './stage.js';

export const SCRIPT = [
  {t: 0, cam: 'open'},
  {t: 3.4, cam: 'hero'},
  {t: 5.8, cut: 'glass'},
  {t: 8.4, cam: 'front'},
  {t: 11.0, cut: 'section'},
  {t: 13.6, cam: 'rotors'},
  {t: 16.6, p: [0.25, 0.35, 1.6]},
  {t: 19.8, cam: 'valve'},
  {t: 22.8, p: [0.35, 0.25, 1.2]},
  {t: 24.8, cam: 'pipes'},
  {t: 29.0, cam: 'unit'},
  {t: 30.8, cam: 'motor'},
  {t: 35.6, cam: 'power'},
  {t: 39.4, cam: 'genset'},
  {t: 44.6, cam: 'site'},
  {t: 45.4, cut: 'glass'},
  {t: 50.0, cut: 'section'},
  {t: 54.4, cut: 'solid'},
  {t: 55.0, cam: 'unit'},
  {t: 56.4, explode: 1},
  {t: 59.8, explode: 0},
];
export const DURATION = 62.8;
// the transfer runs from the glass click, ×PLAN.accel; the drops in the hoses move at a steady, readable pace
export const TRANSFER_T0 = 45.4;
export const transferAt = (t) => Math.max(0, t - TRANSFER_T0) * PLAN.accel;
export const oilRunAt = (t) => Math.max(0, t - 44.6) * 700;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'sh80', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const mm = (v) => v * 0.001;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
export const PLAY = 20;
export const RPM = RATED.rpm;

// ------------------------------------------------------------ the scripted state
const P_EV = SCRIPT.filter((e) => e.p);
export const pAt = (t) => {
  let p = P_EV[0].p[0];
  for (const e of P_EV) if (t >= e.t) p = e.p[0] + (e.p[1] - e.p[0]) * ss(e.t, e.t + e.p[2], t);
  return p;
};
export const cutAt = (t) => SCRIPT.filter((e) => e.cut && e.t <= t).pop()?.cut ?? 'solid';
const EX_ON = SCRIPT.find((e) => e.explode === 1);
const EX_OFF = SCRIPT.find((e) => e.explode === 0);
export const explodeAt = (t) => ss(EX_ON.t, EX_ON.t + 2.4, t) * (1 - ss(EX_OFF.t, EX_OFF.t + 2.2, t));
export const explodeOn = (t) => t >= EX_ON.t && t < EX_OFF.t;

// the oil's travel in the ports and through the bypass, mm on screen, integrated once at load
const PORT_A = Math.PI * 0.05 * 0.05;
const BORE_A = Math.PI * 0.014 * 0.014;
export const portSpeed = (q) => ((q / 3600 / PORT_A) * 1000) / PLAY;
export const bypassSpeed = (q) => (((q / 3600 / BORE_A) * 1000) / PLAY) * 0.3;
const DT = 1 / 240;
const TAB = [];
{
  // the oil in the ports, through the bypass, and the supply's electrical angle (the line's 50 Hz slowed like the rest)
  let fs = 0;
  let bs = 0;
  let el = 0;
  let pw = 0;
  for (let t = 0; t <= DURATION + 1; t += DT) {
    TAB.push([fs, bs, el, pw]);
    const p = pAt(t + DT / 2);
    const fl = flow(RPM, p);
    fs += portSpeed(fl.net) * DT;
    bs += bypassSpeed(fl.bypass) * DT;
    const ms = motorState(RPM, power(RPM, p));
    el += (360 * ms.f * DT) / PLAY;
    pw += powerState(ms, power(RPM, p), 0, EM).speed * DT;
  }
}
const tab = (t, k) => {
  const u = Math.max(0, Math.min(TAB.length - 2, t / DT));
  const i = Math.floor(u);
  return TAB[i][k] + (TAB[i + 1][k] - TAB[i][k]) * (u - i);
};
export const phiAt = (t) => 20 + (((RPM / 60) * 360) / PLAY) * t;
// the generator set turns at 1500 rpm whatever the pump does: four poles, 50 Hz
export const genAngleAt = (t) => 35 + ((1500 / 60) * 360 * t) / PLAY;

// ------------------------------------------------------------ views, each a function of u (seconds since it came on)
export const VIEW_FN = {
  // the opening: round the whole unit, motor and all, settling where the unit view starts
  open: (u) => {
    const k = smoother(u / 3.4);
    return {tx: 0, ty: 0.13, tz: 0.36, az: 136 - 32 * k, el: 12 + 8 * k, d: 2.95 - 0.2 * k, sx: -40, sy: 0};
  },
  unit: (u) => ({tx: 0, ty: 0.13, tz: 0.36, az: 104 - 3 * u, el: 20, d: 2.75, sx: -40, sy: 0}),
  // the generator set from its +x side, where the section opens the canopy: radiator, engine, alternator, tank
  // the set on its trailer behind the pickup, from the side its section opens (−x: it is turned to face the truck)
  genset: (u) => ({tx: 0, ty: 0.09, tz: 3.45, az: -82 - 2.5 * u, el: 12 + 0.6 * u, d: 3.7, sx: -40, sy: 0}),
  // the pickup and its trailer side on, the way the brochure shows it
  site: (u) => ({tx: -3.2, ty: 0.4, tz: 0.6, az: 6 + 2 * u, el: 30, d: 44, sx: -20, sy: 0}),
  truck: (u) => ({tx: 0, ty: -0.25, tz: 0.15, az: 92 - 1.5 * u, el: 6 + 0.8 * u, d: 15.5, sx: -40, sy: 0}),
  // the suction side close up: the counter flange, the gauge, the filter
  pipes: (u) => ({tx: 0.36, ty: 0.22, tz: 0, az: 38 + 3 * u, el: 20, d: 1.85, sx: -40, sy: 0}),
  // the whole site: the set on its trailer, the cable to the converter by the motor, the unit
  power: (u) => ({tx: 0, ty: -0.3, tz: 0.4, az: 52 + 2.5 * u, el: 20, d: 13.5, sx: -40, sy: 0}),
  // the motor from the +x side, where its section opens: the stack, the end turns, the cage, the bearings, the fan
  motor: (u) => ({tx: 0, ty: 0.19, tz: 0.63, az: 100 - 2.5 * u, el: 10 + u, d: 2.0, sx: -40, sy: 6}),
  hero: (u) => ({tx: 0.005, ty: 0.18, tz: 0.03, az: 58 + 3.5 * u, el: 23, d: 1.62, sx: -40, sy: 6}),
  front: (u) => ({tx: 0, ty: 0.175, tz: 0, az: -5 + 2.5 * u, el: 7 + 0.8 * u, d: 1.5, sx: -40, sy: 6}),
  ports: (u) => ({tx: 0.02, ty: 0.18, tz: 0, az: 78 - 3 * u, el: 12, d: 1.6, sx: -40, sy: 6}),
  valve: (u) => ({tx: 0.035, ty: 0.3, tz: 0, az: 10 + 3 * u, el: 18, d: 0.9, sx: -30, sy: 30}),
  rotors: (u) => ({tx: 0.0, ty: 0.15, tz: 0.04, az: 12 + 3 * u, el: 9, d: 1.14, sx: -40, sy: 0}),
};
const VIEWS = SCRIPT.filter((e) => e.cam).map((e) => [e.t, e.cam]);
export const camAt = (t, list = VIEWS) => {
  let i = 0;
  while (i < list.length - 1 && list[i + 1][0] <= t) i++;
  const view = (k, tt) => VIEW_FN[list[k][1]](tt - list[k][0]);
  const o = view(i, t);
  if (i === 0) return o;
  const k = ss(list[i][0], list[i][0] + 1.6, t);
  if (k >= 1) return o;
  return blend(view(i - 1, t), o, k);
};
export function blend(a, b, k, backOff = true) {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  const swing = Math.min(1, Math.abs(((b.az - a.az + 540) % 360) - 180) / 90);
  if (backOff) o.d += Math.max(0, Math.max(a.d, b.d) + 0.4 * swing - o.d) * Math.sin(Math.PI * k);
  return o;
}
/** an exploded pump needs a wider frame: back off and slide the target toward the drive end */
export const widen = (c, ex) => ({...c, d: c.d * (1 + 0.3 * ex), tz: c.tz + 0.12 * ex, ty: c.ty + 0.01 * ex});
/** the views the motor would stand in front of: it fades out of them */
export const MOTOR_HIDE = new Set(['front', 'rotors', 'valve']);
/** the pickup, the generator set and the converter only show in the mobile views */
export const MOBILE = new Set(['power', 'genset', 'truck', 'site']);
export const supplyAt = (t, list = VIEWS, set = MOBILE) => {
  let i = 0;
  while (i < list.length - 1 && list[i + 1][0] <= t) i++;
  const m = (k) => (set.has(list[k][1]) ? 1 : 0);
  if (i === 0) return m(0);
  return m(i - 1) + (m(i) - m(i - 1)) * ss(list[i][0], list[i][0] + 1.2, t);
};
/** the transfer site (the tank, the tanker, the long hoses) only in its own view: elsewhere the tank stands where the
 *  closer cameras look from */
export const SITE = new Set(['site']);
export const siteAt = (t, list = VIEWS) => supplyAt(t, list, SITE);
export const motorAt = (t, list = VIEWS) => {
  let i = 0;
  while (i < list.length - 1 && list[i + 1][0] <= t) i++;
  const m = (k) => (MOTOR_HIDE.has(list[k][1]) ? 0 : 1);
  if (i === 0) return m(0);
  return m(i - 1) + (m(i) - m(i - 1)) * ss(list[i][0], list[i][0] + 0.9, t);
};
export const camName = (t) => {
  const v = VIEWS.filter(([t0]) => t0 <= t).pop()[1];
  return v === 'open' ? 'unit' : v;
};

// ------------------------------------------------------------ the operator's pointer
const REST = [[820, 470], [700, 420], [900, 520], [760, 380]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    if (e.p) return {t: e.t, spot: ui.pKnob(e.p[0] / P_MAX), to: ui.pKnob(e.p[1] / P_MAX), drag: e.p[2], p: e.p};
    if (e.cut) return {t: e.t, spot: ui.spots[e.cut], drag: 0};
    if ('explode' in e) return {t: e.t, spot: ui.spots.explode, drag: 0};
    return {t: e.t, spot: ui.spots[e.cam], drag: 0};
  });
  const WP = [[0, 980, 640]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot]);
    if (e.drag) {
      for (let k = 0; k <= 12; k++) {
        const tt = e.t + (k / 12) * e.drag;
        WP.push([tt + 0.02, ...ui.pKnob(pAt(tt) / P_MAX)]);
      }
      WP.push([e.t + e.drag + 0.3, ...e.to]);
    } else WP.push([e.t + 0.24, ...e.spot]);
    WP.push([e.t + e.drag + 1.4, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const lin = t1 - t0 < 0.2;
    const k = lin ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = lin ? 0 : Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + Math.max(0.09, e.drag + 0.1)) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the overlay's data for a frame
export function makeConsoleFrame(ui, st) {
  const P = (x, y, z) => st.project(mm(x), mm(y), mm(z));
  // live: the page's own state (overlays, cut, playback, pause); absent in the film
  // dir: 1, or −1 with the shafts turning backwards (the live page's reverse; the film always runs forward)
  return (t, {phi, cam, rpm, p, cursor, since, ex, live, dir = 1, elec = 0, genAngle = 0, transferS = 0}) => {
    const ov = live ? live.overlays : {callouts: 1, charts: 1};
    const vis = ss(1.1, 1.8, since) * (ov.callouts ? 1 : 0) * (1 - Math.min(1, ex * 6));
    const callouts = [];
    if (cam === 'unit') {
      callouts.push(
        {name: 'Электродвигатель АИР160S6', sub: '11 КВТ · 970 ОБ/МИН · IP55', at: P(0, Y_DRIVE + MOTOR.h31 - MOTOR.h, Z.shoulder + 250), label: [430, 200], w: 190, o: vis},
        {name: 'Муфта со звёздочкой', sub: 'ЗВЁЗДОЧКА 100 — В ЗИП НАСОСА', at: P(70, Y_DRIVE + 60, 264), label: [1040, 600], w: 170, o: vis},
        {name: 'Насос Ш80-2,5', sub: '37,5 М³/Ч · 0,25 МПА', at: P(-40, VALVE_Y + 40, 0), label: [1060, 210], w: 140, o: vis},
        {name: 'Рама агрегата', sub: 'НАСОС И ДВИГАТЕЛЬ НА ОБЩЕЙ ПЛИТЕ', at: P(150, -40, 640), label: [560, 722], w: 190, o: vis},
      );
    }
    if (cam === 'motor') {
      callouts.push(
        {name: 'Обмотка статора', sub: '54 ПАЗА · 3 ФАЗЫ · ТРЕУГОЛЬНИК', at: P(-20, Y_DRIVE + 108, CORE.z1 + 30), label: [905, 150], w: 190, o: vis},
        {name: 'Ротор «беличья клетка»', sub: '44 СТЕРЖНЯ · ЗАМКНУТЫ КОЛЬЦАМИ', at: P(-10, Y_DRIVE - 70, CORE.zm), label: [560, 712], w: 190, o: vis},
        {name: 'Клеммная коробка', sub: '380 В · ПЕРЕМЫЧКИ «ТРЕУГОЛЬНИК»', at: P(-20, Y_DRIVE + 190, Z.shoulder + 250), label: [430, 190], w: 190, o: vis},
        {name: 'Вентилятор', sub: 'НА ВАЛУ · ОБДУВ РЁБЕР', at: P(-20, Y_DRIVE + 110, 850), label: [1080, 330], w: 140, o: vis},
      );
    }
    if (cam === 'site') {
      const A = st.pump.site.at;
      const tr = st.pump.site.plan.state(transferS);
      const tr0 = st.pump.site.plan.state(0);
      const fx = (x, n) => x.toFixed(n).replace('.', ',');
      const Pm = (q) => P(q.x, q.y, q.z);
      callouts.push(
        {name: `Резервуар · ${fx(tr.vRes, 1)} м³ ${tr.running ? '▼' : ''}`, sub: `УРОВЕНЬ ${fx(tr.resLevel / 1000, 2)} М · БЫЛО ${fx(tr0.resLevel / 1000, 2)} М`, at: Pm(A.res), label: [1060, 150], w: 210, o: vis},
        {name: `КАМАЗ · ${fx(tr.vols[0], 2)} м³ ${tr.cur === 0 && tr.running ? '▲' : tr.vols[0] > 7.59 ? '✓' : ''}`, sub: `${Math.round((tr.vols[0] / 8) * 100)} % ЦИСТЕРНЫ 8 М³ · ${fx((tr.vols[0] * 885) / 1000, 2)} Т`, at: Pm(A.kam), label: [430, 190], w: 190, o: vis},
        ...(tr.cur > 0 ? [{name: `${VESSELS[tr.cur].name} · ${fx(tr.vols[tr.cur], 1)} м³ ${tr.running ? '▲' : ''}`, sub: tr.running ? `${Math.round((tr.vols[tr.cur] / 20) * 100)} % ЦИСТЕРНЫ 20 М³ · ${fx((tr.vols[tr.cur] * 885) / 1000, 1)} Т` : 'ПЕРЕСТАНОВКА РУКАВА', at: Pm(A.sc[tr.cur - 1]), label: [640, 130], w: 200, o: vis}] : []),
        {name: 'Рукав всасывания', sub: 'ОТ ПАТРУБКА РЕЗЕРВУАРА К ФИЛЬТРУ', at: Pm(A.hoseS), label: [905, 640], w: 190, o: vis},
        {name: 'Рукав нагнетания', sub: 'ОТ НАСОСА В ЛЮК ЦИСТЕРНЫ', at: Pm(A.hoseD), label: [430, 640], w: 170, o: vis},
      );
    }
    if (cam === 'pipes') {
      const A = st.pump.piping.at;
      const Pm = (v) => P(v.x, v.y, v.z);
      callouts.push(
        {name: 'Фильтр YS-316 DN80', sub: 'СЕТКА 0,25 ММ · КРЫШКОЙ ВНИЗ', at: Pm(A.filter), label: [905, 150], w: 170, o: vis},
        {name: 'Ответный фланец', sub: 'Ø190 · 8 × M14 · НИППЕЛЬ ПОД 75', at: Pm(A.flangeIn), label: [430, 640], w: 180, o: vis},
        {name: 'Мановакуумметр', sub: 'ВАКУУМ НА ВХОДЕ НАСОСА', at: Pm(A.gaugeIn), label: [500, 190], w: 150, o: vis},
      );
    }
    if (cam === 'truck') {
      const S = st.pump.supply.at;
      const Tr = st.pump.truck.at;
      const Pm = (v) => P(v.x, v.y, v.z);
      callouts.push(
        {name: 'Ford F-150 Raptor R', sub: '5,2 V8 · 720 Л.С. · 4×4 · ГРУЗ ДО ≈ 480 КГ', at: Pm(Tr.cab), label: [430, 190], w: 190, o: vis},
        {name: 'Агрегат в кузове', sub: '≈ 360 КГ С ПЧ И РУКАВАМИ', at: Pm(Tr.bed), label: [700, 150], w: 160, o: vis},
        {name: 'Фаркоп', sub: 'ПРИЦЕП ДО 3720 КГ С ТОРМОЗАМИ', at: Pm(Tr.hitch), label: [905, 640], w: 190, o: vis},
        {name: 'ДГУ на прицепе', sub: '≈ 1175 КГ ВМЕСТЕ С ПРИЦЕПОМ', at: Pm(S.gen), label: [1040, 190], w: 170, o: vis},
      );
    }
    if (cam === 'genset') {
      const S = st.pump.supply.at;
      const Pm = (v) => P(v.x, v.y, v.z);
      callouts.push(
        {name: 'Дизель TDY 27 4L', sub: '4 ЦИЛИНДРА · ПОРЯДОК 1-3-4-2', at: Pm(S.core), label: [430, 190], w: 170, o: vis},
        {name: 'Генератор TSS-SA-20', sub: '4 ПОЛЮСА · БЕЗ ЩЁТОК · AVR', at: Pm(S.alt), label: [905, 150], w: 170, o: vis},
        {name: 'Радиатор и вентилятор', sub: 'ОТВОДИТ ТЕПЛО ДВИГАТЕЛЯ', at: Pm(S.rad), label: [430, 640], w: 170, o: vis},
        {name: 'Топливный бак 80 л', sub: 'В ОСНОВАНИИ КОЖУХА', at: Pm(S.tank), label: [1040, 640], w: 150, o: vis},
      );
    }
    if (cam === 'power') {
      const S = st.pump.supply.at;
      const Pm = (v) => P(v.x, v.y, v.z);
      callouts.push(
        {name: 'ДГУ ТСС АД-20С-Т400-1РКМ5', sub: '20 КВТ · 3 × 400 В · НА ПРИЦЕПЕ', at: Pm(S.gen), label: [430, 190], w: 200, o: vis},
        {name: 'ПЧ INVT GD20-011G-4', sub: '11 КВТ · ПЛАВНЫЙ ПУСК · QF1 40 А', at: Pm(S.drive), label: [905, 150], w: 170, o: vis},
        {name: 'Кабель питания', sub: 'КГ 4 × 6 ММ² · ОТ ДГУ К ПЧ', at: Pm(S.cable), label: [560, 712], w: 170, o: vis},
        {name: 'Агрегат Ш80-2,5', sub: 'НАСОС + АИР160S6', at: P(0, 420, 300), label: [1060, 330], w: 150, o: vis},
      );
    }
    if (cam === 'hero' || cam === 'ports') {
      callouts.push(
        {name: 'Предохранительный клапан', sub: 'ПОЛНЫЙ ПЕРЕПУСК ПРИ 0,4 МПА', at: P(60, VALVE_Y + 30, 0), label: [905, 118], w: 170, o: vis},
        {name: 'Всасывающий патрубок', sub: 'Ø100 · ФЛАНЕЦ Ø190, 8 × M14', at: P(140, Y_PORT + 70, 0), label: [1085, 262], w: 158, o: vis},
        {name: 'Ведущий вал Ø35', sub: 'ВРАЩЕНИЕ ПРОТИВ ЧАСОВОЙ', at: P(0, Y_DRIVE + 18, 236), label: [430, 640], w: 150, o: vis},
        {name: 'Торцовое уплотнение', sub: 'В ПЕРЕДНЕЙ КРЫШКЕ', at: P(-30, Y_DRIVE + 20, 150), label: [370, 236], w: 140, o: vis},
      );
    }
    if (cam === 'front' || cam === 'rotors') {
      callouts.push(
        {name: 'Ведущий ротор', sub: 'ШЕВРОННЫЙ ЗУБ · z 16 · m 6', at: P(28, Y_DRIVE + G.ra - 4, 92), label: [905, 150], w: 150, o: vis},
        {name: 'Ведомый ротор', sub: 'ОДНА ПОЛУШЕСТЕРНЯ ПЛАВАЮЩАЯ', at: P(-30, Y_DRIVEN - G.ra + 6, 92), label: [420, 640], w: 168, o: vis},
      );
    }
    if (cam === 'valve') {
      callouts.push(
        {name: 'Клапан', sub: 'ПОДНИМАЕТСЯ ДАВЛЕНИЕМ', at: P(-44, VALVE_Y + 20, 0), label: [470, 190], w: 128, o: vis},
        {name: 'Пружина клапана', sub: 'ДЕРЖИТ ЕГО НА СЕДЛЕ', at: P(40, VALVE_Y + 18, 0), label: [905, 150], w: 130, o: vis},
        {name: 'Регулировочный винт', sub: 'ПОД КОЛПАЧКОМ И ПЛОМБОЙ', at: P(190, VALVE_Y + 10, 0), label: [1060, 330], w: 150, o: vis},
      );
    }
    // leaders from the panels into the pump: the flow to the discharge flange, the tracked space to its pocket
    // the motor view has its own panels: no leaders from the pump's
    const lead = (ov.callouts ? 1 : 0) * (1 - Math.min(1, ex * 6)) * (['motor', 'power', 'genset', 'truck', 'pipes', 'site'].includes(cam) ? 0 : 1);
    const u = travelU(1, 0, phi, dir);
    const th = (gapU(1, 0, phi) - 90) * D2R;
    const r = (G.rf + G.ra) / 2;
    callouts.push({name: '', sub: '', at: P(-140, Y_PORT + 40, 0), label: [282, 152], w: 0, o: lead * 0.9});
    callouts.push({name: '', sub: '', at: P(r * Math.cos(th), Y_DRIVE + r * Math.sin(th), G.b / 2), label: [1318 - 0.01, 124], w: 0, o: 0.9 * lead});
    const flows = flow(rpm, p, dir);
    const N = power(rpm, p);
    ui.update({
      mode: ['motor', 'power', 'genset', 'truck', 'pipes', 'site'].includes(cam) ? cam : 'pump',
      tr: st.pump.site.plan.state(transferS),
      genAngle,
      ms: motorState(rpm, N),
      pw: powerState(motorState(rpm, N), N, (p * 1e6 * (flows.net / 3600)) / 1000, EM),
      elec,
      flows,
      dir,
      reverse: live ? live.reverse : false,
      rpm,
      rpmK: rpm / RPM_MAX,
      p,
      playText: live ? live.playText : '1 / 20',
      playK: live ? live.playK : 0.33,
      paused: live ? live.paused : false,
      phi,
      u,
      open: valveOpen(p, dir),
      N,
      T: torque(rpm, p),
      eta: efficiency(rpm, p, dir),
      cam,
      cut: live ? live.cut : cutAt(t),
      overlays: live ? live.overlays : {callouts: 1, flow: 1, arrows: 1, isolate: 0, explode: explodeOn(t) ? 1 : 0, charts: 1},
      callouts,
      cursor,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createPumpStage({canvas});
    window.TRUCK_MODEL = await st.pump.truck.loadModel();
    window.SITE_MODEL = await st.pump.site.load();
    window.SITE_PLAN = {T: st.pump.site.plan.T, end: st.pump.site.plan.state(1e9), start: st.pump.site.plan.state(0)};
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'), (sec) => st.pump.site.plan.state(sec));
    const cursorAt = makeCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.PUMP = st;
    return {
      resize,
      render(t) {
        const phi = phiAt(t);
        const cam = camName(t);
        let p = pAt(t);
        const ex = explodeAt(t);
        const c = widen(camAt(t), ex);
        const t0 = VIEWS.filter(([a]) => a <= t).pop()[0];
        // in the site view the pump works against the hoses, not the slider: the line's own pressures
        const trS = transferAt(t);
        const tr = st.pump.site.plan.state(trS);
        const siteOn = cam === 'site';
        if (siteOn) p = tr.pOut;
        const ms = motorState(RPM, power(RPM, p));
        const elec = tab(t, 2);
        st.frame(phi, {...c, az: c.az * D2R, el: c.el * D2R}, {cut: cutAt(t), p, open: valveOpen(p), flowS: tab(t, 0), bypassS: tab(t, 1), explode: ex, motor: motorAt(t), elec, cosPhi: ms.cos, load: ms.k, power: tab(t, 3), supply: supplyAt(t), site: siteAt(t), pv: siteOn ? tr.pIn : suctionBudget(flow(RPM, p).th - flow(RPM, p).leak).pv, transferS: trS, oilRun: oilRunAt(t), genAngle: genAngleAt(t), genLoad: powerState(ms, power(RPM, p), 0, EM).load});
        frame(t, {phi, cam, rpm: RPM, p, cursor: cursorAt(t), since: t - t0, ex, elec, genAngle: genAngleAt(t), transferS: trS});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
