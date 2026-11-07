"""Ш80-2,5 gear pump as CAD parts, from the manual 867-010-00-1 РЭ (appendix Б outline drawing) and the simulator.

Millimetres. Shafts along z (drive end toward +z), y up from the underside of the feet, x across through the ports.
From the drawing: overall 345 wide (x, with the relief valve), 370 high, 395 ± 5 long; ports Ø100 with their axis
170 up, flanges Ø190 with 8 × M14 on Ø158; drive shaft axis 187 up, its end Ø35h6 with a 10 mm key, 42 out of the
cover; feet 180 × 130 with 4 holes Ø19. Rotors: chevron, two helical halves of opposite hand on each shaft
(m 6, z 16, b 180, α 20°, β 20°, centre distance 96, read off the drawing as in the simulator's kin.js); bearings
42308 (40 × 90 × 23). Wall thicknesses and the covers' outline are design estimates, not from the drawing.

Run: uv run python pump_sh80/build_pump.py  →  pump_sh80/out/*.step, *.stl, pump_sh80.glb, masses.json
"""
import json
import math
from pathlib import Path

from build123d import (Axis, Box, Cylinder, Compound, GeomType, Location, Polyline, Pos, Spline, ThreePointArc, Wire,
                       export_gltf, export_step, export_stl, fillet, loft, make_face)

OUT = Path(__file__).parent / 'out'
OUT.mkdir(exist_ok=True)

G = dict(m=6, z=16, b=180, alpha=20, beta=20)
A = 96.0  # centre distance
Y_DRIVE = 187.0
Y_DRIVEN = Y_DRIVE - A
Y_PORT = 170.0
R_TIP = (G['m'] * G['z'] + 2 * G['m']) / 2  # 54
R_BORE = R_TIP + 0.2
BODY_Z = G['b'] / 2 + 2  # body faces at ±92
COVER = 48  # cover thickness
WALL = 22


def gear_face():
    """The transverse tooth outline as one face, four edges a tooth: two involute flanks as splines from the root up the
    base circle to the tip (radial below the base circle, as z 16 at α 20° is undercut without a profile shift), the
    tip arc and the root arc to the next tooth."""
    m, z = G['m'], G['z']
    r = m * z / 2
    rb = r * math.cos(math.radians(G['alpha']))
    ra = r + m
    rf = r - 1.25 * m
    inv = lambda a: math.tan(a) - a
    half_b = math.pi / (2 * z) + inv(math.radians(G['alpha']))  # half tooth angle at and below the base circle
    half_at = lambda rr: half_b if rr <= rb else half_b - inv(math.acos(rb / rr))
    pitch = 2 * math.pi / z
    P = lambda rr, a: (rr * math.cos(a), rr * math.sin(a))
    radii = [rf, rb] + [rb + (ra - rb) * (i / 6) ** 1.3 for i in range(1, 7)]
    edges = []
    for k in range(z):
        c = k * pitch
        lead = [P(rr, c - half_at(rr)) for rr in radii]
        trail = [P(rr, c + half_at(rr)) for rr in reversed(radii)]
        edges.append(Polyline(*lead[:2]).edges()[0])
        edges.append(Spline(*lead[1:]))
        edges.append(ThreePointArc(lead[-1], P(ra, c), trail[0]))
        edges.append(Spline(*trail[:-1]))
        edges.append(Polyline(*trail[-2:]).edges()[0])
        nxt = c + pitch
        edges.append(ThreePointArc(trail[-1], P(rf, c + pitch / 2), P(rf, nxt - half_at(rf))))
    return make_face(Wire(edges))


def chevron_rotor(hand=1):
    """One rotor's teeth: two helical halves of opposite hand meeting in the middle, bored Ø50 for the shaft."""
    face = gear_face()
    r_pitch = G['m'] * G['z'] / 2
    half = G['b'] / 2
    twist = math.degrees(half * math.tan(math.radians(G['beta'])) / r_pitch)  # ≈ 39° over each half
    n = 4
    halves = []
    for s in (-1, 1):
        secs = []
        for i in range(n + 1):
            u = i / n
            z = s * half * u
            secs.append(face.moved(Location((0, 0, z))).rotate(Axis.Z, hand * twist * u))
        halves.append(loft(secs, ruled=False))
    rotor = halves[0] + halves[1]
    rotor -= Cylinder(25, G['b'] + 2)
    return rotor


