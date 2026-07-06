---
name: prp-005-control-economico-basico-obra
description: Capacidad 5 — vista SQL obra_resumen_economico (presupuesto aprobado vs costo real acumulado), security_invoker obligatorio, umbrales sano/atención/crítico como constantes abiertas
metadata:
  type: project
---

# PRP-005 — Control Económico Básico de Obra

Fecha: 2026-07-06

## Estado

**Capacidad 5 (Control Económico Básico de Obra): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-005-control-economico-basico-obra.md` para el análisis de arquitectura completo.

## Qué se construyó

Ninguna tabla nueva: una **vista SQL derivada**, `obra_resumen_economico`, que compara el presupuesto **aprobado** de una obra ([[prp-003-presupuesto-base-obra]]) contra sus costos reales acumulados ([[prp-004-costos-reales-obra]]). Migración `supabase/migrations/20260706200918_control_economico_obra_resumen.sql`.

**Gotcha de seguridad reutilizable**: toda vista sobre tablas con RLS necesita `with (security_invoker = true)` explícito, o Postgres la ejecuta con los permisos del dueño de la vista y bypasea el RLS de las tablas de abajo sin que sea obvio. Verificado con `get_advisors(security)` que sin este flag aparecería el lint "Security Definer View". Vale para cualquier vista futura sobre estas tablas.

**Decisiones de cálculo clave**:
- Costo real acumulado = suma de TODOS los estados de `costos_reales` (comprometido + pendiente + pagado) — un costo comprometido ya es devengado aunque no haya impactado caja. Se expone también el desglose por estado.
- Solo cuenta el presupuesto con `estado = 'aprobado'`; si no hay ninguno, los campos derivados quedan `null` (nunca se fabrica una comparación contra un presupuesto no vigente).
- `margen_actualizado = margen_esperado − desvio_absoluto` — ajusta el margen original por el desvío, no lo recalcula desde cero (preserva ajustes ya incluidos como impuesto a las ganancias teórico).
- Estado económico (sano ≤5% / atención ≤15% / crítico >15%) vive como constantes en TypeScript, marcado explícitamente como **propuesta no validada con el usuario** — fácil de ajustar sin migración.
- No proyecta costo final ni fecha de cierre — trata el costo real a la fecha como si fuera el final (simplificación deliberada, "sin proyecciones avanzadas").

## Feature nueva

`features/control-economico/` (types con `calcularEstadoEconomico`, `controlEconomicoService.ts` de solo lectura, `ResumenEconomicoObra.tsx` presentacional). Sin formulario — esta capacidad no inserta datos, solo deriva.

## Verificación

3 escenarios con datos reales (sin presupuesto aprobado, con presupuesto sin costos, con presupuesto + costos en los 3 estados) dieron los números exactos esperados manualmente. RLS/GRANT de la vista verificado con `SET LOCAL ROLE`. `tsc`/`build`/`lint`/16 tests de Playwright en verde.

## Próxima capacidad sugerida

Con Control Económico básico cerrado, el ciclo "cotizar → ejecutar → comparar" ya existe a nivel de una obra individual. Candidatos para lo que sigue: **Adicionales** (detección → cobro, mencionado como flujo central en CLAUDE.md raíz) o un **dashboard consolidado de dirección** (todas las obras, ahora que el cálculo por obra ya existe y es reutilizable). Confirmar con el usuario cuál resuelve la decisión más urgente.
