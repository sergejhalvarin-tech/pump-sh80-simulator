"""Strength of the Ш80-2,5's drive shaft and casing with CalculiX: Gmsh meshes the STEP parts from build_pump.py into
quadratic tetrahedra, this writes the CalculiX deck, runs ccx (the one bundled with FreeCAD), reads the stresses back
and writes each part's surface coloured by stress as a GLB for the viewer, plus the numbers to results.json.

Millimetres, newtons, MPa. The parts stand Z up as exported: shafts along y, the drive shaft's axis at z 187.

Cases
- Drive shaft in torsion at the motor's peak torque: АИР160S6, 11 kW at 970 rpm → 108 N·m, Mmax/Mn 2.2 → 238 N·m
  (a jammed rotor at start). The far journal is held, the torque comes in through the key's flank on the Ø35 end;
  shoulders filleted R1.6, the keyway's floor R0.6. Steel 40Х, quenched and tempered (ГОСТ 4543): σт 785 MPa.
- Casing under the hydrotest pressure, 1.5 × the 0.4 MPa full-bypass pressure = 0.6 MPa on the bore and the ports,
  standing on its feet. Grey iron СЧ20 (ГОСТ 1412): σв 200 MPa in tension — iron fails in tension, so the check is
  on the largest principal stress.
"""
import json
import math
import os
import re
import subprocess
from pathlib import Path

import gmsh
import numpy as np
import trimesh

HERE = Path(__file__).parent
OUT = HERE / 'out'
FEA = OUT / 'fea'
FEA.mkdir(parents=True, exist_ok=True)
CCX = os.environ.get('CCX', r'C:\Users\FS\AppData\Local\Programs\FreeCAD_1.1.4-Windows-x86_64-py311\bin\ccx.exe')
Y_DRIVE, Y_DRIVEN, Y_PORT = 187.0, 91.0, 170.0
GMSH_TO_CCX = [0, 1, 2, 3, 4, 5, 6, 7, 9, 8]  # tet10 node order


def mesh(step, size, smallest=None):
    gmsh.initialize()
    gmsh.option.setNumber('General.Terminal', 0)
    gmsh.model.occ.importShapes(str(step))
    gmsh.model.occ.synchronize()
    gmsh.option.setNumber('Mesh.MeshSizeMax', size)
    gmsh.option.setNumber('Mesh.MeshSizeMin', smallest or size / 4)
    gmsh.option.setNumber('Mesh.MeshSizeFromCurvature', 8)
    gmsh.option.setNumber('Mesh.ElementOrder', 2)
    gmsh.option.setNumber('Mesh.HighOrderOptimize', 1)
    gmsh.model.mesh.generate(3)
    tags, xyz, _ = gmsh.model.mesh.getNodes()
    nodes = dict(zip(tags.astype(int), xyz.reshape(-1, 3)))
    etypes, etags, enodes = gmsh.model.mesh.getElements(3)
    tets = enodes[list(etypes).index(11)].astype(int).reshape(-1, 10)
    surfaces = {}
    for dim, tag in gmsh.model.getEntities(2):
        bb = gmsh.model.getBoundingBox(dim, tag)
        st, _, sn = gmsh.model.mesh.getElements(2, tag)
        tri = sn[list(st).index(9)].astype(int).reshape(-1, 6)
        surfaces[tag] = (bb, tri)
    gmsh.finalize()
    return nodes, tets, surfaces


def tri_area(p):
    return 0.5 * np.linalg.norm(np.cross(p[1] - p[0], p[2] - p[0]))


