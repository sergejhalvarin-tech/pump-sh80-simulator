// Pumping И-20А from the 80 m³ storage tank into the KAMAZ tanker: the hydraulics of both hoses, the pump's flow
// against them, and the levels in both tanks over the transfer, integrated once over the whole run.
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

/** the volume (m³) in the tanker at a depth h (mm) over its inside bottom, and its inverse */
export const kamVolume = (h) => {
  const d = Math.min(2, Math.max(0, h / KTANK.b));
  const seg = Math.acos(1 - d) - (1 - d) * Math.sqrt(Math.max(0, 2 * d - d * d));
  return (KTANK.len * KTANK.a * KTANK.b * seg) / 1e9;
};
export const kamDepth = (v) => {
  let lo = 0;
  let hi = 2 * KTANK.b;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (kamVolume(m) < v) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};

/** the run: lengths of both hoses (mm), the tank's inside radius and floor (mm); returns state(seconds) */
export function planTransfer({lenS, lenD, resR, resFloor, rpm = 980}) {
  const g = 9.81;
  const d = 0.075;
  const A = (Math.PI * d * d) / 4;
  const area = (Math.PI * resR * resR) / 1e6; // m²
  const nu = OIL.nu20 * 1e-6;
  const rho = OIL.rho;
  // the state of the lines at a flow q (m³/h) with the oil at a height zs (mm) in the storage tank
  const lines = (q, zs) => {
    const v = q / 3600 / A;
    const hv = (v * v) / (2 * g);
    const re = (v * d) / nu;
    const lam = re < 2300 ? 64 / Math.max(re, 1) : 0.3164 / re ** 0.25;
    // suction: the tank's nozzle and gate valve (0.5 + 0.2), four bends, the filter (Kv 131 as in pipes.js, ×1.5 for
    // the oil's viscosity)
    const lossS = (lam * (lenS / 1000 / d) + 0.7 + 4 * 0.3) * hv + ((0.88 * (q / 131) ** 2 * 1.5) * 1e5) / (rho * g);
    // discharge: five bends and the free outlet in the hatch (1.0)
    const lossD = (lam * (lenD / 1000 / d) + 5 * 0.3 + 1.0) * hv;
    const hs = (zs - Y.pumpIn) / 1000;
    const hd = (Y.hatch - Y.pumpOut) / 1000;
    const pIn = (rho * g * (hs - lossS - hv)) / 1e6;
    const pOut = (rho * g * (hd + lossD)) / 1e6;
    return {v, hv, re, lam, lossS, lossD, hs, hd, pIn, pOut, dp: Math.max(0, pOut - pIn)};
  };
  // the run, second by second: the pump's flow against the lines, the levels following
  const dt = 1;
  const steps = [];
  let vRes = PLAN.res0;
  let vKam = 0;
  const vEnd = PLAN.kamCap * PLAN.kamFill;
  let t = 0;
  let energy = 0;
  let fuel = 0;
  for (;;) {
    const zs = resFloor + (vRes / area) * 1000;
    let q = flow(rpm, 0.1).net;
    let L;
    for (let i = 0; i < 4; i++) {
      L = lines(q, zs);
      q = flow(rpm, L.dp).net;
    }
    const n2 = power(rpm, L.dp);
    const ms = motorState(rpm, n2);
    const genKw = ms.pIn / 0.975;
    steps.push({t, vRes, vKam, q, zs, ...L, n2, p1: ms.pIn, iLine: ms.iLine, genKw, energy, fuel});
    if (vKam >= vEnd) break;
    const dv = Math.min((q / 3600) * dt, vEnd - vKam);
    vKam += dv;
    vRes -= dv;
    energy += (ms.pIn * dt) / 3600;
    fuel += (fuelAt(genKw / GENSET.kw) * dt) / 3600;
    t += dt;
  }
  const T = t;
  /** the transfer at s seconds into it (held at the end once the tanker is full) */
  const state = (s) => {
    const k = Math.max(0, Math.min(steps.length - 1, s));
    const i = Math.floor(k);
    const a = steps[i];
    const b = steps[Math.min(steps.length - 1, i + 1)];
    const f = k - i;
    const mix = {};
    for (const key in a) mix[key] = typeof a[key] === 'number' ? a[key] + (b[key] - a[key]) * f : a[key];
    const running = s < T;
    return {
      ...mix,
      running,
      q: running ? mix.q : 0,
      T,
      left: Math.max(0, T - s),
      progress: mix.vKam / vEnd,
      mass: (mix.vKam * OIL.rho) / 1000,
      resLevel: (mix.vRes / area) * 1000,
      kamDepth: kamDepth(mix.vKam),
      vEnd,
      area,
    };
  };
  return {state, T, steps, vEnd, lines};
}
