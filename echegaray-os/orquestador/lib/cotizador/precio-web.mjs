// PASO 4 DE LA CASCADA — el precio publicado en internet, convertido en un número que se puede citar.
//
// ═══ QUÉ FALTABA, EXACTAMENTE ═══
//
// El motor de investigación YA existe y no se reescribe acá: `plano/investigacion.mjs` tiene la
// jerarquía de AUTORIDAD y el resolvedor web, `cotizador/research.mjs` lo cablea, y
// `web/contenido-externo.mjs` sella el contenido y marca las órdenes que vengan adentro. Todo eso
// devuelve TEXTO con su URL.
//
// Lo que falta —y es lo único que hace este archivo— es el puente: **de un texto investigado a un
// número con moneda, unidad, fecha y URL**. Un texto que dice «$41.680,44» no es un precio hasta
// que se sabe de qué unidad es, si lleva IVA, y de qué día.
//
// ═══ LAS TRES MANERAS EN QUE UN PRECIO DE INTERNET MIENTE SIN QUERER ═══
//
//   1. LA UNIDAD Y LA PRESENTACIÓN. «Bolsa de cemento 50 kg — $12.000» y un recurso medido en kg no
//      son el mismo número: son $240/kg. Si la página no dice cuánto trae la bolsa, la división no
//      se puede hacer, y dividir a ojo publica un costo con una cifra de más o de menos. Sin
//      conversión segura NO hay precio: hay un motivo escrito.
//   2. EL IVA. Una lista al público trae IVA incluido y el costo de la empresa va sin IVA: 21% de
//      diferencia sobre un ítem que puede ser el hormigón de la obra. Si la página NO lo declara,
//      este módulo tampoco lo declara: no hay precio. Suponer «viene sin IVA» le saca 17,4% al
//      costo, y suponer lo contrario se lo agrega — las dos son plata que nadie decidió.
//   3. LA FECHA. Una página sin fecha de publicación no puede afirmar vigencia. Lo que sí se puede
//      afirmar es cuándo la leímos: ése es el hecho, y con esa fecha viaja el candidato, dicho.
//
// ═══ LO QUE UNA PÁGINA NO PUEDE CONSEGUIR, ESCRIBA LO QUE ESCRIBA ═══
//
//   · NO puede subir su propia autoridad. La autoridad sale de `autoridadDe(url)` y de nada más. Una
//     página que dice «fuente oficial del INTI» en un `.com.ar` cualquiera sigue siendo SECUNDARIA.
//   · NO puede ascender a experiencia de ECSAS. El origen es `ORIGEN.WEB` y la tabla congelada de
//     `precio-resolucion.mjs` lo manda a `FUENTE.WEB`. No hay parámetro para pedir otra cosa.
//   · NO puede dar órdenes. Lo que la página intentó viaja en `sobreLaPagina` —un campo de reporte—
//     y no toca el valor, ni la unidad, ni la fuente, ni la autoridad.
//
// ═══ SIN RED, TODO ESTO NO EXISTE (§13) ═══
//
// El núcleo de este archivo es PURO y no abre un socket. La cáscara `resolvedorDePrecioWeb` recibe
// el investigador inyectado: sin él no hay resolvedor, y sin resolvedor el mapa de precios web
// queda vacío. Un mapa vacío deja la cascada exactamente como estaba — el camino determinístico no
// depende de que haya internet.

import { numeroAR, normalizarUnidad, convertir, factorDePrecio } from './unidades.mjs'
import { ESTADO } from './contrato.mjs'
import { ORIGEN, candidatoDePrecio } from './precio-resolucion.mjs'
import { autoridadDe, NOMBRE_AUTORIDAD } from '../plano/investigacion.mjs'

/** Qué dijo la página sobre el IVA. `NO_DECLARADO` NO es «sin IVA»: es una pregunta abierta que
 *  bloquea, porque las dos lecturas se llevan 21% del costo del ítem. */
export const IVA = Object.freeze({
  SIN_IVA: 'SIN_IVA',
  CON_IVA: 'CON_IVA',
  NO_DECLARADO: 'NO_DECLARADO',
})

