// Pumping И-20А from the 80 m³ storage tank into four tankers in turn with one pump: the KAMAZ (8 m³), then three Scania
// semitrailers (20 m³ each). The hydraulics of the suction hose and of each discharge line, the pump's flow against
// them, and the levels in all the tanks over the run, integrated once.
//
// И-20А (ГОСТ 20799-88): kinematic viscosity 29–35 mm²/s at 40 °C, pour point ≤ −15 °C, flash ≥ 180 °C, density
// 880–890 kg/m³ at 20 °C (suppliers' data sheets; 885 taken). At 20 °C the viscosity is ≈ 88 mm²/s by ASTM D341 from
// 32 mm²/s at 40 °C and ≈ 5.3 mm²/s at 100 °C (typical for this grade) — close to the 75 mm²/s (10 °ВУ) the pump's
// curves are given at. The storage tank starts at 90 % (72 m³); the tanker is filled to 95 % of its 8 m³ (7.6 m³), the
// usual allowance for the oil's expansion.
import {flow, power} from './kin.js';
import {motorState} from './elec.js';
import {fuelAt, GENSET} from './supply.js';
import {GROUND} from './truck.js';

export const OIL = {name: 'И-20А', gost: 'ГОСТ 20799-88', rho: 885, nu40: 32, nu20: 88, pour: -15, flash: 180, t: 20};
export const PLAN = {res0: 72, resCap: 80, kamCap: 8, kamFill: 0.95, accel: 100};
// the KAMAZ's tank inside (measured off the model, the length set so it holds exactly 8 m³): an elliptic barrel along z
export const KTANK = {a: 1080, b: 590, len: 4000, x: -5600, yc: GROUND + 1863, zc: 1000};
KTANK.len = (PLAN.kamCap * 1e9) / (Math.PI * KTANK.a * KTANK.b);
// heights in the pump's frame, mm: the pump's ports, the tank's floor, the tanker's hatch (where the hose ends)
export const Y = {pumpIn: 170, pumpOut: 170, hatch: GROUND + 2905};


// The three Scania S730 tractors with 20 m³ semitrailer tanks (the user's model, at its own scale). Their tank,
// measured with rays: top 2445 mm and bottom ≈ 1200 mm over the road, 2060 mm across, 6.0 m of barrel from 1100 to
// 7100 mm ahead of the trailer's rear face; the filling hatch on top 3440 mm ahead of it, its rim 2636 mm up. That
// barrel holds ≈ 12 m³ as drawn: the model is smaller than a real 20 m³ semitrailer, so the 20 m³ is the order's own
// figure and the level shown is the fraction of the tank's height an elliptic barrel of 20 m³ would reach.
export const SCANIA = {xs: [-9300, -12900, -16500], zRear: 4040, hatchZ: 3440, hatchY: GROUND + 2636, tank: [1100, 7100], yc: GROUND + 1822, a: 1015, b: 607, cap: 20};
// the four vessels in their filling order: the KAMAZ first (it stands nearest), then the Scanias from the nearest out
export const VESSELS = [
  {id: 'kam', name: 'КАМАЗ', cap: PLAN.kamCap, a: KTANK.a, b: KTANK.b, len: KTANK.len, hatchY: Y.hatch},
  ...SCANIA.xs.map((x, i) => ({id: `s${i + 1}`, name: `Scania №${i + 1}`, cap: SCANIA.cap, a: SCANIA.a, b: SCANIA.b, len: (SCANIA.cap * 1e9) / (Math.PI * SCANIA.a * SCANIA.b), hatchY: SCANIA.hatchY, x})),
];
// moving the hose to the next truck's hatch and opening it, the pump stopped: 5 min a change
PLAN.swap = 300;
PLAN.fill = 0.95;
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

/** the run over all four vessels in turn: the suction hose's length, each discharge hose's length to its vessel (mm),
 *  the tank's inside radius and floor (mm); returns state(seconds) */
