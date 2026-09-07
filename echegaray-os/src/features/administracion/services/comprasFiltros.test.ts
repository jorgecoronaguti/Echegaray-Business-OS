import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aParams, criteriosDeURL, hayCriterios, LLAVE, numeroDe, opcionesDe, pasaCriterios, periodoDe,
  tramoVisible, type Criteriable, type Criterios,
} from './comprasFiltros.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//   · Un criterio contra una celda vacía que «pasa» → filtrar por obra devolvería las filas sin obra.
//   · `min=0` leído como «sin filtro» → en una pestaña con notas de crédito son dos listas distintas.
//   · La fecha comparada con `new Date` → UTC corre el día en Argentina y el 1° del mes se pierde.
//   · El importe filtrado con signo → una nota de crédito de −$500.000 no aparece en «desde $100.000».
//   · Un desplegable armado con constantes → ofrece valores que no matchean y esconde los que sí.
//   · Un criterio que pisa a otro → «DUPEC + agosto» tiene que ser las dos cosas, no la última.

const fila = (over: Partial<Criteriable> = {}): Criteriable => ({
  proveedor: 'DUPEC',
  obra_texto: 'San Francisco',
  categoria: 'B',
  estado: 'Pendiente',
  total: 250000,
  fecha: '2026-08-04',
  tramo_vencimiento: '2 · Vence esta semana',
  ...over,
})

test('sin criterios pasa todo', () => {
  assert.equal(pasaCriterios(fila(), {}), true)
  assert.equal(hayCriterios({}), false)
})

test('los criterios se COMBINAN: hace falta cumplirlos todos', () => {
  const c: Criterios = { proveedor: 'DUPEC', periodo: '2026-08' }
  assert.equal(pasaCriterios(fila(), c), true)
  assert.equal(pasaCriterios(fila({ fecha: '2026-07-04' }), c), false, 'el período manda aunque el proveedor coincida')
  assert.equal(pasaCriterios(fila({ proveedor: 'MASS CONSULTORA' }), c), false, 'el proveedor manda aunque el período coincida')
})

test('un criterio contra una celda vacía NO pasa', () => {
  assert.equal(pasaCriterios(fila({ obra_texto: null }), { obra: 'San Francisco' }), false)
  assert.equal(pasaCriterios(fila({ obra_texto: '  ' }), { obra: 'San Francisco' }), false)
  assert.equal(pasaCriterios(fila({ fecha: null }), { desde: '2026-01-01' }), false)
})

test('el texto se compara exacto, no por contenido', () => {
  assert.equal(pasaCriterios(fila({ obra_texto: 'San Francisco Sur' }), { obra: 'San Francisco' }), false)
  assert.equal(pasaCriterios(fila({ obra_texto: 'san francisco' }), { obra: 'San Francisco' }), true, 'las mayúsculas no cuentan')
})

test('las fechas se comparan como texto ISO, con los bordes incluidos', () => {
  assert.equal(pasaCriterios(fila({ fecha: '2026-08-01' }), { desde: '2026-08-01' }), true)
  assert.equal(pasaCriterios(fila({ fecha: '2026-08-31' }), { hasta: '2026-08-31' }), true)
  assert.equal(pasaCriterios(fila({ fecha: '2026-07-31' }), { desde: '2026-08-01' }), false)
  // La fecha llega de PostgREST como timestamp completo en algunas vistas: se recorta a 10.
  assert.equal(pasaCriterios(fila({ fecha: '2026-08-15T00:00:00Z' }), { desde: '2026-08-01', hasta: '2026-08-31' }), true)
})

test('el importe se filtra por valor absoluto: una nota de crédito es un movimiento de su tamaño', () => {
  assert.equal(pasaCriterios(fila({ total: -500000 }), { min: 100000 }), true)
  assert.equal(pasaCriterios(fila({ total: -50000 }), { min: 100000 }), false)
  assert.equal(pasaCriterios(fila({ total: 250000 }), { min: 100000, max: 300000 }), true)
  assert.equal(pasaCriterios(fila({ total: null }), { min: 0 }), false, 'sin importe no se puede juzgar')
})