/** Por qué una lectura no produjo precio. Se cuenta tanto como los aciertos: «no encontré nada» y
 *  «encontré un precio y no supe de qué unidad era» llevan a acciones distintas. */
export const MOTIVO = Object.freeze({
  SIN_MONTO: 'SIN_MONTO',
  VARIOS_MONTOS: 'VARIOS_MONTOS',
  IVA_NO_DECLARADO: 'IVA_NO_DECLARADO',
  SIN_ALICUOTA: 'SIN_ALICUOTA',
  UNIDAD_NO_RESUELTA: 'UNIDAD_NO_RESUELTA',
  DIMENSION_INCOMPATIBLE: 'DIMENSION_INCOMPATIBLE',
  SIN_FECHA: 'SIN_FECHA',
})

const MONEDA_DE_SIGNO = Object.freeze({
  'u$s': 'USD', 'us$': 'USD', usd: 'USD', 'dólares': 'USD', dolares: 'USD',
  $: 'ARS', ars: 'ARS', pesos: 'ARS',
})

/**
 * TODOS LOS MONTOS CON MONEDA QUE HAY EN UN TEXTO. PURA.
 *
 * Devuelve la lista completa a propósito: quien llama tiene que poder ver que había SEIS precios en
 * la página y por eso no se eligió ninguno. Elegir «el primero» en una página con seis precios es
 * elegir al azar y llamarlo dato.
 */
export function montosDeTexto(texto) {
  const t = String(texto ?? '')
  const salida = []
  const re = /(u\$s|us\$|usd|\$|ars)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(pesos|d[óo]lares)/gi
  for (const m of t.matchAll(re)) {
    const signo = String(m[1] ?? m[4] ?? '').toLowerCase()
    const valor = numeroAR(m[2] ?? m[3])
    if (valor === null || !(valor > 0)) continue
    salida.push({ valor, moneda: MONEDA_DE_SIGNO[signo] ?? 'ARS', literal: m[0].trim(), indice: m.index })
  }
  return salida
}

/** Lo que la página dice sobre el IVA. PURA. Se busca «+ IVA», «sin IVA», «más IVA», «IVA
 *  incluido», «precio final». Nada más: inferir de la ausencia es justo lo que está prohibido. */
export function ivaDeTexto(texto) {
  const t = String(texto ?? '')
  const sin = t.match(/\bm[áa]s\s+iva\b|\+\s*iva\b|\bsin\s+iva\b|\bneto\s+de\s+iva\b|\biva\s+no\s+incluido\b/i)
  if (sin) return { iva: IVA.SIN_IVA, literal: sin[0].trim(), porQue: `la página dice «${sin[0].trim()}»` }
  const con = t.match(/\biva\s+incl(?:uido|\.)?\b|\bcon\s+iva\b|\bprecio\s+final\b|\bfinal\s+al\s+p[úu]blico\b/i)
  if (con) return { iva: IVA.CON_IVA, literal: con[0].trim(), porQue: `la página dice «${con[0].trim()}»` }
  return { iva: IVA.NO_DECLARADO, literal: null, porQue: 'la página no dice si el precio lleva IVA o no' }
}

/**
 * LA PRESENTACIÓN DEL PRODUCTO: «x 50 kg», «bolsa de 25 kg», «envase 20 lt», «x 7KG». PURA.
 *
 * Es la misma trampa que `compras-precio.mjs` ya nombra en las filas de compras: una presentación
 * NO es una cantidad comprada, es cuánto trae el envase. Acá se usa para lo contrario que allá
 * —allá bloquea la división, acá la habilita— y por eso tiene que estar declarada explícitamente.
 */
export function presentacionDe(texto) {
  const t = String(texto ?? '')
  const m = t.match(/(?:\bx\s*|\bbolsa\s+de\s+|\bbolsa\s+|\benvase\s+(?:de\s+)?|\bbid[óo]n\s+(?:de\s+)?|\bcaja\s+(?:de\s+)?|\bpack\s+(?:de\s+)?|\brollo\s+(?:de\s+)?)(\d[\d.,]*)\s*([a-zA-Z]+\d?)/)
  if (!m) return null
  const valor = numeroAR(m[1])
  const u = normalizarUnidad(m[2])
  if (valor === null || !(valor > 0) || !u) return null
  return Object.freeze({ valor, unidad: u.canonica, dimension: u.dimension, literal: m[0].trim() })
}

