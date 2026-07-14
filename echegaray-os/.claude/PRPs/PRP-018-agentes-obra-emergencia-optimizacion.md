# PRP-018: Agentes de obra autónomos + emergencia desde el chat + auto-optimización

> **Estado**: EN CONSTRUCCIÓN — 2026-07-14
> **Subordinado a**: PRINCIPIO DE AUTONOMÍA (Niveles A–D) y MEJORA CONTINUA del `CLAUDE.md` raíz.
> **Depende de**: PRP-017 (sustrato de obra) — un agente optimiza un proceso; sin datos de obra conectados no hay sobre qué trabajar.

---

## Objetivo

Que múltiples agentes con distintas habilidades trabajen las OBRAS de forma autónoma, que **surjan nuevos solo cuando el chat demuestre una necesidad real**, y que **se optimicen constantemente** con el real de cada obra. Regla rectora del dueño: los agentes *surgen cuando la necesidad se demuestra* — no crear por crear.

## Estado real verificado (inventario 2026-07-14 — REUSAR, no reconstruir)

- **24 agentes** en `orq.principals`, obra-core ya existentes: `presupuestador`, `jefe-obra`, `ingeniero-civil`, `ingenieria`, `arquitecto`, `calidad`, `equipos`, `seguridad`, `compras`, `cfo`, `contador`, `fiscal`, `abogado`, `rrhh`, `administracion`; coordinación: `director-general`, `director-planner`; optimización: `knowledge-manager`. (clearance C, salvo directores/devops D).
- **17 skills de dominio de obra** en `.claude/skills/` (costos-presupuestacion, direccion-obra, planificacion-produccion, ingenieria-civil, calidad-obra, compras…, equipos-flota, derecho-construccion, derecho-laboral, seguridad-higiene-art, finanzas, contabilidad, impuestos, gestion-empresarial-riesgos, administracion-operativa, arquitectura-integracion-finanzas-obras).
- **Maquinaria autónoma ya viva**: Work Fabric (worker 24×7), Director IA que asigna DAG a especialistas (`handlers/direction.mjs`, `specialist.mjs`, `consolidate.mjs`), **vigilancia autónoma** cada 6h, **detector de gaps** + **skill-creator** (`orquestador-de-razonamiento-y-skills`), **memoria** (`conocimiento_empresa`), cola de aprobación (`pending_operations`).
- **Gaps a construir** (no de agentes — de CONEXIONES): (1) el chat interactivo no despacha tareas profundas a los agentes reales; (2) los agentes no están apuntados a obras con datos; (3) no hay emergencia conectada al chat; (4) no hay optimización de skills desde el real, con aprobación.

## Fases (reusar el Work Fabric; crear solo en gap real)

- **F1 — Chat → especialista real**: cuando una directiva del chat necesita trabajo profundo de un dominio, en vez de responder como asistente único, **despacha una tarea al agente especialista existente** (async, vía el worker; reusa `specialist.mjs` + el fallback async de PRP-016b). Ej.: "revisá la exigibilidad de este adicional" → tarea al `abogado`; "armá el cómputo" → `presupuestador`. El chat sigue el hilo y trae el resultado.
- **F2 — Agentes de obra autónomos (watchers)**: apuntar la **vigilancia autónoma** a cada obra activa. Por obra, los agentes revisan (Nivel A–D): desvío presupuesto↔real (`cfo`/`presupuestador`), adicionales sin gestionar (`abogado`/`jefe-obra`), avance vs plan (`director-planner`/`jefe-obra`), vencimientos/compras (`compras`/`administracion`), seguridad (`seguridad`) → hallazgos y propuestas a Pendientes. Nada externo sin aprobación.
- **F3 — Emergencia desde el chat**: cada directiva se evalúa contra el inventario real. Si un patrón recurrente **no lo cubre** ningún especialista/skill (gap verdadero, no una consulta puntual), el OS lo registra y te **propone**: (a) activar un especialista existente para eso, o (b) crear una skill/agente nuevo (reusa detector de gaps + skill-creator) — con tu aprobación. Un gap aislado no crea nada; requiere recurrencia.
- **F4 — Auto-optimización**: el `knowledge-manager` + PRP-016 cierran el lazo — cada agente mejora su skill con el real de la obra (correcciones del chat, desvíos, post-mortem), clasificado A–E, incorporado solo con tu visto bueno. Métrica: menos correcciones repetidas, mejor pegada de cotización.

## Criterios de éxito
- [ ] Una directiva de dominio profundo del chat produce trabajo del **agente especialista real** (registrado: qué agente, qué skills), no del generalista.
- [ ] Emergencia: un gap recurrente del chat propone activar/crear capacidad, mapeado primero contra los 24 agentes / 17 skills (nunca duplica lo existente).
- [ ] Watchers de obra traen ≥1 hallazgo accionable por obra activa, sin efecto externo.
- [ ] Optimización: un aprendizaje real de obra queda incorporado a la skill correcta con aprobación; medible.

## Gotchas / disciplina
- **Reusar antes de crear**: toda necesidad se mapea primero al inventario real; nuevo agente/skill solo ante gap verdadero y recurrente.
- **Autonomía solo interna** (A–D); externo (enviar, pagar, firmar, publicar) siempre con aprobación.
- **`.claude/` protegido**: crear/mejorar skills pasa por aprobación humana (único puente de escritura a `.claude/`).
- **Depende de PRP-017**: sin sustrato de obra, F2/F4 no tienen datos; F1/F3 pueden empezar antes.
