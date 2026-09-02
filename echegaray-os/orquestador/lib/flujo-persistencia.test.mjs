import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COL, libroDesdeLaPestana, filasDeMovimiento, medidasDeVentana, rubrosDeVentana,
  filasDePeriodo, filasDeAsimetria, firmaDelLibro, resumenDeCorrida, fechaDeSerial, iso,
  RUBROS_DEL_CUADRO, corridasAPodar,
} from './flujo-persistencia.mjs'
import { LIBRO } from './libro-sumas.mjs'
import { serialDeFecha } from './cash-flow-matriz.mjs'
import { sumar } from './libro-movimientos.mjs'

const S = (y, m, d) => serialDeFecha(new Date(Date.UTC(y, m - 1, d)))

/** Un movimiento del libro, con lo mínimo que exige el mapeo. */
const mov = (p) => ({
  fecha: S(2026, 3, 10), signo: -1, importe: 1000, estado: 'REAL', moneda: 'ARS',
  concepto: '', rubro: 'Estructura', actividad: 'operativa', instrumento: 'transferencia',
  contraparte: '', cuit: '', comprobante: '', obra: '', cliente: '',
  origen: { pestana: 'Compras', fila: 7 }, clave: 'k1', ...p,
})

/** Una fila del rectángulo de `_MOVIMIENTOS`, armada por NOMBRE de columna y no por posición. */
function filaCruda(campos) {
  const f = new Array(Object.keys(COL).length).fill('')
  for (const [campo, valor] of Object.entries(campos)) f[COL[campo]] = valor
  return f
}
const ENCABEZADO = new Array(Object.keys(COL).length).fill('x')

test('COL sale de LIBRO.col: los índices no se tipean, se derivan del contrato con la pestaña', () => {
  assert.equal(COL.fecha, 0)
  assert.equal(COL.estado, 7)
  assert.equal(COL.cliente, 16)
  for (const [campo, letra] of Object.entries(LIBRO.col)) {
    assert.equal(COL[campo], letra.charCodeAt(0) - 65, `${campo} desalineado con la columna ${letra}`)
  }
})

