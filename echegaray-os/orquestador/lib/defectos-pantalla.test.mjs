import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectar, resumen, FECHA_CERO } from './defectos-pantalla.mjs'

const cel = (valor, type) => ({ valor, formato: type ? { numberFormat: { type } } : null })
const hoja = (filas) => ({ filas, anchos: [] })

test('la fecha cero se caza: 30/12/99 no es un día, es "no hay fecha"', () => {
  // Un MINIFS sin coincidencias devuelve 0, y 0 con formato de fecha se lee como 1899.
  const d = detectar(hoja([[cel('Proveedor'), cel('30/12/99', 'DATE')]]))
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'fecha_cero')
  assert.ok(FECHA_CERO.test('30/12/1899'))
})

test('una nota metida en una columna de importes se ve como un dato', () => {
  const d = detectar(hoja([[cel('Resto'), cel('ninguno llega al 1% del total', 'CURRENCY')]]))
  assert.equal(d[0].tipo, 'texto_en_numero')
})

test('el guion del formato de número NO es texto pegado a mano', () => {
  // "—" es cómo el patrón muestra el cero. Marcarlo llenaría el control de ruido.
  assert.deepEqual(detectar(hoja([[cel('x'), cel('—', 'CURRENCY')]])), [])
})

test('un importe formateado no se confunde con texto', () => {
  assert.deepEqual(detectar(hoja([[cel('x'), cel('$1.234.567', 'CURRENCY')]])), [])
  assert.deepEqual(detectar(hoja([[cel('x'), cel('7 d', 'NUMBER')]])), [])
  assert.deepEqual(detectar(hoja([[cel('x'), cel('25/06/2026', 'DATE')]])), [])
})

test('una fecha mostrada como moneda sólo se caza si la columna tiene fechas', () => {
  // Sólo por el rango la señal es ruido: marcaba veintitrés importes legítimos del cash flow. Lo
  // que la vuelve concluyente es que la MISMA columna tenga celdas con formato de fecha.
  const conFechas = hoja([[cel('x'), cel('25/06/2026', 'DATE')], [cel('y'), cel('$46.198', 'CURRENCY')]])
  assert.equal(detectar(conFechas)[0].tipo, 'fecha_como_moneda')
  // La misma cifra en una columna de importes es un importe y no se marca.
  assert.deepEqual(detectar(hoja([[cel('x'), cel('$54.043', 'CURRENCY')]])), [])
})

test('una fecha VEINTE filas más abajo no convierte un importe en sospechoso', () => {
  // El layout de esta planilla apila varias tablas sobre las mismas columnas. Mirando la columna
  // entera, "$54.358" de Ferretería y consumibles se marcaba porque otra tabla, más abajo, tiene
  // fechas en esa misma columna. La vecindad es lo que define una tabla.
  const filas = [[cel('Ferretería'), cel('$54.358', 'CURRENCY')]]
  for (let i = 0; i < 25; i++) filas.push([cel('relleno')])
  filas.push([cel('otra tabla'), cel('25/06/2026', 'DATE')])
  assert.deepEqual(detectar(filas.length ? { filas, anchos: [] } : null, { huecoMax: 999 }), [])
})

test('un importe negativo NO es texto', () => {
  // El signo va ANTES del peso. La primera versión no lo contemplaba y generó 2.486 falsos
  // positivos: un control que grita por todo enseña a ignorarlo.
  for (const v of ['-$2.949.816', '$-1.234', '-$0', '$ 1.234,56', '-12,5%']) {
    assert.deepEqual(detectar(hoja([[cel('x'), cel(v, 'CURRENCY')]])), [], `${v} es un número`)
  }
})

test('un ratio con formato de porcentaje se caza', () => {
  const d = detectar(hoja([[cel('x'), cel('2083%', 'PERCENT')]]))
  assert.equal(d[0].tipo, 'porcentaje_fuera_de_escala')
  assert.deepEqual(detectar(hoja([[cel('x'), cel('12,5%', 'PERCENT')]])), [])
})

test('un CUIT sin formatear se caza', () => {
  const d = detectar(hoja([[cel('Hormiserv'), cel('30681641730', 'TEXT')]]))
  assert.equal(d[0].tipo, 'cuit_sin_formato')
})

test('las filas en blanco seguidas se reportan como un solo hueco', () => {
  const filas = [[cel('arriba')], [], [], [], [], [], [cel('abajo')]]
  const d = detectar(hoja(filas))
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'hueco')
  assert.equal(d[0].fila, 2)
  assert.match(d[0].valor, /5 filas/)
})

test('una fila en blanco entre bloques NO es un defecto', () => {
  // Separar dos bloques con una línea vacía es correcto; el problema son veintinueve.
  assert.deepEqual(detectar(hoja([[cel('a')], [], [cel('b')]])), [])
})

test('el resumen agrupa por tipo y ordena por cantidad', () => {
  const filas = [
    [cel('a'), cel('30/12/99', 'DATE')],
    [cel('b'), cel('30/12/99', 'DATE')],
    [cel('c'), cel('nota suelta', 'CURRENCY')],
  ]
  const r = resumen(detectar(hoja(filas)))
  assert.equal(r[0].tipo, 'fecha_cero')
  assert.equal(r[0].n, 2)
  assert.equal(r[1].n, 1)
})
