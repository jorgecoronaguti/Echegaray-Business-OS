# PRP-016: Aprendizaje continuo del OS — aprender del uso diario y mejorar a sus especialistas

> **Estado**: EN CONSTRUCCIÓN — 2026-07-14
> **Proyecto**: Echegaray Business OS — orquestador + extensión
> **Subordinado a**: PRINCIPIO DE MEJORA CONTINUA y PRINCIPIO DE AUTONOMÍA (Niveles A–D) del `CLAUDE.md` raíz

---

## Objetivo

Cerrar el lazo de interés compuesto: que **cada chat, cada corrección y cada operación** del canal interactivo deje al OS más capaz para la próxima. Hoy el OS entiende y actúa, pero **tira lo que aprende de tu uso diario**: si lo corregís ("el proveedor clave es X", "esa fila va en la pestaña Y", "el saldo real es otro"), mañana repite el error. PRP-016 captura ese aprendizaje, lo **propone** en la misma cola de Pendientes (con tu visto bueno), y lo **incorpora** al conocimiento de la empresa y —cuando corresponde— a la skill del especialista.

## Por qué (misión)

Alto impacto (mejora toda decisión futura), riesgo contenido (todo pasa por aprobación humana; el "cerebro" del OS no se reescribe solo), frecuencia máxima (cada interacción), y capacidad desbloqueada (el OS se vuelve más inteligente sin un modelo más grande). Es el `MEJORA CONTINUA` del `CLAUDE.md` aplicado al canal que Jorge realmente usa.

## Estado real verificado (NO reconstruir)

- **`public.conocimiento_empresa`** (migración `20260715140000`): memoria organizacional acumulada — `area, afirmacion, clave (unique, dedup), confianza, veces_confirmado, vigente, origen_task_id`. Hoy **solo la escribe `scripts/vigilancia-autonoma.mjs`** (rondas de 6h) y se re-inyecta al Director. **El canal interactivo NO la escribe ni la lee.** ← gap central.
- **Cola de aprobación** (`orq.pending_operations` + `enqueuePendingOperation`/`decidePendingOperation`/`operationExecuteHandler`): probada y viva (PRP-015). Reusable para proponer aprendizajes, no solo escrituras en Drive.
- **Policy A–F** (`orq.policy_decide`): capacidades con clearance. Agregaremos `knowledge.write` (Nivel D, interno/reversible) y `skill.improve` (Nivel D pero **siempre requires_approval** porque muta `.claude/`).
- **Skills**: cada `SKILL.md` tiene `## Historial de aprendizaje (append-only)` y `## Gaps de conocimiento conocidos`, con clasificación A–E. `.claude/` está protegido de escritura autónoma (por diseño) → mejorar una skill **exige aprobación humana**.
- **Clasificación de aprendizaje** (CLAUDE.md): **A** observación aislada · **B** recurrencia · **C** patrón probable · **D** conocimiento validado · **E** regla aprobada. Una A nunca se vuelve regla sin validación.

## Fases

### Fase 1 — Capturar y proponer conocimiento de empresa (núcleo seguro)
Tras responder una directiva, un paso liviano detecta si hubo **aprendizaje o corrección** (el dueño corrigió un dato, se confirmó un hecho de la empresa). Si lo hay, se **propone** como operación pendiente `knowledge.write` con: `afirmacion`, `area`, `clave` (normalizada), `confianza`, y clasificación A–E. En Pendientes se ve "📚 Aprendí: …". Aprobar → `operationExecuteHandler` inserta/upsertea en `conocimiento_empresa` (dedup por `clave`, sube `veces_confirmado`). Rechazar → nada.
- Tool `knowledge_propose` (capability `knowledge.write`).
- Handler de ejecución para `knowledge.write` (insert con `on conflict (clave)`).
- Detección: instrucción al modelo para emitir `knowledge_propose` cuando corresponda, sin inventar (solo hechos con evidencia en el chat/archivo).

### Fase 2 — Re-inyectar el conocimiento en las respuestas
El canal interactivo lee el top-N de `conocimiento_empresa` (por `veces_confirmado`, `vigente`) y lo inyecta como contexto **acotado** (evitando el "divague" que ya nos pasó: máximo N afirmaciones cortas, marcadas como conocimiento acumulado, no como orden). Medible: el OS deja de pedir/errar datos que ya le enseñaste.

### Fase 3 — Proponer mejoras de skill (mutar el cerebro, con aprobación)
Cuando un aprendizaje es un **patrón profesional reusable** (no un dato puntual), se propone `skill.improve`: qué skill, qué línea agregar a su `## Historial de aprendizaje`, con clasificación A–E. Aprobar → append al `SKILL.md` correcto (único camino de escritura a `.claude/`, siempre humano). Así "se mejora a sus especialistas" — con tu visto bueno.

### Fase 4 — Medir
Contador de correcciones por sesión y de aprendizajes incorporados/aplicados. Objetivo: la curva de correcciones baja con el tiempo.

## Criterios de éxito
- [ ] Una corrección en el chat produce una propuesta `knowledge.write` real en Pendientes, clasificada A–E, sin inventar.
- [ ] Aprobar incorpora el hecho a `conocimiento_empresa` (dedup) y se **re-inyecta** en las próximas respuestas (verificable: deja de errar ese dato).
- [ ] Una mejora de skill se propone como `skill.improve` y, aprobada, appendea al `SKILL.md` correcto — nunca autónomo.
- [ ] `.claude/` sigue protegido de escritura autónoma; el único append es vía operación aprobada.
- [ ] Nada de esto degrada la velocidad ni reintroduce el "divague".

## Gotchas
- **No inventar aprendizajes**: solo hechos con evidencia real; una observación aislada es A, no regla.
- **No re-divagar**: la re-inyección (F2) debe ser mínima y marcada; ya vimos que inyectar la memoria completa hacía respuestas largas.
- **`.claude/` protegido**: `skill.improve` es el único puente, y solo tras aprobación humana.
- **Dedup por `clave`**: normalizar la afirmación para no duplicar conocimiento.
