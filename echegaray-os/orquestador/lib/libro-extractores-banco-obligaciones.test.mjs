import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deBancoObligaciones, dePrendarioFuturo, obligacionesDeCompras, explicadoPorCompras,
  RUBRO_FINANCIERO, PESTANA_PRENDARIO,
} from './libro-extractores-banco-obligaciones.mjs'
import { deCargasSociales, RUBRO_CARGAS, RUBRO_GREMIALES, RUBRO_PLANES } from './libro-extractores-cargas.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'
import { NAT } from './banco-santander.mjs'

const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))

// ═══ LOS DATOS SON LOS MEDIDOS EN EL EXTRACTO VIVO (11/09/2026) ═══
//
// Prendario: −1.275.316,65 (enero) · −1.281.778,17 (07/08) · −1.282.810,54 (septiembre). F931 de
// agosto: DDJJ $8.331.697,69, debitado el 07/09 por el mismo importe al centavo (_BANCO_RAW f560).
// Cuota de plan de ARCA conocida: $2.494.876 (filas 698/699 de Compras).
const debito = (iso, concepto, importe, naturaleza, fila) =>
  ({ fecha: S(iso), concepto, importe, naturaleza, fila })

const PRENDARIO = 'Prestamos prendarios - 0179-039101464204'
const DEBITOS = [
  debito('2026-08-07', PRENDARIO, 1281778.17, NAT.prendario, 540),
  debito('2026-09-07', PRENDARIO, 1282810.54, NAT.prendario, 561),
  debito('2026-09-07', 'Imp.afip 2686 5827', 8331697.69, NAT.afip, 560),
  debito('2026-09-16', 'Imp.afip 2686 5901', 2494876, NAT.afip, 570),
  debito('2026-09-03', 'Imp.afip 2686 5777', 4313550.12, NAT.afip, 551),
  debito('2026-09-04', 'Compra con tarjeta de debito - Dgr san juan', 318400, NAT.tarjetaDebito, 552),
]
/** Los doce meses de `CARGAS_MES_FECHAS`: la salida de caja del devengado es el 10 del mes siguiente. */
const FECHAS_CARGAS = ['', '', '', '', '', '', '', S('2026-09-10'), S('2026-10-10'), S('2026-11-10'), S('2026-12-10'), S('2027-01-10')]
/** `CARGAS_MES_F931_DECLARADO`: agosto (índice 7) declarado al centavo. */
const DECLARADO = ['', '', '', '', '', '', '', 8331697.69, '', '', '', '']

const ENC = ['Fecha', 'x', 'Fecha factura', 'y', 'Proveedor', 'CUIT (OS)', 'N° Comprobante', 'z', 'w',
  'Cliente / Asignación', 'Detalles / Obra', 'a', 'b', 'c', 'Total', 'Estado', 'Tipo pago',
  'Monto Pagado', 'Monto Parcial 2', 'Rubro de caja', 'Fecha de caja']
const I = Object.fromEntries(ENC.map((n, i) => [n, i]))
const fila = ({ prov, total, estado, rubro, fecha }) => {
  const f = Array(ENC.length).fill('')
  f[I.Proveedor] = prov; f[I.Total] = total; f[I.Estado] = estado
  f[I['Rubro de caja']] = rubro; f[I['Fecha de caja']] = fecha; f[I['Tipo pago']] = 'Transferencia'
  return f
}
const COMPRAS_VACIA = [[], [], ENC]
const planes = { cuota_conocida: 2494876 }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL PRENDARIO REAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('SIN FILA EN COMPRAS, la cuota del prendario entra al libro desde el extracto', () => {
  const r = deBancoObligaciones({ debitos: DEBITOS, compras: COMPRAS_VACIA, planes })
  const fin = r.movimientos.filter((m) => m.rubro === RUBRO_FINANCIERO)
  assert.equal(fin.length, 2, 'los dos débitos del prendario que el extracto muestra')
  assert.equal(fin.every((m) => m.estado === 'REAL'), true)
  assert.equal(fin.every((m) => m.instrumento === 'debito'), true)
  assert.equal(fin.every((m) => m.origen.pestana === '_BANCO_RAW'), true)
  assert.equal(fin.reduce((a, m) => a + m.importe, 0), 1281778.17 + 1282810.54)
})

