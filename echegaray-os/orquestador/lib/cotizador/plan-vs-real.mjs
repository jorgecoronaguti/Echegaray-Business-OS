// §18 · PLAN CONTRA REAL. Siete comparaciones, y la disciplina de no contestar cuando no se puede.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// `comparable: false` NO ES «sin desvío». Una partida sin ejecución todavía, una sin HH cargadas y
// una que va por la mitad salen todas con `comparable: false` y su motivo, y NINGUNA entra a un
// promedio de desvío. El resumen las cuenta aparte, para que «0 desvíos» nunca se pueda leer como
// «todo bien» cuando en realidad significa «no había con qué mirar».
//
// El defecto que esto evita es concreto y ya se pagó en este repo: un control que no puede dar rojo
// (`control-que-no-puede-decir-que-no`). Si el porcentaje de avance se convirtiera en cantidad
// ejecutada, el desvío de cantidad daría CERO en las 26 partidas de Quattropani y el tablero diría
// que la obra va perfecta.
//
// ═══ UNA CAUSA SIN EVIDENCIA ES UNA CAUSA INVENTADA ═══
//
// El desvío lo calcula la aritmética; la causa la dice una persona. `causaDeDesvio()` sólo lee
// `obra_ejecucion.causa_desvio` y `registros_hh.causa_desvio`. Si no hay ninguna, `SIN_CAUSA`.
// Deducir «llovió» de que la duración se estiró es exactamente el dato que después entra a una
// cotización futura y la envenena.
//
// ═══ POR QUÉ LA COMPARACIÓN SE NIEGA A CRUZAR UNIDADES ═══
//
// `compararMagnitud` levanta excepción si las unidades no coinciden. Sin eso, pasarle las HH reales
// donde va la duración devuelve un número perfectamente plausible —«plan 12, real 160, +1233%»— y
// nadie lo nota hasta que se contrata gente de más.

import { ESTADO } from './contrato.mjs'
import { UNIDAD, magnitud, num } from './ejecucion-real.mjs'

export const MOTOR = 'plan-vs-real/1.0.0'

export const CONCEPTO = Object.freeze({
  CANTIDAD: 'CANTIDAD',
  HH: 'HH',
  RENDIMIENTO: 'RENDIMIENTO',
  MATERIAL: 'MATERIAL',
  PRECIO: 'PRECIO',
  DURACION: 'DURACION',
  COSTO: 'COSTO',
})

/** Por qué una comparación no se puede hacer. Cada uno es un hueco distinto y se arregla distinto. */
export const NO_COMPARABLE = Object.freeze({
  SIN_PLAN: 'SIN_PLAN',                          // la partida heredó el hueco de la cotización
  SIN_REAL: 'SIN_REAL',                          // todavía no se ejecutó nada
  SOLO_PORCENTAJE: 'SOLO_PORCENTAJE',            // hay avance pero nadie cargó la cantidad
  PARTIDA_EN_CURSO: 'PARTIDA_EN_CURSO',          // empezada: comparar el total sería un falso desvío
  SIN_HH_REALES: 'SIN_HH_REALES',
  SIN_COSTO_REAL: 'SIN_COSTO_REAL',
  SUBCONTRATADA_SIN_HH: 'SUBCONTRATADA_SIN_HH',  // 0 HH propias es un hecho, no un desvío
  SIN_RECURSO_EN_COMPOSICION: 'SIN_RECURSO_EN_COMPOSICION',
  SIN_CONSUMO_REGISTRADO: 'SIN_CONSUMO_REGISTRADO',
})

export const SIN_CAUSA = 'SIN_CAUSA'

/**
 * COMPARAR DOS MAGNITUDES DE LA MISMA UNIDAD. PURA.
 *
 * Levanta si las unidades difieren: HH contra días, o pesos contra m², son errores de programa y no
 * resultados con un desvío grande.
 */
