// LOS SIETE CONTROLES, CADA UNO CON SU ROJO Y SU VERDE.
//
// Un control que no puede dar rojo no sirve: cada caso rojo es una MUTACIÓN de una fila sana — la falla de esta semana
// escrita en datos (la resta comida del efectivo, un recibo duplicado, un pago sin anotar) —, y el verde es la misma fila
// sin tocar. Las filas salen del pipeline real (`liquidarLinea` → `aplicarOverrides` → `conArrastre`), no de objetos a
// mano: un fixture que la pantalla no podría producir probaría otra cosa.
//
// La fila base imita a Zogbe en la Q2-09/2026 (SELECT del 03/10): 85 h, 40 h en el recibo, $/h 6.348, neto del recibo
// 41.414,70 → negro 45 h × 6.348 = 285.660.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liquidarLinea } from '../../src/features/administracion/services/liquidacionQuincena.ts'
import { aplicarOverrides } from '../../src/features/administracion/services/liquidacionOverrides.ts'
import { conArrastre } from '../../src/features/administracion/services/liquidacionArrastre.ts'
import { pagoDeLaLinea } from '../../src/features/administracion/services/pagoDeLaQuincena.ts'
import { SIN_HORAS } from '../../src/features/administracion/services/cuadroDeJornales.ts'
import {
  codigoDeSalida, controlarBase, controlarEfectivo, controlarEstudio, controlarExcedentes, controlarFilas,
  controlarGeneral, controlarQuincena, controlarRecibos, ensayarCierre, textoDelInforme, veredictosDeLaFila,
} from './liquidacion-control-reglas.mjs'
import { clienteDeLectura } from './liquidacion-control.mjs'

