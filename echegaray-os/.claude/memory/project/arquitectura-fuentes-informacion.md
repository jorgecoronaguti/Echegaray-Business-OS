---
name: arquitectura-fuentes-informacion
description: Principio permanente aprobado por Jorge — arquitectura de fuentes (Drive/Supabase/OS/skills/Internet), jerarquía de verdad por dato, y hallazgos reales de la exploración de la carpeta `administracion`. Consultar antes de cualquier carga de datos nueva o rediseño de ingesta.
metadata:
  type: project
---

Aprobado por Jorge el 2026-07-07 como principio permanente del proyecto (no una auditoría puntual). Reemplaza cualquier supuesto anterior de "Drive = fuente de verdad automática".

## Principio central

`DRIVE INTERNO → descubrimiento → clasificación → lectura → interpretación con skills → contraste entre fuentes internas → investigación externa cuando corresponda → determinación de fuente de verdad por dato → extracción → normalización → validación → Supabase → Business OS → alertas → Centro de Acción → decisiones → aprendizaje.`

- **Drive** = repositorio documental y operativo interno. No se migra ciego a Supabase.
- **Supabase** = dato estructurado operativo, solo lo que el OS necesita calcular/decidir.
- **Business OS** = síntesis, alerta, acción, aprendizaje — nunca fuente primaria.
- **Skills** = razonamiento experto multidisciplinario aplicado sobre el dato ya extraído.
- **Internet** = normativa, vencimientos, alícuotas, benchmarks, contexto externo — **nunca reemplaza un dato interno real** (saldo, deuda, monto contratado, HH trabajadas, pago realizado).
- El nombre de un archivo **nunca** determina su contenido ni su rol de fuente de verdad (caso confirmado: `RESUMEN DE CUENTAS BANCARIAS.xlsx` es en realidad un padrón de legajo+CBU).

## Jerarquía de fuentes por dato (la que se usó realmente en PR1-B)

| Dato | Fuente primaria real | Notas |
|---|---|---|
| Posición de caja | `Flujo de Caja - Cash Flow` (Sheet) | No `CONTROL DE GASTOS.xlsx` — confirmado por Jorge |
| Cobranzas (CxC) | `CF_COB` (Ingresos y Egresos) = `02_Cobranzas` (Flujo de Caja) | **Son el mismo dato duplicado en dos archivos**, no dos fuentes independientes — confirmado leyendo ambos completos, mismos 49 IDs |
| Cheques/echeq a pagar | Hoja `Cheques` de `Flujo de Caja` (848 filas reales, no 997) | Universo de pagos a proveedores, separado de cobranzas |
| Nómina | `JORNALES` | Libro de Sueldos legal **no localizado** — ver gap abajo |
| Impuestos (IIBB/IVA) | `IVA 2026/` (Libro IVA Ventas mensual, DGR San Juan) | Solo IVA Ventas — falta IVA Compras para neto a pagar |
| Financiamiento societario | `RIG SGR/`, `ANRs/` | Ninguno es deuda vigente hoy |

## Gaps confirmados durante PR1-B (no fabricar, no forzar)

- **Libro de Sueldos y Jornales**: no está en `AÑO 2025/` (esa carpeta tiene Ejercicios históricos y Control de Gastos histórico, no nómina) ni en las carpetas mensuales de `SECONDI/` (esas tienen UOCRA/IERIC-FODECO, cargas sociales sectoriales, no el libro en sí). Sigue sin ubicarse — JORNALES sigue siendo la mejor fuente disponible.
- **IIBB/IVA neto exacto**: `IVA 2026/` solo tiene el Libro IVA Ventas (débito fiscal). Sin IVA Compras no se puede calcular el neto a pagar — no se cargó una obligación fiscal nueva por falta de respaldo suficiente. El Certificado de Cumplimiento Fiscal (DGR San Juan, 09/06/2026) confirma que la empresa está al día con IIBB a esa fecha — no hay deuda vencida conocida en ese impuesto.
- **`adicionales` requiere `obra_id` NOT NULL**: bloquea representar adicionales reales de clientes sin obra formal (MESSINAS — Base de Tanque SO2 y Planta BSA; Macro Construcciones — Alquiler Puntales P/FACTURAR). Se cargaron como `movimientos_caja` cuando ya estaban facturados/con evidencia suficiente; los que siguen en P/FACTURAR (pre-factura) no se cargaron en ningún lado, consistente con "no convertir un adicional en caja antes de facturarlo".
- **Mezcla de documentación personal/societaria en `ANRs/`**: CV y DDJJ personal de Jorge conviven con contrato social y certificados de la empresa. No tratar ese contenido como dato de empresa sin distinguir.
- **Riesgo de datos legacy duplicados no siempre son duplicados**: en `CF_COB`, varias filas con el mismo comprobante y monto resultaron ser cuotas reales de echeq escalonadas (fechas de cobro reales distintas), no snapshots repetidos — se confirmó comparando la columna de fecha real (no la de texto "días hasta vencimiento", que sí es una fórmula viva y por eso engañosa). Ver [[pr1-b-cf-cob-cheques]] para el detalle de cómo se resolvió caso por caso.

## Relación con el resto del sistema

Ver [[pr0-linea-base-echegaray]] (línea base original), [[pr1-b-cf-cob-cheques]] (ejecución de PR1-B sobre esta arquitectura) y la skill `lectura-drive-documentos-multiformato` (método de lectura completa vía descarga + openpyxl, que fue el que permitió detectar que CF_COB solo tiene 49 filas reales de 1504, y que las filas "duplicadas" eran cuotas reales).
