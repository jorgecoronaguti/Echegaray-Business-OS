// LA ECONOMÍA DE CADA OBRA, LEÍDA DE UNA SOLA FUENTE: `public.obra_economia_cartera`.
//
// Es lo que la pestaña OBRAS del Flujo de Caja publica por obra, persistido por
// `orquestador/scripts/obras-economia-sync.mjs`. La vista devuelve `contratado` en NULL a quien no
// ve economía (decisión 19/08: el jefe de obra no ve montos de venta).
//
// ═══ ACÁ SE LEÍAN TAMBIÉN `costo_mo`, `costo_materiales` Y `margen` (10/09/2026, orden del dueño) ═══
//
// «Administración es un CRM y Obra un ERP: todo lo pertinente a datos de clientes va en CRM, no
// mezcles cosas con obras.» El costo de una obra es del ERP: se decide contra el avance, el
// certificado y el costo real, y ninguna de esas tres cosas se mira desde la ficha de un cliente.
// Mientras esta lectura siguiera trayendo los tres campos, la próxima pantalla de Clientes los iba
// a encontrar servidos y la columna volvería sola — es exactamente lo que pasó con Margen.
// `definiciones.json · costo_de_obra` lo prohíbe ahora con un test.
//
// «sin contrato» dejó de existir acá: si OBRAS no tiene el dato, la pantalla dice «sin precio en
// OBRAS», que es lo único cierto. Un cero diría que la obra vale cero.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EconomiaDeObra {
  obra_canonica_id: string
  /** En PESOS. Cuando el contrato es en dólares, es la valuación al tipo de cambio VIVO. */
  contratado: number | null
  /**
   * LA MONEDA DEL CONTRATO SE DICE, NO SE ESCONDE (dueño, 10/09/2026 · Quattropani).
   *
   * El Salón Comercial se contrató en U$S 63.000. La pantalla publicaba sólo los pesos y el número
   * cambiaba solo de un día para otro sin que nada lo explicara. `contratado_usd` es el contrato y
   * `contratado` su valuación de HOY: se dibujan los dos, con el tipo de cambio en el `title`.
   */
  contratado_usd: number | null
  /** El TC con el que se valuó. `null` = el contrato es en pesos y no hubo que valuar nada. */
  tipo_cambio: number | null
  /**
   * POR QUÉ CAMINO SALIÓ EL CONTRATADO (`obra_economia_cartera.origen`). No es metadato: cambia lo
   * que el número SIGNIFICA, y hasta el 10/09/2026 la pantalla los dibujaba todos iguales.
   *
   *   `oc-pesos` · `oc-usd-x-tc`  hay un PRECIO en la columna de contrato de OBRAS.
   *   `oc-cliente`                OBRAS no lo declara, pero las ÓRDENES DE COMPRA que mandó el
   *                               cliente suman lo mismo (±$1): hay un papel que respalda el número
   *                               y `referencia` dice cuál. NO es una suma viva.
   *   `suma-viva`                 OBRAS no tiene precio: es la suma de lo que Cobranzas registró
   *                               como venta hasta hoy. Sube cada vez que se factura, y por eso no
   *                               se puede leer como «lo que vale la obra».
   *   `null`                      no hay ninguno de los dos.
   */
  origen: string | null
  /** El papel que respalda el contratado: «según OC 2256». `null` = no lo respalda ninguno. */
  referencia: string | null
  /**
   * LA DISCREPANCIA DECLARADA contra las OC cargadas: «OC $X c/IVA ($Y neto) vs Cobranzas $Z».
   * Se publica cuando la obra TIENE órdenes y no cierran. Una diferencia escrita se resuelve; una
   * que sólo existe entre dos pantallas, no.
   */
  nota: string | null
  /**
   * LOS DOS TOTALES DE ÓRDENES DE COMPRA, CON IVA, Y POR QUÉ SON DOS.
   *
   * `oc_civa_ventana` es lo que emitió el cliente DENTRO del año que acota el contratado;
   * `oc_civa_historico`, lo de otros años — típicamente las órdenes que entraron con una obra
   * fusionada. NO SE SUMAN: BSA absorbió `bsa-planta` y con ella tres OC de 2024 por $38.321.214,
   * y el panel mostraba «OC · OP c/IVA $49.886.583» al lado de un contratado de $17,7 M.
   */
  oc_civa_ventana: number | null
  oc_civa_historico: number | null
  oc_n_ventana: number | null
  oc_n_historico: number | null
}

