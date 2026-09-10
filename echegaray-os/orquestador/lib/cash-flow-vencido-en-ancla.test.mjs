// UN VENCIDO NO PERTENECE A LA VENTANA DE SU FECHA: PERTENECE A LA COLUMNA DEL ANCLA.
//
// ═══ EL DEFECTO QUE ATRAPA, MEDIDO EN EL ARCHIVO VIVO (10/09/2026) ═══
//
//   Cash Flow Mensual!M50   $61.410.282      ← «Saldo final» de diciembre
//   Cash Flow Semanal!BB50  $70.410.282      ← «Saldo final» de la última semana
//                           ─────────────
//                           $ 9.000.000      exactamente el único VENCIDO del libro
//
// El libro tenía un solo movimiento en VENCIDO: un retiro de Dirección del 01/09 por $9.000.000. El
// ancla de la cadena de saldos es `CAJA_FECHA_SALDO`, el 07/09. En el mensual ese vencido cae en la
// columna de septiembre, que ES la del ancla, así que entra a la cadena y el cierre lo resta. En el
// semanal cae en la semana del 31/08 — anterior a la del ancla, y por lo tanto FUERA de la cadena:
// esa columna muestra sus flujos y no publica saldo. El cierre del año nunca lo vio.
//
// No es un problema de bordes ni de redondeo: las dos vistas leen el MISMO libro y publican dos
// cierres distintos del MISMO ejercicio. Y no se arregla llevando la cadena hacia atrás: un vencido
// es plata que estaba prevista para una fecha que ya pasó y que nadie concilió — su fecha dice cuándo
// DEBERÍA haber ocurrido, no cuándo ocurre. La escalera de CAJA ya lo trata así desde el 17/08.
//
// ESTE TEST NO MIRA EL TEXTO DE LAS FÓRMULAS: LAS EVALÚA. Un test de cadena habría pasado con el
// código viejo —las fórmulas estaban bien escritas, lo que estaba mal era en qué columna caía el
// vencido— y ninguna aserción sobre un SUMPRODUCT puede ver que un cierre pierde $9M.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'
import { COL, colTotal, columnasDeTiempo, letra, serialDeFecha, ventanas } from './cash-flow-matriz.mjs'
import { LIBRO } from './libro-sumas.mjs'
import { MEDIDAS } from './cash-flow-medidas.mjs'
import { medidasDeVentana } from './flujo-persistencia.mjs'
import { cadenaEsperada } from './cash-flow-ancla-saldo.mjs'
import { evaluarFormula, hojaDeGrilla } from './evaluar-formula-sheet.mjs'

const ANIO = 2026
const serial = (iso) => serialDeFecha(new Date(`${iso}T00:00:00Z`))
/** El corte de CAJA: lunes 07/09/2026. Es el que decide cuál es la columna del ancla en cada vista. */
const FECHA_CORTE = new Date('2026-09-07T00:00:00Z')
const CORTE = serialDeFecha(FECHA_CORTE)
const CAJA = 100_000_000

/**
 * EL LIBRO, UNA SOLA VEZ. La hoja modelada y el gemelo JS salen de esta misma lista: con dos listas
 * "equivalentes", una diferencia entre las dos materializaciones se puede esconder en el modelo.
 */
const MOVIMIENTOS = [
  // El caso real: el retiro de Dirección, VENCIDO, en la semana ANTERIOR a la del ancla.
  { fecha: serial('2026-09-01'), signo: -1, importe: 9_000_000, estado: 'VENCIDO', rubro: 'Estructura' },
  // Un segundo VENCIDO que YA cae dentro de la ventana del ancla: prueba que no se cuenta dos veces.
  { fecha: CORTE, signo: -1, importe: 1_000_000, estado: 'VENCIDO', rubro: 'Impuestos' },
  { fecha: serial('2026-01-15'), signo: -1, importe: 5_000_000, estado: 'REAL', rubro: 'Estructura' },
  { fecha: serial('2026-09-09'), signo: -1, importe: 500_000, estado: 'REAL', rubro: 'Impuestos' },
  // Un COMPROMETIDO POSTERIOR al ancla, y a propósito fuera de su mes y de su semana: así "lo que trae
  // la columna del ancla" es exactamente el vencido y la aserción no depende de la granularidad.
  { fecha: serial('2026-11-20'), signo: -1, importe: 2_000_000, estado: 'COMPROMETIDO', rubro: 'Materiales Civil' },
  { fecha: serial('2026-10-20'), signo: 1, importe: 30_000_000, estado: 'PROYECTADO', rubro: 'Cobranzas' },
]
/** Lo que suma el par de VENCIDOS, en magnitud. Es la plata que el cierre semanal perdía. */
const VENCIDO_TOTAL = 10_000_000

