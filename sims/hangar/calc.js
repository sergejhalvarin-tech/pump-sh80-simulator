// The hangar for producing and packing industrial oils: its numbers. Metres, kN, kPa, kW, m³/h.
//
// Site: Ural / Siberia, taken as Novosibirsk (СП 131.13330: coldest five days −37 °C, heating season −8.1 °C over
// 221 days; СП 20.13330.2016: snow district IV, Sg 2.0 kPa; wind district III, w0 0.38 kPa, terrain B). Check the
// districts against the actual address before any detailed design.
//
// Use: production and packing of industrial oils (И-20А and the like: flash point ≥ 180 °C, combustible liquids, not
// flammable ones) — fire hazard category В (В1–В3 by the fire load, settled once the equipment is placed, СП 12.13130),
// so no explosion protection; mineral-wool (non-combustible) sandwich panels.

import {EQ} from './equip_calc.js';

export const SITE = {name: 'Новосибирск (Урал/Сибирь)', tOut: -37, tHeat: -8.1, zHeat: 221, Sg: 2.0, snowDistrict: 'IV', w0: 0.38, windDistrict: 'III'};

// the building: 18 m span × 28 m long = 504 m², walls 6 m to the eaves, a 15° gable roof; LSTK trusses and posts every
// 2 m (as in the reference), the trusses' panel points every 1.5 m along the span
export const B = {span: 18, length: 28, eave: 6, pitch: 15, step: 2, panel: 1.5, slab: 0.25, tIn: 16};
B.rise = (B.span / 2) * Math.tan((B.pitch * Math.PI) / 180);
B.ridge = B.eave + B.rise;
B.area = B.span * B.length;
B.volume = B.area * B.eave + 0.5 * B.span * B.rise * B.length;
B.trusses = Math.round(B.length / B.step) + 1;

// LSTK sections (galvanised cold-formed steel, S350: Ry 350 / γm 1.025): gross area A (cm²), radius of gyration for
// buckling in the weaker plane i (cm), and the effective-area factor for local buckling of the thin walls (estimate)
export const STEEL = {Ry: 341, E: 206000};
export const SEC = {
  top: {name: '2 × ПС 200×60×2,0', A: 14.4, i: 2.4, eff: 0.7, kg: 11.3},
  bottom: {name: '2 × ПС 200×60×2,0', A: 14.4, i: 2.4, eff: 0.7, kg: 11.3},
  web: {name: 'ПС 100×50×1,5', A: 3.2, i: 1.6, eff: 0.8, kg: 2.5},
  // the long lattice members (over 1.6 m: the diagonals and verticals toward mid-span) buckle first: paired
  webH: {name: '2 × ПС 100×50×2,0', A: 8.4, i: 2.0, eff: 0.8, kg: 6.6},
  post: {name: '2 × ПС 200×60×2,0', A: 14.4, i: 2.4, Wx: 86, eff: 0.7, kg: 11.3},
};

// ------------------------------------------------------------ loads on the roof (kPa on plan), СП 20.13330.2016
export const LOADS = (() => {
  const dead = [
    ['Сэндвич-панель кровли 200 мм (минвата)', 0.27, 1.05],
    ['Прогоны, фермы ЛСТК', 0.15, 1.05],
    ['Инженерные системы под фермами (воздуховоды, свет, лотки)', 0.15, 1.2],
  ];
  const deadN = dead.reduce((s, d) => s + d[1], 0);
  const deadD = dead.reduce((s, d) => s + d[1] * d[2], 0);
  const snowN = 1.0 * SITE.Sg; // μ 1 for a 15° gable (≤ 25°), ce = ct = 1
  const snowD = snowN * 1.4;
  return {dead, deadN, deadD, snowN, snowD, total: deadD + snowD};
})();

