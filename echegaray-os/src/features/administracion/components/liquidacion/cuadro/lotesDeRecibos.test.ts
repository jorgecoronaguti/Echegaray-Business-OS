// RECIBOS EN LOTE: el papel de cada persona es el del panel, se registra ANTES de imprimir, sale de a cuatro por hoja
// y quien no tiene nada que cobrar se nombra en vez de salir en blanco.
//
// MUTACIONES QUE LO PONEN ROJO: que `ArmarRecibo` vuelva a decidir su propia elección; partir en hojas de 3 ó 5;
// armar el lote en el orden en que se tildó; no saltear el recibo vacío; imprimir antes de registrar; sacar el
// `A4 landscape`; que una casilla de sección arrastre a otra sección.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pagoDeLaLinea } from '../../../services/pagoDeLaQuincena.ts'
import type { LineaConOverrides } from '../../../services/liquidacionOverrides.ts'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales.ts'
import {
  armarLote, enHojas, reciboSinNada, estadoDeSeccion, marcarSeccion, reciboPorDefecto, soloLosVisibles, textoDeSeleccion,
} from './lotesDeRecibos.ts'

const fmt = (n: number) => `$${n}`
const rotulo = (c: string) => c.toUpperCase()
const Q = { desde: '2026-09-16', hasta: '2026-09-30' }
const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Un jornalero con 45 h en blanco (neto 230.000 por banco) y 51 h en negro (306.000 en efectivo): 96 h, 536.000.
const jornalero = {
  porBanco: 230000, enEfectivo: 306000, pagadoBanco: 0, pagadoEfectivo: 0, modalidad: 'jornal',
  sueldo: { horasBlanco: 45, valorHoraCategoria: 6666.67, bruto: 300000, horasNegro: 51, valorHoraNegro: 6000, negro: 306000 },
  pago: pagoDeLaLinea({ banco: 230000, negro: 306000 }),
} as unknown as LineaConOverrides
// Sin horas ni importes: el papel no diría nada.
const vacia = {
  porBanco: null, enEfectivo: null, pagadoBanco: 0, pagadoEfectivo: 0, modalidad: 'jornal', horas: null, sueldo: null, cobra: null,
  pago: pagoDeLaLinea({ banco: null, negro: null }),
} as unknown as LineaConOverrides

const fila = (id: string, nombre: string, linea: LineaConOverrides, categoria: string | null = 'oficial'): FilaDelEspejo =>
  ({ personaId: id, nombre, categoria, grupo: 'obreros', cerrada: false, linea, celdas: [] }) as unknown as FilaDelEspejo

test('el recibo del lote es el del panel: 96 h, banco, efectivo y total, sellado con la persona y la quincena', () => {
  const r = reciboPorDefecto(fila('p1', 'Ana', jornalero), Q, fmt, rotulo)
  assert.deepEqual(r.recibo.horas.map((h) => [h.rotulo, h.horas]), [['Horas trabajadas', 96]])
  assert.deepEqual(r.recibo.medios.map((m) => [m.rotulo, m.importe]), [['Depósito en banco', 230000], ['Efectivo', 306000]])
  assert.equal(r.sellado.total, 536000)
  assert.deepEqual([r.sellado.personaId, r.sellado.quincenaDesde, r.sellado.quincenaHasta, r.categoria], ['p1', Q.desde, Q.hasta, 'OFICIAL'])
})

test('el lote respeta el orden de la grilla, ignora lo no marcado y nombra a quien no tiene nada', () => {
  const filas = [fila('a', 'Ana', jornalero), fila('b', 'Beto', vacia), fila('c', 'Cora', jornalero), fila('d', 'Dani', jornalero)]
  // Se tildó en otro orden y se dejó afuera a Dani.
  const lote = armarLote(filas, new Set(['c', 'b', 'a']), Q, fmt, rotulo)
  assert.deepEqual(lote.listos.map((l) => l.fila.nombre), ['Ana', 'Cora'])
  assert.deepEqual(lote.sinNada, ['Beto'])
})

test('«nada que cobrar»: sin renglones, o sólo «sin dato» y ceros; un cero junto a una cifra real sí sale', () => {
  assert.equal(reciboSinNada({ horas: [], medios: [], total: null }), true)
  assert.equal(reciboSinNada({ horas: [], medios: [{ rotulo: 'Efectivo', importe: null }, { rotulo: 'Depósito en banco', importe: 0 }], total: null }), true)
  assert.equal(reciboSinNada({ horas: [], medios: [{ rotulo: 'Efectivo', importe: 306000 }, { rotulo: 'Depósito en banco', importe: 0 }], total: 306000 }), false)
  assert.equal(reciboSinNada({ horas: [{ rotulo: 'Horas trabajadas', horas: 12, detalle: null, importe: null }], medios: [], total: null }), false)
})

test('cuatro por hoja: 9 recibos son 3 hojas (4 + 4 + 1) y 0 son ninguna', () => {
  const nueve = Array.from({ length: 9 }, (_, i) => i)
  assert.deepEqual(enHojas(nueve).map((h) => h.length), [4, 4, 1])
  assert.deepEqual(enHojas([1, 2, 3, 4]).map((h) => h.length), [4])
  assert.deepEqual(enHojas([]), [])
})

test('la casilla de un cuadro marca y desmarca sólo a los suyos; con algunos tildados queda «algunas»', () => {
  const jornaleros = ['a', 'b'], mensuales = ['m']
  let sel: ReadonlySet<string> = new Set(['m'])
  sel = marcarSeccion(sel, jornaleros, true)
  assert.deepEqual([...sel].sort(), ['a', 'b', 'm'])
  assert.equal(estadoDeSeccion(jornaleros, sel), 'todas')
  sel = marcarSeccion(sel, jornaleros, false)
  assert.deepEqual([...sel], ['m'], 'desmarcar los quincenales no toca al mensual')
  assert.equal(estadoDeSeccion(jornaleros, sel), 'ninguna')
  assert.equal(estadoDeSeccion(jornaleros, new Set(['a'])), 'algunas')
  assert.equal(estadoDeSeccion(mensuales, sel), 'todas')
})

test('un filtro que esconde una fila la saca de la selección', () => {
  assert.deepEqual([...soloLosVisibles(new Set(['a', 'b']), ['b', 'c'])], ['b'])
  assert.equal(textoDeSeleccion(1), '1 recibo seleccionado')
  assert.equal(textoDeSeleccion(4), '4 recibos seleccionados')
})

test('CABLEADO: una sola regla de «qué lleva», registrar antes de imprimir, A4 horizontal', () => {
  const armar = fuente('./ArmarRecibo.tsx')
  assert.match(armar, /eleccionPorDefecto\(fila\)/)
  assert.doesNotMatch(armar, /eleccionInicial\(/, 'ArmarRecibo no decide su propia elección por defecto')
  const barra = fuente('./BarraDeRecibos.tsx')
  assert.ok(barra.indexOf('await registrarUno(') < barra.indexOf('setParaImprimir(salieron'), 'se registra antes de mandar a imprimir')
  assert.match(barra, /aceptarRecibo\(r\.sellado\)/)
  assert.match(fuente('./HojaDelRecibo.tsx'), /size: A4 landscape/)
  assert.match(fuente('./HojasDeRecibosA4.tsx'), /gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr'/)
})
