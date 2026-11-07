// Pumping И-20А from the 80 m³ storage tank into tankers in turn with one pump: the KAMAZ (8 m³), then up to three
// Scania semitrailers. The hydraulics of the suction hose and of each discharge line, the pump's flow against them, and
// the levels in all the tanks over the run, integrated once per set of conditions (CFG, changed from the panel).
//
// И-20А (ГОСТ 20799-88): kinematic viscosity 29–35 mm²/s at 40 °C, pour point ≤ −15 °C, flash ≥ 180 °C, density
// 880–890 kg/m³ at 20 °C (suppliers' data sheets; 885 taken). The viscosity at any temperature follows ASTM D341
// (Walther) through 32 mm²/s at 40 °C and ≈ 5.3 mm²/s at 100 °C (typical for this grade): ≈ 88 mm²/s at 20 °C, ≈ 350
// at 0 °C, ≈ 1430 at −15 °C. The density falls 0.065 % a degree.
//
// The pump (manual 867-010-00-1 РЭ, tables 1–2): its curves are given at 75 mm²/s (10 °ВУ); oil and crude from 20 to
// 280 mm²/s (3–35 °ВУ), at most 70 °C; permissible vacuum suction lift 5 m. Its leakage is laminar flow through the
// gaps, so it scales as 1/ν from the 75 mm²/s it was calibrated at (kin.js); its viscous friction (an estimate: 0.35
// kW at 75 mm²/s and 980 rpm) as ν·n². When the vacuum at the inlet would pass 5 m of oil the pump stops filling its
// gaps: the flow is cut back to where the inlet holds exactly 5 m (cavitation, shown as a warning).
//
// The storage tank's outlet sits by its floor: below 0.3 m of oil over the floor (≈ 3 nozzle diameters) the outlet
// draws a vortex and air, so the run stops there and whatever tanker is filling stays short.
import {flow, power} from './kin.js';
import {motorState} from './elec.js';
import {fuelAt, GENSET} from './supply.js';
import {GROUND} from './truck.js';

export const OIL = {name: 'И-20А', gost: 'ГОСТ 20799-88', rho: 885, nu40: 32, nu100: 5.3, pour: -15, flash: 180};
// ASTM D341: log log (ν + 0.7) = A − B log T (T in K), fitted through the two points above
const WAL = (() => {
  const ll = (nu) => Math.log10(Math.log10(nu + 0.7));
  const t1 = Math.log10(313.15);
  const t2 = Math.log10(373.15);
  const B = (ll(OIL.nu40) - ll(OIL.nu100)) / (t2 - t1);
  return {A: ll(OIL.nu40) + B * t1, B};
})();
/** kinematic viscosity (mm²/s) and density (kg/m³) of the oil at t °C */
export const nuAt = (t) => 10 ** (10 ** (WAL.A - WAL.B * Math.log10(t + 273.15))) - 0.7;
export const rhoAt = (t) => OIL.rho * (1 - 0.00065 * (t - 20));
OIL.nu20 = Math.round(nuAt(20));

// the pump's limits from its manual
export const PUMP_LIM = {nuMin: 20, nuMax: 280, nuRated: 75, tMax: 70, hVac: 5};

export const PLAN = {resCap: 80, kamCap: 8, accel: 100};
// what the panel changes: the oil's temperature, the drive's frequency, the line, the trucks, the tank's start volume
export const CFG = {temp: 20, hz: 50, swapMin: 5, extraS: 0, extraD: 0, kamaz: true, nScania: 3, scCap: 20, res0: 72, fill: 0.95};
export const CFG_DEFAULT = {...CFG};

// the KAMAZ's tank inside (measured off the model, the length set so it holds exactly 8 m³): an elliptic barrel along z
export const KTANK = {a: 1080, b: 590, len: 4000, x: -5600, yc: GROUND + 1863, zc: 1000};
KTANK.len = (PLAN.kamCap * 1e9) / (Math.PI * KTANK.a * KTANK.b);
// heights in the pump's frame, mm: the pump's ports, the tank's floor, the tanker's hatch (where the hose ends)
export const Y = {pumpIn: 170, pumpOut: 170, hatch: GROUND + 2905};

