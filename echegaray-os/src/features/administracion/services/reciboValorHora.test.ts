// EL VALOR HORA EN EL RECIBO (dueño, 02/10/2026, pagando haberes): «dejame la forma de hacer un buen recibo de eso, no
// sale ni valor hora en el recibo».
//
// Caso real de la Q2-09 (Agüero): 68,5 h fuera de recibo × $ 6.348 = $ 434.838; banco $ 289.543,80 = recibo del estudio
// $ 234.963,32 + saldo de la 1ª quincena $ 54.580,48; ya cobró $ 380.000 en efectivo. Los importes de los medios NO
// pueden cambiar por mostrar la cuenta: se comparan contra el mismo papel armado sin el valor hora.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alternarConcepto, armarRecibo, conceptosDisponibles, eleccionInicial, ROTULO, textoDeHoras } from './reciboDeLaQuincena.ts'
import { conArrastre } from './liquidacionArrastre.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import { palabrasProhibidas, sellarRecibo } from './reciboEmitido.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

const NETO_DEL_ESTUDIO = 234963.32
const SALDO_Q1 = 54580.48
const HORAS_FUERA = 68.5
const VALOR_HORA = 6348
const EFECTIVO = 434838
const PAGADO_EFECTIVO = 380000

const aguero = (pagadoEfectivo = PAGADO_EFECTIVO): LineaConOverrides => conArrastre({
  personaId: 'aguero', porBanco: NETO_DEL_ESTUDIO, enEfectivo: EFECTIVO, pagadoBanco: 0, pagadoEfectivo, modalidad: 'jornal',
  sueldo: {
    horasBlanco: 44, horasNegro: HORAS_FUERA, valorHoraNegro: VALOR_HORA, negro: EFECTIVO, recargoExtras: 0,
    origenNeto: 'recibo', estado: 'recibo', neto: NETO_DEL_ESTUDIO,
  },
  pago: pagoDeLaLinea({ banco: NETO_DEL_ESTUDIO, negro: EFECTIVO, pagadoEfectivo }),
} as unknown as LineaConOverrides, { importe: SALDO_Q1, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' })

const pesos = (n: number) => `$ ${n.toLocaleString('es-AR')}`
const fila = (r: { rotulo: string; detalle?: string | null; importe: number | null; horas?: number | null }) =>
  [r.rotulo, r.detalle ?? null, r.importe, r.horas ?? null]

test('Agüero por defecto: reparto de horas, la cuenta 68,5 h × $ 6.348 = $ 434.838, banco abierto, ya pagado y resta', () => {
  const l = aguero()
  const e = eleccionInicial(l)
  assert.deepEqual(e, { horas: true, horasRecibo: true, horasFuera: true, valorHora: true, banco: true, efectivo: true, pagado: true })
  const r = armarRecibo(l, e, pesos)
  assert.deepEqual(r.horas.map(fila), [
    ['Horas trabajadas', null, null, 112.5],
    ['Horas trabajadas por recibo', null, null, 44],
    ['Horas trabajadas fuera de recibo', '68,5 h × $ 6.348', 434838, 68.5],
  ])
  assert.equal(HORAS_FUERA * VALOR_HORA, EFECTIVO, 'la cuenta del papel es la del dueño, al peso')
  const [banco, recibo, saldo] = r.medios
  assert.deepEqual([banco.rotulo, banco.importe], [ROTULO.banco, 289543.8])
  assert.deepEqual([recibo.rotulo, recibo.importe, saldo.rotulo, saldo.importe],
    ['Recibo de sueldo', NETO_DEL_ESTUDIO, 'Saldo 1ª quincena de septiembre', SALDO_Q1])
  const efectivo = r.medios.findIndex((m) => m.rotulo === ROTULO.efectivo)
  const debajo = r.medios.slice(efectivo + 1).map((m) => [m.rotulo, m.importe])
  // Efectivo = ya pagado + resta, la resta redondeada como el «Efect. red.» del cuadro (regla que no se toca acá).
  assert.deepEqual([r.medios[efectivo].importe, ...debajo], [435000, ['ya pagado', PAGADO_EFECTIVO], ['resta', 55000]])
  assert.equal(r.total, 724543.8)
})

test('mostrar la cuenta NO cambia ningún importe: medios y total son los del mismo papel sin el valor hora', () => {
  const l = aguero()
  const con = armarRecibo(l, eleccionInicial(l), pesos)
  const sin = armarRecibo(l, { ...eleccionInicial(l), valorHora: false }, pesos)
  assert.deepEqual(con.medios, sin.medios)
  assert.equal(con.total, sin.total)
  // El total suma los medios, nunca el importe de la cuenta: si lo sumara, el efectivo se contaría dos veces.
  const medios = con.medios.filter((m) => !m.sub).reduce((a, m) => a + (m.importe ?? 0), 0)
  assert.equal(con.total, Math.round(medios * 100) / 100)
  assert.equal(sin.horas.at(-1)?.importe, null, 'sin «Valor hora», el renglón dice sólo las horas')
})

test('sin nada pagado, «ya pagado / resta» no se tilda solo', () => {
  assert.equal(eleccionInicial(aguero(0)).pagado, false)
})

test('«Valor hora» sin «Horas fuera de recibo» no imprime una cuenta suelta, y tildarlo tilda el renglón', () => {
  const l = aguero()
  const r = armarRecibo(l, { ...eleccionInicial(l), horasFuera: false, valorHora: true }, pesos)
  assert.equal(r.horas.some((h) => h.importe != null || h.rotulo === ROTULO.horasFuera), false)
  assert.deepEqual(alternarConcepto({ horasFuera: false }, 'valorHora', true), { horasFuera: true, valorHora: true })
  assert.deepEqual(alternarConcepto({ valorHora: true }, 'horasFuera', false), { horasFuera: false, valorHora: false })
})

test('sin $/h en el modelo, «Valor hora» queda deshabilitado con su motivo y el renglón no inventa un importe', () => {
  const sinValor = { ...aguero(), sueldo: { ...aguero().sueldo, valorHoraNegro: null } } as unknown as LineaConOverrides
  assert.equal(conceptosDisponibles(sinValor).valorHora, 'la quincena no trae el valor hora')
  assert.equal(eleccionInicial(sinValor).valorHora, false)
  const r = armarRecibo(sinValor, { ...eleccionInicial(sinValor), valorHora: true }, pesos)
  assert.equal(r.horas.at(-1)?.importe, null)
})

test('con recargo de extras, la cuenta lo escribe: sin él no cerraría con lo que paga el modelo', () => {
  const l = { ...aguero(), sueldo: { ...aguero().sueldo, recargoExtras: 2 } } as unknown as LineaConOverrides
  const h = armarRecibo(l, eleccionInicial(l), pesos).horas.at(-1)
  assert.deepEqual([h?.detalle, h?.importe], ['(68,5 h + 2 h de recargo por extras) × $ 6.348', 70.5 * 6348])
})

test('el papel sellado con la cuenta no dice «blanco» ni «negro» (el CHECK de la base lo rebotaría)', () => {
  const l = aguero()
  const s = sellarRecibo({ personaId: 'aguero', nombre: 'Agüero', categoria: null, desde: '2026-09-16', hasta: '2026-09-30' },
    armarRecibo(l, eleccionInicial(l), pesos))
  assert.deepEqual(palabrasProhibidas(s), [])
  assert.equal(/blanc|negr/i.test(JSON.stringify(s.renglones)), false)
})

test('la reimpresión de un recibo sellado ANTES de la cuenta sale igual: horas a la derecha, sin detalle', () => {
  assert.deepEqual(textoDeHoras({ rotulo: ROTULO.horasFuera, horas: 68.5, detalle: null, importe: null }, pesos), { importe: '68,5 h' })
  assert.deepEqual(textoDeHoras({ rotulo: ROTULO.horas, horas: null, importe: null }, pesos), { importe: 'sin dato' })
  assert.deepEqual(textoDeHoras({ rotulo: ROTULO.horasFuera, horas: 68.5, detalle: '68,5 h × $ 6.348', importe: 434838 }, pesos),
    { detalle: '68,5 h × $ 6.348', importe: '$ 434.838' })
})
