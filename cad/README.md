# CAD и прочность насоса

Копия скриптов из `C:\Users\FS\Desktop\CAD\pump_sh80` (рабочая папка cadsmith с build123d).

```bash
uv run python pump_sh80/build_pump.py   # детали → out/*.step, *.stl, pump_sh80.glb, masses.json
uv run python pump_sh80/fea.py          # Gmsh + CalculiX → out/*_stress.glb, fea_results.json
```

Результаты для сайта копируются в `sims/strength/assets`.
