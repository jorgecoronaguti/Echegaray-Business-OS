---
name: obra-piloto-pisos-verdad-financiera
description: Ciclo vertical de obra piloto (Pisos) bajo el marco definitivo de "verdad financiera y económica" -- costo real de mano de obra vinculado a HH real, forecast de terminación (ETC/EAC/VAC/CPI) construido con cobertura declarada, auditoría honesta de precisión financiera (F1).
metadata:
  type: project
---

Fecha: 2026-07-08. Jorge fijó la visión permanente (Operador Empresarial Digital) y la prioridad de secuencia: precisión financiera/económica y control de obra primero, sin reducir el alcance final (10/10 en toda la empresa). Pidió elegir la obra activa con mejor evidencia y cerrar un caso vertical completo.

## Selección de obra piloto

Ninguna obra está realmente en estado `'activa'` (constraint real: contratada/activa/pausada/cerrada). Las 4 obras: Galpones (cerrada), Cambio de Pisos - RRHH y Galpón 9 (pausadas, sin ningún dato real cargado), Pisos (pausada, pero con presupuesto real + 19 registros_hh reales + 15 actividades). Se eligió **Pisos** por evidencia real, no por default.

**Hallazgo real, no resuelto**: `obras.estado` de Pisos dice `pausada`, pero el último registro real de HH es de la semana del 2026-07-06 (hace 2 días). Inconsistencia declarada en `backlog_autonomo`, no asumida en ningún sentido.

## Costo real de mano de obra (gap crítico cerrado)

Pisos tenía HH real (681h, JORNALES) desde O1-A, pero `costos_reales` estaba **vacío** -- exactamente el caso que el `CLAUDE.md` raíz prohíbe aceptar como económicamente confiable.

Se descargó y parseó localmente el Sheet real de JORNALES (hoja "Obreros 26", bloques quincenales jun-jul 2026) para obtener el **$/hora real de cada uno de los 8 trabajadores** de Pisos (ahí figura como cliente/obra "JAVIER SANCHEZ" -- mismo cliente real que ya se sabía, San Francisco/IMOTOR/Javier Sánchez). Se cruzó HH real (ya cargada) × tarifa real (recién obtenida) = **19 filas nuevas en `costos_reales`, $3.105.500 total**, cada una vinculada 1:1 a su fila de `registros_hh` vía `costo_real_id` (columna que ya existía, sin usar hasta ahora).

Confirma de paso el hallazgo ya documentado en O1-A: Gonzalez Emiliano trabajó 0 horas el 2026-07-06 (visible en JORNALES), consistente con por qué esa fila no se pudo cargar en `registros_hh` (constraint `horas > 0`).

`estado = 'comprometido'` (no `'pagado'`): las semanas ya transcurrieron y JORNALES es el cálculo real de sueldo, pero no hay un `movimiento_caja` real que confirme el pago -- declarado conservador, no asumido.

## Forecast de terminación (ETC/EAC/VAC/CPI) -- nueva capacidad real

Extendido `calcularResumenProduccionEconomica` (ya existente, O1-C) con CPI/ETC/EAC/VAC, reutilizando `costoEsperadoAFecha` como valor ganado (sin recalcular). **Deliberadamente `naturaleza: 'inferido'`** con la cobertura real declarada en cada explicación: avance físico surge de solo 3 de 15 actividades (20%) y el costo real hoy es solo mano de obra (sin materiales/subcontratos/equipos) -- un CPI≈6,88 resultante es matemáticamente correcto pero **no representativo todavía** (implicaría terminar la obra gastando ~$5,3M contra un presupuesto de $36,6M, lo cual sería engañoso presentar como forecast sólido).

Principio aplicado: la capacidad se construye igual (no se posterga por falta de cobertura), pero se declara explícitamente que hoy es de baja confianza -- exactamente lo pedido en Sección 12 ("declarar método, cobertura, confianza, supuestos, sensibilidad").

Verificado con test real (`negocio-casos-reales.spec.ts`) contra los valores calculados a mano: CPI 6.88, ETC $2.218.214, EAC $5.323.714, VAC $31.284.187.

## Auditoría de precisión financiera (Sección 6, honesta)

Revisado `posicionCajaService.ts`/`types/index.ts` (F1) línea por línea, no solo confiado porque "ya existe":

**Confirmado real y confiable**: saldo actual (solo movimientos reales), distinción cierto/estimado en cobros, comprometido/proyectado-suelto en pagos sin doble conteo, forecast semanal/mensual, causa principal de un déficit (item que más pesa).

**Gaps reales encontrados** (cargados en `backlog_autonomo`, no ocultados):
- No se versiona el forecast anterior -- no puede responder "¿qué cambió desde la semana pasada?" (ya era una decisión abierta de la skill `cash-flow-operativo`, confirmada de nuevo).
- Sin motor de escenarios/sensibilidad ("¿qué pasa si un cobro se atrasa 15 días?") -- no existe, no se inventó.
- "Punto mínimo de caja" no se expone como un único dato aislado (existe el forecast completo, pero no un "peor semana" destacado).

## Scorecard actualizado

Obras y Control Económico se mantienen en 5/10 (evidencia reforzada, no un salto -- el ETC/EAC de baja confianza no es todavía "recomienda decisiones multidisciplinarias", eso sería N6).

## Próximo paso natural

Cargar costos reales de materiales/subcontratos de Pisos (hoy 0) para que el CPI/ETC/EAC empiece a ser representativo. Seguir agregando actividades cerradas reales para subir la cobertura de avance físico más allá del 20% actual. Confirmar con Jorge el estado real de Pisos (pausada vs. activa).
