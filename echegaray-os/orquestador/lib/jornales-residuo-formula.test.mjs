// EL RESIDUO QUE VOLVIÓ TRES VECES: CUATRO FÓRMULAS MÍAS ARRIBA DEL TÍTULO DE SU PROPIA SECCIÓN.
//
// Todo lo de abajo sale de una lectura REAL de "Jornales por Quincena" del 14/08 (render FORMULA para
// las fórmulas, render normal para lo que se ve) y de una consulta a `sheet_huella_celda`. No hay
// nada inventado acá: si se revierte `formulasPropiasPorColumna`, los tres primeros se ponen rojos.
//
// LO QUE PASÓ. El cuadro «2 · OFICINA — SUELDOS POR MES» bajó ocho filas entre los commits de la
// mañana y los de la tarde. Las cuatro celdas de la columna «Banco» que ocupaba arriba se quedaron con
// la fórmula del layout viejo, y el layout nuevo puso ahí el blanco y el título de la sección:
//
//     F41  =SUM('_J_OFICINA'!W56:W57)+SUM('_J_OFICINA'!W62:W63)      idéntica a la F49 (Abril)
//     F42  =SUM('_J_OFICINA'!W72:W73)+SUM('_J_OFICINA'!W78:W79)      idéntica a la F50 (Mayo)
//     F43  =SUM('_J_OFICINA'!W89:W90)+SUM('_J_OFICINA'!W95:W96)      idéntica a la F51 (Junio)
//     F44  =SUM('_J_OFICINA'!W107:W108)+SUM('_J_OFICINA'!W113:W114)  idéntica a la F52 (Julio)
//
// POR QUÉ NINGUNA EVIDENCIA ANTERIOR LO PODÍA TOCAR. Consultado contra la base el 14/08: la pestaña
// tiene 685 huellas y CERO abandonadas, y las coordenadas 41 a 44 de la columna F no tienen ninguna —
// ni viva ni de abandono. Sin registro, la cuarta evidencia (el footprint) no tiene nada que probar, y
// ése es su diseño. Queda la única prueba que sí existe: la fórmula que hay adentro es, carácter por
// carácter, la que el generador sigue escribiendo HOY en ESA misma columna.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarHuella, claveCelda, huellasDeEscritura } from './huella-celda.mjs'
import { VACIO, fusionar } from './preservar-anotaciones.mjs'
import { preservarNoVacias } from './no-borrar.mjs'
import { auditarPatron, clasificarDefectos } from './patron-pestana.mjs'

const ANCHO = 8
const enLaPestana = (grid, hoy) => preservarNoVacias(hoy, fusionar(grid, hoy)).values
const huellasDe = (grid, opts = {}) =>
  new Map(huellasDeEscritura(grid, opts).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))

/** Las fórmulas de «Banco» de la pestaña viva, mes por mes, tal cual se leyeron con render FORMULA. */
const BANCO = {
  abril: "=SUM('_J_OFICINA'!W56:W57)+SUM('_J_OFICINA'!W62:W63)",
  mayo: "=SUM('_J_OFICINA'!W72:W73)+SUM('_J_OFICINA'!W78:W79)",
  junio: "=SUM('_J_OFICINA'!W89:W90)+SUM('_J_OFICINA'!W95:W96)",
  julio: "=SUM('_J_OFICINA'!W107:W108)+SUM('_J_OFICINA'!W113:W114)",
  enero: "=SUM('_J_OFICINA'!W5:W8)+SUM('_J_OFICINA'!W13:W15)",
}
/** El relleno de `push()`: la fila entera va con el centinela salvo lo que el generador dice. */
const fila = (celdas = []) => {
  const r = [...celdas]
  while (r.length < ANCHO) r.push(VACIO)
  return r
}

/**
 * LA GRILLA QUE EL GENERADOR EMITE HOY para las filas 38 a 58, con los rótulos y las fórmulas reales.
 * La fila 41 es el `blanco()` entre el calendario y la sección 2; de la 45 para abajo, el cuadro.
 */
