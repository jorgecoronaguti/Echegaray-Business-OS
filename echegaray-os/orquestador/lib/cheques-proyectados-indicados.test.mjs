import test from 'node:test'
import assert from 'node:assert/strict'

import { deCompras, deChequesEmitidos } from './libro-extractores.mjs'
import { comprasPagadasConCheque } from './libro-extractores-compras.mjs'
import { cruzar, chequesDelRegistro } from './cruce-cheque-factura.mjs'
import { MARCAS } from './cheques-cobertura.mjs'

// ═══ EL CASO REAL DEL 10/09/2026 — LOS $2.560.965 QUE SE FUERON DE LA LÍNEA ═══
//
// Entre la corrida del 07/09 20:51 y la del 10/09, la línea «Cheques emitidos» proyectada de
// septiembre bajó de $9.174.406 a $6.613.441 sin contrapartida visible. La causa medida: los echeqs
// 378 y 379 (Machuca Cesar Hector, $444.465 + $2.116.500, vencen el 25/09) siguen VIVOS en «Cheques
// Emitidos», pero en el medio se cargó en Compras la factura 0002-00000343 que pagan. El cruce los
// empareja POR COMPROBANTE, así que `deChequesEmitidos` se aparta — y `deCompras` sólo partía la
// fila cuando iba a salir REAL. La de Machuca dice "Pagado", pero paga con echeq a fecha POSTERIOR
// al corte: `estadoDeEgreso` la deja COMPROMETIDA (pagar con cheque no es que la plata salió), así
// que no era REAL y no se partía. Salía entera con el rubro de la factura: la plata no se perdió;
// la línea de cheques del cuadro, sí.
const ENC_COMPRAS = ['Proveedor', 'CUIT (OS)', 'N° Comprobante', 'Total', 'Estado',
  'Tipo pago', 'Rubro de caja', 'Fecha de caja', 'Detalles / Obra', 'Estado pago', 'Monto Pagado',
  'Cliente / Asignación', 'Monto Parcial 2']
const COMP = '0002-00000343'
const VENCE = 46290 // 25/09/2026
const CORTE = 46274 // 09/09/2026

const comprasMachuca = () => [[], [], ENC_COMPRAS,
  ['Machuca Cesar Hector', '20-11111111-1', COMP, 2560965, 'Pagado', 'Echeq', 'Materiales Civil', VENCE, 'Planta'],
]
const ENC_CH = ['Tipo', 'Nro', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp',
  'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO', 'Unidad de Negocio', 'Estado en el OS']
const registroMachuca = () => [[], ENC_CH,
  ['ECHEQ', 379, 46260, '', 'Machuca Cesar Hector', 2116500, 'FA', COMP, VENCE, VENCE, 'No', 'Civil', MARCAS.falta],
  ['ECHEQ', 378, 46260, '', 'Machuca Cesar Hector', 444465, 'FA', COMP, VENCE, VENCE, 'No', 'Civil', MARCAS.falta],
]
const cruceMachuca = () => cruzar(
  chequesDelRegistro(registroMachuca(), { fila0: 3 }),
  comprasPagadasConCheque(comprasMachuca()),
)
const suma = (ms) => ms.reduce((a, m) => a + m.importe, 0)

test('EL DEFECTO: un cheque VIVO e INDICADO cuya fila de Compras no es REAL desaparecía de la línea', () => {
  const cruce = cruceMachuca()
  // El otro extractor se aparta de los dos: su plata tiene que salir por Compras.
  assert.equal(deChequesEmitidos(registroMachuca(), { fila0: 3, cruce }).length, 0)

  const ms = deCompras(comprasMachuca(), CORTE, { cruce })
  const cheques = ms.filter((m) => m.rubro === 'Cheques emitidos')
  assert.equal(cheques.length, 2, 'antes: 0 — la fila salía entera con el rubro de la factura')
  assert.equal(suma(cheques), 2560965, 'los $2.560.965 que la línea de septiembre había perdido')
  assert.ok(cheques.every((m) => m.fecha === VENCE), 'la plata sale cuando el cheque debita')
  assert.ok(cheques.every((m) => m.estado === 'COMPROMETIDO'))
})

test('NI UN PESO DE MÁS: partir la fila no la duplica, la reparte', () => {
  const ms = deCompras(comprasMachuca(), CORTE, { cruce: cruceMachuca() })
  assert.equal(suma(ms), 2560965, 'cuotas + resto = el pendiente de la fila')
  const claves = ms.map((m) => m.clave)
  assert.equal(new Set(claves).size, claves.length)
})

// ═══ LA REGLA DEL DUEÑO (10/09/2026): «si no están indicados, no» ═══
//
// Todo movimiento con rubro «Cheques emitidos» tiene que poder señalar la FILA del registro de
// «Cheques Emitidos» que lo avala: la propia (puerta de cheques) o la del cheque que cubre la cuota
// (puerta de Compras, `origen.fila` = "fila · cheque N"). Un cheque proyectado desde cualquier otra
// fuente —Compras marcada «Cheque» sin cheque emitido, la tarjeta, un promedio— no es un cheque
// indicado y no puede pesar en esa línea.
const anclaDe = (m) => (m.origen?.pestana === 'Cheques Emitidos'
  ? Number(m.origen.fila)
  : Number(String(m.origen?.fila ?? '').match(/cheque (\d+)$/)?.[1] ?? NaN))

test('LA REGLA: todo movimiento de la línea de cheques señala su fila del registro', () => {
  const cruce = cruceMachuca()
  const reg = registroMachuca()
  const filasDelRegistro = new Set([3, 4]) // las dos filas con importe de la fixture
  const ms = [...deCompras(comprasMachuca(), CORTE, { cruce }), ...deChequesEmitidos(reg, { fila0: 3, cruce })]
  const linea = ms.filter((m) => m.rubro === 'Cheques emitidos')
  assert.ok(linea.length > 0, 'sin movimientos la regla se cumpliría vacía y no probaría nada')
  for (const m of linea) {
    assert.ok(filasDelRegistro.has(anclaDe(m)),
      `proyecta un cheque que no está indicado: ${m.concepto} ${m.importe} (${JSON.stringify(m.origen)})`)
  }
})

test('LA REGLA PUEDE DAR ROJO: una fila de Compras «Cheque» SIN cheque emitido no entra a la línea', () => {
  // Sin cruce no hay cheque indicado que la avale: la fila sale con SU rubro, no con el de cheques.
  const ms = deCompras(comprasMachuca(), CORTE)
  assert.equal(ms.filter((m) => m.rubro === 'Cheques emitidos').length, 0)
  assert.equal(ms[0].rubro, 'Materiales Civil')
  assert.equal(suma(ms), 2560965, 'la obligación sigue estando: cambia la línea, no el total')
})