// ------------------------------------------------------------ the truss: a plane pin-jointed truss by direct stiffness
// nodes: bottom chord at y 0, top chord on the 15° slopes; verticals at every panel point, diagonals falling toward the
// supports (a Howe pattern: in compression, verticals in tension) — the reference's own layout. Loads at the top chord
// nodes from 2 m of roof each side; pinned at one support, sliding at the other.
export function solveTruss(qTop = LOADS.total, asym = false) {
  const n = Math.round(B.span / B.panel);
  const t = Math.tan((B.pitch * Math.PI) / 180);
  const nodes = [];
  const bot = [];
  const top = [];
  for (let i = 0; i <= n; i++) {
    const x = i * B.panel;
    bot.push(nodes.push([x, 0]) - 1);
  }
  for (let i = 0; i <= n; i++) {
    const x = i * B.panel;
    const y = Math.min(x, B.span - x) * t;
    top.push(i === 0 || i === n ? bot[i] : nodes.push([x, y]) - 1);
  }
  const mem = [];
  const add = (a, b, kind) => mem.push({a, b, kind});
  for (let i = 0; i < n; i++) {
    add(bot[i], bot[i + 1], 'bottom');
    add(top[i], top[i + 1], 'top');
  }
  const webKind = (a, b) => (Math.hypot(nodes[b][0] - nodes[a][0], nodes[b][1] - nodes[a][1]) > 1.6 ? 'webH' : 'web');
  for (let i = 1; i < n; i++) add(bot[i], top[i], webKind(bot[i], top[i]));
  for (let i = 1; i < n - 1; i++) {
    // diagonals from the top node toward the middle down to the bottom node nearer the support
    const tt = i < n / 2 ? top[i + 1] : top[i - 1];
    add(tt, bot[i], webKind(tt, bot[i]));
  }
  // the loads: q (kPa) × step × panel at each top node, half at the ends; the asymmetric snow case puts 1.25 / 0.75
  const F = new Float64Array(nodes.length * 2);
  for (let i = 0; i <= n; i++) {
    const w = (i === 0 || i === n ? 0.5 : 1) * B.panel * B.step;
    const k = asym ? (i < n / 2 ? 1.25 : i > n / 2 ? 0.75 : 1) : 1;
    const q = LOADS.deadD + LOADS.snowD * k;
    F[2 * top[i] + 1] -= q * w;
  }
  // stiffness: EA from the sections (kN), per member
  const N = nodes.length * 2;
  const K = Array.from({length: N}, () => new Float64Array(N));
  for (const m of mem) {
    const [x1, y1] = nodes[m.a];
    const [x2, y2] = nodes[m.b];
    const L = Math.hypot(x2 - x1, y2 - y1);
    const c = (x2 - x1) / L;
    const s = (y2 - y1) / L;
    const EA = STEEL.E * 1e3 * SEC[m.kind].A * 1e-4; // kN
    const k = EA / L;
    const d = [2 * m.a, 2 * m.a + 1, 2 * m.b, 2 * m.b + 1];
    const v = [-c, -s, c, s];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i]][d[j]] += k * v[i] * v[j];
    Object.assign(m, {L, c, s, d});
  }
  // supports: left pinned (x, y), right on rollers (y)
  const fixed = new Set([2 * bot[0], 2 * bot[0] + 1, 2 * bot[n] + 1]);
  const free = [...Array(N).keys()].filter((i) => !fixed.has(i));
  const A = free.map((i) => free.map((j) => K[i][j]));
  const b = free.map((i) => F[i]);
  // Gaussian elimination with partial pivoting
  const m = free.length;
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < m; r++) {
      const f = A[r][c] / A[c][c];
      if (!f) continue;
      for (let k = c; k < m; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < m; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  const u = new Float64Array(N);
  free.forEach((i, k) => (u[i] = x[k]));
  // member forces (kN, + tension), stresses and checks: tension on the effective area, compression with buckling
  // (EN 1993-1-1 curve b, α 0.34 — the way cold-formed members are usually checked), the length between nodes
  for (const mm of mem) {
    const S = SEC[mm.kind];
    const EA = STEEL.E * 1e3 * S.A * 1e-4;
    const [a0, a1, b0, b1] = mm.d;
    mm.N = (EA / mm.L) * ((u[b0] - u[a0]) * mm.c + (u[b1] - u[a1]) * mm.s);
    const Aeff = S.A * S.eff * 1e-4; // m²
    let cap = (STEEL.Ry * 1e3 * Aeff); // kN
    if (mm.N < 0) {
      const lam = (mm.L * 100) / S.i;
      const lamBar = (lam / Math.PI) * Math.sqrt(STEEL.Ry / STEEL.E);
      const phi = 0.5 * (1 + 0.34 * (lamBar - 0.2) + lamBar * lamBar);
      const chi = Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lamBar * lamBar)));
      cap *= chi;
      mm.lam = lam;
    }
    mm.cap = cap;
    mm.util = Math.abs(mm.N) / cap;
  }
  const reaction = (LOADS.deadD + LOADS.snowD) * B.step * B.span / 2;
  const mid = top[Math.round(n / 2)];
  return {nodes, mem, top, bot, deflection: -u[2 * mid + 1] * 1000, reaction, maxUtil: Math.max(...mem.map((x) => x.util))};
}

