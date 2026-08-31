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
import { VIGENCIA_HASTA, CCT, ZONA, PERIODO_VERIFICADO, VERIFICADA_EL } from '../uocra-paritaria.mjs'
import { IMPACTO_MATERIAL } from './outlier.mjs'

/**
 * HASTA CUÁNDO RIGE EL TRAMO DE PARITARIA FIRMADO, en ISO.
 *
 * NO se escribe el número acá: se trae de `uocra-paritaria.mjs`, que es donde vive verificado contra
 * fuente (CCT 76/75, Zona A, verificado el 07/08/2026). Copiarlo sería crear una segunda definición
 * del mismo concepto, y el día que se firme el tramo nuevo una de las dos quedaría vieja sin gritar
 * — que es exactamente cómo este repo ya perdió plata con fuentes congeladas.
 *
 * El módulo lo publica en DD/MM/YYYY porque así se lee en el acuerdo; acá se normaliza a ISO.
 */
export const TRAMO_PARITARIA_HASTA = (() => {
  const [d, m, a] = String(VIGENCIA_HASTA).split('/')
  return `${a}-${m}-${d}`
})()

/** De dónde salió esa fecha, para poder citarla sin abrir otro archivo. */
export const TRAMO_PARITARIA_FUENTE = `UOCRA CCT ${CCT} Zona ${ZONA} · escala ${PERIODO_VERIFICADO} verificada el ${VERIFICADA_EL}`

/**
 * CUÁNTOS MESES DE ATRASO DEL IPC SE AGUANTAN ANTES DE NO PODER AFIRMAR NADA.
 *
 * El INDEC publica mensualmente. Un atraso de un mes es el calendario; doce meses es una tabla
 * abandonada. Pasado ese punto el índice no sostiene ninguna vigencia y la derivada cae al mínimo.
 */
export const IPC_ATRASO_MAXIMO_MESES = 12

/** Cuánto error de precio se tolera cuando NO se sabe cuánto pesa el recurso. El 5% es el orden del
 *  redondeo comercial de una oferta: por debajo de eso, pedir un precio nuevo cuesta más de lo que
 *  corrige. Se usa sólo como piso de ignorancia — con materialidad conocida, la tolerancia se
 *  deriva. */
export const TOLERANCIA_SIN_MATERIALIDAD = 0.05

/** Los bordes de la tolerancia. Por debajo del 2% se estaría persiguiendo ruido de mercado; por
 *  encima del 50% el precio ya no se defiende delante de un cliente por chico que sea el ítem. */
export const TOLERANCIA_MIN = IMPACTO_MATERIAL
export const TOLERANCIA_MAX = 0.5

/** Cuánto vale un precio en moneda extranjera cuando no hay serie propia con qué medirlo. Es el
 *  viejo default de 180 días, conservado A PROPÓSITO y SÓLO acá, con su etiqueta de NO MEDIDO: el
 *  IPC en pesos no mide la deriva de un precio en dólares, y lo que envejece de verdad en ese caso
 *  es el tipo de cambio —que tiene su propia fecha y lo controla `aplicarFx`, no este módulo—.
 *  Aparece en los informes como `MONEDA_EXTRANJERA_NO_MEDIDA` para que se vea que es un hueco. */
