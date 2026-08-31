// CUÁNTO VALE UN PRECIO ANTES DE VOLVER A PREGUNTARLO — derivado, no decretado.
//
// ═══ POR QUÉ 180 DÍAS PLANOS ESTABA MAL ═══
//
// `precios.mjs` traía `DIAS_VIGENCIA = 180` para todo: para el gasoil, para el hormigón y para el
// jornal de un oficial de convenio. Con el IPC del INDEC en ~2,6% mensual, un precio de 180 días
// acumula ~17% de deriva. Sobre una oferta de $180 M eso son $30 M que el presupuesto afirma tener
// y no tiene. Y al revés: hay recursos donde 180 días es corto y se pide un refresco que nadie
// necesita, que es como se entrena a la gente a apretar «sí» sin leer.
//
// Medido el 30/08/2026 sobre la base real: **de 389 recursos con precio, 285 están vencidos a 180
// días**. Una regla que declara vencido al 73% del catálogo no está midiendo el catálogo: se está
// midiendo a sí misma.
//
// ═══ LA VIGENCIA ES UN COCIENTE, Y POR ESO SE PUEDE EXPLICAR ═══
//
//     días = 30 × (cuánto error de precio se tolera) ÷ (cuánto se mueve el precio por mes)
//
// Las dos entradas son datos, no gustos:
//
//   · LA DERIVA sale de la propia serie del recurso cuando la serie existe (≥3 observaciones y ≥60
//     días de span). Cuando no existe —hoy NINGUNA existe: los 389 recursos tienen exactamente una
//     observación cada uno— cae al IPC nivel general publicado por el INDEC, que es un dato real con
//     fuente y fecha. Se declara como PISO, no como verdad: un precio de obra no se mueve MENOS que
//     el nivel general, salvo prueba en contrario.
//   · LA TOLERANCIA sale de la MATERIALIDAD, y usa `IMPACTO_MATERIAL` de `outlier.mjs` —la misma
//     constante que ya decide qué cambio frena una cotización—. Un recurso que mueve más del 2% del
//     costo tolera menos error que un clavo.
//
// ═══ LA MANO DE OBRA NO DERIVA: SALTA ═══
//
// El jornal de convenio no se mueve un poquito por mes: está quieto y después salta el día que entra
// el tramo de paritaria. Modelarlo con una deriva continua da un número que no significa nada. Para
// esa clase el driver es el TRAMO —«UOCRA: driver = tramo de paritaria»— y si quien llama lo conoce
// lo pasa; si no lo conoce, la vigencia sale igual pero DICE que el driver real es otro. Declarar la
// aproximación no es un adorno: es la diferencia entre un número defendible y uno inventado.

import { IPC, FUENTE as FUENTE_IPC } from '../ipc-publicado.mjs'
import { IMPACTO_MATERIAL } from './outlier.mjs'

/** Cuánto error de precio se tolera antes de exigir refresco, para un recurso NO material. El 5% es
 *  el orden del redondeo comercial de una oferta: por debajo de eso, pedir un precio nuevo cuesta
 *  más de lo que corrige. */
export const TOLERANCIA_BASE = 0.05

/** Y para uno material. Es `IMPACTO_MATERIAL` de `outlier.mjs`, no una constante nueva: el mismo
 *  umbral que decide si un cambio se aplica solo decide cuánto error de precio se aguanta. */
export const TOLERANCIA_MATERIAL = IMPACTO_MATERIAL

/** Los bordes. Nada vence antes de una semana —eso sería pedir precio todos los días— ni dura más de
 *  un año, porque un precio de más de un año no se defiende delante de un cliente aunque el modelo
 *  diga que sí. */
export const DIAS_MIN = 7
export const DIAS_MAX = 365

/** Qué clase de cosa es, a los efectos de CÓMO SE MUEVE su precio. No es la taxonomía contable del
 *  recurso: es la única partición que cambia el cálculo. */
export const CLASE = Object.freeze({
  CONVENIO: 'CONVENIO',       // salta por paritaria, no deriva
  INSUMO: 'INSUMO',           // material, equipo, servicio: deriva con el nivel general o con su serie
  CONTRATO: 'CONTRATO',       // subcontrato / contratista: el precio lo fija un tercero y lo escribe
})

/** Cuánto se recorta la vigencia según de dónde salió el precio. Una factura que ECSAS pagó es un
 *  hecho; una lista publicada en la web cambia sin avisar y nadie nos lo comunica. */
export const FACTOR_ORIGEN = Object.freeze({
  COMPRA_ECSAS: 1,
  INTERNO: 1,
  COMPARABLE: 0.5,
  WEB: 0.5,
})

