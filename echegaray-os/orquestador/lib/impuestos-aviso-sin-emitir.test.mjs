// EL AVISO DE LAS VENTAS B SIN EMITIR QUE SUMAN IVA AL MES EN CURSO (25/09/2026).
//
// El caso real: el 25/09 el IVA de septiembre sumaba $3,45 M de tres filas de Messina (93, 96, 98) que
// no tenían factura en ARCA ni en el mail. Nada lo decía, y el dueño había pedido que lo que se iba a
// facturar en septiembre pasara a octubre. Estas pruebas evalúan la máscara del aviso con el evaluador
// en frío, sobre una Cobranzas modelada con esas filas, y comprueban que el aviso no escribe nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { COB_CON_OBRA } from './columnas-caja.fixture.mjs'
import { avisoVentasSinEmitirDelMes, mascaraVentasSinEmitir } from './impuestos-base-libro.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'
import { grilla } from '../scripts/impuestos-pestana.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const HOY = '2026-09-25'
const serial = (y, m, d) => Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)

/** Una fila de Cobranzas con la columna «Obra» insertada: B categoría · E comprobante · L IVA · Q factura · R cobro. */
const fila = (n, { cat = 'B', comp = '', iva, q, r }) => ({
  [`B${n}`]: cat, [`E${n}`]: comp, [`L${n}`]: iva, [`Q${n}`]: q, [`R${n}`]: r,
})
const COBRANZAS = {
  ...fila(5, { comp: '01-00000229', iva: 6825000, q: serial(2026, 9, 7), r: serial(2026, 9, 8) }), //  emitida: no avisa
  ...fila(6, { iva: 855334.56, q: serial(2026, 8, 31), r: serial(2026, 9, 30) }), //                 93: vencida, cobro en sep
  ...fila(7, { iva: 494393.63, q: serial(2026, 9, 14), r: serial(2026, 9, 29) }), //                96: factura en sep
  ...fila(8, { iva: 2100000, q: serial(2026, 9, 28), r: serial(2026, 10, 28) }), //                 98: factura en sep
  ...fila(9, { iva: 2109541.12, q: serial(2026, 10, 1), r: serial(2026, 10, 31) }), //              99: ya en octubre
  ...fila(10, { iva: 1116832.5, q: serial(2026, 8, 18), r: serial(2026, 11, 6) }), //               Quattropani: va a nov
  ...fila(11, { cat: 'N', iva: 0, q: serial(2026, 9, 10), r: serial(2026, 9, 10) }), //             negro: no factura
  ...fila(12, { iva: 100000, q: serial(2026, 7, 15), r: serial(2026, 8, 20) }), //                  vencida del todo: cae hoy
}

const medir = (hoja) => {
  const m = mascaraVentasSinEmitir({ hoy: HOY, cob: COB_CON_OBRA })
  const hojas = { Cobranzas: hoja }
  return {
    n: evaluarFormula(`=SUMPRODUCT(${m})`, { hojas }),
    iva: evaluarFormula(`=SUMPRODUCT((${m})*N(Cobranzas!$L$5:$L))`, { hojas }),
  }
}

test('cuenta las B sin número cuyo IVA cae en septiembre: las tres de Messina y la vencida del todo', () => {
  const { n, iva } = medir(COBRANZAS)
  assert.equal(n, 4)
  assert.equal(Math.round(iva * 100) / 100, 855334.56 + 494393.63 + 2100000 + 100000)
})

test('corridas a octubre, septiembre deja de avisar por ellas', () => {
  const movidas = { ...COBRANZAS, Q6: serial(2026, 10, 1), Q7: serial(2026, 10, 1), Q8: serial(2026, 10, 1) }
  assert.deepEqual(medir(movidas), { n: 1, iva: 100000 })
  const { Q12, R12, ...sinLaVieja } = movidas
  assert.deepEqual(medir({ ...sinLaVieja, Q12: serial(2026, 10, 1), R12: serial(2026, 10, 31) }), { n: 0, iva: 0 })
})

test('la emitida no avisa aunque su fecha esté en el mes: se le pone número y desaparece', () => {
  const conNumero = { ...COBRANZAS, E7: '01-00000231' }
  assert.equal(medir(conNumero).n, 3)
})

test('el aviso es una fórmula de texto: vacío sin casos, ▲ con el mes y el IVA, sin escribir nada en Cobranzas', () => {
  const f = avisoVentasSinEmitirDelMes({ hoy: HOY, cob: COB_CON_OBRA })
  assert.match(f, /^=LET\(n;SUMPRODUCT\(/)
  assert.match(f, /IF\(n=0;"";"▲ "/)
  assert.match(f, /" IVA sep-26"/)
  assert.ok(!f.replace(/"[^"]*"/g, '').includes(','), 'es-AR: fuera de las comillas el separador es «;»')
  assert.throws(() => avisoVentasSinEmitirDelMes({ cob: COB_CON_OBRA }), /falta `hoy`/)
})

test('la grilla lleva el aviso en la columna C de «⇒ Impuestos de septiembre», sin correr ninguna fila', () => {
  const g = grilla({
    anio: 2026, cob: COB_CON_OBRA, hoy: HOY,
    C: { total: 'O', concepto: 'L', fecha: 'AD', rubro: 'AB', fechaPrev: 'Q', detalle: 'K' },
    iibb: [1, 2, 3, 4, 5, 6].map((m) => ({ periodo: `2026-0${m}` })),
    ivaOficial: [1, 2, 3, 4, 5, 6].map((m) => ({
      periodo: `2026-0${m}`, debito: 1, credito: 1, a_pagar_efectivo: 0, libre_disp: 1e6,
      fecha_presentacion: '19/02/2026', nro_transaccion: '1',
    })),
    planes: [],
    proy: {
      meses: [9, 10, 11, 12], ultimoMesConDato: 8, libreDisp: 1, alicuotaVigente: 0.21,
      brutoDebito: (m) => [`BRUTO_DEB_${m}`], brutoCredito: (m) => [`BRUTO_CRE_${m}`], supuesto: 's',
    },
  })
  const fila = g.filas.find((f) => /^⇒ Impuestos de septiembre/.test(String(f[0])))
  assert.ok(fila, 'la fila del mes en curso existe')
  assert.equal(fila[2], avisoVentasSinEmitirDelMes({ hoy: HOY, cob: COB_CON_OBRA }))
  assert.equal(g.filas[2].every((c) => c === VACIO || c === ''), true, 'la fila 3 sigue en blanco')
})
