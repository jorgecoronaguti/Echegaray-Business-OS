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
 * ═══ LA LISTA NEGRA DE NOMBRES FALLÓ EN PRODUCCIÓN (27/08/2026, auditoría) ═══
 *
 * La primera versión tachaba por el NOMBRE del campo: `precio`, `costo`, `venta`, `margen`, `total`…
 * Contra `briefing.caja` con un `jefe_obra`, tachó `caja.total` y dejó los cinco `saldo` que lo
 * componen. Sumados dan exactamente el total que había tachado. La respuesta declaraba «12 campos
 * tachados», o sea afirmaba una protección que no ocurrió — que es peor que no filtrar, porque
 * quien lee la degradación cree que el número no salió.
 *
 * De 45 nombres de campo de plata que probó el auditor, 38 pasaban: `saldo`, `cobrado`,
 * `por_cobrar`, `caja_hoy`, `proyectado`, `ganancia`, `deuda`, `facturado`, `certificado`,
 * `pagado`, `anticipo`, `neto`, `bruto`, `jornal`, `sueldo`, `disponible`, `descubierto`…
 *
 * Es la cuarta enumeración de esta familia de archivos que falla por el mismo motivo: alguien tiene
 * que acordarse de escribir el nombre.
 *
 * ═══ LA REGLA QUE LA REEMPLAZA ═══
 *
 * Se invierte la carga. No se enumera lo que se tacha: se enumera lo que se MUESTRA, y todo lo demás
 * que tenga forma de plata se tacha. Un número grande dentro de una respuesta es plata mientras no
 * se demuestre que es una cantidad — y lo que es una cantidad se puede nombrar en veinte palabras,
 * mientras que lo que es plata no se termina de nombrar nunca.
 *
 * Lo que se muestra son las CANTIDADES del trabajo: piezas, metros, kilos, horas, días, personas,
 * documentos. Es exactamente lo que el jefe de obra necesita y nada de lo que no le corresponde.
 */

/** Debajo de esto un número no alcanza para ser un importe que importe. Un conteo de 46 correas, un
 *  porcentaje de avance o un año pasan; un saldo, no. */
export const UMBRAL = 1000

/**
 * LAS CLAVES CUYO NÚMERO SE MUESTRA AUNQUE SEA GRANDE. Cantidades del trabajo, no plata.
 * Se compara contra la clave completa o contra su último tramo (`cantidad_total` → `total` no, pero
 * `hh_previstas` → `hh` sí), por eso el patrón lleva bordes de palabra sobre `_`.
 */
export const CANTIDAD_VISIBLE = /(^|_)(cantidad|cantidades|unidad|unidades|hh|hs|horas|hora|jornadas|dias|dia|semanas|meses|mes|anio|ano|year|personas|empleados|dotacion|plantel|piezas|elementos|items|documentos|comprobantes|movimientos|registros|filas|count|cuenta_de|n|nro|numero_de|metros|ml|m2|m3|kg|kilos|tn|toneladas|litros|km|superficie|area|volumen|peso|longitud|distancia|capacidad|ladrillos|bolsas|tornillos|avance|porcentaje|dias_mora|antiguedad|orden|indice|version|revision|pagina|paginas|lamina|laminas)($|_)/i

/**
 * LOS TOKENS QUE HACEN QUE UNA CLAVE SEA PLATA, VALGA LO QUE VALGA.
 *
 * ═══ POR QUÉ VUELVE UNA LISTA DE NOMBRES, Y POR QUÉ ESTA VEZ NO ES EL MISMO ERROR ═══
 *
 * La primera versión tachaba SÓLO por nombre y por eso se fugó la caja: lo que no estaba en la
 * lista pasaba. Ésta es lo contrario: la regla del importe ya protege sola, y esta lista sólo puede
 * AGREGAR protección, nunca quitarla. Si me olvido de un nombre, el número grande se tacha igual por
 * el umbral; lo único que se pierde es tachar un importe chico.
 *
 * Cubre las dos cosas que el umbral no puede ver, las dos medidas por el auditor:
 *
 *   · LA PLATA CHICA — `margen 0,23`, `tasa 0,045`, `precio_unitario 800`, `tna 0,62`,
 *     `coeficiente 1,68`, `jornal_hora 950`. Un margen es información comercial aunque sea 0,23.
 *   · EL NOMBRE COMPUESTO — `costo_hora`, `precio_m2`, `saldo_mes`, `venta_mes`, `total_dia`.
 *     `CANTIDAD_VISIBLE` mira cualquier tramo de la clave, así que «hora» o «mes» alcanzaban para
 *     mostrar un costo de 5.000.000. El veto corre ANTES: si la clave nombra plata en algún tramo,
 *     no hay tramo que la rescate.
 */
