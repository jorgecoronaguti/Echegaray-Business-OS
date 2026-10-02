// LA RESTA DEL RECIBO Q1-09 SE PAGA POR BANCO EN Q2-09 (dueño, 30/09/2026): banco += resta, efectivo −= resta, total
// igual; si el efectivo que falta no la cubre, no se fuerza y se marca.
//
// MUTACIONES que estos tests ponen en rojo:
// - `conArrastre` sin restar del efectivo, o cambiando el total → «traslada del efectivo al banco».
// - volver a frenar cuando el efectivo no cubre → «se aplica aunque el efectivo pendiente no cubra».
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
import { conArrastre, conArrastres, conNetoDelRecibo, sumaDelBanco, textoDelArrastre, type ArrastresDeLaQuincena } from './liquidacionArrastre.ts'

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

// LA CELDA SUMA ADENTRO Y DA EL RESULTADO (dueño, 30/09/2026): operandos visibles, número principal = neto + resta.
test('la celda Banco expresa la suma y su resultado; sin resta no hay suma', () => {
  const pesosAR = (n: number | null) => n == null ? '—' : `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
  const l = linea()
  assert.equal(sumaDelBanco(l, pesosAR), null)
  const r = conArrastre(l, RESTA)
  const s = sumaDelBanco(r, pesosAR)
  assert.ok(s)
  assert.equal(s.neto, l.porBanco)
  assert.equal(s.resta, 54580.48)
  assert.equal(s.resultado, r.porBanco)
  assert.equal(s.resultado, Math.round((s.neto + s.resta) * 100) / 100)
  assert.equal(s.operandos, `${pesosAR(l.porBanco).slice(1)} + 54.580,48`)
  assert.equal(s.resultado_texto, `= ${pesosAR(r.porBanco)}`)
  assert.ok(!s.operandos.includes('$'))
})

// LA RESTA SE SUMA SÓLO AL BLANCO (dueño, 02/10/2026: «no me mezcles lo de la quincena pasada con esta en el negro …
// es valor hora por total de hs»; «la suma de q1 y q2 es solo del blanco»). Reemplaza al traslado del 30/09.
test('la resta se suma al banco y el efectivo de la quincena no se toca', () => {
  const l = linea()
  const r = conArrastre(l, RESTA)
  assert.equal(r.arrastre?.estado, 'aplicado')
  assert.equal(r.porBanco, Math.round((l.porBanco + 54580.48) * 100) / 100)
  assert.equal(r.enEfectivo, l.enEfectivo, 'el efectivo no baja por la resta')
  assert.equal(r.pago.negro, l.pago.negro, 'negro = valor hora × horas')
  assert.equal(r.total, Math.round(((l.total ?? 0) + 54580.48) * 100) / 100, 'lo que falta pagar incluye la resta')
  assert.equal(r.cobra, l.cobra)
  assert.equal(r.pago.aPagarBanco, Math.round(((l.pago.aPagarBanco ?? 0) + 54580.48) * 100) / 100)
  assert.equal(r.pago.aPagarEfectivo, l.pago.aPagarEfectivo)
  assert.equal(r.pago.saldoEfectivo, Math.round(((r.pago.negro ?? 0) - r.pago.pagadoEfectivo) * 100) / 100, 'Importe − Pagado = Saldo')
})

test('la fila sigue cerrando con la resta aplicada', () => {
  const l = linea()
  assert.equal(cierreDeLaFila(l)?.cierra, true, 'precondición: cierra sin arrastre')
  assert.equal(cierreDeLaFila(conArrastre(l, RESTA))?.cierra, true)
})

// ES UN ARREGLO CON LA PERSONA (dueño, 30/09/2026): la resta se suma al banco siempre, aunque el efectivo que le
// falta cobrar no la cubra. El freno «no alcanza» (⚠) fue rechazado: la celda tiene que sumar y dar el resultado.
test('se aplica aunque quede poco efectivo por cobrar: el banco suma y el efectivo no se toca', () => {
  const l = linea()
  const casiTodo = (l.pago.negro ?? 0) - 10000
  const conPagado = linea(casiTodo)
  const r = conArrastre(conPagado, RESTA)
  assert.equal(r.arrastre?.estado, 'aplicado')
  assert.equal(r.arrastre?.efectivoDisponible, 10000)
  assert.equal(r.porBanco, Math.round((conPagado.porBanco + 54580.48) * 100) / 100)
  assert.equal(r.enEfectivo, conPagado.enEfectivo)
  assert.equal(r.pago.saldoEfectivo, 10000, 'le quedan los mismos 10.000 en efectivo: la resta no los come')
  assert.equal(r.total, Math.round(((conPagado.total ?? 0) + 54580.48) * 100) / 100)
  assert.ok(sumaDelBanco(r, pesos), 'la celda suma')
  assert.doesNotMatch(textoDelArrastre(r, pesos) ?? '', /SIN trasladar/)
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
