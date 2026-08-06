// EL BLOQUE DE COBERTURA DEL CASH FLOW, VERIFICADO EN FRÍO. Sin red y sin escribir una celda.
//
// Lo que este test cuida no es el texto de una fórmula: es que los TOTALES del bloque apunten a los
// renglones que dicen apuntar. Ese vínculo estaba escrito como desplazamientos a mano desde la fila
// del total (`fFalta - 8`, `fFalta - 3`) y agregar dos renglones por instrumento los habría dejado
// señalando "ya contemplados" — publicando como faltante la plata que SÍ está cubierta, sin un solo
// error visible. Es el mismo defecto que ya rompió Estructura!$15.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, respaldos } from './cheques-cobertura-sheet.mjs'
import { MARCAS } from '../lib/cheques-cobertura.mjs'
// Ídem: la fila de arranque del registro sale de la geometría, no de un literal.
import { FILA_DATO0 } from '../lib/cheques-emitidos-geometria.mjs'

const S = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)

/** Un juego mínimo con las tres situaciones reales del registro del 05/08. */
const datos = () => ({
  enCompras: new Set(['38-25872']),
  filasCompras: [{ fila: 670, prov: 'DUPEC', total: 635020, fecha: S(2026, 7, 28) }],
  cheques: [
    { fila: 121, proveedor: 'Alumetal', monto: 16649000, comprobante: '0038-00025872', fecha: S(2026, 8, 5), debitado: 'No', marca: '' },
    { fila: 119, proveedor: 'DUPEC', monto: 635020, comprobante: '', fecha: S(2026, 8, 15), debitado: 'No', marca: '' },
    { fila: 118, proveedor: 'Con-Sec', monto: 1700000, comprobante: '', fecha: S(2026, 8, 24), debitado: 'No', marca: '' },
  ],
  tarjeta: [],
})

const construir = () => { const d = datos(); return grilla(d, respaldos(d)) }
/** La fila (1-based) del bloque cuyo rótulo matchea. */
const filaDe = (g, re) => g.filas.findIndex((f) => re.test(String(f?.[0] ?? ''))) + 1
const celda = (g, fila, col) => String(g.filas[fila - 1]?.[col] ?? '')

test('los totales del bloque apuntan a los renglones que nombran, no a un desplazamiento', () => {
  const g = construir()
  const faltaCh = filaDe(g, /FALTA la factura en Compras \(confirmado\)/)
  const faltaTj = filaDe(g, /FALTA la factura \(confirmado\)/)
  const sinNumCh = filaDe(g, /sin N° de comprobante — no se puede saber/)
  const sinNumTj = filaDe(g, /· sin N° de comprobante$/)
  const totalFalta = filaDe(g, /⇒ FALTA CARGAR, CONFIRMADO/)
  const totalSinNum = filaDe(g, /⇒ Sin poder verificar/)
  for (const f of [faltaCh, faltaTj, sinNumCh, sinNumTj, totalFalta, totalSinNum]) assert.ok(f > 0, 'falta un renglón del bloque')

  // Los #{n} son filas RELATIVAS al bloque; se traducen a la fila real recién al escribir.
  assert.equal(celda(g, totalFalta, 2), `=C#{${faltaCh}}+C#{${faltaTj}}`)
  assert.equal(celda(g, totalSinNum, 2), `=C#{${sinNumCh}}+C#{${sinNumTj}}`)
  assert.equal(celda(g, totalFalta, 1), `=B#{${faltaCh}}+B#{${faltaTj}}`)
})

test('el bloque publica los inferidos aparte y lo que el OS no miró todavía', () => {
  const g = construir()
  const inf = filaDe(g, /≈ atribuidos por proveedor \+ importe/)
  const sm = filaDe(g, /todavía SIN MARCAR por el OS/)
  const totalSm = filaDe(g, /⇒ Sin mirar todavía por el OS/)
  assert.ok(inf > 0 && sm > 0 && totalSm > 0)
  // Cuenta la marca de inferencia, no la de verificado: si contara el ✓, una inferencia se sumaría
  // como hecho en el mismo renglón que las facturas cruzadas por número.
  assert.match(celda(g, inf, 2), new RegExp(MARCAS.inferido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  // Y el de "sin marcar" mira la marca VACÍA y sólo los no debitados: un cheque ya debitado sin marca
  // no es un riesgo del piso, su plata ya salió y está dentro del saldo.
  assert.match(celda(g, sm, 2), new RegExp(`\\$M\\$${FILA_DATO0}:\\$M\\$400=""`))
  assert.match(celda(g, sm, 2), new RegExp(`UPPER\\('Cheques Emitidos'!\\$K\\$${FILA_DATO0}:\\$K\\$400\\)<>"SI"`))
})

test('cada renglón del reparto suma una vez: los cuatro estados son una partición', () => {
  const d = datos()
  const r = respaldos(d)
  const g = grilla(d, r)
  // DUPEC se infiere (una factura, mismo importe); Con-Sec no tiene con qué cruzarse; Alumetal sí
  // tiene número y está en Compras.
  assert.equal(g.ch.contemplados.length, 1)
  assert.equal(g.ch.inferidos.length, 1)
  assert.equal(g.ch.sin_numero_comprobante.length, 1)
  assert.equal(g.ch.falta_factura.length, 0)
  assert.equal(
    g.ch.monto_contemplado + g.ch.monto_inferido + g.ch.monto_sin_numero + g.ch.monto_falta_factura,
    g.ch.total, 'un cheque se cayó de la partición o se contó dos veces')
})

test('el detalle de lo NO cruzable llega con fila, proveedor y monto — un total no se puede accionar', () => {
  const d = datos()
  const r = respaldos(d)
  const hueco = r.cheques.sinRespaldo.concat(r.cheques.ambiguos)
  assert.equal(hueco.length, 1)
  assert.equal(hueco[0].fila, 118)
  assert.equal(hueco[0].proveedor, 'Con-Sec')
  assert.equal(hueco[0].monto, 1700000)
})
