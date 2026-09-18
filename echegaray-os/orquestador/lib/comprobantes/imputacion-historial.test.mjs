// EL TIPO DE PAGO (COLUMNA Q) SE COMPLETA CON LAS ÚLTIMAS CARGAS DEL PROVEEDOR — Y QUEDA MARCADO.
//
// ═══ EL DEFECTO (dueño, 17/09/2026: «no está completando todas las columnas») ═══
//
// Medido sobre las 131 filas que cargó el bot entre el 18/08 y el 17/09: la columna «Tipo pago»
// llegó vacía en 88 y el dueño la tipeó a mano en 85. El papel casi nunca la dice, pero el
// proveedor sí: cinco cargas seguidas pagadas igual predicen la sexta en 51 de 53 casos (holdout
// temporal). Estos tests fijan la regla, sus bordes y que la celda quede DECLARADA como inferida.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ULTIMAS_PAGO, completarUno, perfilesDeCompras, perfilesDePago } from './imputacion-historial.mjs'
import { valoresInput } from '../carga-comprobantes.mjs'
import { colDelCargador, contratoContra } from './contrato-columnas.mjs'
import { COMPRAS_1809 } from './encabezado-vivo-compras.mjs'
import { comprasDelCargador } from './compras-leidas.mjs'
import { hojaDesdeBaO } from './compras-leidas.fixture.mjs'
import { indexarCompras } from './compras-vivas.mjs'
import { dimensionesInferidas } from './marca-origen.mjs'

/** Una historia de Compras EN ORDEN de fila: `pagos` es la columna Q de cada carga del proveedor. */
const historiaDe = (proveedor, pagos, extra = {}) =>
  pagos.map((p) => ({ proveedor, tipo_pago: p, obra_texto: 'MESSINA', unidad_negocio: 'Civil', concepto: 'x', ...extra }))

test('cinco cargas seguidas con la misma forma de pago → se completa Q y queda la vía «historial»', () => {
  const perfiles = perfilesDeCompras(historiaDe('Corralon Progreso', ['Echeq', 'Echeq', 'Echeq', 'Echeq', 'Echeq']))
  const c = { proveedor: 'Corralon Progreso', concepto: 'cemento', total: 100 }
  const { aplicado } = completarUno(c, perfiles)
  assert.equal(c.formaPago, 'Echeq')
  assert.equal(c.pagoVia, 'historial')
  assert.deepEqual(aplicado.pago, { n: 5, share: 1, ultimas: ULTIMAS_PAGO })
  assert.deepEqual(dimensionesInferidas(c).filter((d) => d === 'pago'), ['pago'])
})

test('con una sola distinta entre las últimas cinco NO se propone nada: unanimidad, no mayoría', () => {
  // Barcelo el 31/08 (fila 927): 129 de 152 en Efectivo, y esa vez fue Débito. Con mayoría se
  // habría escrito Efectivo. La regla mira las últimas cinco y exige que coincidan.
  const perfiles = perfilesDeCompras(historiaDe('Combustibles Barcelo', ['Efectivo', 'Efectivo', 'Débito', 'Efectivo', 'Efectivo']))
  const c = { proveedor: 'Combustibles Barcelo', concepto: 'gasoil', total: 100 }
  const { aplicado, sugerencia } = completarUno(c, perfiles)
  assert.equal(c.formaPago, undefined)
  assert.equal(aplicado.pago, undefined)
  assert.deepEqual(sugerencia.pago.ultimas, ['Efectivo', 'Efectivo', 'Débito', 'Efectivo', 'Efectivo'], 'lo que había viaja para poder ofrecerlo')
})

test('cuatro iguales no alcanzan: el umbral es ULTIMAS_PAGO y está declarado', () => {
  assert.equal(ULTIMAS_PAGO, 5)
  const perfiles = perfilesDeCompras(historiaDe('Dipot', ['Débito', 'Débito', 'Débito', 'Débito']))
  const c = { proveedor: 'Dipot', concepto: 'clavos', total: 10 }
  completarUno(c, perfiles)
  assert.equal(c.formaPago, undefined)
})