def shaft(drive=True):
    """Ø50 gear seat across the rotor, Ø40 journals through the bearings, on the drive shaft the Ø35h6 end with its key."""
    z_back = -(BODY_Z + COVER - 4)
    z_front = BODY_Z + COVER - 4
    parts = Cylinder(25, G['b'], align=None).moved(Pos(0, 0, -G['b'] / 2))
    parts += Cylinder(20, z_front - G['b'] / 2, align=None).moved(Pos(0, 0, G['b'] / 2))
    parts += Cylinder(20, -z_back - G['b'] / 2, align=None).moved(Pos(0, 0, z_back))
    if drive:
        z_end = z_front + 42 + 48  # out through the seal housing, then 42 clear of the cover
        parts += Cylinder(17.5, z_end - z_front, align=None).moved(Pos(0, 0, z_front))
    # fillets R1.6 where each journal or end steps down from the larger diameter: a sharp step would be a stress
    # raiser (and in the strength model a singularity)
    steps = [e for e in parts.edges().filter_by(GeomType.CIRCLE) if (abs(e.radius - 20) < 0.01 and abs(abs(e.center().Z) - G['b'] / 2) < 0.01) or (abs(e.radius - 17.5) < 0.01 and abs(e.center().Z - z_front) < 0.01)]
    parts = fillet(steps, 1.6) if steps else parts
    if drive:
        key = Box(10, 8, 70, align=None).moved(Pos(-5, 17.5 - 5, z_end - 75))
        parts -= key
        # the keyway's floor corners R0.6 (ГОСТ 23360 gives 0.4–0.6 for a 10 mm key)
        floor = [e for e in parts.edges().filter_by(GeomType.LINE) if abs(e.center().Y - 12.5) < 0.01 and abs(abs(e.center().X) - 5) < 0.01]
        parts = fillet(floor, 0.6) if floor else parts
    return parts


def body():
    """The casing: the block round the figure-eight bore, the two port pads with flanges, the feet, the valve boss."""
    h0 = Y_DRIVEN - R_BORE - WALL
    h1 = Y_DRIVE + R_BORE + WALL
    blk = Box(250, h1 - h0, 2 * BODY_Z, align=None).moved(Pos(-125, h0, -BODY_Z))
    for x in (-1, 1):
        # port pads along x out to the flange faces at ±150, the flanges Ø190 × 22 beyond them
        blk += Cylinder(70, 40, rotation=(0, 90, 0)).moved(Pos(x * 135, Y_PORT, 0))
        blk += Cylinder(95, 22, rotation=(0, 90, 0)).moved(Pos(x * (150 + 11), Y_PORT, 0))
    # feet: a plinth under the block, the foot plate 22 thick with four Ø19 holes on 180 × 130
    blk += Box(160, h0 + 2, 150, align=None).moved(Pos(-80, 0, -75))
    blk += Box(230, 22, 170, align=None).moved(Pos(-115, 0, -85))
    # the relief valve's boss along x on top (its barrel is a separate part), and the lifting lug up to 370
    blk += Cylinder(44, 160, rotation=(0, 90, 0)).moved(Pos(20, h1 + 26, 0))
    blk += Box(56, 370 - h1, 36, align=None).moved(Pos(-28, h1, -18))
    # the bore: two cylinders through the length, the ports into it, the valve's passages, the holes
    blk -= Cylinder(R_BORE, 2 * BODY_Z + 2).moved(Pos(0, Y_DRIVE, 0))
    blk -= Cylinder(R_BORE, 2 * BODY_Z + 2).moved(Pos(0, Y_DRIVEN, 0))
    blk -= Cylinder(50, 345, rotation=(0, 90, 0)).moved(Pos(0, Y_PORT, 0))
    blk -= Cylinder(30, 150, rotation=(0, 90, 0)).moved(Pos(25, h1 + 26, 0))
    blk -= Cylinder(14, 60, rotation=(0, 0, 0)).moved(Pos(0, 370 - 22, 0))
    # cored cavities each side of the bore, closed in the casting: the iron is a 15–20 mm wall round the bore
    for x in (-1, 1):
        blk -= Box(34, h1 - h0 - 70, 2 * BODY_Z - 40, align=None).moved(Pos(x * 90 - 17, h0 + 32, -BODY_Z + 20))
    for x in (-1, 1):
        blk -= Cylinder(12, 60, rotation=(90, 0, 0)).moved(Pos(x * 80, h1 + 10, 0))
        for i in range(8):
            a = math.radians(22.5 + 45 * i)
            blk -= Cylinder(6, 40, rotation=(0, 90, 0)).moved(Pos(x * 160, Y_PORT + 79 * math.sin(a), 79 * math.cos(a)))
    for x in (-90, 90):
        for z in (-65, 65):
            blk -= Cylinder(9.5, 60, rotation=(90, 0, 0)).moved(Pos(x, 11, z))
    return blk