// ------------------------------------------------------------ the posts: the truss's reaction and the wind
export const POST = (() => {
  // wind, СП 20.13330: wm = w0 · k(ze) · c; terrain B, ze ≈ eave height 6 m → k 0.54; walls c +0.8 / −0.5; γf 1.4
  const k = 0.54;
  const wPress = SITE.w0 * k * 0.8 * 1.4; // kPa design, windward
  const q = wPress * B.step; // kN/m on a post
  const M = (q * B.eave * B.eave) / 8; // kN·m, a post pinned at both ends (truss and footing)
  const Nroof = (LOADS.deadD + LOADS.snowD) * B.step * (B.span / 2);
  const Nwall = 0.3 * 1.05 * B.step * B.eave; // the wall panels (≈ 25 kg/m²) and girts on the post
  const Npost = Nroof + Nwall;
  const S = SEC.post;
  const Aeff = S.A * S.eff * 1e-4;
  const lam = ((B.eave / 2) * 100) / S.i; // the girt at mid-height braces the weak axis
  const lamBar = (lam / Math.PI) * Math.sqrt(STEEL.Ry / STEEL.E);
  const phi = 0.5 * (1 + 0.34 * (lamBar - 0.2) + lamBar * lamBar);
  const chi = 1 / (phi + Math.sqrt(phi * phi - lamBar * lamBar));
  const uN = (Npost) / (chi * STEEL.Ry * 1e3 * Aeff);
  const uM = (M) / (STEEL.Ry * 1e3 * S.Wx * 1e-6 * 0.8);
  return {wPress, q, M, Nroof, Nwall, Npost, util: uN + uM, uN, uM};
})();

