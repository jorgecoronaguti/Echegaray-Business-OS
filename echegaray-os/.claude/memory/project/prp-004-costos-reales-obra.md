---
name: prp-004-costos-reales-obra
description: Capacidad 4 — costo real (comprometido/pendiente/pagado) por obra, vínculo opcional con movimiento_caja, trigger que exige que el vínculo sea a un pago
metadata:
  type: project
---

# PRP-004 — Costos Reales de Obra

Fecha: 2026-07-06

## Estado

**Capacidad 4 (Costos Reales de Obra): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-004-costos-reales-obra.md` para el análisis de arquitectura completo.

## Qué se construyó

Una tabla nueva: `costos_reales` (obra, proveedor opcional, concepto, monto, fecha, estado `comprometido`/`pendiente`/`pagado`, vínculo opcional a `movimientos_caja`, fuente legacy, notas). Migración `supabase/migrations/20260706195537_costos_reales_obra.sql`.

**Regla de dominio impuesta con trigger, no CHECK**: si `costos_reales.movimiento_caja_id` está seteado, ese movimiento tiene que ser de tipo `pago` (no `cobro`) — un CHECK no puede mirar otra tabla, así que se usa `costos_reales_valida_movimiento_pago()` (trigger BEFORE INSERT/UPDATE). Además, índice único parcial en `movimiento_caja_id` para que dos costos no reclamen el mismo pago (anti-doble-conteo, mismo espíritu que [[cash-flow-operativo]]).

## Verificación puntual de CONTROL DE GASTOS.xlsx (antes de modelar)

Confirmado (no inferido): es un ledger de caja (percibido) — Retirada/Depósito/Saldo acumulado, sin ningún concepto de "comprometido pero no pagado". Costos Reales con estados es territorio nuevo del OS, no una migración de un sistema existente.

## Feature nueva

`features/costos-reales/` (types, `costosRealesService.ts`, `actions.ts`, `CostoRealForm.tsx`). UI integrada en `/obras/[id]` — igual que Presupuesto, un Costo Real no tiene sentido como pantalla aislada.

## Verificación

7 casos de constraint contra Supabase real (monto/estado/FK obra/vínculo-a-cobro-rechazado/vínculo-a-pago-aceptado/doble-reclamo-rechazado — todos correctos). RLS/GRANT: `anon` bloqueado, `authenticated` con acceso. Query end-to-end respondió las 9 preguntas del objetivo funcional. `tsc`/`build`/`lint`/15 tests de Playwright en verde.

**Límite conocido**: no se fuerza que `estado = 'pagado'` implique `movimiento_caja_id` no nulo (dato legacy puede llegar pagado sin el movimiento cargado todavía). Sin JWT real, no se probó con Playwright la visibilidad del formulario end-to-end (mismo límite de siempre, ver [[prp-001-fundacion-flujo-caja]]).

## Próxima capacidad sugerida

Con Presupuesto (PRP-003) y Costos Reales (PRP-004) conectados a Obra, ahora sí están las dos piezas necesarias para **Control Económico básico** (presupuesto vs. costo real, primer cierre del ciclo "cotizar → ejecutar → comparar" que pide el CLAUDE.md raíz). Es el candidato natural para la próxima capacidad.