// The three Scania S730 tractors with their semitrailer tanks (the user's model). The model's own tank holds only
// ≈ 12 m³, so it is replaced on the trailer's frame by a real 20 m³ one (site.js): an elliptic barrel 2.5 m wide and
// 1.6 m high on the frame 1.3 m up, its length set by the volume (6.37 m), with dished ends; the filling hatch on top
// 3440 mm ahead of the trailer's rear face.
export const SCANIA = {xs: [-9300, -12900, -16500], zRear: 4040, hatchZ: 3440, a: 1250, b: 800, floor: 1300, z0: 900, cap: 20};
SCANIA.yc = GROUND + SCANIA.floor + SCANIA.b;
SCANIA.len = (SCANIA.cap * 1e9) / (Math.PI * SCANIA.a * SCANIA.b);
SCANIA.hatchY = GROUND + SCANIA.floor + 2 * SCANIA.b + 120;
// the scene's four vessels in their filling order: the KAMAZ first (it stands nearest), then the Scanias outward. A
// vessel the panel leaves out keeps its place in the scene and gets nothing.
export const VESSELS = [
  {id: 'kam', name: 'КАМАЗ', cap: PLAN.kamCap, a: KTANK.a, b: KTANK.b, len: KTANK.len, hatchY: Y.hatch},
  ...SCANIA.xs.map((x, i) => ({id: `s${i + 1}`, name: `Scania №${i + 1}`, cap: SCANIA.cap, a: SCANIA.a, b: SCANIA.b, len: SCANIA.len, hatchY: SCANIA.hatchY, x})),
];
/** which vessels take part under cfg, and the Scanias' capacity (the drawn tank stays, its level is the fraction) */
export const applyCfg = (cfg) => {
  VESSELS.forEach((ve, k) => {
    ve.on = k ? k <= cfg.nScania : cfg.kamaz;
    if (k) {
      ve.cap = cfg.scCap;
      ve.len = (cfg.scCap * 1e9) / (Math.PI * ve.a * ve.b);
    }
  });
};
/** the volume (m³) in a vessel at a depth h (mm) over its inside bottom, and its inverse */
export const vesselVolume = (ve, h) => {
  const d = Math.min(2, Math.max(0, h / ve.b));
  const seg = Math.acos(1 - d) - (1 - d) * Math.sqrt(Math.max(0, 2 * d - d * d));
  return (ve.len * ve.a * ve.b * seg) / 1e9;
};
export const vesselDepth = (ve, v) => {
  let lo = 0;
  let hi = 2 * ve.b;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (vesselVolume(ve, m) < v) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};
export const kamVolume = (h) => vesselVolume(VESSELS[0], h);
export const kamDepth = (v) => vesselDepth(VESSELS[0], v);

/** the run over the chosen vessels in turn: the suction hose's length, each discharge hose's length to its vessel (mm),
 *  the tank's inside radius and floor (mm), the conditions; returns state(seconds) */
