# Casos de test de comportamiento profesional

Prueban comportamiento, no existencia de archivos. Cada caso define: situación de negocio, comportamiento esperado, y el error que reprueba. Se ejecutan aplicando el caso en sesión (con datos reales o representativos) y comparando la respuesta contra lo esperado. **Todo error real encontrado en producción se convierte en caso nuevo acá.**

Origen de los casos marcados 🔴: errores reales ya cometidos y corregidos en este proyecto (la evidencia está en `.claude/memory/feedback/`).

---

## FF-1 · Flujo de Fondos — doble conteo obligación/cheque

**Situación**: una deuda a proveedor figura como obligación en Compras y además existe un cheque emitido contra esa misma deuda.
**Esperado**: contarla UNA vez en la proyección de egresos, con criterio explícito de cuál fuente manda y en qué fecha impacta (emisión vs. débito real).
**Reprueba si**: la posición de caja suma obligación + cheque como dos egresos.
**Skills**: `finanzas-tesoreria-construccion` + `cash-flow-operativo` + `arquitectura-integracion-finanzas-obras`.

## FF-2 🔴 · Flujo de Fondos — redistribuir sin mover el total

**Situación**: se reordena de dónde sale un concepto (ej.: sueldos dejan de estar mezclados en "Gastos Civil" y pasan a fila propia).
**Esperado**: definir ANTES la validación "Total Egresos idéntico antes/después al centavo" y verificarla después.
**Reprueba si**: se edita la distribución sin comparar el total agregado antes/después (riesgo silencioso de pérdida o duplicación).
**Evidencia real**: reordenamiento de Sueldos en `04_CFSemanal`/`05_CFMensual` (2026-07), validado con Total Egresos exacto $537.787.030,53 sin cambio.

## PL-1 · P&L — pago atrasado no es gasto del mes

**Situación**: en julio se paga una factura devengada en mayo.
**Esperado**: P&L lo reconoce en mayo (devengado); solo el Cash Flow lo muestra en julio (percibido). Si el P&L real de la empresa no lo hace así, señalar la inconsistencia — no replicarla.
**Reprueba si**: el análisis registra el pago como gasto de julio en el P&L, o mezcla ambos criterios en una misma tabla sin declararlo.
**Skills**: `contabilidad-constructoras` + `finanzas-tesoreria-construccion`.

## OB-1 · Obras — productividad "extraordinaria" con costos incompletos

**Situación**: una obra muestra CPI o rendimiento HH muy superior al histórico, pero la cobertura de costos cargados es parcial.
**Esperado**: declarar la cobertura ("faltan X% de los costos del período") y NO concluir productividad extraordinaria. La conclusión no puede superar la evidencia (jerarquía niveles 1–6).
**Reprueba si**: se celebra el indicador sin verificar qué costos faltan por registrar.
**Skills**: `planificacion-produccion` + `direccion-obra` + jerarquía de evidencia del orquestador.

## INT-1 🔴 · Integración — devengado vs. percibido entre sistemas

**Situación**: un mismo concepto (ej. nómina) aparece en el Flujo de Fondos (caja) y referenciado en una vista mensual.
**Esperado**: declarar el criterio de cada fila; si una fila devengada convive con un total percibido, anotarlo en el propio Sheet para que la diferencia no se lea como error.
**Reprueba si**: dos filas con criterios distintos se presentan como comparables sin advertencia.
**Evidencia real**: fila "Sueldos y cargas sociales (devengado)" vs. "Total Egresos" (caja) en `05_CFMensual` (2026-07) — anotado en celda.

## GS-1 🔴 · Google Sheets — no inferir el mecanismo de una celda por su apariencia

**Situación**: una celda parece "tipeada a mano" porque `FORMULA`/`FORMATTED_VALUE` no muestran fórmula.
**Esperado**: pedir `fields='sheets.data.rowData.values.pivotTable'` antes de diagnosticar — puede ser salida de una tabla dinámica.
**Reprueba si**: se diagnostica "manual/frágil" sin verificar pivotTable.
**Evidencia real**: los 6 bloques de RESUMEN eran pivots filtrados por estado de negocio (memoria: `resumen-manual-vs-dashboard-pivots.md`).

## GS-2 🔴 · Google Sheets — fórmulas compatibles con la configuración regional

**Situación**: se escribe una fórmula por API en un Sheet con configuración regional argentina (separador `;`, moneda `$`, decimales con coma).
**Esperado**: usar el separador y formato del archivo; al reemplazar por anclas de texto en SUMIFS, el ancla NO incluye el paréntesis de cierre; verificar `count(ancla)` esperado antes de reemplazar; después de escribir, escanear errores de fórmula en todo el rango tocado.
**Reprueba si**: una fórmula queda con `#ERROR!`/`#N/A` no detectado, o un reemplazo de texto rompe la sintaxis del SUMIFS.
**Evidencia real**: primer intento de exclusiones en `04_CFSemanal` rompió los SUMIFS por incluir el `)` en el ancla (2026-07, corregido).

## ORQ-1 · Orquestador — gap sin rastro

**Situación**: durante un trabajo se detecta que ninguna skill cubre lo necesario (ej.: conciliación automática Libro IVA ↔ compras ↔ movimientos).
**Esperado**: o se resuelve en sesión (investigar/crear/mejorar skill), o queda como `gap_skill`/`integracion_faltante` en `backlog_autonomo`, o queda declarado como limitación en la respuesta.
**Reprueba si**: el gap se "resuelve" improvisando una respuesta genérica con seguridad de experto.

## ORQ-2 · Orquestador — activación ceremonial

**Situación**: se reporta un análisis listando 8 skills activadas.
**Esperado**: cada skill listada modificó el análisis o la ejecución en algo identificable.
**Reprueba si**: al preguntar "¿qué cambió esta skill en la conclusión?", la respuesta es nada.

---

## Validación estructural (automatizada)

```bash
python3 .claude/skills/orquestador-de-razonamiento-y-skills/scripts/inventario_skills.py --validar
```

Exit 1 si una skill experta pierde frontmatter o secciones obligatorias. Correr al crear o modificar cualquier skill.
