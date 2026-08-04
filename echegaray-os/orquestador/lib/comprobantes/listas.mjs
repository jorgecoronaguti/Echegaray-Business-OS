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
 * @returns {Promise<{ok:boolean, proveedores:string[], obras:string[], unidades:string[], error?:string}>}
 */
export async function listasDeCompras(google, { fileId = CASHFLOW_ID } = {}) {
  if (typeof google?.readSheetValidations !== 'function') {
    return { ok: false, proveedores: [], obras: [], unidades: [], error: 'sin cliente de Google' }
  }
  try {
    const hojas = await google.readSheetValidations(fileId, ['Compras!E4:E12', 'Compras!J4:J12', 'Compras!I4:I12'])
    const compras = (hojas || []).filter((h) => /^compras$/i.test(h.properties?.title))
    // Los dos rangos vuelven en `data[0]` de dos entradas distintas de la MISMA hoja, en el orden en
    // que se pidieron. Se toma por posición porque la API no rotula los rangos de vuelta.
    const conRangos = (hojas || []).find((h) => /^compras$/i.test(h.properties?.title) && (h.data?.length ?? 0) >= 2)
    if (conRangos) {
      return {
        ok: true,
        proveedores: opcionesDe({ data: [conRangos.data[0]] }),
        obras: opcionesDe({ data: [conRangos.data[1]] }),
        unidades: opcionesDe({ data: [conRangos.data[2]] }),
      }
    }
    return {
      ok: true,
      proveedores: opcionesDe(compras[0]),
      obras: opcionesDe(compras[1] ?? compras[0]),
      unidades: opcionesDe(compras[2] ?? {}),
    }
  } catch (e) {
    return { ok: false, proveedores: [], obras: [], unidades: [], error: String(e?.message ?? e).slice(0, 200) }
  }
}