/** El `origen` que dice «esto NO es un precio contratado, es lo vendido hasta hoy». */
export const ORIGEN_SUMA_VIVA = 'suma-viva'

/** El `origen` que dice «no lo declara OBRAS, pero hay una ORDEN DE COMPRA que lo respalda». Es un
 *  papel del cliente, no una suma que sube sola: la fila lo dice con la `referencia` («según OC
 *  2256») en vez de con la marca de suma viva. */
export const ORIGEN_OC_CLIENTE = 'oc-cliente'

export const SIN_PRECIO_EN_OBRAS = 'sin precio en OBRAS'

/**
 * Un fallo devuelve `null` —no un mapa vacío—: «no pude leer» y «OBRAS no tiene el dato» son dos
 * cosas distintas. Si la migración no está aplicada, la lectura falla y la pantalla sigue diciendo
 * «sin precio en OBRAS» en toda obra, que es verdad: no hay ningún dato leído.
 */
export async function getEconomiaDeObras(
  supabase: SupabaseClient,
): Promise<Map<string, EconomiaDeObra> | null> {
  const { data, error } = await supabase
    .from('obra_economia_cartera')
    .select('obra_canonica_id, contratado, contratado_usd, tipo_cambio, origen, referencia, nota, oc_civa_ventana, oc_civa_historico, oc_n_ventana, oc_n_historico')
  if (error) return null
  return armarEconomiaDeObras(data ?? [])
}

/** Las filas de `obra_economia_cartera` ya leídas → el mapa por obra. Separada de la consulta
 *  porque las mismas filas llegan por dos transportes: PostgREST y la RPC de la pantalla. Una
 *  conversión, dos transportes: si hubiera dos, la misma obra podría publicar dos precios. */
export function armarEconomiaDeObras(filas: unknown[]): Map<string, EconomiaDeObra> {
  const m = new Map<string, EconomiaDeObra>()
  for (const fila of filas) {
    const f = fila as Record<string, unknown>
    m.set(String(f.obra_canonica_id), {
      obra_canonica_id: String(f.obra_canonica_id),
      contratado: aNumero(f.contratado),
      contratado_usd: aNumero(f.contratado_usd),
      tipo_cambio: aNumero(f.tipo_cambio),
      origen: f.origen == null ? null : String(f.origen),
      referencia: f.referencia == null ? null : String(f.referencia),
      nota: f.nota == null ? null : String(f.nota),
      oc_civa_ventana: aNumero(f.oc_civa_ventana),
      oc_civa_historico: aNumero(f.oc_civa_historico),
      oc_n_ventana: aNumero(f.oc_n_ventana),
      oc_n_historico: aNumero(f.oc_n_historico),
    })
  }
  return m
}

/** PostgREST devuelve `numeric` como texto. `null` se queda `null`: nunca se vuelve 0. */
export function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ═══ EL MARGEN SE FUE DE ESTE MÓDULO (10/09/2026) ═══
//
// Vivían acá `margenPct`, `pctTexto`, `margenDeLaFila` y el techo aritmético que impedía publicar
// un porcentaje imposible (el «2.603.726 %» que el dueño vio en la fila de Quattropani). Se
// retiraron con las dos columnas Margen que los usaban —la de `/clientes` y la de la ficha del
// cliente— por orden del dueño: «quitá esa columna Margen, no es útil».
//
// NO SE PERDIÓ LA CAPACIDAD, CAMBIÓ DE MÓDULO. El margen de una obra vive en `features/obras`
// (`obra_economia`, `planVsReal`), donde se mide contra el costo REAL y el forecast y no contra un
// contratado que en cuatro de las cinco obras de Messina es una suma viva de Cobranzas. Sus reglas
// tienen sus propios tests allá. Dejar acá una función que nadie llama sería verde que no cuida
// nada, y peor: la próxima pantalla la encontraría servida y la columna volvería sola.

// ═══ `sumaConHuecos`, `pctTexto` Y `margenDeLaFila` SE RETIRARON CON SU ÚLTIMO CONSUMIDOR ═══
//
// Las tres restaban o sumaban COSTOS contra el contratado, y el costo salió del CRM el 10/09/2026
// por orden del dueño. Una función exportada que nadie llama no es inofensiva: es la pieza servida
// que hace que la columna vuelva sin que nadie la decida — pasó con el margen. El margen de una
// obra vive en `features/obras` (`obra_economia`, `planVsReal`), medido contra el costo REAL, y
// tiene sus tests allá.
