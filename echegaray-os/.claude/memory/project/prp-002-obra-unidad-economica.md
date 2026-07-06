# PRP-002 — Obra como Unidad Económica

Fecha: 2026-07-06

## Estado

**Capacidad 2 (Obra como Unidad Económica): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-002-obra-unidad-economica.md` para el análisis de arquitectura completo.

## Qué cambió en el modelo

`obras` (no una tabla nueva) se extendió con `monto_contratado` (numeric, >0), `fecha_inicio` (date), `fecha_fin_objetivo` (date, >= fecha_inicio) — todos NOT NULL. `estado` se amplió de `activa/pausada/cerrada` a `contratada/activa/pausada/cerrada` (default ahora `contratada`, representa el momento de la firma antes de que arranque la ejecución física). Migración `supabase/migrations/20260706193000_obras_unidad_economica.sql`.

**Decisión clave**: no se creó ninguna entidad nueva. Se descartaron explícitamente: tabla `contratos` separada (1:1 con Obra hoy, sin necesidad de versionar — revisar cuando exista Adicionales), tabla/vista de resumen económico (violaría "no calcular margen todavía"), historial de cambios de estado (no lo pide el objetivo funcional, se puede agregar después sin romper nada).

## Refactor de código: Obra migró de `features/fundacion/` a `features/obras/`

Justificación: Obra dejó de ser un dato de referencia simple (como Cliente/Proveedor/Cuenta financiera) para ser la unidad económica central del negocio. Archivos movidos: `types/index.ts` (interfaz `Obra` + `obraInputSchema`), `services/obrasService.ts` (agregó `getObraById`), `services/actions.ts` (`createObraAction`), `components/ObraForm.tsx` (ahora pide monto contratado + fechas). `fundacion/page.tsx` perdió la sección de Obra (ahora solo Cliente/Cuenta/Proveedor) y enlaza a `/obras`. `flujo-caja` (MovimientoCajaForm, `/caja` page) actualizó el import del tipo `Obra`.

## UI nueva

- `/obras`: listado + alta de obras.
- `/obras/[id]`: detalle — responde las 9 preguntas del objetivo funcional (cliente, obra, monto contratado, fechas, estado, movimientos de caja de la obra con cuenta financiera y proveedor). Es un listado/join, no un dashboard — sin agregaciones ni cálculos.

## Verificación

Constraints probados con datos reales (monto/fechas/estado rechazan valores inválidos). RLS/GRANT ya cubrían la tabla completa desde Fundación — no hizo falta tocarlos al agregar columnas. Verificación end-to-end vía `execute_sql`: Obra+Cliente+Cuenta+movimiento de caja reales respondieron las 9 preguntas en una sola query. `tsc`/`build`/`lint`/13 tests de Playwright en verde.

## Próxima capacidad sugerida

Con Obra como unidad económica y Caja Operativa ya conectadas, las candidatas naturales son **Presupuesto** (compara contra `monto_contratado`, primer paso real hacia medir desvío) o **Control Económico básico** (presupuesto vs. real). Evaluar con el usuario cuál resuelve la decisión de negocio más urgente antes de construir — no asumir el orden del Blueprint original sin reconfirmar.
