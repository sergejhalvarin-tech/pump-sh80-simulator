// Ш80-2,5 gear pump: the numbers behind every pose and readout. Pump space is millimetres: shafts along z (the drive
// end is +z), y up from the underside of the feet, x across the ports (suction +x, discharge -x).
//
// From the manual 867-010-00-1 РЭ (АО «ГМС Ливгидромаш»): Q ≥ 37.5 m³/h at 980 rpm, p ≤ 0.25 MPa at the outlet, full
// bypass through the relief valve at 0.4 MPa, N ≤ 6.7 kW, η ≥ 49 %, drive rotor turning counter-clockwise seen from the
// drive end, two chevron rotors. From the outline drawing (Appendix Б): the drive shaft 187 above the feet, the port
// axis at 170, flanges Ø190 on Ø158 with 8 × M14, shaft Ø35 with a 10 mm key, 395 long and 370 high overall.
// The tooth data are not in the manual: m 6, z 16 and b 180 are read off the drawing (a ≈ 96 mm between the shafts)
// and checked against the rated flow below.
export const G = {m: 6, z: 16, b: 180, alpha: 20, beta: 20};
G.r = (G.m * G.z) / 2; // pitch radius 48
G.ra = G.r + G.m; // tip 54
G.rf = G.r - 1.25 * G.m; // root 40.5
G.rb = G.r * Math.cos((G.alpha * Math.PI) / 180); // base 45.1
G.a = 2 * G.r; // centre distance 96
export const Y_DRIVE = 187;
export const Y_DRIVEN = Y_DRIVE - G.a; // 91
export const Y_MESH = (Y_DRIVE + Y_DRIVEN) / 2; // 139
export const Y_PORT = 170;
export const PORT_R = 50;

// displacement per revolution of an external gear pump with standard teeth: q = 2π m² b (z + 1 − π² cos² α / 12)
const ca = Math.cos((G.alpha * Math.PI) / 180);
export const Q_REV = 2 * Math.PI * G.m * G.m * G.b * (G.z + 1 - (Math.PI * Math.PI * ca * ca) / 12); // mm³
export const Q_REV_CM3 = Q_REV / 1000; // ≈ 662 cm³

export const RATED = {rpm: 980, q: 37.5, p: 0.25, crack: 0.28, full: 0.4, nMax: 6.7, eta: 0.49};
export const P_MAX = 0.45;
export const RPM_MAX = 1500;

/** theoretical flow, m³/h, at n rpm */
export const qTheory = (rpm) => (Q_REV * 1e-9 * rpm * 60);
/** relief valve opening 0..1: shut below the cracking pressure, wide open at the full-bypass pressure. Turning the
 *  other way (dir −1) the ports swap and the outlet's pressure reaches the valve from its spring side: it only presses
 *  the valve harder onto its seat, so the valve never opens. */
export const valveOpen = (p, dir = 1) => {
  if (dir < 0) return 0;
  const k = Math.min(1, Math.max(0, (p - RATED.crack) / (RATED.full - RATED.crack)));
  return k * k * (3 - 2 * k);
};
/** the flow balance at speed rpm and outlet pressure p (MPa): theory, leakage past the tips and faces, bypass, net */
export const flow = (rpm, p, dir = 1) => {
  const th = qTheory(rpm);
  // leakage grows with pressure and shrinks with speed (the same gaps, more flow through them per second)
  const leak = th > 0 ? th * 0.035 * (p / RATED.p) * Math.min(2, RATED.rpm / Math.max(rpm, 200)) : 0;
  const pumped = Math.max(0, th - leak);
  const bypass = pumped * valveOpen(p, dir);
  return {th, leak, bypass, net: pumped - bypass};
};
/** shaft power, kW: the hydraulic power over the pump's efficiency, plus a friction floor that rises with speed */
export const power = (rpm, p) => {
  const {th} = flow(rpm, p);
  const hyd = (p * 1e6 * (th / 3600)) / 1000;
  const fric = 2.1 * (rpm / RATED.rpm);
  return hyd / 0.84 + fric * (0.4 + 0.6 * (rpm / RATED.rpm));
};
export const torque = (rpm, p) => (rpm > 1 ? (power(rpm, p) * 1000) / ((rpm * 2 * Math.PI) / 60) : 0);
export const efficiency = (rpm, p, dir = 1) => {
  const N = power(rpm, p);
  const {net} = flow(rpm, p, dir);
  return N > 0 ? (p * 1e6 * (net / 3600)) / 1000 / N : 0;
};