export function compararMagnitud(plan, real) {
  if (plan.unidad !== real.unidad) {
    throw new Error(`no se comparan ${plan.unidad} contra ${real.unidad}: son magnitudes distintas y el resultado parecería un número válido`)
  }
  if (plan.valor === null || real.valor === null) return Object.freeze({ desvio: null, desvioPct: null })
  const desvio = real.valor - plan.valor
  // Sin división por cero: un plan de 0 con real >0 tiene desvío absoluto y NO tiene porcentaje.
  // Escribir Infinity o 100 acá mandaría la partida al tope o al fondo de cualquier ranking.
  return Object.freeze({ desvio, desvioPct: plan.valor === 0 ? null : (desvio / plan.valor) * 100 })
}

/** UNA OBSERVACIÓN. PURA. */
export function observacion({
  concepto, entidad, cotizacionPartidaId = null, unidad, plan, real,
  comparable, motivoNoComparable = null, causa = SIN_CAUSA, evidencia = null, estado = null,
} = {}) {
  if (!Object.values(CONCEPTO).includes(concepto)) throw new Error(`concepto desconocido: ${concepto}`)
  if (!entidad) throw new Error('una observación sin entidad no se puede accionar: ¿qué partida hay que mirar?')
  if (comparable && motivoNoComparable) throw new Error('una observación comparable no puede traer motivo de no comparable')
  if (!comparable && !motivoNoComparable) throw new Error('no comparable sin motivo es un hueco escondido: hay que decir por qué')
  const dif = comparable ? compararMagnitud(plan, real) : { desvio: null, desvioPct: null }
  return Object.freeze({
    concepto, entidad, cotizacionPartidaId, unidad,
    plan: plan.valor, real: real.valor,
    desvio: dif.desvio, desvioPct: dif.desvioPct,
    comparable, motivoNoComparable,
    causa, evidencia,
    estado: estado ?? (comparable ? ESTADO.CALCULADO : ESTADO.FALTA_DATO),
  })
}