const Q = { desde: '2026-09-16', hasta: '2026-09-30' }
const CUIL = '20291086021'
const RESTA = { importe: 54580.48, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' }
const r2 = (n) => Math.round(n * 100) / 100

const blanco = (neto) => ({
  recibo: { personaId: 'p', cuil: CUIL, periodo: 'Q2-09/2026', categoria: 'AYUDANTE', valorHora: 6348, horasBlanco: 40,
    bruto: r2(neto / 0.8), neto, driveFileId: null },
  netoDeNomina: null, pisoCategoria: 6348, proporcion: null,
})

function linea({ overrides = {}, resta = false, neto = 41414.7 } = {}) {
  const base = liquidarLinea({
    personaId: 'p', nombre: 'Zogbe Leonardo', nombreOrden: 'Zogbe', horas: 85,
    tarifa: { valorHora: 6348, netoMensual: null, desde: '2026-09-01', origen: 'x' },
    adelanto: 0, yaTransferido: 0, reciboNeto: neto, giroEnElLote: false,
  }, 'obreros', null)
  const l = aplicarOverrides(base, overrides, 'obreros', null, blanco(neto), null)
  return resta ? conArrastre(l, RESTA) : l
}
const fila = (l) => ({ personaId: l.personaId, nombre: l.nombre, grupo: 'obreros', celdas: [], cotejo: { estado: 'coincide' }, horasPorTipo: SIN_HORAS, linea: l, cerrada: false })
const conPago = (l, cambio) => ({ ...l, pago: pagoDeLaLinea({ banco: l.pago.banco, negro: l.pago.negro, pagadoBanco: l.pago.pagadoBanco, pagadoEfectivo: l.pago.pagadoEfectivo, ...cambio }) })
/** EL DEFECTO DEL 02/10: la resta se sumaba al banco Y se restaba del efectivo. Total igual, efectivo de menos. */
const conArrastreViejo = (l) => ({
  ...l, enEfectivo: r2(l.enEfectivo - RESTA.importe), total: r2(l.total - RESTA.importe),
  pago: pagoDeLaLinea({ banco: l.pago.banco, negro: r2(l.pago.negro - RESTA.importe), pagadoBanco: 0, pagadoEfectivo: 0 }),
})

function ctx() {
  const informe = { controles: 0, porControl: {}, hallazgos: [], informados: [] }
  return {
    informe,
    control: (n) => { informe.controles++; informe.porControl[n] = (informe.porControl[n] ?? 0) + 1 },
    hallazgo: (control, persona, texto) => informe.hallazgos.push({ control, persona, texto }),
    informar: (control, persona, texto, tipo = 'a mano') => informe.informados.push({ control, persona, texto, tipo }),
  }
}

test('precondición: la fila base es la de Zogbe y las tres cuentas dicen «cierra»', () => {
  const l = linea({ resta: true })
  assert.equal(l.pago.negro, 285660)
  assert.equal(l.pago.banco, r2(41414.7 + RESTA.importe))
  assert.deepEqual(
    [veredictosDeLaFila(fila(l)).cierreDeLaFila, veredictosDeLaFila(fila(l)).fotoDelCierre, veredictosDeLaFila(fila(l)).totalGeneral],
    [true, true, true])
})

test('1 · fila: verde con la resta aplicada; rojo si el efectivo de la fila no da cobra + resta', () => {
  const sana = ctx()
  controlarFilas([fila(linea({ resta: true }))], sana)
  assert.equal(sana.informe.hallazgos.length, 0)
  assert.equal(sana.informe.porControl.fila, 1)

  const r = ctx()
  controlarFilas([fila(conPago(linea({ resta: true }), { negro: 285660 + 1000 }))], r)
  const textos = r.informe.hallazgos.map((h) => h.texto)
  assert.ok(textos.some((t) => /banco .* \+ efectivo 286\.660,00 .* ≠ cobra .* \+ resta 54\.580,48/.test(t)), textos.join('\n'))
  // `cierreDeLaFila` mira porBanco/enEfectivo/total (intactos) y las otras dos el pago: que DIFIERAN es el hallazgo.
  assert.ok(textos.some((t) => /las tres cuentas no coinciden: cierreDeLaFila cierra · fotoDelCierre no cierra · totalGeneral no cierra/.test(t)), textos.join('\n'))
})

test('1 · fila: el conArrastre viejo (resta comida del efectivo) no cierra en ninguna de las tres', () => {
  const r = ctx()
  controlarFilas([fila(conArrastreViejo(linea({ resta: true })))], r)
  assert.ok(r.informe.hallazgos.some((h) => /^no cierra: /.test(h.texto)), JSON.stringify(r.informe.hallazgos))
  assert.ok(!r.informe.hallazgos.some((h) => /no coinciden/.test(h.texto)))
})

test('2 · efectivo: valor hora × horas en negro; rojo con la resta restada, «a mano» con negro escrito', () => {
  const sana = ctx()
  controlarEfectivo([fila(linea({ resta: true }))], sana)
  assert.equal(sana.informe.hallazgos.length, 0)
  assert.equal(sana.informe.porControl.efectivo, 1)

  const r = ctx()
  controlarEfectivo([fila(conArrastreViejo(linea({ resta: true })))], r)
  assert.equal(r.informe.hallazgos.length, 1)
  assert.match(r.informe.hallazgos[0].texto,
    /^efectivo 231\.079,52 ≠ valor hora 6\.348,00 × 45 h = 285\.660,00 \(le restaron la resta del recibo anterior, 54\.580,48\)$/)

  const m = ctx()
  controlarEfectivo([fila(linea({ overrides: { negro: 300000 } }))], m)
  assert.equal(m.informe.hallazgos.length, 0, 'lo escrito a mano no es una falla')
  assert.equal(m.informe.informados.length, 1)
  assert.match(m.informe.informados[0].texto, /efectivo 300\.000,00 escrito a mano/)
})

test('3 · ensayo de cierre: verde con importe; rojo con una línea sin importe, y dice quién', () => {
  const sana = ctx()
  ensayarCierre([{ grupo: 'obreros', lineas: [linea({ resta: true })] }], new Set(), sana)
  assert.equal(sana.informe.hallazgos.length, 0)
  assert.equal(sana.informe.porControl.cierre, 1)

  const r = ctx()
  ensayarCierre([{ grupo: 'obreros', lineas: [linea(), { ...linea(), cobra: null }] }], new Set(), r)
  assert.equal(r.informe.hallazgos.length, 1)
  assert.match(r.informe.hallazgos[0].texto, /No cerré: Zogbe Leonardo no tiene importe calculado/)

  const cerrado = ctx()
  ensayarCierre([{ grupo: 'obreros', lineas: [{ ...linea(), cobra: null }] }], new Set(['obreros']), cerrado)
  assert.equal(cerrado.informe.controles, 0, 'un cuadro cerrado no se vuelve a cerrar')
})

test('4 · general: total − pagado − saldo = 0; rojo cuando el pago de una fila no da su total', () => {
  const sana = ctx()
  controlarGeneral([fila(linea({ resta: true })), fila({ ...linea(), personaId: 'q' })], sana)
  assert.equal(sana.informe.hallazgos.length, 0)
  assert.equal(sana.informe.porControl.general, 1)

  const r = ctx()
  controlarGeneral([fila(conPago(linea({ resta: true }), { negro: 285660 + 1000 }))], r)
  assert.equal(r.informe.hallazgos.length, 1)
  assert.match(r.informe.hallazgos[0].texto, /= -1\.000,00/)
})

const BASE = (pagos, lineas = [{ id: 'L1', persona_id: 'p', pagado_efectivo: 286000, adelanto_manual: null }]) => ({
  lineas, pagos, espejoAdelanto: new Map(), liquidaciones: new Set(['Q']), rps: [],
})

test('5a · base: pagado_efectivo = Σ de sus movimientos (caja + entrega); rojo si falta uno', () => {
  const nombres = new Map([['p', 'Zogbe Leonardo']])
  const sana = ctx()
  controlarBase(BASE([{ linea_id: 'L1', importe: 200000, origen: 'caja' }, { linea_id: 'L1', importe: 86000, origen: 'entrega' }]), nombres, sana)
  assert.equal(sana.informe.hallazgos.length, 0)

  const r = ctx()
  controlarBase(BASE([{ linea_id: 'L1', importe: 200000, origen: 'caja' }]), nombres, r)
  assert.deepEqual(r.informe.hallazgos.map((h) => h.texto), ['pagado efectivo 286.000,00 ≠ Σ liquidacion_pago_efectivo 200.000,00'])

  // SIN `pagado_efectivo` LO MOSTRADO ES EL ADELANTO (definición del trigger): uno sin movimiento es un hueco en la caja.
  const adelanto = ctx()
  controlarBase(BASE([], [{ id: 'L2', persona_id: 'p', pagado_efectivo: null, adelanto_manual: 50000 }]), nombres, adelanto)
  assert.equal(adelanto.informe.hallazgos.length, 1)
})

test('5b · excedente: cobró de más con la marca se informa; sin la marca es hallazgo', () => {
  const de_mas = linea({ overrides: { pagadoBanco: 189591.91, pagadoEfectivo: 286000 } })
  const marcado = ctx()
  controlarExcedentes([fila(de_mas)], marcado)
  assert.equal(marcado.informe.hallazgos.length, 0)
  assert.equal(marcado.informe.informados[0]?.tipo, 'marcado')

  const r = ctx()
  controlarExcedentes([fila({ ...de_mas, pago: { ...de_mas.pago, excedente: null } })], r)
  assert.equal(r.informe.hallazgos.length, 1)
  assert.match(r.informe.hallazgos[0].texto, /^cobró de más SIN la marca: pagó 475\.591,91/)

  const justo = ctx()
  controlarExcedentes([fila(linea({ overrides: { pagadoBanco: 41414.7, pagadoEfectivo: 285660 } }))], justo)
  assert.equal(justo.informe.hallazgos.length + justo.informe.informados.length, 0)
})

const CONCEPTO = 'Diferencia de pago en efectivo de la 2ª quincena de septiembre de 2026. Con este importe queda cubierto lo que no se había pagado en efectivo de esa quincena.'
const rp = (codigo, cambios = {}) => ({ codigo, persona_id: 'p', linea_id: 'L1', liquidacion_id: 'Q', concepto: CONCEPTO, importe: 16000, anulado_en: null, ...cambios })
const pagoDe = (codigo, importe = 16000) => ({ linea_id: 'L1', importe, origen: 'caja', nota: `recibo ${codigo}` })

test('6 · recibos: verde con línea y pago anotado; rojo sin linea_id, sin pago, con otro importe o duplicado', () => {
  const nombres = new Map([['p', 'Zogbe Leonardo']])
  const correr = (rps, pagos) => { const c = ctx(); controlarRecibos(rps, { ...BASE(pagos), rps }, Q, nombres, c); return c.informe }

  const sana = correr([rp('RP-000022'), rp('RP-000032', { anulado_en: '2026-10-02' })], [pagoDe('RP-000022')])
  assert.equal(sana.hallazgos.length, 0, 'el anulado no cuenta como duplicado')
  assert.equal(sana.porControl.recibos, 2)

  assert.match(correr([rp('RP-000022', { linea_id: null })], []).hallazgos[0].texto, /RP-000022 .* sin linea_id/)
  assert.match(correr([rp('RP-000022')], []).hallazgos[0].texto, /RP-000022 .* sin su pago en liquidacion_pago_efectivo/)
  assert.match(correr([rp('RP-000022')], [pagoDe('RP-000022', 15000)]).hallazgos[0].texto, /anotado como pago de 15\.000,00/)
  const dup = correr([rp('RP-000022'), rp('RP-000040')], [pagoDe('RP-000022'), pagoDe('RP-000040')])
  assert.deepEqual(dup.hallazgos.map((h) => h.texto), ['recibos duplicados por la misma diferencia: RP-000022 16.000,00, RP-000040 16.000,00'])
  // OTRA QUINCENA NO ENTRA: ni por la cabecera ni por el concepto.
  assert.equal(correr([rp('RP-1', { liquidacion_id: 'otra', concepto: 'Diferencia de pago en efectivo de la 1ª quincena de octubre de 2026.' })], []).controles, 0)
})

const ESTUDIO = [{ persona_id: 'p', cuil: CUIL, periodo: 'Q2-09/2026', neto: 41414.7 }]

test('7 · estudio: el caso real de Zogbe da los dos hallazgos, tal cual', () => {
  const c = ctx()
  const l = linea({ overrides: { pagadoBanco: 189591.91, pagadoEfectivo: 286000 } })
  controlarEstudio([fila(l)], Q, { estudio: ESTUDIO, nomina: [{ cuil: '20-29108602-1', periodo: 'Q2-09/2026', neto: 234963.32 }] }, c)
  assert.deepEqual(c.informe.hallazgos.map((h) => h.texto), [
    'Q2-09/2026: recibo_sueldo_linea neto 41.414,70 ≠ nomina_recibo_neto 234.963,32',
    'pagado banco 189.591,91 ≠ neto recibo 41.414,70',
  ])
})

test('7 · estudio: verde con banco = neto + resta; rojo si el banco perdió la resta; «a mano» con banco 0', () => {
  const nomina = [{ cuil: CUIL, periodo: 'Q2-09/2026', neto: 41414.7 }]
  const sana = ctx()
  controlarEstudio([fila(linea({ resta: true }))], Q, { estudio: ESTUDIO, nomina }, sana)
  assert.equal(sana.informe.hallazgos.length, 0)
  assert.deepEqual(sana.informe.porControl, { nomina: 1, estudio: 1 })

  const r = ctx()
  const sinResta = conPago(linea({ resta: true }), { banco: 41414.7 })
  controlarEstudio([fila(sinResta)], Q, { estudio: ESTUDIO, nomina }, r)
  assert.deepEqual(r.informe.hallazgos.map((h) => h.texto), ['banco del cuadro 41.414,70 ≠ neto recibo 41.414,70 + resta 54.580,48'])

  const m = ctx()
  controlarEstudio([fila(linea({ overrides: { porBanco: 0 } }))], Q, { estudio: ESTUDIO, nomina }, m)
  assert.equal(m.informe.hallazgos.length, 0)
  assert.match(m.informe.informados[0].texto, /^banco 0,00 escrito a mano; neto recibo 41\.414,70$/)

  const sinRecibo = ctx()
  controlarEstudio([fila(linea())], Q, { estudio: [], nomina: [] }, sinRecibo)
  assert.equal(sinRecibo.informe.controles, 0, 'sin recibo del período no hay contra qué comparar')
})

test('la quincena entera, el texto y el código de salida: 0 verde, 1 hallazgos, 2 no pude mirar', () => {
  const l = linea({ resta: true })
  const sana = controlarQuincena({
    quincena: Q, filas: [fila(l)], cuadros: [{ grupo: 'obreros', lineas: [l] }], cerrados: new Set(),
    base: { ...BASE([{ linea_id: 'L1', importe: 286000, origen: 'caja' }]), estudio: [], nomina: [] },
  })
  assert.equal(sana.hallazgos.length, 0)
  assert.equal(codigoDeSalida([sana], []), 0)
  assert.match(textoDelInforme([sana], []), /\d+ controles · 0 hallazgos$/)

  const roja = { ...sana, hallazgos: [{ control: 'estudio', persona: 'Zogbe Leonardo', texto: 'pagado banco 189.591,91 ≠ neto recibo 41.414,70' }] }
  assert.equal(codigoDeSalida([roja], []), 1)
  assert.match(textoDelInforme([roja], []), /^Q 16\/09 · Zogbe Leonardo · pagado banco 189\.591,91 ≠ neto recibo 41\.414,70$/m)

  assert.equal(codigoDeSalida([sana], ['Q 16/09 · liquidacion_linea: permission denied']), 2, 'no pude mirar nunca es verde')
  assert.equal(codigoDeSalida([], ['falta la clave']), 2)
})

test('el cliente no puede escribir: insert/update/upsert/delete y rpc no listadas lanzan; persona_legajo lee personas', async () => {
  const pedidas = []
  const builder = { select: () => 'leido', insert: () => 'ESCRIBIÓ', update: () => 'ESCRIBIÓ', upsert: () => 'ESCRIBIÓ', delete: () => 'ESCRIBIÓ' }
  const sb = clienteDeLectura({ from: (t) => { pedidas.push(t); return builder }, rpc: (fn) => `rpc ${fn}` })
  assert.equal(sb.from('liquidacion_linea').select('*'), 'leido')
  for (const k of ['insert', 'update', 'upsert', 'delete']) assert.throws(() => sb.from('liquidacion_linea')[k]({}), /sólo lectura/)
  assert.throws(() => sb.rpc('cerrar_quincena', {}), /rpc cerrar_quincena bloqueado/)
  assert.equal(sb.rpc('sesion_es_de_prueba'), 'rpc sesion_es_de_prueba')
  sb.from('persona_legajo')
  assert.equal(pedidas.at(-1), 'personas')
})