const grillaDeHoy = () => [
  fila(['⇒ Total a pagar hasta diciembre', VACIO, VACIO, VACIO, VACIO, '=SUM(F29:F37)']),           // 38
  fila(['=IF(AND(ROUND(E38-$H$58;0)=0);"✓ oficina y dirección cierran";"▲ el calendario no cierra")']), // 39
  fila(['=IF(SUMPRODUCT($B$89:$B$92)=0;"✓ las 9 quincenas cubren el piso UOCRA";"▲ SIN piso UOCRA")']), // 40
  fila([]),                                                                                          // 41 · blanco()
  fila(['2 · OFICINA — SUELDOS POR MES']),                                                           // 42
  fila(['   · Planilla Oficina al 15/08/2026 — ver «Estado» por mes']),                              // 43
  fila(['   · Aumenta por el mismo % que obra — sin piso propio']),                                  // 44
  fila(['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado']), // 45
  fila(['Enero', VACIO, VACIO, 'pagado', VACIO, BANCO.enero]),                                       // 46
  fila(['Febrero', VACIO, VACIO, 'pagado', VACIO, VACIO]),                                           // 47
  fila(['Marzo', VACIO, VACIO, 'pagado', VACIO, VACIO]),                                             // 48
  fila(['Abril', VACIO, VACIO, 'pagado', VACIO, BANCO.abril]),                                       // 49
  fila(['Mayo', VACIO, VACIO, 'pagado', VACIO, BANCO.mayo]),                                         // 50
  fila(['Junio', VACIO, VACIO, 'pagado', VACIO, BANCO.junio]),                                       // 51
  fila(['Julio', VACIO, VACIO, 'parcial', VACIO, BANCO.julio]),                                      // 52
  fila(['Agosto', VACIO, VACIO, 'parcial', VACIO, "=SUM('_J_OFICINA'!W123:W124)"]),                  // 53
  fila(['Septiembre', VACIO, VACIO, 'proyección']),                                                  // 54
  fila(['Octubre', VACIO, VACIO, 'proyección']),                                                     // 55
  fila(['Noviembre', VACIO, VACIO, 'proyección']),                                                   // 56
  fila(['Diciembre', VACIO, VACIO, 'proyección']),                                                   // 57
  fila(['⇒ Oficina — pagado y por pagar en el año', VACIO, VACIO, VACIO, VACIO, '=SUM(F$46:F$57)']), // 58
]

/**
 * LA PESTAÑA PUBLICADA HOY: lo mismo que emite el generador —ya escrito en corridas anteriores— con
 * el residuo vivo en F41:F44. El centinela no llega a la pestaña: lo que él ordena limpiar se ve
 * vacío, salvo justamente donde quedó el fósil.
 */
const pestanaDeHoy = () => {
  const hoy = grillaDeHoy().map((f) => f.map((c) => (c === VACIO ? '' : c)))
  hoy[3][5] = BANCO.abril  // F41
  hoy[4][5] = BANCO.mayo   // F42
  hoy[5][5] = BANCO.junio  // F43
  hoy[6][5] = BANCO.julio  // F44
  return hoy
}

/** El mapa sellado tal cual está en la base: hay huella de las filas del cuadro y NINGUNA de F41:F44. */
const huellasComoEnLaBase = (quiero) => {
  const h = huellasDe(quiero, { fila0: 38 })
  for (const f of [41, 42, 43, 44]) h.delete(claveCelda(f, 5))
  return h
}

test('(1) el residuo publicado en F41:F44 se limpia: es mi fórmula, en mi columna', () => {
  const quiero = grillaDeHoy()
  const hoy = pestanaDeHoy()
  const { grid, residuos, ajenas, alineacion } = aplicarHuella(quiero, hoy, huellasComoEnLaBase(quiero), { fila0: 38 })
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  assert.equal(residuos.length, 4, 'las cuatro celdas tienen que reconocerse como residuo propio')
  assert.deepEqual(residuos.map((r) => r.fila), [41, 42, 43, 44])
  assert.ok(residuos.every((r) => r.col === 5 && /fórmula/.test(r.por)), 'la evidencia tiene que ser la fórmula')
  assert.ok(!ajenas.some((a) => a.col === 5 && a.fila >= 41 && a.fila <= 44), 'ya no se cuentan como del dueño')

  // LA PRUEBA DEL EFECTO, hasta el final de la cadena (fusión + no-borrar), no el paso del medio.
  const quedo = enLaPestana(grid, hoy)
  for (const i of [3, 4, 5, 6]) assert.equal(quedo[i][5], '', `la fila ${38 + i} sigue con el residuo publicado`)
  // Y el cuadro de abajo NO se toca: la limpieza no puede llevarse las fórmulas vivas.
  assert.equal(quedo[11][5], BANCO.abril, 'F49 (Abril) es la fórmula viva y tiene que quedar')
  assert.equal(quedo[20][5], '=SUM(F$46:F$57)', 'el total del cuadro tiene que quedar')
})

