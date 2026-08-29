// LAS MÉTRICAS TIENEN QUE PODER DAR UN NÚMERO FEO.
//
// Este repo ya publicó un Claude Avoidance Rate sesgado hacia arriba por construcción: contaba como
// «resuelto por regla» una cantidad que había leído el modelo, y contaba como resueltas partidas
// que estaban en la lista con cantidad `null`. El contador daba bien y no podía decir que no.
//
// Cada test de acá comprueba que un contador BAJA cuando la realidad es peor. Un contador que sólo
// se probó con datos buenos no está probado.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metricasDeCorrida, compararCorridas } from './metricas.mjs'
import { costoDePartida, subcontrato } from './costo.mjs'
import { observacionDePrecio, TIPO_RECURSO } from './precios.mjs'
import { colaDeAtencion } from './atencion.mjs'
import { issue, TIPO_ISSUE, ESTADO } from './contrato.mjs'
import { evento } from './eventos.mjs'

const HOY = new Date('2026-08-29T12:00:00Z')
const COMP = [
  { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un', desperdicio: 0.05 },
  { recursoCodigo: 'MO-OF', nombre: 'Oficial', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
]
const PRECIOS = [
  observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 950, fuente: 'lista', observadoEn: '2026-08-01' }),
  observacionDePrecio({ recursoCodigo: 'MO-OF', precio: 4_200, fuente: 'convenio', observadoEn: '2026-08-01' }),
]
const VIEJO = observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 500, fuente: 'lista 2024', observadoEn: '2024-01-01' })

test('una corrida VACÍA no es 100 % de autonomía: las tasas son NULL', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `tasa`, `return den > 0 ? num/den : 1`.
  const m = metricasDeCorrida({})
  assert.equal(m.autonomous_resolution_rate, null)
  assert.equal(m.knowledge_reuse_rate, null)
  assert.equal(m.claude_avoidance_rate, null)
  assert.notEqual(m.autonomous_resolution_rate, 1)
})

test('el CLAUDE AVOIDANCE RATE baja cuando se llama al modelo', () => {
  const sinModelo = metricasDeCorrida({ decisionesDeterministicas: 10, llamadasLLM: [] })
  assert.equal(sinModelo.claude_avoidance_rate, 1)
  const conModelo = metricasDeCorrida({
    decisionesDeterministicas: 10,
    llamadasLLM: [{ tokensIn: 1000, tokensOut: 500, usd: 0.03 }, { tokensIn: 800, tokensOut: 200, usd: 0.02 }],
  })
  assert.equal(conModelo.claude_avoidance_rate, 0.833)
  assert.equal(conModelo.tokens, 2_500)
  assert.equal(conModelo.costo_llm_usd, 0.05)
})

test('una cantidad AUSENTE no cuenta como resuelta, aunque esté en la lista', () => {
  // Es el defecto medido: preguntar por la PRESENCIA en la lista daba 111 cantidades resueltas
  // donde había 28.
  const m = metricasDeCorrida({
    cantidades: [
      { valor: 520, estado: ESTADO.CALCULADO },
      { valor: null, estado: ESTADO.FALTA_DATO, porQue: 'el plano no dice cuántos hay' },
      { valor: 0, estado: ESTADO.FALTA_DATO, porQue: 'llegó como cero sin serlo' },
    ],
  })
  assert.equal(m.cantidades_total, 3)
  assert.equal(m.cantidades_resueltas, 1)
  assert.notEqual(m.cantidades_resueltas, 3)
})

test('INCERTIDUMBRE NO DECLARADA · un hueco CON motivo cuenta CERO; uno sin motivo cuenta uno (§30)', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `incertidumbre_no_declarada`, sacar el `&& !c.porQue`.
  //
  // La métrica del §30 no es «cuántos NULL hay» —eso se mejora rellenando— sino cuántos huecos el
  // sistema NO SABE que tiene.
  const declarado = metricasDeCorrida({ cantidades: [{ valor: null, estado: ESTADO.FALTA_DATO, porQue: 'el plano dice s/Cálculo' }] })
  assert.equal(declarado.incertidumbre_no_declarada, 0)
  const mudo = metricasDeCorrida({ cantidades: [{ valor: null, estado: ESTADO.FALTA_DATO }] })
  assert.equal(mudo.incertidumbre_no_declarada, 1)
  // Y bajar los NULL rellenando NO mejora la métrica: sigue en cero porque ya estaba declarado.
  assert.ok(declarado.incertidumbre_no_declarada <= mudo.incertidumbre_no_declarada)
})

