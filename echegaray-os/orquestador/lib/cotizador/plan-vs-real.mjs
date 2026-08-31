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
import { SIN_MEDIR } from './metricas.mjs'

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
  // Plan 0 con horas reales SÍ se compara SIEMPRE: se están gastando horas propias en algo que se
  // pagó a un tercero, y eso es un hallazgo esté la partida cerrada o abierta.
  if (p.valor === 0) return observacion({ ...base, plan: p, real: real.hhReales, comparable: true })
  // ═══ LAS HH SON UN TOTAL, COMO LA CANTIDAD Y EL COSTO ═══
  // Lo descubrió la corrida REAL sobre Quattropani: T1002 tenía 10 HH imputadas contra 158,9
  // cotizadas y salía «−93,7%», o sea la excavación más eficiente de la historia. No es eficiencia:
  // es una partida que recién empezó. El único que se puede leer con la partida abierta es el
  // RENDIMIENTO, porque es un cociente y no un acumulado.
  if (!real.cerrada) return observacion({ ...base, plan: p, real: real.hhReales, comparable: false, motivoNoComparable: NO_COMPARABLE.PARTIDA_EN_CURSO })
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
      // `...causa` va PRIMERO y la evidencia propia después: al revés, el `evidencia: null` que trae
      // una causa SIN_CAUSA pisaba el monto del material no cotizado y el hallazgo llegaba sin la
      // plata que lo hace accionable. Lo encontró el test, no la revisión.
      ...causa,
      concepto: CONCEPTO.MATERIAL, entidad: `${plan.codigo ?? plan.descripcion}·${k}`, cotizacionPartidaId: plan.cotizacionPartidaId,
      unidad: vis.unidad ?? null, plan: nada(UNIDAD.FISICA), real: magnitud(vis.cantidad, UNIDAD.FISICA),
      comparable: false, motivoNoComparable: NO_COMPARABLE.SIN_RECURSO_EN_COMPOSICION,
      evidencia: { monto: vis.monto, nombre: vis.nombre, causaDeclarada: causa.evidencia },
      estado: ESTADO.CONFLICTO,
    }))
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CAUSA RAÍZ — POR QUÉ NO SE PUDO COMPARAR, UN NIVEL MÁS ABAJO QUE EL MOTIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `motivoNoComparable` dice QUÉ faltó en la comparación. No dice QUIÉN lo tiene que arreglar, y por
// eso una tabla de motivos no se puede accionar: «SIN_CONSUMO_REGISTRADO ×275» se lee como «faltan
// 275 facturas» cuando en realidad `obra_partida_costo_real` está vacía en TODA la base y lo que
// falta es una sola cosa —la captura de costo— repetida 275 veces.
//
// La distinción que importa no es entre motivos: es entre DISPOSICIONES. Un enganche que falta se
// arregla hoy escribiendo código; un dato que nadie cargó se arregla en obra; una partida que
// todavía no terminó no se arregla, se espera. Mezclarlas produce una lista de 404 «pendientes» que
// nadie puede repartir.
//
// ═══ LA CAUSA NO SE ADIVINA DEL MOTIVO: NECESITA CONTEXTO ═══
//
// El MISMO motivo tiene causas distintas según lo que haya alrededor, y por eso `causaRaiz` pide un
// contexto y no se puede calcular con la observación sola:
//
//   · `SIN_COSTO_REAL` con la tabla de costos VACÍA es falta de captura.
//   · `SIN_COSTO_REAL` con la tabla LLENA y esta partida en cero es otra cosa —una imputación que no
//     engancha, un recurso nombrado distinto de los dos lados— y se arregla en el OS, no en obra.
//
// Un clasificador que devolviera siempre lo mismo sería la constante disfrazada que este repo ya
// pagó. Por eso las dos ramas existen y las dos están probadas.

/** Quién arregla cada hueco. Es lo único que convierte la tabla en trabajo repartible. */
export const DISPOSICION = Object.freeze({
  ESTRUCTURA: 'ESTRUCTURA',   // el enganche falta y se arregla en el OS, hoy
  FALTA_DATO: 'FALTA_DATO',   // el lugar donde va el dato existe y está vacío: lo carga una persona
  TIEMPO: 'TIEMPO',           // todavía no. NO es un defecto y no se cuenta como pendiente
  ALCANCE: 'ALCANCE',         // se ejecutó algo que la cotización no previó: es una decisión comercial
  NO_APLICA: 'NO_APLICA',     // la pregunta no corresponde. Distinto de no saber
})