export function planTransfer({lenS, lenD, resR, resFloor, cfg = CFG}) {
  applyCfg(cfg);
  const g = 9.81;
  const d = 0.075;
  const A = (Math.PI * d * d) / 4;
  const area = (Math.PI * resR * resR) / 1e6; // m²
  const nuMm = nuAt(cfg.temp);
  const nu = nuMm * 1e-6;
  const rho = rhoAt(cfg.temp);
  const rpm = (980 * cfg.hz) / 50;
  const flows = cfg.temp > OIL.pour;
  const sLen = lenS + cfg.extraS * 1000;
  const dLen = lenD.map((l) => l + cfg.extraD * 1000);
  const vMin = area * 0.3; // the heel the outlet needs
  const warnings = [];
  if (!flows) warnings.push(`Масло застыло: ${cfg.temp} °С не выше температуры застывания ${OIL.pour} °С — перекачка невозможна, нужен подогрев`);
  else if (nuMm > PUMP_LIM.nuMax) warnings.push(`Вязкость ${Math.round(nuMm)} мм²/с выше допустимых для насоса ${PUMP_LIM.nuMax} мм²/с — греть масло или рукава`);
  if (cfg.temp > PUMP_LIM.tMax) warnings.push(`Температура ${cfg.temp} °С выше допустимых для насоса ${PUMP_LIM.tMax} °С`);
  // the state of the lines at a flow q (m³/h) with the oil at a height zs (mm) in the storage tank, filling vessel k
  const lines = (q, zs, k) => {
    const v = q / 3600 / A;
    const hv = (v * v) / (2 * g);
    const re = (v * d) / nu;
    const lam = re < 2300 ? 64 / Math.max(re, 1) : 0.3164 / re ** 0.25;
    // suction: the tank's nozzle and gate valve (0.5 + 0.2), four bends, the filter (Kv 131 as in pipes.js, its loss
    // growing with the viscosity over the 75 mm²/s it was rated near)
    const fk = 1.5 * Math.max(1, nuMm / PUMP_LIM.nuRated) ** 0.5;
    const lossS = (lam * (sLen / 1000 / d) + 0.7 + 4 * 0.3) * hv + ((0.88 * (q / 131) ** 2 * fk) * 1e5) / (rho * g);
    // discharge: five bends and the free outlet in the hatch (1.0)
    const lossD = (lam * (dLen[k] / 1000 / d) + 5 * 0.3 + 1.0) * hv;
    const hs = (zs - Y.pumpIn) / 1000;
    const hd = (VESSELS[k].hatchY - Y.pumpOut) / 1000;
    const pIn = (rho * g * (hs - lossS - hv)) / 1e6;
    const pOut = (rho * g * (hd + lossD)) / 1e6;
    return {v, hv, re, lam, lossS, lossD, hs, hd, pIn, pOut, dp: Math.max(0, pOut - pIn), hVac: Math.max(0, (-pIn * 1e6) / (rho * g))};
  };
  // the pump's net flow at a pressure rise dp for this oil: the leakage laminar, so ∝ 1/ν
  const netFlow = (dp) => {
    const f = flow(rpm, dp);
    const leak = Math.min(f.th, f.leak * (PUMP_LIM.nuRated / nuMm));
    return {...f, leak, net: Math.max(0, f.th - leak - f.bypass)};
  };
  // the operating point: the pump against the line; cut back to 5 m of vacuum if the inlet would go past it
  const operate = (zs, k) => {
    if (!flows) return {q: 0, cav: false, ...lines(0, zs, k)};
    let q = netFlow(0.1).net;
    let L;
    for (let i = 0; i < 6; i++) {
      L = lines(q, zs, k);
      q = netFlow(L.dp).net;
    }
    L = lines(q, zs, k);
    if (L.hVac <= PUMP_LIM.hVac) return {q, cav: false, ...L};
    let lo = 0;
    let hi = q;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (lines(m, zs, k).hVac > PUMP_LIM.hVac) hi = m;
      else lo = m;
    }
    return {q: lo, cav: true, ...lines(lo, zs, k)};
  };
  const visc = (rpm / 980) ** 2 * 0.35 * (nuMm / PUMP_LIM.nuRated - 1);
  // the run, second by second: each chosen vessel filled to its fill in turn, the levels following; between vessels the
  // pump stands for the hose change and the generator idles; the run ends early if the storage tank reaches its heel
  const order = VESSELS.map((ve, k) => k).filter((k) => VESSELS[k].on);
  const ends = VESSELS.map((ve) => (ve.on ? ve.cap * cfg.fill : 0));
  const totalEnd = ends.reduce((x, y) => x + y, 0);
  const tStart = VESSELS.map(() => 0);
  const tEnd = VESSELS.map(() => 0);
  const dt = 1;
  const steps = [];
  let vRes = cfg.res0;
  const vols = VESSELS.map(() => 0);
  let t = 0;
  let energy = 0;
  let fuel = 0;
  let last = {zs: resFloor, ...lines(0, resFloor, order[0] ?? 0), q: 0, cav: false};
  let cavSec = 0;
  let stop = '';
  const tMax = 24 * 3600;
  for (const [n, k] of order.entries()) {
    if (stop) break;
    if (n) {
      for (let w = 0; w < cfg.swapMin * 60; w += dt) {
        steps.push({...last, t, vRes, vols: [...vols], active: -1, next: k, q: 0, v: 0, n2: 0, p1: 0, iLine: 0, genKw: 0, energy, fuel});
        fuel += (fuelAt(0.03) * dt) / 3600;
        t += dt;
      }
    }
    tStart[k] = t;
    for (;;) {
      const zs = resFloor + (vRes / area) * 1000;
      const op = operate(zs, k);
      const n2 = flows ? Math.max(0.2, power(rpm, op.dp) + visc) : 0;
      const ms = motorState(rpm, n2);
      const genKw = ms.pIn / 0.975;
      last = {zs, ...op};
      if (vols[k] >= ends[k] - 1e-9) break;
      if (vRes <= vMin + 1e-9) {
        stop = 'heel';
        break;
      }
      if (op.q <= 1e-6 || t > tMax) {
        stop = flows ? 'time' : 'frozen';
        break;
      }
      steps.push({t, vRes, vols: [...vols], active: k, next: k, zs, ...op, n2, p1: ms.pIn, iLine: ms.iLine, genKw, energy, fuel});
      const dv = Math.min((op.q / 3600) * dt, ends[k] - vols[k], vRes - vMin);
      vols[k] += dv;
      vRes -= dv;
      if (op.cav) cavSec += dt;
      energy += (ms.pIn * dt) / 3600;
      fuel += (fuelAt(genKw / GENSET.kw) * dt) / 3600;
      t += dt;
    }
    tEnd[k] = t;
  }
  steps.push({...last, t, vRes, vols: [...vols], active: -1, next: -1, q: 0, v: 0, n2: 0, p1: 0, iLine: 0, genKw: 0, energy, fuel});
  const delivered = vols.reduce((x, y) => x + y, 0);
  if (stop === 'heel') warnings.push(`Резервуар опустел до неснижаемого остатка ${vMin.toFixed(1)} м³ (0,3 м): недолив ${(totalEnd - delivered).toFixed(1)} м³`);
  if (cavSec > 0) warnings.push(`Кавитация ${Math.round(cavSec / 60)} мин: разрежение на входе дошло до 5 м — подача урезана`);
  const T = t;
  /** the transfer at s seconds into it (held at the end once the last tanker is full) */
  const state = (s) => {
    const kk = Math.max(0, Math.min(steps.length - 1, s));
    const i = Math.floor(kk);
    const a = steps[i];
    const b = steps[Math.min(steps.length - 1, i + 1)];
    const f = kk - i;
    const mix = {};
    for (const key in a) {
      if (typeof a[key] === 'number' && key !== 'active' && key !== 'next') mix[key] = a[key] + (b[key] - a[key]) * f;
      else if (Array.isArray(a[key])) mix[key] = a[key].map((x, j) => x + (b[key][j] - x) * f);
      else mix[key] = a[key];
    }
    const running = mix.active >= 0;
    const total = mix.vols.reduce((x, y) => x + y, 0);
    const cur = running ? mix.active : mix.next;
    const phase = running ? 'fill' : mix.next >= 0 ? 'swap' : 'done';
    return {
      ...mix,
      running,
      phase,
      cur,
      T,
      left: Math.max(0, T - s),
      total,
      totalEnd,
      delivered,
      ends,
      order,
      tStart,
      tEnd,
      progress: totalEnd ? total / totalEnd : 1,
      curProgress: cur >= 0 && ends[cur] ? mix.vols[cur] / ends[cur] : 1,
      swapLeft: phase === 'swap' ? Math.max(0, tStart[mix.next] - s) : 0,
      mass: (total * rho) / 1000,
      resLevel: (mix.vRes / area) * 1000,
      depths: mix.vols.map((v, j) => vesselDepth(VESSELS[j], v)),
      nu: nuMm,
      rho,
      rpm,
      vMin,
      hVacMax: PUMP_LIM.hVac,
      warnings,
      stop,
      cfg: {...cfg},
      // the KAMAZ alone, as the film's callouts knew it
      vKam: mix.vols[0],
      kamDepth: vesselDepth(VESSELS[0], mix.vols[0]),
      vEnd: totalEnd,
      area,
    };
  };
  return {state, T, steps, vEnd: totalEnd, ends, tStart, tEnd, lines, warnings, order};
}
