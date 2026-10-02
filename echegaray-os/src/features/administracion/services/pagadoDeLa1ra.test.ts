// LOS MENSUALIZADOS SE LIQUIDAN POR MES, EN LA 2ª QUINCENA, Y SÓLO DESDE SEPTIEMBRE (dueño, 02/10/2026).
//
// «Recién en la q2 me tenés que poner los valores de los mensuales, poneme lo que dice el saldo bancario de q1 y en
// q2 que sea q1+q2» · «los cambios de los mensualizados son solamente desde sept». Cifras reales de Maldonado y
// Nievas (SELECT del 02/10): neto mensual 2.500.000 desde 2026-09-01; recibos Q1-09 705.532,04 y Q2-09 685.914,88;
// agosto Q1-08 663.526,08 y Q2-08 663.141,56.
//
// MUTACIONES que estos tests ponen en rojo:
//  - `seLiquidaEnLa2da` siempre false → «1ª quincena» (cobra, sueldo, recibo de pago y totales vuelven a ser el mes).
//  - `modalidadDeCobroAl` ignorando `desde ≤ hasta` → «agosto» (vuelven los dos recibos sumados).
//  - `pagoDelMensual` sin `pagadoEnLa1ra` → «lo pagado en la 1ª».

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { quincenaDe } from './quincena.ts'
import { armarCuadros, type DatosDeCuadros, type FilaRecibo } from './liquidacionCuadros.ts'
import { aplicarOverrides, type LineaConOverrides } from './liquidacionOverrides.ts'
import { estadoDeCierre } from './liquidacionCierre.ts'
import { pagoDelMensual, totalesDeMensuales } from './liquidacionPorTipo.ts'
import type { FilaDelEspejo } from './espejoDeJornales.ts'
import { armarRecibo, conceptosDisponibles, eleccionInicial, renglonesDeLosRecibos } from './reciboDeLaQuincena.ts'
import { MOTIVO_SE_LIQUIDA_EN_LA_2DA, modalidadDeCobroAl, pagadoDeLa1ra } from './recibosDelEstudio.ts'
import { leerPagadosDeLa1ra } from './pagadoDeLa1raService.ts'

const CUIL = '20359232668'
const rec = (periodo: string, neto: number): FilaRecibo => ({ cuil: CUIL, periodo, neto, fecha_pago: null } as unknown as FilaRecibo)
const SEPT = [rec('Q1-09/2026', 705532.04), rec('Q2-09/2026', 685914.88)]
const AGO = [rec('Q1-08/2026', 663526.08), rec('Q2-08/2026', 663141.56)]
const TARIFA = { persona_id: 'm', desde: '2026-09-01', valor_hora: null, neto_mensual: 2500000, origen: 'acuerdo:SUELDO_NETO_OFICINA' }

const datos = (dia: string, recibos: FilaRecibo[], extra: Partial<DatosDeCuadros> = {}): DatosDeCuadros => ({
  quincena: quincenaDe(dia),
  personas: [
    { id: 'm', nombre: 'Maldonado E.', nombreOrden: 'Maldonado', cuil: CUIL, enLaEmpresa: true, esJefe: true },
    { id: 'c', nombre: 'Castillo C.', nombreOrden: 'Castillo', cuil: '20222222222', enLaEmpresa: true },
  ],
  tarifas: [TARIFA, { persona_id: 'c', desde: '2026-01-01', valor_hora: 4000, neto_mensual: null, origen: 'sheet:_J_OBREROS' }],
  horas: new Map([['c', { horas: 90, horasEquivalentes: 90, extras: [], presentesSinHoras: 0 }]]) as unknown as DatosDeCuadros['horas'],
  recibos: [...recibos, { cuil: '20222222222', periodo: 'Q1-09/2026', neto: 243158.36, fecha_pago: null } as unknown as FilaRecibo],
  adelantos: [], redondeos: new Map(), ...extra,
})
const linea = (d: DatosDeCuadros, id = 'm'): LineaConOverrides => {
  const c = armarCuadros(d).find((x) => x.lineas.some((l) => l.personaId === id))!
  return aplicarOverrides(c.lineas.find((l) => l.personaId === id)!, {}, c.grupo, null, null, null)
}
const fila = (l: LineaConOverrides) => ({
  personaId: l.personaId, nombre: l.nombre, nombreOrden: l.nombre, esJefe: true, grupo: 'oficina', linea: l, cerrada: false, celdas: [],
}) as unknown as FilaDelEspejo

