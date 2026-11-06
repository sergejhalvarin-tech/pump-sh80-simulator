"""Score for the Ш80-2,5 gear pump explorer: a calm bed (Dmaj9, 84 bpm) at one level the whole way, a quiet click on
every button press, a soft air under the pressure drags, a low knock when the relief valve cracks open and when it
seats again, a thin hiss of oil through the valve while it bypasses, and air under the teardown and the reassembly.
The turning rotors stay silent: continuous motion gets no sound.

    python run_sfx.py sims/pump-shared/score.py

Times and the pressure model mirror pump-shared/film.js (SCRIPT, pAt) and kin.js (valveOpen).
"""

import json
import os

from sfx.score_kit import airy, bed, chords, hiss, hz, thud
from sfx.synth import click

HERE = os.path.dirname(os.path.abspath(__file__))
TIMELINE = os.path.join(HERE, "..", "pump-film", "timeline.json")
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "pump-score.wav")
TARGET_LUFS = -14.0
SEED = 17

CHORDS = chords("Dmaj9:D3 F#3 A3 E4/D2", "Bm7:B2 D3 F#3 A3/B1", "Gmaj7:G2 B2 D3 F#3/G1", "A6sus:A2 D3 E3 F#3/A1")
MOTIF = [(0.5, hz("F#5")), (1.5, hz("E5")), (2.5, hz("A4"))]
# every scripted press, and the camera moves among them (film.js SCRIPT)
TL = json.load(open(TIMELINE))
CLICKS = tuple(TL["beats"])
MOVES = (3.4, 8.4, 13.6, 19.8, 24.8, 29.0, 30.8, 35.6, 39.4, 44.6, 55.0)
P_EV = ((16.6, 0.25, 0.35, 1.6), (22.8, 0.35, 0.25, 1.2))
EXPLODE = (56.4, 59.8)
CRACK, FULL = 0.28, 0.40


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def p_at(t):
    p = P_EV[0][1]
    for t0, a, b, d in P_EV:
        if t >= t0:
            p = a + (b - a) * smoother((t - t0) / d)
    return p


def valve_open(p):
    k = min(1.0, max(0.0, (p - CRACK) / (FULL - CRACK)))
    return k * k * (3 - 2 * k)


def valve_span(dur, dt=1 / 240):
    """(cracks open, seats again): the first and last moments the valve is off its seat."""
    t, on, t0, t1 = 0.0, False, None, None
    while t < dur:
        o = valve_open(p_at(t)) > 0.002
        if o and not on:
            t0 = t
        if on and not o:
            t1 = t
        on = o
        t += dt
    return t0, t1


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 84, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.66, keys_lp=3400)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.035)
    for t in CLICKS:
        mix.put(t, click(2400, 0.025), 0.055)
    for t in MOVES:
        mix.put(t, airy(1.2, 700, 1500, 0.6), 0.018)
    for t0, a, b, d in P_EV:
        mix.put(t0, airy(d + 0.5, 500 if b > a else 1400, 1400 if b > a else 500, 0.6), 0.026)
    # the valve: a knock as it lifts, the oil hissing through while it is open, a softer knock as it seats
    t_open, t_shut = valve_span(dur)
    if t_open is not None:
        mix.put(t_open, thud(70, 0.06, 0.35), 0.07)
        end = t_shut if t_shut is not None else dur - 0.3
        mix.put(t_open + 0.05, hiss(end - t_open, 3800, 0.6), 0.022)
    if t_shut is not None:
        mix.put(t_shut, thud(85, 0.04, 0.3), 0.05)
    # the teardown and the reassembly: air as the parts travel, a soft knock as they come home
    mix.put(EXPLODE[0] + 0.1, airy(2.4, 400, 1800, 0.7), 0.03)
    mix.put(EXPLODE[1] + 0.1, airy(2.2, 1800, 400, 0.7), 0.03)
    mix.put(EXPLODE[1] + 2.0, thud(62, 0.05, 0.3), 0.06)
