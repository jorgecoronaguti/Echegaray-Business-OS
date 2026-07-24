// DISEÑADOR DE ESTRATEGIAS DE TESORERÍA — el motor piensa como un CFO, no como un planificador de tareas.
//
// ═══ QUÉ CAMBIA (24/07) ═══
//
// El plan de tesorería (plan-tesoreria.mjs) sabía construir UN plan siguiendo UNA política fija
// (pagar con caja → financiar críticos → postergar el resto → cancelar línea apenas entra caja). Eso lo
// convertía en un planificador operativo: bueno para ejecutar, pero no para DECIDIR. El dueño pidió lo
// contrario: primero DISEÑAR LA MEJOR ESTRATEGIA FINANCIERA posible, y recién después derivar el plan
// operativo como su CONSECUENCIA.
//
// Este módulo es esa capa de decisión. Por cada horizonte:
//   1. CUESTIONA el estado: no da por buena la primera política. Genera VARIAS estrategias completas
//      —posturas distintas de CFO sobre la MISMA data real— corriendo el mismo núcleo `construirPlan`
//      con palancas distintas (piso de liquidez, financiar o no lo no crítico).
//   2. EVALÚA cada estrategia con las métricas que el propio plan ya calculó (costo financiero, pagos
//      postergados, caja proyectada, uso de línea) — ni un peso nuevo se inventa acá.
//   3. COMPARA y ELIGE una con un objetivo CFO explícito y lexicográfico (factibilidad → costo financiero
//      → cumplimiento → liquidez → uso de línea), diciendo qué criterio la hizo ganar.
//   4. DERIVA el plan operativo de la elegida y expone las descartadas con su porqué.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO: NO INVENTAR DATOS, NO RECALCULAR PLATA ═══
//
// Las estrategias NO difieren en la data (caja, cobranzas, obligaciones, costo del descubierto son fuentes
// únicas verificadas): difieren en la POSTURA —una DECISIÓN de negocio, no un hecho—. El piso elevado de
// la estrategia defensiva se DERIVA de los críticos reales del horizonte, no de un número arbitrario.
// Todas las métricas salen del `resumen` que `construirPlan` ya devolvió. Si un número no coincide con su
// fuente, es un bug de arquitectura.
//
// ═══ POLÍTICA DE RIESGO ═══
//
// El diseñador DECIDE y ORDENA; no ejecuta. El plan elegido conserva `requiere_aprobacion: true` en cada
// acción con efecto externo (Nivel E). Ninguna estrategia excede el límite de la línea para "cumplir": si
// una postura necesita más fondos de los disponibles, la comparación la penaliza y lo dice, no lo tapa.

import { construirPlan, esCritico } from './plan-tesoreria.mjs'
import { fmt } from './ingenieria-financiera.mjs'

const round = (n) => Math.round(Number(n) || 0)

// ════════════════════════════════════════════════════════════════════════════
// EL CATÁLOGO DE POSTURAS — las estrategias que un CFO contrastaría
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cada política es una POSTURA de CFO sobre la misma realidad. `palancas` son las que entiende el núcleo
 * `construirPlan`; `cushionModo` lo resuelve este módulo (deriva el piso defensivo de la data real).
 */
export const POLITICAS = [
  {
    clave: 'costo_minimo',
    nombre: 'Costo financiero mínimo',
    objetivo: 'minimizar el interés pagado por la línea sin perforar la liquidez mínima',
    razonamiento: 'paga con caja propia lo que alcanza, financia SÓLO lo crítico con la línea más barata y la cancela apenas entra caja; posterga —negociando plazo— lo no crítico que la caja no cubre. Es la postura que menos plata quema.',
    palancas: { financiarNoCriticos: false },
    cushionModo: 'ninguno',
  },
  {
    clave: 'cumplimiento',
    nombre: 'Cumplimiento y relaciones',
    objetivo: 'honrar en fecha la mayor cantidad de compromisos (proveedores y obras) usando el margen de línea disponible',
    razonamiento: 'cuando la caja no alcanza y hay margen real de línea, financia también lo no crítico para NO postergar pagos; acepta más costo financiero a cambio de sostener la ficha con proveedores y no frenar obras. Nunca excede el límite del acuerdo.',
    palancas: { financiarNoCriticos: true },
    cushionModo: 'ninguno',
  },
  {
    clave: 'caja_protegida',
    nombre: 'Caja protegida (defensiva)',
    objetivo: 'preservar un colchón de caja mayor por si una cobranza no entra en fecha',
    razonamiento: 'eleva el piso de liquidez para cubrir los compromisos críticos del horizonte aunque un cobro se atrase; posterga más lo no crítico y usa menos caja. Cambia relación por solvencia — defensiva ante cobranzas inciertas.',
    palancas: { financiarNoCriticos: false },
    cushionModo: 'criticos_horizonte',
  },
]