export function planTransfer({lenS, lenD, resR, resFloor, rpm = 980}) {
  const g = 9.81;
  const d = 0.075;
  const A = (Math.PI * d * d) / 4;
  const area = (Math.PI * resR * resR) / 1e6; // m²
  const nu = OIL.nu20 * 1e-6;
  const rho = OIL.rho;
  // the state of the lines at a flow q (m³/h) with the oil at a height zs (mm) in the storage tank, filling vessel k
  const lines = (q, zs, k) => {
    const v = q / 3600 / A;
    const hv = (v * v) / (2 * g);
    const re = (v * d) / nu;
    const lam = re < 2300 ? 64 / Math.max(re, 1) : 0.3164 / re ** 0.25;
    // suction: the tank's nozzle and gate valve (0.5 + 0.2), four bends, the filter (Kv 131 as in pipes.js, ×1.5 for
    // the oil's viscosity)
    const lossS = (lam * (lenS / 1000 / d) + 0.7 + 4 * 0.3) * hv + ((0.88 * (q / 131) ** 2 * 1.5) * 1e5) / (rho * g);
    // discharge: five bends and the free outlet in the hatch (1.0)
    const lossD = (lam * (lenD[k] / 1000 / d) + 5 * 0.3 + 1.0) * hv;
    const hs = (zs - Y.pumpIn) / 1000;
    const hd = (VESSELS[k].hatchY - Y.pumpOut) / 1000;
    const pIn = (rho * g * (hs - lossS - hv)) / 1e6;
    const pOut = (rho * g * (hd + lossD)) / 1e6;
    return {v, hv, re, lam, lossS, lossD, hs, hd, pIn, pOut, dp: Math.max(0, pOut - pIn)};
  };
  // the run, second by second: each vessel filled to 95 % in turn with the pump's flow against its line, the levels
  // following; between vessels the pump stands for the hose change and the generator idles
  const dt = 1;
  const steps = [];
  const ends = VESSELS.map((ve) => ve.cap * PLAN.fill);
  const totalEnd = ends.reduce((x, y) => x + y, 0);
  const tStart = [];
  const tEnd = [];
  let vRes = PLAN.res0;
  const vols = VESSELS.map(() => 0);
  let t = 0;
  let energy = 0;
  let fuel = 0;
  let last = null;
  for (let k = 0; k < VESSELS.length; k++) {
    if (k) {
      for (let w = 0; w < PLAN.swap; w += dt) {
        steps.push({...last, t, vRes, vols: [...vols], active: -1, next: k, q: 0, v: 0, n2: 0, p1: 0, iLine: 0, genKw: 0, energy, fuel});
        fuel += (fuelAt(0.03) * dt) / 3600;
        t += dt;
      }
    }
    tStart.push(t);
    for (;;) {
      const zs = resFloor + (vRes / area) * 1000;
      let q = flow(rpm, 0.1).net;
      let L;
      for (let i = 0; i < 4; i++) {
        L = lines(q, zs, k);
        q = flow(rpm, L.dp).net;
      }
      const n2 = power(rpm, L.dp);
      const ms = motorState(rpm, n2);
      const genKw = ms.pIn / 0.975;
      last = {zs, ...L};
      if (vols[k] >= ends[k]) break;
      steps.push({t, vRes, vols: [...vols], active: k, next: k, q, zs, ...L, n2, p1: ms.pIn, iLine: ms.iLine, genKw, energy, fuel});
      const dv = Math.min((q / 3600) * dt, ends[k] - vols[k]);
      vols[k] += dv;
      vRes -= dv;
      energy += (ms.pIn * dt) / 3600;
      fuel += (fuelAt(genKw / GENSET.kw) * dt) / 3600;
      t += dt;
    }
    tEnd.push(t);
  }
  steps.push({...last, t, vRes, vols: [...vols], active: -1, next: -1, q: 0, v: 0, n2: 0, p1: 0, iLine: 0, genKw: 0, energy, fuel});
  const T = t;
  /** the transfer at s seconds into it (held at the end once the last tanker is full) */
  const state = (s) => {
    const k = Math.max(0, Math.min(steps.length - 1, s));
    const i = Math.floor(k);
    const a = steps[i];
    const b = steps[Math.min(steps.length - 1, i + 1)];
    const f = k - i;
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
      ends,
      tStart,
      tEnd,
      progress: total / totalEnd,
      curProgress: cur >= 0 ? mix.vols[cur] / ends[cur] : 1,
      swapLeft: phase === 'swap' ? Math.max(0, tStart[mix.next] - s) : 0,
      mass: (total * OIL.rho) / 1000,
      resLevel: (mix.vRes / area) * 1000,
      depths: mix.vols.map((v, j) => vesselDepth(VESSELS[j], v)),
      // the KAMAZ alone, as the panels and the film's callouts knew it
      vKam: mix.vols[0],
      kamDepth: vesselDepth(VESSELS[0], mix.vols[0]),
      vEnd: totalEnd,
      area,
    };
  };
  return {state, T, steps, vEnd: totalEnd, ends, tStart, tEnd, lines};
}
