---
name: resumen-manual-vs-dashboard-pivots
description: Jorge corrigió que el panel que él arma en RESUMEN (Cash Flow) le sirve más que un Dashboard con tablas dinámicas construido por mí -- al auditar en profundidad (pivotTable JSON, no solo el valor visible) resultó que sus bloques YA son tablas dinámicas, filtradas por estado de negocio real; el error mío no fue "no usar pivots", fue no filtrar.
metadata:
  type: feedback
---

Fecha: 2026-07-09. Construí una pestaña 📊 Dashboard nueva con tablas dinámicas sin filtrar (Compras por proveedor, TODO el historial) y un gráfico. Jorge dijo que lo que arma en `RESUMEN` le sirve más, y pidió revisar la intención real antes de rehacer.

Primera lectura con `valueRenderOption=FORMATTED_VALUE`/`FORMULA` pareció mostrar texto tipeado a mano (sin fórmula visible). Fue una conclusión **apurada y equivocada**: al pedir el campo `pivotTable` explícitamente vía `spreadsheets().get(..., fields='sheets.data.rowData.values.pivotTable')`, aparecieron 6 tablas dinámicas reales debajo de cada bloque (DEUDAS, COBROS, CHEQUES EMITIDOS, TARJETA, PENDIENTES, PROYECTADO) -- cada una con un `filterSpecs` real: DEUDAS filtra por "Cuenta Corriente", COBROS excluye "Cobrado" (solo Proyectado/Por vencer/Vigente), CHEQUES filtra "no debitado", TARJETA filtra "no debitado", PENDIENTES filtra "Pendiente", PROYECTADO filtra "Proyectado" + meses del año en curso.

**La diferencia real no era pivot vs. manual -- era filtrado vs. sin filtrar.** Sus 6 pivots muestran solo lo que sigue vigente/pendiente por estado real de negocio (7-16 filas cada uno); mi Dashboard mostraba el universo completo sin filtro (100+ filas, todo el historial). Eso, no la ausencia de tablas dinámicas, es lo que lo hacía menos útil para decidir qué pagar/cobrar esta semana.

**Por qué**: `valueRenderOption=FORMULA`/`FORMATTED_VALUE` no expone si una celda es la salida de un pivot -- hay que pedir el campo `pivotTable` explícitamente (`fields='sheets.data.rowData.values.pivotTable'`) para saberlo con certeza. Asumir "no tiene fórmula visible = está tipeado a mano" es exactamente el tipo de conclusión que el CLAUDE.md raíz prohíbe presentar sin verificar (HECHO vs. SUPUESTO).

**Cómo aplicar**: antes de diagnosticar una celda como "manual/frágil" en cualquier Sheet de Echegaray, pedir el campo `pivotTable` explícitamente -- nunca inferir el mecanismo solo por cómo se ve el valor. Y al diseñar cualquier vista financiera nueva: igualar o superar el filtrado por estado real de negocio que ya exista, no solo agregar todo el universo con mejor formato. Ver [[skill-google-sheets-business-systems]].
