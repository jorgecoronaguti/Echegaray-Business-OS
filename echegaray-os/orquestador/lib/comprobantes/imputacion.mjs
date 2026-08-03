// LO ESCRITO A MANO → LA IMPUTACIÓN (obra + detalle). NÚCLEO PURO, CERO MODELO.
//
// ═══ POR QUÉ EXISTE (03/08) ═══
//
// El dueño mandó al canal la foto de una factura de Corralón Progreso. Arriba a la izquierda, con
// birome, decía **"Messinas BSA"**. El bot contestó `obra: falta · ¿cuál es?` y no cargó nada. Ese
// mismo comprobante ya estaba en Compras fila 802, imputado a `MESSINA` / `Planta de BSA`.
//
// En esta empresa **la obra se anota A MANO sobre el comprobante**. Es el dato más importante para
// imputar el gasto y el ÚNICO que nunca viene impreso, porque el proveedor no sabe a qué obra va.
// Un módulo que no sabe leerlo es un módulo que pregunta siempre.
//
// ═══ LA LÍNEA ENTRE TOLERAR Y ADIVINAR ═══
//
// Lo escrito a mano viene en plural ("Messinas" por MESSINA), abreviado ("BSA" por "Planta de BSA"),
// con un error de tipeo, y encima leído por un OCR que también se equivoca. Tolerar eso es
// necesario. Pero **adivinar la obra imputa plata a la obra equivocada y ensucia el margen de las
// dos** — y nadie lo nota hasta el cierre. Entonces la regla es una sola y no se negocia:
//
//   **SI LA COINCIDENCIA NO ES ÚNICA, NO HAY COINCIDENCIA.** Empate = null = se pregunta.
//
// Preguntar está bien. No mirar está mal. Elegir entre dos es lo único inaceptable.
//
// ═══ CONTRA QUÉ SE MATCHEA ═══
//
// · La obra, contra el desplegable ESTRICTO de la columna J ("Cliente / Asignación"). Un valor que
//   no esté ahí no se puede escribir: la celda queda en rojo y rompe los cruces de Cash Flow.
// · El detalle, contra el vocabulario VIVO de la columna K ("Detalles / Obra"), que NO tiene
//   desplegable: es texto libre, y su lista legítima es la de los valores que el dueño ya usó en esa
//   obra. Leída del Sheet, nunca de una copia.
//
// Y el camino de vuelta, que es el que salvó el caso real: si la anotación no matchea ninguna obra
// pero sí un detalle, y TODOS los detalles que matchea cuelgan de una sola obra, la obra queda
// resuelta. "BSA" aparece en tres detalles de Compras —"Planta de BSA", "Camion - BSA",
// "Excavadora - BSA"— y los tres son de MESSINA: la obra es inequívoca aunque el detalle no lo sea.

import { normalizar } from '../carga-comprobantes.mjs'

/** Palabras que no identifican nada. Un match que se apoya sólo en éstas no es un match. */
export const VACIAS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'para', 'por', 'con', 'a', 'al', 'un', 'una',
  'sa', 'srl', 'sas', 'sh', 'obra', 'obras', 'pago', 'pagado', 'factura', 'fac', 'total', 'iva',
])

/** Largo mínimo de un token para que pueda sostener una coincidencia. "BSA" tiene que entrar. */
const MIN_TOKEN = 3

/**
 * Texto → tokens comparables. Además del token tal cual, se indexa su forma SIN PLURAL: lo que se
 * escribe a mano viene en plural mucho más seguido que el rótulo del desplegable ("Messinas" por
 * "MESSINA"), y sin esto la anotación más común de la empresa no matchea nada.
 */
export function tokens(texto) {
  const out = new Set()
  for (const t of normalizar(texto).split(/[^a-z0-9]+/)) {
    if (t.length < MIN_TOKEN || VACIAS.has(t)) continue
    out.add(t)
    if (t.length >= 5 && t.endsWith('s')) out.add(t.slice(0, -1))
    if (t.length >= 6 && t.endsWith('es')) out.add(t.slice(0, -2))
  }
  return out
}

/**
 * Distancia de edición acotada a 1. No se calcula la distancia real: sólo hace falta saber si dos
 * palabras difieren en a lo sumo un carácter, y así el costo es lineal y no cuadrático.
 */
export function difiereEnUno(a, b) {
  if (a === b) return true
  const [c, d] = a.length >= b.length ? [a, b] : [b, a]
  if (c.length - d.length > 1) return false
  let i = 0; let j = 0; let fallas = 0
  while (i < c.length && j < d.length) {
    if (c[i] === d[j]) { i++; j++; continue }
    if (++fallas > 1) return false
    if (c.length === d.length) { i++; j++ } else { i++ }
  }
  return fallas + (c.length - i) + (d.length - j) <= 1
}

