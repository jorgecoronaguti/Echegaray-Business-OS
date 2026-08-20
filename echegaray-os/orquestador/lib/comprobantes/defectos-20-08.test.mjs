// LOS TRES DEFECTOS DEL 20/08/2026 — la carga de 10 comprobantes que salió mal.
//
// El dueño mandó diez comprobantes por el chat. Los diez entraron a Compras. Igual salió mal:
//
//   1. Cuatro filas quedaron con `#VALUE!` en el saldo, y $903.538 de deuda dejaron de sumar.
//   2. El bot gritó que SEIS comprobantes «figuran cargados y NO están en Compras» — los seis
//      estaban, tres de ellos desde días antes.
//
// Los dos salen del mismo lugar: una escritura que manda `''` sobre una celda que no va a llenar, y
// un control que afirma la ausencia cuando lo que pasó es que no pudo mirar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { preservarNoVacias } from '../no-borrar.mjs'
import { conciliarRegistro } from './auditoria.mjs'
import { descalces, avisoDescalces } from './vigilancia.mjs'
import { rangosAEscribir } from '../../scripts/cargar-comprobantes-compras.mjs'

// ── 1 · LA GUARDA CONSERVA LA FÓRMULA, NO SU RENDERIZADO ────────────────────────────────────────

test('conservar una celda con fórmula NO puede aplanarla a su texto', () => {
  // Con la lectura formateada, el destino de `T` llegaba como «—» (el cero de la fórmula, pintado
  // por el formato de moneda) y ESO era lo que la guarda devolvía al pedido. La fórmula moría y la
  // celda de al lado —`=T-O`— pasaba a #VALUE!, porque «—» es texto.
  //
  // Leyendo con `render: 'FORMULA'` el destino llega como la fórmula misma, y conservarla es
  // conservarla de verdad. Este test fija el contrato de `preservarNoVacias` sobre ese insumo.
  const destino = [['=IF(F869="pago";O869;0)']]
  const nuevo = [['']]
  const r = preservarNoVacias(destino, nuevo)
  assert.equal(r.values[0][0], '=IF(F869="pago";O869;0)',
    'la guarda devolvió otra cosa que la fórmula: la celda queda aplanada')
  assert.equal(r.preservadas.length, 1)
})

test('y lo que NO es fórmula se sigue conservando igual', () => {
  assert.equal(preservarNoVacias([['Pagado']], [['']]).values[0][0], 'Pagado')
  // Un 0 es un dato: no se pisa ni se confunde con vacío.
  assert.equal(preservarNoVacias([[0]], [['']]).values[0][0], 0)
})

// ── 2 · NO SE NOMBRA UNA CELDA QUE NO SE VA A LLENAR ────────────────────────────────────────────

test('UNA COLUMNA QUE SÓLO ALGUNAS FILAS LLENAN NO ARRASTRA A LAS DEMÁS', () => {
  // El caso real: diez comprobantes, seis pagados. `T` (Monto Pagado) existía en seis de los diez, y
  // el pedido nombraba T869:T878 entero mandando '' en los cuatro no pagados — encima de la fórmula
  // que la plantilla tenía ahí.
  const plan = [
    { valores: { E: 'Corralon Progreso' } },                    // 869 · sin pago
    { valores: { E: 'Zabala Repuestos', T: 80000 } },           // 870 · pagado
    { valores: { E: 'Trielec', T: 9527707 } },                  // 871 · pagado
    { valores: { E: 'Movistar' } },                             // 872 · sin pago
  ]
  const data = rangosAEscribir(plan, { desde: 869 })
  const rangos = data.map((d) => d.range)
  assert.ok(rangos.includes('Compras!E869:E872'), 'la columna que todos llenan sigue yendo entera')
  assert.ok(rangos.includes('Compras!T870:T871'), 'el pago se escribe SÓLO donde hay pago')
  assert.ok(!rangos.some((r) => /^Compras!T869/.test(r)), 'volvió a nombrar una celda que no llena')
  // Y ninguna celda del pedido viaja vacía.
  for (const d of data) {
    for (const fila of d.values) {
      assert.notEqual(fila[0], '', `${d.range} manda una celda vacía`)
    }
  }
})