test('CON LA FILA EN COMPRAS NO SE EMITE: durante la transición el REAL sale de Compras', () => {
  const compras = [[], [], ENC,
    fila({ prov: 'Santander', total: 1281778.17, estado: 'Pagado', rubro: RUBRO_FINANCIERO, fecha: S('2026-08-07') }),
  ]
  const r = deBancoObligaciones({ debitos: DEBITOS, compras, planes })
  const fin = r.movimientos.filter((m) => m.rubro === RUBRO_FINANCIERO)
  assert.equal(fin.length, 1, 'la cuota de agosto está en Compras: emitirla acá la contaría dos veces')
  assert.equal(fin[0].fecha, S('2026-09-07'))
  assert.match(r.avisos.join(' '), /ya lo lleva Compras f4/)
})

test('una fila de Compras ANULADA no tapa el débito: su plata quedó vacante', () => {
  const compras = [[], [], ENC,
    fila({ prov: 'Santander', total: 1281778.17, estado: 'ELIMINADO', rubro: RUBRO_FINANCIERO, fecha: S('2026-08-07') }),
  ]
  const r = deBancoObligaciones({ debitos: DEBITOS, compras, planes })
  assert.equal(r.movimientos.filter((m) => m.rubro === RUBRO_FINANCIERO).length, 2,
    'la fila marcada ELIMINADO ya no emite en deCompras: si tampoco emite el banco, la plata desaparece')
})

