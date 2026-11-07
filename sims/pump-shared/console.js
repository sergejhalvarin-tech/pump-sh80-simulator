// The pump explorer's overlay: title and the delivered flow top left, the mesh seen from the drive end and the Q–p
// characteristic on the left, the transport bottom left (pause, ±15°, speed, outlet pressure, slow motion), the oil
// legend top centre, the tracked tooth space, its pressure over a turn and the drive and valve readouts on the right,
// camera / cut / layer toggles bottom right, the tracked space's phase strip bottom centre, and callouts with thin
// leaders into the pump. Fixed 1600 x 900 CSS layout; update(s) redraws every live part from the frame's state.
import {EM, M_N, PHASE_COL, PHASE_NAME, S_K, SLOT, torqueAt} from './elec.js';
import {MOTOR} from './motor.js';
import {GENSET, VFD} from './supply.js';
import {ALT, cylPsi, ENGINE, strokeOf} from './genset.js';
import {LOAD, T9, TRAILER} from './truck.js';
import {FILTER, HOSE, suctionBudget} from './pipes.js';
import {OIL, PLAN, VESSELS} from './transfer.js';
import {OIL_COL} from './site.js';
import {DA, fillOf, flow, G, gapPressure, keyOf, P_MAX, PHASES, phaseOf, Q_REV_CM3, RATED, SEAL, travelU} from './kin.js';