/** `_MOVIMIENTOS` modelada celda por celda, con el contrato de columnas que declara `libro-sumas`. */
const libroModelado = () => {
  const h = { A1: 'Fecha', B1: 'Signo', C1: 'Importe', H1: 'Estado', F1: 'Rubro' }
  MOVIMIENTOS.forEach((m, i) => {
    const f = LIBRO.fila0 + i
    h[`${LIBRO.col.fecha}${f}`] = m.fecha
    h[`${LIBRO.col.signo}${f}`] = m.signo
    h[`${LIBRO.col.importe}${f}`] = m.importe
    h[`${LIBRO.col.estado}${f}`] = m.estado
    h[`${LIBRO.col.rubro}${f}`] = m.rubro
  })
  return h
}

const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const NOMBRES = { CAJA_TOTAL_DISPONIBLE: CAJA, CAJA_FECHA_SALDO: CORTE, CAJA_MINIMA: 0 }

/** Las dos vistas, ya generadas, con su lector de celdas por fórmula evaluada. */
function vista(tipo) {
  const g = tipo === 'mes'
    ? grillaMeses({ anio: ANIO, refs: REFS, hoy: new Date(Date.UTC(2026, 8, 10)) })
    : grillaSemanal({ hoy: new Date(Date.UTC(2026, 8, 10)), anio: ANIO, refs: REFS })
  const hoja = hojaDeGrilla(g.filas)
  const valor = (fila, col) => evaluarFormula(`=N(${letra(col)}${fila})`, {
    hoja, hojas: { [LIBRO.pestana]: libroModelado() }, nombres: NOMBRES, hoy: new Date(Date.UTC(2026, 8, 10)),
  })
  const n = columnasDeTiempo(tipo, ANIO)
  return {
    ...g,
    valor,
    n,
    ultima: COL.tiempo0 + n - 1,
    total: colTotal(tipo, ANIO),
    // La columna cuya ventana CONTIENE el corte: la del ancla, la única que arranca del saldo real.
    ancla: ventanas(tipo, { anio: ANIO })
      .findIndex((v) => serialDeFecha(v.desde) <= CORTE && CORTE < serialDeFecha(v.hasta)) + COL.tiempo0,
  }
}

/**
 * EL CIERRE DEL EJERCICIO QUE PUBLICA UNA VISTA, reconstruido con `cadenaEsperada`.
 *
 * ═══ POR QUÉ NO SE EVALÚA LA CELDA «Saldo final» DIRECTAMENTE ═══
 *
 * Porque la cadena de saldos es recursiva —`saldoFinal(j)` cita `saldoInicial(j)` DOS veces y ése cita
 * `saldoFinal(j−1)`— y el evaluador en frío no memoiza: pedirle la última de 53 columnas son 2⁵³
 * SUMPRODUCT y el test no termina nunca (medido: 90 s sin llegar a la primera aserción). Lo que sí es
 * barato es la fila `Resultado` de cada columna, que sólo cita las cuatro medidas de SU columna.
 *
 * Así que se evalúan los FLUJOS de la hoja y la cadena se arma con la función que este repo ya tiene
 * probada para eso — que además es lo correcto por otra razón: un cierre no se valida contra la misma
 * celda que lo publica.
 */
function cierreDelEjercicio(v, tipo) {
  const w = v.meta.efectivas ?? ventanas(tipo, { anio: ANIO })
  const periodos = w.map((x, j) => ({
    desde: x.desde, hasta: x.hasta, neto: v.valor(v.meta.fila.resultado, COL.tiempo0 + j),
  }))
  // `cadenaEsperada` compara FECHAS, no seriales: el corte va como Date o el ancla se leería en 1970.
  const cadena = cadenaEsperada(periodos, { saldo: CAJA, fecha: FECHA_CORTE })
  const conCadena = cadena.filter((c) => c.cierre !== null && !c.calculado)
  assert.ok(conCadena.length, `${tipo}: la cadena de saldos quedó vacía — el ancla no cayó en ninguna columna`)
  return conCadena[conCadena.length - 1].cierre
}

test('EL DEFECTO: el cierre del ejercicio es el MISMO en las dos vistas', () => {
  const cierreMes = cierreDelEjercicio(vista('mes'), 'mes')
  const cierreSem = cierreDelEjercicio(vista('semana'), 'semana')
  assert.equal(Math.round(cierreSem), Math.round(cierreMes),
    `el cierre semanal (${cierreSem}) y el mensual (${cierreMes}) tienen que salir del mismo libro`)
  // Y NO COINCIDEN EN CUALQUIER NÚMERO: el cierre tiene que tener los dos vencidos RESTADOS. Sin esta
  // aserción, dos vistas que perdieran el vencido las dos pasarían el test abrazadas.
  assert.equal(Math.round(cierreMes), Math.round(CAJA + 30_000_000 - 2_000_000 - VENCIDO_TOTAL - 500_000),
    'el cierre es la caja declarada más lo proyectado del ejercicio, con el vencido adentro')
})

