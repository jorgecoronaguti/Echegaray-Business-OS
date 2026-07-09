---
name: cash-flow-operativo
description: "Aplicar las reglas de negocio del Flujo de Caja de Echegaray Construcciones: criterio percibido, distinción entre movimiento real y proyectado, vínculo obligatorio de cada entrada/salida con Cliente/Obra/Proveedor, y las decisiones todavía abiertas sobre reconciliación con Control de Gastos. Activar al diseñar, construir o calcular cualquier parte del módulo de Flujo de Caja (Fase 1 del Blueprint TO-BE), o al interpretar el Flujo de Caja - Cash Flow / Control de Gastos actuales."
allowed-tools: Read, Grep
metadata:
  type: methodology
  author: echegaray-os
---

# Cash Flow Operativo — Reglas de Negocio

Reglas confirmadas para el módulo de Flujo de Caja de Echegaray Business OS (Fase 1 del Blueprint TO-BE). Este skill encapsula qué debe cumplirse — no diseña tablas ni código, eso es el PRP de Fase 1.

## Modelo ya implementado (Fase 1, 2026-07-06)

Existe la tabla `movimientos_caja` (una sola tabla para Cobro y Pago, con `tipo` discriminador — no `cobros`/`pagos` separados). Antes de proponer una tabla nueva para Cheques (Fase 2) u Obligaciones recurrentes (Fase 3), leer `supabase/migrations/20260706190257_flujo_caja_movimientos.sql` y evaluar primero si extiende esta misma tabla (nuevo valor de `tipo`, o una tabla relacionada que la referencia) antes de duplicar su estructura. Columnas: `tipo` (cobro/pago), `estado` (proyectado/real), `monto`, `cuenta_financiera_id`, `fecha_esperada`, `fecha_real`, `cliente_id`/`proveedor_id`/`obra_id` (nullable, con CHECK de contraparte según `tipo`), `concepto`, `origen` (manual/flujo_caja_sheet/control_gastos), `referencia_externa`, `notas`.

## Principio central

**Cash Flow = criterio percibido. P&L = criterio devengado. Nunca mezclar ambos.** Esta es la regla de oro del `CLAUDE.md` raíz; este skill la aplica, no la repite en detalle. Todo cálculo de este módulo responde "¿cuándo entra y sale efectivamente el dinero?", nunca "¿cuándo se generó el derecho económico?".

## Movimiento real vs. proyectado

Todo Cobro y todo Pago tiene un estado explícito: **real** (ya ocurrió, con fecha de impacto confirmada en la cuenta) o **proyectado** (esperado, con fecha estimada). Nunca se suman en la misma columna sin distinguir cuál es cuál. Un proyectado que se cumple se marca como real, no se duplica.

## Fecha de impacto real en caja

La fecha que importa para la posición de caja es la fecha en que el movimiento efectivamente impacta la cuenta (acreditación/débito real), no la fecha de emisión de la factura ni la fecha de firma del cheque. Para cheques y echeqs, el momento exacto de impacto es una decisión abierta (ver más abajo) — no asumir un criterio todavía.

## Entidades del cálculo

| Categoría | Naturaleza | Vínculo obligatorio |
|---|---|---|
| Saldo inicial | Real, por Cuenta financiera | Cuenta financiera |
| Cobranzas esperadas | Proyectado | Cliente, Obra, Factura/Certificado |
| Cobranzas reales | Real | Cliente, Obra, Factura/Certificado, Cuenta financiera |
| Pagos esperados | Proyectado | Proveedor u obligación, Obra (si aplica) |
| Pagos reales | Real | Proveedor u obligación, Obra (si aplica), Cuenta financiera |
| Cheques y echeqs | Real o proyectado según estado | Pago o Cobro, Cuenta financiera |
| Sueldos y jornales | Obligación recurrente, semanal | Total agregado desde JORNALES (no el detalle por trabajador — eso es Fase 4) |
| Cargas sociales | Obligación recurrente, calendario fiscal/laboral conocido | Sin sistema de origen hoy — carga manual |
| Obligaciones fiscales (IIBB, IVA) | Obligación recurrente, calendario conocido | Sin sistema de origen hoy — carga manual |
| Obligaciones financieras | Préstamos, SGR, ANR según documentación societaria existente | Cuenta financiera |
| Gastos operativos | Real, del día a día | Proveedor u obligación |