/**
 * DE QUÉ UNIDAD ES ESTE PRECIO, cuando la página lo dice al lado del número. PURA.
 *
 * «$1.615 el kg», «$41.680,44 por m2», «$12.000/m³». Se mira una ventana corta DESPUÉS del monto:
 * más lejos que eso, la unidad que aparece es de otra frase.
 */
export function unidadDelPrecio(texto, desde = 0) {
  const ventana = String(texto ?? '').slice(desde, desde + 40)
  const m = ventana.match(/(?:\/|\bpor\s+|\bel\s+|\bla\s+|\bcada\s+)\s*([a-zA-Z]+[²³]?\d?)/)
  if (!m) return null
  const u = normalizarUnidad(m[1])
  return u ? Object.freeze({ unidad: u.canonica, dimension: u.dimension, literal: m[0].trim() }) : null
}

const no = (motivo, porQue) => Object.freeze({ sirve: false, valor: null, moneda: null, unidad: null, motivo, porQue })

/**
 * LA LECTURA COMPLETA: de un texto de página al precio unitario en la unidad del recurso. PURA.
 *
 * `alicuotaIva` es la alícuota de la empresa (0,21), que trae la política comercial. Sin ella un
 * precio CON IVA no se puede netear y la lectura no sirve: no se asume 21% porque «casi siempre es
 * 21%» — la construcción tiene ítems al 10,5%.
 */
export function lecturaDePrecioWeb({ texto, recurso = {}, alicuotaIva = null } = {}) {
  const u = normalizarUnidad(recurso.unidad)
  if (!u) return no(MOTIVO.UNIDAD_NO_RESUELTA, `el recurso se mide en «${recurso.unidad}», que no está en el diccionario de unidades: no hay a qué convertir`)

  const montos = montosDeTexto(texto)
  if (!montos.length) return no(MOTIVO.SIN_MONTO, 'el texto no trae ningún importe con moneda')
  const distintos = new Set(montos.map((m) => `${m.moneda}|${m.valor}`))
  if (distintos.size > 1) {
    return no(MOTIVO.VARIOS_MONTOS, `el texto trae ${distintos.size} importes distintos (${montos.slice(0, 4).map((m) => m.literal).join(', ')}): elegir uno es elegir al azar`)
  }
  const monto = montos[0]

  const iva = ivaDeTexto(texto)
  if (iva.iva === IVA.NO_DECLARADO) {
    return no(MOTIVO.IVA_NO_DECLARADO, `${iva.porQue}: una lista al público suele traerlo y el costo de la empresa va sin él — 21% de diferencia que nadie decidió`)
  }
  if (iva.iva === IVA.CON_IVA && !(Number(alicuotaIva) > 0)) {
    return no(MOTIVO.SIN_ALICUOTA, `la página declara «${iva.literal}» y no se pasó la alícuota con la que netearlo: el 21% no se supone`)
  }
  const neto = iva.iva === IVA.CON_IVA ? monto.valor / (1 + Number(alicuotaIva)) : monto.valor

  const conv = enLaUnidadDelRecurso({ texto, monto, neto, u })
  if (!conv.sirve) return conv

  return Object.freeze({
    sirve: true,
    valor: conv.valor,
    moneda: monto.moneda,
    unidad: u.canonica,
    iva: iva.iva,
    motivo: null,
    porQue: `${monto.literal} · ${iva.porQue}${iva.iva === IVA.CON_IVA ? ` → neto ÷ ${1 + Number(alicuotaIva)}` : ''} · ${conv.porQue}`,
  })
}