test('el vencido entra ENTERO en la columna del ancla, y en NINGUNA otra', () => {
  for (const tipo of ['mes', 'semana']) {
    const v = vista(tipo)
    const fila = v.meta.fila.egresoProyectado
    const enAncla = v.valor(fila, v.ancla)
    // La columna del ancla trae los dos vencidos (el de su ventana y el de la semana anterior).
    assert.equal(Math.round(enAncla), VENCIDO_TOTAL, `${tipo}: la columna del ancla tiene que traer los dos vencidos`)
    // Y NINGUNA columna anterior lo muestra: ahí es donde se perdía.
    for (let col = COL.tiempo0; col < v.ancla; col++) {
      assert.equal(Math.round(v.valor(fila, col)), 0,
        `${tipo}: la columna ${letra(col)} publica un vencido que no le toca`)
    }
    // El total de la fila sigue conteniendo el vencido UNA vez: ni perdido ni duplicado.
    const total = v.valor(fila, v.total)
    assert.equal(Math.round(total), VENCIDO_TOTAL + 2_000_000, `${tipo}: el TOTAL de egresos proyectados`)
  }
})

test('la sub-línea del rubro se mueve con su subtotal: el vencido no reaparece en «· Otros»', () => {
  for (const tipo of ['mes', 'semana']) {
    const v = vista(tipo)
    const bloque = v.meta.bloques.find((b) => b.clave === 'egresoProyectado')
    const fila = bloque.rubros.find((r) => r.rubro === 'Estructura').fila
    assert.equal(Math.round(v.valor(fila, v.ancla)), 9_000_000, `${tipo}: Estructura vencida, en el ancla`)
    // "Otros" se despeja de `subtotal − SUM(rubros)`: si el subtotal moviera el vencido y el rubro no,
    // los $9M aparecerían acá — plata real en la fila equivocada, con el cuadro cerrando igual.
    assert.equal(Math.round(v.valor(bloque.otros, v.ancla)), 0, `${tipo}: "· Otros" del ancla tiene que dar cero`)
  }
})

test('el gemelo JS reparte el vencido igual que la fórmula: el mismo número, celda por celda', () => {
  for (const tipo of ['mes', 'semana']) {
    const v = vista(tipo)
    const grilla = ventanas(tipo, { anio: ANIO })
    let sumaJs = 0
    for (let j = 0; j < v.n; j++) {
      const desde = serialDeFecha(grilla[j].desde)
      const hasta = serialDeFecha(grilla[j].hasta)
      const js = medidasDeVentana(MOVIMIENTOS, desde, hasta, { ancla: CORTE }).egreso_proyectado
      const hoja = v.valor(v.meta.fila.egresoProyectado, COL.tiempo0 + j)
      assert.equal(Math.round(js), Math.round(hoja),
        `${tipo} columna ${letra(COL.tiempo0 + j)}: Postgres dice ${js} y la hoja ${hoja}`)
      sumaJs += js
    }
    assert.equal(Math.round(sumaJs), VENCIDO_TOTAL + 2_000_000, `${tipo}: el gemelo JS también suma el vencido una vez`)
  }
})

test('SIN ancla el vencido vuelve a la ventana de su fecha — la degradación es la MISMA en los dos lados', () => {
  // Es el caso del arranque en frío: sin los rangos con nombre de CAJA no hay columna del presente. Lo
  // que no puede pasar es que la hoja degrade y el gemelo JS no, porque ahí sí habría dos verdades.
  const sem = grillaSemanal({ hoy: new Date(Date.UTC(2026, 8, 10)), anio: ANIO, refs: {} })
  const hoja = hojaDeGrilla(sem.filas)
  const semanaDelVencido = ventanas('semana', { anio: ANIO })
    .findIndex((v) => serialDeFecha(v.desde) <= MOVIMIENTOS[0].fecha && MOVIMIENTOS[0].fecha < serialDeFecha(v.hasta))
  const col = letra(COL.tiempo0 + semanaDelVencido)
  const enSuFecha = evaluarFormula(`=N(${col}${sem.meta.fila.egresoProyectado})`, {
    hoja, hojas: { [LIBRO.pestana]: libroModelado() }, nombres: NOMBRES, hoy: new Date(Date.UTC(2026, 8, 10)),
  })
  assert.equal(Math.round(enSuFecha), 9_000_000, 'sin ancla, la celda vuelve al criterio histórico')
  const w = ventanas('semana', { anio: ANIO })[semanaDelVencido]
  const js = medidasDeVentana(MOVIMIENTOS, serialDeFecha(w.desde), serialDeFecha(w.hasta), { ancla: null })
  assert.equal(Math.round(js.egreso_proyectado), 9_000_000, 'y el gemelo JS degrada exactamente igual')
})

test('la partición por estado sigue siendo exacta: nada quedó sin medida', () => {
  // El vencido salió de la ventana de las columnas: lo que NO puede haber pasado es que salga del
  // cuadro. Las cuatro medidas del año tienen que sumar el libro entero, en magnitud.
  const mes = vista('mes')
  const total = MEDIDAS.reduce((s, m) => s + mes.valor(mes.meta.fila[m.clave], mes.total), 0)
  const libro = MOVIMIENTOS.reduce((s, m) => s + m.importe, 0)
  assert.equal(Math.round(total), Math.round(libro), 'las cuatro medidas del ejercicio son el libro entero')
})
