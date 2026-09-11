import test from 'node:test'
import assert from 'node:assert/strict'
import { deduplicar, plataColapsada, movimiento, SALE } from './libro-movimientos.mjs'
import { censoDeCompras, coberturaDeFuente, listaDeFilas } from './cobertura-archivo.mjs'

// EL DEFECTO QUE ATRAPA (auditoría del 10/09/2026, hallazgo #6: −$6.732.878).
//
// Quince filas de Compras chocan por la clave (CUIT · comprobante · signo) y la deduplicación se
// queda con UNA. Dos cosas fallaban a la vez:
//   1. la corrida del libro imprimía ocho colapsos SIN un peso y SIN ⚠ — la plata desaparecía muda;
//   2. el control de cobertura decía «15 fila(s)» y listaba DOCE, recortadas en silencio.

const compra = (fila, comprobante, importe) => movimiento({
  fecha: 46200 + fila, signo: SALE, importe, concepto: `compra ${fila}`,
  contraparte: 'INDUSTRIAS CASTELAR', cuit: '30612345678', comprobante,
  rubro: 'Materiales Civil', estado: 'REAL', origen: { pestana: 'Compras', fila },
})

test('la plata que se lleva un colapso se puede decir en un número, con su fila', () => {
  // La misma factura cargada en dos tramos (efectivo + echeq) y otra cargada dos veces.
  const { libro, colapsos } = deduplicar([
    compra(138, '00003-00012792', 2000000),
    compra(169, '00003-00012792', 3240300),
    compra(233, '00003-00012792', 1492578),
  ])
  assert.equal(libro.length, 1, 'la clave choca: queda una sola')
  const c = plataColapsada(colapsos)
  assert.equal(c.total, 3240300 + 1492578, 'lo que quedó afuera, al peso')
  assert.deepEqual(c.porOrigen, [{ pestana: 'Compras', filas: [169, 233], monto: 4732878 }])
})

test('sin colapsos no hay aviso: el control no grita por costumbre', () => {
  const { colapsos } = deduplicar([compra(76, '0001-00000001', 100), compra(77, '0001-00000002', 200)])
  assert.deepEqual(plataColapsada(colapsos), { total: 0, porOrigen: [] })
})

test('las filas de un hallazgo se listan TODAS — y si se recortan, se dice', () => {
  const quince = [76, 130, 138, 169, 233, 234, 240, 265, 278, 287, 633, 675, 700, 701, 702]
  assert.equal(listaDeFilas(quince), quince.join(', '), 'las quince, no las primeras doce')
  const cincuenta = Array.from({ length: 50 }, (_, i) => i + 1)
  assert.match(listaDeFilas(cincuenta, 40), /… y 10 más$/, 'el recorte se declara, no se disimula')
})

test('el censo de Compras sigue nombrando fila por fila el choque de clave', () => {
  // Dos filas con el MISMO comprobante y CUIT: una entra al libro, la otra queda como hueco con motivo.
  const c = { importe: 0, fechaCaja: 1, rubro: 2, proveedor: 3, comprobante: 4, cuit: 5, estado: 6, tipoPago: 7 }
  const filas = [[], [], [],
    [5000000, 46280, 'Materiales Civil', 'CASTELAR', '00003-00012792', '30612345678', 'Pagado', 'Efectivo'],
    [3240300, 46281, 'Materiales Civil', 'CASTELAR', '00003-00012792', '30612345678', 'Pagado', 'Echeq'],
  ]
  const renglones = censoDeCompras(filas, c, { fila0: 4 })
  assert.equal(renglones.length, 2)
  const cob = coberturaDeFuente({ pestana: 'Compras', renglones, cubiertas: new Set([4]) })
  assert.equal(cob.hueco, 3240300)
  const h = cob.porMotivoHueco[0]
  assert.match(h.clave, /la clave \(CUIT · comprobante · signo\) choca/)
  assert.deepEqual(h.filas, [5], 'la fila exacta, para poder ir a corregirla')
})