test('min=0 es un filtro puesto, no la ausencia de filtro', () => {
  assert.equal(numeroDe('0'), 0)
  assert.equal(numeroDe(''), undefined)
  assert.equal(numeroDe('  '), undefined)
  assert.equal(numeroDe('no'), undefined)
  assert.equal(numeroDe('1.500.000,50'), 1500000.5, 'acepta el formato es-AR que el dueño tipea')
  assert.equal(hayCriterios({ min: 0 }), true)
})

test('el tramo de vencimiento pierde su prefijo de orden para mostrarse y para filtrar', () => {
  assert.equal(tramoVisible('1 · Vencido'), 'Vencido')
  assert.equal(tramoVisible('3 · 8 a 30 días'), '8 a 30 días')
  assert.equal(tramoVisible(null), '')
  assert.equal(pasaCriterios(fila(), { vencimiento: 'Vence esta semana' }), true)
  assert.equal(pasaCriterios(fila({ tramo_vencimiento: null }), { vencimiento: 'Vencido' }), false)
})

test('el período sale de la fecha y nunca se inventa', () => {
  assert.equal(periodoDe('2026-09-07'), '2026-09')
  assert.equal(periodoDe(null), '')
  assert.equal(periodoDe('sept-26'), '', 'un mes en texto no es una fecha ISO')
})

test('la URL va y vuelve sin perder ni agregar nada', () => {
  const c: Criterios = { proveedor: 'DUPEC', obra: 'MESSINA', min: 100000, periodo: '2026-08' }
  const params = aParams(c)
  assert.deepEqual(params, { [LLAVE.proveedor]: 'DUPEC', [LLAVE.obra]: 'MESSINA', [LLAVE.min]: '100000', [LLAVE.periodo]: '2026-08' })
  assert.deepEqual(criteriosDeURL(params), {
    proveedor: 'DUPEC', obra: 'MESSINA', min: 100000, periodo: '2026-08',
    categoria: undefined, estado: undefined, vencimiento: undefined, desde: undefined, hasta: undefined, max: undefined,
  })
})

test('un valor ilegible en la URL se ignora: no vacía la lista', () => {
  const c = criteriosDeURL({ [LLAVE.min]: 'ochenta', [LLAVE.proveedor]: '   ' })
  assert.equal(c.min, undefined)
  assert.equal(c.proveedor, undefined)
  assert.equal(hayCriterios(c), false)
})

test('los desplegables se arman con lo que la pestaña TIENE, y las anuladas no cuentan', () => {
  const filas = [
    fila({ proveedor: 'DUPEC', obra_texto: 'MESSINA', fecha: '2026-08-04', categoria: 'B', estado: 'Pendiente', tramo_vencimiento: '2 · Vence esta semana' }),
    fila({ proveedor: 'Combustibles Barcelo', obra_texto: 'San Francisco', fecha: '2026-09-01', categoria: 'N', estado: 'Pagado', tramo_vencimiento: '1 · Vencido' }),
    { ...fila({ proveedor: 'FANTASMA SRL', obra_texto: 'Obra Muerta' }), anulada: true } as Criteriable,
  ]
  const o = opcionesDe(filas)
  assert.deepEqual(o.proveedores, ['Combustibles Barcelo', 'DUPEC'])
  assert.equal(o.proveedores.includes('FANTASMA SRL'), false, 'una anulada no puebla el desplegable')
  assert.deepEqual(o.categorias, ['B', 'N'])
  assert.deepEqual(o.estados, ['Pagado', 'Pendiente'])
  assert.deepEqual(o.periodos, ['2026-09', '2026-08'], 'del más nuevo al más viejo')
  assert.deepEqual(o.vencimientos, ['Vencido', 'Vence esta semana'], 'por urgencia, que es el orden que ya escribió el Sheet')
})
