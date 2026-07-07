---
name: prp-012-post-mortem-obra
description: Capacidad 12 — post_mortems (borrador/cerrado, snapshot jsonb solo al cerrar), reutiliza todos los cálculos de capacidades anteriores sin duplicar, cierra la Etapa 4 del roadmap
metadata:
  type: project
---

# PRP-012 — Post Mortem de Obra

Fecha: 2026-07-07

## Estado

**Capacidad 12 (Post Mortem de Obra): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-012-post-mortem-obra.md` para el análisis de arquitectura completo. Con esta capacidad se cierra la **Etapa 4** del roadmap acordado (construcción de capacidades del negocio).

## Qué se construyó

Una tabla nueva, `post_mortems` (una por obra, `unique(obra_id)`), reducida a lo genuinamente no derivable: `estado` (borrador/cerrado), campos de juicio humano (`causas_desvio`, `aprendizajes`, `acciones_recomendadas`, `cambios_sugeridos_cotizacion`), y un `resumen_snapshot jsonb` que solo se completa al cerrar.

## Decisión de arquitectura más importante

**Snapshot condicional, no siempre activo**: mientras el post mortem está en `borrador`, todos los resúmenes (económico, financiero, HH, adicionales, compras, alertas) se calculan **en vivo** reutilizando exactamente las mismas vistas/funciones de [[prp-005-control-economico-basico-obra]], [[prp-007-ejecucion-financiera-obra]], [[prp-008-hh-productividad-obra]], [[prp-006-gestion-integral-adicionales]], [[prp-009-compras-abastecimiento-obra]] — cero cálculos duplicados. Al **cerrar**, ese mismo objeto se congela una sola vez en `resumen_snapshot` (jsonb, no columnas separadas), para que el aprendizaje quede estable si después se corrige un dato de una obra ya considerada terminada. `CHECK` en base garantiza que `estado='cerrado'` siempre viene con `fecha_cierre` y `resumen_snapshot` — no puede quedar en un estado inconsistente.

**Regla de negocio**: solo se puede cerrar el Post Mortem si `obras.estado = 'cerrada'` — validado en el server action, no en la base.

**Límite documentado explícitamente**: "alertas históricas" no es un historial real — no existe ningún log de alertas persistido en el proyecto (ninguna capacidad lo guarda). El conteo refleja el estado más reciente conocido al momento del snapshot, no lo que pasó durante toda la ejecución.

## Verificación

Alta de borrador, `unique(obra_id)` rechaza un segundo post mortem para la misma obra, `CHECK` rechaza cerrar sin snapshot/fecha, cierre válido con ambos provistos. RLS/GRANT verificado. `tsc`/`build`/`lint`/24 tests de Playwright en verde.

## Próxima etapa sugerida

Según la secuencia acordada, la Etapa 4 (construcción de capacidades) queda cerrada con esta capacidad. La Etapa 4.5 es **adaptación de la empresa actual** — el primer paso natural es diseñar la estrategia de saldos de apertura / fecha de corte para incorporar obligaciones, compras y obras legacy ya en curso (sin fabricar historia), ya que varias capacidades (Compras, Obligaciones) fueron diseñadas explícitamente para soportar esto pero todavía no se cargó ningún dato real de la empresa.
