# PRP-019: Ficha de obra individual (`/obras/[id]`)

> **Estado**: PENDIENTE — 2026-07-15
> **Subordinado a**: PRINCIPIO DE REALIDAD ÚNICA del `CLAUDE.md` raíz — una sola representación coherente de cada obra: producción → costo → resultado → caja.
> **Reúne (no reconstruye)**: PRP-017 (cuadro económico + avance físico) y PRP-005 (control económico). Hoy eso vive solo en el chat; falta la PANTALLA.

---

## Objetivo

Una pantalla por obra que muestre, en una sola vista coherente, **la realidad completa de esa obra**: contratado ↔ presupuesto ↔ costo real ↔ margen/desvío ↔ avance físico ↔ adicionales ↔ caja de la obra ↔ alertas, con la evidencia clasificada (dato/cálculo/desconocido).

## Por qué

| Problema | Solución |
|---|---|
| El cuadro económico y el avance físico solo se ven en el chat, uno por vez | Una ficha visual que los reúne y se comparte con Operaciones |
| El backlog marca "Ficha de obra individual sigue sin la estructura pedida" | Construir la estructura de secciones real, alimentada por lo ya calculado |
| Dirección y jefe de obra no tienen dónde mirar UNA obra completa | Vista única por obra, con alerta temprana visible |

**Valor**: hace usable y compartible todo lo construido; alerta temprana visual (misión: detectar desvíos ANTES del cierre).

## Estado real verificado (NO reconstruir)

- Ya calculado y vivo (reusar, no reescribir): `lib/obra-economics.mjs` (`cuadroEconomico`, `desviosObras`), `lib/avance-fisico.mjs` (`avanceResumen`, por hoja del archivo real), `lib/caja-alertas.mjs`.
- Datos reales: `obras` (4), `presupuestos`, `costos_reales` (37), `movimientos_caja` (48). `adicionales` vacía (PRP-025). Avance físico en el Sheet "Avances de Obra" (id `1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug`).
- Stack UI: Next.js App Router + Tailwind (feature-first en `src/features/`). RLS por rol (PRP-022).
- **Gap**: no existe la ruta `/obras/[id]` con estas secciones; el índice de obras existe como `list_obras` (chat), falta la vista web.

## Fases

- **F1 — Ruta + encabezado**: `/obras/[id]` con cabecera (nombre, cliente, estado, fechas, contratado). Server component que lee de Supabase con RLS del usuario.
- **F2 — Bloque económico**: render del cuadro económico (contratado/presupuesto/costo real/margen/desvío) reusando `obra-economics`, con las etiquetas de evidencia y semáforo de desvío.
- **F3 — Avance físico**: % de actividades completas de la obra (de `avance-fisico`), con lista de actividades y su estado; y el cruce físico vs económico (avance de actividades vs % de costo consumido).
- **F4 — Caja + adicionales + alertas**: cobros/pagos de la obra (`movimientos_caja` filtrado por obra), adicionales (cuando PRP-025 los cargue), y las alertas/hallazgos del backlog referidos a esa obra.
- **F5 — Acciones desde la ficha**: pedir al OS un análisis del especialista sobre esta obra, o abrir la fuente en Drive, desde la misma pantalla (reusa dispatch a especialista + navigate).

## Criterios de éxito
- [ ] `/obras/[id]` muestra la realidad económica + avance + caja de la obra en una vista, con evidencia clasificada.
- [ ] Los números coinciden EXACTAMENTE con lo que responde el chat (misma fuente, sin duplicar cálculo).
- [ ] Un `jefe_obra` ve solo sus obras (RLS + PRP-022).
- [ ] La ficha marca el desvío de margen/costo con alerta visual cuando supera el umbral.

## Dependencias
- Reusa PRP-017 (vivo). Permisos por rol dependen de PRP-022. Adicionales de PRP-025.

## Riesgos
- No duplicar lógica de cálculo en el front: la ficha CONSUME los módulos que ya son fuente de verdad. Si un número difiere entre chat y ficha, es bug de duplicación (prohibido por CLAUDE.md).
