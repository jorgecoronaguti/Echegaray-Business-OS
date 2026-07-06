---
name: prp-007-ejecucion-financiera-obra
description: Capacidad 7 — tabla certificados (contrato base, ciclo facturación/cobranza propio, no se mezcla con adicionales) + vista obra_ejecucion_financiera (contratado/certificado/facturado/cobrado)
metadata:
  type: project
---

# PRP-007 — Ejecución Financiera de la Obra

Fecha: 2026-07-06

## Estado

**Capacidad 7 (Ejecución Financiera de la Obra): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-007-ejecucion-financiera-obra.md` para el análisis de arquitectura completo.

## Qué se construyó

Una tabla nueva, `certificados` (avance certificado contra el **contrato base**, `obras.monto_contratado` — nunca contra adicionales), reutilizando el mismo patrón arquitectónico ya validado en [[prp-006-gestion-integral-adicionales]]: columnas fecha/monto nullable por etapa (facturación, cobranza), sin constraint de orden entre ellas. Más una vista derivada, `obra_ejecucion_financiera` (mismo patrón que [[prp-005-control-economico-basico-obra]]: `security_invoker = true` obligatorio), que agrega Contrato vs Certificado vs Facturado vs Cobrado por obra. Migración `supabase/migrations/20260706202955_ejecucion_financiera_obra.sql`.

**Por qué no extender `adicionales`**: un Certificado es avance del contrato original; un Adicional es trabajo fuera de ese contrato. La regla de negocio prohíbe explícitamente mezclarlos — por eso son tablas paralelas con la misma forma (ciclo facturación→cobranza + vínculo opcional a `movimientos_caja` validado por trigger de tipo), no la misma tabla con un campo "tipo".

**Tercera aplicación del patrón `movimiento_caja_id` + trigger de tipo**: `costos_reales`→pago (PRP-004), `adicionales`→cobro (PRP-006), ahora `certificados`→cobro. Ya es un patrón establecido y documentado en el skill `supabase`.

**`fecha_vencimiento` nullable, sin plazo fabricado**: la alerta "factura vencida" solo se activa si se conoce el vencimiento real de la factura — no se asume un plazo estándar tipo 30 días (CLAUDE.md raíz: nunca fabricar datos).

## Verificación

Caso permitido explícitamente (certificado sin facturar). Constraints probados (número duplicado, pareja fecha/monto, monto ≤ 0). Trigger probado (vínculo a tipo incorrecto rechazado, vínculo válido aceptado, doble reclamo rechazado). Ciclo completo con datos reales dio exactamente los números esperados (contrato $100k, certificado $70k, facturado $40k, cobrado $38k → pendientes y % coinciden con el cálculo manual). RLS/GRANT verificado en tabla y vista. `tsc`/`build`/`lint`/18 tests de Playwright en verde.

**Límite conocido**: un certificado admite un solo `movimiento_caja_id` (sin cobros parciales múltiples); umbral de "baja conversión a caja" (20%) es una propuesta abierta, no validada.

## Próxima capacidad sugerida

Con Presupuesto, Costos Reales, Control Económico, Adicionales y ahora Ejecución Financiera cubriendo el ciclo completo de una obra individual, el candidato natural es el **Dashboard consolidado de Dirección** (todas las obras, agregando las alertas ya construidas en estas últimas 3 capacidades) — el usuario ya indicó que quiere completar primero el ciclo financiero de una obra antes de esto, así que conviene confirmar explícitamente si ese ciclo ya se considera completo o si falta alguna pieza más (ej. Facturación/Certificación ya cubierta acá, quedaría pendiente algo como Compras/HH si se quiere profundizar costos).
