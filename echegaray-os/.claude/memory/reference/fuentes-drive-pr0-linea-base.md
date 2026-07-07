---
name: fuentes-drive-pr0-linea-base
description: URLs y pestañas (gid) exactas que Jorge confirmó como fuente de verdad para cada dato de PR0 (nómina, fechas de obra, posición de caja, vencimientos, adicionales, avance de obra). Consultar antes de volver a inspeccionar Drive para PR0/PR0-A.
metadata:
  type: reference
---

Confirmadas por Jorge en 2026-07-07, en respuesta al checklist de PR0-A. Reemplazan cualquier archivo/pestaña que yo hubiera asumido por nombre o por lectura del tab por defecto.

| Dato | Fuente confirmada | Nota |
|---|---|---|
| Sueldos/nómina | `docs.google.com/spreadsheets/d/1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk` gid=1233944089 | **No** usar Flujo de Caja para esto — la fila "Sueldos $3.000.000" triplicada ahí es un error confirmado. Ojo: `Flujo de Fondos - Cash flow` también referencia sueldos y **no está conectado** a esta planilla — riesgo real de inconsistencia, sin investigar todavía |
| Fechas fecha_inicio/fecha_fin de La Estrella y ARCOR | `docs.google.com/spreadsheets/d/1-NAqlEuKoB0IqCY4res5OiJhbbz_7-F2M-zmpnkpMYg` (Ingresos y Egresos - P&L) gid=1294821039 | Probablemente la pestaña `CF_COB`. No confirmado si logré leer esta pestaña específica o la de por defecto (`05_Dashboard_P&L`) — ver limitación de gid abajo |
| Posición de caja (fuente de verdad) | `docs.google.com/spreadsheets/d/1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8` (Flujo de Caja - Cash Flow) gid=825424599 | Confirmado: esta es la fuente, **no** `CONTROL DE GASTOS.xlsx` |
| Vencimiento exacto IIBB / cargas sociales / gastos generales de julio | Mismas dos fuentes de arriba: Flujo de Caja gid=825424599 + Ingresos y Egresos gid=1294821039 | El P&L da devengado mensual, no fecha de pago cierta — hay que cruzar con Flujo de Caja para la fecha |
| Adicionales pendientes | Flujo de Caja gid=825424599, o `docs.google.com/spreadsheets/d/1v0Y8E0sN9WT_T9Uzvd9G5YsQzvcKjbiu` (CONTROL DE GASTOS.xlsx) gid=444140859 | Cualquiera de las dos puede tenerlo, no confirmado en cuál |
| Control de avance de obra (nueva fuente, no existía en el diseño original de O1) | `docs.google.com/spreadsheets/d/1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug` gid=791251642 | Lo leído hasta ahora en la pestaña por defecto de este archivo es un checklist de tareas/materiales, no un % de avance — no está claro si es la pestaña equivocada (por la limitación de gid) o si el proceso real de Echegaray es así. Ver [[pr0-linea-base-echegaray]] |

## Limitación de herramienta (no resuelta)

Ninguna de las pestañas de arriba señaladas por `gid` fue confirmada como efectivamente abierta — `read_file_content` devuelve la pestaña por defecto/primera, no la indicada por `gid` en la URL. Documentado como gap abierto en la skill [[arquitectura-conocimiento-experto]] (`lectura-drive-documentos-multiformato`), con un método candidato no probado (descarga + parseo local del XML del `.xlsx` exportado, mapeando `gid` → nombre de pestaña vía `xl/workbook.xml`).
