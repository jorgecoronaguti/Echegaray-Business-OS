import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPapeles, anclaDeOrden, type PapelCrudo } from './papelesCliente.ts'
import { PAPELES_MESSINA } from './papelesMessina.fixture.ts'
import {
  agruparRegistro, armarRegistro, estadoDeOC, filtrarRegistro, leerFiltro, periodosDe, totalDeOC,
  SIN_TRABAJO, type CobranzaConOrden,
} from './registroOrdenes.ts'

// EL REGISTRO DE ÓRDENES, CONTRA LOS DEFECTOS QUE YA SE MIDIERON EN LA BASE (13/09/2026).
// Cada caso nombra qué cifra saldría mal si la regla se revierte.

const HOY = '2026-09-13'

const oc = (id: string, numero: string, importe: number | null, obra: string | null = 'bsa', fecha = '2026-08-01'): PapelCrudo =>
  ({ id, tipo: 'orden_compra', numero, fecha, importe, moneda: 'ARS', obra_id: obra, nombre_archivo: `OC_${numero}.pdf` })

const fila = (p: Partial<CobranzaConOrden>): CobranzaConOrden => ({
  cobranza_id: p.fila ?? 'x', obra_id: 'bsa', imputacion: 'oc', fila: '1', categoria: 'B',
  fecha_emision: '2026-08-10', factura: 'FA', numero_comprobante: '3-200', concepto: null, orden_compra: null,
  monto_neto: 100, iva: 21, retenciones: null, total_bruto: 121, estado: null, esta_cobrada: false,
  esta_cancelada: false, esta_vencida: false, fecha_cobro: null, forma_cobro: null, orden_declarada: null, ...p,
})

const registro = (papeles: PapelCrudo[], cobranzas: CobranzaConOrden[] | null, netas: string[] = []) =>
  armarRegistro({ papeles: agruparPapeles(papeles), cobranzas, netas: new Set(netas), hoy: HOY })

test('lo facturado contra una OC es lo que la CITA, con IVA, y el saldo es monto − facturado', () => {
  const r = registro([oc('a', '00002-00002173', 242)], [
    fila({ fila: '70', orden_declarada: '2-2173', total_bruto: 121, esta_cobrada: true }),
    fila({ fila: '71', orden_declarada: '2-2173', total_bruto: 60 }),
    fila({ fila: '72', orden_declarada: '2-9999', total_bruto: 1000 }),
  ])
  const [o] = r.oc
  assert.equal(o.facturado, 181)
  assert.equal(o.cobrado, 121, 'cobrado es sólo lo que ya entró')
  assert.equal(o.saldo, 61)
  assert.equal(o.estado, 'parcial')
  assert.deepEqual(o.renglones.map((x) => x.fila), ['70', '71'])
})

test('una OC NETA se mide contra el neto facturado — ARCOR, que si no sale toda «facturado de más»', () => {
  // Medido el 13/09/2026: con el total con IVA, las 40 OC de ARCOR daban excedidas en un 21 %.
  const r = registro([oc('n', '53312775', 9_400_000)], [
    fila({ orden_declarada: '53312775', monto_neto: 9_400_000, total_bruto: 11_374_000 }),
  ], ['n'])
  assert.equal(r.oc[0].neto, true)
  assert.equal(r.oc[0].facturado, 9_400_000)
  assert.equal(r.oc[0].estado, 'facturada')
})

test('una fila anulada, una N y una B con emisión futura NO son facturado', () => {
  const r = registro([oc('a', '2-500', 1000)], [
    fila({ orden_declarada: '2-500', total_bruto: 100, esta_cancelada: true }),
    fila({ orden_declarada: '2-500', total_bruto: 200, categoria: 'N' }),
    fila({ orden_declarada: '2-500', total_bruto: 300, numero_comprobante: null, fecha_emision: '2026-10-01' }),
  ])
  const [o] = r.oc
  assert.equal(o.facturado, 0)
  assert.equal(o.enN, 200, 'la N se dice aparte: es otro circuito, no un faltante')
  assert.equal(o.aFacturar, 300, 'la B futura es un plan, se muestra como programado')
  assert.equal(o.renglones.length, 2, 'la anulada no se cita')
})

test('lo que no se ata a una OC con papel va a «sin imputar» entero, nunca repartido', () => {
  const r = registro([oc('a', '2-500', 1000)], [
    fila({ fila: '61', orden_declarada: '2-2135', total_bruto: 1_089_000 }),
    fila({ fila: '62', orden_declarada: null, total_bruto: 50 }),
    fila({ fila: '63', orden_declarada: null, total_bruto: 70, categoria: 'N' }),
  ])
  assert.equal(r.oc[0].facturado, 0, 'ninguna de las tres se le suma a la OC del mismo trabajo')
  assert.deepEqual(r.sinImputar.map((x) => x.fila), ['61', '62'], 'la N no tiene OC por definición')
  assert.deepEqual(r.ocSinPapel, ['2135'])
})

test('si Cobranzas no se pudo leer, ninguna OC dice «sin factura citada» ni publica saldo', () => {
  const r = registro([oc('a', '2-500', 1000)], null)
  assert.equal(r.oc[0].facturado, null)
  assert.equal(r.oc[0].saldo, null)
  assert.equal(r.oc[0].estado, 'sin-dato')
  assert.equal(r.cobranzasLeidas, false)
})