/** El monto llevado a la unidad del recurso, o el motivo por el que no se puede. PURA. */
function enLaUnidadDelRecurso({ texto, monto, neto, u }) {
  const pres = presentacionDe(texto)
  if (pres && pres.dimension === u.dimension) {
    const c = convertir(pres.valor, pres.unidad, u.canonica)
    if (c.estado !== ESTADO.CALCULADO) return no(MOTIVO.DIMENSION_INCOMPATIBLE, c.porQue)
    if (!(c.valor > 0)) return no(MOTIVO.DIMENSION_INCOMPATIBLE, `la presentación «${pres.literal}» da ${c.valor} ${u.canonica}: no se puede dividir por eso`)
    return { sirve: true, valor: neto / c.valor, porQue: `presentación «${pres.literal}» = ${c.valor} ${u.canonica}, así que el unitario es el importe ÷ ${c.valor}` }
  }
  const dicha = unidadDelPrecio(texto, monto.indice + monto.literal.length)
  if (!dicha) {
    return no(MOTIVO.UNIDAD_NO_RESUELTA, `el texto no dice de qué unidad es ${monto.literal}, y el recurso se cotiza en ${u.canonica}: dividir a ojo publica un costo inventado`)
  }
  if (dicha.dimension !== u.dimension) {
    return no(MOTIVO.DIMENSION_INCOMPATIBLE, `el precio está publicado por ${dicha.unidad} (${dicha.dimension}) y el recurso se cotiza en ${u.canonica} (${u.dimension}): no hay conversión, hay un error de cómputo`)
  }
  // OJO: un precio POR tonelada pasa a precio POR kilo dividiendo, no multiplicando. La unidad va
  // en el denominador y por eso acá va `factorDePrecio` y no `convertir`.
  const f = factorDePrecio(dicha.unidad, u.canonica)
  if (f.estado !== ESTADO.CALCULADO) return no(MOTIVO.DIMENSION_INCOMPATIBLE, f.porQue)
  return { sirve: true, valor: neto * f.factor, porQue: `publicado «${dicha.literal}» → ${u.canonica}: ${f.porQue}` }
}

/**
 * EL CANDIDATO A PRECIO DESDE UNA PÁGINA, O `null` CON MOTIVO. PURA.
 *
 * `envuelto` es lo que devuelve `aplicarPoliticaContenidoExterno`: no se desarma, no se reetiqueta.
 * La AUTORIDAD se calcula acá con `autoridadDe(url)` y NO se lee de ningún campo del texto — es la
 * única defensa que sirve contra una página que se declara oficial a sí misma.
 */
export function candidatoWeb({ recurso = {}, envuelto = null, alicuotaIva = null, pistasFabricante = [], obtenidoEn = null } = {}) {
  const texto = String(envuelto?.contenido_externo ?? '')
  const a = autoridadDe(envuelto?.url, { pistasFabricante })
  const sobreLaPagina = Object.freeze({
    instruccionesDetectadas: Object.freeze(envuelto?.inyeccion?.marcas ?? []),
    esManipulacion: Boolean(envuelto?.inyeccion?.sospechoso),
    queSeHizoConEllas: envuelto?.inyeccion?.sospechoso
      ? 'se REPORTARON como evidencia de manipulación; no cambiaron el valor, la unidad, la fuente ni la autoridad'
      : null,
  })
  const base = { candidato: null, autoridad: NOMBRE_AUTORIDAD[a.autoridad], url: envuelto?.url ?? null, sobreLaPagina }

  const lectura = lecturaDePrecioWeb({ texto, recurso, alicuotaIva })
  if (!lectura.sirve) return { ...base, lectura, porQue: lectura.porQue }

  // La fecha del dato: la de publicación si la página la trae —es la más conservadora—, y si no la
  // de consulta, que es el hecho que sí podemos afirmar: «el 30/08 esta página decía esto».
  const observadoEn = String(envuelto?.publicado_en ?? envuelto?.obtenido_en ?? obtenidoEn ?? '').slice(0, 10)
  if (!observadoEn) return { ...base, lectura, porQue: 'no hay ni fecha de publicación ni fecha de consulta: un precio sin fecha no se puede vencer' }

  const detalle = `${envuelto?.fuente ?? a.dominio ?? 'web'} · ${NOMBRE_AUTORIDAD[a.autoridad]} · ${envuelto?.url ?? 'sin URL'} · ${lectura.porQue}`
  try {
    return {
      ...base,
      lectura,
      porQue: detalle,
      candidato: candidatoDePrecio({
        recursoCodigo: recurso.codigo,
        valor: lectura.valor,
        moneda: lectura.moneda,
        // NO hay parámetro para pedir otro origen. Una página que pide ser experiencia de ECSAS
        // pide algo que esta llamada no puede expresar.
        origen: ORIGEN.WEB,
        observadoEn,
        detalleFuente: detalle,
        proveedor: a.dominio,
        evidencia: Object.freeze({
          url: envuelto?.url ?? null,
          dominio: a.dominio,
          autoridad: NOMBRE_AUTORIDAD[a.autoridad],
          porQueEsaAutoridad: a.porQue,
          publicadoEn: envuelto?.publicado_en ?? null,
          consultadoEn: envuelto?.obtenido_en ?? null,
          iva: lectura.iva,
          textoLiteral: texto.slice(0, 280) || null,
          // Se repite en la evidencia a propósito: quien audite el número sin leer el módulo tiene
          // que ver acá que esto no es un hecho de la empresa.
          noAsciende: Object.freeze(['HECHO ECSAS', 'EXPERIENCIA ECSAS', 'NORMA']),
          intentoDeManipulacion: sobreLaPagina.esManipulacion,
        }),
      }),
    }
  } catch (err) {
    return { ...base, lectura, porQue: `el precio web no se pudo construir: ${err.message}` }
  }
}