// `total`, `subtotal` y `totales` NO están en el veto a propósito: un `documentos.total = 33` es un
// conteo, y vetarlo tacharía el cómputo del jefe de obra, que es justo lo que este filtro protege.
// Un total de plata es siempre grande, así que lo agarra el umbral igual — el veto sólo hace falta
// para lo que es plata SIENDO chico, que un total nunca es.
export const TOKEN_DE_PLATA = /(^|_)(precio|precios|costo|costos|venta|ventas|vendido|margen|markup|utilidad|rentabilidad|ganancia|ganancias|beneficio|cascada|importe|importes|monto|montos|iva|honorario|honorarios|arancel|tarifa|tasa|tna|tea|cft|coeficiente|valorizacion|valorizado|cotizado|saldo|saldos|caja|cobrado|cobrar|pagado|pagar|deuda|deudas|facturado|certificado|anticipo|retencion|descuento|neto|bruto|jornal|jornales|sueldo|sueldos|liquidacion|fondo_cese|disponible|descubierto|capital|interes|intereses|cuota|cuotas|usd|ars|pesos|dolares|plata|dinero|efectivo|proyectado|entra|sale)($|_)/i

/** Claves cuyo valor es un identificador y no una magnitud: nunca se tachan aunque sean largos. */
export const IDENTIFICADOR = /(^|_)(id|ids|uuid|clave|codigo|hash|correlation_id|request_id|drive_id|file_id|sheet_id|spreadsheet_id)($|_)/i

/** El texto de reemplazo. Se ve, y por eso se entiende que falta algo — un campo borrado parecería
 *  que el dato no existe. */
export const TACHADO = '[restringido]'

/**
 * IMPORTES DENTRO DE UN TEXTO LIBRE. Las tools del OS traen su `resumen_texto` ya redactado, con los
 * pesos escritos adentro.
 *
 * El patrón viejo sólo veía lo que llevaba símbolo o puntos de miles, y el auditor lo pasó con
 * `33670574`, `23%`, `48,5 millones` y `12 345 678`. Ahora son cuatro formas: con símbolo, con
 * separador de miles, cualquier corrida de cinco dígitos o más —que descarta años y horas—, y las
 * magnitudes escritas en palabras. Los porcentajes van aparte: un margen del 23% es información
 * comercial y no llega al umbral por ser un número chico.
 */
/** Las unidades que, escritas justo después de un número, lo convierten en una cantidad y no en
 *  plata. Sin esto el texto se contradecía con la estructura: `hh_previstas: 1200` se mostraba y
 *  «1.200 HH» se tachaba en la misma respuesta. */
const UNIDADES = 'hh|hs|horas?|jornadas?|d[ií]as?|personas?|unidades?|piezas?|elementos?|items?|documentos?|comprobantes?|m2|m3|ml|metros?|km|kg|kilos?|tn|toneladas?|litros?|ladrillos?|bolsas?|tornillos?|l[áa]minas?|p[áa]ginas?'
const NO_SEGUIDO_DE_UNIDAD = `(?!\\s*(${UNIDADES})\\b)`

const PLATA_EN_TEXTO = [
  // El CUIT/CUIL primero: lleva ocho dígitos seguidos adentro y la regla del importe lo partía en
  // «20[restringido]-9», que es un identificador tachado por la mitad. Mismo defecto que ya se
  // corrigió en el prompt de imágenes, vivo también acá.
  /\b\d{2}-\d{8}-\d\b|\b\d{11}\b/g,
  new RegExp(`(\\$|u\\$s|usd|ars|€)\\s*-?[\\d., ]+`, 'gi'),
  // Con `i`: la unidad se escribe «HH» tanto como «hh», y sin la bandera el negativo no la veía.
  new RegExp(`-?\\b\\d{1,3}([.\\s]\\d{3})+(,\\d+)?\\b${NO_SEGUIDO_DE_UNIDAD}`, 'gi'),
  new RegExp(`-?\\b\\d{5,}(,\\d+)?\\b${NO_SEGUIDO_DE_UNIDAD}`, 'gi'),
  /-?\b\d+([.,]\d+)?\s*(millones|millon|mil|palos|m|mm|k)\b/gi,
  /-?\b\d+([.,]\d+)?\s*%/g,
]

