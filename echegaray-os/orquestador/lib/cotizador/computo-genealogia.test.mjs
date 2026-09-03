// LA GENEALOGÍA DE UNA CANTIDAD — las decisiones puras.
//
// Cada test de acá prueba un DEFECTO medido el 03/09/2026 sobre la base real, no una función:
// 110 partidas de `origen = 'os'` con 0 líneas de cómputo porque los tres caminos que fijan una
// cantidad a mano no pasaban por ningún emisor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORIGEN_COMPUTO, ORIGENES_MEDIDOS, ELEMENTO_CARGA_MANUAL,
  esCargaManual, lineaMedidaDePlano, lineaCargadaAMano, planDeComputoManual,
} from './computo-genealogia.mjs'

const LINEA_PLANO = {
  elemento: 'C1', nombre: 'Columna 40×20', cantidad: 3.5, unidad: 'm3',
  documento: 'Plano de Estructura.pdf', documentoId: '1AbC', lamina: 'E-01',
  criterio: '0.40 × 0.20 × 3.50 × 12', entradas: { a: 0.4, b: 0.2, h: 3.5, n: 12 },
  textoLiteral: 'C1 H=3.50m ... 0.40 0.20 ... 2 Ø 16', vista: 'planta de fundaciones',
}

test('la línea de plano lleva el documento, la lámina y la CITA LITERAL — es la cadena que se navega', () => {
  const f = lineaMedidaDePlano(LINEA_PLANO)
  assert.equal(f.origen, ORIGEN_COMPUTO.PLANO)
  assert.equal(f.documento_drive_id, '1AbC')
  assert.equal(f.documento_nombre, 'Plano de Estructura.pdf')
  assert.equal(f.sector, 'E-01')
  assert.equal(f.elemento, 'C1 — Columna 40×20')
  assert.match(f.criterio, /el plano dice «C1 H=3\.50m/)
  assert.match(f.criterio, /\(planta de fundaciones\)$/)
  // Las claves SON las columnas: los dos transportes insertan la fila sin volver a mapearla.
  assert.deepEqual(Object.keys(f).sort(), [
    'cantidad', 'criterio', 'documento_drive_id', 'documento_nombre', 'elemento', 'origen', 'revision', 'sector', 'unidad',
  ])
})

test('una cantidad en CERO no produce línea: el CHECK de la tabla exige cantidad <> 0', () => {
  assert.throws(() => lineaMedidaDePlano({ ...LINEA_PLANO, cantidad: 0 }), /cantidad <> 0/)
  assert.throws(() => lineaCargadaAMano({ cantidad: 0 }), /cantidad <> 0/)
  assert.throws(() => lineaCargadaAMano({ cantidad: null }), /cantidad <> 0/)
})

test('el descuento de vanos entra en NEGATIVO — es una línea legítima, no un error', () => {
  assert.equal(lineaMedidaDePlano({ ...LINEA_PLANO, cantidad: -12.5 }).cantidad, -12.5)
  assert.equal(lineaCargadaAMano({ cantidad: -12.5 }).cantidad, -12.5)
})

test('la línea tipeada NO finge un documento: documento_nombre queda en NULL', () => {
  // `computo_de_partida` cuenta documentos con `count(distinct documento_nombre)`. Un rótulo acá
  // publicaría «1 documento» para una partida que no tiene ninguno.
  const f = lineaCargadaAMano({ cantidad: 480, unidad: 'm2', donde: 'Presupuestos · edición inline' })
  assert.equal(f.documento_nombre, null)
  assert.equal(f.documento_drive_id, null)
  assert.equal(f.origen, ORIGEN_COMPUTO.ESTIMACION)
  assert.equal(f.elemento, ELEMENTO_CARGA_MANUAL)
  assert.match(f.criterio, /el número lo tipeó una persona/)
  assert.match(f.criterio, /cargada en Presupuestos · edición inline$/)
  assert.ok(esCargaManual(f))
})

test('`estimacion` NO cuenta como medida: es el único origen que no sostiene el número con nada', () => {
  assert.deepEqual([...ORIGENES_MEDIDOS], ['plano', 'relevamiento', 'importado'])
  assert.ok(!ORIGENES_MEDIDOS.includes(ORIGEN_COMPUTO.ESTIMACION))
})