// ════════════════════════════════════════════════════════════════════════════
// GENERAR UNA ESTRATEGIA COMPLETA A PARTIR DE UNA POSTURA
// ════════════════════════════════════════════════════════════════════════════

/** El colchón defensivo: la suma de egresos CRÍTICOS del horizonte (data real), no un número inventado. */
function cushionCriticos(dias = []) {
  let s = 0
  for (const dia of dias) {
    for (const m of dia.movimientos || []) {
      if (m.tipo === 'egreso' && esCritico(m)) s += Math.abs(Number(m.monto) || 0)
    }
  }
  return round(s)
}

/** Las métricas comparables de una estrategia — TODAS salen del resumen que construirPlan ya calculó. */
function metricas(resumen, cushion) {
  const t = resumen.por_tipo
  return {
    costo_financiero: resumen.costo_financiero_total,
    postergados: t.postergar,
    financiados: t.financiar,
    pagos_en_fecha: t.pagar,
    cobros: t.cobrar,
    saldo_final: resumen.saldo_proyectado_final,
    linea_maxima: resumen.linea_maxima_usada,
    limite_linea: resumen.limite_linea,
    excede_limite: resumen.excede_limite_linea,
    piso_liquidez: resumen.liquidez_minima,
    colchon_defensivo: cushion,
  }
}

/** Construye una estrategia completa: corre el núcleo con la postura y narra su lectura de CFO. */
function construirEstrategia(pol, ctx) {
  const cushion = pol.cushionModo === 'criticos_horizonte' ? cushionCriticos(ctx.dias) : 0
  const liquidezMinima = (Number(ctx.liquidezMinima) || 0) + cushion
  const plan = construirPlan({ ...ctx, liquidezMinima, politica: pol.palancas })
  const m = metricas(plan.resumen, cushion)
  return {
    clave: pol.clave,
    nombre: pol.nombre,
    objetivo: pol.objetivo,
    razonamiento: pol.razonamiento,
    palancas: { financiar_no_criticos: !!pol.palancas.financiarNoCriticos, piso_liquidez: liquidezMinima, colchon_defensivo: cushion },
    metricas: m,
    beneficios: beneficios(pol, m),
    riesgos: riesgos(pol, m),
    impacto: impacto(m),
    plan, // {acciones, resumen, resumen_estrategico} — el plan operativo derivado de ESTA estrategia
    alternativas_descartadas: [], // se completa tras la comparación
  }
}

/** Beneficios derivados de la postura + sus métricas. Sin números nuevos. */
function beneficios(pol, m) {
  const b = []
  if (m.costo_financiero === 0) b.push('no usa la línea: cero costo financiero en el horizonte')
  else if (pol.clave === 'costo_minimo') b.push(`minimiza el interés del período: ${fmt(m.costo_financiero)} de costo financiero`)
  if (pol.clave === 'cumplimiento') b.push(`honra ${m.pagos_en_fecha} pago(s) en fecha y posterga sólo ${m.postergados}: protege la relación con proveedores y obras`)
  if (pol.clave === 'caja_protegida') b.push(`preserva un colchón: piso de liquidez ${fmt(m.piso_liquidez)}, caja proyectada ${fmt(m.saldo_final)} — resiste una cobranza que se atrase`)
  if (m.postergados === 0 && m.financiados === 0) b.push('cubre todo dentro de la caja disponible sin postergar ni financiar')
  return b.length ? b : ['opera dentro de la caja del horizonte']
}