export const C = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(248,248,249,.94)', red: '#d6182b', blue: '#3d8fe0', orange: '#f05a23', amber: '#f2a516'};
export const CAMS = ['hero', 'front', 'ports', 'valve', 'rotors', 'unit', 'motor', 'power', 'genset', 'truck', 'pipes', 'site'];
export const CUTS = ['solid', 'glass', 'section'];
export const OVERLAYS = ['callouts', 'flow', 'arrows', 'isolate', 'explode', 'charts'];
const LABEL = {site: 'ПЛОЩАДКА', pipes: 'ТРУБЫ', truck: 'ПИКАП', genset: 'ДГУ', power: 'ПИТАНИЕ', motor: 'МОТОР', unit: 'АГРЕГАТ', hero: 'ОБЩИЙ', front: 'ТОРЕЦ', ports: 'ПОРТЫ', valve: 'КЛАПАН', rotors: 'РОТОРЫ', solid: 'КОРПУС', glass: 'СТЕКЛО', section: 'СЕЧЕНИЕ', callouts: 'ПОДПИСИ', flow: 'МАСЛО', arrows: 'СТРЕЛКИ', isolate: 'ИЗОЛЯЦИЯ', explode: 'РАЗБОРКА', charts: 'ГРАФИКИ'};
export const Q_MAX = 45;
const FONT = `Inter,'Segoe UI',system-ui,sans-serif`;
const CSS = `
#app{font-family:${FONT};color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.3px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:19px;padding:0 6px;display:flex;align-items:center;justify-content:center;font-size:8.8px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600;letter-spacing:.1px}
.call span{display:block;font-size:8.6px;font-weight:500;letter-spacing:1.2px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.red};opacity:0;z-index:49}
.row{position:absolute;left:1329px;width:224px;display:flex;justify-content:space-between;align-items:baseline;font-size:10.5px}
.row b{font-size:12.5px;font-weight:700}
.off{display:none!important}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const f1 = (v) => v.toFixed(1).replace('.', ',');
const f2 = (v) => v.toFixed(2).replace('.', ',');
const mod = (a, m) => ((a % m) + m) % m;
const mix = (a, b, k) => {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
};

export function createConsole(app, siteState = () => ({})) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  // every node belongs to the pump's overlay, the motor's, or both (tag ''): the motor view swaps one set for the other
  let tag = 'pump';
  const add = (h) => {
    const n = el(h);
    if (tag) n.dataset.m = tag;
    ui.appendChild(n);
    return n;
  };

  // ------------------------------------------------------------ title and the delivered flow
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">Ш80-2,5 <span style="color:${C.red}">·</span> Шестерённый насос</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.4px;font-size:9.2px">ДВА ШЕВРОННЫХ РОТОРА &nbsp;•&nbsp; m 6 · z 16 &nbsp;•&nbsp; ${Math.round(Q_REV_CM3)} СМ³/ОБ</div>`);
  const qBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  add(`<div style="position:absolute;left:265px;top:141px;font-size:11px;font-weight:500">${Q_MAX}</div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  const qRated = add(`<div style="position:absolute;left:${35 + (RATED.q / Q_MAX) * 247}px;top:170px;width:1px;height:17px;background:${C.ink}"></div>`);
  void qRated;
  const qFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - (35 + (RATED.q / Q_MAX) * 247) + 4}px;top:155px;font-size:8.4px;font-weight:500">ПАСПОРТ 37,5</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">М³/Ч</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500">Подача в систему</div>`);

  // ------------------------------------------------------------ the mesh from the drive end
  add(`<div class="pn" style="left:35px;top:274px;width:247px;height:208px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:286px;font-weight:700">ЗАЦЕПЛЕНИЕ</div>`);
  const meshAng = add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:286px;font-weight:500"></div>`);
  const mesh = add(`<svg style="position:absolute;left:46px;top:303px" width="226" height="132"></svg>`);
  add(`<div style="position:absolute;left:46px;top:440px;width:226px;height:1px;background:${C.line}"></div>`);
  add(`<div style="position:absolute;left:46px;top:447px;font-size:9.5px;color:${C.mute};font-family:'JetBrains Mono',monospace">q = 2π·m²·b·(z + 1 − π²cos²α / 12)</div>`);
  add(`<div style="position:absolute;left:46px;top:461px;font-size:9.5px;color:${C.mute}">m <b style="color:${C.ink}">6</b> · z <b style="color:${C.ink}">16</b> · b <b style="color:${C.ink}">180</b> мм &nbsp;→&nbsp; <b style="color:${C.ink}">${Math.round(Q_REV_CM3)}</b> см³ за оборот</div>`);

  // ------------------------------------------------------------ the Q–p characteristic
  add(`<div class="pn" style="left:35px;top:490px;width:247px;height:192px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:502px;font-weight:700">ХАРАКТЕРИСТИКА Q–p</div>`);
  const qpRpm = add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:502px;font-weight:500"></div>`);
  const qp = add(`<svg style="position:absolute;left:44px;top:518px" width="230" height="134"></svg>`);
  add(`<div style="position:absolute;left:46px;top:654px;width:226px;height:1px;background:${C.line}"></div>`);
  add(`<div style="position:absolute;left:46px;top:661px;font-size:9.5px;color:${C.mute}">Клапан: открытие <b style="color:${C.ink}">0,28</b> · полный перепуск <b style="color:${C.ink}">0,40</b> МПа</div>`);

  // ------------------------------------------------------------ transport
  tag = '';
  add(`<div class="pn" style="left:35px;top:740px;width:259px;height:145px"></div>`);
  const btn = {};
  btn.pause = add(`<div class="tb" style="left:45px;top:748px;width:78px;height:26px;background:${C.red};color:#fff;border-color:${C.red};font-size:9.4px">❚❚ &nbsp;ПАУЗА</div>`);
  btn.back = add(`<div class="tb" style="left:127px;top:748px;width:48px;height:26px;font-size:9.6px">−15°</div>`);
  btn.fwd = add(`<div class="tb" style="left:179px;top:748px;width:48px;height:26px;font-size:9.6px">+15°</div>`);
  btn.reverse = add(`<div class="tb" style="left:231px;top:748px;width:54px;height:26px;font-size:9.2px">⇄ РЕВЕРС</div>`);
  const SL = {x: 46, w: 238};
  const slider = (title, y) => {
    add(`<div class="cp" style="position:absolute;left:45px;top:${y}px;font-weight:500">${title}</div>`);
    const val = add(`<div class="cp" style="position:absolute;right:${1600 - 284}px;top:${y}px;font-weight:700"></div>`);
    add(`<div style="position:absolute;left:${SL.x}px;top:${y + 18}px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
    const knob = add(`<div style="position:absolute;top:${y + 13}px;width:9px;height:11px;margin-left:-4.5px;background:${C.red}"></div>`);
    return {val, knob, y: y + 18};
  };
  const sRpm = slider('ЧАСТОТА ВРАЩЕНИЯ', 784);
  const sP = slider('ДАВЛЕНИЕ НА ВЫХОДЕ', 817);
  const sPlay = slider('ЗАМЕДЛЕНИЕ', 850);

  // ------------------------------------------------------------ legend
  tag = 'pump';
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:36px;display:flex;justify-content:center;gap:18px;font-weight:500;font-size:9.4px">
    ${[['ВСАСЫВАНИЕ', C.blue], ['НАГНЕТАНИЕ', C.orange], ['ПЕРЕПУСК ЧЕРЕЗ КЛАПАН', C.amber]].map(([n, c]) => `<span><i style="display:inline-block;width:15px;height:2.4px;background:${c};vertical-align:middle;margin-right:6px"></i>${n}</span>`).join('')}</div>`);

  // ------------------------------------------------------------ the reverse warning, under the tour chip
  tag = '';
  const warn = add(`<div style="position:absolute;left:800px;top:90px;transform:translateX(-50%);display:none;padding:7px 14px 8px;background:${C.red};color:#fff;text-align:center;white-space:nowrap;box-shadow:0 2px 8px rgba(214,24,43,.25)"></div>`);

  // ------------------------------------------------------------ the tracked tooth space
  tag = 'pump';
  add(`<div class="pn" style="left:1318px;top:36px;width:245px;height:209px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1329px;top:47px;font-weight:500">ВПАДИНА <b style="color:${C.red}">1</b></div>`);
  const gapAng = add(`<div class="cp mu" style="position:absolute;right:${1600 - 1552}px;top:47px;font-weight:500"></div>`);
  const phaseBig = add(`<div style="position:absolute;left:1329px;top:61px;font-size:24px;font-weight:700"></div>`);
  const phaseList = add(`<div style="position:absolute;left:1329px;top:97px"></div>`);
  add(`<div style="position:absolute;left:1329px;top:165px;width:224px;height:1px;background:${C.line}"></div>`);
  const pBig = add(`<div style="position:absolute;left:1328px;top:173px;font-size:36px;font-weight:800;letter-spacing:-1.6px;color:${C.red};line-height:1"></div>`);
  const pUnit = add(`<div style="position:absolute;top:197px;font-size:10.5px;font-weight:500;letter-spacing:1px;line-height:1.35">МПА<br><span style="color:${C.mute};letter-spacing:1.2px">ВО ВПАДИНЕ</span></div>`);
  add(`<div style="position:absolute;left:1329px;top:228px;width:224px;height:5px;background:#e6e7e9"></div>`);
  const pFill = add(`<div style="position:absolute;left:1329px;top:228px;height:5px;background:${C.red}"></div>`);

  // ------------------------------------------------------------ pressure over a turn
  add(`<div class="pn" data-g="charts" style="left:1318px;top:252px;width:245px;height:184px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:263px;font-weight:700">ВПАДИНА ЗА ОБОРОТ</div>`);
  const turnLeg = add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:280px;font-weight:500;font-size:9px"></div>`);
  const turn = add(`<svg data-g="charts" style="position:absolute;left:1326px;top:296px" width="232" height="135"></svg>`);

  // ------------------------------------------------------------ drive and valve
  add(`<div class="pn" data-g="charts" style="left:1318px;top:443px;width:245px;height:214px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:455px;font-weight:700">ПРИВОД</div>`);
  add(`<div class="cp mu" data-g="charts" style="position:absolute;left:1329px;top:470px;font-weight:500;font-size:8.8px">${MOTOR.name} · ${MOTOR.kw} КВТ · ${MOTOR.rpm} ОБ/МИН</div>`);
  const valveState = add(`<div class="cp" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:455px;font-weight:700"></div>`);
  const rows = ['Мощность на валу', 'Загрузка двигателя', 'Ток двигателя, 380 В', 'Крутящий момент', 'КПД насоса', 'Теоретическая подача', 'Утечки в зазорах', 'Перепуск через клапан'].map((n, i) => {
    const r = add(`<div class="row" data-g="charts" style="top:${490 + i * 20}px"><span class="mu">${n}</span><span></span></div>`);
    return r.lastElementChild;
  });

  // ------------------------------------------------------------ camera, cut, layers
  tag = '';
  add(`<div class="pn" style="left:1296px;top:684px;width:268px;height:201px"></div>`);
  const group = (title, keys, y) => {
    add(`<div class="cp mu" style="position:absolute;left:1305px;top:${y}px;font-weight:500">${title}</div>`);
    let x = 1305;
    let yy = y + 15;
    keys.forEach((k) => {
      const w = Math.round(LABEL[k].length * 6.9 + 14);
      if (x + w > 1556) {
        x = 1305;
        yy += 23;
      }
      btn[k] = add(`<div class="tb" style="left:${x}px;top:${yy}px;width:${w}px">${LABEL[k]}</div>`);
      x += w + 4;
    });
  };
  group('КАМЕРА', CAMS, 690);
  group('РАЗРЕЗ', CUTS, 781);
  group('СЛОИ', OVERLAYS, 824);

  // ------------------------------------------------------------ the tracked space's phase strip
  tag = 'pump';
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">ПУТЬ ВПАДИНЫ 1</span> &nbsp;— &nbsp;ОДИН ОБОРОТ ВЕДУЩЕГО ВАЛА</div>`);
  const strip = add(`<svg style="position:absolute;left:520px;top:812px" width="560" height="40"></svg>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:855px;text-align:center;font-weight:500">МАСЛО ИДЁТ ВО ВПАДИНАХ ПО КРАЮ КОРПУСА, А НЕ ЧЕРЕЗ ЗАЦЕПЛЕНИЕ</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">ТЯНИ — ПОВОРОТ &nbsp;·&nbsp; КОЛЕСО — МАСШТАБ &nbsp;·&nbsp; H — СКРЫТЬ ПАНЕЛИ</div>`);

  // ------------------------------------------------------------ the motor's overlay: title, line current, field, torque, supply, phases, power
  tag = 'motor';
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">${MOTOR.name} <span style="color:${C.red}">·</span> Асинхронный двигатель</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.4px;font-size:9.2px">3~ 380 В 50 ГЦ &nbsp;•&nbsp; ${EM.pn} КВТ &nbsp;•&nbsp; 2p = ${2 * EM.p} &nbsp;•&nbsp; КОРОТКОЗАМКНУТЫЙ РОТОР</div>`);
  const iBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  const I_MAX = 30;
  add(`<div style="position:absolute;left:265px;top:141px;font-size:11px;font-weight:500">${I_MAX}</div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  add(`<div style="position:absolute;left:${35 + (EM.iN / I_MAX) * 247}px;top:170px;width:1px;height:17px;background:${C.ink}"></div>`);
  const iFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - (35 + (EM.iN / I_MAX) * 247) + 4}px;top:155px;font-size:8.4px;font-weight:500">НОМИНАЛ 24,6</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">А</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500">Ток в линии, 380 В</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:36px;display:flex;justify-content:center;gap:16px;font-weight:500;font-size:9.4px">
    ${[...PHASE_NAME.map((n, i) => [`ФАЗА ${n}`, PHASE_COL[i]]), ['N', '#ff5c33'], ['S', '#3385ff'], ['ТОК В РОТОРЕ', '#ffb21e']].map(([n, c]) => `<span><i style="display:inline-block;width:15px;height:2.4px;background:${c};vertical-align:middle;margin-right:6px"></i>${n}</span>`).join('')}</div>`);
  // the field across the bore, seen from the drive end
  add(`<div class="pn" style="left:35px;top:274px;width:247px;height:208px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:286px;font-weight:700">ПОЛЕ В ЗАЗОРЕ</div>`);
  const fieldRpm = add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:286px;font-weight:500"></div>`);
  const fieldSvg = add(`<svg style="position:absolute;left:46px;top:301px" width="226" height="136"></svg>`);
  add(`<div style="position:absolute;left:46px;top:440px;width:226px;height:1px;background:${C.line}"></div>`);
  add(`<div style="position:absolute;left:46px;top:447px;font-size:9.5px;color:${C.mute};font-family:'JetBrains Mono',monospace">n₁ = 60·f / p &nbsp;·&nbsp; s = (n₁ − n) / n₁</div>`);
  const fieldFoot = add(`<div style="position:absolute;left:46px;top:461px;font-size:9.5px;color:${C.mute}"></div>`);
  // the torque against speed
  add(`<div class="pn" style="left:35px;top:490px;width:247px;height:192px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:502px;font-weight:700">МЕХАНИЧЕСКАЯ ХАРАКТЕРИСТИКА</div>`);
  const tq = add(`<svg style="position:absolute;left:44px;top:518px" width="230" height="134"></svg>`);
  add(`<div style="position:absolute;left:46px;top:654px;width:226px;height:1px;background:${C.line}"></div>`);
  const tqFoot = add(`<div style="position:absolute;left:46px;top:661px;font-size:9.5px;color:${C.mute}"></div>`);
  // the supply
  add(`<div class="pn" data-g="charts" style="left:1318px;top:36px;width:245px;height:209px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:47px;font-weight:700">ПИТАНИЕ</div>`);
  const supplyTag = add(`<div class="cp" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:47px;font-weight:700"></div>`);
  const supply = ['Род тока', 'Напряжение сети', 'Частота', 'Схема обмотки', 'Ток в фазе обмотки', 'Коэффициент мощности', 'Пусковой ток'].map((n, i) => {
    const r = add(`<div class="row" data-g="charts" style="top:${68 + i * 24}px"><span class="mu">${n}</span><span></span></div>`);
    return r.lastElementChild;
  });
  // the three phase currents over two periods
  add(`<div class="pn" data-g="charts" style="left:1318px;top:252px;width:245px;height:184px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:263px;font-weight:700">ТОКИ ФАЗ</div>`);
  add(`<div class="cp mu" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:263px;font-weight:500">МГНОВЕННЫЕ, А</div>`);
  const waveLeg = add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:280px;font-weight:500;font-size:9px"></div>`);
  const wave = add(`<svg data-g="charts" style="position:absolute;left:1326px;top:296px" width="232" height="135"></svg>`);
  // where the power goes
  add(`<div class="pn" data-g="charts" style="left:1318px;top:443px;width:245px;height:214px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:455px;font-weight:700">БАЛАНС МОЩНОСТИ</div>`);
  const etaTag = add(`<div class="cp" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:455px;font-weight:700"></div>`);
  const pBar = add(`<svg data-g="charts" style="position:absolute;left:1329px;top:472px" width="224" height="14"></svg>`);
  const LOSS = [['P1 из сети', C.ink], ['Медь статора', '#d6182b'], ['Сталь статора', '#8b8f95'], ['Стержни ротора', '#ffb21e'], ['Подшипники, вентилятор', '#5d6670'], ['Добавочные', '#c9ccd0'], ['P2 на валу → насос', '#3d8fe0']];
  const balance = LOSS.map(([n, c], i) => {
    const r = add(`<div class="row" data-g="charts" style="top:${494 + i * 22}px"><span class="mu"><i style="display:inline-block;width:8px;height:8px;background:${c};margin-right:6px;vertical-align:-1px"></i>${n}</span><span></span></div>`);
    return r.lastElementChild;
  });
  // the field against the rotor, bottom centre
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">ПОЛЕ И РОТОР</span> &nbsp;— &nbsp;РОТОР ВСЕГДА ОТСТАЁТ ОТ ПОЛЯ</div>`);
  const slipLine = add(`<div style="position:absolute;left:0;right:0;top:814px;text-align:center;font-size:14px;font-weight:600"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:855px;text-align:center;font-weight:500">ПОЛЕ ОБГОНЯЕТ СТЕРЖНИ И НАВОДИТ В НИХ ТОК · ТОК В ПОЛЕ ДАЁТ МОМЕНТ</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">ТЯНИ — ПОВОРОТ &nbsp;·&nbsp; КОЛЕСО — МАСШТАБ &nbsp;·&nbsp; H — СКРЫТЬ ПАНЕЛИ</div>`);
  // ------------------------------------------------------------ the supply's overlay: off-grid from a generator set through a converter
  tag = 'power';
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">Питание от ДГУ <span style="color:${C.red}">·</span> без сети</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.4px;font-size:9.2px">ДГУ 3~ 400 В &nbsp;→&nbsp; QF1 40 А &nbsp;→&nbsp; ПЧ &nbsp;→&nbsp; ДВИГАТЕЛЬ Δ 380 В</div>`);
  const gBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  add(`<div style="position:absolute;left:265px;top:141px;font-size:11px;font-weight:500">100</div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  add(`<div style="position:absolute;left:${35 + 0.8 * 247}px;top:170px;width:1px;height:17px;background:${C.ink}"></div>`);
  const gFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - (35 + 0.8 * 247) + 4}px;top:155px;font-size:8.4px;font-weight:500">ДЛИТЕЛЬНО ДО 80</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">%</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500">Загрузка генератора</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:36px;display:flex;justify-content:center;gap:16px;font-weight:500;font-size:9.4px">
    ${[['ЭНЕРГИЯ В КАБЕЛЯХ', '#ffb21e'], ['ВСАСЫВАНИЕ', C.blue], ['НАГНЕТАНИЕ', C.orange]].map(([n, c]) => `<span><i style="display:inline-block;width:15px;height:2.4px;background:${c};vertical-align:middle;margin-right:6px"></i>${n}</span>`).join('')}</div>`);
  // the single-line diagram
  add(`<div class="pn" style="left:35px;top:274px;width:247px;height:208px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:286px;font-weight:700">СХЕМА ПИТАНИЯ</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:286px;font-weight:500">ОДНОЛИНЕЙНАЯ</div>`);
  const sld = add(`<svg style="position:absolute;left:46px;top:300px" width="226" height="176"></svg>`);
  // starting: direct on line against through the converter
  add(`<div class="pn" style="left:35px;top:490px;width:247px;height:192px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:502px;font-weight:700">ПУСК: НАПРЯМУЮ ИЛИ ЧЕРЕЗ ПЧ</div>`);
  const st = add(`<svg style="position:absolute;left:44px;top:518px" width="230" height="134"></svg>`);
  add(`<div style="position:absolute;left:46px;top:654px;width:226px;height:1px;background:${C.line}"></div>`);
  const stFoot = add(`<div style="position:absolute;left:46px;top:661px;font-size:9.5px;color:${C.mute}"></div>`);
  // the set, the converter, the 220 V question
  const block = (top, h, title, names) => {
    add(`<div class="pn" data-g="charts" style="left:1318px;top:${top}px;width:245px;height:${h}px"></div>`);
    add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:${top + 11}px;font-weight:700">${title}</div>`);
    return names.map((n, i) => {
      const r = add(`<div class="row" data-g="charts" style="top:${top + 31 + i * 22}px"><span class="mu">${n}</span><span></span></div>`);
      return r.lastElementChild;
    });
  };
  const genRows = block(36, 209, `ДГУ ${GENSET.name.replace('ТСС ', 'ТСС&nbsp;')}`, ['Мощность', 'Выход', 'Номинальный ток', 'Ток сейчас', 'Расход топлива', 'Бак 80 л хватит на', 'Масса · габариты']);
  const vfdRows = block(252, 184, `ПЧ ${VFD.name}`, ['Мощность', 'Вход', 'Выход', 'Частота сейчас', 'Разгон', 'Габариты · масса']);
  add(`<div class="pn" data-g="charts" style="left:1318px;top:443px;width:245px;height:214px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:454px;font-weight:700">А ЕСЛИ ГЕНЕРАТОР НА 220 В?</div>`);
  add(`<div data-g="charts" style="position:absolute;left:1329px;top:474px;width:224px;font-size:10px;line-height:1.45;color:${C.ink}">
    <p style="margin:0 0 6px">Обмотка АИР160S6 — <b>380 / 660 В</b>: в треугольник ей нужно <b>3 × 380 В</b>. От 3 × 220 В двигатель даст лишь ≈ 58 % напряжения.</p>
    <p style="margin:0 0 6px">ПЧ «1 × 220 → 3 × 380 В» на 11 кВт — редкость, на входе ≈ <b>60 А</b> по одной фазе. Нужен однофазный генератор от 15 кВт.</p>
    <p style="margin:0;color:${C.mute}">Проще и надёжнее трёхфазный ДГУ 400 В: преобразовывать 220 в 380 не нужно, ПЧ только для плавного пуска и скорости.</p></div>`);
  // the energy chain, bottom centre
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">ЦЕПОЧКА ЭНЕРГИИ</span> &nbsp;— &nbsp;ОТ ТОПЛИВА ДО НАПОРА</div>`);
  const chain = add(`<svg style="position:absolute;left:430px;top:810px" width="740" height="46"></svg>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:860px;text-align:center;font-weight:500">ДИЗЕЛЬ → ГЕНЕРАТОР → ПЧ → ДВИГАТЕЛЬ → НАСОС · ТЕПЛОТА СГОРАНИЯ ДИЗЕЛЯ ≈ 10 КВТ·Ч НА ЛИТР</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:878px;text-align:center;font-weight:500;color:${C.faint}">ТЯНИ — ПОВОРОТ &nbsp;·&nbsp; КОЛЕСО — МАСШТАБ &nbsp;·&nbsp; H — СКРЫТЬ ПАНЕЛИ</div>`);
  // ------------------------------------------------------------ the generator set's overlay: the diesel's cycle, the alternator's voltage
  tag = 'genset';
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">ДГУ в разрезе <span style="color:${C.red}">·</span> дизель + генератор</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.4px;font-size:9.2px">${ENGINE.name.toUpperCase()} &nbsp;•&nbsp; ${ALT.name} &nbsp;•&nbsp; 1500 ОБ/МИН → 50 ГЦ</div>`);
  const nBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  add(`<div style="position:absolute;left:265px;top:141px;font-size:11px;font-weight:500">60</div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  add(`<div style="position:absolute;left:${35 + (50 / 60) * 247}px;top:170px;width:1px;height:17px;background:${C.ink}"></div>`);
  const nFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - (35 + (50 / 60) * 247) + 4}px;top:155px;font-size:8.4px;font-weight:500">СЕТЬ 50</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">ГЦ</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500">Частота на выходе ДГУ</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:36px;display:flex;justify-content:center;gap:16px;font-weight:500;font-size:9.4px">
    ${[['ВПУСК', '#3f8de0'], ['СЖАТИЕ', '#9aa0a7'], ['СГОРАНИЕ', '#ff6a1f'], ['ВЫПУСК', '#8b8f95'], ['ПОЛЮС N', '#ff5c33'], ['ПОЛЮС S', '#3385ff']].map(([n, c]) => `<span><i style="display:inline-block;width:15px;height:2.4px;background:${c};vertical-align:middle;margin-right:6px"></i>${n}</span>`).join('')}</div>`);
  // the four cylinders through their strokes
  add(`<div class="pn" style="left:35px;top:274px;width:247px;height:208px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:286px;font-weight:700">ЦИКЛ ДИЗЕЛЯ</div>`);
  const cycAng = add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:286px;font-weight:500"></div>`);
  const cyc = add(`<svg style="position:absolute;left:46px;top:302px" width="226" height="136"></svg>`);
  add(`<div style="position:absolute;left:46px;top:440px;width:226px;height:1px;background:${C.line}"></div>`);
  add(`<div style="position:absolute;left:46px;top:447px;font-size:9.5px;color:${C.mute}">Порядок <b style="color:${C.ink}">1-3-4-2</b> · рабочий ход каждые <b style="color:${C.ink}">180°</b></div>`);
  add(`<div style="position:absolute;left:46px;top:461px;font-size:9.5px;color:${C.mute}">Воспламенение от сжатия, без свечей · ε ≈ ${f1(ENGINE.cr)}*</div>`);
  // the alternator's three phase voltages
  add(`<div class="pn" style="left:35px;top:490px;width:247px;height:192px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:502px;font-weight:700">НАПРЯЖЕНИЕ ГЕНЕРАТОРА</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:502px;font-weight:500">ФАЗНОЕ, В</div>`);
  const uw = add(`<svg style="position:absolute;left:44px;top:518px" width="230" height="134"></svg>`);
  add(`<div style="position:absolute;left:46px;top:654px;width:226px;height:1px;background:${C.line}"></div>`);
  add(`<div style="position:absolute;left:46px;top:661px;font-size:9.5px;color:${C.mute};font-family:'JetBrains Mono',monospace">f = p·n / 60 = 2·1500 / 60 = 50 Гц</div>`);
  const gsRow = (top, h, title, names) => {
    add(`<div class="pn" data-g="charts" style="left:1318px;top:${top}px;width:245px;height:${h}px"></div>`);
    add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:${top + 11}px;font-weight:700">${title}</div>`);
    return names.map((n, i) => {
      const r = add(`<div class="row" data-g="charts" style="top:${top + 31 + i * 22}px"><span class="mu">${n}</span><span></span></div>`);
      return r.lastElementChild;
    });
  };
  const engRows = gsRow(36, 209, `ДИЗЕЛЬ ${ENGINE.name.replace('TSS Diesel ', '')}`, ['Мощность', 'Цилиндры', 'Обороты', 'Цикл, впрыск', 'Нагрузка на валу', 'Расход топлива', 'КПД дизеля сейчас']);
  const altRows = gsRow(252, 184, `ГЕНЕРАТОР ${ALT.name}`, ['Тип', 'Полюсов', 'Возбуждение', 'КПД · изоляция', 'Масса · габарит', 'Выход сейчас']);
  add(`<div class="pn" data-g="charts" style="left:1318px;top:443px;width:245px;height:214px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:454px;font-weight:700">КАК ПОЛУЧАЕТСЯ ТОК</div>`);
  add(`<div data-g="charts" style="position:absolute;left:1329px;top:473px;width:224px;font-size:10px;line-height:1.45;color:${C.ink}">
    <p style="margin:0 0 5px">1. Дизель крутит ротор генератора — ровно <b>1500 об/мин</b>, их держит регулятор оборотов.</p>
    <p style="margin:0 0 5px">2. На роторе <b>4 электромагнита</b> N–S. Ток в них даёт возбудитель через вращающиеся диоды — щёток нет.</p>
    <p style="margin:0 0 5px">3. Поле ротора проходит по обмоткам статора и наводит в трёх фазах <b>переменное напряжение</b>.</p>
    <p style="margin:0;color:${C.mute}">4. AVR меняет ток возбуждения и держит 400 В ±1 % при любой нагрузке.</p></div>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">КУДА УХОДИТ ТОПЛИВО</span> &nbsp;— &nbsp;* ТИПОВЫЕ ДАННЫЕ ДЛЯ ДИЗЕЛЯ ЭТОГО КЛАССА</div>`);
  const gsChain = add(`<svg style="position:absolute;left:430px;top:810px" width="740" height="46"></svg>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:860px;text-align:center;font-weight:500">БОЛЬШАЯ ЧАСТЬ ЭНЕРГИИ ТОПЛИВА УХОДИТ ТЕПЛОМ — В РАДИАТОР И С ВЫХЛОПОМ</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:878px;text-align:center;font-weight:500;color:${C.faint}">ТЯНИ — ПОВОРОТ &nbsp;·&nbsp; КОЛЕСО — МАСШТАБ &nbsp;·&nbsp; H — СКРЫТЬ ПАНЕЛИ</div>`);
  // ------------------------------------------------------------ the mobile set's overlay: what rides in the bed, what hangs on the ball
  tag = 'truck';
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">Мобильная установка <span style="color:${C.red}">·</span> ${T9.name}</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.4px;font-size:9.2px">АГРЕГАТ В КУЗОВЕ &nbsp;•&nbsp; ДГУ НА ПРИЦЕПЕ &nbsp;•&nbsp; ПЧ И АВТОМАТ У ДВИГАТЕЛЯ</div>`);
  const tBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  add(`<div style="position:absolute;left:265px;top:141px;font-size:11px;font-weight:500">100</div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  const tFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">%</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500">Загрузка кузова от грузоподъёмности</div>`);
  // the bed from above, to scale
  add(`<div class="pn" style="left:35px;top:274px;width:247px;height:208px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:286px;font-weight:700">КУЗОВ · ВИД СВЕРХУ</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:286px;font-weight:500">${T9.bed[0]} × ${T9.bed[1]} ММ</div>`);
  const bedSvg = add(`<svg style="position:absolute;left:46px;top:302px" width="226" height="172"></svg>`);
  // the masses against their limits
  add(`<div class="pn" style="left:35px;top:490px;width:247px;height:192px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:502px;font-weight:700">МАССЫ И ПРЕДЕЛЫ</div>`);
  const massSvg = add(`<svg style="position:absolute;left:46px;top:520px" width="226" height="156"></svg>`);
  const tRows = (top, h, title, names) => {
    add(`<div class="pn" data-g="charts" style="left:1318px;top:${top}px;width:245px;height:${h}px"></div>`);
    add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:${top + 11}px;font-weight:700">${title}</div>`);
    return names.map((n, i) => {
      const r = add(`<div class="row" data-g="charts" style="top:${top + 31 + i * 22}px"><span class="mu">${n}</span><span></span></div>`);
      return r.lastElementChild;
    });
  };
  const carRows = tRows(36, 209, `ПИКАП ${T9.name}`, ['Двигатель', 'Трансмиссия', 'Габариты', 'База · клиренс', 'Масса снаряж. / разреш.', 'Кузов', 'Прицеп с тормозами']);
  const trRows = tRows(252, 184, 'ПРИЦЕП С ДГУ', ['ДГУ АД-20С', 'Прицеп одноосный*', 'Топливо 80 л', 'Итого', 'Предел по ОТТС', 'Нагрузка на шар*']);
  add(`<div class="pn" data-g="charts" style="left:1318px;top:443px;width:245px;height:214px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:454px;font-weight:700">ПРАВИЛА И БЕЗОПАСНОСТЬ</div>`);
  add(`<div data-g="charts" style="position:absolute;left:1329px;top:473px;width:224px;font-size:10px;line-height:1.42;color:${C.ink}">
    <p style="margin:0 0 5px">Прицеп тяжелее <b>750 кг</b> — только с тормозом наката.</p>
    <p style="margin:0 0 5px">Разрешённая масса автопоезда больше <b>3500 кг</b> — нужна категория <b>BE</b>.</p>
    <p style="margin:0 0 5px">Агрегат крепить к полу кузова: болты в раму или 4 точки ремнями. На ходу насос не работает.</p>
    <p style="margin:0;color:${C.mute}">На стоянке: ДГУ на ровной площадке, заземлить штырём; рама агрегата и ПЧ — на тот же контур.</p></div>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">АВТОПОЕЗД</span> &nbsp;— &nbsp;* ОЦЕНКА: ПРИЦЕП ПОД ДГУ 800 КГ, ДОЛЯ МАССЫ НА СЦЕПКУ ≈ 5 %</div>`);
  const trainLine = add(`<div style="position:absolute;left:0;right:0;top:816px;text-align:center;font-size:14px;font-weight:600"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:855px;text-align:center;font-weight:500">ИСТОЧНИКИ: ТЕХНИЧЕСКИЕ ХАРАКТЕРИСТИКИ FORD F-150 RAPTOR R 2024, РУКОВОДСТВО Ш80-2,5, ПАСПОРТ ТСС</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">ТЯНИ — ПОВОРОТ &nbsp;·&nbsp; КОЛЕСО — МАСШТАБ &nbsp;·&nbsp; H — СКРЫТЬ ПАНЕЛИ</div>`);
  // ------------------------------------------------------------ the piping's overlay: the flange drawing, the suction budget, the hose and the filter
  tag = 'pipes';
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">Обвязка насоса <span style="color:${C.red}">·</span> фланцы, рукава, фильтр</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.4px;font-size:9.2px">ФИЛЬТР 0,25 ММ → РУКАВ Б-2-75 → ФЛАНЕЦ Ø190 → НАСОС → ФЛАНЕЦ → РУКАВ</div>`);
  const sBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  add(`<div style="position:absolute;left:265px;top:141px;font-size:11px;font-weight:500">5</div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  const sFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">М</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500">Можно поднимать масло на высоту</div>`);
  // the counter flange, drawn to the pump's port
  add(`<div class="pn" style="left:35px;top:274px;width:247px;height:208px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:286px;font-weight:700">ОТВЕТНЫЙ ФЛАНЕЦ С НИППЕЛЕМ</div>`);
  {
    const k = 0.42;
    const cx = 56;
    const cy = 72;
    let h = `<circle cx="${cx}" cy="${cy}" r="${95 * k}" fill="#eef0f2" stroke="${C.ink}" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="${79 * k}" fill="none" stroke="${C.mute}" stroke-dasharray="3 2" stroke-width=".7"/>`;
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) * Math.PI) / 4;
      h += `<circle cx="${(cx + 79 * k * Math.cos(a)).toFixed(1)}" cy="${(cy - 79 * k * Math.sin(a)).toFixed(1)}" r="${7.5 * k}" fill="#fff" stroke="${C.ink}" stroke-width=".9"/>`;
    }
    h += `<circle cx="${cx}" cy="${cy}" r="${34 * k}" fill="#fff" stroke="${C.ink}" stroke-width="1"/>`;
    h += `<text x="${cx}" y="${cy + 95 * k + 12}" font-size="7" text-anchor="middle" fill="${C.ink}">Ø190 · 8 отв. Ø15 на Ø158</text>`;
    // side view: the plate and the tail with its barbs
    const sx = 128;
    h += `<rect x="${sx}" y="${cy - 95 * k}" width="${18 * k * 1.6}" height="${190 * k}" fill="#d9dde2" stroke="${C.ink}" stroke-width="1"/>`;
    h += `<rect x="${sx + 18 * k * 1.6}" y="${cy - 39 * k}" width="${130 * k * 1.2}" height="${78 * k}" fill="#eef0f2" stroke="${C.ink}" stroke-width="1"/>`;
    for (const d of [40, 70, 100]) h += `<line x1="${sx + (18 * 1.6 + d * 1.2) * k}" x2="${sx + (18 * 1.6 + d * 1.2) * k}" y1="${cy - 41 * k}" y2="${cy + 41 * k}" stroke="${C.ink}" stroke-width="1.6"/>`;
    h += `<line x1="${sx - 6}" x2="${sx + 120}" y1="${cy}" y2="${cy}" stroke="${C.mute}" stroke-dasharray="6 2 1 2" stroke-width=".6"/>`;
    h += `<text x="${sx + 50}" y="${cy - 30}" font-size="7" text-anchor="middle" fill="${C.ink}">ниппель Ø78 × 130</text><text x="${sx + 50}" y="${cy + 38}" font-size="7" text-anchor="middle" fill="${C.ink}">под рукав 75 мм</text>`;
    h += `<text x="${sx + 6}" y="${cy + 95 * k + 12}" font-size="7" fill="${C.ink}">s 18 · Ст20</text>`;
    add(`<svg style="position:absolute;left:46px;top:300px" width="226" height="150">${h}</svg>`);
  }
  add(`<div style="position:absolute;left:46px;top:452px;width:226px;font-size:9.2px;color:${C.mute};line-height:1.35">По патрубку насоса (прил. Б): болты M14 в его резьбу, прокладка паронит 1 мм.</div>`);
  // the suction budget: lift + losses ≤ 5 m
  add(`<div class="pn" style="left:35px;top:490px;width:247px;height:192px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:502px;font-weight:700">ВСАСЫВАНИЕ: ВСЕГО ≤ 5 М</div>`);
  const sbSvg = add(`<svg style="position:absolute;left:46px;top:520px" width="226" height="130"></svg>`);
  const sbFoot = add(`<div style="position:absolute;left:46px;top:654px;width:226px;font-size:9.2px;color:${C.mute};line-height:1.35"></div>`);
  const pRows = (top, h, title, names) => {
    add(`<div class="pn" data-g="charts" style="left:1318px;top:${top}px;width:245px;height:${h}px"></div>`);
    add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:${top + 11}px;font-weight:700">${title}</div>`);
    return names.map((n, i) => {
      const r = add(`<div class="row" data-g="charts" style="top:${top + 31 + i * 22}px"><span class="mu">${n}</span><span></span></div>`);
      return r.lastElementChild;
    });
  };
  const hoseRows = pRows(36, 209, `РУКАВ ${HOSE.name.replace(' ГОСТ', ' · ГОСТ')}`, ['Класс', 'Внутренний диаметр', 'Рабочее давление', 'Вакуум', 'Радиус изгиба', 'Масса', 'Температура']);
  const filtRows = pRows(252, 184, `ФИЛЬТР ${FILTER.name}`, ['Тип', 'Ячейка сетки', 'Давление', 'Среда', 'Присоединение', 'Корпус · размеры']);
  add(`<div class="pn" data-g="charts" style="left:1318px;top:443px;width:245px;height:214px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:454px;font-weight:700">МОНТАЖ ПО РУКОВОДСТВУ НАСОСА</div>`);
  add(`<div data-g="charts" style="position:absolute;left:1329px;top:473px;width:224px;font-size:9.8px;line-height:1.4;color:${C.ink}">
    <p style="margin:0 0 4px">• Никаких нагрузок от трубопроводов на патрубки — рукава и опора фильтра (п. 2.1.3).</p>
    <p style="margin:0 0 4px">• На всасывании обратный клапан или «гусак» выше насоса (п. 2.2.4).</p>
    <p style="margin:0 0 4px">• Мановакуумметр на входе, манометр на выходе (табл. 3).</p>
    <p style="margin:0 0 4px">• Фильтр крышкой вниз, по стрелке; чистить, когда растёт вакуум.</p>
    <p style="margin:0;color:${C.mute}">• Подсос воздуха во фланцах всасывания — пульсации и падение подачи (табл. 4).</p></div>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">ПРИБОРЫ</span> &nbsp;— &nbsp;СТРЕЛКИ В СЦЕНЕ ПОКАЗЫВАЮТ ЭТИ ЖЕ ЗНАЧЕНИЯ</div>`);
  const gaugeLine = add(`<div style="position:absolute;left:0;right:0;top:816px;text-align:center;font-size:14px;font-weight:600"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:855px;text-align:center;font-weight:500">* СОПРОТИВЛЕНИЕ ФИЛЬТРА — ОЦЕНКА ПО АНАЛОГУ (KV 131 ДЛЯ СЕТКИ 0,25 ММ DN80) С ПОПРАВКОЙ НА ВЯЗКОСТЬ МАСЛА</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">ТЯНИ — ПОВОРОТ &nbsp;·&nbsp; КОЛЕСО — МАСШТАБ &nbsp;·&nbsp; H — СКРЫТЬ ПАНЕЛИ</div>`);
  // ------------------------------------------------------------ the transfer's overlay: levels, progress, the oil, the lines, the totals
  tag = 'site';
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">Перекачка И-20А <span style="color:${C.red}">·</span> резервуар → 4 бензовоза</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.4px;font-size:9.2px">ОДИН НАСОС Ш80-2,5 · ПО ОЧЕРЕДИ: КАМАЗ 8 М³ → 3 × SCANIA 20 М³ &nbsp;•&nbsp; ВРЕМЯ ×${PLAN.accel}</div>`);
  const trBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3px;color:${C.red};line-height:1"></div>`);
  add(`<div style="position:absolute;left:265px;top:141px;font-size:11px;font-weight:500">100</div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  const trFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">%</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  const trLabel = add(`<div style="position:absolute;left:35px;top:213px;font-size:12.5px;font-weight:500"></div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:36px;display:flex;justify-content:center;gap:16px;font-weight:500;font-size:9.4px">
    ${[['МАСЛО И-20А', OIL_COL], ['ВСАСЫВАНИЕ', C.blue], ['НАГНЕТАНИЕ', C.orange]].map(([n, c]) => `<span><i style="display:inline-block;width:15px;height:2.4px;background:${c};vertical-align:middle;margin-right:6px"></i>${n}</span>`).join('')}</div>`);
  // the storage tank and the four tankers with their levels
  add(`<div class="pn" style="left:35px;top:274px;width:247px;height:208px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:286px;font-weight:700">УРОВНИ</div>`);
  const lvSvg = add(`<svg style="position:absolute;left:46px;top:300px" width="226" height="176"></svg>`);
  // the run: the volume in each tanker against time
  add(`<div class="pn" style="left:35px;top:490px;width:247px;height:192px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:502px;font-weight:700">ХОД ПЕРЕКАЧКИ</div>`);
  const runTag = add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:502px;font-weight:500"></div>`);
  const runSvg = add(`<svg style="position:absolute;left:44px;top:518px" width="230" height="134"></svg>`);
  add(`<div style="position:absolute;left:46px;top:654px;width:226px;height:1px;background:${C.line}"></div>`);
  const runFoot = add(`<div style="position:absolute;left:46px;top:661px;font-size:9.5px;color:${C.mute}"></div>`);
  const sRows = (top, h, title, names) => {
    add(`<div class="pn" data-g="charts" style="left:1318px;top:${top}px;width:245px;height:${h}px"></div>`);
    add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:${top + 11}px;font-weight:700">${title}</div>`);
    return names.map((n, i) => {
      const r = add(`<div class="row" data-g="charts" style="top:${top + 31 + i * 22}px"><span class="mu">${n}</span><span></span></div>`);
      return r.lastElementChild;
    });
  };
  const oilRows = sRows(36, 209, `МАСЛО ${OIL.name} · ${OIL.gost}`, ['Плотность при 20 °С', 'Вязкость при 40 °С', 'Вязкость при 20 °С', 'Температура застывания', 'Температура вспышки', 'Масса в машинах', 'Масса в резервуаре']);
  const hydRows = sRows(252, 184, 'ГИДРАВЛИКА ЛИНИИ', ['Сейчас наливается', 'Подача насоса', 'Скорость в рукаве', 'Режим течения', 'Давление вход / выход', 'Потери вход / выход']);
  const totRows = sRows(443, 214, 'ИТОГ ПЕРЕКАЧКИ · 95 % КАЖДОЙ', [...VESSELS.map((ve) => `${ve.name} · ${ve.cap} м³`), 'Всего · время', 'кВт·ч · дизель ДГУ', 'Резервуар после']);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">НАЛИВ</span> &nbsp;— &nbsp;ВРЕМЯ УСКОРЕНО ×${PLAN.accel}; МЕЖДУ МАШИНАМИ ${PLAN.swap / 60} МИН НА ПЕРЕСТАНОВКУ РУКАВА</div>`);
  const trLine = add(`<div style="position:absolute;left:0;right:0;top:816px;text-align:center;font-size:14px;font-weight:600"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:855px;text-align:center;font-weight:500">РАЗРЕЗ И СТЕКЛО ПОКАЗЫВАЮТ МАСЛО В РЕЗЕРВУАРЕ, ЦИСТЕРНАХ И РУКАВАХ · T — НАЧАТЬ ЗАНОВО</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">ТЯНИ — ПОВОРОТ &nbsp;·&nbsp; КОЛЕСО — МАСШТАБ &nbsp;·&nbsp; H — СКРЫТЬ ПАНЕЛИ</div>`);
  const byMode = [...ui.querySelectorAll('[data-m]')];
  let modeNow = '';

  // ------------------------------------------------------------ callouts, the pointer
  tag = '';
  const callSvg = add(`<svg data-callouts style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div data-callouts style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const knobX = (v) => SL.x + v * SL.w;
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };

  /** the transfer's panels from its state s.tr (transfer.js) */
  const mmss = (sec) => {
    const r = Math.round(sec);
    const h = Math.floor(r / 3600);
    const m = Math.floor((r % 3600) / 60);
    const ss = String(r % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  const VCOL = ['#c9952b', '#d4542a', '#9d3d8f', '#2f6db3'];
  const drawSite = (s) => {
    const tr = s.tr;
    const pct = tr.progress * 100;
    trBig.textContent = `${Math.round(pct)}`;
    trFill.style.width = `${Math.min(247, (pct / 100) * 247).toFixed(1)}px`;
    const cur = VESSELS[tr.cur];
    trLabel.innerHTML = tr.phase === 'fill' ? `Налито всего, % от ${f1(tr.totalEnd)} м³ · <b style="color:${C.red}">${cur.name}</b> ${Math.round(tr.curProgress * 100)} %` : tr.phase === 'swap' ? `Рукав переставляют на <b style="color:${C.red}">${cur.name}</b> · ${mmss(tr.swapLeft)}` : 'Все четыре машины налиты — насос остановлен';
    // the storage tank upright on the left, the four tankers' sections on the right (2 × 2), each to its own scale
    {
      let h = '';
      const tx = 6;
      const ty = 22;
      const tw = 62;
      const th = 118;
      const fill = (tr.vRes / PLAN.resCap) * th;
      h += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/><rect x="${tx + 1}" y="${(ty + th - fill).toFixed(1)}" width="${tw - 2}" height="${fill.toFixed(1)}" fill="${OIL_COL}" opacity=".85"/>`;
      h += `<path d="M${tx} ${ty} L${tx + tw / 2} ${ty - 10} L${tx + tw} ${ty}" fill="none" stroke="${C.ink}" stroke-width="1.2"/>`;
      h += `<text x="${tx + tw / 2}" y="${ty + th + 13}" font-size="7.6" text-anchor="middle" font-weight="700" fill="${C.ink}">${f1(tr.vRes)} м³</text><text x="${tx + tw / 2}" y="${ty + th + 24}" font-size="6.6" text-anchor="middle" fill="${C.mute}">${f2(tr.resLevel / 1000)} м</text>`;
      h += `<text x="${tx + tw / 2}" y="${ty - 14}" font-size="6.4" letter-spacing=".6" text-anchor="middle" fill="${C.mute}">РЕЗЕРВУАР</text>`;
      h += `<defs>${VESSELS.map((_, k) => `<clipPath id="ve${k}"><ellipse cx="0" cy="0" rx="34" ry="19"/></clipPath>`).join('')}</defs>`;
      VESSELS.forEach((ve, k) => {
        const cx = 118 + (k % 2) * 80;
        const cy = 40 + Math.floor(k / 2) * 78;
        const a = 34;
        const b = 19;
        const dep = tr.depths[k] / (2 * ve.b);
        const top = b - dep * 2 * b;
        const on = k === tr.cur && tr.phase !== 'done';
        h += `<g transform="translate(${cx} ${cy})"><ellipse rx="${a}" ry="${b}" fill="#fff" stroke="${on ? C.red : C.ink}" stroke-width="${on ? 1.8 : 1.1}"/><rect x="${-a}" y="${top.toFixed(1)}" width="${2 * a}" height="${(b - top).toFixed(1)}" fill="${OIL_COL}" opacity=".85" clip-path="url(#ve${k})"/>`;
        const y95 = b - (PLAN.fill > 0 ? 0.95 * 2 * b : 0);
        h += `<line x1="${-a}" x2="${a}" y1="${y95}" y2="${y95}" stroke="${C.red}" stroke-dasharray="2 2" stroke-width=".7"/>`;
        h += `<text y="${-b - 6}" font-size="6.6" text-anchor="middle" font-weight="${on ? 700 : 500}" fill="${on ? C.red : C.mute}">${ve.name.toUpperCase()}</text>`;
        h += `<text y="${b + 12}" font-size="7.4" text-anchor="middle" font-weight="700" fill="${C.ink}">${f2(tr.vols[k])} / ${ve.cap} м³</text></g>`;
      });
      h += `<text x="158" y="172" font-size="6.2" text-anchor="middle" fill="${C.red}">- - - 95 %: предел налива</text>`;
      lvSvg.innerHTML = h;
    }
    // the run: each tanker's volume against the clock, the hose changes between them shaded
    {
      const T = tr.T;
      const X = (sec) => 22 + (sec / T) * 196;
      const Y = (m3) => 112 - (m3 / 20) * 100;
      let h = '';
      for (const m of [0, 10, 20]) h += `<text x="17" y="${Y(m) + 2.5}" font-size="6.5" text-anchor="end" fill="${C.mute}">${m}</text><line x1="${X(0)}" x2="${X(T)}" y1="${Y(m)}" y2="${Y(m)}" stroke="${C.line}" stroke-width=".6"/>`;
      h += `<text x="2" y="9" font-size="6.5" fill="${C.mute}">м³</text>`;
      for (let k = 1; k < VESSELS.length; k++) h += `<rect x="${X(tr.tEnd[k - 1]).toFixed(1)}" y="${Y(20)}" width="${(X(tr.tStart[k]) - X(tr.tEnd[k - 1])).toFixed(1)}" height="${Y(0) - Y(20)}" fill="#eceef1"/>`;
      VESSELS.forEach((ve, k) => {
        const t0 = tr.tStart[k];
        const t1 = tr.tEnd[k];
        let d = '';
        for (let i = 0; i <= 16; i++) {
          const sec = t0 + (i / 16) * (t1 - t0);
          d += `${i ? 'L' : 'M'}${X(sec).toFixed(1)} ${Y(siteState(sec).vols[k]).toFixed(1)}`;
        }
        d += `L${X(T).toFixed(1)} ${Y(tr.ends[k]).toFixed(1)}`;
        h += `<path d="${d}" fill="none" stroke="${VCOL[k]}" stroke-width="1.4"/>`;
      });
      const now = Math.min(T, tr.t);
      if (tr.cur >= 0) h += `<circle cx="${X(now).toFixed(1)}" cy="${Y(tr.vols[tr.cur]).toFixed(1)}" r="3.2" fill="${C.red}"/>`;
      h += `<line x1="${X(now).toFixed(1)}" x2="${X(now).toFixed(1)}" y1="${Y(20)}" y2="${Y(0)}" stroke="${C.red}" stroke-width=".6"/>`;
      h += `<line x1="${X(0)}" x2="${X(T)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
      for (const k of [0, 0.25, 0.5, 0.75, 1]) h += `<text x="${X(k * T)}" y="${Y(0) + 10}" font-size="6.5" text-anchor="middle" fill="${C.mute}">${mmss(k * T)}</text>`;
      h += `<text x="${X(T)}" y="${Y(0) + 20}" font-size="6.2" letter-spacing="1" text-anchor="end" fill="${C.mute}">РЕАЛЬНОЕ ВРЕМЯ, Ч:МИН:С</text>`;
      h += VESSELS.map((ve, k) => `<text x="${24 + k * 50}" y="7" font-size="6.2" fill="${VCOL[k]}" font-weight="700">${ve.id === 'kam' ? 'КАМАЗ' : `S${k}`}</text>`).join('');
      runSvg.innerHTML = h;
      runTag.innerHTML = `<b style="color:${C.ink}">${mmss(now)}</b> / ${mmss(T)}`;
      runFoot.innerHTML = `Осталось <b style="color:${C.ink}">${mmss(tr.left)}</b> · налито <b style="color:${C.ink}">${f1(tr.total)}</b> м³ · <b style="color:${C.ink}">${f1(tr.mass)}</b> т`;
    }
    const ov = [`${OIL.rho} кг/м³`, `${OIL.nu40} мм²/с (29–35)`, `≈ ${OIL.nu20} мм²/с`, `≤ ${OIL.pour} °С`, `≥ ${OIL.flash} °С`, `${f2(tr.mass)} т`, `${f1((tr.vRes * OIL.rho) / 1000)} т`];
    oilRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${ov[i]}</b>`));
    const regime = tr.re < 2300 ? 'ламинарный' : tr.re < 4000 ? 'переходный' : 'турбулентный';
    const hv = [tr.phase === 'fill' ? cur.name : tr.phase === 'swap' ? `стоп · рукав → ${cur.name}` : 'всё налито', `${f1(tr.q)} м³/ч · ${f1(tr.q / 3.6)} л/с`, `${f2(tr.v)} м/с`, `Re ${Math.round(tr.re)} · ${regime}`, `${tr.pIn >= 0 ? '+' : ''}${Math.round(tr.pIn * 1000)} кПа / ${f2(tr.pOut)} МПа`, `${f2(tr.lossS)} / ${f2(tr.lossD)} м`];
    hydRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${hv[i]}</b>`));
    const end = siteState(tr.T);
    const tv = [
      ...VESSELS.map((ve, k) => `${f2(tr.ends[k])} м³ · ${mmss(tr.tEnd[k] - tr.tStart[k])}${k === tr.cur && tr.phase === 'fill' ? ' ▲' : tr.vols[k] >= tr.ends[k] - 1e-3 ? ' ✓' : ''}`),
      `${f1(tr.totalEnd)} м³ · ${mmss(tr.T)}`,
      `${f1(end.energy)} кВт·ч · ${f1(end.fuel)} л`,
      `${f1(end.vRes)} м³ · ${Math.round((end.vRes / PLAN.resCap) * 100)} %`,
    ];
    totRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${tv[i]}</b>`));
    trLine.innerHTML = `Налито <b style="color:${C.red}">${f1(tr.total)}</b> из ${f1(tr.totalEnd)} м³ &nbsp;·&nbsp; ${tr.phase === 'fill' ? `сейчас <b>${cur.name}</b> ${f1(tr.vols[tr.cur])} м³` : tr.phase === 'swap' ? `перестановка рукава на <b>${cur.name}</b>` : 'налив закончен'} &nbsp;·&nbsp; осталось <b>${mmss(tr.left)}</b> &nbsp;·&nbsp; в резервуаре <b>${f1(tr.vRes)} м³</b>`;
  };
  /** the piping's panels: what the suction line leaves of the pump's 5 m, the hose and the filter, the gauges */
  const drawPipes = (s) => {
    const q = Math.max(0.1, s.flows.th - s.flows.leak);
    const sb = suctionBudget(q);
    const dirty = suctionBudget(q, {dirty: true});
    const ok = Math.max(0, sb.allowed);
    sBig.textContent = f1(ok);
    sFill.style.width = `${((ok / 5) * 247).toFixed(1)}px`;
    {
      const W = 220;
      const X = (m) => (m / 5) * W;
      const rows = [['Чистый фильтр', sb], ['Фильтр забит*', dirty]];
      let h = '';
      rows.forEach(([n, b], i) => {
        const y = 4 + i * 54;
        const parts = [[b.hHose + b.hLocal, '#5d6670', 'рукав'], [b.hFilter, C.amber, 'фильтр*'], [b.hv, '#9aa0a7', 'скорость'], [Math.max(0, b.allowed), C.blue, 'подъём']];
        h += `<text x="0" y="${y + 8}" font-size="8.4" font-weight="700" fill="${C.ink}">${n}</text><text x="${W}" y="${y + 8}" font-size="8.4" font-weight="700" text-anchor="end" fill="${b.allowed < 0.5 ? C.red : C.ink}">подъём ≤ ${f1(Math.max(0, b.allowed))} м</text>`;
        let x = 0;
        for (const [v, c, l] of parts) {
          const w = Math.max(0, Math.min(W - x, X(v)));
          h += `<rect x="${x.toFixed(1)}" y="${y + 14}" width="${w.toFixed(1)}" height="14" fill="${c}"/>`;
          if (w > 26) h += `<text x="${(x + w / 2).toFixed(1)}" y="${y + 24}" font-size="6.6" text-anchor="middle" fill="#fff">${l} ${f1(v)}</text>`;
          x += w;
        }
        h += `<line x1="${W}" x2="${W}" y1="${y + 11}" y2="${y + 31}" stroke="${C.ink}"/><text x="${W}" y="${y + 40}" font-size="6.2" letter-spacing=".8" text-anchor="end" fill="${C.mute}">5 М ПО ПАСПОРТУ НАСОСА</text>`;
      });
      sbSvg.innerHTML = h;
      sbFoot.innerHTML = `Масло 10 °ВУ, ${f1(q)} м³/ч, рукав 6 м: скорость <b style="color:${C.ink}">${f1(sb.v)}</b> м/с, Re ≈ ${Math.round(sb.re)}`;
    }
    const hv = ['Б — нефтепродукты', `${HOSE.id} мм`, `${f1(HOSE.wp)} МПа`, `до ${f2(HOSE.vac)} МПа`, `≥ ${HOSE.bend} мм`, `${f1(HOSE.kgm)} кг/м`, HOSE.temp];
    hoseRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${hv[i]}</b>`));
    const fv = ['Y-образный сетчатый', `${f2(FILTER.mesh)} мм ✓ ≤ 0,25`, `PN ${f1(FILTER.pn)} МПа`, 'масла (паспорт)', 'резьба G3" (DN80)', `${FILTER.steel} · 200×300`];
    filtRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${fv[i]}</b>`));
    gaugeLine.innerHTML = `Вход: <b style="color:${C.blue}">${Math.round(sb.pv * 1000)} кПа</b> (вакуум, подъём 1,5 м) &nbsp;·&nbsp; выход: <b style="color:${C.orange}">${f2(s.p)} МПа</b>`;
  };
  /** the mobile set's panels: the bed's load, the bed from above, the masses against their limits */
  const drawTruck = () => {
    const bedKg = LOAD.unit + LOAD.drive + LOAD.hoses;
    const payload = T9.gross - T9.curb;
    const trKg = TRAILER.genset + TRAILER.frame + TRAILER.fuel;
    tBig.textContent = `${Math.round((bedKg / payload) * 100)}`;
    tFill.style.width = `${((bedKg / payload) * 247).toFixed(1)}px`;
    // the bed to scale (screen down = toward the tailgate, which is at z 1140); the arches round the rear axle (z ≈ 0,
    // 1285 apart), the unit's frame and its two machines, the drive stand, the straps
    {
      const k = 0.09;
      const [bl, bw] = T9.bed;
      const z0 = 1140 - bl;
      const ox = 113 - (bw * k) / 2;
      const oy = 8;
      const X = (x) => ox + (x + bw / 2) * k;
      const Y = (z) => oy + (z - z0) * k;
      let h = `<rect x="${X(-bw / 2)}" y="${Y(z0)}" width="${bw * k}" height="${bl * k}" fill="#eef0f2" stroke="${C.ink}" stroke-width="1.2"/>`;
      for (const s of [-1, 1]) h += `<rect x="${X(s > 0 ? 642 : -bw / 2)}" y="${Y(-440)}" width="${(bw / 2 - 642) * k}" height="${900 * k}" fill="#d5d8dc"/>`;
      h += `<rect x="${X(-190)}" y="${Y(-200)}" width="${380 * k}" height="${1160 * k}" fill="#3d4855"/>`;
      h += `<rect x="${X(-140)}" y="${Y(-150)}" width="${280 * k}" height="${400 * k}" fill="#1d5e94"/><text x="${X(0)}" y="${Y(60)}" font-size="7" fill="#fff" text-anchor="middle">НАСОС</text>`;
      h += `<rect x="${X(-165)}" y="${Y(372)}" width="${330 * k}" height="${525 * k}" fill="#4a525b"/><text x="${X(0)}" y="${Y(650)}" font-size="7" fill="#fff" text-anchor="middle">МОТОР</text>`;
      h += `<rect x="${X(-630)}" y="${Y(420)}" width="${400 * k}" height="${400 * k}" fill="#2f3338"/><text x="${X(-430)}" y="${Y(640)}" font-size="6.6" fill="#fff" text-anchor="middle">ПЧ</text>`;
      for (const z of [100, 760]) h += `<line x1="${X(-560)}" x2="${X(560)}" y1="${Y(z)}" y2="${Y(z)}" stroke="${C.amber}" stroke-width="1.6"/>`;
      h += `<text x="${X(0)}" y="${Y(z0) - 1}" font-size="6.4" letter-spacing=".8" text-anchor="middle" fill="${C.mute}">КАБИНА</text><text x="${X(0)}" y="${Y(1140) + 8}" font-size="6.4" letter-spacing=".8" text-anchor="middle" fill="${C.mute}">ЗАДНИЙ БОРТ → ПРИЦЕП</text>`;
      h += `<text x="${X(bw / 2 + 25)}" y="${Y(0)}" font-size="6.2" fill="${C.mute}" transform="rotate(90 ${X(bw / 2 + 25)} ${Y(0)})" text-anchor="middle">АРКИ КОЛЁС</text>`;
      bedSvg.innerHTML = h;
    }
    // the masses: three bars against their limits
    {
      const rows = [['Груз в кузове', bedKg, payload, 'ГРУЗОПОДЪЁМНОСТЬ'], ['Прицеп с ДГУ', trKg, T9.trailer, 'ОТТС, С ТОРМОЗАМИ'], ['Разреш. масса автопоезда', T9.gross + T9.trailer, 3500, 'ПРЕДЕЛ КАТЕГОРИИ B']];
      let h = '';
      rows.forEach(([n, v, lim, ln], i) => {
        const y = 4 + i * 50;
        const full = 200;
        const w = Math.min(1.4, v / lim) * (full / 1.4);
        const over = v > lim;
        h += `<text x="0" y="${y + 8}" font-size="8.4" font-weight="700" fill="${C.ink}">${n}</text><text x="226" y="${y + 8}" font-size="8.4" font-weight="700" text-anchor="end" fill="${over ? C.red : C.ink}">${v} / ${lim} кг</text>`;
        h += `<rect x="0" y="${y + 14}" width="${full}" height="9" fill="#e6e7e9"/><rect x="0" y="${y + 14}" width="${w.toFixed(1)}" height="9" fill="${over ? C.red : C.blue}"/>`;
        h += `<line x1="${full / 1.4}" x2="${full / 1.4}" y1="${y + 11}" y2="${y + 26}" stroke="${C.ink}"/><text x="${full / 1.4 + 3}" y="${y + 34}" font-size="6.2" letter-spacing=".8" fill="${C.mute}">${ln}${over ? ' — НУЖНА КАТ. BE' : ''}</text>`;
      });
      massSvg.innerHTML = h;
    }
    const cv = [T9.engine, T9.gearbox, `${T9.length}×${T9.width}×${T9.height}`, `${T9.base} · ${T9.clearance} мм`, `${T9.curb} / ${T9.gross} кг`, `${T9.bed.join('×')} мм`, `до ${T9.trailer} кг`];
    carRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:10.6px">${cv[i]}</b>`));
    const tv = [`${TRAILER.genset} кг`, `≈ ${TRAILER.frame} кг`, `≈ ${TRAILER.fuel} кг`, `≈ ${trKg} кг`, `${T9.trailer} кг`, `≈ ${Math.round(trKg * 0.05)} кг`];
    trRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${tv[i]}</b>`));
    trainLine.innerHTML = `Пикап <b>${T9.curb}</b> + груз <b>${bedKg}</b> + прицеп <b>${trKg}</b> = <b style="color:${C.red}">${T9.curb + bedKg + trKg} кг</b> фактически`;
  };
  /** the generator set's panels at crank angle s.genAngle (degrees) and the supply's state s.pw */
  const drawGenset = (s) => {
    const pw = s.pw;
    const th = s.genAngle ?? 0;
    nBig.textContent = '50,0';
    nFill.style.width = `${((50 / 60) * 247).toFixed(1)}px`;
    cycAng.innerHTML = `КОЛЕНВАЛ <b style="color:${C.ink}">${Math.round(((th % 720) + 720) % 720)}°</b>`;
    // the cylinders: each a bar over its 720°, the four strokes shaded, the cursor at its own phase
    {
      const COLS = ['#ff6a1f', '#8b8f95', '#3f8de0', '#9aa0a7'];
      const X = (d) => 34 + (d / 720) * 186;
      let h = '';
      ['РАБ.', 'ВЫП.', 'ВПУСК', 'СЖАТ.'].forEach((n, k) => (h += `<text x="${X(k * 180 + 90)}" y="9" font-size="6.4" letter-spacing=".8" text-anchor="middle" fill="${C.mute}">${n}</text>`));
      [1, 2, 3, 4].forEach((c, i) => {
        const y = 16 + i * 29;
        const ps = cylPsi(c, th);
        const st = strokeOf(ps);
        for (let k = 0; k < 4; k++) h += `<rect x="${X(k * 180)}" y="${y}" width="${X(180) - X(0) - 1}" height="18" fill="${COLS[k]}" opacity="${k === st ? 0.85 : 0.16}"/>`;
        h += `<line x1="${X(ps)}" x2="${X(ps)}" y1="${y - 3}" y2="${y + 21}" stroke="${C.ink}" stroke-width="1.6"/>`;
        h += `<text x="2" y="${y + 13}" font-size="8" font-weight="700" fill="${C.ink}">ЦИЛ ${c}</text>`;
      });
      cyc.innerHTML = h;
    }
    // the voltages: 230 V phase to neutral, √2 · 230 ≈ 325 V peak, two periods, the cursor at now
    {
      const X = (d) => 22 + (d / 720) * 198;
      const Y = (v) => 62 - (v / 340) * 50;
      const e = (2 * th) % 720;
      let h = `<line x1="${X(0)}" x2="${X(720)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
      for (const v of [325, -325]) h += `<text x="18" y="${Y(v) + 2}" font-size="6.5" text-anchor="end" fill="${C.mute}">${v > 0 ? '+' : '−'}325</text><line x1="${X(0)}" x2="${X(720)}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}" stroke-width=".6"/>`;
      for (let k = 0; k < 3; k++) {
        let d = '';
        for (let x = 0; x <= 720; x += 6) d += `${x ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(325 * Math.cos(((2 * th - e + x) * Math.PI) / 180 - (k * 2 * Math.PI) / 3)).toFixed(1)}`;
        h += `<path d="${d}" fill="none" stroke="${PHASE_COL[k]}" stroke-width="1.5"/>`;
      }
      h += `<line x1="${X(e)}" x2="${X(e)}" y1="${Y(340)}" y2="${Y(-340)}" stroke="${C.red}" stroke-width="1.4"/>`;
      h += `<text x="${X(720)}" y="${Y(-340) + 12}" font-size="6.2" letter-spacing="1" text-anchor="end" fill="${C.mute}">ЛИНЕЙНОЕ 400 В = √3 · 230 В</text>`;
      uw.innerHTML = h;
    }
    const engKw = pw.genKw / ALT.eta;
    const ev = [`${ENGINE.kw} кВт (макс. ${f1(ENGINE.kwMax)})`, '4 в ряд, 1-3-4-2', '1500 об/мин', '4 такта, в цилиндр*', `${f1(engKw)} кВт`, `≈ ${f1(pw.fuel)} л/ч`, `≈ ${Math.round((engKw / pw.fuelKw) * 100)} %`];
    engRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${ev[i]}</b>`));
    const av = ['бесщёточный синхр.', '4 (2 пары)', 'SHUNT + AVR ±1 %', `${Math.round(ALT.eta * 100)} % · класс H`, `${ALT.mass} кг · 640×490×560`, `${f1(pw.genKw)} кВт · ${f1(pw.genA)} А`];
    altRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${av[i]}</b>`));
    {
      const heat = pw.fuelKw - engKw;
      const steps = [['ТОПЛИВО', pw.fuelKw, '#5d6670'], ['ВАЛ ДИЗЕЛЯ', engKw, C.ink], ['ЭЛЕКТРИЧЕСТВО', pw.genKw, C.ink], ['ТЕПЛО', heat, C.orange]];
      let h = '';
      steps.forEach(([n, v, c], i) => {
        const x = 70 + i * 200;
        if (i && i < 3) h += `<line x1="${x - 150}" x2="${x - 50}" y1="16" y2="16" stroke="${C.faint}"/><path d="M${x - 50} 16 l-6 -3.5 v7 z" fill="${C.faint}"/><text x="${x - 100}" y="11" font-size="7.6" text-anchor="middle" fill="${C.mute}">${Math.round((v / steps[i - 1][1]) * 100)} %</text>`;
        if (i === 3) h += `<text x="${x - 100}" y="20" font-size="9" text-anchor="middle" fill="${C.mute}">а ещё</text>`;
        h += `<text x="${x}" y="20" font-size="13" font-weight="700" text-anchor="middle" fill="${c}">${f1(v)} кВт</text><text x="${x}" y="36" font-size="8.6" letter-spacing="1.2" font-weight="600" text-anchor="middle" fill="${C.mute}">${n}</text>`;
      });
      gsChain.innerHTML = h;
    }
  };
  /** the supply's panels: the set's load, the diagram with live values, the two starts, the energy chain */
  const drawPower = (s) => {
    const ms = s.ms;
    const pw = s.pw;
    gBig.textContent = `${Math.round(pw.load * 100)}`;
    gFill.style.width = `${Math.min(247, pw.load * 247).toFixed(1)}px`;
    // the diagram: G → QF1 → UZ1 → M, the cables and their live readings
    {
      const ink = C.ink;
      const x = 52;
      let h = '';
      const node = (y, label, sub, val) => `<text x="${x + 32}" y="${y - 2}" font-size="8.6" font-weight="700" fill="${ink}">${label}</text><text x="${x + 32}" y="${y + 9}" font-size="6.6" letter-spacing=".6" fill="${C.mute}">${sub}</text><text x="224" y="${y + 3}" font-size="7.6" font-weight="700" text-anchor="end" fill="${ink}">${val}</text>`;
      // G: a circle with a sine
      h += `<circle cx="${x}" cy="18" r="13" fill="#fff" stroke="${ink}" stroke-width="1.4"/><path d="M${x - 8} 18 q4 -8 8 0 t8 0" fill="none" stroke="${ink}" stroke-width="1.3"/><text x="${x - 24}" y="22" font-size="8" font-weight="700" fill="${ink}">G</text>`;
      h += node(16, 'ДГУ 20 кВт', '3~ 400/230 В · 50 ГЦ', `${f1(pw.genA)} А`);
      h += `<line x1="${x}" y1="31" x2="${x}" y2="52" stroke="${ink}" stroke-width="1.4"/><text x="${x - 6}" y="45" font-size="6.4" text-anchor="end" fill="${C.mute}">КГ 4×6</text>`;
      // QF1: a breaker
      h += `<line x1="${x}" y1="52" x2="${x + 9}" y2="66" stroke="${ink}" stroke-width="1.6"/><circle cx="${x}" cy="52" r="2" fill="${ink}"/><line x1="${x}" y1="66" x2="${x}" y2="74" stroke="${ink}" stroke-width="1.4"/><text x="${x - 6}" y="63" font-size="7" font-weight="700" text-anchor="end" fill="${ink}">QF1</text>`;
      h += node(63, 'Автомат 3P 40 А', 'ХАРАКТЕРИСТИКА C', '400 В');
      // UZ1: the converter, a box with ~ / ~
      h += `<rect x="${x - 14}" y="76" width="28" height="26" fill="#fff" stroke="${ink}" stroke-width="1.4"/><line x1="${x - 14}" y1="102" x2="${x + 14}" y2="76" stroke="${ink}" stroke-width=".8"/><text x="${x - 8}" y="87" font-size="7" fill="${ink}">~</text><text x="${x + 3}" y="99" font-size="7" fill="${ink}">~</text><text x="${x - 20}" y="93" font-size="7" font-weight="700" text-anchor="end" fill="${ink}">UZ1</text>`;
      h += node(89, 'ПЧ 11 кВт', `0–400 ГЦ · СЕЙЧАС ${f1(ms.f)} ГЦ`, `${f1(ms.iLine)} А`);
      h += `<line x1="${x}" y1="102" x2="${x}" y2="128" stroke="${ink}" stroke-width="1.4"/><text x="${x - 6}" y="120" font-size="6.4" text-anchor="end" fill="${C.mute}">ЭКРАН 4×4</text>`;
      // M: the motor
      h += `<circle cx="${x}" cy="142" r="14" fill="#fff" stroke="${ink}" stroke-width="1.4"/><text x="${x}" y="141" font-size="8" font-weight="700" text-anchor="middle" fill="${ink}">M</text><text x="${x}" y="150" font-size="6" text-anchor="middle" fill="${ink}">3~</text>`;
      h += node(140, 'АИР160S6 · Δ', `${Math.round(ms.u)} В · ${Math.round(s.rpm)} ОБ/МИН`, `${f1(s.N)} кВт`);
      // the earth along the left
      h += `<path d="M${x - 30} 18 V168 M${x - 36} 168 h12 M${x - 34} 171 h8 M${x - 32} 174 h4" stroke="#2f9e44" stroke-width="1" fill="none" stroke-dasharray="3 2"/><text x="${x - 30}" y="10" font-size="6.2" text-anchor="middle" fill="#2f9e44">PE</text>`;
      sld.innerHTML = h;
    }
    // starting: the line current over the first seconds, straight on the line against a 5 s ramp in the converter
    {
      const X = (t) => 22 + (t / 6) * 198;
      const Y = (a) => 112 - (a / 170) * 100;
      let h = '';
      for (const a of [0, 50, 100, 150]) h += `<text x="17" y="${Y(a) + 2.5}" font-size="6.5" text-anchor="end" fill="${C.mute}">${a}</text><line x1="${X(0)}" x2="${X(6)}" y1="${Y(a)}" y2="${Y(a)}" stroke="${C.line}" stroke-width=".6"/>`;
      h += `<text x="2" y="9" font-size="6.5" fill="${C.mute}">А</text>`;
      let dol = '';
      let vfd = '';
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * 6;
        dol += `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(pw.dol(t)).toFixed(1)}`;
        vfd += `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(pw.soft(t)).toFixed(1)}`;
      }
      h += `<line x1="${X(0)}" x2="${X(6)}" y1="${Y(GENSET.amps)}" y2="${Y(GENSET.amps)}" stroke="${C.ink}" stroke-width=".9" stroke-dasharray="4 2"/><text x="${X(6)}" y="${Y(GENSET.amps) - 3}" font-size="6.2" letter-spacing=".8" text-anchor="end" fill="${C.ink}">НОМИНАЛ ДГУ ${GENSET.amps} А</text>`;
      h += `<path d="${dol}" fill="none" stroke="${C.red}" stroke-width="1.6"/><path d="${vfd}" fill="none" stroke="${C.blue}" stroke-width="1.6"/>`;
      h += `<text x="${X(0.45)}" y="${Y(150)}" font-size="6.6" font-weight="700" fill="${C.red}">НАПРЯМУЮ ${Math.round(pw.dolPeak)} А</text><text x="${X(2.6)}" y="${Y(28)}" font-size="6.6" font-weight="700" fill="${C.blue}">ЧЕРЕЗ ПЧ</text>`;
      h += `<line x1="${X(0)}" x2="${X(6)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
      for (const t of [0, 1, 2, 3, 4, 5, 6]) h += `<text x="${X(t)}" y="${Y(0) + 10}" font-size="6.5" text-anchor="middle" fill="${C.mute}">${t}</text>`;
      h += `<text x="${X(6)}" y="${Y(0) + 20}" font-size="6.2" letter-spacing="1" text-anchor="end" fill="${C.mute}">ВРЕМЯ ОТ ПУСКА, С · ТОК ОТ ДГУ</text>`;
      st.innerHTML = h;
      stFoot.innerHTML = `Провал напряжения: напрямую ≈ <b style="color:${C.red}">${Math.round(pw.dipDol * 100)} %</b> · через ПЧ ≈ <b style="color:${C.blue}">${Math.round(pw.dipSoft * 100)} %</b>`;
    }
    const kw = (v) => `${f1(v)} кВт`;
    const gv = [`${GENSET.kw} кВт / ${GENSET.kva} кВА`, `${GENSET.volts} В`, `${GENSET.amps} А`, `≈ ${f1(pw.genA)} А`, `≈ ${f1(pw.fuel)} л/ч`, `≈ ${Math.round(GENSET.tank / pw.fuel)} ч`, `${GENSET.mass} кг · 2,1 м`];
    genRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${gv[i]}</b>`));
    const vv = [`${VFD.kw} кВт`, `3 × 380 В · ${VFD.inA} А`, `0–400 Гц · ${VFD.outA} А`, `${f1(ms.f)} Гц`, '5 с, ток ≤ 1,5 Iн', `170×320×196 · ${f1(VFD.mass)} кг`];
    vfdRows.forEach((r, i) => (r.innerHTML = `<b style="font-size:11px">${vv[i]}</b>`));
    // the chain: the fuel's heat, the set's output, the drive's, the shaft, the oil
    {
      const steps = [['ТОПЛИВО', pw.fuelKw, '#5d6670'], ['ГЕНЕРАТОР', pw.genKw, C.ink], ['ПЧ', ms.pIn, C.ink], ['ВАЛ', s.N, C.ink], ['МАСЛО', pw.hydKw, C.blue]];
      let h = '';
      steps.forEach(([n, v, c], i) => {
        const x = 40 + i * 165;
        if (i) h += `<line x1="${x - 125}" x2="${x - 40}" y1="16" y2="16" stroke="${C.faint}"/><path d="M${x - 40} 16 l-6 -3.5 v7 z" fill="${C.faint}"/><text x="${x - 82}" y="11" font-size="7.6" text-anchor="middle" fill="${C.mute}">${Math.round((v / steps[i - 1][1]) * 100)} %</text>`;
        h += `<text x="${x}" y="20" font-size="13" font-weight="700" text-anchor="middle" fill="${c}">${kw(v)}</text><text x="${x}" y="36" font-size="8.6" letter-spacing="1.2" font-weight="600" text-anchor="middle" fill="${C.mute}">${n}</text>`;
      });
      chain.innerHTML = h;
    }
  };
  /** the motor's panels from its state s.ms at supply angle s.elec (degrees) */
  const drawMotor = (s) => {
    const ms = s.ms;
    const dir = s.dir ?? 1;
    iBig.textContent = f1(ms.iLine);
    iFill.style.width = `${Math.min(247, (ms.iLine / I_MAX) * 247).toFixed(1)}px`;
    const lag = ms.phi;
    const th = (s.elec * Math.PI) / 180;
    const cur = [0, 1, 2].map((k) => Math.cos(th - lag - k * dir * ((2 * Math.PI) / 3)));
    const phase = dir * (th - lag) + (2 * Math.PI) / 3; // where the N poles are, electrical radians
    // the field across the bore: slots in their phase colours (filled: current toward us, ring: away), the six poles
    // as arrows across the gap, the rotor with its bars lit by the slip's current, its own mark and the field's
    {
      const cx = 113;
      const cy = 68;
      const Ro = 64;
      const Rb = 50;
      const Rr = 40;
      const P = (r, a) => [(cx + r * Math.cos(a)).toFixed(1), (cy - r * Math.sin(a)).toFixed(1)];
      let h = `<defs><marker id="ahn" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="#ff5c33"/></marker><marker id="ahs" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="#3385ff"/></marker></defs>`;
      h += `<circle cx="${cx}" cy="${cy}" r="${Ro}" fill="#eef0f2" stroke="${C.faint}"/><circle cx="${cx}" cy="${cy}" r="${Rb - 4}" fill="#fff" stroke="${C.faint}"/>`;
      for (let k = 0; k < EM.slots; k++) {
        const [ph, sg] = SLOT[k];
        const i = sg * cur[ph];
        const [x, y] = P(Rb + 4, ((k + 0.5) * 2 * Math.PI) / EM.slots);
        const r = (1.2 + 1.6 * Math.abs(i)).toFixed(2);
        h += i > 0 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${PHASE_COL[ph]}"/>` : `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${PHASE_COL[ph]}" stroke-width="1.1"/>`;
      }
      // the poles: N where the field leaves the rotor, S where it comes back, three pairs
      for (let k = 0; k < 2 * EM.p; k++) {
        const a = (phase + k * Math.PI) / EM.p;
        const n = k % 2 === 0;
        const c = n ? '#ff5c33' : '#3385ff';
        const [x0, y0] = P(n ? Rr - 6 : Rb + 2, a);
        const [x1, y1] = P(n ? Rb + 2 : Rr - 6, a);
        const [lx, ly] = P(Ro + 7, a);
        h += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${c}" stroke-width="2.2" marker-end="url(#ah${n ? 'n' : 's'})"/><text x="${lx}" y="${(+ly + 3).toFixed(1)}" font-size="7.5" font-weight="700" text-anchor="middle" fill="${c}">${n ? 'N' : 'S'}</text>`;
      }
      h += `<circle cx="${cx}" cy="${cy}" r="${Rr}" fill="#dfe2e6" stroke="${C.mute}" stroke-width=".8"/>`;
      const rot = ((s.phi ?? 0) * Math.PI) / 180;
      for (let k = 0; k < EM.bars; k++) {
        const a = (k * 2 * Math.PI) / EM.bars + rot;
        const i = Math.abs(Math.cos(EM.p * a - phase - Math.PI / 2));
        const [x, y] = P(Rr - 3, a);
        h += `<circle cx="${x}" cy="${y}" r="1.7" fill="${mix('c9ccd0', 'ffb21e', Math.min(1, i * (0.3 + ms.k)))}"/>`;
      }
      const [rx, ry] = P(Rr - 8, rot);
      const [fx, fy] = P(Ro + 1, phase / EM.p);
      h += `<line x1="${cx}" y1="${cy}" x2="${rx}" y2="${ry}" stroke="${C.ink}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="6" fill="#fff" stroke="${C.ink}"/>`;
      h += `<circle cx="${fx}" cy="${fy}" r="3" fill="#ff5c33" stroke="#fff"/>`;
      h += `<text x="2" y="10" font-size="7" letter-spacing="1" fill="${C.mute}">ВИД С ПРИВОДА</text><text x="224" y="10" font-size="7" letter-spacing="1" text-anchor="end" fill="${C.mute}">${dir > 0 ? 'A → B → C' : 'A → C → B'}</text>`;
      h += `<text x="224" y="132" font-size="7" text-anchor="end" fill="${C.mute}">● к нам ○ от нас</text>`;
      fieldSvg.innerHTML = h;
      fieldRpm.innerHTML = `n₁ <b style="color:${C.ink}">${Math.round(ms.n1)}</b> ОБ/МИН`;
      fieldFoot.innerHTML = `f <b style="color:${C.ink}">${f1(ms.f)}</b> Гц · p <b style="color:${C.ink}">3</b> · s <b style="color:${C.ink}">${f1(ms.s * 100)}</b> % · f₂ <b style="color:${C.ink}">${f2(ms.fRotor)}</b> Гц`;
    }
    // the torque curve at this supply frequency, the pump's torque across it, the working point where they meet
    {
      const n1 = ms.n1;
      const X = (n) => 24 + (n / 1050) * 196;
      const Y = (m) => 112 - (m / 260) * 100;
      let h = '';
      for (const m of [0, 100, 200]) h += `<text x="19" y="${Y(m) + 2.5}" font-size="6.5" text-anchor="end" fill="${C.mute}">${m}</text><line x1="${X(0)}" x2="${X(1050)}" y1="${Y(m)}" y2="${Y(m)}" stroke="${C.line}" stroke-width=".6"/>`;
      h += `<text x="2" y="9" font-size="6.5" fill="${C.mute}">Н·м</text>`;
      let d = '';
      for (let i = 0; i <= 80; i++) {
        const n = (i / 80) * n1;
        d += `${i ? 'L' : 'M'}${X(n).toFixed(1)} ${Y(torqueAt(1 - n / n1)).toFixed(1)}`;
      }
      h += `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`;
      h += `<line x1="${X(0)}" x2="${X(1050)}" y1="${Y(ms.m)}" y2="${Y(ms.m)}" stroke="${C.blue}" stroke-width="1.2" stroke-dasharray="3 2"/><text x="${X(30)}" y="${Y(ms.m) - 3}" font-size="6.2" letter-spacing=".8" fill="${C.blue}">НАСОС ${Math.round(ms.m)} Н·м</text>`;
      const nk = n1 * (1 - S_K);
      h += `<circle cx="${X(nk)}" cy="${Y(EM.lam * M_N)}" r="2" fill="${C.ink}"/><text x="${X(nk) - 4}" y="${Y(EM.lam * M_N) - 4}" font-size="6.2" text-anchor="end" fill="${C.mute}">Mmax ${Math.round(EM.lam * M_N)}</text>`;
      h += `<text x="${X(0) + 3}" y="${Y(EM.kStart * M_N) - 4}" font-size="6.2" fill="${C.mute}">Mпуск ${Math.round(EM.kStart * M_N)}</text>`;
      h += `<line x1="${X(n1)}" x2="${X(n1)}" y1="${Y(260)}" y2="${Y(0)}" stroke="${C.faint}" stroke-dasharray="2 2"/><text x="${X(n1) - 2}" y="${Y(240)}" font-size="6.2" text-anchor="end" fill="${C.mute}">n₁</text>`;
      h += `<line x1="${X(0)}" x2="${X(1050)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
      for (const n of [0, 250, 500, 750, 1000]) h += `<text x="${X(n)}" y="${Y(0) + 10}" font-size="6.5" text-anchor="middle" fill="${C.mute}">${n}</text>`;
      h += `<text x="${X(1050)}" y="${Y(0) + 20}" font-size="6.2" letter-spacing="1" text-anchor="end" fill="${C.mute}">ЧАСТОТА ВРАЩЕНИЯ, ОБ/МИН</text>`;
      h += `<circle cx="${X(s.rpm).toFixed(1)}" cy="${Y(ms.m).toFixed(1)}" r="3.2" fill="${C.red}"/>`;
      tq.innerHTML = h;
      tqFoot.innerHTML = `Mн <b style="color:${C.ink}">${Math.round(M_N)}</b> Н·м · загрузка <b style="color:${C.ink}">${Math.round(ms.k * 100)}</b> % · запас <b style="color:${C.ink}">${f1((EM.lam * M_N) / Math.max(1, ms.m))}</b>×`;
    }
    // the supply
    const line = Math.abs(ms.f - EM.f) < 1;
    supplyTag.innerHTML = line ? `<span class="mu">ОТ СЕТИ</span>` : `<span style="color:${C.amber}">ЧЕРЕЗ ПЧ</span>`;
    const sv = ['переменный, 3 фазы', `${Math.round(ms.u)} В линейное`, `${f1(ms.f)} Гц`, 'треугольник Δ', `${f1(ms.iPhase)} А`, `cos φ ${f2(ms.cos)}`, `≈ ${Math.round(EM.kI * EM.iN)} А (×${f1(EM.kI)})`];
    supply.forEach((r, i) => (r.innerHTML = `<b style="font-size:11.5px">${sv[i]}</b>`));
    // the phase currents: peak √2 · I, two periods with the cursor at now
    {
      const W = 232;
      const amp = Math.SQRT2 * ms.iLine;
      const top = Math.max(10, Math.ceil(amp / 10) * 10);
      const X = (d) => 18 + (d / 720) * (W - 26);
      const Y = (v) => 62 - (v / top) * 50;
      let h = `<line x1="${X(0)}" x2="${X(720)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
      for (const v of [top, -top]) h += `<text x="14" y="${Y(v) + 2}" font-size="6.5" text-anchor="end" fill="${C.mute}">${v > 0 ? '+' : '−'}${top}</text><line x1="${X(0)}" x2="${X(720)}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}" stroke-width=".6"/>`;
      const now = ((s.elec % 720) + 720) % 720;
      for (let k = 0; k < 3; k++) {
        let d = '';
        for (let e = 0; e <= 720; e += 6) d += `${e ? 'L' : 'M'}${X(e).toFixed(1)} ${Y(amp * Math.cos(((s.elec - now + e) * Math.PI) / 180 - lag - k * dir * ((2 * Math.PI) / 3))).toFixed(1)}`;
        h += `<path d="${d}" fill="none" stroke="${PHASE_COL[k]}" stroke-width="1.5"/>`;
      }
      h += `<line x1="${X(now)}" x2="${X(now)}" y1="${Y(top) - 3}" y2="${Y(-top)}" stroke="${C.red}" stroke-width="1.4"/>`;
      for (const e of [0, 180, 360, 540, 720]) h += `<text x="${X(e)}" y="${Y(-top) + 10}" font-size="6.5" text-anchor="middle" fill="${C.mute}">${e}°</text>`;
      h += `<text x="${X(720)}" y="${Y(-top) + 20}" font-size="6.2" letter-spacing="1" text-anchor="end" fill="${C.mute}">ДВА ПЕРИОДА · ${f1(1000 / ms.f)} МС КАЖДЫЙ</text>`;
      wave.innerHTML = h;
      waveLeg.innerHTML = cur.map((c, k) => `<span style="color:${PHASE_COL[k]}">—</span> i${PHASE_NAME[k]} <b>${c * amp >= 0 ? '+' : '−'}${Math.abs(c * amp).toFixed(0)}</b>`).join(' &nbsp; ');
    }
    // the power: in from the line, the losses on the way, out on the shaft
    {
      const L = ms.loss;
      const parts = [L.cuS, L.fe, L.cuR, L.mech, L.add, s.N];
      const cols = LOSS.slice(1).map(([, c]) => c);
      let x = 0;
      let h = '';
      parts.forEach((v, i) => {
        const w = (v / ms.pIn) * 224;
        h += `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(0.6, w).toFixed(1)}" height="14" fill="${cols[i]}"/>`;
        x += w;
      });
      pBar.innerHTML = h;
      const vals = [ms.pIn, ...parts];
      balance.forEach((r, i) => (r.innerHTML = `<b>${vals[i] < 1 ? `${Math.round(vals[i] * 1000)} Вт` : `${f2(vals[i])} кВт`}</b>`));
      etaTag.innerHTML = `КПД <span style="color:${C.red}">${f1(ms.eta * 100)} %</span>`;
    }
    slipLine.innerHTML = `Поле <b style="color:#ff5c33">${Math.round(ms.n1)}</b> об/мин &nbsp;→&nbsp; ротор <b>${Math.round(s.rpm)}</b> об/мин &nbsp;·&nbsp; скольжение <b style="color:${C.red}">${f1(ms.s * 100)} %</b>`;
  };

  return {
    spots,
    rpmKnob: (v) => [knobX(v), sRpm.y],
    pKnob: (v) => [knobX(v), sP.y],
    playKnob: (v) => [knobX(v), sPlay.y],
    btn,
    root: ui,
    update(s) {
      // the overlay for the view, the pump's or the motor's, switched first so every width below is measured shown
      const mode = s.mode ?? 'pump';
      if (mode !== modeNow) {
        modeNow = mode;
        for (const n of byMode) n.classList.toggle('off', n.dataset.m !== mode);
      }
      const fl = s.flows;
      const dir = s.dir ?? 1;
      qBig.textContent = f1(fl.net);
      qFill.style.width = `${Math.min(247, (fl.net / Q_MAX) * 247).toFixed(1)}px`;
      sRpm.val.textContent = `${Math.round(s.rpm)} ОБ/МИН`;
      sRpm.knob.style.left = `${knobX(s.rpmK).toFixed(1)}px`;
      sP.val.textContent = `${f2(s.p)} МПА`;
      sP.knob.style.left = `${knobX(s.p / P_MAX).toFixed(1)}px`;
      sPlay.val.textContent = s.playText;
      sPlay.knob.style.left = `${knobX(s.playK).toFixed(1)}px`;
      btn.pause.innerHTML = s.paused ? '▶ &nbsp;ПУСК' : '❚❚ &nbsp;ПАУЗА';

      // the mesh from the drive end: pitch and tip circles, the teeth turning, every space coloured by its pressure
      const phi = s.phi;
      meshAng.innerHTML = `ВАЛ <b style="color:${C.ink}">${Math.round(mod(phi, 360))}°</b>`;
      {
        const k = 0.6;
        const cx = 113;
        const yT = 36;
        const yB = yT + G.a * k;
        let h = '';
        for (const [cy, gear] of [[yT, 1], [yB, -1]]) {
          h += `<circle cx="${cx}" cy="${cy}" r="${G.ra * k}" fill="none" stroke="${C.line}"/><circle cx="${cx}" cy="${cy}" r="${G.r * k}" fill="none" stroke="${C.faint}" stroke-dasharray="2 2"/>`;
          for (let i = 0; i < G.z; i++) {
            // the teeth: drive tooth i at i·DA − 90 + phi (CCW), driven at i·DA + 90 + DA/2 − phi (CW); screen y down
            const a = ((gear > 0 ? i * DA - 90 + phi : i * DA + 90 + DA / 2 - phi) * Math.PI) / 180;
            h += `<line x1="${(cx + Math.cos(a) * G.rf * k).toFixed(1)}" y1="${(cy - Math.sin(a) * G.rf * k).toFixed(1)}" x2="${(cx + Math.cos(a) * G.ra * k).toFixed(1)}" y2="${(cy - Math.sin(a) * G.ra * k).toFixed(1)}" stroke="${C.ink}" stroke-width="2.2"/>`;
          }
          for (let j = 0; j < G.z; j++) {
            // where the space is does not depend on the way round; its phase and pressure do
            const uF = travelU(gear, j, phi, 1);
            const u = travelU(gear, j, phi, dir);
            const th = ((gear > 0 ? uF - 90 : 90 - uF) * Math.PI) / 180;
            const f = fillOf(u);
            if (f < 0.05) continue;
            const key = keyOf(gapPressure(u, s.p, gear), s.p);
            const r = (G.rf + G.ra) / 2;
            const lit = gear > 0 && j === 0;
            h += `<circle cx="${(cx + Math.cos(th) * r * k).toFixed(1)}" cy="${(cy - Math.sin(th) * r * k).toFixed(1)}" r="${(lit ? 3.6 : 2.6) * Math.sqrt(f)}" fill="${mix('3d8fe0', 'f05a23', key)}" ${lit ? `stroke="${C.red}" stroke-width="1.6"` : ''}/>`;
          }
          h += `<circle cx="${cx}" cy="${cy}" r="${22 * k}" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/>`;
        }
        // the ports: suction on the right, discharge on the left, both arrows pointing the way the oil goes
        // reversed, the two swap sides and the arrows point right
        const yP = yT + ((187 - 170) / 1) * k;
        const [cR, nR, cL, nL] = dir > 0 ? [C.blue, 'ВСАС.', C.orange, 'НАГН.'] : [C.orange, 'НАГН.', C.blue, 'ВСАС.'];
        const tipR = dir > 0 ? `M190 ${yP} l7 -4 v8 z` : `M222 ${yP} l-7 -4 v8 z`;
        const tipL = dir > 0 ? `M4 ${yP} l7 -4 v8 z` : `M36 ${yP} l-7 -4 v8 z`;
        h += `<path d="M222 ${yP} L190 ${yP}" stroke="${cR}" stroke-width="2"/><path d="${tipR}" fill="${cR}"/><text x="222" y="${yP - 7}" font-size="7" letter-spacing="1" text-anchor="end" fill="${C.mute}">${nR}</text>`;
        h += `<path d="M36 ${yP} L4 ${yP}" stroke="${cL}" stroke-width="2"/><path d="${tipL}" fill="${cL}"/><text x="4" y="${yP - 7}" font-size="7" letter-spacing="1" fill="${C.mute}">${nL}</text>`;
        h += `<text x="${cx + 42}" y="${yT - 22}" font-size="7" fill="${C.mute}">ведущий ${dir > 0 ? '↺' : '↻'}</text><text x="${cx + 42}" y="${yB + 30}" font-size="7" fill="${C.mute}">ведомый ${dir > 0 ? '↻' : '↺'}</text>`;
        mesh.innerHTML = h;
      }

      // the Q–p characteristic at the current speed: theory, delivered, the bypass between them
      qpRpm.innerHTML = `<b style="color:${C.ink}">${Math.round(s.rpm)}</b> ОБ/МИН`;
      {
        const X = (p) => 22 + (p / P_MAX) * 198;
        const Y = (q) => 112 - (q / Q_MAX) * 100;
        let h = '';
        for (const q of [0, 20, 40]) h += `<text x="17" y="${Y(q) + 2.5}" font-size="6.5" text-anchor="end" fill="${C.mute}">${q}</text><line x1="${X(0)}" x2="${X(P_MAX)}" y1="${Y(q)}" y2="${Y(q)}" stroke="${C.line}" stroke-width=".6"/>`;
        h += `<text x="2" y="9" font-size="6.5" fill="${C.mute}">м³/ч</text>`;
        let net = '';
        let pumped = '';
        let theory = '';
        for (let i = 0; i <= 60; i++) {
          const p = (i / 60) * P_MAX;
          const fl2 = flow(s.rpm, p, dir);
          net += `${i ? 'L' : 'M'}${X(p).toFixed(1)} ${Y(fl2.net).toFixed(1)}`;
          pumped += `${i ? 'L' : 'M'}${X(p).toFixed(1)} ${Y(fl2.th - fl2.leak).toFixed(1)}`;
          theory += `${i ? 'L' : 'M'}${X(p).toFixed(1)} ${Y(fl2.th).toFixed(1)}`;
        }
        const back = [];
        for (let i = 60; i >= 0; i--) {
          const p = (i / 60) * P_MAX;
          back.push(`L${X(p).toFixed(1)} ${Y(flow(s.rpm, p, dir).net).toFixed(1)}`);
        }
        h += `<path d="${pumped}${back.join('')}Z" fill="rgba(242,165,22,.28)"/>`;
        h += `<path d="${theory}" fill="none" stroke="${C.mute}" stroke-width="1" stroke-dasharray="3 2"/><path d="${net}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`;
        for (const [p, n] of [[RATED.p, 'НОМ.'], [RATED.full, 'ПЕРЕПУСК']]) h += `<line x1="${X(p)}" x2="${X(p)}" y1="${Y(Q_MAX)}" y2="${Y(0)}" stroke="${C.faint}" stroke-width=".8" stroke-dasharray="2 2"/><text x="${X(p) - 2}" y="${Y(Q_MAX) + 7}" font-size="6.2" letter-spacing=".8" text-anchor="end" fill="${C.mute}">${n}</text>`;
        h += `<line x1="${X(0)}" x2="${X(P_MAX)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
        for (const p of [0, 0.1, 0.2, 0.3, 0.4]) h += `<text x="${X(p)}" y="${Y(0) + 10}" font-size="6.5" text-anchor="middle" fill="${C.mute}">${f1(p * 10).replace(',0', '')}</text>`;
        h += `<text x="${X(P_MAX)}" y="${Y(0) + 20}" font-size="6.2" letter-spacing="1" text-anchor="end" fill="${C.mute}">ДАВЛЕНИЕ, КГС/СМ²</text>`;
        if (dir < 0) h += `<rect x="${X(RATED.full)}" y="${Y(Q_MAX)}" width="${X(P_MAX) - X(RATED.full)}" height="${Y(0) - Y(Q_MAX)}" fill="rgba(214,24,43,.12)"/><text x="${X(0.2)}" y="${Y(12)}" font-size="6.6" letter-spacing=".8" font-weight="700" text-anchor="middle" fill="${C.red}">КЛАПАН НЕ ОТКРЫВАЕТСЯ</text>`;
        h += `<circle cx="${X(s.p).toFixed(1)}" cy="${Y(fl.net).toFixed(1)}" r="3.2" fill="${C.red}"/>`;
        qp.innerHTML = h;
      }

      // the tracked space: its phase, the pressure in it
      const u = s.u;
      const ph = phaseOf(u, 1);
      gapAng.innerHTML = `<b style="color:${C.ink}">${Math.round(mod(u, 360))}°</b> ОТ ЗАЦЕПЛ.`;
      const name = PHASES[ph];
      phaseBig.textContent = name.charAt(0) + name.slice(1).toLowerCase();
      phaseBig.style.color = ph === 2 ? C.red : C.ink;
      phaseList.innerHTML = PHASES.map((n, i) => `<div class="cp" style="height:16.5px;display:flex;align-items:center;gap:10px;font-weight:500;color:${i === ph ? C.ink : C.mute}"><i style="display:block;width:31px;height:2px;background:${i === ph ? C.red : C.line}"></i>${n}</div>`).join('');
      const pg = gapPressure(u, s.p, 1);
      pBig.textContent = f2(pg);
      pUnit.style.left = `${1334 + pBig.getBoundingClientRect().width + 8}px`;
      pFill.style.width = `${Math.max(0, Math.min(224, ((pg + 0.05) / 0.55) * 224)).toFixed(1)}px`;

      // pressure and fill over a turn, the cursor on the tracked space
      {
        const W = 232;
        const X = (d) => 18 + (d / 360) * (W - 26);
        const Y = (p) => 108 - ((p + 0.05) / 0.55) * 96;
        const [c0, c1] = SEAL[1];
        const bands = [[0, 24, 3], [24, c0, 0], [c0, c1, 1], [c1, 336, 2], [336, 360, 3]];
        let h = '';
        for (const [a, b, k] of bands) h += `<rect x="${X(a)}" y="${Y(0.5)}" width="${X(b) - X(a)}" height="${Y(-0.05) - Y(0.5)}" fill="${k === ph ? (k === 2 ? 'rgba(214,24,43,.1)' : 'rgba(20,22,26,.06)') : 'none'}"/>`;
        for (const d of [24, c0, c1, 336]) h += `<line x1="${X(d)}" x2="${X(d)}" y1="${Y(0.5)}" y2="${Y(-0.05)}" stroke="${C.line}" stroke-width=".8"/>`;
        [['ВСАС.', 24, c0], ['ПЕРЕНОС', c0, c1], ['НАГН.', c1, 336]].forEach(([n, a, b]) => (h += `<text x="${X((a + b) / 2)}" y="10" font-size="6.2" letter-spacing=".8" text-anchor="middle" fill="${C.mute}">${n}</text>`));
        for (const [v, l] of [[0, '0'], [0.25, '0,25'], [0.5, '0,5']]) h += `<text x="14" y="${Y(v) + 2}" font-size="6.5" text-anchor="end" fill="${C.mute}">${l}</text>`;
        h += `<line x1="${X(0)}" x2="${X(360)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
        let pp = '';
        let ff = '';
        for (let d = 0; d <= 360; d += 3) {
          pp += `${d ? 'L' : 'M'}${X(d).toFixed(1)} ${Y(gapPressure(d, s.p, 1)).toFixed(1)}`;
          ff += `${d ? 'L' : 'M'}${X(d).toFixed(1)} ${Y(-0.05 + fillOf(d) * 0.5).toFixed(1)}`;
        }
        h += `<path d="${ff}" fill="none" stroke="${C.blue}" stroke-width="1.1" opacity=".7"/><path d="${pp}" fill="none" stroke="${C.orange}" stroke-width="1.6"/>`;
        const cxp = X(mod(u, 360));
        h += `<line x1="${cxp}" x2="${cxp}" y1="${Y(0.5) - 2}" y2="${Y(-0.05)}" stroke="${C.red}" stroke-width="1.4"/>`;
        for (const d of [0, 90, 180, 270, 360]) h += `<text x="${X(d)}" y="${Y(-0.05) + 10}" font-size="6.5" text-anchor="middle" fill="${C.mute}">${d}</text>`;
        h += `<text x="${X(360)}" y="${Y(-0.05) + 20}" font-size="6.2" letter-spacing="1" text-anchor="end" fill="${C.mute}">УГОЛ ОТ ЗАЦЕПЛЕНИЯ, °</text>`;
        turn.innerHTML = h;
        turnLeg.innerHTML = `<span style="color:${C.orange}">—</span> ДАВЛ. <b>${f2(pg)}</b> МПА &nbsp; <span style="color:${C.blue}">—</span> ЗАПОЛН. <b>${Math.round(fillOf(u) * 100)}</b> %`;
      }

      // drive and valve
      const open = s.open;
      valveState.innerHTML = dir < 0 ? `<span style="color:${C.red}">КЛАПАН ЗАПЕРТ</span>` : open > 0.01 ? `<span style="color:${C.amber}">КЛАПАН ОТКРЫТ ${Math.round(open * 100)} %</span>` : `<span class="mu">КЛАПАН ЗАКРЫТ</span>`;
      // reversed: the valve is pressed onto its seat, nothing limits the pressure
      warn.style.display = dir < 0 ? 'block' : 'none';
      if (dir < 0) {
        const over = s.p > RATED.full;
        warn.style.background = over ? C.red : C.ink;
        warn.innerHTML = `<div class="cp" style="font-weight:700;font-size:10px;letter-spacing:1.4px">${over ? `ПЕРЕГРУЗКА · ${f2(s.p)} МПА — ВЫШЕ ДАВЛЕНИЯ ПОЛНОГО ПЕРЕПУСКА` : 'РЕВЕРС · ВСАСЫВАНИЕ И НАГНЕТАНИЕ ПОМЕНЯЛИСЬ МЕСТАМИ'}</div><div style="font-size:10.5px;margin-top:3px;opacity:.88">Клапан прижат к седлу давлением со стороны пружины — давление ничем не ограничено</div>`;
      }
      // the motor: its load against the nameplate, the current roughly from the no-load third up to the rated 24.6 A
      const load = s.N / MOTOR.kw;
      const amps = MOTOR.amps * (0.36 + 0.64 * load);
      const vals = [`${f1(s.N)} кВт`, `${Math.round(load * 100)} %`, `≈ ${f1(amps)} А`, `${Math.round(s.T)} Н·м`, `${Math.round(s.eta * 100)} %`, `${f1(fl.th)} м³/ч`, `${f1(fl.leak)} м³/ч`, `${f1(fl.bypass)} м³/ч`];
      const hot = [false, load > 1, load > 1, false, false, false, false, fl.bypass > 0.05];
      rows.forEach((r, i) => (r.innerHTML = `<b style="color:${hot[i] ? (i === 7 ? C.amber : C.red) : C.ink}">${vals[i]}</b>`));

      // the phase strip: the four phases in a row, the tracked space's one lit, a dot travelling along
      {
        const xs = [40, 190, 340, 490];
        let h = `<line x1="${xs[0]}" x2="${xs[3]}" y1="14" y2="14" stroke="${C.faint}"/>`;
        const order = [0, 1, 2, 3];
        order.forEach((k, i) => {
          const on = k === ph;
          h += `<circle cx="${xs[i]}" cy="14" r="${on ? 7 : 5}" fill="${on ? C.red : '#fff'}" stroke="${on ? C.red : C.faint}" stroke-width="1.3"/>`;
          h += `<text x="${xs[i]}" y="35" font-size="9" letter-spacing="1.2" text-anchor="middle" font-weight="600" fill="${on ? C.ink : C.mute}">${PHASES[k]}</text>`;
        });
        // the dot's position along the strip by its travel angle
        const [c0, c1] = SEAL[1];
        const uu = mod(u - 24, 360);
        const seg = [[0, c0 - 24], [c0 - 24, c1 - 24], [c1 - 24, 312], [312, 360]];
        let x = xs[0];
        for (let i = 0; i < 4; i++) {
          const [a, b] = seg[i];
          if (uu >= a && uu < b) x = xs[i] + ((uu - a) / (b - a)) * (i < 3 ? xs[i + 1] - xs[i] : 50);
        }
        h += `<circle cx="${x.toFixed(1)}" cy="14" r="2.6" fill="${C.ink}"/>`;
        strip.innerHTML = h;
      }

      if (mode === 'motor') drawMotor(s);
      if (mode === 'power') drawPower(s);
      if (mode === 'genset') drawGenset(s);
      if (mode === 'truck') drawTruck(s);
      if (mode === 'pipes') drawPipes(s);
      if (mode === 'site') drawSite(s);

      // toggles
      const paint = (k, on, colOn) => {
        btn[k].style.background = on ? colOn : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? colOn : C.line;
      };
      for (const k of CAMS) paint(k, s.cam === k, C.ink);
      for (const k of CUTS) paint(k, s.cut === k, C.ink);
      for (const k of OVERLAYS) paint(k, !!s.overlays[k], C.red);
      paint('reverse', !!s.reverse, C.red);

      // callouts: a label, a thin leader to its point in the pump
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${lx.toFixed(1)},${(ly + 16).toFixed(1)} ${(lx + c.w).toFixed(1)},${(ly + 16).toFixed(1)}" fill="none" stroke="${C.mute}" stroke-width=".8" opacity="${c.o.toFixed(2)}"/>`;
        if (c.name) ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 10).toFixed(1)}px;opacity:${c.o.toFixed(2)}"><b>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
  };
}
