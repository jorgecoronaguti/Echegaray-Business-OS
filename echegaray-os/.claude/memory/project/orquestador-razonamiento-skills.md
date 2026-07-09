---
name: orquestador-razonamiento-skills
description: "Implementado 2026-07-09 el Orquestador de Razonamiento y Skills como comportamiento estructural — dos capas (regla obligatoria en CLAUDE.md raíz + skill meta), inventario automático desde filesystem, detector de gaps A–G, casos de test de comportamiento, gaps reales registrados en backlog_autonomo."
metadata: 
  node_type: memory
  type: project
  originSessionId: 72fdc692-33cc-4867-a793-62404adaab68
---

Jorge pidió (2026-07-09) que ningún trabajo material arranque con razonamiento genérico: antes, siempre, problema real → dominios → skills → gaps → investigación → integración → ejecución → validación → aprendizaje. No una skill decorativa ignorable.

**Dónde vive**:
- Capa 1: sección "ORQUESTADOR DE RAZONAMIENTO Y SKILLS — REGLA OBLIGATORIA" dentro del Sistema de Razonamiento Multidisciplinario del `CLAUDE.md` raíz, más la primera fila de la matriz de activación.
- Capa 2: `echegaray-os/.claude/skills/orquestador-de-razonamiento-y-skills/` (SKILL.md con protocolo A–M, detector de gaps A–G, jerarquía de evidencia 1–6, creación/mejora autónoma de skills; `scripts/inventario_skills.py`; `CASOS_TEST.md` con 8 casos, 4 de incidentes reales).

**Decisiones clave**:
- Inventario NUNCA manual: `inventario_skills.py` descubre desde filesystem, valida frontmatter + secciones obligatorias de expert-domain, deriva última modificación de git. Evidencia de por qué: SKILLS_README decía "12 total" con 30+ en disco.
- Taxonomía `metadata.type`: expert-domain | technical | methodology | meta-orchestration — agregada a las 12 skills que no la tenían.
- Gaps no resueltos en sesión → tabla real `backlog_autonomo` (tipos `gap_skill`/`integracion_faltante` ya existían); insertados vía usuario direccion de tests (no hay service role key en .env.local). 3 gaps reales cargados el 2026-07-09: conciliación fiscal (gap tipo G), ART sin canal de pago (gap_dato, urgencia alta), nómina devengada ↔ P&L sin conciliar (integracion_faltante).
- Trazabilidad al Operador Digital: formato ANÁLISIS/CAPACIDADES/EVIDENCIA/HALLAZGO/ACCIÓN/CONFIANZA/GAP, solo cuando es útil; el canal estructural es el backlog (ya visible en la UI, sin código nuevo).

**Cómo aplicar**: toda sesión futura corre el protocolo antes de trabajo material; skills activadas deben modificar el resultado (activación ceremonial prohibida); todo error real de producción se convierte en caso nuevo de `CASOS_TEST.md`. Ver [[skill-google-sheets-business-systems]] y [[resumen-manual-vs-dashboard-pivots]] como precedentes del patrón "incidente real → regla en la skill".