// ------------------------------------------------------------ a tooth space on its way round
const mod = (a, m) => ((a % m) + m) % m;
// The ports are Ø100 windows in the side walls, 120..220 above the feet, so each gear's gaps stand open to a port near
// the mesh and are sealed by the casing over the far side. u is a gap's travel angle in degrees since the mesh, in its
// gear's own turning sense (0 straight down for the top gear, straight up for the bottom one).
export const CH = {lo: Y_PORT - PORT_R, hi: Y_PORT + PORT_R};
const edge = (dy) => (Math.asin(Math.min(1, Math.abs(dy) / G.ra)) * 180) / Math.PI;
// top gear: open to suction until its tips rise past the window's top edge, open to discharge from the mirror angle
const T0 = 90 + edge(CH.hi - Y_DRIVE);
// bottom gear: open while its tips are above the window's lower edge
const B0 = 90 - edge(CH.lo - Y_DRIVEN);
export const SEAL = {1: [T0, 360 - T0], [-1]: [B0, 360 - B0]};
// inside ±24° of the mesh the other gear's teeth are in the gap
export const MESH_U = 24;
export const PHASES = ['ВСАСЫВАНИЕ', 'ПЕРЕНОС', 'НАГНЕТАНИЕ', 'ЗАЦЕПЛЕНИЕ'];
export const phaseOf = (u, gear = 1) => {
  u = mod(u, 360);
  const [c0, c1] = SEAL[gear];
  if (u < MESH_U || u > 360 - MESH_U) return 3;
  if (u < c0) return 0;
  if (u < c1) return 1;
  return 2;
};
/** how full the gap is: it fills as it comes out of the mesh and empties as the teeth go back in */
export const fillOf = (u) => {
  u = mod(u, 360);
  const s = (x) => {
    const k = Math.min(1, Math.max(0, x));
    return k * k * (3 - 2 * k);
  };
  return s((u - MESH_U) / 26) * s((360 - MESH_U - u) / 30);
};
/** the pressure in the gap, MPa: a slight vacuum while it is open to suction, rising across the last sealed teeth to
 *  the outlet's pressure, squeezed above it while the mesh closes it */
export const P_SUCTION = -0.03;
export const gapPressure = (u, p, gear = 1) => {
  u = mod(u, 360);
  const [, c1] = SEAL[gear];
  const s = (x) => {
    const k = Math.min(1, Math.max(0, x));
    return k * k * (3 - 2 * k);
  };
  const rise = P_SUCTION + (p - P_SUCTION) * s((u - (c1 - 2.5 * DA)) / (2.5 * DA));
  const trap = 0.12 * Math.sin(Math.PI * s((u - (360 - MESH_U - 18)) / 34));
  return rise + Math.max(0, trap);
};
/** the pressure → 0..1 colour key between suction and the outlet */
export const keyOf = (pg, p) => Math.min(1, Math.max(0, (pg - P_SUCTION) / Math.max(0.05, p - P_SUCTION)));

/** gap j's travel angle on the drive (top, +1) or driven (bottom, -1) gear at shaft angle phi (degrees). The drive gear
 *  turns +phi (CCW seen from the drive end) with tooth 0 straight down at phi 0; the driven one turns −phi with gap 0
 *  straight up, under that tooth. */
export const DA = 360 / G.z;
export const gapU = (gear, j, phi) => (gear > 0 ? mod(j * DA + DA / 2 + phi, 360) : mod(phi - j * DA, 360));
/** the same travel angle when the shafts may turn either way: reversed, a space leaves the mesh on the other side, so
 *  it counts the other way round (the sealed arcs are symmetric, so every phase keeps its span) */
export const travelU = (gear, j, phi, dir = 1) => (dir > 0 ? gapU(gear, j, phi) : mod(360 - gapU(gear, j, phi), 360));
