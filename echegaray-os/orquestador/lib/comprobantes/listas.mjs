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
export async function proveedoresPorCuit(google, { fileId = CASHFLOW_ID, rango = 'Proveedores!A41:B200' } = {}) {
  const mapa = new Map()
  if (typeof google?.readSheetValues !== 'function') return mapa
  try {
    for (const f of await google.readSheetValues(fileId, rango)) {
      const nombre = String(f?.[0] ?? '').trim()
      const cuit = String(f?.[1] ?? '').replace(/\D/g, '')
      // El primero gana: si el mismo CUIT apareciera dos veces con nombres distintos, quedarse con
      // uno al azar sería peor que quedarse con el de arriba, que es el que el dueño ordenó primero.
      if (nombre && cuit.length === 11 && !mapa.has(cuit)) mapa.set(cuit, nombre)
    }
  } catch { /* sin listas se sigue matcheando por nombre: no poder leer no es un dato */ }
  return mapa
}