export const CAUSA_RAIZ = Object.freeze({
  SIN_GENEALOGIA: 'SIN_GENEALOGIA',                 // la obra no tiene cotización congelada: no hay plan
  SIN_ENLACE_ACTIVIDAD: 'SIN_ENLACE_ACTIVIDAD',     // la partida del plan no llega a ninguna actividad
  CIERRE_INALCANZABLE: 'CIERRE_INALCANZABLE',       // nada puede declarar el 100%: la partida no cierra NUNCA
  CAPTURA_VACIA: 'CAPTURA_VACIA',                   // la puerta de entrada del dato no tiene una sola fila
  IDENTIDAD_RECURSO: 'IDENTIDAD_RECURSO',           // hay datos pero no enganchan con este recurso
  PLAN_SIN_CRONOGRAMA: 'PLAN_SIN_CRONOGRAMA',       // el plan heredado no trajo días
  PLAN_SIN_EL_DATO: 'PLAN_SIN_EL_DATO',             // la cotización congelada no trae cantidad/hs/costo
  SIN_EJECUCION: 'SIN_EJECUCION',                   // todavía no se ejecutó nada
  EN_CURSO: 'EN_CURSO',                             // empezada: cierra y recién ahí se compara
  ALCANCE_NO_COTIZADO: 'ALCANCE_NO_COTIZADO',
  SUBCONTRATADA: 'SUBCONTRATADA',
  OTRO: 'OTRO',
})

const raiz = (causa, disposicion, arregla) => Object.freeze({ causa, disposicion, arregla })

/**
 * LA CAUSA RAÍZ DE UNA OBSERVACIÓN NO COMPARABLE. PURA.
 *
 * `ctx` describe lo que rodea a la observación y NADA de eso se deduce acá:
 *   · `tieneGenealogia`        — la obra tiene una cotización congelada enganchada
 *   · `partidaConActividad`    — esta partida del plan llega a una actividad de obra
 *   · `puedeCerrar`            — existe algún parte capaz de declarar el 100% de esta partida
 *   · `cronogramaTieneDias`    — el cronograma operativo tiene días para esta partida
 *   · `capturaVacia`           — por concepto: la tabla que recibe ese dato está vacía en toda la base
 *
 * Una observación COMPARABLE no tiene causa raíz y devuelve `null`: inventarle una la convertiría en
 * un pendiente y el cuadro dejaría de sumar.
 */
