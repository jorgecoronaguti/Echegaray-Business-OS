// LA RESTA DEL RECIBO Q1-09 SE PAGA POR BANCO EN Q2-09 (dueño, 30/09/2026): banco += resta, efectivo −= resta, total
// igual; si el efectivo que falta no la cubre, no se fuerza y se marca.
//
// MUTACIONES que estos tests ponen en rojo:
// - `conArrastre` sin restar del efectivo, o cambiando el total → «traslada del efectivo al banco».
// - quitar el `disponible < importe` → «no alcanza».
// - `conArrastres` aplicando lo entrante también en la cerrada → «la cerrada no lo vuelve a aplicar».
// - `cierreDeLaFila` sin descontar el arrastre aplicado → «la fila sigue cerrando».
// - `totalesDelEspejo` sumando la resta al neto → «el pie».
// - `conNetoDelRecibo` devolviendo la fila con la resta → «la celda escribe el neto».

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reglasDelRecibo, type ReciboParaReglas } from './reglasDelRecibo.ts'
import type { BaseDelEstimado, EntradaDeBlanco } from './sueldoBlancoNegro.ts'
import { aplicarOverrides, type LineaConOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { cierreDeLaFila, cierreDeTotales } from './cuadroDeJornales.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'
import { conArrastre, conArrastres, conNetoDelRecibo, textoDelArrastre, type ArrastresDeLaQuincena } from './liquidacionArrastre.ts'

const RECIBOS: ReciboParaReglas[] = [
  { persona: 'Z', periodo: 'Q1-09/2026', valorHora: 6468, horasNormales: 50, horasFeriado: 0, horasOtras: 0, conceptos: [] },
]
const BASE: BaseDelEstimado = { periodo: 'Q2-09/2026', reglas: reglasDelRecibo(RECIBOS, 'Q2-09/2026'), feriados: 0, recibos: RECIBOS, presentismoPropio: true }
const BLANCO: EntradaDeBlanco = {
  recibo: null, netoDeNomina: null, pisoCategoria: 6348,
  proporcion: { cociente: 0.73, origen: 'persona', recibos: 6 }, estimacion: { base: BASE, persona: 'Z' },
}
const linea = (pagadoEfectivo = 0): LineaConOverrides => aplicarOverrides(liquidarLinea({
  personaId: 'p', nombre: 'N', nombreOrden: 'N', horas: 100, tarifa: { valorHora: 7000, netoMensual: null, desde: '2026-09-01', origen: 'x' },
  adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
}, 'obreros', null), pagadoEfectivo ? { pagadoEfectivo } : {}, 'obreros', null, BLANCO, null)
const RESTA = { importe: 54580.48, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' }
const pesos = (n: number | null) => String(n)

test('traslada del efectivo al banco sin cambiar el total', () => {
  const l = linea()
  const r = conArrastre(l, RESTA)
  assert.equal(r.arrastre?.estado, 'aplicado')
  assert.equal(r.porBanco, Math.round((l.porBanco + 54580.48) * 100) / 100)
  assert.equal(r.enEfectivo, Math.round(((l.enEfectivo ?? 0) - 54580.48) * 100) / 100)
  assert.equal(r.total, l.total)
  assert.equal(r.cobra, l.cobra)
  assert.equal(r.pago.aPagarBanco, Math.round(((l.pago.aPagarBanco ?? 0) + 54580.48) * 100) / 100)
  assert.equal(r.pago.aPagarEfectivo, Math.round(((l.pago.aPagarEfectivo ?? 0) - 54580.48) * 100) / 100)
})

test('la fila sigue cerrando con la resta aplicada', () => {
  const l = linea()
  assert.equal(cierreDeLaFila(l)?.cierra, true, 'precondición: cierra sin arrastre')
  assert.equal(cierreDeLaFila(conArrastre(l, RESTA))?.cierra, true)
})

test('no alcanza: si el efectivo que falta no cubre la resta, no se traslada y se marca', () => {
  const l = linea()
  const casiTodo = (l.pago.negro ?? 0) - 10000
  const conPagado = linea(casiTodo)
  const r = conArrastre(conPagado, RESTA)
  assert.equal(r.arrastre?.estado, 'no_alcanza')
  assert.equal(r.arrastre?.efectivoDisponible, 10000)
  assert.equal(r.porBanco, conPagado.porBanco)
  assert.equal(r.enEfectivo, conPagado.enEfectivo)
  assert.match(textoDelArrastre(r, pesos) ?? '', /SIN trasladar/)
})

test('la cerrada no lo vuelve a aplicar; la de origen sabe a dónde se fue', () => {
  const l = linea()
  const a: ArrastresDeLaQuincena = {
    entrantes: new Map([['p', RESTA]]),
    salientes: new Map([['p', { importe: 54580.48, desde: '2026-09-16', motivo: RESTA.motivo }]]),
    error: null,
  }
  const cerrada = conArrastres(l, a, false)
  assert.equal(cerrada.porBanco, l.porBanco)
  assert.equal(cerrada.arrastre, undefined)
  assert.equal(cerrada.arrastradoA?.desde, '2026-09-16')
  assert.equal(conArrastres(l, a, true).arrastre?.estado, 'aplicado')
})

test('la celda Neto escribe el neto del recibo, no el banco con la resta', () => {
  const l = linea()
  const fila = { linea: conArrastre(l, RESTA) }
  assert.equal(conNetoDelRecibo(fila).linea.porBanco, l.porBanco)
  const sin = { linea: l }
  assert.equal(conNetoDelRecibo(sin), sin)
})

test('el pie: neto + negro = cobra, la resta va aparte y el cierre de totales da', () => {
  const l = linea()
  const fila = (linea: LineaConOverrides) => ({ linea, celdas: [], cotejo: { estado: 'coincide' }, horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0 } }) as unknown as FilaDelEspejo
  const t = totalesDelEspejo([fila(conArrastre(l, RESTA))])
  assert.equal(t.netoBandas, l.porBanco)
  assert.equal(t.arrastre?.importe, 54580.48)
  assert.equal(t.porBanco, Math.round((l.porBanco + 54580.48) * 100) / 100)
  assert.equal(cierreDeTotales(t)?.cierra, true)
})