test('un débito ya reclamado por otro cruce no se emite dos veces', () => {
  const usados = new Set([540])
  const r = deBancoObligaciones({ debitos: DEBITOS, compras: COMPRAS_VACIA, usados, planes })
  assert.equal(r.movimientos.filter((m) => m.rubro === RUBRO_FINANCIERO).length, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL F931: EL APAREO CONTRA LA DDJJ DECLARADA, Y LA CADENA QUE YA NO LO VUELVE A EMITIR
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el débito de ARCA que coincide al centavo con la DDJJ es el pago de ESE F931', () => {
  const r = deBancoObligaciones({
    debitos: DEBITOS, compras: COMPRAS_VACIA, declaradoF931: DECLARADO, fechasCargas: FECHAS_CARGAS, planes,
  })
  const m = r.movimientos.filter((x) => x.rubro === RUBRO_CARGAS)
  assert.equal(m.length, 1)
  assert.equal(m[0].importe, 8331697.69)
  assert.equal(m[0].estado, 'REAL')
  assert.equal(m[0].contraparte, 'ARCA')
  assert.match(m[0].concepto, /2026-08/, 'el período devengado tiene que estar en el concepto')
  assert.deepEqual([...r.pagosF931.keys()], [`2026-08·${RUBRO_CARGAS}`])
})

test('LA CADENA NO RE-EMITE UN MES QUE EL BANCO PAGÓ, aunque Compras no tenga ninguna fila', () => {
  const r = deBancoObligaciones({
    debitos: DEBITOS, compras: COMPRAS_VACIA, declaradoF931: DECLARADO, fechasCargas: FECHAS_CARGAS, planes,
  })
  const cubiertos = []
  const cadena = deCargasSociales(
    { fechas: FECHAS_CARGAS, f931: ['', '', '', '', '', '', '', 8000000, '', '', '', ''], gremiales: [], declarado: DECLARADO },
    S('2026-09-30'),
    { pagosDelBanco: r.pagosF931, anotarCubierto: (c) => cubiertos.push(c), mesesPagados: new Set() },
  )
  assert.equal(cadena.filter((m) => m.rubro === RUBRO_CARGAS).length, 0,
    'el F931 de agosto lo pagó el banco: re-emitirlo publica $8,3M de deuda que ya salió de la cuenta')
  assert.deepEqual(cubiertos, [`2026-09·${RUBRO_CARGAS}`],
    'el mes de CAJA queda anotado como cubierto para que la fila plana de Compras tampoco entre')
})

test('si Compras todavía lleva el F931 del mes, el banco no lo emite', () => {
  const compras = [[], [], ENC,
    fila({ prov: 'ARCA', total: 8331697.69, estado: 'Pagado', rubro: RUBRO_CARGAS, fecha: S('2026-09-10') }),
  ]
  const r = deBancoObligaciones({
    debitos: DEBITOS, compras, declaradoF931: DECLARADO, fechasCargas: FECHAS_CARGAS, planes,
  })
  assert.equal(r.movimientos.filter((m) => m.rubro === RUBRO_CARGAS).length, 0)
  assert.equal(r.pagosF931.size, 0, 'sin emisión no hay apagado: la cadena sigue decidiendo por Compras')
  assert.match(r.avisos.join(' '), /ya lo lleva Compras/)
})

test('un débito de ARCA que NO coincide con ninguna DDJJ no se atribuye a nada', () => {
  const r = deBancoObligaciones({
    debitos: DEBITOS, compras: COMPRAS_VACIA, declaradoF931: DECLARADO, fechasCargas: FECHAS_CARGAS, planes,
  })
  assert.equal(r.movimientos.some((m) => m.importe === 4313550.12), false,
    'la naturaleza AFIP mezcla IVA, Ganancias y F931: emitirlo sin apareo duplicaría el IVA de su pestaña')
  assert.match(r.avisos.join(' '), /AFIP sin aparear/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// GREMIALES Y PLANES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('los gremiales REUSAN el apareo de cargas-pagos-banco y nacen con rubro propio', () => {
  const debitos = [debito('2026-09-10', 'Debin 30503049097', 994941.26, NAT.transferencias, 565)]
  const pagosGremiales = {
    porPeriodo: new Map([['2026-08', {
      periodo: '2026-08',
      detalle: [{ organismo: 'UOCRA', cubierto: 994941.26, fecha: S('2026-09-10'), filas: [565] }],
    }]]),
  }
  const r = deBancoObligaciones({ debitos, compras: COMPRAS_VACIA, pagosGremiales, planes })
  const g = r.movimientos.filter((m) => m.rubro === RUBRO_GREMIALES)
  assert.equal(g.length, 1)
  assert.equal(g[0].importe, 994941.26)
  assert.equal(g[0].estado, 'REAL')
  assert.match(g[0].concepto, /UOCRA · nómina de 2026-08/)
})

test('el gremial que Compras todavía lleva no se emite', () => {
  const debitos = [debito('2026-09-10', 'Debin 30503049097', 994941.26, NAT.transferencias, 565)]
  const pagosGremiales = {
    porPeriodo: new Map([['2026-08', {
      periodo: '2026-08',
      detalle: [{ organismo: 'UOCRA', cubierto: 994941.26, fecha: S('2026-09-10'), filas: [565] }],
    }]]),
  }
  const compras = [[], [], ENC,
    fila({ prov: 'UOCRA', total: 994941.26, estado: 'Pagado', rubro: RUBRO_GREMIALES, fecha: S('2026-09-10') }),
  ]
  const r = deBancoObligaciones({ debitos, compras, pagosGremiales, planes })
  assert.equal(r.movimientos.filter((m) => m.rubro === RUBRO_GREMIALES).length, 0)
})

test('la cuota de plan de ARCA se reconoce por su importe conocido', () => {
  const r = deBancoObligaciones({
    debitos: DEBITOS, compras: COMPRAS_VACIA, declaradoF931: DECLARADO, fechasCargas: FECHAS_CARGAS, planes,
  })
  const p = r.movimientos.filter((m) => m.rubro === RUBRO_PLANES)
  assert.equal(p.length, 1)
  assert.equal(p[0].importe, 2494876)
  assert.equal(p[0].estado, 'REAL')
})

test('SIN el archivo de planes no se inventa ninguna cuota', () => {
  const r = deBancoObligaciones({
    debitos: DEBITOS, compras: COMPRAS_VACIA, declaradoF931: DECLARADO, fechasCargas: FECHAS_CARGAS, planes: null,
  })
  assert.equal(r.movimientos.filter((m) => m.rubro === RUBRO_PLANES).length, 0)
})

test('DGR se nombra y no se emite: el IIBB ya sale de «Impuestos y Financieros»', () => {
  const r = deBancoObligaciones({ debitos: DEBITOS, compras: COMPRAS_VACIA, planes })
  assert.equal(r.movimientos.some((m) => m.importe === 318400), false)
  assert.match(r.avisos.join(' '), /DGR San Juan/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CUOTA FUTURA DEL PRENDARIO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const PLAN = {
  dia_de_debito: 7,
  ultima_cuota: { numero: 26, periodo: '2026-12' },
  contraparte: 'Banco Santander · préstamo prendario',
}

test('el futuro del prendario arranca el mes SIGUIENTE al último débito real y termina en la cuota 26', () => {
  const r = dePrendarioFuturo({ debitos: DEBITOS, plan: PLAN, compras: COMPRAS_VACIA })
  assert.equal(r.movimientos.length, 3, 'octubre, noviembre y diciembre: septiembre ya se debitó')
  assert.deepEqual(r.movimientos.map((m) => m.fecha), [S('2026-10-07'), S('2026-11-07'), S('2026-12-07')])
  assert.equal(r.movimientos.every((m) => m.estado === 'PROYECTADO'), true)
  assert.equal(r.movimientos.every((m) => m.rubro === RUBRO_FINANCIERO), true)
  assert.equal(r.movimientos.every((m) => m.origen.pestana === PESTANA_PRENDARIO), true)
})

test('LA CUOTA PROYECTADA ES EL ÚLTIMO DÉBITO REAL, no un número tipeado', () => {
  const r = dePrendarioFuturo({ debitos: DEBITOS, plan: PLAN, compras: COMPRAS_VACIA })
  assert.equal(r.movimientos.every((m) => m.importe === 1282810.54), true,
    'el préstamo ajusta: las tres cuotas de 2026 medidas son distintas entre sí')
})

test('cada cuota es un movimiento distinto: la clave no puede colapsar las tres', () => {
  const r = dePrendarioFuturo({ debitos: DEBITOS, plan: PLAN, compras: COMPRAS_VACIA })
  assert.equal(new Set(r.movimientos.map((m) => m.clave)).size, r.movimientos.length)
})

test('si Compras ya tiene la cuota pendiente de ese mes, no se proyecta encima', () => {
  const compras = [[], [], ENC,
    fila({ prov: 'Santander', total: 1290000, estado: 'Pendiente', rubro: RUBRO_FINANCIERO, fecha: S('2026-11-07') }),
  ]
  const r = dePrendarioFuturo({ debitos: DEBITOS, plan: PLAN, compras })
  assert.deepEqual(r.movimientos.map((m) => m.fecha), [S('2026-10-07'), S('2026-12-07')])
  assert.match(r.avisos.join(' '), /2026-11 ya está pendiente en Compras f4/)
})

test('SIN débito real en el extracto NO se proyecta nada: el importe no se inventa', () => {
  const r = dePrendarioFuturo({ debitos: [], plan: PLAN, compras: COMPRAS_VACIA })
  assert.deepEqual(r.movimientos, [])
  assert.match(r.avisos.join(' '), /no sé cuánto vale la cuota/)
})

test('sin el archivo de datos no hay cronograma y no se proyecta', () => {
  const r = dePrendarioFuturo({ debitos: DEBITOS, plan: null, compras: COMPRAS_VACIA })
  assert.deepEqual(r.movimientos, [])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS DOS NÚCLEOS DEL DEDUPE, PROBADOS SOLOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('obligacionesDeCompras: ni anuladas ni de otro rubro; pagadas y pendientes sí', () => {
  const compras = [[], [], ENC,
    fila({ prov: 'A', total: 100, estado: 'Pagado', rubro: RUBRO_FINANCIERO, fecha: S('2026-01-07') }),
    fila({ prov: 'B', total: 200, estado: 'Pendiente', rubro: RUBRO_FINANCIERO, fecha: S('2026-02-07') }),
    fila({ prov: 'C', total: 300, estado: 'ELIMINADO', rubro: RUBRO_FINANCIERO, fecha: S('2026-03-07') }),
    fila({ prov: 'D', total: 400, estado: 'Pagado', rubro: 'Materiales Civil', fecha: S('2026-04-07') }),
  ]
  const o = obligacionesDeCompras(compras, [RUBRO_FINANCIERO])
  assert.deepEqual(o.map((x) => x.total), [100, 200])
  assert.deepEqual(o.map((x) => x.pagada), [true, false])
})

test('explicadoPorCompras: el mismo importe en otro rubro NO explica el débito', () => {
  const d = debito('2026-08-07', PRENDARIO, 1281778.17, NAT.prendario, 540)
  const o = [{ fila: 9, rubro: RUBRO_CARGAS, fecha: S('2026-08-07'), total: 1281778.17, pagada: true }]
  assert.equal(explicadoPorCompras(d, RUBRO_FINANCIERO, o), null)
  assert.equal(explicadoPorCompras(d, RUBRO_CARGAS, o)?.fila, 9)
})

test('explicadoPorCompras: fuera de la ventana de 31 días tampoco explica', () => {
  const d = debito('2026-08-07', PRENDARIO, 1281778.17, NAT.prendario, 540)
  const lejos = [{ fila: 9, rubro: RUBRO_FINANCIERO, fecha: S('2026-06-01'), total: 1281778.17, pagada: true }]
  assert.equal(explicadoPorCompras(d, RUBRO_FINANCIERO, lejos), null)
})