export function causaRaiz(obs, ctx = {}) {
  if (!obs) throw new Error('causaRaiz necesita la observación')
  if (obs.comparable) return null
  const m = obs.motivoNoComparable
  const vacia = ctx.capturaVacia?.[obs.concepto] ?? null

  if (ctx.tieneGenealogia === false) {
    return raiz(CAUSA_RAIZ.SIN_GENEALOGIA, DISPOSICION.ESTRUCTURA, 'enganchar la obra con su cotización congelada (obra_origen_cotizacion)')
  }
  if (m === NO_COMPARABLE.SIN_RECURSO_EN_COMPOSICION) {
    return raiz(CAUSA_RAIZ.ALCANCE_NO_COTIZADO, DISPOSICION.ALCANCE, 'decidir si era alcance no cotizado o una imputación mal hecha')
  }
  if (m === NO_COMPARABLE.SUBCONTRATADA_SIN_HH) {
    return raiz(CAUSA_RAIZ.SUBCONTRATADA, DISPOSICION.NO_APLICA, 'nada: una partida subcontratada no lleva HH propias')
  }
  if (m === NO_COMPARABLE.SIN_PLAN) {
    if (obs.concepto === CONCEPTO.DURACION) {
      // Los días NO vienen de la cotización —una oferta no cotiza plazos por partida— sino del
      // cronograma. Si el cronograma los tiene y el plan salió sin ellos, el hueco es de cableado y
      // se arregla hoy. Si el cronograma tampoco los tiene, no hay nada que cablear.
      return ctx.cronogramaTieneDias
        ? raiz(CAUSA_RAIZ.PLAN_SIN_CRONOGRAMA, DISPOSICION.ESTRUCTURA, 'pasar los días del cronograma al heredar el plan (heredarPlan · diasPorPartida)')
        : raiz(CAUSA_RAIZ.PLAN_SIN_CRONOGRAMA, DISPOSICION.FALTA_DATO, 'planificar los días de esta partida: sin plazo previsto no hay atraso que medir')
    }
    return raiz(CAUSA_RAIZ.PLAN_SIN_EL_DATO, DISPOSICION.FALTA_DATO, 'completar el dato en la cotización ANTES de congelarla: después ya no se toca')
  }
  if (ctx.partidaConActividad === false) {
    return raiz(CAUSA_RAIZ.SIN_ENLACE_ACTIVIDAD, DISPOSICION.ESTRUCTURA, 'apuntar la actividad de obra a su cotizacion_partida_id')
  }
  if (m === NO_COMPARABLE.PARTIDA_EN_CURSO) {
    // ═══ EL CIERRE QUE NO PUEDE LLEGAR ═══
    // Medido sobre Quattropani: los ÚNICOS partes con `avance_pct = 100` están en actividades sin
    // `cotizacion_partida_id`, y los que traen cantidad no traen porcentaje. Ninguna partida del
    // plan puede alcanzar el 100 %, así que «se compara cuando cierre» es una promesa vacía y
    // CANTIDAD, HH y COSTO quedan en curso para siempre. Eso NO es esperar: es un defecto.
    return ctx.puedeCerrar === false
      ? raiz(CAUSA_RAIZ.CIERRE_INALCANZABLE, DISPOSICION.ESTRUCTURA, 'ningún parte de esta partida puede declarar el 100 %: el que lo declara está en una actividad sin partida')
      : raiz(CAUSA_RAIZ.EN_CURSO, DISPOSICION.TIEMPO, 'nada: cierra y ahí se compara')
  }
  if (m === NO_COMPARABLE.SIN_REAL) {
    return raiz(CAUSA_RAIZ.SIN_EJECUCION, DISPOSICION.TIEMPO, 'nada: la partida no empezó')
  }
  if (m === NO_COMPARABLE.SOLO_PORCENTAJE) {
    return raiz(CAUSA_RAIZ.CAPTURA_VACIA, DISPOSICION.FALTA_DATO, 'cargar la CANTIDAD ejecutada en el parte, no sólo el porcentaje')
  }
  if (m === NO_COMPARABLE.SIN_HH_REALES || m === NO_COMPARABLE.SIN_COSTO_REAL || m === NO_COMPARABLE.SIN_CONSUMO_REGISTRADO) {
    // ═══ UNA PARTIDA QUE NO EMPEZÓ NO TIENE UN PROBLEMA DE CLAVE ═══
    //
    // Lo encontró la primera corrida de este clasificador contra la base real: con 6 imputaciones de
    // HH en la obra, `capturaVacia[HH]` da `false`, y las 21 partidas que nadie tocó todavía salían
    // como IDENTIDAD_RECURSO — «hay horas y no enganchan, revisá la clave». Eran 21 partidas sin
    // empezar. Un diagnóstico así manda a alguien a buscar un defecto que no existe, y es la misma
    // familia de error que el archivo entero evita: afirmar más de lo que el dato sostiene.
    //
    // El hueco sólo es sospechoso cuando la partida SÍ registró ejecución y aun así no tiene el
    // dato: ahí se reportó avance y no se imputó nada, y eso hay que mirarlo.
    if (ctx.partidaConEjecucion === false) {
      return raiz(CAUSA_RAIZ.SIN_EJECUCION, DISPOSICION.TIEMPO, 'nada: la partida no empezó, y sin trabajo no hay horas ni consumo que imputar')
    }
    if (vacia === true) return raiz(CAUSA_RAIZ.CAPTURA_VACIA, DISPOSICION.FALTA_DATO, `nadie cargó nunca ${obs.concepto}: la puerta de entrada está vacía en toda la base`)
    if (vacia === false) return raiz(CAUSA_RAIZ.IDENTIDAD_RECURSO, DISPOSICION.ESTRUCTURA, `hay ${obs.concepto} registrado en la obra, la partida registró avance y aun así no engancha: revisar la clave`)
    // `null` = nadie midió si la puerta está vacía. NO se elige una de las dos: un control que no
    // pudo mirar no dice «no está».
    return raiz(CAUSA_RAIZ.OTRO, DISPOSICION.FALTA_DATO, `sin medir si la captura de ${obs.concepto} está vacía: no se puede repartir el arreglo`)
  }
  return raiz(CAUSA_RAIZ.OTRO, DISPOSICION.FALTA_DATO, 'a determinar')
}

/**
 * EL CUADRO DE CAUSAS DE UNA CORRIDA. PURA.
 *
 * `contextoDe(obs)` devuelve el `ctx` de cada observación — lo arma quien tiene la base delante.
 * El cuadro suma por causa Y por disposición, porque son dos lecturas distintas: la primera dice
 * qué pasa, la segunda dice a quién se le manda.
 */