test('fechaDeSerial: el serial de la celda es la fecha calendario que consulta la analítica', () => {
  assert.equal(iso(fechaDeSerial(S(2026, 3, 1))), '2026-03-01')
  assert.equal(iso(fechaDeSerial(S(2026, 12, 31))), '2026-12-31')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA LECTURA DE LA PESTAÑA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('libroDesdeLaPestana: lee las filas buenas y deja la rota FUERA, con su motivo', () => {
  const { libro, problemas } = libroDesdeLaPestana([
    ENCABEZADO,
    filaCruda({ fecha: S(2026, 3, 10), signo: -1, importe: 500, estado: 'REAL', rubro: 'Impuestos', clave: 'a' }),
    // El estado es una FÓRMULA que no resolvió: entra como texto y no es un estado válido.
    filaCruda({ fecha: S(2026, 3, 11), signo: -1, importe: 700, estado: '=IF(A1;"REAL";"")', clave: 'b' }),
    // El colchón que el generador deja para limpiar el sobrante: ni entra ni es un problema.
    new Array(17).fill(''),
  ])
  assert.equal(libro.length, 1)
  assert.equal(libro[0].clave, 'a')
  assert.equal(problemas.length, 1, 'la fila con el estado sin resolver tiene que reportarse')
  assert.match(problemas[0], /f3/)
})

test('libroDesdeLaPestana: el importe entra como MAGNITUD aunque la celda venga con signo', () => {
  const { libro } = libroDesdeLaPestana([ENCABEZADO,
    filaCruda({ fecha: S(2026, 3, 10), signo: -1, importe: -900, estado: 'REAL', clave: 'a' })])
  assert.equal(libro[0].importe, 900, 'el signo se guarda aparte: guardarlo dos veces invierte sumas')
  assert.equal(libro[0].signo, -1)
})

test('filasDeMovimiento: la fila lleva la fecha Y el serial, para poder volver a la celda', () => {
  const [f] = filasDeMovimiento([mov({ obra: 'QUATTROPANI', cliente: 'ARCOR' })])
  assert.equal(f.fecha, '2026-03-10')
  assert.equal(f.fecha_serial, S(2026, 3, 10))
  assert.equal(f.origen_pestana, 'Compras')
  assert.equal(f.origen_fila, 7)
  assert.equal(f.obra, 'QUATTROPANI')
  assert.equal(f.cliente, 'ARCOR')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS MEDIDAS: LA BASE TIENE QUE DECIR LO MISMO QUE LA PESTAÑA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const marzo = { desde: S(2026, 3, 1), hasta: S(2026, 4, 1) }

test('EL EGRESO SE GUARDA EN POSITIVO — es lo que la hoja muestra y lo que resta', () => {
  // ESTE TEST ATRAPA EL DEFECTO CONCRETO: `sumar` ignoraba `medida:'magnitud'`, así que evaluar en JS
  // los mismos filtros que la hoja devolvía los egresos en NEGATIVO. La base habría guardado
  // egreso_real = -3.000.000 y la pantalla habría dibujado las barras de egreso hacia abajo mientras
  // la pestaña las muestra hacia arriba — sin que ningún control diera error.
  const libro = [
    mov({ clave: 'i1', signo: 1, importe: 5_000_000, rubro: 'Cobranzas', estado: 'REAL' }),
    mov({ clave: 'e1', signo: -1, importe: 3_000_000, rubro: 'Impuestos', estado: 'REAL' }),
  ]
  const m = medidasDeVentana(libro, marzo.desde, marzo.hasta)
  assert.equal(m.ingreso_real, 5_000_000)
  assert.equal(m.egreso_real, 3_000_000, 'el egreso se muestra en positivo')
  assert.equal(m.resultado, 2_000_000)
})

test('el resultado del período ES el neto del libro en esa ventana, al peso', () => {
  // La identidad que sostiene todo el esquema: si la base y la pestaña discreparan, sería acá.
  const libro = [
    mov({ clave: 'a', signo: 1, importe: 8_100_000, rubro: 'Cobranzas', estado: 'REAL' }),
    mov({ clave: 'b', signo: 1, importe: 2_500_000, rubro: 'Cobranzas', estado: 'PROYECTADO' }),
    mov({ clave: 'c', signo: -1, importe: 4_400_000, rubro: 'Materiales Civil', estado: 'REAL' }),
    mov({ clave: 'd', signo: -1, importe: 1_200_000, rubro: 'Estructura', estado: 'COMPROMETIDO' }),
    mov({ clave: 'e', signo: -1, importe: 900_000, rubro: 'Impuestos', estado: 'VENCIDO' }),
    // Fuera de la ventana: no puede entrar en marzo.
    mov({ clave: 'f', fecha: S(2026, 4, 2), signo: -1, importe: 7_000_000, rubro: 'Impuestos' }),
  ]
  const m = medidasDeVentana(libro, marzo.desde, marzo.hasta)
  const neto = sumar(libro, { desde: marzo.desde, hasta: marzo.hasta }).total
  assert.equal(m.resultado, neto)
})

test('una DEVOLUCIÓN no infla el ingreso: netea su propio rubro del lado del egreso', () => {
  // Un movimiento que ENTRA con rubro de EGRESO (una nota de crédito de proveedor). Contarlo como
  // ingreso infla las dos cifras que se leen para decidir aunque el neto siga cerrando.
  const libro = [
    mov({ clave: 'e', signo: -1, importe: 1_000_000, rubro: 'Materiales Civil', estado: 'REAL' }),
    mov({ clave: 'nc', signo: 1, importe: 300_000, rubro: 'Materiales Civil', estado: 'REAL' }),
  ]
  const m = medidasDeVentana(libro, marzo.desde, marzo.hasta)
  assert.equal(m.ingreso_real, 0, 'una nota de crédito no es plata que la empresa cobró')
  assert.equal(m.egreso_real, 700_000, 'el egreso queda neto de lo devuelto')
  assert.equal(m.resultado, -700_000)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA APERTURA POR RUBRO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('los rubros SUMAN el total del período: "Otros" se despeja de la resta', () => {
  const libro = [
    mov({ clave: 'a', signo: 1, importe: 6_000_000, rubro: 'Cobranzas', estado: 'REAL' }),
    mov({ clave: 'b', signo: -1, importe: 2_000_000, rubro: 'Impuestos', estado: 'REAL' }),
    mov({ clave: 'c', signo: -1, importe: 1_500_000, rubro: 'Estructura', estado: 'PROYECTADO' }),
  ]
  const totales = medidasDeVentana(libro, marzo.desde, marzo.hasta)
  const rubros = rubrosDeVentana(libro, marzo.desde, marzo.hasta, totales)
  for (const col of ['ingreso_real', 'ingreso_proyectado', 'egreso_real', 'egreso_proyectado']) {
    const suma = rubros.reduce((s, r) => s + r[col], 0)
    assert.equal(suma, totales[col], `los rubros no suman el total de ${col}`)
  }
})

test('un rubro que el libro emite y el cuadro no lista cae en "Otros" y SE VE', () => {
  // Es la razón de que el subtotal sea el libro entero y no la suma de las sub-líneas: un rubro nuevo
  // no puede desaparecer del cuadro mientras el total cierra consigo mismo.
  const libro = [mov({ clave: 'x', signo: -1, importe: 4_200_000, rubro: 'Rubro que nadie declaró', estado: 'REAL' })]
  const totales = medidasDeVentana(libro, marzo.desde, marzo.hasta)
  const otros = rubrosDeVentana(libro, marzo.desde, marzo.hasta, totales).find((r) => r.rubro === 'Otros')
  assert.equal(otros.egreso_real, 4_200_000)
  assert.ok(RUBROS_DEL_CUADRO.includes('Otros'))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS PERÍODOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('filasDePeriodo mensual: doce totales, ventanas contiguas y sin solapamiento', () => {
  const filas = filasDePeriodo([mov({ clave: 'a' })], { granularidad: 'mes', anio: 2026 })
  const totales = filas.filter((f) => f.nivel === 'total')
  assert.equal(totales.length, 12)
  assert.equal(totales[0].periodo_inicio, '2026-01-01')
  assert.equal(totales[11].periodo_fin, '2027-01-01')
  for (let i = 1; i < totales.length; i++) {
    assert.equal(totales[i].periodo_inicio, totales[i - 1].periodo_fin, 'hay un hueco entre dos meses')
  }
  // Cada total trae su apertura completa: la pantalla no tiene que adivinar qué rubros faltan.
  const deMarzo = filas.filter((f) => f.periodo_inicio === '2026-03-01' && f.nivel === 'rubro')
  assert.equal(deMarzo.length, RUBROS_DEL_CUADRO.length)
})

test('el saldo que la vista no publica entra NULL, nunca 0', () => {
  const [total] = filasDePeriodo([], { granularidad: 'semana', anio: 2026 })
  assert.equal(total.saldo_cierre, null, 'un 0 se leería como "cerró el período sin plata"')
  assert.equal(total.nivel, 'total')
  const conSaldo = filasDePeriodo([], {
    granularidad: 'mes', anio: 2026, saldos: new Map([['2026-05-01', { inicio: 10, cierre: 25 }]]),
  }).find((f) => f.periodo_inicio === '2026-05-01' && f.nivel === 'total')
  assert.equal(conSaldo.saldo_cierre, 25)
})

test('ningún rubro lleva saldo: la base lo prohíbe y el mapeo no se lo manda', () => {
  const filas = filasDePeriodo([mov({ clave: 'a' })], {
    granularidad: 'mes', anio: 2026, saldos: new Map([['2026-03-01', { inicio: 1, cierre: 2 }]]),
  })
  for (const f of filas.filter((x) => x.nivel === 'rubro')) {
    assert.equal(f.saldo_inicio, null)
    assert.equal(f.saldo_cierre, null)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA ASIMETRÍA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el mes que proyecta la cuadrilla sin proyectar el material queda como hallazgo', () => {
  const libro = [
    // Un mes REAL con jornales y materiales: de acá sale el ratio observado.
    mov({ clave: 'j1', fecha: S(2026, 2, 10), signo: -1, importe: 10_000_000, rubro: 'Nómina · Jornales de obra', estado: 'REAL' }),
    mov({ clave: 'm1', fecha: S(2026, 2, 11), signo: -1, importe: 20_000_000, rubro: 'Materiales Civil', estado: 'REAL' }),
    // Noviembre: sólo cuadrilla proyectada. Ni material ni cobro.
    mov({ clave: 'j2', fecha: S(2026, 11, 10), signo: -1, importe: 8_000_000, rubro: 'Nómina · Jornales de obra', estado: 'PROYECTADO' }),
  ]
  const meses = filasDePeriodo(libro, { granularidad: 'mes', anio: 2026 })
  const hallazgos = filasDeAsimetria(meses)
  const sinMaterial = hallazgos.find((h) => h.tipo === 'obra-sin-material')
  assert.ok(sinMaterial, 'noviembre proyecta jornales y cero material: tiene que salir')
  assert.equal(sinMaterial.periodo_inicio, '2026-11-01')
  assert.equal(sinMaterial.jornales, 8_000_000)
  // El ratio observado es 2 (20M de material por 10M de jornal): 8M × 2 = 16M estimados.
  assert.equal(sinMaterial.material_estimado, 16_000_000)
  assert.ok(hallazgos.some((h) => h.tipo === 'cobro-no-cubre-nomina' && h.periodo_inicio === '2026-11-01'))
})

test('sin meses reales no hay ratio: el faltante se declara null, no se inventa', () => {
  const libro = [mov({ clave: 'j', fecha: S(2026, 11, 10), signo: -1, importe: 8_000_000, rubro: 'Nómina · Jornales de obra', estado: 'PROYECTADO' })]
  const h = filasDeAsimetria(filasDePeriodo(libro, { granularidad: 'mes', anio: 2026 }))
    .find((x) => x.tipo === 'obra-sin-material')
  assert.equal(h.material_estimado, null, 'null es "no se pudo estimar" y no es lo mismo que 0')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA FIRMA Y LOS TOTALES DE CONTROL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la firma NO cambia si sólo cambia el orden de las filas', () => {
  // El generador escribe el libro ordenado por fecha; dos movimientos del mismo día pueden salir en
  // distinto orden entre dos corridas sin que haya cambiado un peso. Si la firma dependiera del
  // orden, cada corrida crearía una foto nueva de miles de filas y la tabla del detalle sería
  // inconsultable en un año.
  const a = filasDeMovimiento([mov({ clave: 'k1' }), mov({ clave: 'k2', importe: 2000 })])
  const b = filasDeMovimiento([mov({ clave: 'k2', importe: 2000 }), mov({ clave: 'k1' })])
  assert.equal(firmaDelLibro(a), firmaDelLibro(b))
})

test('la firma SÍ cambia cuando un movimiento pasa de PROYECTADO a REAL', () => {
  const antes = filasDeMovimiento([mov({ clave: 'k1', estado: 'PROYECTADO' })])
  const despues = filasDeMovimiento([mov({ clave: 'k1', estado: 'REAL' })])
  assert.notEqual(firmaDelLibro(antes), firmaDelLibro(despues))
  const otroImporte = filasDeMovimiento([mov({ clave: 'k1', estado: 'PROYECTADO', importe: 1001 })])
  assert.notEqual(firmaDelLibro(antes), firmaDelLibro(otroImporte))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA PODA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la poda se lleva el detalle de las corridas viejas y NUNCA el de la vigente', () => {
  // Medido en el ensayo del 02/09: una corrida son 1.235 filas de período más una por movimiento.
  // Sin poda, un año de corridas cada dos horas vuelve la tabla del detalle inconsultable.
  const corridas = Array.from({ length: 35 }, (_, i) => ({ id: `c${i}`, vigente: false }))
  const podar = corridasAPodar(corridas, { retener: 30 })
  assert.equal(podar.length, 5)
  assert.deepEqual(podar, ['c30', 'c31', 'c32', 'c33', 'c34'])
})

test('LA VIGENTE NO SE PODA NUNCA, aunque caiga fuera del corte de retención', () => {
  // Podarla dejaría la pantalla leyendo una corrida vigente sin una sola fila: vacía, sin error y
  // sin explicación. Es el peor modo de falla posible para una pantalla de analíticas.
  const corridas = Array.from({ length: 35 }, (_, i) => ({ id: `c${i}`, vigente: i === 33 }))
  const podar = corridasAPodar(corridas, { retener: 30 })
  assert.ok(!podar.includes('c33'), 'podó la corrida vigente')
  assert.equal(podar.length, 4)
})

test('con menos corridas que la retención no se poda nada', () => {
  assert.deepEqual(corridasAPodar([{ id: 'a' }, { id: 'b' }], { retener: 30 }), [])
  assert.deepEqual(corridasAPodar([], { retener: 30 }), [])
})

test('los totales de control se parten en real y pendiente, y los dos suman el neto', () => {
  const libro = [
    mov({ clave: 'a', signo: 1, importe: 5_000_000, estado: 'REAL', rubro: 'Cobranzas' }),
    mov({ clave: 'b', signo: -1, importe: 1_000_000, estado: 'REAL', rubro: 'Impuestos' }),
    mov({ clave: 'c', signo: -1, importe: 2_000_000, estado: 'COMPROMETIDO', rubro: 'Impuestos' }),
    mov({ clave: 'd', signo: -1, importe: 500_000, estado: 'VENCIDO', rubro: 'Impuestos' }),
  ]
  const r = resumenDeCorrida(libro)
  assert.equal(r.movimientos, 4)
  assert.equal(r.neto_real, 4_000_000)
  assert.equal(r.neto_pendiente, -2_500_000)
  assert.equal(r.neto, r.neto_real + r.neto_pendiente, 'los cuatro estados tienen que particionar el libro')
})