const MS_DIA = 86_400_000
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
const dias = (desde, hasta) => Math.floor((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA)

/**
 * QUÉ CLASE DE COSA ES. PURA.
 *
 * Se decide por `tipo` primero porque es la columna que la base impone con un CHECK; `familia` es
 * texto libre cargado por gente y sólo se mira cuando el tipo no alcanza (en la base real hay 5
 * recursos de mano de obra cargados con `tipo='otro'` y `familia='MANO DE OBRA'`).
 */
export function claseDeRecurso({ tipo = null, familia = null } = {}) {
  const t = String(tipo ?? '').toLowerCase()
  const f = String(familia ?? '').toUpperCase()
  if (t === 'mano_obra' || t === 'carga_social' || f === 'MANO DE OBRA') return CLASE.CONVENIO
  if (t === 'subcontrato' || f === 'SUBCONTRATISTA' || f === 'CONTRATISTA') return CLASE.CONTRATO
  return CLASE.INSUMO
}

/**
 * LA DERIVA MENSUAL DEL NIVEL GENERAL, del IPC que el INDEC ya publicó. PURA.
 *
 * Es el promedio GEOMÉTRICO de los últimos `meses` publicados, no el aritmético: encadenar
 * variaciones es multiplicar, y promediarlas sumando sobreestima. Devuelve además la antigüedad del
 * último dato: una tabla de IPC que dejó de actualizarse es una fuente congelada, y este módulo la
 * denuncia en vez de seguir citándola como si estuviera viva.
 */
export function derivaDelIPC({ tabla = IPC, ventana = 6, hoy = new Date() } = {}) {
  const usados = [...tabla].sort((a, b) => String(a.periodo).localeCompare(String(b.periodo))).slice(-ventana)
  if (!usados.length) return { derivaMensual: null, origen: 'IPC_INDEC', porQue: 'la tabla de IPC publicado está vacía', antiguedadDias: null }
  const factor = usados.reduce((a, m) => a * (1 + Number(m.variacion)), 1)
  const derivaMensual = factor ** (1 / usados.length) - 1
  const ultimo = usados[usados.length - 1].periodo
  // Un período '2026-06' es el mes cerrado: se mide contra su último día, no contra el primero.
  const finDelMes = new Date(Date.UTC(Number(ultimo.slice(0, 4)), Number(ultimo.slice(5, 7)), 0))
  return {
    derivaMensual,
    origen: 'IPC_INDEC',
    fuente: FUENTE_IPC,
    antiguedadDias: dias(iso(finDelMes), iso(hoy)),
    porQue: `${(derivaMensual * 100).toFixed(2)}%/mes — promedio geométrico de los ${usados.length} meses de IPC nivel general publicados hasta ${ultimo}. Es un PISO de deriva, no la deriva de este recurso`,
  }
}

/**
 * LA DERIVA MENSUAL MEDIDA EN LA PROPIA SERIE DEL RECURSO. PURA.
 *
 * Devuelve `null` cuando la serie no alcanza, y DICE por qué. Dos observaciones del mismo día no son
 * una serie; tres observaciones en una semana tampoco: una variación mensual leída sobre siete días
 * se multiplica por cuatro y publica una volatilidad que nadie observó.
 *
 * Se usa la MEDIANA de las variaciones mensualizadas y no el promedio: una sola corrección de carga
 * —un precio que estaba mal y se arregló— mueve el promedio y no mueve la mediana.
 */
export function derivaDeSerie(serie = [], { minObservaciones = 3, minSpanDias = 60 } = {}) {
  const puntos = serie
    .filter((o) => o && Number(o.precio) > 0 && o.observadoEn)
    .map((o) => ({ precio: Number(o.precio), en: iso(o.observadoEn) }))
    .sort((a, b) => a.en.localeCompare(b.en))
  if (puntos.length < minObservaciones) {
    return { derivaMensual: null, origen: 'SERIE_INSUFICIENTE', n: puntos.length, porQue: `la serie tiene ${puntos.length} observación(es) con precio y hacen falta ${minObservaciones} para medir una variación` }
  }
  const span = dias(puntos[0].en, puntos[puntos.length - 1].en)
  if (span < minSpanDias) {
    return { derivaMensual: null, origen: 'SERIE_INSUFICIENTE', n: puntos.length, porQue: `las ${puntos.length} observaciones caben en ${span} días: mensualizar sobre esa ventana inventa volatilidad` }
  }
  const tasas = []
  for (let i = 1; i < puntos.length; i += 1) {
    const d = dias(puntos[i - 1].en, puntos[i].en)
    if (d <= 0) continue
    tasas.push(Math.abs(Math.log(puntos[i].precio / puntos[i - 1].precio)) * (30 / d))
  }
  if (!tasas.length) return { derivaMensual: null, origen: 'SERIE_INSUFICIENTE', n: puntos.length, porQue: 'todas las observaciones tienen la misma fecha' }
  tasas.sort((a, b) => a - b)
  const mediana = tasas.length % 2 ? tasas[(tasas.length - 1) / 2] : (tasas[tasas.length / 2 - 1] + tasas[tasas.length / 2]) / 2
  const derivaMensual = Math.exp(mediana) - 1
  return {
    derivaMensual,
    origen: 'SERIE_OBSERVADA',
    n: puntos.length,
    porQue: `${(derivaMensual * 100).toFixed(2)}%/mes — mediana de ${tasas.length} variaciones mensualizadas de las ${puntos.length} observaciones propias del recurso, sobre ${span} días`,
  }
}

/**
 * CUÁNTOS DÍAS VALE ESTE PRECIO. PURA. Devuelve el número Y CÓMO SALIÓ.
 *
 * `materialidad` es la fracción del costo que este recurso mueve (`0.03` = 3%), o `null` si no se
 * sabe. `null` NO se lee como cero: un recurso cuyo peso se desconoce se trata como material,
 * porque suponer que no importa es exactamente el supuesto que nadie puede defender después.
 */
export function vigenciaDerivada({
  tipo = null, familia = null, serie = [], origen = 'INTERNO',
  materialidad = null, tramoParitariaHasta = null, hoy = new Date(), tablaIpc = IPC,
} = {}) {
  const clase = claseDeRecurso({ tipo, familia })
  const esMaterial = materialidad === null || Number(materialidad) >= TOLERANCIA_MATERIAL
  const tolerancia = esMaterial ? TOLERANCIA_MATERIAL : TOLERANCIA_BASE
  const porQueTolerancia = materialidad === null
    ? `tolerancia ${(tolerancia * 100).toFixed(0)}%: no se sabe cuánto pesa este recurso, y un peso desconocido se trata como material`
    : `tolerancia ${(tolerancia * 100).toFixed(0)}%: el recurso mueve el ${(Number(materialidad) * 100).toFixed(2)}% del costo`

  if (clase === CLASE.CONVENIO) return vigenciaDeConvenio({ tramoParitariaHasta, hoy, clase, tolerancia, porQueTolerancia })

  const deSerie = derivaDeSerie(serie)
  const base = deSerie.derivaMensual !== null ? deSerie : derivaDelIPC({ tabla: tablaIpc, hoy })
  if (base.derivaMensual === null || base.derivaMensual <= 0) {
    return congelar({
      clase, dias: DIAS_MIN, tolerancia, porQueTolerancia,
      deriva: base,
      porQue: `no hay con qué medir la deriva (${base.porQue}): la vigencia cae al mínimo de ${DIAS_MIN} días en vez de suponer que el precio no se mueve`,
    })
  }
  const factor = FACTOR_ORIGEN[origen] ?? FACTOR_ORIGEN.WEB
  const crudo = 30 * (tolerancia / base.derivaMensual) * factor
  const d = Math.max(DIAS_MIN, Math.min(DIAS_MAX, Math.round(crudo)))
  const recorte = factor === 1 ? '' : ` · recortado ×${factor} porque el precio viene de ${origen}`
  return congelar({
    clase, dias: d, tolerancia, porQueTolerancia, deriva: base,
    porQue: `${d} días = 30 × ${(tolerancia * 100).toFixed(0)}% ÷ ${(base.derivaMensual * 100).toFixed(2)}%/mes${recorte}${d !== Math.round(crudo) ? ` (acotado al rango ${DIAS_MIN}–${DIAS_MAX})` : ''}`,
  })
}

/** El jornal de convenio: el driver es el tramo de paritaria, no una deriva mensual. PURA. */
function vigenciaDeConvenio({ tramoParitariaHasta, hoy, clase, tolerancia, porQueTolerancia }) {
  if (tramoParitariaHasta) {
    const restan = dias(iso(hoy), iso(tramoParitariaHasta))
    const d = Math.max(DIAS_MIN, Math.min(DIAS_MAX, restan))
    return congelar({
      clase, dias: d, tolerancia, porQueTolerancia,
      deriva: { derivaMensual: null, origen: 'TRAMO_PARITARIA', porQue: `el tramo vigente termina el ${iso(tramoParitariaHasta)}` },
      porQue: restan <= 0
        ? `el tramo de paritaria venció el ${iso(tramoParitariaHasta)}: el jornal ya no es el vigente y la vigencia queda en el mínimo de ${DIAS_MIN} días`
        : `${d} días: el jornal de convenio no deriva, salta — vale hasta que entre el próximo tramo, el ${iso(tramoParitariaHasta)}`,
    })
  }
  return congelar({
    clase, dias: 30, tolerancia, porQueTolerancia,
    deriva: { derivaMensual: null, origen: 'TRAMO_PARITARIA_DESCONOCIDO', porQue: 'no se pasó la fecha de fin del tramo vigente' },
    porQue: '30 días POR APROXIMACIÓN DECLARADA: el driver real de un jornal de convenio es el tramo de paritaria y acá no se pasó cuál rige. No es una medición',
  })
}

const congelar = ({ clase, dias: d, tolerancia, porQueTolerancia, deriva, porQue }) => Object.freeze({
  dias: d,
  clase,
  tolerancia,
  derivaMensual: deriva.derivaMensual,
  origenDeriva: deriva.origen,
  fuenteDeriva: deriva.fuente ?? null,
  porQue,
  componentes: Object.freeze([porQueTolerancia, deriva.porQue, porQue]),
})