def cover(front=True):
    """A cover: two discs round the shafts joined into a plate, the bearing pockets Ø90 × 23, the shaft holes."""
    s = 1 if front else -1
    z0 = s * BODY_Z
    plate = Cylinder(80, COVER, align=None).moved(Pos(0, Y_DRIVE, z0 if front else z0 - COVER))
    plate += Cylinder(80, COVER, align=None).moved(Pos(0, Y_DRIVEN, z0 if front else z0 - COVER))
    plate += Box(160, A, COVER, align=None).moved(Pos(-80, Y_DRIVEN, z0 if front else z0 - COVER))
    for y in (Y_DRIVE, Y_DRIVEN):
        plate -= Cylinder(45, 23, align=None).moved(Pos(0, y, z0 if front else z0 - 23))
        plate -= Cylinder(21, COVER + 2, align=None).moved(Pos(0, y, (z0 if front else z0 - COVER) - 1))
    if front:
        # the face seal's housing round the drive shaft
        plate += Cylinder(38, 48, align=None).moved(Pos(0, Y_DRIVE, z0 + COVER))
        plate -= Cylinder(19, 50, align=None).moved(Pos(0, Y_DRIVE, z0 + COVER - 1))
    for y in (Y_DRIVE, Y_DRIVEN):
        for a in range(6):
            t = math.radians(30 + 60 * a)
            plate -= Cylinder(6.5, COVER + 2, align=None).moved(Pos(66 * math.cos(t), y + 66 * math.sin(t), (z0 if front else z0 - COVER) - 1))
    return plate


def valve_barrel():
    """The relief valve's barrel and cap over the boss (spring Ø inside 60)."""
    h1 = Y_DRIVE + R_BORE + WALL
    # the barrel from the boss's end at x −60 out to −133, the adjusting cap to −173 (345 overall with the far flange)
    v = Cylinder(40, 73, rotation=(0, 90, 0)).moved(Pos(-96.5, h1 + 26, 0))
    v -= Cylinder(30, 70, rotation=(0, 90, 0)).moved(Pos(-95, h1 + 26, 0))
    v += Cylinder(20, 40, rotation=(0, 90, 0)).moved(Pos(-153, h1 + 26, 0))
    return v


STEEL = 7.85e-6  # kg/mm³
IRON = 7.2e-6

parts = {
    'drive_rotor': (chevron_rotor(1).moved(Pos(0, Y_DRIVE, 0)), STEEL, (0.72, 0.74, 0.78)),
    'driven_rotor': (chevron_rotor(-1).moved(Pos(0, Y_DRIVEN, 0)).rotate(Axis((0, Y_DRIVEN, 0), (0, 0, 1)), 360 / G['z'] / 2), STEEL, (0.72, 0.74, 0.78)),
    'drive_shaft': (shaft(True).moved(Pos(0, Y_DRIVE, 0)), STEEL, (0.62, 0.64, 0.68)),
    'driven_shaft': (shaft(False).moved(Pos(0, Y_DRIVEN, 0)), STEEL, (0.62, 0.64, 0.68)),
    'body': (body(), IRON, (0.12, 0.33, 0.62)),
    'front_cover': (cover(True), IRON, (0.12, 0.33, 0.62)),
    'rear_cover': (cover(False), IRON, (0.12, 0.33, 0.62)),
    'valve_barrel': (valve_barrel(), IRON, (0.12, 0.33, 0.62)),
}

masses = {}
shapes = []
for name, (shape, rho, col) in parts.items():
    # built with y up; CAD files stand Z up (STEP, glTF's own Y-up conversion follows from that)
    shape = shape.rotate(Axis.X, 90)
    shape.label = name
    shape.color = col
    export_step(shape, str(OUT / f'{name}.step'))
    export_stl(shape, str(OUT / f'{name}.stl'), tolerance=0.05, angular_tolerance=0.2)
    masses[name] = round(shape.volume * rho, 2)
    shapes.append(shape)
    print(f'{name:14s} {shape.volume / 1e3:9.1f} cm³ {masses[name]:7.2f} kg  valid={shape.is_valid}')

asm = Compound(label='pump_sh80', children=shapes)
export_step(asm, str(OUT / 'pump_sh80_assembly.step'))
export_gltf(asm, str(OUT / 'pump_sh80.glb'), binary=True, linear_deflection=0.3, angular_deflection=0.3)
bb = asm.bounding_box()
total = round(sum(masses.values()), 1)
print('overall', [round(v) for v in (bb.size.X, bb.size.Y, bb.size.Z)], 'mm; mass', total, 'kg (manual: ≤ 93 kg cast iron)')
json.dump({'parts': masses, 'total_kg': total, 'size_mm': [round(v) for v in (bb.size.X, bb.size.Y, bb.size.Z)]}, open(OUT / 'masses.json', 'w'), ensure_ascii=False, indent=1)