/**
 * LA CÁSCARA. Devuelve una función asíncrona que investiga UN recurso y produce su candidato.
 *
 * `investigarPrecio` se inyecta —en producción se arma con `resolvedorWeb()` de
 * `plano/investigacion.mjs`, que ya trae `buscar` y `leer`; en los tests es una función—. Sin ella
 * no hay resolvedor y el llamador se entera con `null`, no con una excepción: quedarse sin internet
 * no es un error de programa.
 */
export function resolvedorDePrecioWeb({ investigarPrecio = null, alicuotaIva = null, pistasFabricante = [] } = {}) {
  if (typeof investigarPrecio !== 'function') return null
  return async function precioWebDe(recurso) {
    const pregunta = `precio unitario de «${recurso.nombre ?? recurso.codigo}» por ${recurso.unidad} en San Juan, Argentina. Aclará si el precio lleva IVA y de qué presentación es.`
    let salida
    try {
      salida = await investigarPrecio({ pregunta, recurso })
    } catch (e) {
      return { candidato: null, porQue: `la consulta web falló: ${String(e?.message ?? e).slice(0, 160)}`, sobreLaPagina: null }
    }
    const envuelto = salida?.extra?.envuelto ?? salida?.envuelto ?? null
    if (!envuelto) return { candidato: null, porQue: salida?.porQue ?? 'la búsqueda no devolvió una página citable', sobreLaPagina: null }
    return candidatoWeb({ recurso, envuelto, alicuotaIva, pistasFabricante })
  }
}

/**
 * LA PASADA PREVIA: se investigan los recursos que hacen falta y se deja un MAPA código → candidato.
 *
 * Existe porque el resolvedor que consume `costo.mjs` es SÍNCRONO y no puede esperar una respuesta
 * de red en el medio de una suma. Separarlo así tiene además el efecto que se quiere: la red se usa
 * una vez, antes, con la lista completa, y el motor de costos sigue sin saber que existe.
 *
 * Sin `resolvedor` devuelve un mapa VACÍO y no falla: eso es el §13 escrito como código.
 */
export async function preciosWebDeRecursos({ recursos = [], resolvedor = null, tope = 40 } = {}) {
  const mapa = new Map()
  const recorrido = []
  if (typeof resolvedor !== 'function') {
    return { mapa, recorrido, porQue: 'no hay resolvedor web cableado: la cascada sigue igual, sin paso WEB' }
  }
  for (const r of recursos.slice(0, tope)) {
    const x = await resolvedor(r)
    if (x?.candidato) mapa.set(r.codigo, x.candidato)
    recorrido.push({ codigo: r.codigo, resuelto: Boolean(x?.candidato), porQue: x?.porQue ?? null, sobreLaPagina: x?.sobreLaPagina ?? null })
  }
  return { mapa, recorrido, porQue: `${mapa.size} de ${Math.min(recursos.length, tope)} recursos consultados devolvieron un precio citable` }
}