/** LA CAUSA, SÓLO SI ALGUIEN LA ESCRIBIÓ. PURA. */
export function causaDeDesvio(real) {
  const causas = [...new Set((real?.incidencias ?? []).map((i) => i.causa).filter(Boolean))]
  if (!causas.length) return Object.freeze({ causa: SIN_CAUSA, evidencia: null })
  if (causas.length > 1) {
    return Object.freeze({
      causa: 'CAUSAS_MULTIPLES',
      evidencia: { causas, incidencias: real.incidencias.length },
    })
  }
  return Object.freeze({ causa: causas[0], evidencia: { incidencias: real.incidencias.filter((i) => i.causa === causas[0]) } })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS SIETE COMPARACIONES
// ══════════════════════════════════════════════════════════════════════════════════════════════

const nada = (u) => magnitud(null, u)

function obsCantidad(plan, real, causa) {
  const base = { concepto: CONCEPTO.CANTIDAD, entidad: plan.codigo ?? plan.descripcion, cotizacionPartidaId: plan.cotizacionPartidaId, unidad: plan.unidad ?? null, ...causa }
  const p = magnitud(plan.cantidadPlan, UNIDAD.FISICA)
  if (p.valor === null) return observacion({ ...base, plan: p, real: real.cantidad, comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_PLAN })
  if (real.cantidad.valor === null) {
    return observacion({ ...base, plan: p, real: real.cantidad, comparable: false, motivoNoComparable: real.motivoCantidad === 'SOLO_PORCENTAJE' ? NO_COMPARABLE.SOLO_PORCENTAJE : NO_COMPARABLE.SIN_REAL })
  }
  // Una partida abierta NO se compara contra su cantidad total. 20 de 46,74 m³ excavados no son un
  // −57%: son una excavación empezada. Sólo el cierre convierte la diferencia en desvío.
  if (!real.cerrada) return observacion({ ...base, plan: p, real: real.cantidad, comparable: false, motivoNoComparable: NO_COMPARABLE.PARTIDA_EN_CURSO })
  return observacion({ ...base, plan: p, real: real.cantidad, comparable: true })
}

function obsHH(plan, real, causa) {
  const base = { concepto: CONCEPTO.HH, entidad: plan.codigo ?? plan.descripcion, cotizacionPartidaId: plan.cotizacionPartidaId, unidad: UNIDAD.HH, ...causa }
  const p = magnitud(plan.hhPlan, UNIDAD.HH)
  if (p.valor === null) return observacion({ ...base, plan: p, real: real.hhReales, comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_PLAN })
  if (real.hhReales.valor === null) {
    // Subcontratada con 0 HH previstas y sin HH imputadas: NO_APLICA, no es un hueco a llenar.
    return observacion({ ...base, plan: p, real: real.hhReales, comparable: false, estado: plan.subcontratada ? ESTADO.NO_APLICA : ESTADO.FALTA_DATO, motivoNoComparable: plan.subcontratada ? NO_COMPARABLE.SUBCONTRATADA_SIN_HH : NO_COMPARABLE.SIN_HH_REALES })
  }
  // Plan 0 con horas reales SÍ se compara: se están gastando horas propias en algo que se pagó a un
  // tercero, y ese es uno de los hallazgos más caros que puede dar esta comparación.
  return observacion({ ...base, plan: p, real: real.hhReales, comparable: true })
}

function obsRendimiento(plan, real, causa) {
  const base = { concepto: CONCEPTO.RENDIMIENTO, entidad: plan.codigo ?? plan.descripcion, cotizacionPartidaId: plan.cotizacionPartidaId, unidad: UNIDAD.RATIO, ...causa }
  const p = magnitud(plan.hsUnitariasPlan, UNIDAD.RATIO)
  const cant = real.cantidad.valor
  const hh = real.hhReales.valor
  // El rendimiento SÍ se puede leer con la partida abierta: es un cociente, no un total. 20 m³ en
  // 90 HH ya dicen 4,5 HH/m³ contra 3,4 cotizadas, sin esperar a que termine.
  const r = (cant !== null && cant > 0 && hh !== null) ? magnitud(hh / cant, UNIDAD.RATIO) : nada(UNIDAD.RATIO)
  if (p.valor === null) return observacion({ ...base, plan: p, real: r, comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_PLAN })
  if (r.valor === null) return observacion({ ...base, plan: p, real: r, comparable: false, motivoNoComparable: hh === null ? NO_COMPARABLE.SIN_HH_REALES : NO_COMPARABLE.SOLO_PORCENTAJE })
  return observacion({ ...base, plan: p, real: r, comparable: true })
}

function obsDuracion(plan, real, causa) {
  const base = { concepto: CONCEPTO.DURACION, entidad: plan.codigo ?? plan.descripcion, cotizacionPartidaId: plan.cotizacionPartidaId, unidad: UNIDAD.DIA, ...causa }
  const p = magnitud(plan.diasPlan, UNIDAD.DIA)
  // `real.duracion` está en días por construcción; `compararMagnitud` lo verifica igual. Si alguien
  // cambiara esto por `real.hhReales`, el test lo agarra como excepción y no como un número raro.
  if (p.valor === null) return observacion({ ...base, plan: p, real: real.duracion, comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_PLAN })
  if (real.duracion.valor === null) return observacion({ ...base, plan: p, real: real.duracion, comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_REAL })
  return observacion({ ...base, plan: p, real: real.duracion, comparable: true })
}

function obsCosto(plan, real, causa) {
  const base = { concepto: CONCEPTO.COSTO, entidad: plan.codigo ?? plan.descripcion, cotizacionPartidaId: plan.cotizacionPartidaId, unidad: UNIDAD.MONEDA, ...causa }
  const p = magnitud(plan.costoPlan, UNIDAD.MONEDA)
  if (p.valor === null) return observacion({ ...base, plan: p, real: real.costoReal, comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_PLAN })
  if (real.costoReal.valor === null) return observacion({ ...base, plan: p, real: real.costoReal, comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_COSTO_REAL })
  // Mismo criterio que la cantidad: el costo de una partida abierta va contra un plan completo, así
  // que «gastamos el 40%» no es «ahorramos el 60%».
  if (!real.cerrada) return observacion({ ...base, plan: p, real: real.costoReal, comparable: false, motivoNoComparable: NO_COMPARABLE.PARTIDA_EN_CURSO })
  return observacion({ ...base, plan: p, real: real.costoReal, comparable: true })
}

/** MATERIAL y PRECIO, recurso por recurso. Un recurso consumido que no está en la composición sale
 *  igual, con plan `null` — es material que la obra usó y la cotización no previó. */
function obsPorRecurso(plan, real, causa) {
  const out = []
  const clave = (x) => String(x.recurso ?? x.nombre ?? '').trim().toLowerCase()
  const consumo = new Map()
  for (const m of real.materialConsumido) {
    const k = clave(m)
    const acc = consumo.get(k) ?? { cantidad: null, monto: 0, precios: [], nombre: m.nombre, unidad: m.unidad }
    if (m.cantidad !== null) acc.cantidad = (acc.cantidad ?? 0) + m.cantidad
    acc.monto += m.monto ?? 0
    if (m.precioUnitario !== null) acc.precios.push({ p: m.precioUnitario, q: m.cantidad ?? 1 })
    consumo.set(k, acc)
  }

  for (const c of real.composicionPlan) {
    if (c.tipo && !['material', 'MATERIAL'].includes(c.tipo)) continue
    const k = clave(c)
    const vis = consumo.get(k)
    if (vis) consumo.delete(k)
    const base = { entidad: `${plan.codigo ?? plan.descripcion}·${c.recurso}`, cotizacionPartidaId: plan.cotizacionPartidaId, ...causa }
    // Cantidad prevista = unitaria × (1+desperdicio) × cantidad de la partida. Sin cantidad de
    // partida no hay cantidad prevista: no se asume 1.
    const prevista = (c.cantidadUnitaria !== null && plan.cantidadPlan !== null)
      ? c.cantidadUnitaria * (1 + (c.desperdicio ?? 0)) * plan.cantidadPlan : null
    out.push(observacion({
      ...base, concepto: CONCEPTO.MATERIAL, unidad: c.unidad ?? null,
      plan: magnitud(prevista, UNIDAD.FISICA), real: magnitud(vis?.cantidad ?? null, UNIDAD.FISICA),
      comparable: prevista !== null && (vis?.cantidad ?? null) !== null,
      motivoNoComparable: prevista === null ? NO_COMPARABLE.SIN_PLAN : ((vis?.cantidad ?? null) === null ? NO_COMPARABLE.SIN_CONSUMO_REGISTRADO : null),
    }))
    // Precio ponderado por cantidad: el promedio simple hace que una compra de 2 bolsas pese lo
    // mismo que una de 200 y el «precio real» deje de ser el precio real.
    const pesoTotal = (vis?.precios ?? []).reduce((a, x) => a + x.q, 0)
    const precioReal = pesoTotal > 0 ? (vis.precios.reduce((a, x) => a + x.p * x.q, 0) / pesoTotal) : null
    out.push(observacion({
      ...base, concepto: CONCEPTO.PRECIO, unidad: c.unidad ?? null,
      plan: magnitud(c.costoUnitario, UNIDAD.MONEDA), real: magnitud(precioReal, UNIDAD.MONEDA),
      comparable: c.costoUnitario !== null && precioReal !== null,
      motivoNoComparable: c.costoUnitario === null ? NO_COMPARABLE.SIN_PLAN : (precioReal === null ? NO_COMPARABLE.SIN_CONSUMO_REGISTRADO : null),
    }))
  }

  // Lo que se consumió y la composición no preveía. NO se descarta: es alcance que se ejecutó y no
  // se cotizó, o una imputación mal hecha, y las dos hay que mirarlas.
  for (const [k, vis] of consumo) {
    out.push(observacion({
      concepto: CONCEPTO.MATERIAL, entidad: `${plan.codigo ?? plan.descripcion}·${k}`, cotizacionPartidaId: plan.cotizacionPartidaId,
      unidad: vis.unidad ?? null, plan: nada(UNIDAD.FISICA), real: magnitud(vis.cantidad, UNIDAD.FISICA),
      comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_RECURSO_EN_COMPOSICION,
      evidencia: { monto: vis.monto, nombre: vis.nombre }, ...causa, estado: ESTADO.CONFLICTO,
    }))
  }
  return out
}

/** LAS SIETE COMPARACIONES DE UNA PARTIDA. PURA. */
export function compararPartida({ plan, real }) {
  if (!plan || !real) throw new Error('comparar necesita el plan congelado Y la ejecución real: sin uno de los dos no hay comparación, hay una lista')
  const causa = causaDeDesvio(real)
  return Object.freeze([
    obsCantidad(plan, real, causa),
    obsHH(plan, real, causa),
    obsRendimiento(plan, real, causa),
    obsDuracion(plan, real, causa),
    obsCosto(plan, real, causa),
    ...obsPorRecurso(plan, real, causa),
  ])
}

/**
 * PLAN CONTRA REAL DE UNA OBRA ENTERA. PURA.
 *
 * `plan` son las filas de `obra_partida_plan`; `ejecucion` es lo que devuelve `consolidarEjecucion`.
 */
export function compararObra({ obraId, plan = [], ejecucion } = {}) {
  const porPartida = new Map(ejecucion.partidas.map((p) => [String(p.cotizacionPartidaId), p]))
  const observaciones = []
  const sinReal = []
  for (const p of plan) {
    const real = porPartida.get(String(p.cotizacionPartidaId))
    if (!real) { sinReal.push(p.codigo ?? p.descripcion); continue }
    observaciones.push(...compararPartida({ plan: p, real }))
  }

  const comparables = observaciones.filter((o) => o.comparable)
  const conteoPorMotivo = {}
  for (const o of observaciones) if (!o.comparable) conteoPorMotivo[o.motivoNoComparable] = (conteoPorMotivo[o.motivoNoComparable] ?? 0) + 1

  return Object.freeze({
    obraId,
    observaciones: Object.freeze(observaciones),
    resumen: Object.freeze({
      partidasEnPlan: plan.length,
      partidasSinEjecucionConsolidada: sinReal.length,
      observaciones: observaciones.length,
      comparables: comparables.length,
      noComparables: observaciones.length - comparables.length,
      // Sin este desglose, «14 no comparables» no dice si falta cargar cantidades o si la obra
      // recién empezó, y son dos acciones distintas.
      porMotivo: Object.freeze(conteoPorMotivo),
      conCausa: observaciones.filter((o) => o.causa !== SIN_CAUSA).length,
      sinCausa: observaciones.filter((o) => o.causa === SIN_CAUSA).length,
      // El promedio se calcula SÓLO sobre las comparables, y es `null` si no hay ninguna: un
      // promedio de cero observaciones vale 0 en JavaScript y se lee como «sin desvío».
      desvioPctPromedio: comparables.filter((o) => o.desvioPct !== null).length
        ? comparables.filter((o) => o.desvioPct !== null).reduce((a, o) => a + o.desvioPct, 0) / comparables.filter((o) => o.desvioPct !== null).length
        : null,
      sinImputar: ejecucion.resumen.sinImputar,
    }),
    motor: MOTOR,
  })
}

export { num }