test('el 0 es un dato y se escribe; una corrida partida produce dos rangos', () => {
  const plan = [
    { valores: { T: 0 } }, { valores: {} }, { valores: { T: 5 } },
  ]
  const rangos = rangosAEscribir(plan, { desde: 10 }).map((d) => d.range)
  assert.deepEqual(rangos.sort(), ['Compras!T10:T10', 'Compras!T12:T12'])
})

// ── 3 · UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ» ──────────────────────────────────────────

const enPestana = (fila, proveedor, numero, total) => ({ fila, proveedor, numero, total })

test('SIN LOS IMPORTES DE LA PESTAÑA NO SE AFIRMA UN FALTANTE', () => {
  // Los seis del 20/08 emparejan sólo por `num:` —número + importe— porque el nombre de la celda no
  // es el del registro («Zabala Repuestos» contra «ZABALA REPUESTOS DE RAUL Y JOSE Y LUIS») y su
  // CUIT no está en ninguna fuente de nombres. Si la lectura no trae el importe, esa huella no se
  // puede construir del lado de la pestaña y los seis se ven como desaparecidos.
  const registro = [{ clave: 'c:1|0005-00045449', proveedor: 'ZABALA REPUESTOS DE RAUL Y JOSE Y LUIS', numero: '0005-00045449', total: 80000, fila: 870 }]
  const pestanaSinImportes = [enPestana(870, 'Zabala Repuestos', '0005-00045449', null)]

  const r = conciliarRegistro(registro, pestanaSinImportes)[0]
  assert.equal(r.estado, 'no_verificable',
    'volvió a declarar «no está» un comprobante que sí está, sólo porque no pudo leer el importe')

  // Y con los importes, el veredicto vuelve a ser el bueno: empareja por número.
  const conImportes = [enPestana(870, 'Zabala Repuestos', '0005-00045449', 80000)]
  const ok = conciliarRegistro(registro, conImportes)[0]
  assert.equal(ok.estado, 'ok')
  assert.equal(ok.por, 'num')
})

test('«no verificable» NO cuenta como plata perdida, y se dice aparte', () => {
  const d = descalces({ conciliado: [{ estado: 'no_verificable', proveedor: 'X', numero: '1', total: 80000 }] })
  assert.equal(d.sinGasto.length, 0, 'un no-veredicto entró en la bolsa de la plata')
  assert.equal(d.plata, 0)
  assert.equal(d.sinVeredicto.length, 1)

  const aviso = avisoDescalces(d)
  assert.ok(aviso, 'se calló: callarse es afirmar que el control corrió y dio limpio')
  assert.doesNotMatch(aviso, /sobrestimado|NO están en Compras/,
    'sigue usando el aviso más caro para algo que no pudo verificar')
  assert.match(aviso, /No pude verificar/)
})

test('un faltante de verdad SIGUE gritando', () => {
  // La red no puede volverse tan prudente que deje de avisar lo que sí es un agujero: el registro
  // bloquea recargarlo y el gasto no está en ninguna fila.
  const registro = [{ clave: 'c:1|0031-00002661', proveedor: 'Alumetal', numero: '0031-00002661', total: 1095076.13, fila: 840 }]
  const pestana = [enPestana(840, 'RSV', '11-079782', 67797.51)]
  const r = conciliarRegistro(registro, pestana)[0]
  assert.equal(r.estado, 'no_esta')
  const d = descalces({ conciliado: [r] })
  assert.equal(d.sinGasto.length, 1)
  assert.match(avisoDescalces(d), /NO están en Compras/)
})
