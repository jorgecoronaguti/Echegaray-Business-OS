import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limpiarCola, ultimaFilaConContenido, extenderConCola } from './cola-vieja.mjs'
import { VACIO, fusionar } from './preservar-anotaciones.mjs'

test('EL BLOQUE NUEVO MÁS CORTO QUE EL VIEJO: el sobrante se limpia, no sobrevive', () => {
  // EL DEFECTO (05/08, visto en el Sheet real). El bloque de ARCA pasó de 13 filas a 9 y las cuatro
  // que sobraban se quedaron escritas — incluida "· El resto — facturas cargadas por un IMPORTE
  // distinto…", la línea que se había eliminado justamente por afirmar algo falso, mostrando #VALUE!.
  const viejo = [
    ['3 · RESPALDO FISCAL'],
    ['Lo que esta pestaña lista', 5638835],
    ['· El resto — facturas cargadas por un IMPORTE distinto…', '#VALUE!'],
    ['ⓘ Facturas POSTERIORES a la ventana', 67797.51],
    ['#VALUE!'],
  ]
  const nuevo = [
    ['3 · RESPALDO FISCAL'],
    ['Lo que esta pestaña lista', 5638835],
  ]

  // ASÍ SE VEÍA EL DEFECTO: sin extender, la fusión conserva las filas de la corrida anterior.
  const conBug = fusionar(nuevo, viejo)
  assert.match(String(conBug[2]?.[0]), /El resto/, 'así se veía: el texto retirado seguía afirmando')
  assert.equal(String(conBug[2]?.[1]), '#VALUE!')

  // EL FIX: la grilla se extiende con filas MÍAS Y VACÍAS hasta cubrir el footprint anterior.
  const { filas, limpiadas } = limpiarCola(nuevo, ultimaFilaConContenido(viejo), 2)
  assert.equal(limpiadas, 3)
  assert.equal(filas.length, 5)
  const conFix = fusionar(filas, viejo)
  assert.equal(conFix[2][0], '', 'la línea del residuo se fue')
  assert.equal(conFix[3][0], '', 'y la de "posteriores a la ventana" también')
  assert.equal(conFix[4][0], '', 'y el #VALUE! suelto del final')
  assert.equal(conFix[1][0], 'Lo que esta pestaña lista', 'lo que el generador SÍ escribe, se escribe')
})

test('la cola se rellena con VACIO, no con cadena vacía — si no, la fusión la preserva', () => {
  // `''` significa "no es mi celda, preservala". Con `''` la cola sobreviviría igual y el arreglo
  // sería invisible: el test pasaría y la pestaña seguiría rota.
  const { filas } = limpiarCola([['a']], 3, 2)
  assert.equal(filas[1][0], VACIO)
  assert.notEqual(filas[1][0], '')
  assert.equal(filas[1].length, 2, 'la cola cubre el ancho del generador, no una sola columna')
})

test('si la grilla nueva es igual o más larga, no se toca nada', () => {
  const g = [['a'], ['b'], ['c']]
  assert.equal(limpiarCola(g, 3, 1).limpiadas, 0)
  assert.equal(limpiarCola(g, 2, 1).limpiadas, 0)
  assert.equal(limpiarCola(g, 0, 1).filas, g, 'devuelve la MISMA lista: no copia por copiar')
})

test('la última fila con contenido ignora las vacías y los espacios', () => {
  assert.equal(ultimaFilaConContenido([['a'], ['', '  '], ['b'], [], ['', '']]), 3)
  assert.equal(ultimaFilaConContenido([]), 0)
  assert.equal(ultimaFilaConContenido([['', null, undefined]]), 0)
  // Un 0 ES contenido: es un importe, no una celda vacía.
  assert.equal(ultimaFilaConContenido([['a'], [0]]), 2)
})

test('LA LECTURA FALLA CERRADO: si no se puede leer la pestaña, no se asume vacía', async () => {
  // Degradar a [] dejaría la cola sin limpiar y nadie se enteraría — el mismo patrón que ya rompió
  // Proveedores cuando un 429 se convirtió en un dato.
  const google = { readSheetValues: async () => { throw new Error('429') } }
  await assert.rejects(() => extenderConCola(google, 'id', 'X', [['a']], 3), /429/)
})

test('extenderConCola pide el rango con el ancho del generador', async () => {
  let pedido = ''
  const google = { readSheetValues: async (_id, r) => { pedido = r; return [['x'], ['y'], ['z']] } }
  const { limpiadas } = await extenderConCola(google, 'id', 'Recurrentes', [['a']], 29)
  assert.equal(pedido, "'Recurrentes'!A1:AC400")
  assert.equal(limpiadas, 2)
})