// ------------------------------------------------------------ the envelope and the heat, СП 50.13330
// ГСОП (degree-days) and the required resistances for a production building (table 3: a, b for walls and roofs)
export const HEAT = (() => {
  const gsop = (B.tIn - SITE.tHeat) * SITE.zHeat;
  const Rreq = {wall: 0.0002 * gsop + 1.0, roof: 0.00025 * gsop + 1.5, window: 0.000025 * gsop + 0.2};
  // sandwich panels on mineral wool λ 0.045 (in service), the joints and fixings counted by r 0.85
  const R = (d) => (1 / 8.7 + d / 0.045 + 1 / 23) * 0.85;
  const env = {wall: R(0.15), roof: R(0.2), gate: 0.85, door: 0.6, window: 0.55, floor: 4.0};
  const dt = B.tIn - SITE.tOut;
  const openings = {gate: 2 * 4.0 * 4.5, door: 4 * 1.0 * 2.1, window: 12 * 2.0 * 1.0};
  const perim = 2 * (B.span + B.length);
  const wallGross = perim * B.eave + B.span * B.rise; // the two gables' triangles
  const wallNet = wallGross - openings.gate - openings.door - openings.window;
  const roofArea = (B.span / Math.cos((B.pitch * Math.PI) / 180)) * B.length;
  const rows = [
    ['Стены, панель 150 мм', wallNet, env.wall],
    ['Кровля, панель 200 мм', roofArea, env.roof],
    ['Ворота секционные (2 шт.)', openings.gate, env.gate],
    ['Двери (4 шт.)', openings.door, env.door],
    ['Окна ПВХ (12 шт.)', openings.window, env.window],
    ['Пол по грунту, утеплённый по периметру', B.area, env.floor],
  ].map(([name, A, R0]) => ({name, A, R: R0, kW: (A * dt) / R0 / 1000}));
  const trans = rows.reduce((s, r) => s + r.kW, 0) * 1.1; // + 10 % for orientation, corners, wind
  // air: general exchange 1.5 /h of the volume, plus local exhausts over the mixers and the filling line; supplied
  // through a unit with a plate recuperator (η 0.70), then heated to +18 °C
  const Lgen = 1.5 * B.volume;
  const Lloc = 3 * 800;
  const L = Math.ceil((Lgen + Lloc) / 500) * 500; // m³/h, supply = exhaust
  const eta = 0.7;
  const tAfterRec = SITE.tOut + eta * (B.tIn - SITE.tOut);
  const ventKw = (0.335 * L * (18 - tAfterRec)) / 1000;
  const ventNoRec = (0.335 * L * (18 - SITE.tOut)) / 1000;
  // the gates opening for trucks: an air curtain over each, ~ 12 kW
  const curtains = 2 * 12;
  return {gsop, Rreq, env, rows, trans, L, Lgen, Lloc, eta, tAfterRec, ventKw, ventNoRec, curtains, dt, roofArea, wallNet, openings};
})();

// ------------------------------------------------------------ power, water (the process load from the equipment placed)
export const POWER = (() => {
  const rows = [
    ['Освещение LED, 300 лк (≈ 7 Вт/м²)', 3.6, 1.0],
    ['Приточно-вытяжная установка: вентиляторы', 2 * 4.0, 1.0],
    ['Догрев приточного воздуха (электрокалорифер)', Math.ceil(HEAT.ventKw / 5) * 5, 0.8],
    ['Местные отсосы, крышные вентиляторы', 3 * 0.75, 1.0],
    ['Воздушно-тепловые завесы ворот', HEAT.curtains, 0.5],
    ['Отопление: электрические воздушно-отопительные агрегаты', Math.ceil(HEAT.trans / 5) * 5, 0.8],
    ['Технологическое оборудование (по расстановке: смесители, резервуары, насосы, линия розлива, компрессор)', Math.round(EQ.kw), 0.7],
    ['Розетки, АБК, лаборатория', 10, 0.5],
  ].map(([name, kw, kc]) => ({name, kw, kc, calc: kw * kc}));
  const installed = rows.reduce((s, r) => s + r.kw, 0);
  const calc = rows.reduce((s, r) => s + r.calc, 0);
  const cos = 0.9;
  const I = (calc * 1000) / (Math.sqrt(3) * 400 * cos);
  return {rows, installed, calc, kva: calc / cos, I};
})();

export const WATER = {
  staff: 8,
  domestic: 8 * 0.025 + 8 * 0.5 * 0.06, // m³/shift: 25 l a worker, showers for half at 60 l
  process: 0.5, // m³/shift: washing tanks and floors (estimate)
  fireJets: 1,
  fireFlow: 2.5, // l/s, internal fire hydrant (ВПВ), СП 10.13130 — confirmed in the detailed design
};