## Vínculo obligatorio de cada movimiento

- **Toda entrada de dinero debe explicar qué Cliente y qué Obra la generan.** Si no se puede determinar la Obra, no se carga el movimiento sin ese dato — es el gap que el AS-IS identificó como crítico (obra en texto libre, sin ID).
- **Toda salida de dinero debe explicar qué Proveedor, qué Obra (si aplica) o qué obligación la genera.** Una salida sin una de estas tres referencias es un dato incompleto, no se asume.

## Cobros y pagos parciales

Un Cobro o Pago parcial se registra como un movimiento independiente contra el mismo Factura/Certificado o la misma obligación — no se fuerza a que un solo registro represente el total. El saldo pendiente es la resta entre lo comprometido y la suma de los parciales reales. El criterio exacto de cuándo un pago parcial se considera "cumplido" es una decisión abierta (ver abajo).

## Posición semanal y mensual

Posición proyectada de un período = saldo inicial de cuentas + cobranzas (reales + proyectadas) del período − pagos (reales + proyectados) del período. Un **déficit proyectado** es cualquier semana donde esa posición es negativa — debe alertarse, no descubrirse leyendo una planilla manualmente.

## Brecha entre proyección anterior y realidad

Cada vez que se recalcula la proyección, la proyección anterior no se sobreescribe sin dejar registro — tiene que poder responderse "¿qué cambió respecto de la semana pasada?". Esto no existe hoy en ningún sistema (ni Cash Flow ni Control de Gastos lo versionan); es construcción nueva del OS, no migración.

## Evitar doble conteo entre fuentes

Durante la transición, Flujo de Caja - Cash Flow y CONTROL DE GASTOS.xlsx registran cobros de forma parcialmente superpuesta. Antes de cargar un movimiento en el OS, verificar que no esté ya reflejado por la otra fuente para el mismo Cliente/Obra/monto/fecha aproximada — no sumar ambos automáticamente. Mientras no exista una regla de reconciliación automática confirmada, la verificación es manual.

## Reconciliación durante la transición

Mientras Fase 1 corre en paralelo con Flujo de Caja - Cash Flow y Control de Gastos.xlsx (Blueprint TO-BE, sección 5), cualquier cálculo de posición de caja del OS debe poder explicarse comparando contra esas dos fuentes. Una divergencia no explicada no se descarta como "error del Sheet viejo" — se investiga antes de asumir que el OS tiene razón.

## Verificar la fuente real antes de calcular

Antes de calcular cualquier posición de caja, confirmar de qué sistema viene cada dato de entrada (Cash Flow, Control de Gastos, JORNALES, carga manual) — no asumir que el dato ya está en el OS solo porque debería estarlo en esta fase. Si falta el dato de origen, decir explícitamente "no tengo ese dato", no inventar un valor razonable.

## Decisiones abiertas (no resolver, solo registrar)

Pendientes de definición con el usuario/equipo. Ningún cálculo de este skill debe asumir una respuesta:

- Tratamiento de la Categoría B/N del Flujo de Caja actual.
- Criterio exacto de proyección de cobranzas (¿a qué plazo, con qué probabilidad de cobro se proyecta un cobro esperado?).
- Criterio exacto de fecha de impacto de cada tipo de cheque/echeq (emisión vs. acreditación real).
- Responsables de actualización de cada fuente (Cliente, Obra, Cuenta financiera, Cobro, Pago).
- Umbral aceptable de divergencia entre el OS y el Sheet actual durante la corrida en paralelo (criterio de fin de Fase 1).
- Tratamiento exacto de obligaciones recurrentes todavía no sistematizadas (cargas sociales, IIBB, IVA) — hoy se asume carga manual, no un motor de cálculo.
