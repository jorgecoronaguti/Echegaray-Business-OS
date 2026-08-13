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
 * La lista sin las opciones que son EL MISMO VALOR escrito distinto. Gana la primera.
 *
 * ═══ DOS GRAFÍAS DE LO MISMO NO SON UNA AMBIGÜEDAD (13/08) ═══
 *
 * El desplegable vivo de la columna J trae **«Taller» y «TALLER»**: el mismo rótulo cargado dos veces
 * con distinta caja. Como `matchUnico` devuelve null ante cualquier empate, la anotación manuscrita
 * «Taller» —de las más frecuentes de la empresa— no matcheaba NADA, y el comprobante entraba sin obra
 * y, por lo tanto, sin detalle. Es la fila 840 del 13/08: el bot transcribió «Taller» en el concepto y
 * dejó J y K vacías. El defecto no estaba en el matcheo: estaba en llamar empate a lo que no lo es.
 *
 * La regla dura no se toca — **empate = null, se pregunta**. Lo que cambia es qué cuenta como empate:
 * dos cosas DISTINTAS que la anotación no separa. Dos formas de escribir la misma cosa imputan el
 * gasto exactamente al mismo lugar, así que elegir cualquiera de las dos no decide nada. Se toma la
 * primera, que es el orden en que el dueño cargó el desplegable.
 */
export function sinGrafiasRepetidas(lista = []) {
  const vistas = new Set()
  const out = []
  for (const o of lista ?? []) {
    const n = normalizar(o)
    if (!n || vistas.has(n)) continue
    vistas.add(n)
    out.push(o)
  }
  return out
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
  const opciones = sinGrafiasRepetidas(lista)

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

// ── LA CONDICIÓN DE VENTA ESCRITA A MANO ─────────────────────────────────────
//
// ═══ POR QUÉ EXISTE (05/08, pedido textual del dueño) ═══
//
// «tenés que interpretar lo que sale escrito en manuscrita para más certeza». En las fotos de esta
// semana la mano del dueño decía «Estrella / pisos - galpón 9 / c/c», «Autoelevador c/c» y
// «SF. Cuenta cte». Ese `c/c` NO es un adorno: es la condición de venta, y decide tres columnas de
// la fila (F modalidad, X estado, S total/parcial) vía `condicionAPago` del contrato de columnas.
// Cuenta corriente ⇒ **Pendiente**; contado o efectivo ⇒ **Pagado**.
//
// ═══ Y MANDA SOBRE LA IMPRESA ═══
//
// El papel dice lo que el proveedor imprimió al emitirlo; la anotación dice lo que la empresa
// decidió al recibirlo, y muchas veces se contradicen (un tique impreso «Contado» que se pagó por
// cuenta corriente). Entre las dos gana la de la mano del dueño: es posterior y es la nuestra.
//
// LA LÍNEA ENTRE INTERPRETAR Y ADIVINAR es la misma que gobierna la obra: **marcas inequívocas o
// null.** Dos marcas contradictorias en la misma anotación devuelven null y se pregunta — un estado
// de pago inventado hace que una deuda que existe no aparezca en el Flujo de Fondos.

/** Cuenta corriente escrita a mano: `c/c`, `cta cte`, `ctacte`, `cte`, `cuenta corriente`. */
const RE_CUENTA_CORRIENTE = /\bc\s*[/\-.]\s*c\b|\bcta\.?\s*\.?\s*cte\b|\bctacte\b|\bcuenta\s+c(orrien)?te\b|\bcte\b/

/** Contado escrito a mano. `pagad[oa]` y `pago/pagos` entran: es como lo escribe el dueño. */
const RE_CONTADO = /\bcontado\b|\befectivo\b|\bpagad[oa]s?\b|\bpagos?\b|\bcash\b/

/**
 * La condición de venta que dice lo escrito a mano, o null. NÚCLEO PURO, CERO MODELO.
 *
 * Devuelve exactamente los rótulos que entiende `condicionAPago` del contrato de columnas, para que
 * no haya un segundo vocabulario de condiciones en el repo.
 *
 * @param {string|null} anotacion
 * @returns {'Cuenta Corriente'|'Contado'|null}
 */
export function condicionDeAnotacion(anotacion) {
  const a = normalizar(anotacion)
  if (!a) return null
  const cc = RE_CUENTA_CORRIENTE.test(a)
  const co = RE_CONTADO.test(a)
  // Las dos a la vez no es una condición: es una anotación que hay que leer con el papel delante.
  if (cc === co) return null
  return cc ? 'Cuenta Corriente' : 'Contado'
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
