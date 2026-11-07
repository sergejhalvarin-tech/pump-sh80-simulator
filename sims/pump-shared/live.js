// The Ш80-2,5 as a page you drive: the film's pump and overlay, run in real time. Camera views, the cut (casing,
// glass, section), the layers (callouts, oil, arrows, isolate, explode, charts), PAUSE and ±15°, the speed, outlet
// pressure and slow-motion sliders, an orbit you drag, a zoom on the wheel, H to hide the overlay. Left alone it plays
// the film's script as an auto tour with the operator's cursor, looped; a click, drag, wheel or key hands control to
// the visitor, 25 s of quiet hands it back. REVERSE (or R) runs the shafts the other way: the ports swap, and the relief
// valve, pressed onto its seat from the spring side, no longer limits the pressure. M hides the motor.
import {warmComposer} from 'teardown-kit/warm.js';
import {CAMS, createConsole, CUTS, OVERLAYS} from './console.js';
import {bypassSpeed, camAt, camName, cutAt, DURATION, explodeAt, explodeOn, makeConsoleFrame, makeCursor, MOBILE, MOTOR_HIDE, motorAt, pAt, supplyAt, siteAt, SITE, portSpeed, SCRIPT, VIEW_FN, widen} from './film.js';
import {EM, motorState} from './elec.js';
import {powerState} from './supply.js';
import {suctionBudget} from './pipes.js';
import {CFG, PLAN} from './transfer.js';
import {flow, P_MAX, power, RATED, RPM_MAX, valveOpen} from './kin.js';
import {createPumpStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
// playback steps: the film runs at 1/20
const PLAYS = [1 / 60, 1 / 40, 1 / 20, 1 / 10, 1 / 5, 1 / 2, 1];
const playText = (p) => (p >= 1 ? '1 : 1' : `1 / ${Math.round(1 / p)}`);

const CSS = (top) => `
html,body{background:#ecedef;overflow:hidden;position:fixed;inset:0;margin:0}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.tb{pointer-events:auto;cursor:pointer}
.tb:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:pointer}
.hit.ew{cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:60px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 8.8px Inter,'Segoe UI',sans-serif;letter-spacing:1.2px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#d6182b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8b8f95;text-transform:uppercase;display:none}
/* a phone held upright: the scene fills the screen, the key numbers on top, the views along the bottom */
.ph{position:fixed;left:0;right:0;z-index:5;display:none;font-family:Inter,'Segoe UI',sans-serif;color:#16181b}
.ph.on{display:block}
.ph-top{top:0;padding:10px 14px 8px;background:linear-gradient(#ecedeff2,#ecedefcc 75%,#ecedef00)}
.ph-title{font-size:15px;font-weight:700;letter-spacing:-.1px}
.ph-sub{font:600 9px 'JetBrains Mono',monospace;letter-spacing:1px;color:#6b7075;margin-top:2px;text-transform:uppercase}
.ph-m{display:flex;gap:14px;margin-top:8px}
.ph-m div{flex:1;min-width:0}
.ph-m b{display:block;font-size:22px;font-weight:800;letter-spacing:-.6px;color:#d6182b;line-height:1.05}
.ph-m span{display:block;font-size:10px;color:#6b7075;margin-top:2px}
.ph-w{margin-top:6px;font-size:10.5px;font-weight:600;color:#d6182b;line-height:1.3}
.ph-bot{bottom:0;padding:8px 0 calc(10px + env(safe-area-inset-bottom));background:linear-gradient(#ecedef00,#ecedefe6 30%)}
.ph-row{display:flex;gap:6px;overflow-x:auto;padding:0 12px 6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ph-row::-webkit-scrollbar{display:none}
.ph-row button{flex:none;height:32px;padding:0 12px;border:1px solid #d8dbdf;background:#fff;color:#16181b;font:600 11px Inter,sans-serif;letter-spacing:.4px;border-radius:16px}
.ph-row button.on{background:#16181b;color:#fff;border-color:#16181b}
.ph-row button.red{background:#d6182b;color:#fff;border-color:#d6182b}
.links{position:absolute;left:1318px;top:12px;width:245px;display:flex;justify-content:space-between;font:600 8.8px 'JetBrains Mono',monospace;letter-spacing:1px;pointer-events:auto}
.links a{color:#16181b;text-decoration:none;border-bottom:1px solid #d6182b}
`;

export function runLive() {
  // a phone must not zoom out to the 1600 px stage: the stage is scaled to the screen by fit() instead
  document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,viewport-fit=cover');
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS(top);
  document.head.appendChild(style);
  document.title = 'Ш80-2,5 · Шестерённый насос';
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createPumpStage({canvas});
  // the scanned pickup decodes in the background; the drawn one stands in until it is ready
  st.pump.truck.loadModel().catch((e) => console.warn('truck model', e));
  // a change of the conditions on the transfer's panel plans the run again and starts it over
  const ui = createConsole(app, (sec) => st.pump.site.plan.state(sec), () => {
    st.pump.site.replan();
    transferS = 0;
  });
  st.pump.site.load().catch((e) => console.warn('site models', e));
  // the upright phone's overlay: title and three numbers on top, the views and cuts as rows of chips below
  const phTop = document.createElement('div');
  phTop.className = 'ph ph-top';
  phTop.innerHTML = '<div class="ph-title"></div><div class="ph-sub"></div><div class="ph-m"><div><b></b><span></span></div><div><b></b><span></span></div><div><b></b><span></span></div></div><div class="ph-w"></div>';
  const phBot = document.createElement('div');
  phBot.className = 'ph ph-bot';
  const LBL = {hero: 'Общий', front: 'Торец', ports: 'Порты', valve: 'Клапан', rotors: 'Роторы', unit: 'Агрегат', motor: 'Мотор', power: 'Питание', genset: 'ДГУ', truck: 'Пикап', pipes: 'Трубы', site: 'Площадка', solid: 'Корпус', glass: 'Стекло', section: 'Сечение'};
  phBot.innerHTML = `<div class="ph-row">${CAMS.map((k) => `<button data-v="${k}">${LBL[k]}</button>`).join('')}</div><div class="ph-row"><button data-p="1" class="red"></button>${CUTS.map((k) => `<button data-c="${k}">${LBL[k]}</button>`).join('')}<button data-t="1">Заново</button><button data-l="hangar.html">Ангар ↗</button><button data-l="strength.html">CAD и прочность ↗</button><button data-l="report.pdf">Отчёт PDF ↗</button></div>`;
  document.body.append(phTop, phBot);
  const phEl = {
    title: phTop.querySelector('.ph-title'),
    sub: phTop.querySelector('.ph-sub'),
    m: [...phTop.querySelectorAll('.ph-m div')].map((d) => [d.firstElementChild, d.lastElementChild]),
    w: phTop.querySelector('.ph-w'),
    views: [...phBot.querySelectorAll('[data-v]')],
    cuts: [...phBot.querySelectorAll('[data-c]')],
    play: phBot.querySelector('[data-p]'),
  };
  let portrait = false;
  // the pump in CAD with its strength, and the report: pages beside this one on the site
  const links = document.createElement('div');
  links.className = 'links';
  links.innerHTML = '<a href="hangar.html" target="_blank">АНГАР ↗</a><a href="strength.html" target="_blank">ПРОЧНОСТЬ ↗</a><a href="report.pdf" target="_blank">ОТЧЁТ ↗</a>';
  links.addEventListener('pointerdown', (e) => e.stopPropagation());
  app.appendChild(links);
  const tourCursor = makeCursor(ui);
  const frameConsole = makeConsoleFrame(ui, st);

  // ------------------------------------------------------------ quality tiers
  const TIERS = [
    {samples: 8, ao: true, shadow: 4096, pr: 2},
    {samples: 4, ao: false, shadow: 2048, pr: 1.5},
    {samples: 2, ao: false, shadow: 1024, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    portrait = innerHeight > innerWidth && innerWidth < 820;
    phTop.classList.toggle('on', portrait);
    phBot.classList.toggle('on', portrait);
    if (portrait) {
      // the canvas leaves the 1600 × 900 console for the whole screen, at the screen's own shape
      if (canvas.parentNode !== document.body) document.body.prepend(canvas);
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:0';
      app.style.visibility = 'hidden';
      scale = innerWidth / 900;
      st.resize(innerWidth, innerHeight, clamp(devicePixelRatio || 1, 0.75, TIERS[tier].pr));
      return;
    }
    if (canvas.parentNode !== app) app.prepend(canvas);
    canvas.style.cssText = '';
    app.style.visibility = '';
    const h = innerHeight - top;
    scale = Math.min(innerWidth / W, h / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${top + (h - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Поверните телефон горизонтально';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  let phi = 20;
  // rpm is signed: reversing runs it down through zero and back up the other way
  let rpm = RATED.rpm;
  let reverse = false;
  // the motor: shown unless the visitor hides it (M), and faded out of the views it would stand in front of
  let motorOn = true;
  let motorK = 1;
  let supplyK = 0; // the generator set and converter, faded in for the power view
  let siteK = 0; // the transfer site, faded in for its own view
  let rpmTarget = RATED.rpm;
  let p = RATED.p;
  let pTarget = RATED.p;
  let flowS = 0;
  let elec = 0; // the supply's electrical angle, degrees, slowed with the playback
  let powerS = 0; // mm the pulses have run along the cables
  let transferS = 0; // seconds into the transfer, running ×PLAN.accel while the site view is on
  let oilRun = 0;
  let genAngle = 35; // the generator set's crank, degrees, at 1500 rpm
  let bypassS = 0;
  let playI = 2;
  let paused = false;
  let view = 'hero';
  let viewAt = 0;
  let cut = 'solid';
  let exK = 0;
  const ov = {callouts: 1, flow: 1, arrows: 1, isolate: 0, explode: 0, charts: 1};
  let isoK = 0;
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN.open(0)};
  let ring = {t: -9, x: 0, y: 0};
  let hidden = false;
  const pulse = (x, y) => (ring = {t: T, x, y});
  const pulseBtn = (k) => pulse(...ui.spots[k]);

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    paused = false;
    playI = 2;
    rpmTarget = RATED.rpm;
    reverse = false;
    Object.assign(ov, {callouts: 1, flow: 1, arrows: 1, isolate: 0, explode: 0, charts: 1});
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    view = camName(cyc);
    viewAt = T - (cyc - SCRIPT.filter((e) => e.cam && e.t <= cyc).pop().t);
    if (view === 'unit' && cyc < 3.4) viewAt = T - 6;
    cut = cutAt(cyc);
    ov.explode = explodeOn(cyc) ? 1 : 0;
    pTarget = pAt(cyc);
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });

  // ------------------------------------------------------------ controls
  const setView = (v) => {
    // the site opens in glass so the oil is seen moving; a finished fill starts over
    if (v === 'site' && view !== 'site') {
      if (cut === 'solid') cut = 'glass';
      if (transferS >= st.pump.site.plan.T) transferS = 0;
    }
    view = v;
    viewAt = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  for (const k of CAMS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      setView(k);
    });
  phBot.addEventListener('pointerdown', (e) => e.stopPropagation());
  phBot.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    takeOver();
    if (b.dataset.v) setView(b.dataset.v);
    if (b.dataset.c) cut = b.dataset.c;
    if (b.dataset.p) ui.btn.pause.click();
    if (b.dataset.t) transferS = 0;
    if (b.dataset.l) open(b.dataset.l, '_blank');
  });
  for (const k of CUTS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      cut = k;
    });
  for (const k of OVERLAYS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      ov[k] = ov[k] ? 0 : 1;
    });
  ui.btn.pause.addEventListener('click', () => {
    takeOver();
    pulseBtn('pause');
    paused = !paused;
  });
  ui.btn.reverse.addEventListener('click', () => {
    takeOver();
    pulseBtn('reverse');
    reverse = !reverse;
  });
  for (const [k, d] of [['back', -15], ['fwd', 15]])
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      paused = true;
      phi += d;
    });
  // the three sliders: drag along their tracks
  const slider = (knobAt, apply) => {
    const [x0, y] = knobAt(0);
    const [x1] = knobAt(1);
    const d = document.createElement('div');
    d.className = 'hit ew';
    Object.assign(d.style, {left: `${x0 - 8}px`, top: `${y - 11}px`, width: `${x1 - x0 + 16}px`, height: '22px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      apply(clamp((x - x0) / (x1 - x0), 0, 1));
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  };
  slider(ui.rpmKnob, (k) => (rpmTarget = clamp(k * RPM_MAX, 0, RPM_MAX)));
  slider(ui.pKnob, (k) => (pTarget = clamp(k * P_MAX, 0, P_MAX)));
  slider(ui.playKnob, (k) => (playI = Math.round(k * (PLAYS.length - 1))));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = {1: 'hero', 2: 'front', 3: 'ports', 4: 'valve', 5: 'rotors', 6: 'unit', 7: 'motor', 8: 'power', 9: 'genset', 0: 'truck', p: 'pipes', s: 'site'}[key];
    takeOver();
    if (v) setView(v);
    else if (key === ' ') paused = !paused;
    else if (key === 'h') hidden = !hidden;
    else if (key === 'r') reverse = !reverse;
    else if (key === 'm') motorOn = !motorOn;
    else if (key === 't') transferS = 0;
    else if (key === 'arrowleft') {
      paused = true;
      phi -= 15;
    } else if (key === 'arrowright') {
      paused = true;
      phi += 15;
    } else if (key === 'arrowup') pTarget = clamp(pTarget + 0.025, 0, P_MAX);
    else if (key === 'arrowdown') pTarget = clamp(pTarget - 0.025, 0, P_MAX);
    else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az += ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -20, 60);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.4, 2.2);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let tgt;
    let cursor;
    let since;
    let exTarget;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      const cyc = c - loop * DURATION;
      if (loop > AP.loop) AP.loop = loop;
      view = camName(cyc);
      cut = cutAt(cyc);
      pTarget = pAt(cyc);
      p = pTarget;
      ov.explode = explodeOn(cyc) ? 1 : 0;
      exTarget = explodeAt(cyc);
      exK = exTarget;
      motorK = motorAt(cyc);
      supplyK = supplyAt(cyc);
      siteK = siteAt(cyc);
      tgt = widen(camAt(cyc), exK);
      since = cyc - SCRIPT.filter((e) => e.cam && e.t <= cyc).pop().t;
      cursor = tourCursor(cyc);
      if (AP.loop > 0 && cyc < 0.8) {
        const end = tourCursor(DURATION - 0.01);
        const k = ss(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
    } else {
      if (T - lastInput > IDLE) startTour();
      since = T - viewAt;
      exK += ((ov.explode ? 1 : 0) - exK) * (1 - Math.exp(-dt / 0.6));
      tgt = widen(VIEW_FN[view](since), exK);
      motorK += ((motorOn && !MOTOR_HIDE.has(view) ? 1 : 0) - motorK) * (1 - Math.exp(-dt / 0.3));
      supplyK += ((MOBILE.has(view) ? 1 : 0) - supplyK) * (1 - Math.exp(-dt / 0.35));
      siteK += ((SITE.has(view) ? 1 : 0) - siteK) * (1 - Math.exp(-dt / 0.35));
      tgt.az += off.az;
      tgt.el = clamp(tgt.el + off.el, -10, 80);
      tgt.d *= off.k;
      p += (pTarget - p) * (1 - Math.exp(-dt / 0.3));
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    isoK += ((ov.isolate ? 1 : 0) - isoK) * (1 - Math.exp(-dt / 0.25));
    // the motor runs down and back up the other way over about a second
    rpm += ((reverse ? -1 : 1) * rpmTarget - rpm) * (1 - Math.exp(-dt / 0.35));
    const n = Math.abs(rpm);
    const dir = rpm < -1 || (Math.abs(rpm) <= 1 && reverse) ? -1 : 1;
    // in the site view the pump works against the hoses: the line's own pressure replaces the slider's
    const tr = st.pump.site.plan.state(transferS);
    const pRun = view === 'site' ? tr.pOut : p;
    const fl = flow(n, pRun, dir);
    const ms = motorState(n, power(n, pRun));
    if (!paused) {
      const play = PLAYS[playI];
      // the tour runs at the film's 1/20, the visitor at whatever the slider says
      phi += (rpm / 60) * 360 * dt * play;
      flowS += portSpeed(fl.net) * dt * play * 20;
      bypassS += bypassSpeed(fl.bypass) * dt * play * 20;
      elec += 360 * ms.f * dt * play;
      powerS += powerState(ms, power(n, pRun), 0, EM).speed * dt * play * 20;
      genAngle += (1500 / 60) * 360 * dt * play;
      if (view === 'site') {
        transferS += dt * PLAN.accel;
        oilRun += dt * 700;
      }
    }

    // the camera eases toward its target: the tour's own moves pass through, a loop restart or a click glides
    const k = 1 - Math.exp(-dt / (AP.on ? 0.18 : 0.45));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    // upright, the narrower view backs off so the scene still fits across, and the console's screen shift goes
    const back = portrait ? clamp(16 / 9 / (innerWidth / innerHeight), 1, 4) ** 0.72 : 1;
    const shot = portrait ? {...cam, d: cam.d * back, sx: 0, sy: 0} : cam;
    st.frame(phi, {...shot, az: cam.az * D2R, el: cam.el * D2R}, {cut, p: pRun, open: valveOpen(pRun, dir), flowS, bypassS, flow: ov.flow, arrows: ov.arrows, isolate: isoK, explode: exK, dir, motor: motorK, elec, cosPhi: ms.cos, load: ms.k, power: powerS, supply: supplyK, site: siteK, pv: view === 'site' ? tr.pIn : suctionBudget(Math.max(0.1, fl.th - fl.leak)).pv, transferS, oilRun, genAngle, genLoad: powerState(ms, power(n, pRun), 0, EM).load});

    ui.root.style.display = hidden ? 'none' : '';
    for (const n of ui.root.querySelectorAll('[data-g="charts"]')) n.style.visibility = ov.charts ? '' : 'hidden';
    frameConsole(T, {
      phi,
      cam: view,
      rpm: n,
      p: pRun,
      cursor,
      since,
      ex: exK,
      dir,
      elec,
      genAngle,
      transferS,
      live: {overlays: {...ov}, cut, paused, reverse, playText: playText(PLAYS[playI]), playK: playI / (PLAYS.length - 1)},
    });
    if (portrait && T - (phEl.at ?? -1) > 0.2) {
      phEl.at = T;
      const f1 = (x) => x.toFixed(1).replace('.', ',');
      const mm = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
      phEl.title.textContent = view === 'site' ? 'Перекачка И-20А' : 'Насос Ш80-2,5';
      phEl.sub.textContent = `${LBL[view]} · ${LBL[cut]}${AP.on ? ' · автоэкскурсия' : ''}`;
      const m = view === 'site'
        ? [[`${f1(tr.total)} м³`, `налито из ${f1(tr.totalEnd)}`], [tr.phase === 'fill' ? `${Math.round(tr.curProgress * 100)} %` : tr.phase === 'swap' ? 'рукав' : '✓', tr.cur >= 0 ? tr.phase === 'swap' ? `перестановка → ${['КАМАЗ', 'Scania 1', 'Scania 2', 'Scania 3'][tr.cur]}` : ['КАМАЗ', 'Scania 1', 'Scania 2', 'Scania 3'][tr.cur] : 'всё налито'], [mm(tr.left), 'осталось, ч:мин']]
        : [[`${f1(fl.net)}`, 'подача, м³/ч'], [`${pRun.toFixed(2).replace('.', ',')}`, 'давление, МПа'], [`${f1(power(n, pRun))}`, 'мощность, кВт']];
      phEl.m.forEach(([b, sp], i) => {
        b.textContent = m[i][0];
        sp.textContent = m[i][1];
      });
      phEl.w.innerHTML = view === 'site' ? tr.warnings.map((w) => `⚠ ${w}`).join('<br>') : '';
      for (const b of phEl.views) b.classList.toggle('on', b.dataset.v === view);
      for (const b of phEl.cuts) b.classList.toggle('on', b.dataset.c === cut);
      phEl.play.textContent = paused ? '▶ Пуск' : '❚❚ Пауза';
    }
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>АВТОЭКСКУРСИЯ · НАЖМИТЕ, ЧТОБЫ УПРАВЛЯТЬ' : '▶ ПРОДОЛЖИТЬ ЭКСКУРСИЮ';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  // every shader compiles at once before the first frame (kit/warm.js)
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {st, cam, cfg: CFG, setView, startTour, takeOver, get tier() {
    return tier;
  }, get T() {
    return T;
  }};
}