export const DIAS_MONEDA_EXTRANJERA_NO_MEDIDA = 180

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
  const antiguedadDias = dias(iso(finDelMes), iso(hoy))
  const atrasoMeses = Math.max(0, antiguedadDias / 30)

  // ═══ UN ÍNDICE ATRASADO NO SE CITA COMO SI ESTUVIERA FRESCO ═══
  //
  // Toda la deriva de este módulo se apoya en esta tabla. Si la tabla dejó de actualizarse, la
  // vigencia sigue saliendo con dos decimales y cara de medición — y ése es el patrón exacto de
  // «fuente que se congela sin gritar» que ya costó plata acá. `antiguedadDias` se calculaba desde
  // el principio y NO LO MIRABA NADIE, que es la definición de un control que no puede decir que no.
  //
  // La degradación es proporcional y explicable: la tasa se midió sobre una ventana de N meses y
  // hay M meses posteriores sin medir, así que sólo N de cada N+M meses del período que la tasa
  // pretende describir están respaldados. La vigencia se recorta en esa fracción.
  if (atrasoMeses > IPC_ATRASO_MAXIMO_MESES) {
    return {
      derivaMensual: null, origen: 'IPC_INDEC_ABANDONADO', fuente: FUENTE_IPC, antiguedadDias, factorFrescura: 0,
      porQue: `el último IPC publicado es de ${ultimo}, hace ${antiguedadDias} días (más de ${IPC_ATRASO_MAXIMO_MESES} meses): la tabla está abandonada y no sostiene ninguna vigencia`,
    }
  }
  // Menos de un mes de atraso es el CALENDARIO DE PUBLICACIÓN, no una tabla congelada: el INDEC
  // publica el mes cerrado a mediados del siguiente. Recortar por eso castigaría el funcionamiento
  // normal y volvería el aviso ruido de fondo.
  const atrasado = atrasoMeses >= 1
  const factorFrescura = atrasado ? usados.length / (usados.length + atrasoMeses) : 1
  return {
    derivaMensual,
    origen: atrasado ? 'IPC_INDEC_ATRASADO' : 'IPC_INDEC',
    fuente: FUENTE_IPC,
    antiguedadDias,
    factorFrescura,
    porQue: atrasado
      ? `${(derivaMensual * 100).toFixed(2)}%/mes — promedio geométrico de ${usados.length} meses de IPC hasta ${ultimo}, PERO ese dato tiene ${antiguedadDias} días: hay ${atrasoMeses.toFixed(1)} meses posteriores sin medir, así que la vigencia se recorta ×${factorFrescura.toFixed(2)}`
      : `${(derivaMensual * 100).toFixed(2)}%/mes — promedio geométrico de los ${usados.length} meses de IPC nivel general publicados hasta ${ultimo}. Es un PISO de deriva, no la deriva de este recurso`,
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
 * CUÁNTO ERROR DE PRECIO SE TOLERA EN ESTE RECURSO. PURA.
 *
 * ═══ LA TOLERANCIA NO ES UN GUSTO: SE DESPEJA ═══
 *
 * Si un recurso pesa la fracción `f` del costo y su precio se desvió `e`, el TOTAL se desvía `f × e`.
 * Lo que importa no es el error del precio: es el error del total. Entonces la tolerancia de este
 * precio es la que hace que el total todavía no sea material:
 *
 *     f × e < IMPACTO_MATERIAL   ⟹   e < IMPACTO_MATERIAL / f
 *
 * Eso contesta de una sola vez las dos mitades del problema medido: el Panel de Chapa Trape, que
 * mueve millones, tolera poco y hay que refrescarlo; el TORNILLO AUTOPERFORANTE 2", que mueve
 * centavos, tolera tanto que su precio no vence — y por eso deja de frenar una obra de $79,5 M.
 * No es una excepción hecha para el tornillo: es la misma fórmula.
 */
export function toleranciaDeMaterialidad(fraccion) {
  if (fraccion === null || fraccion === undefined || !(Number(fraccion) > 0)) {
    return { tolerancia: TOLERANCIA_SIN_MATERIALIDAD, porQue: `tolerancia ${(TOLERANCIA_SIN_MATERIALIDAD * 100).toFixed(0)}%: no se sabe qué fracción del costo mueve este recurso, y un peso desconocido no se lee como cero` }
  }
  const f = Number(fraccion)
  const cruda = IMPACTO_MATERIAL / f
  const tolerancia = Math.max(TOLERANCIA_MIN, Math.min(TOLERANCIA_MAX, cruda))
  const acotada = tolerancia !== cruda ? ` (acotada al rango ${TOLERANCIA_MIN * 100}–${TOLERANCIA_MAX * 100}%)` : ''
  return {
    tolerancia,
    porQue: `tolerancia ${(tolerancia * 100).toFixed(1)}% = ${(IMPACTO_MATERIAL * 100).toFixed(0)}% de impacto material ÷ ${(f * 100).toFixed(3)}% que el recurso pesa en el costo${acotada}`,
  }
}

/**
 * CUÁNTOS DÍAS VALE ESTE PRECIO. PURA. Devuelve el número Y CÓMO SALIÓ.
 *
 * `materialidad` es la fracción del costo que este recurso mueve (`0.03` = 3%), o `null` si no se
 * sabe. `null` NO se lee como cero: cae al piso de ignorancia del 5%, que es más exigente que lo que
 * saldría de suponer que el recurso no pesa nada.
 */
export function vigenciaDerivada({
  tipo = null, familia = null, serie = [], origen = 'INTERNO', moneda = 'ARS',
  materialidad = null, tramoParitariaHasta = TRAMO_PARITARIA_HASTA, observadoEn = null,
  hoy = new Date(), tablaIpc = IPC,
} = {}) {
  const clase = claseDeRecurso({ tipo, familia })
  const { tolerancia, porQue: porQueTolerancia } = toleranciaDeMaterialidad(materialidad)

  if (clase === CLASE.CONVENIO) return vigenciaDeConvenio({ tramoParitariaHasta, observadoEn, hoy, clase, tolerancia, porQueTolerancia })

  const deSerie = derivaDeSerie(serie)
  if (deSerie.derivaMensual === null && String(moneda) !== 'ARS') {
    return congelar({
      clase, dias: DIAS_MONEDA_EXTRANJERA_NO_MEDIDA, tolerancia, porQueTolerancia,
      deriva: { derivaMensual: null, origen: 'MONEDA_EXTRANJERA_NO_MEDIDA', porQue: `el precio está en ${moneda} y el IPC del INDEC mide pesos: no hay con qué medir su deriva` },
      porQue: `${DIAS_MONEDA_EXTRANJERA_NO_MEDIDA} días NO MEDIDOS: un precio en ${moneda} no envejece con la inflación en pesos — lo que envejece es el tipo de cambio, que tiene su propia fecha y lo controla aplicarFx. Este número es el default viejo conservado como hueco declarado, no una medición`,
    })
  }
  const base = deSerie.derivaMensual !== null ? deSerie : derivaDelIPC({ tabla: tablaIpc, hoy })
  if (base.derivaMensual === null || base.derivaMensual <= 0) {
    return congelar({
      clase, dias: DIAS_MIN, tolerancia, porQueTolerancia,
      deriva: base,
      porQue: `no hay con qué medir la deriva (${base.porQue}): la vigencia cae al mínimo de ${DIAS_MIN} días en vez de suponer que el precio no se mueve`,
    })
  }
  const factor = FACTOR_ORIGEN[origen] ?? FACTOR_ORIGEN.WEB
  // El factor de frescura sólo existe cuando la deriva vino del IPC: una serie propia del recurso no
  // envejece por lo que el INDEC deje de publicar.
  const frescura = base.factorFrescura ?? 1
  const crudo = 30 * (tolerancia / base.derivaMensual) * factor * frescura
  const d = Math.max(DIAS_MIN, Math.min(DIAS_MAX, Math.round(crudo)))
  const recorte = factor === 1 ? '' : ` · recortado ×${factor} porque el precio viene de ${origen}`
  const porAtraso = frescura === 1 ? '' : ` · recortado ×${frescura.toFixed(2)} porque el IPC que sostiene la deriva tiene ${base.antiguedadDias} días`
  return congelar({
    clase, dias: d, tolerancia, porQueTolerancia, deriva: base,
    porQue: `${d} días = 30 × ${(tolerancia * 100).toFixed(0)}% ÷ ${(base.derivaMensual * 100).toFixed(2)}%/mes${recorte}${porAtraso}${d !== Math.round(crudo) ? ` (acotado al rango ${DIAS_MIN}–${DIAS_MAX})` : ''}`,
  })
}

/**
 * EL JORNAL DE CONVENIO CADUCA, NO SE DEGRADA. PURA.
 *
 * ═══ LA DIFERENCIA QUE ESTA FUNCIÓN EXISTE PARA HACER ═══
 *
 * Un precio de material se DEGRADA: cada día que pasa se aleja un poco del real, y la pregunta es
 * cuánto se aguanta. Un básico de convenio no hace eso. Está exactamente bien hasta el último día
 * del tramo y exactamente mal al día siguiente, porque lo que cambia no es el mercado: es que se
 * firmó otra escala. No hay «un poco vencido» — hay una FECHA.
 *
 * Por eso devuelve `caducaEl`, una fecha dura, y no un cociente. `evaluarCandidato` compara contra
 * ella y no contra la antigüedad: `dias` queda como dato informativo.
 *
 * ═══ EL BUG QUE ESTO CORRIGE ═══
 *
 * La versión anterior devolvía `dias = fin del tramo − HOY`, y quien llama compara ese número
 * contra `HOY − observadoEn`. Son dos ejes distintos: un básico observado el 01/08 con el tramo
 * terminando el 31/08 daba `dias = 1` contra una antigüedad de 29, o sea VENCIDO el 30/08 —
 * un día antes de que el tramo terminara de verdad. La escala de agosto se declaraba muerta
 * mientras seguía siendo la vigente.
 */
function vigenciaDeConvenio({ tramoParitariaHasta, observadoEn, hoy, clase, tolerancia, porQueTolerancia }) {
  if (!tramoParitariaHasta) {
    return congelar({
      clase, dias: 30, tolerancia, porQueTolerancia, caducaEl: null,
      deriva: { derivaMensual: null, origen: 'TRAMO_PARITARIA_DESCONOCIDO', porQue: 'no se pasó la fecha de fin del tramo vigente' },
      porQue: '30 días POR APROXIMACIÓN DECLARADA: el driver real de un jornal de convenio es el tramo de paritaria y acá no se pasó cuál rige. No es una medición',
    })
  }
  const caducaEl = iso(tramoParitariaHasta)
  // Los días de vida del precio se cuentan DESDE SU OBSERVACIÓN, que es el eje contra el que quien
  // llama mide la antigüedad. Sin `observadoEn` no se puede informar el número y se dice.
  const d = observadoEn ? Math.max(0, dias(iso(observadoEn), caducaEl)) : null
  const yaCaduco = iso(hoy) > caducaEl
  return congelar({
    clase, dias: d, tolerancia, porQueTolerancia, caducaEl,
    deriva: { derivaMensual: null, origen: 'TRAMO_PARITARIA', porQue: `el tramo de paritaria firmado rige hasta el ${caducaEl}` },
    porQue: yaCaduco
      ? `el tramo de paritaria CADUCÓ el ${caducaEl}: después de esa fecha no hay escala firmada y el básico anterior no se sigue sirviendo en silencio — hay que traer el tramo nuevo`
      : `vale hasta el ${caducaEl} y ese día deja de valer: un básico de convenio no se degrada de a poco, caduca cuando entra la escala nueva`,
  })
}

const congelar = ({ clase, dias: d, tolerancia, porQueTolerancia, deriva, porQue, caducaEl = null }) => Object.freeze({
  dias: d,
  /** La FECHA DURA de caducidad, cuando el precio caduca en vez de degradarse. `null` significa que
   *  este precio se degrada y quien decide es la antigüedad contra `dias`. */
  caducaEl,
  clase,
  tolerancia,
  derivaMensual: deriva.derivaMensual,
  origenDeriva: deriva.origen,
  fuenteDeriva: deriva.fuente ?? null,
  porQue,
  componentes: Object.freeze([porQueTolerancia, deriva.porQue, porQue]),
})