/** Riesgos derivados de la postura + sus métricas. */
function riesgos(pol, m) {
  const r = []
  if (m.excede_limite) r.push(`EXCEDE el límite de la línea (${fmt(m.limite_linea)}): hace falta otra fuente de fondos — la postura no alcanza sola`)
  if (m.postergados > 0) r.push(`posterga ${m.postergados} pago(s): hay que negociar el nuevo plazo para no dañar la relación`)
  if (m.costo_financiero > 0) r.push(`paga ${fmt(m.costo_financiero)} de costo financiero por usar la línea`)
  if (pol.clave === 'caja_protegida' && m.financiados > 0) r.push('el piso elevado empuja más faltante a la línea: más costo a cambio de más colchón')
  return r.length ? r : ['sin riesgos financieros relevantes en el horizonte']
}

/** El impacto esperado sobre las 7 dimensiones que pide el spec. Derivado de las métricas. */
function impacto(m) {
  return {
    caja: `saldo proyectado ${fmt(m.saldo_final)}`,
    liquidez: `piso ${fmt(m.piso_liquidez)}${m.colchon_defensivo ? ` (incluye colchón defensivo ${fmt(m.colchon_defensivo)})` : ''}; pico de línea ${fmt(m.linea_maxima)} sobre ${fmt(m.limite_linea)}`,
    costo_financiero: m.costo_financiero > 0 ? `${fmt(m.costo_financiero)} de interés` : 'sin costo financiero',
    obras: m.financiados > 0 ? `${m.financiados} compromiso(s) crítico(s)/de obra sostenidos con línea` : 'sin financiamiento de obra',
    proveedores: `${m.pagos_en_fecha} pago(s) en fecha, ${m.postergados} a renegociar`,
    clientes: m.cobros > 0 ? `${m.cobros} cobranza(s) que habilitan el plan del período` : 'sin cobranzas en el horizonte',
    obligaciones: m.excede_limite ? 'quedan compromisos sin cobertura de fondos' : 'los compromisos del horizonte quedan cubiertos por el plan',
  }
}

// ════════════════════════════════════════════════════════════════════════════
// COMPARAR Y ELEGIR — el objetivo CFO, lexicográfico y explícito
// ════════════════════════════════════════════════════════════════════════════

// El orden importa: es la función de preferencia del CFO. Factibilidad primero (nunca exceder la línea),
// luego el menor costo financiero, luego cumplir más (menos postergados), luego más caja, luego menos
// línea. Es lexicográfico a propósito: no mezcla pesos arbitrarios entre pesos y cantidades — sería
// inventar precisión. Cada criterio dice, además, cómo formatear la diferencia que lo hizo decidir.
const CRITERIOS = [
  { clave: 'factibilidad', desc: 'factibilidad (no exceder la línea)', cmp: (a, b) => Number(a.metricas.excede_limite) - Number(b.metricas.excede_limite), val: (e) => (e.metricas.excede_limite ? 'excede el límite' : 'dentro del límite') },
  { clave: 'costo_financiero', desc: 'menor costo financiero', cmp: (a, b) => a.metricas.costo_financiero - b.metricas.costo_financiero, val: (e) => fmt(e.metricas.costo_financiero) },
  { clave: 'cumplimiento', desc: 'menos pagos postergados', cmp: (a, b) => a.metricas.postergados - b.metricas.postergados, val: (e) => `${e.metricas.postergados} postergado(s)` },
  { clave: 'liquidez', desc: 'mayor caja proyectada', cmp: (a, b) => b.metricas.saldo_final - a.metricas.saldo_final, val: (e) => fmt(e.metricas.saldo_final) },
  { clave: 'uso_linea', desc: 'menor uso de línea', cmp: (a, b) => a.metricas.linea_maxima - b.metricas.linea_maxima, val: (e) => fmt(e.metricas.linea_maxima) },
]

/** Compara dos estrategias lexicográficamente; devuelve el signo y el criterio que decidió. */
function comparar(a, b) {
  for (const c of CRITERIOS) {
    const d = c.cmp(a, b)
    if (d !== 0) return { d, criterio: c }
  }
  return { d: 0, criterio: null }
}

/** Ordena las estrategias por preferencia de CFO y detecta el criterio decisivo entre 1ª y 2ª. */
function rankear(estrategias) {
  const orden = [...estrategias].sort((a, b) => comparar(a, b).d)
  const criterio = orden.length > 1 ? comparar(orden[0], orden[1]).criterio : null
  return { orden, criterio }
}