def write_deck(name, nodes, tets, mat, fixed, loads):
    lines = ['*HEADING', name, '*NODE']
    lines += [f'{n},{x:.5f},{y:.5f},{z:.5f}' for n, (x, y, z) in nodes.items()]
    lines.append('*ELEMENT,TYPE=C3D10,ELSET=EALL')
    lines += [f'{i + 1},' + ','.join(str(t[j]) for j in GMSH_TO_CCX) for i, t in enumerate(tets)]
    lines += ['*NSET,NSET=FIX'] + [f'{n},' for n in sorted(fixed)]
    lines += ['*MATERIAL,NAME=M', '*ELASTIC', f'{mat["E"]},{mat["nu"]}', '*SOLID SECTION,ELSET=EALL,MATERIAL=M']
    lines += ['*BOUNDARY', 'FIX,1,3', '*STEP', '*STATIC,SOLVER=ITERATIVE CHOLESKY', '*CLOAD']
    for n, f in loads.items():
        for k in range(3):
            if abs(f[k]) > 1e-9:
                lines.append(f'{n},{k + 1},{f[k]:.6e}')
    lines += ['*NODE FILE', 'U', '*EL FILE', 'S', '*END STEP']
    (FEA / f'{name}.inp').write_text('\n'.join(lines) + '\n')


def run(name):
    r = subprocess.run([CCX, '-i', name], cwd=FEA, capture_output=True, text=True, timeout=3600)
    if not (FEA / f'{name}.frd').exists():
        raise RuntimeError(r.stdout[-2000:] + r.stderr[-2000:])


def read_stress(name):
    """nodal stresses (sxx syy szz sxy syz szx) from the .frd's STRESS block"""
    txt = (FEA / f'{name}.frd').read_text().splitlines()
    out = {}
    i = next(k for k, l in enumerate(txt) if l.startswith(' -4  STRESS'))
    for l in txt[i + 1:]:
        if l.startswith(' -3'):
            break
        if l.startswith(' -1'):
            n = int(l[3:13])
            out[n] = [float(l[13 + 12 * k:25 + 12 * k]) for k in range(6)]
    return out


def invariants(s):
    sxx, syy, szz, sxy, syz, szx = s
    vm = math.sqrt(0.5 * ((sxx - syy) ** 2 + (syy - szz) ** 2 + (szz - sxx) ** 2) + 3 * (sxy ** 2 + syz ** 2 + szx ** 2))
    t = np.array([[sxx, sxy, szx], [sxy, syy, syz], [szx, syz, szz]])
    return vm, float(np.linalg.eigvalsh(t).max())


def turbo(u):
    # Google's Turbo colour map, polynomial fit (blue → green → yellow → red)
    u = min(1, max(0, u))
    r = 0.13572138 + u * (4.6153926 + u * (-42.66032258 + u * (132.13108234 + u * (-152.94239396 + u * 59.28637943))))
    g = 0.09140261 + u * (2.19418839 + u * (4.84296658 + u * (-14.18503333 + u * (4.27729857 + u * 2.82956604))))
    b = 0.1066733 + u * (12.64194608 + u * (-60.58204836 + u * (110.36276771 + u * (-89.90310912 + u * 27.34824973))))
    return [min(1, max(0, c)) for c in (r, g, b)]


def export_glb(name, nodes, surfaces, value, vmax):
    """the part's skin, its vertices coloured by value (0 … vmax), in metres for the viewer"""
    ids = sorted({n for _, tri in surfaces.values() for t in tri for n in t[:3]})
    index = {n: i for i, n in enumerate(ids)}
    verts = np.array([nodes[n] for n in ids]) * 0.001
    faces = np.array([[index[t[0]], index[t[1]], index[t[2]]] for _, tri in surfaces.values() for t in tri])
    cols = np.array([turbo(value.get(n, 0) / vmax) + [1] for n in ids])
    m = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=(cols * 255).astype(np.uint8), process=False)
    m.fix_normals()
    m.export(OUT / f'{name}_stress.glb')


results = json.load(open(OUT / 'fea_results.json')) if (OUT / 'fea_results.json').exists() else {}
ONLY = os.environ.get('FEA_ONLY')