test('la recencia manda: lo anterior a las últimas cinco no vota', () => {
  const perfiles = perfilesDeCompras(historiaDe('Dipot', ['Cheque', 'Cheque', 'Débito', 'Débito', 'Débito', 'Débito', 'Débito']))
  const c = { proveedor: 'Dipot', concepto: 'clavos', total: 10 }
  completarUno(c, perfiles)
  assert.equal(c.formaPago, 'Débito')
  assert.equal(perfilesDePago(historiaDe('Dipot', ['Cheque', 'Cheque', 'Débito', 'Débito', 'Débito', 'Débito', 'Débito'])).dipot.n, 7)
})

test('el papel MANDA: una forma de pago leída del comprobante no se pisa ni se marca', () => {
  const perfiles = perfilesDeCompras(historiaDe('Corralon Progreso', ['Echeq', 'Echeq', 'Echeq', 'Echeq', 'Echeq']))
  const c = { proveedor: 'Corralon Progreso', concepto: 'cemento', total: 100, formaPago: 'Efectivo' }
  const { aplicado } = completarUno(c, perfiles)
  assert.equal(c.formaPago, 'Efectivo')
  assert.equal(c.pagoVia, undefined)
  assert.equal(aplicado.pago, undefined)
})

test('las filas sin Tipo pago no votan, y un proveedor sin historia de pago no recibe nada', () => {
  const h = [...historiaDe('AONA', ['Efectivo', '', 'Efectivo', null, 'Efectivo', 'Efectivo']), ...historiaDe('Nuevo SRL', [''])]
  const p = perfilesDePago(h)
  assert.equal(p.aona.n, 4)
  assert.equal(p.aona.sugerido, null)
  assert.equal(p['nuevo srl'], undefined)
})

test('el valor llega a la columna Q VIVA y el Concepto declara «[historial: pago]»', () => {
  const perfiles = perfilesDeCompras(historiaDe('Corralon Progreso', ['Echeq', 'Echeq', 'Echeq', 'Echeq', 'Echeq']))
  const c = { proveedor: 'Corralon Progreso', concepto: 'cemento', total: 121, iva: 21, fecha: '17/09/2026', obra: 'MESSINA', unidad: 'Civil', categoria: 'B' }
  completarUno(c, perfiles, { campoDetalle: 'detalle' })
  const v = valoresInput(c, colDelCargador(contratoContra(COMPRAS_1809)))
  assert.equal(v.Q, 'Echeq', 'Tipo pago es la Q con «Obra» insertada en L')
  assert.match(v.M, /\[historial: [^\]]*pago\]/, 'la celda no dice que la forma de pago se dedujo')
})

test('un valor de historial que NO está en el desplegable no llega a la celda: la validación sigue', () => {
  // Alguien pudo tipear «efectivo?» a mano cinco veces. El historial lo propone; `tipoPagoValido`
  // lo frena porque no es uno de los seis valores de Q. Celda vacía antes que celda en rojo.
  const perfiles = perfilesDeCompras(historiaDe('Raro', ['contado?', 'contado?', 'contado?', 'contado?', 'contado?']))
  const c = { proveedor: 'Raro', concepto: 'x', total: 10, fecha: '17/09/2026' }
  completarUno(c, perfiles)
  assert.equal(c.formaPago, 'contado?')
  const v = valoresInput(c, colDelCargador(contratoContra(COMPRAS_1809)))
  assert.equal(v.Q, undefined)
})

test('perfilesDeCompras conserva los perfiles de imputación y les suma el de pago — una sola puerta', () => {
  const p = perfilesDeCompras(historiaDe('Corralon Progreso', ['Echeq', 'Echeq', 'Echeq', 'Echeq', 'Echeq']))
  assert.ok(p.por_proveedor['corralon progreso'])
  assert.equal(p.pago['corralon progreso'].sugerido, 'Echeq')
})

test('la historia viva trae «Tipo pago» leído por RÓTULO, después de B..O y de «Obra»', () => {
  const fila = new Array(14).fill('')
  fila[3] = 'Corralon Progreso'; fila[6] = '0004-00000001'; fila[13] = 121
  const hoja = hojaDesdeBaO([fila, fila], COMPRAS_1809, { tipoPago: (i) => (i ? 'Echeq' : 'Cheque'), obraFila: () => 'OB-0007 · ME - GALPÓN' })
  const { filas } = comprasDelCargador(hoja)
  assert.equal(filas[0][14], 'OB-0007 · ME - GALPÓN')
  assert.equal(filas[0][15], 'Cheque')
  const { historia } = indexarCompras(filas)
  assert.deepEqual(historia.map((h) => h.tipo_pago), ['Cheque', 'Echeq'])
})
