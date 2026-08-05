// LAS LISTAS ESTRICTAS DE "Compras", leídas del Sheet vivo.
//
// Las columnas E (Proveedor) y J (Cliente/Asignación = obra) tienen desplegable ESTRICTO: un valor
// que no está en la lista no se puede escribir, y si se fuerza queda una celda en rojo que rompe los
// cruces de Proveedores y de Cash Flow. Por eso el OS no propone un proveedor ni una obra que no
// estén acá: los matchea, y si no matchea, pregunta.
//
// SE LEEN DEL SHEET, NO DE UNA COPIA. Una lista de proveedores duplicada en Postgres o en una
// constante del repo empieza igual y termina distinta el día que el dueño agrega uno a mano. La
// regla de realidad única aplica también a un desplegable.
//
// SÓLO LECTURA. Este archivo no escribe nada: `readSheetValidations` pide la metadata de validación
// de un rango chico. El freno de mano de Sheets no lo afecta —no hay nada que frenar— y por eso
// mostrar lo que se leyó de una foto sigue funcionando con el freno puesto.

/** El libro de Flujo de Fondos. Mismo default que el cargador; se pisa por entorno. */
export const CASHFLOW_ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** Saca los valores de un desplegable ONE_OF_LIST de la primera celda del rango que lo tenga. */
function opcionesDe(hoja) {
  for (const row of hoja?.data?.[0]?.rowData || []) {
    const dv = (row.values || [])[0]?.dataValidation
    if (dv?.condition?.type === 'ONE_OF_LIST') return dv.condition.values.map((v) => v.userEnteredValue)
  }
  return []
}

/**
 * Proveedores, obras y unidades de negocio del desplegable estricto de "Compras".
 *
 * Nunca lanza: si Google no contesta, devuelve listas vacías y lo DECLARA en `ok:false`. Con listas
 * vacías el matcheo de proveedor no puede afirmar nada, y quien llame tiene que saber que la
 * ausencia de match viene de que no se pudo leer la lista, no de que el proveedor sea nuevo. Es la
 * diferencia entre "no está" y "no sé".
 *
 * @param {object} google  cliente de `lib/google.mjs`
 * LA UNIDAD DE NEGOCIO (columna I) se agregó el 04/08. Es la tercera columna que quedaba vacía en
 * toda fila cargada por el chat, junto con la obra (J) y el detalle (K), y sin su lista no se la
 * puede ofrecer: escribir "civil" a mano donde hay un desplegable estricto deja la celda en rojo.
 *
 * LA CATEGORÍA (B) Y EL TIPO DE PAGO (P) se agregaron el 04/08 por las dos caras del mismo problema:
 * B quedaba SIEMPRE vacía y P quedaba con basura ("Importe", "30 DIAS FECHA FACTURA") porque nadie
 * comparaba lo leído contra la lista. Un desplegable estricto que no se lee es un desplegable que no
 * defiende nada.
 *
 * EL ORDEN DE LOS RANGOS ES CONTRATO: la API no rotula los rangos de vuelta, así que se toman por
 * posición. Agregar uno nuevo se hace SIEMPRE al final.
 *
 * @returns {Promise<{ok:boolean, proveedores:string[], obras:string[], unidades:string[], categorias:string[], tiposPago:string[], error?:string}>}
 */
const RANGOS = ['Compras!E4:E12', 'Compras!J4:J12', 'Compras!I4:I12', 'Compras!B4:B12', 'Compras!P4:P12']
const ORDEN = ['proveedores', 'obras', 'unidades', 'categorias', 'tiposPago']

export async function listasDeCompras(google, { fileId = CASHFLOW_ID } = {}) {
  const vacias = { proveedores: [], obras: [], unidades: [], categorias: [], tiposPago: [] }
  if (typeof google?.readSheetValidations !== 'function') {
    return { ok: false, ...vacias, error: 'sin cliente de Google' }
  }
  try {
    const hojas = await google.readSheetValidations(fileId, RANGOS)
    const compras = (hojas || []).filter((h) => /^compras$/i.test(h.properties?.title))
    // Todos los rangos vuelven en `data[k]` de la MISMA entrada de hoja, en el orden en que se
    // pidieron. El fallback —una entrada por rango— es la otra forma en que la API los devuelve.
    const conRangos = compras.find((h) => (h.data?.length ?? 0) >= 2)
    const out = { ok: true, ...vacias }
    ORDEN.forEach((clave, k) => {
      out[clave] = conRangos
        ? opcionesDe({ data: [conRangos.data[k]] })
        : opcionesDe(compras[k] ?? (k ? {} : compras[0]))
    })
    return out
  } catch (e) {
    return { ok: false, ...vacias, error: String(e?.message ?? e).slice(0, 200) }
  }
}