/** La diferencia legible de `otra` respecto de `base` — para las alternativas descartadas. */
function diferenciaTexto(base, otra) {
  const partes = []
  const dCosto = otra.metricas.costo_financiero - base.metricas.costo_financiero
  if (dCosto > 0) partes.push(`cuesta ${fmt(dCosto)} más de costo financiero`)
  else if (dCosto < 0) partes.push(`cuesta ${fmt(-dCosto)} menos de costo financiero`)
  const dPost = otra.metricas.postergados - base.metricas.postergados
  if (dPost > 0) partes.push(`posterga ${dPost} pago(s) más`)
  else if (dPost < 0) partes.push(`posterga ${-dPost} pago(s) menos`)
  const dCaja = otra.metricas.saldo_final - base.metricas.saldo_final
  if (dCaja > 0) partes.push(`deja ${fmt(dCaja)} más de caja`)
  else if (dCaja < 0) partes.push(`deja ${fmt(-dCaja)} menos de caja`)
  if (otra.metricas.excede_limite && !base.metricas.excede_limite) partes.push('y EXCEDE el límite de la línea')
  return partes.length ? partes.join('; ') : 'produce el mismo resultado (empatan en las métricas)'
}

/** Cada estrategia expone, como CFO, qué otras posturas descartó y en qué se diferencian de ella. */
function atarAlternativas(generadas, elegidaClave) {
  for (const e of generadas) {
    e.alternativas_descartadas = generadas
      .filter((o) => o.clave !== e.clave)
      .map((o) => ({ clave: o.clave, nombre: o.nombre, objetivo: o.objetivo, diferencia_vs_esta: diferenciaTexto(e, o), es_la_elegida: o.clave === elegidaClave }))
  }
}

/** El texto de la comparación: objetivo CFO, ranking con métricas, y por qué ganó la elegida. */
function compararTexto(orden, criterio) {
  const g = orden[0]
  const s = orden[1]
  const objetivoCfo = 'prioridad CFO: ' + CRITERIOS.map((c) => c.desc).join(' → ')
  let justificacion
  if (!s) justificacion = `${g.nombre}: única estrategia evaluada.`
  else if (!criterio) justificacion = `${g.nombre}: empata en todas las métricas con "${s.nombre}" (no hay tensión de financiamiento que las separe); se elige la más conservadora en costo.`
  else justificacion = `${g.nombre} gana por ${criterio.desc}: ${criterio.val(g)} vs ${criterio.val(s)} de "${s.nombre}". ${g.objetivo}.`
  return {
    objetivo_cfo: objetivoCfo,
    criterio_decisivo: criterio?.clave || 'empate',
    ranking: orden.map((e, i) => ({
      puesto: i + 1, clave: e.clave, nombre: e.nombre,
      costo_financiero: e.metricas.costo_financiero, postergados: e.metricas.postergados,
      saldo_final: e.metricas.saldo_final, linea_maxima: e.metricas.linea_maxima, excede_limite: e.metricas.excede_limite,
    })),
    justificacion,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LA API PÚBLICA — diseñar, comparar, elegir, derivar el plan
// ════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: genera todas las estrategias del catálogo sobre el mismo contexto, las compara con el
 * objetivo de CFO, elige una y expone el plan operativo de la elegida como su consecuencia.
 *
 * @param {object} ctx el mismo contexto que recibe construirPlan {dias, cajaInicial, liquidezMinima,
 *   limiteDescubierto, hoy, paramsFin, accionesAnteriores}
 * @returns {{plan_elegido:object, estrategias:{generadas:Array, elegida:string, comparacion:object}}}
 */
export function disenarEstrategias(ctx = {}) {
  const generadas = POLITICAS.map((pol) => construirEstrategia(pol, ctx))
  const { orden, criterio } = rankear(generadas)
  const elegida = orden[0]
  atarAlternativas(generadas, elegida.clave)
  return {
    plan_elegido: elegida.plan,
    estrategias: {
      generadas,
      elegida: elegida.clave,
      comparacion: compararTexto(orden, criterio),
    },
  }
}