test('(2) y con eso desaparece el `fila-sin-concepto` de la fila 41, que es lo que el dueño ve', () => {
  // El auditor mira lo que se VE, no la fórmula. Los dos valores de abajo son los reales: la F41
  // mostraba `—` (formato de importe en cero) y la A41 mostraba vacío (un `=""` heredado).
  const visible = (conResiduo) => [
    ['⇒ Total a pagar hasta diciembre', '', '', '', '', '$47.630.913', '', ''],
    ['✓ oficina y dirección cierran contra sus bloques (2 y 3)', '', '', '', '', '', '', ''],
    ['✓ las 9 quincenas proyectadas cubren el piso UOCRA', '', '', '', '', '', '', ''],
    ['', '', '', '', '', conResiduo ? '—' : '', '', ''],
    ['2 · OFICINA — SUELDOS POR MES', '', '', '', '', conResiduo ? '—' : '', '', ''],
    ['   · Planilla Oficina al 15/08/2026 — ver «Estado» por mes', '', '', '', '', conResiduo ? '—' : '', '', ''],
    ['   · Aumenta por el mismo % que obra — sin piso propio', '', '', '', '', conResiduo ? '$2.730.000' : '', '', ''],
    ['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado'],
    ['Enero', '', '$3.412.000', 'pagado', '02/02/2026', '$2.619.303', '', ''],
  ]
  // Las filas del bloque arrancan en la 38, así que la 41 es el índice 3: se completa el hueco de
  // arriba para que el auditor pueda numerar las filas como la pestaña.
  const conTitulo = (f) => [['Jornales por quincena'], ['Jornales al 15/08/2026 — fuente: planilla JORNALES'],
    ...Array.from({ length: 35 }, () => ['']), ...f]

  const antes = auditarPatron(conTitulo(visible(true))).filter((d) => d.regla === 'fila-sin-concepto')
  assert.equal(antes.length, 1, 'el defecto que el dueño reclamó tres veces tiene que estar acá')
  assert.equal(antes[0].fila, 41)

  const despues = auditarPatron(conTitulo(visible(false))).filter((d) => d.regla === 'fila-sin-concepto')
  assert.deepEqual(despues, [], 'limpiado el residuo, la fila 41 deja de tener valores sin concepto')
})

test('(3) una fórmula del dueño en MI columna se conserva: no la escribo yo en ninguna parte', () => {
  const quiero = grillaDeHoy()
  const hoy = pestanaDeHoy()
  // Él puso su propio control en F41. Se parece mucho a las mías —misma pestaña espejo, misma
  // columna W— pero no es ninguna de las que emito hoy. Sin coincidencia exacta, no hay propiedad.
  hoy[3][5] = "=SUM('_J_OFICINA'!W5:W130)"
  const { grid, residuos, ajenas } = aplicarHuella(quiero, hoy, huellasComoEnLaBase(quiero), { fila0: 38 })
  assert.equal(residuos.length, 3, 'las otras tres siguen siendo mías; ésta no')
  assert.ok(ajenas.some((a) => a.fila === 41 && a.col === 5), 'la celda del dueño se conserva como ajena')
  assert.equal(enLaPestana(grid, hoy)[3][5], "=SUM('_J_OFICINA'!W5:W130)", 'le borré una fórmula suya')
})

test('(4) la MISMA fórmula en otra columna no se toca: un cuadro se corre en vertical, no de costado', () => {
  const quiero = grillaDeHoy()
  const hoy = pestanaDeHoy()
  hoy[3][5] = ''            // sin residuo en la columna F
  hoy[3][6] = BANCO.abril   // pero sí en la G, donde yo esa fórmula no la escribo nunca
  const { grid, residuos, ajenas } = aplicarHuella(quiero, hoy, huellasComoEnLaBase(quiero), { fila0: 38 })
  assert.ok(!residuos.some((r) => r.col === 6), 'la columna es la segunda evidencia y acá no está')
  assert.ok(ajenas.some((a) => a.fila === 41 && a.col === 6))
  assert.equal(enLaPestana(grid, hoy)[3][6], BANCO.abril, 'sin la evidencia de columna, la celda se conserva')
})

test('(5) el defecto de patrón es REPORTE; el que rompe el dato es el que tumba la corrida', () => {
  // La clasificación existe para que el exitCode deje de decir lo mismo ante dos hechos distintos:
  // una pestaña con `#REF!` publicó un número que no existe; una fila sin rótulo publicó los números
  // bien y se lee mal. Reintentar la corrida arregla lo primero y reproduce lo segundo.
  const { rotos, reporte } = clasificarDefectos([
    { fila: 41, regla: 'fila-sin-concepto', detalle: 'Tiene valores pero ni la columna A ni la B dicen qué son.' },
    { fila: 12, regla: 'error-de-formula', detalle: 'Columna 6: #REF!' },
    { fila: 0, regla: 'anchos-mezclados', detalle: 'La pestaña mezcla 3 anchos de grilla.' },
  ])
  assert.deepEqual(rotos.map((d) => d.regla), ['error-de-formula'])
  assert.deepEqual(reporte.map((d) => d.regla), ['fila-sin-concepto', 'anchos-mezclados'])
  // Y una pestaña que no se pudo leer NO es un problema de diseño: es una escritura que no llegó.
  assert.deepEqual(clasificarDefectos(auditarPatron([])).reporte, [])
})
