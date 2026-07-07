---
name: prp-010-obligaciones-medios-pago
description: Capacidad 10 — obligaciones (compromiso financiero, sirve como cuota/vencimiento reutilizando la misma tabla), aplicaciones_pago (única relación N:M real, con trigger anti-sobreaplicación), medio_pago en movimientos_caja (sin tabla instrumentos_pago nueva)
metadata:
  type: project
---

# PRP-010 — Obligaciones y Medios de Pago

Fecha: 2026-07-07

## Estado

**Capacidad 10 (Obligaciones y Medios de Pago): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-010-obligaciones-medios-pago.md` para el análisis de arquitectura completo.

## Qué se descubrió en las fuentes reales

"Flujo de Caja - Cash Flow" > pestaña "Compras" (más completa/activa que `CONTROL DE GASTOS.xlsx`, PRP-004) ya distingue Total/Parcial + Monto Pagado/Parcial + Tipo pago — **pagos parciales son práctica real confirmada**. Pestaña "RESUMEN" tiene deudas por proveedor + cheques emitidos (proveedor + fecha de pago + monto, **sin** número/emisión/vencimiento separados). Cero evidencia de echeq. Cero evidencia real de tarjeta como medio de pago. Obligaciones generales sin proveedor/obra confirmadas (ARCA, Sindicatos, Sueldos).

## Decisiones de arquitectura más importantes

1. **`obligaciones` sirve también como unidad de cuota/vencimiento** — una obligación en 3 cuotas es 3 filas compartiendo `compra_id`/`costo_real_id`, cada una con su propio monto y vencimiento. No hace falta tabla "cuotas" separada.

2. **`aplicaciones_pago` es la única relación genuinamente muchos-a-muchos** de todo el proyecto hasta ahora — a diferencia del patrón "FK del lado de muchos" de [[prp-009-compras-abastecimiento-obra]] (donde un pago pertenece a una sola compra), acá un mismo pago puede repartirse entre varias obligaciones. Requiere una tabla de unión real con su propio `monto_aplicado`, y un trigger (no CHECK) que impide sobreaplicación contra la obligación Y contra el propio monto del pago, más un `unique(obligacion_id, movimiento_caja_id)`.

3. **No se creó tabla `instrumentos_pago`** — el ciclo emisión→vencimiento→débito de cheque/echeq ya es exactamente `movimientos_caja.estado` (proyectado/real) desde PRP-001. Solo se agregaron `medio_pago` (enum) y `referencia_instrumento` (texto libre) a `movimientos_caja`. Tarjeta queda en el enum sin modelo de "resumen" propio (sin evidencia real de uso).

## Verificación

Los 11 escenarios pedidos verificados con datos reales (pago total, 2 parciales, cuotas, cheque proyectado sin impactar caja, legacy con saldo parcial ya pagado, obligación general sin obra, vínculo a compra, sobreaplicación contra obligación rechazada, sobreaplicación contra el propio pago rechazada, duplicado exacto rechazado por unique). RLS/GRANT en ambas tablas y la vista verificado. `tsc`/`build`/`lint`/22 tests de Playwright en verde.

## Próxima capacidad sugerida

Según la secuencia acordada con el usuario: **11. Dashboard de Dirección** es la siguiente etapa del roadmap (Compras→Obligaciones→Dashboard→Post Mortem→adaptación de la empresa actual).