test('los precios se cuentan en TRES cajones: vigentes, vencidos y faltantes', () => {
  const conTodo = costoDePartida({ partida: { codigo: 'A', cantidad: 10, unidad: 'M2' }, composicion: COMP, observaciones: PRECIOS, hoy: HOY })
  const conViejo = costoDePartida({ partida: { codigo: 'B', cantidad: 10, unidad: 'M2' }, composicion: [COMP[0]], observaciones: [VIEJO], hoy: HOY })
  const sinPrecio = costoDePartida({ partida: { codigo: 'C', cantidad: 10, unidad: 'M2' }, composicion: [COMP[1]], observaciones: [], hoy: HOY })
  const m = metricasDeCorrida({ costosDePartida: [conTodo, conViejo, sinPrecio] })
  assert.equal(m.precios_vigentes, 2)
  assert.equal(m.precios_vencidos, 1, 'un precio de 2024 no es faltante: tiene número')
  assert.equal(m.precios_faltantes, 1)
  assert.equal(m.recursos_resueltos, 3, 'los que sí tienen costo calculado')
})

test('HH sin dato NO se cuenta como HH cero', () => {
  // MUTACIÓN QUE LO PONE ROJO: `hh_resueltas: costosDePartida.filter((c) => c.hh !== undefined)`.
  const conHh = costoDePartida({ partida: { codigo: 'A', cantidad: 10, unidad: 'M2' }, composicion: COMP, observaciones: PRECIOS, hoy: HOY })
  const sinComposicion = costoDePartida({ partida: { codigo: 'B', cantidad: 10, unidad: 'M2' }, composicion: [], observaciones: PRECIOS })
  const m = metricasDeCorrida({ costosDePartida: [conHh, sinComposicion] })
  assert.equal(m.hh_resueltas, 1)
  assert.equal(m.hh_sin_dato, 1)
})

test('los subcontratos sin precio se cuentan aparte: es el agujero que más plata mueve', () => {
  const sub = costoDePartida({ partida: { codigo: 'SAN', cantidad: 1, unidad: 'un', subcontrato: subcontrato({ alcance: 'sanitaria' }) } })
  const m = metricasDeCorrida({ costosDePartida: [sub] })
  assert.equal(m.subcontratos_sin_precio, 1)
})

test('bloqueantes y conflictos salen de la cola, no de un recuento aparte', () => {
  const cola = colaDeAtencion({
    costoConocido: 100_000_000,
    issues: [
      issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, entity: 'SAN', impact: 8_500_000, recommended_action: 'set_subcontract' }),
      issue({ type: TIPO_ISSUE.CONFLICTO, entity: 'T9000' }),
      issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: 'CLAVO', impact: 900 }),
    ],
  })
  const m = metricasDeCorrida({ cola })
  // Tres bloqueantes: el subcontrato sin precio, el conflicto, y el PRECIO_DESACTUALIZADO —que
  // desde el cambio de semántica bloquea salvo override auditado (§42 HISTORICO ≠ VALIDADO).
  assert.equal(m.bloqueantes, 3)
  assert.equal(m.no_bloqueantes, 0)
  assert.equal(m.conflictos, 1)
  assert.equal(m.preguntas_humanas, 1, 'sólo los issues que traen una acción sugerida son una pregunta')
})

test('sin cola, los contadores de bloqueo son NULL y no cero', () => {
  // MUTACIÓN QUE LO PONE ROJO: `const bloqueantes = cola?.nBloqueantes ?? 0`.
  const m = metricasDeCorrida({})
  assert.equal(m.bloqueantes, null, 'cero bloqueantes y no haber mirado son cosas distintas')
  assert.equal(m.conflictos, null)
})

test('los overrides humanos se cuentan sólo si son comerciales o de política', () => {
  const m = metricasDeCorrida({
    eventos: [
      evento({ accion: 'commercial_override', entidad: 'cot', actor: 'jorge' }),
      evento({ accion: 'update_quantity', entidad: 'T1', actor: 'jorge' }),
      evento({ accion: 'set_global_policy', entidad: 'empresa', actor: 'jorge' }),
    ],
  })
  assert.equal(m.overrides_humanos, 2)
})

test('un documento que no se pudo parsear baja el contador', () => {
  const m = metricasDeCorrida({ documentos: [{ parseado: true }, { parseado: false }, {}] })
  assert.equal(m.documentos_total, 3)
  assert.equal(m.documentos_parseados, 2, 'un documento sin la marca cuenta como parseado; uno con `false`, no')
})

test('comparar dos corridas devuelve QUÉ se movió y en qué dirección', () => {
  const a = metricasDeCorrida({ decisionesDeterministicas: 10, llamadasLLM: [] })
  const b = metricasDeCorrida({ decisionesDeterministicas: 10, llamadasLLM: [{ tokensIn: 1, tokensOut: 1, usd: 0 }] })
  const d = compararCorridas(a, b)
  assert.equal(d.iguales, false)
  const tasa = d.diferencias.find((x) => x.metrica === 'claude_avoidance_rate')
  assert.ok(tasa.delta < 0, 'el avoidance BAJÓ y el comparador lo dice con signo')
  assert.equal(compararCorridas(a, a).iguales, true)
})

test('la latencia se declara y NO se inventa', () => {
  const m = metricasDeCorrida({})
  assert.equal(m.latencia_fria_ms, null)
  assert.equal(m.latencia_tibia_ms, null)
  assert.equal(metricasDeCorrida({ msFrio: 4200 }).latencia_fria_ms, 4200)
})
