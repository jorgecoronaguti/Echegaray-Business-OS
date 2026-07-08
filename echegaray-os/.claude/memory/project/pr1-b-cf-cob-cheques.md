---
name: pr1-b-cf-cob-cheques
description: Ejecución real de PR1-B — lectura completa de CF_COB (49 filas reales) y del universo de cheques/eCheq (848 filas reales), clasificación A-E, y qué se cargó/excluyó/documentó como gap en Supabase.
metadata:
  type: project
---

Fecha: 2026-07-07/08. Construido sobre [[arquitectura-fuentes-informacion]] y [[pr0-linea-base-echegaray]].

## Hallazgo estructural previo a cualquier carga

`CF_COB` (Ingresos y Egresos) tiene dimensión de hoja `A1:Z1504` pero **solo 49 filas tienen datos reales** — el resto son celdas de formato vacías. Mismo patrón en la hoja `Cheques` de Flujo de Caja: dimensión `A1:L997`, **848 filas reales**. No asumir el conteo de filas de una hoja como conteo de registros — confirmado en dos archivos distintos.

## CF_COB — clasificación de las 49 filas reales

- Categoría **N** (Negro): excluida siempre, sin excepción — 14 filas, ninguna se carga (ya resuelto en PR0).
- Categoría **B**, Estado=Cobrado (histórico ya percibido): 19 filas — **no se cargan** en `movimientos_caja` (no aportan valor operativo a un forecast hacia adelante; el saldo ya las refleja vía `saldo_inicial`).
- Categoría **B**, Estado≠Cobrado (Pendiente/Facturado/Proyectado): **16 filas, $133.861.489,37 en total** — universo completo de cobranza pendiente real.
  - 2 ya estaban cargadas desde PR0-C (La Estrella $14.999.999,99 y $10.000.000).
  - **14 nuevas cargadas en PR1-B** (ver detalle abajo).

### Caso resuelto por investigación, no por pregunta: ¿son duplicados o cuotas reales?

Varias filas comparten comprobante+monto (ej. 4 filas de "Galpón 9" comprobante `01_00000213`, $10.000.000 cada una). La columna "Días hasta vto." es una fórmula viva (cambia según cuándo se lee el archivo) y por eso parecía indicar snapshots repetidos de un mismo pago que se posterga. Pero la columna real "Fecha cobro" (segunda ocurrencia, tipo fecha, no fórmula) mostró 4 fechas **distintas y fijas**: 15/07, 31/07, 15/08, 31/08 — un cronograma de echeq escalonado real, no una duplicación. Se confirmó cruzando contra el archivo real de Cheques/eCheq (fuente independiente): los montos de cuotas de La Estrella no exceden ningún agregado de otra fuente, consistente con 4 cuotas reales.

Mismo criterio aplicado al comprobante `01-00000208` (Oficinas y Fábrica de Palitos, $14.999.999,99): 4 instancias "Cobrado" (abr/may/may/jun, ya percibidas, no se cargan) + 1 "Pendiente/Vencido" (jul) — la única con estado abierto, ya cargada en PR0-C, sin cambios.

### 14 filas nuevas cargadas (`movimientos_caja`, tipo=cobro, estado=proyectado)

| Cliente | Concepto | Monto | Fecha esperada | Obra vinculada |
|---|---|---|---|---|
| La Estrella | Galpón 9, cuota 2/4 | $10.000.000 | 2026-07-31 | Galpón 9 |
| La Estrella | Galpón 9, cuota 3/4 | $10.000.000 | 2026-08-15 | Galpón 9 |
| La Estrella | Galpón 9, cuota 4/4 | $10.000.000 | 2026-08-31 | Galpón 9 |
| La Estrella | Faltante a facturar - Galpón 9 | $20.600.000 | 2026-08-15 | Galpón 9 |
| Messinas | Bases Tanque SO2 - FA 214 | $10.133.750 | 2026-08-03 | — (cliente sin obra) |
| Messinas | ADICIONAL Base Tanque SO2 - FA 215 | $6.981.554,80 | 2026-08-03 | — (adicional real, gap de esquema, ver abajo) |
| Messinas | Planta BSA 26m3 (OC 279) | $9.856.712,51 | 2026-08-31 | — |
| Messinas | Actualización de precios OC 279 | $4.336.586,76 | 2026-08-31 | — |
| Messinas | Planta BSA - ADICIONAL | $7.228.782,00 | 2026-08-31 | — (adicional real, gap de esquema) |
| ARCOR | Cambio de pisos RRHH - FA 53 | $11.374.000 | 2026-09-30 | Cambio de Pisos - RRHH |
| ARCOR | Cambio de pisos RRHH - 20% restante | $2.274.800 | 2026-09-30 | Cambio de Pisos - RRHH |
| ARCOR (Mantenimiento) | Reparaciones varias ppto 30/01 | $3.019.749,60 | 2026-09-30 | — |
| ARCOR (Mantenimiento) | Materiales varios ppto 3/02 | $2.100.049,38 | 2026-09-30 | — |
| ARCOR (Mantenimiento) | Reparación cielorraso vestuario | $955.504,33 | 2026-09-30 | — |