test('los estados, en sus bordes', () => {
  const e = (importe: number | null, facturado: number | null, moneda = 'ARS') => estadoDeOC({ importe, moneda, facturado })
  assert.equal(e(1000, 0), 'sin-facturar')
  assert.equal(e(1000, 999.5), 'facturada', 'hasta un peso es la misma cifra')
  assert.equal(e(1000, 998), 'parcial', 'dos pesos ya no: un 1,6 % real no se absorbe con tolerancia')
  assert.equal(e(1000, 1002), 'excedida')
  assert.equal(e(null, 10), 'sin-importe', 'un PDF sin importe no es una OC por cero')
  assert.equal(e(1000, 10, 'USD'), 'otra-moneda')
})

test('la OP: retención sin importe NO es cero, y el neto no se inventa', () => {
  const papeles: PapelCrudo[] = [
    { id: 'p', tipo: 'orden_pago', numero: '0000000004865', fecha: '2026-07-28', importe: 17_115_304.8, moneda: 'ARS', obra_id: null },
    { id: 'r', tipo: 'otro', numero: '0000000004865', fecha: '2026-07-28', importe: null, moneda: null, obra_id: null,
      nombre_archivo: 'O_P_0000000004865_G00002208.pdf' },
  ]
  const [op] = registro(papeles, []).op
  assert.equal(op.nRetenciones, 1)
  assert.equal(op.retenciones, null)
  assert.equal(op.neto, null)
  const conImporte = registro([papeles[0], { ...papeles[1], importe: 115_304.8 }], []).op[0]
  assert.equal(conImporte.neto, 17_000_000)
})

test('conciliación: la OP que cita una factura cobrada queda atada, y ese cobro deja de estar «sin OP»', () => {
  const papeles: PapelCrudo[] = [
    { id: 'p', tipo: 'orden_pago', numero: '1476', fecha: '2025-02-11', importe: 100, moneda: 'ARS', obra_id: null, cita: '3-179' },
    { id: 'f', tipo: 'factura', numero: '0003-00000179', fecha: '2025-02-01', importe: 100, moneda: 'ARS', obra_id: null, cita: '2-351' },
  ]
  const r = registro(papeles, [
    fila({ fila: '9', numero_comprobante: '0003-00000179', esta_cobrada: true }),
    fila({ fila: '10', numero_comprobante: '0003-00000180', esta_cobrada: true }),
  ])
  assert.equal(r.op[0].cobroAtado, true)
  assert.deepEqual(r.op[0].facturas, ['179'])
  assert.deepEqual(r.cobrosSinOP.map((x) => x.fila), ['10'])
})

test('Messina real: 12 OC y 12 OP — ningún certificado de retención ni factura nuestra cuenta como orden', () => {
  const r = registro(PAPELES_MESSINA, [])
  assert.equal(r.oc.length, agruparPapeles(PAPELES_MESSINA).oc.length)
  assert.equal(r.op.length, 12)
  assert.ok(r.op.every((o) => o.nRetenciones <= 1))
})

test('el total no mezcla neto con IVA ni suma lo que no tiene saldo', () => {
  const r = registro([oc('a', '2-1', 100), oc('b', '2-2', 200), oc('c', '2-3', null)], [])
  const t = totalDeOC(r.oc)
  assert.equal(t.importe, 300)
  assert.equal(t.incompleto, true, 'la OC sin importe se cuenta y marca el total')
  const mezcla = registro([oc('a', '2-1', 100), oc('b', '2-2', 200)], [], ['b'])
  assert.equal(totalDeOC(mezcla.oc).importe, null)
})

test('por trabajo: el adicional debajo de su obra mayor y lo sin trabajo al final', () => {
  const obras = [
    { obra_id: 'ad', nombre: 'Adicional', obra_padre_id: 'bsa' },
    { obra_id: 'bsa', nombre: 'BSA' },
    { obra_id: 'vacia', nombre: 'Sin órdenes' },
  ]
  const r = registro([oc('a', '2-1', 10, 'bsa'), oc('b', '2-2', 20, 'ad'), oc('c', '2-3', 30, null)], [])
  const grupos = agruparRegistro(r, obras)
  assert.deepEqual(grupos.map((g) => [g.clave, g.nivel]), [['bsa', 0], ['ad', 1], [SIN_TRABAJO, 0]])
  assert.equal(grupos[0].totalOC.importe, 10)
})

test('filtros: la obra mayor trae sus adicionales, y un valor de URL que no valida se ignora', () => {
  const obras = [{ obra_id: 'bsa', nombre: 'BSA' }, { obra_id: 'ad', nombre: 'Ad', obra_padre_id: 'bsa' }]
  const r = registro([oc('a', '2-1', 10, 'bsa', '2025-01-01'), oc('b', '2-2', 20, 'ad'), oc('c', '2-3', 30, 'otra')], [])
  assert.equal(filtrarRegistro(r, { obra: 'bsa', estado: null, periodo: null }, obras).oc.length, 2)
  assert.equal(filtrarRegistro(r, { obra: null, estado: null, periodo: '2025' }, obras).oc.length, 1)
  assert.deepEqual(periodosDe(r), ['2026', '2025'])
  assert.deepEqual(leerFiltro({ oobra: "x' or 1=1", oestado: 'inventado', operiodo: '26' }),
    { obra: null, estado: null, periodo: null })
  assert.deepEqual(leerFiltro({ oestado: 'parcial' }).estado, 'parcial')
})

test('el ancla de la fila es la misma que usa Documentos para llegar a ella', () => {
  const r = registro([oc('a', '00002-00002173', 1)], [])
  assert.equal(r.oc[0].ancla, anclaDeOrden(agruparPapeles([oc('a', '00002-00002173', 1)]).oc[0]))
  assert.equal(r.oc[0].ancla, 'oc-2-2173')
})