test('1ª quincena de septiembre: Banco = sólo el recibo de la 1ª; sin sueldo, efectivo, total ni saldo', () => {
  const l = linea(datos('2026-09-05', SEPT))
  assert.equal(l.seLiquidaEnLa2da, true)
  assert.equal(l.reciboNeto, 705532.04, 'el banco es el recibo de esa quincena, no la suma')
  assert.equal(l.cobra, null, 'el sueldo del mes es de la 2ª')
  const p = pagoDelMensual(l)
  assert.deepEqual([p.banco, p.sueldo, p.negro, p.saldoTotal, p.aPagarEfectivo], [705532.04, null, null, null, null])
  assert.deepEqual(renglonesDeLosRecibos(l), [], 'un solo recibo: sin sub-renglones')
})

test('1ª quincena: no entra en los totales a pagar ni traba el cierre', () => {
  const l = linea(datos('2026-09-05', SEPT))
  const t = totalesDeMensuales([fila(l)])
  assert.deepEqual([t.sueldo, t.banco, t.efectivo, t.saldoTotal, t.enLa2da], [0, 0, 0, 0, 1])
  const e = estadoDeCierre([l])
  assert.equal(e.puedeCerrar, true, e.pendientes.map((x) => x.texto).join(' · '))
})

test('1ª quincena: el recibo de pago no se arma (individual ni lote) y dice por qué', () => {
  const l = linea(datos('2026-09-05', SEPT))
  const papel = armarRecibo(l, { ...eleccionInicial(l, true), banco: true, efectivo: true }, String, true)
  assert.deepEqual([papel.medios.length, papel.horas.length, papel.total], [0, 0, null])
  assert.ok(Object.values(conceptosDisponibles(l, true)).every((m) => m === MOTIVO_SE_LIQUIDA_EN_LA_2DA))
})

test('2ª quincena: el mes entero — sueldo 2.500.000, banco 1ª + 2ª, efectivo el resto, dos sub-renglones', () => {
  const l = linea(datos('2026-09-20', SEPT))
  assert.equal(l.seLiquidaEnLa2da, undefined)
  const p = pagoDelMensual(l)
  assert.deepEqual([p.sueldo, p.banco, p.negro], [2500000, 1391446.92, 1108553.08])
  assert.deepEqual(renglonesDeLosRecibos(l).map((r) => [r.rotulo, r.importe]), [
    ['Recibo de sueldo 1ª quincena de septiembre', 705532.04],
    ['Recibo de sueldo 2ª quincena de septiembre', 685914.88],
  ])
  // El recibo de pago: banco con sus dos sub-renglones; efectivo el redondeado del cuadro (regla vigente).
  const papel = armarRecibo(l, { ...eleccionInicial(l, true), banco: true, efectivo: true }, String, true)
  assert.deepEqual(papel.medios.map((m) => [m.rotulo, m.importe]), [
    ['Depósito en banco', 1391446.92],
    ['Recibo de sueldo 1ª quincena de septiembre', 705532.04],
    ['Recibo de sueldo 2ª quincena de septiembre', 685914.88],
    ['Efectivo', 1109000],
  ])
  // El panel: el que no llegó se dice «falta» (importe null), no se asume cero.
  const sinQ2 = linea(datos('2026-09-20', [SEPT[0]]))
  assert.deepEqual(renglonesDeLosRecibos(sinQ2).map((r) => [r.periodo, r.importe]), [['Q1-09/2026', 705532.04], ['Q2-09/2026', null]])
})

