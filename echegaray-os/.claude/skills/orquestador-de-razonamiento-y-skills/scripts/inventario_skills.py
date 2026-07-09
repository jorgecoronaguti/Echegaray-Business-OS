#!/usr/bin/env python3
"""Inventario vivo de skills — descubrimiento automático desde el filesystem.

Nunca mantener una lista manual de skills (SKILLS_README.md decía "12 total"
con 30 en disco — evidencia de que las listas manuales mueren). Este script es
la fuente de verdad del paso F del protocolo del orquestador.

Uso:
    python3 inventario_skills.py            # tabla del inventario + advertencias
    python3 inventario_skills.py --validar  # exit 1 si hay errores estructurales
"""

import re
import subprocess
import sys
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parents[2]  # .claude/skills/

# Secciones que una skill experta de dominio debe tener (formato de la casa).
SECCIONES_EXPERT_DOMAIN = [
    "## Propósito",
    "## Alcance",
    "## Interacción con otras skills",
    "## Límites de certeza",
    "## Prohibido",
]

# Palabras que indican que la descripción declara cuándo activarse.
PATRON_ACTIVACION = re.compile(r"[Aa]ctivar|[Cc]uándo|[Cc]uando|SIEMPRE", re.UNICODE)


def parse_frontmatter(texto: str) -> dict:
    """Parser mínimo de frontmatter YAML (sin dependencia de PyYAML)."""
    m = re.match(r"^---\n(.*?)\n---\n", texto, re.DOTALL)
    if not m:
        return {}
    fm: dict = {}
    seccion_metadata = False
    for linea in m.group(1).splitlines():
        if linea.startswith("metadata:"):
            seccion_metadata = True
            fm["metadata"] = {}
            continue
        if seccion_metadata and linea.startswith("  "):
            k, _, v = linea.strip().partition(":")
            fm["metadata"][k.strip()] = v.strip().strip('"')
            continue
        seccion_metadata = False
        k, _, v = linea.partition(":")
        if _:
            fm[k.strip()] = v.strip().strip('"')
    return fm


def ultima_modificacion_git(path: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%as", "--", str(path)],
            capture_output=True, text=True, cwd=SKILLS_DIR, timeout=10,
        )
        fecha = out.stdout.strip()
        # Sin historial de git = archivo nuevo sin commitear.
        return fecha if fecha else "sin commit"
    except Exception:
        return "?"


def main() -> int:
    validar = "--validar" in sys.argv
    filas = []
    errores: list[str] = []
    advertencias: list[str] = []

    for d in sorted(SKILLS_DIR.iterdir()):
        skill_md = d / "SKILL.md"
        if not d.is_dir() or not skill_md.exists():
            continue
        texto = skill_md.read_text(encoding="utf-8")
        fm = parse_frontmatter(texto)
        nombre = fm.get("name", d.name)
        desc = fm.get("description", "")
        tipo = fm.get("metadata", {}).get("type", "sin-tipo") if isinstance(fm.get("metadata"), dict) else "sin-tipo"
        fecha = ultima_modificacion_git(skill_md)

        if not fm:
            errores.append(f"{nombre}: sin frontmatter parseable")
        if not desc:
            errores.append(f"{nombre}: sin description")
        elif tipo in ("expert-domain", "meta-orchestration") and not PATRON_ACTIVACION.search(desc):
            advertencias.append(f"{nombre}: la description no declara cuándo activarla")
        if tipo == "sin-tipo":
            advertencias.append(f"{nombre}: sin metadata.type (expert-domain | technical | methodology | meta-orchestration)")
        if tipo == "expert-domain":
            faltan = [s for s in SECCIONES_EXPERT_DOMAIN if s not in texto]
            if faltan:
                errores.append(f"{nombre}: faltan secciones obligatorias: {', '.join(faltan)}")

        filas.append((nombre, tipo, fecha, desc[:110] + ("…" if len(desc) > 110 else "")))

    print(f"# Inventario de skills — {len(filas)} en disco ({SKILLS_DIR})\n")
    print(f"{'skill':<45} {'tipo':<20} {'últ.mod':<12} descripción")
    print("-" * 140)
    for nombre, tipo, fecha, desc in filas:
        print(f"{nombre:<45} {tipo:<20} {fecha:<12} {desc}")

    if advertencias:
        print(f"\n## Advertencias ({len(advertencias)})")
        for a in advertencias:
            print(f"  ⚠ {a}")
    if errores:
        print(f"\n## Errores estructurales ({len(errores)})")
        for e in errores:
            print(f"  ✗ {e}")

    if validar and errores:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
