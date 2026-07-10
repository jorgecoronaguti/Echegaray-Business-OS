#!/usr/bin/env python3
"""Guardia estructural de la MISIÓN DEL BUSINESS OS (2026-07-10).

Confirma que la misión sigue incorporada como contexto obligatorio:
1. El CLAUDE.md raíz contiene la sección MISIÓN antes de ## CONTEXTO.
2. El Orquestador (CLAUDE.md raíz) declara su subordinación a la misión.
3. La skill del orquestador existe (la capa que la operacionaliza).

El mecanismo que garantiza que la misión sea contexto obligatorio en Claude
Code es doble: (a) el CLAUDE.md raíz se inyecta AUTOMÁTICAMENTE en el contexto
de cada sesión (system context de Claude Code, no depende de que nadie lo lea a
mano); (b) este script protege su integridad — si alguien mueve o borra la
misión, `--validar` del inventario y este guard fallan en la próxima corrida.

Uso: python3 verificar_mision.py   (exit 1 si algo falta)
"""

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[5]  # repo root
claude_md = (RAIZ / "CLAUDE.md").read_text(encoding="utf-8")

errores = []

pos_mision = claude_md.find("# MISIÓN DEL BUSINESS OS")
pos_contexto = claude_md.find("## CONTEXTO")
if pos_mision == -1:
    errores.append("Falta la sección '# MISIÓN DEL BUSINESS OS' en el CLAUDE.md raíz")
elif pos_contexto != -1 and pos_mision > pos_contexto:
    errores.append("La MISIÓN no está antes de '## CONTEXTO' (debe ser lo primero tras el título)")

for frase in (
    "HACER QUE ECHEGARAY CONSTRUCCIONES FUNCIONE CADA VEZ MEJOR PORQUE EL BUSINESS OS EXISTE",
    "¿Cómo contribuye este trabajo a la misión del Business OS",
):
    if frase not in claude_md:
        errores.append(f"Falta el texto clave de la misión: «{frase[:60]}…»")

if "subordinado a la MISIÓN DEL BUSINESS OS" not in claude_md:
    errores.append("El Orquestador no declara su subordinación a la misión")

skill_orq = RAIZ / "echegaray-os/.claude/skills/orquestador-de-razonamiento-y-skills/SKILL.md"
if not skill_orq.exists():
    errores.append("No existe la skill del orquestador")

if errores:
    for e in errores:
        print(f"✗ {e}")
    sys.exit(1)
print("✓ Misión incorporada, primera en el documento, orquestador subordinado, skill presente")
