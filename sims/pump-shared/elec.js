// АИР160S6 as an electrical machine: the numbers behind the motor's panels and its field. A three-phase squirrel-cage
// induction motor, 6 poles (p = 3 pole pairs), stator connected in delta on a 380 V, 50 Hz line.
//
// Nameplate data from the IEK DRIVE catalogue (p. 14): 11 kW, 970 rpm, 380/660 V, 24.6/14.2 A, η 86.8 %, cos φ 0.79,
// Mmax/Mn 2.2, Mstart/Mn 2.0, Istart/In 6.3. Everything below the nameplate (the loss split, cos φ and current at part
// load, the torque curve) is a textbook model fitted to those numbers, not the manufacturer's test data.
export const EM = {pn: 11, nN: 970, p: 3, u: 380, f: 50, iN: 24.6, eta: 0.868, cos: 0.79, lam: 2.2, kStart: 2.0, kI: 6.3, slots: 54, bars: 44};
export const N_SYNC = (60 * EM.f) / EM.p; // 1000 rpm
export const M_N = (9550 * EM.pn) / EM.nN; // 108 N·m
const S_N = 1 - EM.nN / N_SYNC; // 0.03
// Kloss: M(s) = 2 Mmax / (s/sk + sk/s), with the critical slip from the rated point
export const S_K = S_N * (EM.lam + Math.sqrt(EM.lam * EM.lam - 1));
export const kloss = (s) => (s <= 0 ? 0 : (2 * EM.lam * M_N) / (s / S_K + S_K / s));
/** the torque curve for the chart: Kloss near the working range, lifted toward standstill so the start reaches the
 *  nameplate's 2.0 × Mn (Kloss alone falls well short there for a cage rotor) */
export const torqueAt = (s) => kloss(s) + (EM.kStart * M_N - kloss(1)) * s * s;
/** the slip at which the motor gives torque m (on the stable side of the curve) */
export const slipFor = (m) => {
  if (m <= 0) return 0;
  const r = (EM.lam * M_N) / m;
  return r <= 1 ? S_K : S_K * (r - Math.sqrt(r * r - 1));
};
// the rated losses, split the usual way for a motor this size
const L0 = EM.pn * (1 / EM.eta - 1);

/** The motor at shaft speed rpm giving p2 kW to the pump. The shaft speed is the pump's; the supply frequency is the
 *  one that turns the field fast enough for that speed at this load (50 Hz is the line; anything else needs a
 *  frequency converter, with the voltage held in proportion, U/f constant). */
export function motorState(rpm, p2) {
  const w = (rpm * 2 * Math.PI) / 60;
  const m = w > 0.5 ? (p2 * 1000) / w : 0;
  const s = slipFor(m);
  const n1 = rpm / (1 - s);
  const f = (EM.f * n1) / N_SYNC;
  const k = p2 / EM.pn;
  // on the line within a hertz of 50 the voltage is the line's; off it, a converter holds U/f
  const uk = Math.abs(f - EM.f) < 1 ? 1 : Math.min(1, f / EM.f);
  const mech = 0.12 * L0 * (rpm / EM.nN) ** 2;
  const loss = {
    cuS: 0.38 * L0 * k * k, // the stator winding, I²R
    fe: 0.22 * L0 * uk ** 1.6 * (f / EM.f) ** 0.4, // the stator iron: hysteresis and eddy currents
    cuR: (s / (1 - s)) * (p2 + mech), // the rotor bars: exactly the slip's share of the air-gap power
    mech, // bearings and the fan
    add: 0.04 * L0 * k * k,
  };
  const pIn = p2 + loss.cuS + loss.fe + loss.cuR + loss.mech + loss.add;
  const cos = Math.max(0.08, (EM.cos * 1.6 * k) / (0.6 + k));
  const u = EM.u * uk;
  const iLine = u > 1 ? (pIn * 1000) / (Math.sqrt(3) * u * cos) : 0;
  return {m, s, n1, f, k, loss, pIn, pAirgap: p2 + mech + loss.cuR, eta: pIn > 0 ? p2 / pIn : 0, cos, phi: Math.acos(cos), u, iLine, iPhase: iLine / Math.sqrt(3), fRotor: s * f, q: (pIn * 1000 * Math.tan(Math.acos(cos))) / 1000};
}

/** the instantaneous phase currents (per unit of their peak) at electrical angle th (degrees); reversed (dir −1) the
 *  supply's B and C are swapped, which is how the motor is reversed */
export const phaseCurrents = (th, phi, dir = 1) => {
  const a = (th * Math.PI) / 180 - phi;
  const ph = (k) => Math.cos(a - k * dir * ((2 * Math.PI) / 3));
  return [ph(0), ph(1), ph(2)];
};
/** the stator slots in order round the bore: phase (0 A, 1 B, 2 C) and sign, three slots per pole per phase:
 *  A, −C, B, −A, C, −B under each pole pair */
export const SLOT = Array.from({length: EM.slots}, (_, k) => {
  const belt = Math.floor(k / 3) % 6;
  return [[0, 1], [2, -1], [1, 1], [0, -1], [2, 1], [1, -1]][belt];
});
export const PHASE_COL = ['#e3b400', '#2f9e44', '#d6182b']; // ПУЭ: A yellow, B green, C red
export const PHASE_NAME = ['A', 'B', 'C'];
