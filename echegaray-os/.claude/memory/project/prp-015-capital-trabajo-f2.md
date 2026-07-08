---
name: prp-015-capital-trabajo-f2
description: F2 — Capital de Trabajo y Exposición Financiera (primer incremento). Elegido sobre O1 por evidencia real de concentración de cliente/proveedor surgida en PR1-B. features/capital-trabajo, página /capital-trabajo, integrado a Dashboard/Centro de Acción.
metadata:
  type: project
---

Fecha: 2026-07-08. Construido inmediatamente después de reconciliar F1 con la cobertura ampliada de PR1-B (ver [[pr1-b-cf-cob-cheques]]).

## Por qué F2 y no O1 (decisión argumentada, no default de roadmap)

Con los datos ya cargados en PR1-B, apareció evidencia real y concreta de un problema de capital de trabajo:

- **Concentración de cliente**: La Estrella concentra 56,5% de toda la CxC pendiente ($75.599.999,99 de $133.861.489,37) — supera el umbral de alerta.
- **Concentración de proveedor**: Alumetal concentra 47,8% de toda la CxP pendiente ($19.051.012,42 de $39.820.700,64) — supera el umbral de alerta.
- Capital de trabajo neto positivo ($94.040.788,73 = CxC $133.861.489,37 − CxP $39.820.700,64) **mientras el saldo de caja real es negativo** — la brecha entre "cobrable" y "cobrado hoy" es justamente lo que F2 existe para hacer visible.

Contra los 6 criterios pedidos:
1. Problema real observado: sí, concentración de cliente y proveedor, con montos reales.
2. Impacto económico: alto — depender de un cliente para el 56% de la cobranza es un riesgo estructural de negocio.
3. Mejor decisión posible: priorizar cobranza de La Estrella, diversificar cartera, evaluar la dependencia de Alumetal como proveedor crítico.
4. Disponibilidad de datos: alta para F2 (100% de lo que necesita ya está cargado); baja para O1 (`registros_hh`, `costos_reales`, `presupuestos` siguen en 0 filas — O1 requeriría un PR0 nuevo antes de poder construirse).
5. Esfuerzo: bajo — mismo patrón de síntesis TypeScript que F1, cero tablas nuevas.
6. Dependencia con lo existente: F2 depende de clientes/proveedores/movimientos_caja/obligacion_resumen (todo ya construido); O1 depende de capacidades sin datos todavía.

No se implementó O1 en este PR (regla explícita: no F2 y O1 simultáneos). Los dominios de O1 quedan en el roadmap, no se pierden — ver deuda arquitectónica en [[arquitectura-fuentes-informacion]].

## Qué se construyó (primer incremento, alcance deliberadamente acotado)

`features/capital-trabajo/` — 100% síntesis TypeScript, cero SQL nuevo:

- `calcularCapitalTrabajo`: CxC total (cobros proyectados no cobrados aún), CxP total (`obligacion_resumen.saldo_pendiente` + pagos proyectados sueltos no aplicados — mismo anti-doble-conteo que F1), capital de trabajo neto, exposición por cliente y por proveedor (monto + % del total).
- `calcularAlertasConcentracion`: alerta cuando una contraparte supera 40% del total de CxC o CxP — umbral de gestión, no contable, ajustable.
- Página `/capital-trabajo`: totales, tabla de exposición por cliente y por proveedor, alertas de concentración resaltadas.
- Integrado a Dashboard/Centro de Acción: nueva categoría `exposicion_financiera` → área `administracion_finanzas`, alertas con `decisionSugerida` concreta (priorizar cobranza específica o diversificar proveedor específico, no texto genérico).
- Link agregado desde `/administracion`.

## Qué queda explícitamente fuera de este incremento (no perdido, documentado)

- **Exposición por obra** y **"obra rentable que consume caja"**: depende de `costos_reales`, hoy sin datos — no se puede calcular sin fabricar.
- **Necesidad de financiamiento cuantificada**: requiere proyección de capital de trabajo en el tiempo (no solo el corte actual) — candidato para un segundo incremento de F2 una vez que O1 aporte más contexto de costos.

## Mejora aplicada a F1 durante esta misma sesión

La alerta de déficit de F1 (`mapPosicionCaja`) tenía un `decisionSugerida` genérico repetido en cada semana con déficit. Se agregó `causaPrincipalDeficit` (features/posicion-caja/types) que identifica el ítem individual (pago comprometido o proyectado) que más pesa en el déficit de esa semana, para que cada alerta nombre una acción concreta ("cubrir o reprogramar X, $monto, fecha Y") en vez de texto repetido — pedido explícito de Jorge de no tener "alertas genéricas repetitivas".

## Pruebas

`npm run typecheck`, `lint`, `build` limpios. 33/33 tests de Playwright, incluye 2 nuevos en `tests/capital-trabajo.spec.ts`.
