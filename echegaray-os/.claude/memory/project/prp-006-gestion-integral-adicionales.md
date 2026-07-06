---
name: prp-006-gestion-integral-adicionales
description: Capacidad 6 — tabla adicionales con fecha+monto por etapa (no enum lineal), para poder detectar secuencias fuera de orden; alertas de decisión calculadas en TypeScript puro
metadata:
  type: project
---

# PRP-006 — Gestión Integral de Adicionales

Fecha: 2026-07-06

## Estado

**Capacidad 6 (Gestión Integral de Adicionales): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-006-gestion-integral-adicionales.md` para el análisis de arquitectura completo.

## Qué se construyó

Una tabla nueva: `adicionales` — una fila por adicional, con columnas `fecha_X`/`monto_X` nullable por etapa (cotización, aprobación, ejecución, facturación, cobranza) en vez de un `estado` enum lineal. Migración `supabase/migrations/20260706201926_adicionales_gestion_integral.sql`.

**Decisión de arquitectura más importante de la capacidad**: un enum lineal no puede representar que un adicional fue ejecutado sin haber sido cotizado — forzaría a elegir un único "estado actual". Se verificó explícitamente contra Supabase real que la base **permite** insertar `fecha_ejecucion` con `fecha_cotizacion` nula — es la anomalía central que esta capacidad existe para detectar, no para impedir.

**Alertas calculadas en TypeScript puro** (`calcularAlertasAdicional`, en `features/adicionales/types/index.ts`), no en una vista SQL — a diferencia de [[prp-005-control-economico-basico-obra]], acá cada alerta es un predicado sobre una sola fila (sin joins ni agregación), así que una función pura es más simple y auditable. 7 tipos de alerta: ejecutado sin cotizar, cotizado pendiente de aprobación, aprobado pendiente de ejecución, ejecutado pendiente de facturación, facturado pendiente de cobranza, frenado (flag explícito con motivo obligatorio, no derivado de fechas), riesgo de pérdida de margen (el monto bajó entre una etapa y la siguiente).

**Reutiliza el patrón de [[prp-004-costos-reales-obra]]**: `movimiento_caja_id` opcional + trigger que exige que el movimiento vinculado sea de tipo `cobro` (espejo del trigger de costos_reales que exige tipo `pago`), + índice único parcial para que dos adicionales no reclamen el mismo movimiento.

## Verificación

Caso central probado explícitamente (ejecutado sin cotizar permitido). 6 constraints/triggers probados contra Supabase real (montos, pareja fecha/monto, frenado sin motivo, vínculo a tipo incorrecto, vínculo válido, doble reclamo). RLS/GRANT verificado. Query end-to-end respondió las 14 preguntas del objetivo funcional. `tsc`/`build`/`lint`/17 tests de Playwright en verde.

**Límite conocido**: no se modelan cobros parciales múltiples por adicional (un solo `movimiento_caja_id`); `frenado` requiere revisión humana periódica, no hay heurística automática por tiempo transcurrido (deliberado — evita fabricar un umbral de días no validado).

## Próxima capacidad sugerida

Con Adicionales, Presupuesto, Costos Reales y Control Económico ya cubriendo el ciclo completo de una obra, los candidatos son: **Facturación/Certificación** (para completar el vínculo entre adicionales/presupuesto y lo que efectivamente se emite), o un **dashboard consolidado de dirección** (todas las obras, con las alertas de esta capacidad y las de Control Económico agregadas). Confirmar con el usuario cuál resuelve la decisión más urgente.