if ONLY in (None, 'shaft'):
    # ------------------------------------------------------------ the drive shaft in torsion
    M_PEAK = 108 * 2.2 * 1000  # N·mm
    nodes, tets, surfs = mesh(OUT / 'drive_shaft.step', 3.0, 1.2)
    fixed, key = set(), None
    for tag, (bb, tri) in surfs.items():
        x0, y0, z0, x1, y1, z1 = bb
        # held at the far journal (Ø40 beyond the gears, away from the drive end): the torque then runs through the whole
        # shaft as in service, and the sections that carry all of it — the Ø35 end with its keyway, the Ø40 journal
        # by the drive end — see it in full. (Clamping the gear seat instead piles the reaction up at its edge.)
        if abs((x1 - x0) / 2 - 20) < 0.5 and y0 > 89:
            fixed |= {n for t in tri for n in t}
        # the keyway's flank: the plane x = +5 (it marks the hub's length)
        if abs(x0 - 5) < 0.05 and abs(x1 - 5) < 0.05:
            key = tri
    # a pure torque, as the coupling's hub puts it in: tangential traction over the Ø35 end where the hub sits (the
    # keyway's 70 mm), no net force — a single force on the key's flank would also bend the shaft as a cantilever
    hub = []
    for tag, (bb, tri) in surfs.items():
        x0, y0, z0, x1, y1, z1 = bb
        if abs((x1 - x0) / 2 - 17.5) < 0.6 and y1 < -120 and abs(y1 - y0) > 20:
            hub += list(tri)
    kn = {n for t in key for n in t}
    ys = [nodes[n][1] for n in kn]
    y_lo, y_hi = min(ys), max(ys)
    hub = [t for t in hub if y_lo <= np.mean([nodes[n][1] for n in t[:3]]) <= y_hi]
    loads = {}
    arm = 0.0
    for t in hub:
        p3 = [nodes[t[0]], nodes[t[1]], nodes[t[2]]]
        c = np.mean(p3, axis=0)
        dx, dz = c[0], c[2] - Y_DRIVE
        arm += tri_area(p3) * math.hypot(dx, dz)
    for t in hub:
        p3 = [nodes[t[0]], nodes[t[1]], nodes[t[2]]]
        c = np.mean(p3, axis=0)
        dx, dz = c[0], c[2] - Y_DRIVE
        rr = math.hypot(dx, dz)
        # traction q (N/mm²) uniform: M = q · Σ A·r
        q = M_PEAK / arm
        f = q * tri_area(p3) * np.array([-dz / rr, 0, dx / rr]) / 3
        for n in t[3:]:
            loads[n] = loads.get(n, np.zeros(3)) + f
    F = M_PEAK / 17.5
    lever = 17.5
    write_deck('shaft', nodes, tets, {'E': 210000, 'nu': 0.3}, fixed, loads)
    run('shaft')
    s = read_stress('shaft')
    vm = {n: invariants(v)[0] for n, v in s.items()}
    vm_raw = max(vm.values())
    # the nodes right under the applied traction and right at the held journal carry the loads' own local peaks:
    # left out (3 and 4 mm). What stays is the keyway's and the shoulders' real concentration and the shaft's body.
    # likewise right at the held journal, where the clamp itself makes a peak
    from scipy.spatial import cKDTree
    dk, _ = cKDTree(np.array([nodes[n] for t in hub for n in t])).query(np.array([nodes[n] for n in vm]))
    df, _ = cKDTree(np.array([nodes[n] for n in fixed])).query(np.array([nodes[n] for n in vm]))
    far = {n: v for (n, v), a, b in zip(vm.items(), dk, df) if a > 3.0 and b > 4.0}
    vmax = max(far.values())
    p999 = float(np.percentile(list(vm.values()), 99.9))
    # the analytic check away from the keyway: τ = 16 M / (π d³) on the Ø35 end, σ_vm = √3 τ
    tau = 16 * M_PEAK / (math.pi * 35 ** 3)
    results['shaft'] = {'torque_Nm': round(M_PEAK / 1000), 'lever_mm': round(lever, 1), 'key_force_kN': round(F / 1000, 1),
                        'nodes': len(nodes), 'elements': len(tets), 'vm_max_MPa': round(vmax, 1), 'vm_peak_at_load_MPa': round(vm_raw, 1),
                        'vm_p999_MPa': round(p999, 1),
                        'tau_analytic_MPa': round(tau, 1), 'vm_analytic_MPa': round(math.sqrt(3) * tau, 1),
                        'yield_MPa': 785, 'safety': round(785 / vmax, 2), 'material': 'Сталь 40Х улучшенная'}
    # the excluded spots drawn at the field's level round them, so the picture shows the shaft, not the load's footprint
    calm = float(np.percentile(list(far.values()), 95))
    export_glb('drive_shaft', nodes, surfs, {n: (v if n in far else min(v, calm)) for n, v in vm.items()}, vmax)
    print('shaft', results['shaft'])

