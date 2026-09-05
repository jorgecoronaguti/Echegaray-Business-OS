// SACAR EL ARGUMENTO DE LA FRASE SIN PREGUNTARLE A NADIE — la regla antes que el modelo.
//
// ═══ POR QUÉ ESTO VA PRIMERO ═══
//
// `completarArgumentos` le pide a un modelo que copie de la frase el valor de un parámetro. Para
// «analizá los planos de Quattropani» eso es pagar una llamada de red, esperar 800 ms y aceptar un
// margen de error, para hacer lo que un `indexOf` contra la lista de obras hace en microsegundos y
// sin equivocarse.
//
// Y hay una razón más fuerte que el costo: **el OS tiene la lista canónica y el modelo no.** Un
// modelo puede devolver «Quattropani», «quattropani», «obra Quattropani» o «Cuatropani»; la lista
// devuelve el nombre exacto con el que la obra existe en la base. La regla no es una aproximación
// barata al modelo: es más precisa que el modelo, porque conoce el universo de respuestas válidas.
//
// ═══ LA PARTE QUE IMPORTA: CUÁNDO NO CONTESTAR ═══
//
// Si la frase menciona DOS obras del catálogo, esta función no elige. Devolver una de las dos sería
// exactamente el error que más caro sale: ejecutar la capacidad sobre la obra equivocada, con la
// pantalla diciendo que todo salió bien. Un empate se declara y sube — al modelo, o a la persona.
//
// ═══ QUÉ NO HACE ═══
//
// No resuelve por parecido. `identidad.mjs` ya midió que el parecido textual no vincula entidades en
// este OS (0 vinculaciones de 98 por ML; el CUIT hizo las 45). Acá se busca el nombre canónico
// CONTENIDO en la frase, no el más parecido: un match por similitud metería la obra equivocada con
// la misma cara de certeza.

import { normalizar } from './ml/normalizar.mjs'

/**
 * QUÉ CATÁLOGO CORRESPONDE A CADA PARÁMETRO.
 *
 * Se decide por el NOMBRE del parámetro porque es lo que las tools ya declaran en su `input_schema`
 * y no hay que tocar cuarenta archivos para estrenarlo. Lo que no está acá no se resuelve por
 * catálogo y sigue el camino de siempre — agregar una fila es habilitar un parámetro, nunca
 * cambiar el comportamiento de los demás.
 */
export const CATALOGO_DE = Object.freeze({
  obra: 'obras',
  proyecto: 'obras',
  obra_nombre: 'obras',
  proveedor: 'proveedores',
  razon_social: 'proveedores',
  cliente: 'clientes',
})

/**
 * Los nombres del catálogo que aparecen TEXTUALMENTE en la frase.
 *
 * Se compara sobre texto normalizado —sin tildes, sin mayúsculas, sin puntuación— para que
 * «quattropani» encuentre «Quattropani» sin abrir la puerta al parecido.
 *
 * Se exige que el nombre tenga al menos 4 caracteres normalizados: un catálogo con una entrada
 * llamada «SA» o «II» encontraría coincidencias en media frase del castellano.
 */
export function candidatosEnFrase(texto, catalogo = []) {
  const frase = ` ${normalizar(texto)} `
  const vistos = new Set()
  const hallados = []
  for (const nombre of catalogo) {
    const n = normalizar(nombre)
    if (n.length < 4) continue
    if (!frase.includes(` ${n} `) && !frase.includes(` ${n},`) && !frase.includes(`${n} `)) continue
    if (vistos.has(n)) continue
    vistos.add(n)
    hallados.push(nombre)
  }
  // El más largo primero: si el catálogo tiene «San Francisco» y «San Francisco II», y la frase dice
  // la segunda, las dos coinciden. Quedarse con la corta sería contestar sobre otra obra.
  return hallados.sort((a, b) => normalizar(b).length - normalizar(a).length)
}

/**
 * Resuelve un parámetro contra su catálogo. Devuelve `{valor}` o `{ambiguo}` o nada.
 *
 * @returns {{valor:string}|{ambiguo:string[]}|null}
 */
export function resolverParametro(texto, parametro, catalogos = {}) {
  const cual = CATALOGO_DE[String(parametro ?? '').toLowerCase()]
  if (!cual) return null
  const lista = catalogos[cual]
  if (!Array.isArray(lista) || !lista.length) return null

  const hallados = candidatosEnFrase(texto, lista)
  if (!hallados.length) return null
  if (hallados.length === 1) return { valor: hallados[0] }

  // Un nombre que CONTIENE a otro no es un empate: «San Francisco II» contiene a «San Francisco» y
  // la frase dijo la larga. Sólo es empate cuando ninguno contiene al otro.
  const largo = normalizar(hallados[0])
  const rivales = hallados.slice(1).filter((h) => !largo.includes(normalizar(h)))
  if (!rivales.length) return { valor: hallados[0] }
  return { ambiguo: [hallados[0], ...rivales] }
}

/**
 * COMPLETAR POR CATÁLOGO LO QUE SE PUEDA. Deja intacto el resto.
 *
 * @returns {{args:object, falta:string[], resueltos:string[], ambiguos:object}}
 */
export function completarPorCatalogo({ texto, args = {}, falta = [], catalogos = {} } = {}) {
  const salida = { ...args }
  const resueltos = []
  const ambiguos = {}
  const quedan = []

  for (const k of falta) {
    const r = resolverParametro(texto, k, catalogos)
    if (r?.valor !== undefined) { salida[k] = r.valor; resueltos.push(k); continue }
    // Un ambiguo NO se rellena y NO se da por resuelto: sigue faltando, y además se dice cuáles
    // eran para que quien pregunte pueda ofrecer las dos opciones en vez de un «no entendí».
    if (r?.ambiguo) ambiguos[k] = r.ambiguo
    quedan.push(k)
  }
  return { args: salida, falta: quedan, resueltos, ambiguos }
}
