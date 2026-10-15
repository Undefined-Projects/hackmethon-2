#!/usr/bin/env python3
"""Genera dist/hackmethon.html: un solo archivo con el CSS y el JS incrustados.
Sirve para compartir la portada por link sin desplegar nada. OJO: en esa
versión el formulario no encuentra /api y cae al correo. El sitio real es
el de Vercel, que sirve public/ y las funciones de api/.

    python3 build.py
"""
import pathlib, re

root = pathlib.Path(__file__).parent
src  = root / "sitio"
html = (src / "index.html").read_text(encoding="utf-8")
css  = (src / "styles.css").read_text(encoding="utf-8")
SCRIPTS = ["sonido.js", "config.js", "script.js", "jardin.js", "bypass-motor.js", "bypass.js"]

# ── el motor de BYPASS se comparte con el servidor ──────────────────
# El servidor vuelve a jugar cada partida con el MISMO motor que la
# portada; si difieren en algo, rechaza todas las partidas. Por eso la
# única copia que se edita es sitio/bypass-motor.js y aquí se copia.
motor_src = src / "bypass-motor.js"
motor_dst = root / "servidor" / "lib" / "bypass-motor.cjs"
actual = motor_dst.read_text(encoding="utf-8") if motor_dst.exists() else None
if actual != motor_src.read_text(encoding="utf-8"):
    motor_dst.write_text(motor_src.read_text(encoding="utf-8"), encoding="utf-8")
    print("servidor/lib/bypass-motor.cjs  (actualizado: vuelve a desplegar el servidor)")
else:
    print("servidor/lib/bypass-motor.cjs  (ya estaba al día)")

html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
for nombre in SCRIPTS:
    js = (src / nombre).read_text(encoding="utf-8")
    html = html.replace(f'<script src="{nombre}"></script>', f"<script>\n{js}\n</script>")

# Se comprueban las etiquetas, no los nombres sueltos: el propio código
# menciona "script.js" en un comentario y eso no significa que falle.
if '<link rel="stylesheet" href="styles.css">' in html or any(
        f'<script src="{n}">' in html for n in SCRIPTS):
    raise SystemExit("No se pudo incrustar: revisa las etiquetas en index.html")

out = root / "dist"
out.mkdir(exist_ok=True)
(out / "hackmethon.html").write_text(html, encoding="utf-8")
print(f"dist/hackmethon.html  ({len(html)/1024:.0f} KB)")

# ── versión para Artifact (sin <html>/<head>/<body>: el host los pone) ──
inner = re.search(r"<body>(.*)</body>", html, re.S).group(1)
# el <title> y los <link> de tipografías se toman de index.html, no se duplican aquí
title = re.search(r"<title>.*?</title>", html, re.S).group(0)
fonts = "\n".join(re.findall(r'<link [^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>', html))
head_bits = f"{title}\n{fonts}\n<style>\n{css}\n</style>\n"

(out / "artifact.html").write_text(head_bits + inner, encoding="utf-8")
print(f"dist/artifact.html    ({len(head_bits + inner)/1024:.0f} KB)")
