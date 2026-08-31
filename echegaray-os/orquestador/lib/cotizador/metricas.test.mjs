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
import { metricasDeCorrida, compararCorridas, SIN_MEDIR, estaMedida, exactitud, exactitudDeCorrida } from './metricas.mjs'
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

test('una corrida VACÍA no es 100 % de autonomía: las tasas son SIN_MEDIR', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `tasa`, `return den > 0 ? num/den : 1`.
  //
  // ═══ CAMBIO DE CONTRATO 30/08/2026: era `null`, ahora es la palabra ═══
  //
  // El test viejo pedía `null` y `null` era correcto en la aritmética, pero `reporte.mjs` lo
  // imprimía como «—». Medido: la columna CÓMPUTO MANUAL —0 partidas, 0 recursos— publicaba
  // «AUTONOMOUS RESOLUTION: —» al lado de tres columnas con «100,0 %», y un guión entre porcentajes
  // se lee como «acá no importa», no como «no se pudo medir». El valor ahora dice la palabra.
  const m = metricasDeCorrida({})
  assert.equal(m.autonomous_resolution_rate, SIN_MEDIR)
  assert.equal(m.knowledge_reuse_rate, SIN_MEDIR)
  assert.equal(m.claude_avoidance_rate, SIN_MEDIR)
  assert.notEqual(m.autonomous_resolution_rate, 1)
  assert.equal(estaMedida(m.autonomous_resolution_rate), false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO MEDIDO EL 29/08/2026 SOBRE QUATTROPANI (real)
//
// BLOQUEADO (96) · bloqueantes 95 · preguntas dirigidas 96 · $17.388.173 en riesgo · COSTO DIRECTO
// «NO SE AFIRMA» — y en la misma columna AUTONOMOUS RESOLUTION RATE 100,0 %.
//
// El denominador era «lo que el motor intentó», no «lo que había que resolver»: derivar trabajo a
// una persona MEJORABA la métrica, porque salía del denominador. Es el patrón que ya costó caro
// acá: un control que no puede decir que no.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Una cola con `n` issues que bloquean y piden acción, como los 95 de Quattropani. */
const colaCon = (n, { bloquea = true } = {}) => ({
  total: n,
  nBloqueantes: bloquea ? n : 0,
  issues: Array.from({ length: n }, (_, i) => ({
    type: 'PRECIO_DESACTUALIZADO', entity: `r${i}`, bloquea, recommended_action: 'actualizar_precio',
  })),
  bloqueantes: [],
})

/** 26 partidas con cantidad resuelta: el numerador de Quattropani. */
const VEINTISEIS = Array.from({ length: 26 }, (_, i) => ({ valor: 10 + i, estado: ESTADO.CALCULADO }))

test('QUATTROPANI · con 96 preguntas al humano el AUTONOMOUS RESOLUTION no puede dar 100 %', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `metricasDeCorrida`, volver al denominador viejo
  // `tasa(conCantidad.length + mapeadas.length, cantidades.length + mapeos.length)`.
  const m = metricasDeCorrida({ cantidades: VEINTISEIS, cola: colaCon(96) })
  assert.equal(m.human_questions, 96)
  assert.equal(m.requieren_humano, 96)
  assert.notEqual(m.autonomous_resolution_rate, 1, 'una corrida que no puede afirmar su costo no resolvió el 100 %')
  // 26 resueltas sobre 26 + 96 de trabajo real = 0,213
  assert.equal(m.autonomous_resolution_rate, 0.213)
  assert.equal(m.autonomous_resolution_base, 122)
})

test('LA MUTACIÓN DEL FRENTE · todo resuelto da 100 %, y UN bloqueante lo BAJA', () => {
  // Los dos extremos en el mismo test, porque probar sólo uno no prueba nada: un contador clavado
  // en 1 pasa el primero, y uno clavado en 0 pasa el segundo.
  const limpia = metricasDeCorrida({ cantidades: VEINTISEIS, cola: colaCon(0) })
  assert.equal(limpia.autonomous_resolution_rate, 1, 'el verde TIENE que ser alcanzable')
  assert.equal(limpia.autonomous_resolution_base, 26)

  const conUno = metricasDeCorrida({ cantidades: VEINTISEIS, cola: colaCon(1) })
  assert.ok(conUno.autonomous_resolution_rate < 1, `un solo bloqueante ya baja la tasa; dio ${conUno.autonomous_resolution_rate}`)
  assert.equal(conUno.autonomous_resolution_rate, 0.963) // 26 / 27

  // Y la caída es MONÓTONA: más preguntas, menos autonomía. Sin esto, «baja» podría ser un ruido.
  const serie = [0, 1, 10, 96].map((n) => metricasDeCorrida({ cantidades: VEINTISEIS, cola: colaCon(n) }).autonomous_resolution_rate)
  assert.deepEqual(serie, [...serie].sort((a, b) => b - a), `no es monótona: ${JSON.stringify(serie)}`)
  assert.deepEqual(serie, [1, 0.963, 0.722, 0.213])
})

test('las preguntas y los bloqueantes NO se cuentan dos veces', () => {
  // En Quattropani 95 de las 96 son las dos cosas. Sumarlas daría 191 de denominador y una tasa
  // más baja que la real: exagerar el rojo también es mentir.
  const m = metricasDeCorrida({ cantidades: VEINTISEIS, cola: colaCon(96) })
  assert.equal(m.autonomous_resolution_base, 26 + 96, 'la UNIÓN, no la suma')
})

test('CLAUDE AVOIDANCE con 0 llamadas y 0 decisiones es SIN_MEDIR, no 100 %', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `tasa`, devolver 1 con denominador cero.
  // Evitar algo que nunca se necesitó no es mérito.
  const nada = metricasDeCorrida({ decisionesDeterministicas: 0, llamadasLLM: [] })
  assert.equal(nada.claude_avoidance_rate, SIN_MEDIR)
  assert.equal(nada.claude_avoidance_base, 0)
  // Con decisiones reales sí se mide, y el denominador viaja con la tasa.
  const real = metricasDeCorrida({ decisionesDeterministicas: 10, llamadasLLM: [] })
  assert.equal(real.claude_avoidance_rate, 1)
  assert.equal(real.claude_avoidance_base, 10)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA EXACTITUD (§21): sin real conocido, SIN_MEDIR
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('NEGATIVO · sin un real conocido las cinco exactitudes son SIN_MEDIR, NUNCA 100 %', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `exactitud`, `if (real == null) return 1`.
  const m = metricasDeCorrida({ cantidades: VEINTISEIS, costosDePartida: [{ hh: 40, subtotal: 1_000 }] })
  for (const k of ['exactitud_cantidad', 'exactitud_hh', 'exactitud_recursos', 'exactitud_costo', 'exactitud_precio']) {
    assert.equal(m[k], SIN_MEDIR, `${k} no tiene contra qué medirse`)
    assert.notEqual(m[k], 1)
  }
})

test('con un real conocido la exactitud SE MIDE, y un error grande la hunde', () => {
  assert.equal(exactitud({ estimado: 100, real: 100 }), 1)
  assert.equal(exactitud({ estimado: 90, real: 100 }), 0.9)
  assert.equal(exactitud({ estimado: 300, real: 100 }), 0, 'pasarse al triple es 0, no −2')
  // Los dos casos en que no hay proporción posible:
  assert.equal(exactitud({ estimado: 5, real: 0 }), SIN_MEDIR, 'contra un real de cero no hay porcentaje')
  assert.equal(exactitud({ estimado: null, real: 100 }), SIN_MEDIR, 'un costo que NO SE AFIRMA no tiene exactitud')
})

test('la exactitud de costo es SIN_MEDIR si alguna partida no cerró su subtotal', () => {
  // Sumar lo que cerró y compararlo contra el real total daría una exactitud baja por una razón
  // falsa: el motor no se equivocó, no terminó. Son cosas distintas.
  const parcial = exactitudDeCorrida({ real: { costo: 1_000 }, costosDePartida: [{ subtotal: 600 }, { subtotal: null }] })
  assert.equal(parcial.exactitud_costo, SIN_MEDIR)
  const completo = exactitudDeCorrida({ real: { costo: 1_000 }, costosDePartida: [{ subtotal: 600 }, { subtotal: 350 }] })
  assert.equal(completo.exactitud_costo, 0.95)
})

test('compararCorridas compara ESTRUCTURALMENTE: dos corridas iguales no difieren', () => {
  // MUTACIÓN QUE LO PONE ROJO: volver a `if (a[k] === b[k]) continue`.
  // Con métricas que son objetos, `===` compara referencias y el control del §39 daría rojo
  // permanente — y un control que siempre está en rojo se apaga.
  const a = metricasDeCorrida({ cantidades: VEINTISEIS, investigaciones: [{ resueltoEn: 'BASE_MAESTRA' }] })
  const b = metricasDeCorrida({ cantidades: VEINTISEIS, investigaciones: [{ resueltoEn: 'BASE_MAESTRA' }] })
  assert.deepEqual(compararCorridas(a, b).diferencias, [])
  const c = metricasDeCorrida({ cantidades: VEINTISEIS, investigaciones: [{ resueltoEn: 'WEB' }] })
  assert.ok(compararCorridas(a, c).diferencias.some((d) => d.metrica === 'investigaciones_por_paso'))
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
