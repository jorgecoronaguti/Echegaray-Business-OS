---
name: prp-009-compras-abastecimiento-obra
description: Capacidad 9 — tabla compras (ciclo necesidad-recepción, obra/proveedor nullable para poder alertar), FK invertida (costos_reales.compra_id, movimientos_caja.compra_id) para soportar N costos y N pagos por compra
metadata:
  type: project
---

# PRP-009 — Compras y Abastecimiento de Obra

Fecha: 2026-07-07

## Estado

**Capacidad 9 (Compras y Abastecimiento de Obra): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-009-compras-abastecimiento-obra.md` para el análisis de arquitectura completo.

## Qué se descubrió en las fuentes reales

"Orden de Compra" como documento formal existe pero es **ad-hoc** (una sola instancia real encontrada, archivada por carpeta-obra, sin fecha de entrega prevista ni recepción como campos propios). No existe fuente sistemática de "necesidad de compra" ni comparación de cotizaciones — territorio nuevo, mismo caso que [[prp-006-gestion-integral-adicionales]]. FORMA DE PAGO en CONTROL DE GASTOS.xlsx sigue sin completarse de forma confiable (ya conocido desde PRP-004).

## Decisión de arquitectura más importante de la capacidad

Una Compra real puede tener **varios costos reales** (entregas parciales) y **varios pagos** (cuotas, medios distintos) — a diferencia de Adicionales/Certificados/Costos Reales, donde el vínculo a `movimientos_caja` es una FK única en la cabecera. Acá se **invirtió la relación**: la FK vive del lado de "muchos" — `costos_reales.compra_id` y `movimientos_caja.compra_id` (ambos nullable) — permitiendo 1 compra → N costos y 1 compra → N pagos sin tabla de unión. Verificado con datos reales: una compra con 2 costos_reales (30k+20k) y 2 pagos (25k+25k) agregó correctamente en la vista `compra_resumen` (costo_real_acumulado=50000, monto_pagado=50000, cantidad_pagos=2).

Este patrón ("FK del lado de muchos") es superior al usado en capacidades anteriores para relaciones 1:N reales — documentado como mejora posible a aplicar retroactivamente si en el futuro se confirma la misma necesidad en costos_reales/adicionales/certificados (no se tocó nada existente en esta capacidad).

## Otras decisiones

`obra_id` y `proveedor_id` de `compras` son **nullable a propósito** — el objetivo funcional pide alertar "compra sin obra"/"compra sin proveedor", algo imposible si fueran `NOT NULL` (diverge deliberadamente del patrón de Adicionales/Certificados). `movimientos_caja.compra_id` se valida con un CHECK simple (no trigger), porque acá `compra_id` y `tipo` viven en la misma tabla.

## Verificación

Constraints probados (pareja fecha/monto, monto≤0). Caso central (múltiples costos y pagos por compra) verificado con datos reales. Vínculo a movimiento tipo cobro rechazado por CHECK. RLS/GRANT en tabla y vista verificado. `tsc`/`build`/`lint`/20 tests de Playwright en verde.

## Próxima capacidad sugerida

Con Presupuesto, Costos Reales, Control Económico, Adicionales, Ejecución Financiera, HH y ahora Compras, el núcleo de gestión de una obra individual está muy completo. El usuario ya indicó que las próximas etapas (Dashboard consolidado, Post Mortem) siguen pospuestas — confirmar próxima prioridad antes de avanzar.