/** Tacha los importes de un texto. Devuelve `{texto, tachado}`. PURA.
 *
 *  `null` sale `null` y no cadena vacía: una tool que no trae texto propio ya devolvía `null`, y
 *  convertirlo en `''` hacía que la respuesta pareciera existir y estar en blanco. */
export function tacharPlataEnTexto(texto) {
  if (typeof texto !== 'string') return { texto: texto ?? null, tachado: false }
  let salida = texto
  for (const patron of PLATA_EN_TEXTO) salida = salida.replace(patron, TACHADO)
  return { texto: salida, tachado: salida !== texto }
}

/**
 * ¿Este valor, bajo esta clave, es plata? PURA — la regla entera, en orden, y el orden importa:
 *
 *   1. un identificador nunca es una magnitud;
 *   2. si la clave NOMBRA plata, es plata valga lo que valga (la plata chica y el nombre compuesto);
 *   3. si la clave nombra una cantidad del trabajo, se muestra;
 *   4. y si no la nombra nadie, un número grande es plata mientras no se demuestre lo contrario.
 *
 * El paso 2 sólo agrega protección: si falta un nombre, el paso 4 lo cubre igual.
 */
export function esPlata(clave, valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return false
  if (IDENTIFICADOR.test(clave)) return false
  if (TOKEN_DE_PLATA.test(clave)) return true
  if (CANTIDAD_VISIBLE.test(clave)) return false
  return Math.abs(valor) >= UMBRAL
}

/**
 * Tacha la información comercial de un resultado de tool. Recorre objetos y arrays a cualquier
 * profundidad porque una cotización anida partidas dentro de rubros dentro de la cascada, y porque
 * el defecto que esto reemplaza vivía justamente un nivel más abajo del que se miraba.
 *
 * @returns {{datos:any, campos:string[]}} `campos` son las RUTAS tachadas, para poder declararlas.
 * PURA: no muta la entrada.
 */
export function tacharComercial(datos, ruta = '', clave = '') {
  const campos = []

  if (datos === null || datos === undefined) return { datos, campos }
  if (typeof datos === 'number') {
    if (esPlata(clave, datos)) { campos.push(ruta); return { datos: TACHADO, campos } }
    return { datos, campos }
  }
  if (typeof datos === 'string') {
    if (IDENTIFICADOR.test(clave)) return { datos, campos }
    const t = tacharPlataEnTexto(datos)
    if (t.tachado) campos.push(ruta)
    return { datos: t.texto, campos }
  }
  if (typeof datos !== 'object') return { datos, campos }

  if (Array.isArray(datos)) {
    const salida = datos.map((v, i) => {
      // Un array hereda la clave de su padre: `saldos: [16490000, …]` son saldos, no anónimos.
      const r = tacharComercial(v, `${ruta}[${i}]`, clave)
      campos.push(...r.campos)
      return r.datos
    })
    return { datos: salida, campos }
  }

  const salida = {}
  for (const [k, valor] of Object.entries(datos)) {
    const r = ruta ? `${ruta}.${k}` : k
    const hijo = tacharComercial(valor, r, k)
    campos.push(...hijo.campos)
    salida[k] = hijo.datos
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
 * `args` entra también: el auditor señaló que `acciones.ejecutadas[].args` no pasaba por acá, y hay
 * tools que declaran parámetros de plata (`monto_venta`, `costo_estimado`, `margen_pct`, `importe`).
 *
 * @returns {{datos:any, respuesta:string|null, args:any, degradacion:string|null}}
 */
export function filtrarPorVisibilidad({ actor, datos, respuesta, args = null }) {
  if (veComercial(actor)) return { datos, respuesta, args, degradacion: null }
  const d = tacharComercial(datos)
  const a = tacharComercial(args)
  const t = tacharPlataEnTexto(respuesta)
  const campos = [...d.campos, ...a.campos]
  if (!campos.length && !t.tachado) return { datos, respuesta, args, degradacion: null }
  return {
    datos: d.datos,
    respuesta: t.texto,
    args: a.datos,
    degradacion: `información comercial tachada para el rol «${actor?.rol ?? 'desconocido'}»`
      + (campos.length ? ` (${campos.length} campo${campos.length === 1 ? '' : 's'})` : ''),
  }
}