También se vinculó `obra_id` a los 2 movimientos ya cargados de "Galpón 9" (antes sin obra).

**Gap documentado, no forzado**: `adicionales.obra_id` es NOT NULL. Los 2 ítems de Messinas etiquetados explícitamente "ADICIONAL" en la fuente no se pudieron cargar en la tabla `adicionales` porque Messinas no tiene obra en el OS — se cargaron solo como `movimientos_caja` (correcto porque ya están facturados/con evidencia), pero el ciclo de vida del adicional en sí (detección→aprobación→facturación) no queda representado. Mismo gap aplica a "Alquiler Puntales - Macro Construcciones" (P/FACTURAR, $38.720+$58.080) — ese ni siquiera se cargó como movimiento porque todavía no está facturado (regla: no convertir un adicional en caja antes de facturarlo).

## Cheques/eCheq — arquitectura elegida: Opción B (individual, esquema existente)

Se descartó la Opción A (agregado) porque el esquema ya soporta el detalle (`movimientos_caja.medio_pago`, `referencia_instrumento`) sin ninguna tabla nueva — Opción C no se necesitó.

De 848 filas reales en la hoja `Cheques` (pagos a proveedores), solo 30 tenían `DEBITADO='No'` explícito (18 con fecha futura + 12 con fecha de hoy/días recientes, aún sin marcar debitado). Las demás (767 sin fecha, 51 `SI`) son histórico ya clarificado o filas sin dato — no se cargan (sin utilidad operativa).

**Anti-doble-conteo real, no solo teórico**: Corralon Progreso y Alumetal ya tenían una obligación agregada cargada en PR0-B (`RESUMEN Flujo de Caja al corte`). Los cheques individuales de esos 2 proveedores ($4.229.777 y $1.786.197,58 respectivamente) se vincularon vía `aplicaciones_pago` a esas obligaciones existentes — el saldo pendiente de cada obligación bajó exactamente ese monto, sin duplicar. Los otros 5 proveedores identificados (Diesel Rodriguez, NEUMAGOM SAS, Maderas Literas SRL, Friolatina SA, Acerolatina SA) no tenían obligación previa — se cargaron como `movimientos_caja` nuevos, sin riesgo de doble conteo. Se excluyó 1 fila de Diesel Rodriguez (mismo Nro de cheque con dos montos distintos, $500.000 y $510.000 — ambigüedad de fuente, se cargó solo la de mayor confianza y se documentó la exclusión en notas).

Total cargado en pagos: 29 movimientos, $14.145.874,30.

## Nómina y Libro de Sueldos

Se revisaron las carpetas mensuales de `SECONDI/` (fuente candidata al Libro de Sueldos legal) — contienen presentaciones UOCRA e IERIC-FODECO (cargas sociales sectoriales), no el Libro de Sueldos en sí. El Libro de Sueldos real **sigue sin localizarse** en el árbol de Drive explorado. JORNALES se mantiene como la mejor fuente disponible para nómina, sin cambios respecto de PR0.

## Impuestos

`IVA 2026/` solo tiene el Libro IVA Ventas (débito fiscal mensual) — sin IVA Compras no se puede determinar el neto a pagar, así que **no se cargó ninguna obligación fiscal nueva** por falta de respaldo suficiente (regla explícita: no cargar sin monto real respaldado). El Certificado de Cumplimiento Fiscal (DGR San Juan, vigente al 09/07/2026) confirma que no hay deuda de IIBB vencida conocida a esa fecha — esto acota el gap (no es una deuda oculta, es solo una fecha de vencimiento futura no confirmable con las fuentes públicas disponibles).

## Verificación

`npm run typecheck`, `lint`, `build` limpios. 33/33 tests de Playwright (incluye los preexistentes + 2 nuevos de `capital-trabajo.spec.ts`). Todos los montos cargados se verificaron por suma exacta contra los totales agregados de la fuente antes de insertarse (ej. 16 filas categoría B no-Cobrado = $133.861.489,37 exacto, sin redondeos ni fabricación).