if ONLY in (None, 'body'):
    # ------------------------------------------------------------ the casing under the test pressure
    P = 0.6
    nodes, tets, surfs = mesh(OUT / 'body.step', 7.0)
    fixed, loads = set(), {}
    R_BORE, R_PORT = 54.2, 50.0
    for tag, (bb, tri) in surfs.items():
        x0, y0, z0, x1, y1, z1 = bb
        if z1 < 0.05:  # the feet's underside
            fixed |= {n for t in tri for n in t}
            continue
        pts = np.array([nodes[n] for t in tri for n in t[:3]])
        # wetted: within the bore (round either shaft axis, along y) or within a port (round the port axis, along x)
        rb = np.minimum(np.hypot(pts[:, 0], pts[:, 2] - Y_DRIVE), np.hypot(pts[:, 0], pts[:, 2] - Y_DRIVEN))
        rp = np.hypot(pts[:, 1], pts[:, 2] - Y_PORT)
        in_bore = np.all(rb < R_BORE + 0.3) and np.all(np.abs(pts[:, 1]) < 93)
        in_port = np.all(rp < R_PORT + 0.3)
        if not (in_bore or in_port):
            continue
        for t in tri:
            p3 = [nodes[t[0]], nodes[t[1]], nodes[t[2]]]
            c = np.mean(p3, axis=0)
            if in_bore:
                ax = 0 if math.hypot(c[0], c[2] - Y_DRIVE) < math.hypot(c[0], c[2] - Y_DRIVEN) else 1
                d = np.array([c[0], 0, c[2] - (Y_DRIVE, Y_DRIVEN)[ax]])
            else:
                d = np.array([0, c[1], c[2] - Y_PORT])
            d /= np.linalg.norm(d) or 1
            f = P * tri_area(p3) * d / 3
            for n in t[3:]:
                loads[n] = loads.get(n, np.zeros(3)) + f
    write_deck('body', nodes, tets, {'E': 110000, 'nu': 0.26}, fixed, loads)
    run('body')
    s = read_stress('body')
    inv = {n: invariants(v) for n, v in s.items()}
    s1 = {n: max(0.0, v[1]) for n, v in inv.items()}
    vmb = {n: v[0] for n, v in inv.items()}
    s1max = max(s1.values())
    results['body'] = {'pressure_MPa': P, 'nodes': len(nodes), 'elements': len(tets), 'loaded_nodes': len(loads),
                       'sigma1_max_MPa': round(s1max, 1), 'vm_max_MPa': round(max(vmb.values()), 1), 'tension_strength_MPa': 200,
                       'safety': round(200 / s1max, 1), 'material': 'Чугун СЧ20'}
    export_glb('body', nodes, surfs, s1, s1max)
    print('body', results['body'])

# ------------------------------------------------------------ the teeth, by hand (Lewis, then ГОСТ 21354's form factor)
# the pump's torque at full bypass 0.4 MPa: hydraulic power q·Δp over the mechanical efficiency
q = 663e-6 * 980 / 60  # m³/s theoretical
T_pump = q * 0.4e6 / (0.85 * 980 * 2 * math.pi / 60)  # N·m
Ft = 2 * T_pump / 0.096  # N on the pitch circle (the drive gear carries the driven one's share through the mesh)
b, m = 180, 6
Y_F = 4.3  # form factor for z 16 (ГОСТ 21354, x = 0)
sigma_F = Y_F * Ft / (b * m)
results['teeth'] = {'pump_torque_Nm': round(T_pump, 1), 'Ft_N': round(Ft), 'sigma_F_MPa': round(sigma_F, 2),
                    'allowable_MPa': 300, 'safety': round(300 / sigma_F), 'material': 'Сталь 40Х, зубья закалены'}
print('teeth', results['teeth'])
json.dump(results, open(OUT / 'fea_results.json', 'w'), ensure_ascii=False, indent=1)