test('lo pagado en la 1ª cuenta en la 2ª una sola vez, y lo anotado en la 2ª no se pisa', () => {
  const l = { ...linea(datos('2026-09-20', SEPT)), pagadoBanco: 685914.88, pagadoEfectivo: 0 }
  const conLa1ra = { ...l, pagadoEnLa1ra: { banco: 705532.04, efectivo: 300000 } }
  const p = pagoDelMensual(conLa1ra)
  assert.equal(p.pagado, 1691446.92)
  assert.equal(p.saldoTotal, 808553.08)
  assert.equal(p.aPagarEfectivo, 808553.08)
  assert.equal(pagoDelMensual(l).saldoTotal, 1814085.12, 'sin lo de la 1ª, sólo descuenta lo anotado en la 2ª')
  // La regla pura: lo registrado manda; 0 anotado no tapa un giro; nada → null.
  assert.deepEqual(pagadoDeLa1ra({ registradoBanco: 0, registradoEfectivo: null, giradoEnLa1ra: 705532.04 }), { banco: 705532.04, efectivo: 0 })
  assert.deepEqual(pagadoDeLa1ra({ registradoBanco: 500000, registradoEfectivo: 100, giradoEnLa1ra: 705532.04 }), { banco: 500000, efectivo: 100 })
  assert.equal(pagadoDeLa1ra({ registradoBanco: null, registradoEfectivo: null, giradoEnLa1ra: 0 }), null)
})

function falso(tablas: Record<string, unknown[]>): SupabaseClient {
  return { from: (t: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte']) q[m] = () => q
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tablas[t] ?? [], error: null }).then(ok)
    return q
  } } as unknown as SupabaseClient
}

test('la lectura de la 1ª: sólo a quien es mensual en las dos quincenas, y no en la 1ª misma', async () => {
  const sb = falso({
    liquidacion_quincena: [{ grupo: 'oficina', liquidacion_linea: [
      { persona_id: 'm', pagado_banco: null, pagado_efectivo: '300000' }, { persona_id: 'c', pagado_banco: 1, pagado_efectivo: 1 },
    ] }],
    nomina_adelanto: [{ cuil: CUIL, fecha: '2026-09-15', importe: 705532.04, concepto: 'QUINCENA' }],
  })
  const personas = [{ id: 'm', cuil: CUIL }, { id: 'c', cuil: '20222222222' }]
  const r = await leerPagadosDeLa1ra(sb, quincenaDe('2026-09-20'), personas, datos('2026-09-20', SEPT).tarifas)
  assert.deepEqual([...r.porPersona.entries()], [['m', { banco: 705532.04, efectivo: 300000 }]])
  assert.equal((await leerPagadosDeLa1ra(sb, quincenaDe('2026-09-05'), personas, datos('2026-09-05', SEPT).tarifas)).porPersona.size, 0)
  assert.equal((await leerPagadosDeLa1ra(sb, quincenaDe('2026-08-20'), personas, datos('2026-08-20', AGO).tarifas)).porPersona.size, 0)
})

test('agosto: el mismo jefe sin tarifa mensual vigente no suma recibos ni deja de liquidar la 1ª', () => {
  assert.equal(modalidadDeCobroAl([{ desde: '2026-09-01', netoMensual: 2500000 }], '2026-08-15'), 'quincenal')
  assert.equal(modalidadDeCobroAl([{ desde: '2026-09-01', netoMensual: 2500000 }], '2026-09-15'), 'mensual')
  const q1 = linea(datos('2026-08-05', AGO))
  assert.equal(q1.seLiquidaEnLa2da, undefined)
  assert.equal(q1.reciboNeto, 663526.08, 'sólo el de la 1ª de agosto, no 1.326.667,64')
  assert.deepEqual(renglonesDeLosRecibos(q1), [], 'el panel de agosto no muestra los dos recibos')
  assert.equal(linea(datos('2026-08-20', AGO)).reciboNeto, 663141.56)
})

test('quincenal intacto: Castillo con su recibo de la quincena y sin sub-renglones', () => {
  const giro = [{ cuil: '20222222222', fecha: '2026-09-15', importe: 243158.36, concepto: 'QUINCENA' }]
  const c = linea(datos('2026-09-05', SEPT, { adelantos: giro } as Partial<DatosDeCuadros>), 'c')
  assert.equal(c.seLiquidaEnLa2da, undefined)
  assert.equal(c.reciboNeto, 243158.36)
  assert.deepEqual(renglonesDeLosRecibos(c), [])
  const papel = armarRecibo(c, { ...eleccionInicial(c), banco: true }, String)
  assert.equal(papel.medios.find((m) => !m.sub && m.rotulo === 'Depósito en banco')?.importe, 243158.36)
  assert.equal(papel.medios.filter((m) => m.sub).length, 0)
})
