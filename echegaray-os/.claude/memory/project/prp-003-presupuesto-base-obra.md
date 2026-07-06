# PRP-003 — Presupuesto Base de Obra

Fecha: 2026-07-06

## Estado

**Capacidad 3 (Presupuesto Base de Obra): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-003-presupuesto-base-obra.md` para el análisis de arquitectura completo.

## Qué se construyó

Dos tablas nuevas (a diferencia de Capacidad 2, que no necesitó ninguna): `presupuestos` (una versión del presupuesto de una obra: monto, costo directo/indirecto, margen esperado, estado borrador/aprobado/reemplazado, fuente legacy, fecha) y `partidas_presupuesto` (líneas simples que componen esa versión: código, descripción, monto). Migración `supabase/migrations/20260706200000_presupuesto_base_obra.sql`.

**Reglas de versión**: `unique (obra_id, version)` + índice único parcial que garantiza **como máximo un presupuesto `aprobado` por obra**. Aprobar una versión nueva reemplaza la anterior (`estado = 'reemplazado'`) — implementado como dos llamadas secuenciales en `insertPresupuesto` (no una transacción SQL atómica; documentado como riesgo aceptado sin usuarios concurrentes reales todavía).

## Verificación puntual de Planilla para Cotizar (antes de modelar)

Se confirmó, inspeccionando `sharedStrings.xml` del `.xlsm` (mismo método de discoveries previos, sin modificar nada), que la Planilla ya distingue `COSTOS DIRECTOS`, `COSTOS INDIRECTOS` (suma de Gastos Indirectos de Producción + Gastos Generales de Obra + Gastos Generales de Empresa) y `BENEFICIO` como líneas separadas — el modelo de esta capacidad transcribe esa estructura real, no inventa una fórmula. `margen_esperado` se guarda como dato transcripto, no se recalcula por resta (la Planilla puede ajustar por impuesto a las ganancias teórico).

## Feature nueva

`features/presupuestos/` (types, `presupuestosService.ts`, `actions.ts`, `PresupuestoForm.tsx`, `PartidaPresupuestoForm.tsx`). UI integrada dentro de `/obras/[id]` (no una ruta propia) — Presupuesto siempre está ligado a una Obra, no tiene sentido como pantalla aislada.

## Verificación

6 casos de constraint probados contra Supabase real (monto/costo/version/estado/único-aprobado — todos correctos). Lógica de versionado reproducida manualmente vía `execute_sql` (UPDATE viejo→reemplazado, INSERT nuevo→aprobado) confirmando el mismo resultado que ejecutaría el servicio. Query end-to-end con Obra+Presupuesto+Partida real respondió las 10 preguntas del objetivo funcional. `tsc`/`build`/`lint`/14 tests de Playwright en verde.

**Límite conocido**: la sección de Presupuesto en `/obras/[id]` solo se renderiza si la obra carga correctamente — sin JWT real (mismo bloqueo de siempre, rate limit de emails del proyecto) no se pudo probar con Playwright la visibilidad de los formularios end-to-end, solo que la página no crashea.

## Próxima capacidad sugerida

Con Obra + Caja + Presupuesto conectados, el candidato natural es **Control Económico básico** (presupuesto vs. costo real) — es la primera vez que se podría cerrar el ciclo "cotizar → ejecutar → comparar" que pide el CLAUDE.md raíz. Alternativa: **Costos/Compras** (para tener "costo real" contra qué comparar antes de construir la comparación en sí). Confirmar con el usuario cuál resuelve la decisión más urgente antes de empezar.
