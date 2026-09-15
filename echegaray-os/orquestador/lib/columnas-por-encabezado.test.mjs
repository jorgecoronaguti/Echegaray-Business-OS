import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COBRANZAS, COMPRAS, columnasDe, lectorDeEncabezados, rangoAbierto, rangoHasta, ubicarColumna,
} from './columnas-por-encabezado.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA, COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'

const letras = (cols, claves) => claves.map((k) => cols[k]?.letra ?? null)

test('Compras ANTES de la inserción: las columnas del dueño en AC/AD/AE/AF/AJ, Total en O, sin Obra', () => {
  const c = columnasDe(COMPRAS_2508, COMPRAS, 'Compras')
  assert.deepEqual(letras(c, ['rubro', 'fechaCaja', 'familia', 'subRubro', 'comercial']), ['AC', 'AD', 'AE', 'AF', 'AJ'])
  assert.deepEqual(letras(c, ['total', 'concepto', 'detalle', 'proveedor', 'cuit']), ['O', 'L', 'K', 'E', 'AM'])
  assert.equal(c.obra, null)
  assert.equal(c.rubroFosil.letra, 'AB')
})

test('Compras DESPUÉS de insertar L «Obra»: todo lo de la derecha se corre una letra y lo de la izquierda no', () => {
  const c = columnasDe(COMPRAS_CON_OBRA, COMPRAS, 'Compras')
  assert.deepEqual(letras(c, ['rubro', 'fechaCaja', 'familia', 'subRubro', 'comercial']), ['AD', 'AE', 'AF', 'AG', 'AK'])
  assert.deepEqual(letras(c, ['total', 'concepto', 'detalle', 'proveedor', 'cuit', 'obra']), ['P', 'M', 'K', 'E', 'AN', 'L'])
})

test('Cobranzas antes y después de insertar H «Obra»', () => {
  const antes = columnasDe(COBRANZAS_1409, COBRANZAS, 'Cobranzas')
  assert.deepEqual(letras(antes, ['cliente', 'oc', 'total', 'formaCobro', 'estado', 'fechaCobro', 'moneda']),
    ['G', 'H', 'M', 'N', 'O', 'Q', 'AA'])
  const despues = columnasDe(COBRANZAS_CON_OBRA, COBRANZAS, 'Cobranzas')
  assert.deepEqual(letras(despues, ['cliente', 'obra', 'oc', 'total', 'formaCobro', 'estado', 'fechaCobro', 'moneda']),
    ['G', 'H', 'I', 'N', 'O', 'P', 'R', 'AB'])
})

test('un rótulo que falta es un error con su nombre — nunca una letra de respaldo', () => {
  const sinFecha = COMPRAS_2508.map((r) => (r === 'Fecha de caja' ? 'Fecha caja' : r))
  assert.throws(() => columnasDe(sinFecha, COMPRAS, 'Compras'), /falta la columna «Fecha de caja»/)
  assert.throws(() => ubicarColumna(['ID'], 'Total', 'Compras'), /No uso una letra de respaldo/)
})

test('un rótulo repetido se pide por ocurrencia; pedido como único, aborta', () => {
  assert.throws(() => ubicarColumna(COMPRAS_2508, 'Rubro de caja', 'Compras'), /aparece 2 veces/)
  assert.throws(() => ubicarColumna(COMPRAS_2508, { rotulo: 'Rubro de caja', ocurrencia: 3 }, 'Compras'), /hay 2/)
  assert.equal(ubicarColumna(COMPRAS_2508, { rotulo: 'Orden de pago (OS)', ocurrencia: 2 }, 'Compras').letra, 'AH')
  // «Total» no se confunde con «Total o Parcial», ni «Estado» con «Estado pago».
  assert.equal(ubicarColumna(COMPRAS_2508, 'Estado', 'Compras').letra, 'X')
})

test('los rangos que arman las fórmulas salen de la columna resuelta', () => {
  const antes = columnasDe(COMPRAS_2508, COMPRAS, 'Compras')
  const despues = columnasDe(COMPRAS_CON_OBRA, COMPRAS, 'Compras')
  assert.equal(rangoAbierto('Compras', antes.fechaCaja), 'Compras!$AD$4:$AD')
  assert.equal(rangoAbierto('Compras', despues.fechaCaja), 'Compras!$AE$4:$AE')
  const cob = columnasDe(COBRANZAS_CON_OBRA, COBRANZAS, 'Cobranzas')
  assert.equal(rangoHasta('Cobranzas', cob.total, 400), 'Cobranzas!$N$5:$N$400')
})

test('la fila de rótulos se lee UNA vez por corrida y por pestaña', async () => {
  const pedidos = []
  const google = { readSheetValues: async (id, rango) => { pedidos.push(rango); return [rango.startsWith('Compras') ? COMPRAS_CON_OBRA : COBRANZAS_1409] } }
  const l = lectorDeEncabezados(google, 'X')
  const [a, b] = await Promise.all([l.columnas('Compras'), l.columnas('Compras')])
  await l.columnas('Cobranzas')
  assert.equal(a.total.letra, 'P')
  assert.equal(b.obra.letra, 'L')
  assert.deepEqual(pedidos, ['Compras!A3:BZ3', 'Cobranzas!A4:BZ4'])
})
