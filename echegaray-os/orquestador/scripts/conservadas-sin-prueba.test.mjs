// EL INVENTARIO DE LO CONSERVADO SIN PRUEBA, VERIFICADO EN FRÍO.
//
// Lo que este test cuida no es el formato del informe: es que NO diga "✔ mía" sobre una celda del
// dueño. Un reporte que se equivoca en esa dirección es peor que no tener reporte, porque la persona
// borra con confianza. En la dirección contraria —decir "mirar" sobre algo que sí es del OS— sólo
// cuesta una mirada, y ése es el lado en el que este script tiene que equivocarse.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, footprint } from './conservadas-sin-prueba.mjs'
import { huellasDeEscritura, claveCelda } from '../lib/huella-celda.mjs'

/** El mapa como lo devuelve `leerHuellas`, a partir de lo que el OS dejó escrito. */
const huellasDe = (grid, { borradas = [] } = {}) =>
  new Map(huellasDeEscritura(grid).map((h) => [
    claveCelda(h.fila, h.col),
    { forma: h.forma, huella: h.huella, borrada: borradas.includes(claveCelda(h.fila, h.col)) },
  ]))

const ESCRITO = [
  ['POSICIÓN DE CAJA', 'al 05/08'],
  ['Efectivo en pesos', '$ 1.000,00'],
]

test('lo que el OS escribió y sigue igual se prueba mío', () => {
  const h = huellasDe(ESCRITO)
  const { mias, sinPrueba } = clasificar(ESCRITO, h, footprint(h))
  assert.equal(mias.length, 4)
  assert.deepEqual(sinPrueba, [])
})

test('una celda sin ninguna huella NUNCA se declara mía, aunque esté en el medio del cuadro', () => {
  const h = huellasDe(ESCRITO)
  const hoy = [['POSICIÓN DE CAJA', 'al 05/08'], ['Efectivo en pesos', '$ 1.000,00'], ['AH7', '']]
  const { sinPrueba } = clasificar(hoy, h, { ancho: 2, filaFin: 2 })
  assert.equal(sinPrueba.length, 1)
  assert.equal(sinPrueba[0].ref, 'A3')
  assert.equal(sinPrueba[0].veredicto, 'ajena')
  // DEBAJO del rectángulo que el OS escribe: ningún generador la mira, ni para limpiarla ni para
  // pisarla. Es exactamente la familia de `Cash Flow Semanal!A106="AH7"`.
  assert.equal(sinPrueba[0].zona, 'debajo')
})

test('si el contenido cambió, la huella NO alcanza: alguien escribió arriba de lo mío', () => {
  const h = huellasDe(ESCRITO)
  const hoy = [['POSICIÓN DE CAJA', 'OJO: revisar con Jorge'], ['Efectivo en pesos', '$ 1.000,00']]
  const { mias, sinPrueba } = clasificar(hoy, h, footprint(h))
  assert.equal(mias.length, 3)
  assert.equal(sinPrueba.length, 1)
  assert.equal(sinPrueba[0].veredicto, 'cambiada')
  assert.equal(sinPrueba[0].zona, 'dentro')
})

test('una celda que el dueño vació y hoy tiene algo se marca "volvió", no "mía"', () => {
  // La huella lleva `borrada_en` cuando el dueño la vació. Si hoy tiene contenido, alguien la
  // repuso: puede haberla escrito él. Declararla mía sería recomendar borrar su trabajo.
  const clave = claveCelda(1, 1)
  const h = huellasDe(ESCRITO, { borradas: [clave] })
  const { mias, sinPrueba } = clasificar(ESCRITO, h, footprint(h))
  assert.equal(mias.length, 3)
  assert.deepEqual(sinPrueba.map((c) => [c.ref, c.veredicto]), [['B1', 'vaciada']])
})

test('una celda VACÍA no es residuo: no hay nada que decidir sobre ella', () => {
  const h = huellasDe(ESCRITO)
  const hoy = [['POSICIÓN DE CAJA', 'al 05/08'], ['', '']]
  const { mias, sinPrueba } = clasificar(hoy, h, footprint(h))
  assert.equal(mias.length, 2)
  assert.deepEqual(sinPrueba, [])
})

test('lo que está fuera del ancho que el OS escribe ni se mira: es la columna del dueño', () => {
  // El generador escribe A:B. Lo que la persona anota en la C no es asunto de este reporte, y
  // listarlo la invitaría a borrar su propia columna.
  const h = huellasDe(ESCRITO)
  const hoy = ESCRITO.map((f, i) => (i === 0 ? [...f, 'mi columna de notas'] : f))
  const { sinPrueba } = clasificar(hoy, h, footprint(h))
  assert.deepEqual(sinPrueba, [])
})

test('sin huellas no hay rectángulo, y el reporte tiene que poder decirlo', () => {
  const fp = footprint(new Map())
  assert.equal(fp.hay, false)
  assert.equal(fp.ancho, 0)
  // Con ancho 0 no se clasifica ni una celda: no se inventa un veredicto sobre lo que no se conoce.
  assert.deepEqual(clasificar(ESCRITO, new Map(), fp).sinPrueba, [])
})

test('lo que está ARRIBA del rectángulo del OS tampoco se lista: es la tabla del dueño', () => {
  // El caso de "Parámetros": el OS escribe sólo el bloque de inflación (73–96) y la tabla de
  // parámetros que el dueño mantiene a mano vive arriba. Midiendo desde la fila 1, este reporte le
  // proponía revisar 117 celdas suyas — una invitación a borrar su propia tabla.
  const h = new Map([[claveCelda(3, 0), { forma: 'ipc <n>', huella: 'x', borrada: false }]])
  const hoy = [['Horas por jornada'], ['9'], ['IPC 4,2']]
  const fp = footprint(h)
  assert.equal(fp.fila0, 3)
  const { sinPrueba } = clasificar(hoy, h, fp)
  assert.deepEqual(sinPrueba.map((c) => c.ref), [], 'las dos filas de arriba no son asunto del reporte')
})