/**
 * CUIT → nombre EXACTO del desplegable de Compras, leído de la pestaña `Proveedores`.
 *
 * ═══ POR QUÉ EXISTE (04/08) ═══
 *
 * El desplegable de Compras usa el nombre de FANTASÍA («DUPEC», «Corralon Progreso») y la factura
 * trae la razón social del padrón («DUBOS UGARTE PEDRO LUIS RAUL», «PEREZ GARCIA MARISOL BIBIANA»).
 * No se parecen, y no tienen por qué parecerse: ningún matcheo de texto los va a unir nunca. El CUIT
 * sí — está impreso en la factura y cargado en la columna B de `Proveedores`.
 *
 * NUNCA LANZA y nunca inventa: si no se puede leer la pestaña, devuelve un mapa vacío y el matcheo
 * sigue siendo por nombre, exactamente como antes. Una lectura fallida no puede convertirse en un
 * proveedor equivocado.
 *
 * @returns {Promise<Map<string,string>>} CUIT sin guiones → nombre tal cual está escrito
 */
export async function proveedoresPorCuit(google, { fileId = CASHFLOW_ID, rango = 'Proveedores!A1:B400' } = {}) {
  if (typeof google?.readSheetValues !== 'function') return new Map()
  try {
    return cuitsDeLaGrilla(await google.readSheetValues(fileId, rango))
  } catch { /* sin listas se sigue matcheando por nombre: no poder leer no es un dato */ }
  return new Map()
}

/** El encabezado que marca dónde empieza el bloque de cuenta corriente. Ver `cuitsDeLaGrilla`. */
const RE_ENCABEZADO_CUIT = /\bcuit\b/i

/**
 * El título de una sección de la pestaña ("3 · NOTAS DE CRÉDITO"). Cierra el bloque que se venía
 * leyendo. Es la gramática que la pestaña ya usa para separar sus partes: anclarse a ella es
 * anclarse al texto, no a la fila.
 */
const RE_TITULO_SECCION = /^\s*\d+\s*·/

/**
 * CUIT → nombre, buscando el bloque POR SU ENCABEZADO y no por su número de fila.
 *
 * ═══ EL RANGO FIJO ESTABA ANCLADO A UNA POSICIÓN QUE SE MUEVE (05/08) ═══
 *
 * Antes esto leía `Proveedores!A41:B200`. Medido contra la pestaña viva: el bloque de cuenta
 * corriente —el único donde la columna B es un CUIT— arranca en la fila 55, debajo del encabezado
 * «Proveedor | CUIT (OS) | Comprado 2026». Las filas 41 a 54 son la cola del bloque de arriba, donde
 * la columna B es el N° de comprobante: se estaban leyendo números de factura como si fueran CUIT.
 *
 * Y el bloque SE MUEVE. `Proveedores` la regenera un generador cada dos horas y su primera sección
 * crece y se achica con la cantidad de facturas abiertas: cada factura nueva empuja el bloque de
 * CUIT una fila hacia abajo. Con 74 CUIT hoy, el tope de 200 aguanta; el día que la deuda abierta
 * sume filas, los últimos proveedores se caen del rango y el bot los declara "nuevos" —que es
 * exactamente el mensaje que traba la carga—, sin un solo error en ningún lado.
 *
 * Se busca el encabezado que dice CUIT y se lee de ahí para abajo. Un encabezado se renombra mucho
 * menos que una fila se corre, y si el bloque desapareciera el mapa vuelve vacío: el matcheo sigue
 * siendo por nombre, igual que cuando Google no contesta.
 *
 * NÚCLEO PURO: entra la grilla, sale el mapa. Es lo que permite probar el defecto sin el Sheet real.
 *
 * @param {Array<Array<string>>} grilla  filas de dos columnas: nombre y CUIT
 * @returns {Map<string,string>} CUIT sin guiones → nombre tal cual está escrito
 */
export function cuitsDeLaGrilla(grilla = []) {
  const mapa = new Map()
  let dentro = false
  for (const f of grilla) {
    const a = String(f?.[0] ?? '').trim()
    const b = String(f?.[1] ?? '').trim()
    if (!dentro) {
      // El encabezado del bloque: la segunda columna se llama CUIT. Los otros dos encabezados de la
      // pestaña ("Se le debe", "N° Comprobante") no lo dicen, y son justo los que no hay que leer.
      if (a && RE_ENCABEZADO_CUIT.test(b)) dentro = true
      continue
    }
    // ═══ Y SE CIERRA EN LA SECCIÓN SIGUIENTE ═══
    //
    // La pestaña tiene DOS bloques con CUIT y significan cosas distintas: el de cuenta corriente usa
    // el nombre del DESPLEGABLE («DUPEC») y el de cobertura de ARCA usa la razón social del padrón
    // («DUBOS UGARTE PEDRO LUIS RAUL»). Este mapa promete lo primero —es lo único que se puede
    // escribir en la columna E— y mezclarle lo segundo sería meter dos verdades en un solo mapa.
    if (RE_TITULO_SECCION.test(a)) break
    // Un CUIT tiene once dígitos. Lo que no los tenga se saltea sin cortar el bloque: en la columna
    // hay proveedores sin CUIT cargado, y frenar en el primero dejaría afuera a todos los de abajo.
    const cuit = b.replace(/\D/g, '')
    // El primero gana: si el mismo CUIT apareciera dos veces con nombres distintos, quedarse con
    // uno al azar sería peor que quedarse con el de arriba, que es el que el dueño ordenó primero.
    if (a && cuit.length === 11 && !mapa.has(cuit)) mapa.set(cuit, a)
  }
  return mapa
}