test('una estimación CON criterio propio no es una carga manual y no se pisa', () => {
  const suya = { origen: 'estimacion', elemento: 'MURO EJE 3', criterio: '12 paños de 2,40 × 1,10' }
  assert.ok(!esCargaManual(suya))
})

test('partida SIN cómputo + cantidad tipeada ⇒ se INSERTA la línea (el defecto de las 110 partidas)', () => {
  const p = planDeComputoManual({ lineas: [], cantidad: 480, unidad: 'm2' })
  assert.equal(p.accion, 'insertar')
  assert.equal(p.fila.cantidad, 480)
  assert.equal(p.id, null)
  assert.deepEqual([...p.idsABorrar], [])
})

test('editar la cantidad ACTUALIZA la línea, no agrega otra — el cómputo no es un historial de tecleos', () => {
  const previa = { id: 'k1', ...lineaCargadaAMano({ cantidad: 480, unidad: 'm2' }) }
  const p = planDeComputoManual({ lineas: [previa], cantidad: 512, unidad: 'm2' })
  assert.equal(p.accion, 'actualizar')
  assert.equal(p.id, 'k1')
  assert.equal(p.fila.cantidad, 512)
  assert.deepEqual([...p.idsABorrar], [])
})

test('si quedaron varias líneas manuales, se conserva UNA y las demás se borran', () => {
  const l = (id) => ({ id, ...lineaCargadaAMano({ cantidad: 10 }) })
  const p = planDeComputoManual({ lineas: [l('k1'), l('k2'), l('k3')], cantidad: 12 })
  assert.equal(p.accion, 'actualizar')
  assert.equal(p.id, 'k1')
  assert.deepEqual([...p.idsABorrar], ['k2', 'k3'])
  assert.match(p.porQue, /sólo puede haber una/)
})

test('borrar la cantidad BORRA la línea: el cómputo no puede afirmar un número que la partida ya no declara', () => {
  const previa = { id: 'k1', ...lineaCargadaAMano({ cantidad: 480 }) }
  const p = planDeComputoManual({ lineas: [previa], cantidad: null })
  assert.equal(p.accion, 'borrar')
  assert.deepEqual([...p.idsABorrar], ['k1'])
  assert.match(p.porQue, /«sin cargar» no tiene genealogía/)
})

test('sin cantidad y sin línea previa no se hace nada — y se dice por qué', () => {
  const p = planDeComputoManual({ lineas: [], cantidad: null })
  assert.equal(p.accion, 'nada')
  assert.equal(p.fila, null)
  assert.ok(p.porQue)
})

test('LA REGLA QUE NO SE NEGOCIA: una partida con cómputo MEDIDO no la pisa una cantidad tipeada', () => {
  // La migración 20260821T4900 lo dice explícito: hay divergencias legítimas entre lo que declara la
  // partida y lo que suma su cómputo, y taparlas con un trigger las volvería invisibles.
  const medida = { id: 'k1', ...lineaMedidaDePlano(LINEA_PLANO) }
  for (const cantidad of [999, null, 0]) {
    const p = planDeComputoManual({ lineas: [medida], cantidad })
    assert.equal(p.accion, 'nada', `cantidad ${cantidad} no debería tocar una línea medida`)
    assert.match(p.porQue, /NO las pisa/)
  }
})

test('una línea manual conviviendo con una medida tampoco se toca', () => {
  const medida = { id: 'k1', ...lineaMedidaDePlano(LINEA_PLANO) }
  const manual = { id: 'k2', ...lineaCargadaAMano({ cantidad: 1 }) }
  const p = planDeComputoManual({ lineas: [medida, manual], cantidad: 7 })
  assert.equal(p.accion, 'nada')
})

test('una cantidad CERO con línea manual previa la borra: cero no es una medición', () => {
  const previa = { id: 'k1', ...lineaCargadaAMano({ cantidad: 480 }) }
  const p = planDeComputoManual({ lineas: [previa], cantidad: 0 })
  assert.equal(p.accion, 'borrar')
  assert.match(p.porQue, /cero no es una medición/)
})