/** ¿Este token del rótulo aparece en la anotación, tolerando un error de tipeo? */
function apareceEn(token, tokensAnotacion) {
  if (tokensAnotacion.has(token)) return true
  if (token.length < 5) return false // con 3 o 4 letras, un carácter de diferencia es otra palabra
  for (const t of tokensAnotacion) if (t.length >= 5 && difiereEnUno(token, t)) return true
  return false
}

/**
 * Cuántos tokens propios de `rotulo` aparecen en la anotación. 0 = no matchea.
 * Sólo cuentan los tokens que identifican: "Planta de BSA" pesa por "planta" y "bsa", no por "de".
 */
export function puntaje(rotulo, tokensAnotacion) {
  let n = 0
  for (const t of tokens(rotulo)) if (apareceEn(t, tokensAnotacion)) n++
  return n
}

/**
 * La ÚNICA opción de `lista` que la anotación identifica, o null.
 *
 * Tres pasadas, de la más fuerte a la más tolerante; la primera que devuelva **exactamente una**
 * candidata gana. Que sean pasadas y no un puntaje único importa: una coincidencia exacta tiene que
 * ganarle a una parcial aunque la parcial matchee más tokens.
 *
 * @param {string|null} texto
 * @param {string[]} lista  valores tal como se escriben en el Sheet
 * @returns {{valor:string, via:'exacta'|'parcial'|'palabras'}|null}
 */
export function matchUnico(texto, lista = []) {
  const a = normalizar(texto)
  if (!a || !Array.isArray(lista) || !lista.length) return null
  const opciones = lista.filter((o) => normalizar(o))

  const exactas = opciones.filter((o) => normalizar(o) === a)
  if (exactas.length === 1) return { valor: exactas[0], via: 'exacta' }
  if (exactas.length > 1) return null

  // Contención en los dos sentidos: la anotación puede decir menos ("Estrella") o más
  // ("obra Estrella 2do piso") que el rótulo.
  const contenidas = opciones.filter((o) => {
    const n = normalizar(o)
    return n.length >= 4 && (a.includes(n) || n.includes(a))
  })
  if (contenidas.length === 1) return { valor: contenidas[0], via: 'parcial' }
  if (contenidas.length > 1) return null

  // Por palabras: es la pasada que aguanta el plural, la abreviatura y el error de tipeo.
  const ta = tokens(a)
  if (!ta.size) return null
  let mejor = 0
  let ganadoras = []
  for (const o of opciones) {
    const p = puntaje(o, ta)
    if (p === 0) continue
    if (p > mejor) { mejor = p; ganadoras = [o] } else if (p === mejor) ganadoras.push(o)
  }
  return ganadoras.length === 1 ? { valor: ganadoras[0], via: 'palabras' } : null
}

/**
 * La imputación completa que se puede afirmar de una anotación manuscrita.
 *
 * @param {string|null} anotacion       lo que el modelo transcribió, tal cual
 * @param {object} vocabulario
 * @param {string[]} vocabulario.obras  desplegable estricto de la columna J
 * @param {Object<string,string[]>} [vocabulario.detalles]  obra → detalles ya usados en la columna K
 * @returns {{obra:string|null, obraVia:string|null, detalle:string|null, detalleVia:string|null}}
 */
export function imputacionDeAnotacion(anotacion, { obras = [], detalles = {} } = {}) {
  const nada = { obra: null, obraVia: null, detalle: null, detalleVia: null }
  if (!normalizar(anotacion)) return nada

  const porObra = matchUnico(anotacion, obras)
  if (porObra) {
    const d = matchUnico(anotacion, detalles?.[porObra.valor] ?? [])
    return { obra: porObra.valor, obraVia: porObra.via, detalle: d?.valor ?? null, detalleVia: d?.via ?? null }
  }

  // CAMINO DE VUELTA: la anotación no nombra la obra pero sí algo que sólo se usó en una.
  const ta = tokens(anotacion)
  if (!ta.size) return nada
  let mejor = 0
  let candidatos = [] // {obra, detalle}
  for (const [obra, lista] of Object.entries(detalles ?? {})) {
    if (!obras.length || obras.includes(obra)) {
      for (const det of lista ?? []) {
        const p = puntaje(det, ta)
        if (p === 0) continue
        if (p > mejor) { mejor = p; candidatos = [{ obra, detalle: det }] } else if (p === mejor) candidatos.push({ obra, detalle: det })
      }
    }
  }
  if (!candidatos.length) return nada
  const obrasDistintas = new Set(candidatos.map((c) => c.obra))
  // La obra se resuelve si TODOS los detalles que matchean cuelgan de la misma. El detalle, sólo si
  // además es uno solo: "BSA" dice sin ambigüedad que es MESSINA, y no dice cuál de los tres BSA es.
  if (obrasDistintas.size !== 1) return nada
  const obra = [...obrasDistintas][0]
  const detalles1 = [...new Set(candidatos.map((c) => c.detalle))]
  return {
    obra,
    obraVia: 'detalle',
    detalle: detalles1.length === 1 ? detalles1[0] : null,
    detalleVia: detalles1.length === 1 ? 'palabras' : null,
  }
}
