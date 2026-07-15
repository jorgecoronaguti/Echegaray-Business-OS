# PRP-023: Memoria total del OS

> **Estado**: PENDIENTE — 2026-07-15
> **Subordinado a**: PRINCIPIO DE MEJORA CONTINUA y de CONFIANZA del `CLAUDE.md` raíz — el OS debe preservar conocimiento y no re-descubrir lo ya sabido.
> **Extiende**: PRP-016 (aprendizaje del chat). PRP-016 captura hechos del dueño; PRP-023 es la memoria COMPLETA y consultable de todo lo que el OS sabe, ve y decide.

---

## Objetivo

Que el OS tenga **una sola memoria consultable de todo**: hechos de la empresa, decisiones tomadas, resultados, desvíos aprendidos, documentos leídos, correcciones, y el porqué de cada cosa — recuperable por persona, obra, dominio y fecha. Que "el OS ya sabe X" sea verdad y auditable, no una promesa.

## Por qué

| Problema | Solución |
|---|---|
| El conocimiento vive disperso: `conocimiento_empresa`, `.claude/memory/*`, backlog, tareas cerradas, chat | Una capa de memoria unificada que indexa y recupera todo con su fuente y confianza |
| El OS re-descubre lo mismo (la vigilancia repite hallazgos "confirmado 7×") | Recuperación por relevancia antes de trabajar: no re-investigar lo resuelto |
| No hay memoria de DECISIONES ni de sus RESULTADOS (Decision/Outcome Ledger) | Registrar decisión → acción → resultado → aprendizaje, enlazado |

**Valor**: interés compuesto real (misión) — cada obra, chat y decisión deja al OS más capaz para la próxima, y se puede demostrar.

## Estado real verificado (NO reconstruir)

- `public.conocimiento_empresa`: memoria de hechos (area, afirmacion, clave único, confianza, veces_confirmado, vigente, origen_task_id). Owner-taught (`origen_task_id` NULL) vs vigilancia (NOT NULL). **Ya la usan** el chat (PRP-016) y la vigilancia.
- `.claude/memory/*` (repo) y `~/.claude/.../memory/*` (auto-memoria del asistente): memoria del BUILDER, versionada.
- `orq.tasks` guarda `result`/`key_points` de cada tarea del Work Fabric; la vigilancia ya sube conclusiones a `conocimiento_empresa`.
- `backlog_autonomo` guarda hallazgos/propuestas con evidencia y confianza.
- **Gap**: no hay recuperación unificada por relevancia, ni un Decision/Outcome Ledger, ni memoria ligada a persona/obra de forma consultable desde el chat.

## Fases

- **F1 — Índice unificado de memoria**: una vista/capa que reúne `conocimiento_empresa` + conclusiones de `orq.tasks` + `backlog_autonomo` con campos comunes (afirmación, dominio, obra, fuente, confianza, fecha, origen). Sin duplicar el dato: referencia las fuentes.
- **F2 — Recuperación por relevancia**: dado un pedido/obra/dominio, traer lo que el OS ya sabe (más confirmado y reciente primero) e inyectarlo — extiende el `knownBlock` del chat y el contexto de la vigilancia a TODA la memoria, no solo owner-taught. Barato (0 API): filtrado en DB.
- **F3 — Decision/Outcome Ledger**: registrar cada decisión relevante (qué se decidió, por quién, con qué evidencia) y luego su RESULTADO real; enlazar decisión↔acción↔resultado↔aprendizaje. Cierra el ciclo VER→…→APRENDER→MEJORAR de la misión.
- **F4 — Memoria consultable desde el chat**: "¿qué sabemos de la obra X?", "¿qué decidimos sobre los adicionales de ARCOR?", "¿qué aprendimos de Galpones?" → respuesta determinística (0 API) desde la memoria, con fuente y confianza. Extiende `learnedSummary` a toda la memoria.
- **F5 — Higiene de memoria**: vigencia y contradicción — marcar `vigente=false` lo superado, detectar afirmaciones en conflicto (misma clave, distinto valor) y proponer resolverlas. Nunca presentar dato viejo como vigente.

## Criterios de éxito
- [ ] "¿qué sabés de la obra/cliente/dominio X?" devuelve lo real que el OS sabe, con fuente y confianza, sin llamar a la API.
- [ ] La vigilancia deja de repetir un hallazgo ya resuelto (recuperación evita el duplicado).
- [ ] Existe al menos una decisión con su resultado registrado y enlazado (Ledger vivo).
- [ ] Toda afirmación de memoria distingue HECHO/CÁLCULO/INFERENCIA y su fecha.

## Dependencias
- Se apoya en PRP-022 (para ligar memoria a persona) y PRP-016 (ya vivo). No requiere acción del dueño para F1–F2.

## Riesgos
- No convertir la memoria en un vertedero: todo ítem lleva fuente, confianza y vigencia; la contradicción se resuelve, no se acumula (REALIDAD ÚNICA).
