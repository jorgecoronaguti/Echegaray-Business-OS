// QUÉ PARTE DE UNA RESPUESTA PUEDE VER QUIEN PREGUNTÓ.
//
// ═══ POR QUÉ ESTO NO ES LO MISMO QUE «PUEDE CORRER LA TOOL» ═══
//
// `xsas-permisos.mjs` decide si el actor puede EJECUTAR una capacidad. Este archivo decide qué se
// le devuelve cuando sí puede. Son preguntas distintas y confundirlas fue un defecto real: un
// `jefe_obra` corrió `plano.cotizar` —una capacidad de lectura de planos, razonable para su rol— y
// recibió el costo directo, la venta sin IVA y la cascada comercial completa. Nadie le dio permiso
// de ver el precio: se lo dio la tool, porque calcularlo y mostrarlo eran el mismo acto.
//
//   PUEDE CALCULAR  ≠  PUEDE VER.
//
// ═══ POR QUÉ SE TACHA EN EL BACKEND Y NO EN LA PANTALLA ═══
//
// La misma respuesta sale por la app, por Mattermost y por un script. Ocultar el número en una de
// las tres caras deja las otras dos abiertas, y el JSON viaja igual aunque la pantalla no lo pinte.
// El único lugar donde tachar vale para todas las caras es acá, antes de que la respuesta salga del
// gateway.
//
// ═══ POR QUÉ SE TACHA Y NO SE RECHAZA ═══
//
// Un jefe de obra necesita las cantidades, las HH y los materiales del cómputo. Negarle la
// capacidad entera para proteger el margen le saca lo que sí es suyo. Se devuelve el trabajo y se
// tacha la plata, DICIENDO que se tachó — un recorte silencioso es una respuesta que miente por
// omisión.
//
// PURO: sin red, sin base, sin estado.

/** El permiso que habilita a ver plata. Vive en `PERMISOS_POR_ROL`, como todos los demás. */
export const PERMISO_COMERCIAL = 'comercial.read'

/**
 * NOMBRES DE CAMPO QUE SON PLATA. Se compara contra la CLAVE, no contra el valor: un campo llamado
 * `venta_sin_iva` es comercial aunque venga en null, y `cantidad` no lo es aunque valga 48000000.
 *
 * `total` y `subtotal` entran porque en una cotización siempre son pesos. `cantidad`, `unidad`,
 * `hh`, `horas`, `material`, `equipo` y `duracion` NO entran a propósito: son el cómputo, que es
 * justamente lo que el jefe de obra tiene que poder ver.
 */
export const CAMPO_COMERCIAL = /(^|_)(precio|precios|costo|costos|venta|ventas|margen|markup|utilidad|rentabilidad|cascada|importe|importes|monto|montos|subtotal|total|totales|iva|honorario|honorarios|arancel|tarifa|valorizacion|valorizado|coeficiente)($|_)/i

/** El texto de reemplazo. Se ve, y por eso se entiende que falta algo — un campo borrado parecería
 *  que el dato no existe. */
export const TACHADO = '[restringido]'

/**
 * IMPORTES DENTRO DE UN TEXTO LIBRE. Las tools del OS traen su `resumen_texto` ya redactado, con
 * los pesos escritos adentro: tachar sólo los campos estructurados dejaría el número en la frase.
 */
const PLATA_EN_TEXTO = /(\$|u\$s|usd|ars)\s*-?[\d.]+(,\d+)?|\b-?\d{1,3}(\.\d{3})+(,\d+)?\b/gi

/**
 * Tacha los importes de un texto. Devuelve `{texto, tachado}`. PURA.
 *
 * `null` sale `null` y no cadena vacía: una tool que no trae texto propio ya devolvía `null`, y
 * convertirlo en `''` hacía que la respuesta pareciera existir y estar en blanco. Se vio en
 * producción con `os.costos_obras`.
 */
export function tacharPlataEnTexto(texto) {
  if (typeof texto !== 'string') return { texto: texto ?? null, tachado: false }
  const salida = texto.replace(PLATA_EN_TEXTO, TACHADO)
  return { texto: salida, tachado: salida !== texto }
}

/**
 * Tacha la información comercial de un resultado de tool. Recorre objetos y arrays a cualquier
 * profundidad porque una cotización anida partidas dentro de rubros dentro de la cascada.
 *
 * @returns {{datos:any, campos:string[]}} `campos` son las RUTAS tachadas, para poder declararlas.
 * PURA: no muta la entrada.
 */
export function tacharComercial(datos, ruta = '') {
  const campos = []
  const marcar = (r) => { if (r) campos.push(r) }

  if (datos === null || datos === undefined) return { datos, campos }
  if (typeof datos === 'string') {
    const t = tacharPlataEnTexto(datos)
    if (t.tachado) marcar(ruta)
    return { datos: t.texto, campos }
  }
  if (typeof datos !== 'object') return { datos, campos }

  if (Array.isArray(datos)) {
    const salida = datos.map((v, i) => {
      const r = tacharComercial(v, `${ruta}[${i}]`)
      campos.push(...r.campos)
      return r.datos
    })
    return { datos: salida, campos }
  }

  const salida = {}
  for (const [clave, valor] of Object.entries(datos)) {
    const r = ruta ? `${ruta}.${clave}` : clave
    if (CAMPO_COMERCIAL.test(clave)) {
      salida[clave] = TACHADO
      marcar(r)
      continue
    }
    const hijo = tacharComercial(valor, r)
    campos.push(...hijo.campos)
    salida[clave] = hijo.datos
  }
  return { datos: salida, campos }
}

/** ¿Este actor puede ver plata? PURA y fail-closed: sin permisos declarados, no ve. */
export function veComercial(actor) {
  return (actor?.permisos ?? []).includes(PERMISO_COMERCIAL)
}

/**
 * EL FILTRO COMPLETO SOBRE UNA RESPUESTA DE TOOL.
 *
 * @returns {{datos:any, respuesta:string|null, degradacion:string|null}}
 * `degradacion` viene con nombre cuando se tachó algo: la respuesta sigue siendo útil pero ya no
 * es completa, y el contrato de XSAS dice que eso se declara.
 */
export function filtrarPorVisibilidad({ actor, datos, respuesta }) {
  if (veComercial(actor)) return { datos, respuesta, degradacion: null }
  const d = tacharComercial(datos)
  const t = tacharPlataEnTexto(respuesta)
  if (!d.campos.length && !t.tachado) return { datos, respuesta, degradacion: null }
  const cuantos = d.campos.length
  return {
    datos: d.datos,
    respuesta: t.texto,
    degradacion: `información comercial tachada para el rol «${actor?.rol ?? 'desconocido'}»`
      + (cuantos ? ` (${cuantos} campo${cuantos === 1 ? '' : 's'})` : ''),
  }
}