export function cuadroDeCausas(observaciones = [], contextoDe = () => ({})) {
  const porCausa = {}
  const porDisposicion = {}
  const filas = []
  for (const o of observaciones) {
    const r = causaRaiz(o, contextoDe(o))
    if (!r) continue
    filas.push({ entidad: o.entidad, concepto: o.concepto, motivo: o.motivoNoComparable, ...r })
    porCausa[r.causa] = (porCausa[r.causa] ?? 0) + 1
    porDisposicion[r.disposicion] = (porDisposicion[r.disposicion] ?? 0) + 1
  }
  return Object.freeze({
    filas: Object.freeze(filas),
    porCausa: Object.freeze(porCausa),
    porDisposicion: Object.freeze(porDisposicion),
    // Lo que de verdad se puede recuperar escribiendo código, separado de lo que hay que ir a
    // buscar a la obra. Sin esta separación, «404 no comparables» no se puede planificar.
    recuperablesPorEstructura: porDisposicion[DISPOSICION.ESTRUCTURA] ?? 0,
    faltaDatoDeclarado: porDisposicion[DISPOSICION.FALTA_DATO] ?? 0,
    noSonDefecto: (porDisposicion[DISPOSICION.TIEMPO] ?? 0) + (porDisposicion[DISPOSICION.NO_APLICA] ?? 0),
    // Los huecos que alguien tiene que cerrar. Lo que todavía no empezó NO es un hueco.
    huecosAccionables: filas.length
      - ((porDisposicion[DISPOSICION.TIEMPO] ?? 0) + (porDisposicion[DISPOSICION.NO_APLICA] ?? 0)),
  })
}

/**
 * LA COMPARABILIDAD, SOBRE EL DENOMINADOR QUE CORRESPONDE. PURA.
 *
 * ═══ «2 DE 406» TIENE EL DENOMINADOR INFLADO ═══
 *
 * Medido sobre Quattropani: de las 404 no comparables, 351 son partidas que NO EMPEZARON. Contarlas
 * hace que la tasa mida cuánto falta ejecutar de la obra, no cuánto se puede comparar de lo
 * ejecutado — y como una obra siempre empieza vacía, la tasa arranca cerca de cero por diseño y
 * después sube sola con el avance, sin que nadie arregle nada. Una métrica que mejora sin trabajo no
 * está midiendo trabajo.
 *
 * El denominador honesto es lo VIVO: lo que ya se puede comparar más lo que se querría comparar y no
 * se puede por un hueco real. Y con la obra sin arrancar el resultado NO es 0 %: es `SIN_MEDIR`.
 * Cero por ciento dice «se intentó y no se pudo»; acá todavía no hubo nada que intentar.
 */
export function comparabilidadViva({ comparables = 0, cuadro } = {}) {
  const base = comparables + (cuadro?.huecosAccionables ?? 0)
  return Object.freeze({
    comparables,
    huecosAccionables: cuadro?.huecosAccionables ?? 0,
    base,
    fueraDelDenominador: cuadro?.noSonDefecto ?? 0,
    tasa: base > 0 ? Math.round((comparables / base) * 1000) / 1000 : SIN_MEDIR,
  })
}

/**
 * LA COBERTURA DEL UNIVERSO. PURA.
 *
 * ═══ EL DENOMINADOR QUE NO SE VE ═══
 *
 * «2 comparables de 406» se mide SOBRE LAS OBRAS QUE TIENEN GENEALOGÍA. Las que no la tienen no
 * aportan cero observaciones malas: no aportan NINGUNA, y por eso no bajan ningún promedio y no
 * aparecen en ninguna tabla. Medido: 5 obras con 244 partes de ejecución quedan enteras fuera del
 * cuadro, y el cuadro no tiene forma de decirlo.
 *
 * Es el defecto de «un control que no pudo mirar no dice que no está», aplicado al universo entero.
 * Por eso la cobertura viaja al lado del porcentaje y `sesgado` es `true` mientras falte una obra.
 */
export function coberturaDeObras(obras = []) {
  const conEjecucion = obras.filter((o) => (o.partes ?? 0) > 0 || (o.imputacionesHH ?? 0) > 0)
  const miradas = conEjecucion.filter((o) => o.tieneGenealogia)
  const noMiradas = conEjecucion.filter((o) => !o.tieneGenealogia)
  return Object.freeze({
    obrasConEjecucion: conEjecucion.length,
    obrasMiradas: miradas.length,
    obrasNoMiradas: noMiradas.length,
    detalleNoMiradas: Object.freeze(noMiradas.map((o) => Object.freeze({ obraId: o.obraId, partes: o.partes ?? 0, imputacionesHH: o.imputacionesHH ?? 0 }))),
    partesFueraDelCuadro: noMiradas.reduce((a, o) => a + (o.partes ?? 0), 0),
    // Con una sola obra afuera, cualquier tasa de comparabilidad está medida sobre un universo
    // recortado y NO se puede leer como «la empresa».
    sesgado: noMiradas.length > 0,
    cobertura: conEjecucion.length > 0 ? miradas.length / conEjecucion.length : null,
  })
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
