// LA ECONOMÍA DE CADA OBRA, LEÍDA DE UNA SOLA FUENTE: `public.obra_economia_cartera`.
//
// Es lo que la pestaña OBRAS del Flujo de Caja publica por obra —contratado, costo MO, costo
// materiales, margen— persistido por `orquestador/scripts/obras-economia-sync.mjs`. La vista
// devuelve `contratado` y `margen` en NULL a quien no ve economía (decisión 19/08: el jefe de obra
// no ve montos de venta); los costos los ve todo rol interno, igual que `obra_panel.costo_real`.
//
// «sin contrato» dejó de existir acá: si OBRAS no tiene el dato, la pantalla dice «sin precio en
// OBRAS», que es lo único cierto. Un cero diría que la obra vale cero.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EconomiaDeObra {
  obra_canonica_id: string
  contratado: number | null
  costo_mo: number | null
  costo_materiales: number | null
  margen: number | null
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
    .select('obra_canonica_id, contratado, costo_mo, costo_materiales, margen, origen, referencia,  nota, oc_civa_ventana, oc_civa_historico, oc_n_ventana, oc_n_historico')
  if (error) return null
  const m = new Map<string, EconomiaDeObra>()
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    m.set(String(f.obra_canonica_id), {
      obra_canonica_id: String(f.obra_canonica_id),
      contratado: aNumero(f.contratado),
      costo_mo: aNumero(f.costo_mo),
      costo_materiales: aNumero(f.costo_materiales),
      margen: aNumero(f.margen),
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

/**
 * SUMA QUE NO INVENTA: si NINGUNA fila trae el dato, el total es `null`; si alguna lo trae, suma las
 * que lo traen. Un total sobre filas parcialmente vacías se marca con `parcial` para que la
 * pantalla lo diga.
 */
export function sumaConHuecos(valores: (number | null)[]): { total: number | null; parcial: boolean } {
  const con = valores.filter((v): v is number => v !== null)
  if (con.length === 0) return { total: null, parcial: false }
  return { total: con.reduce((a, b) => a + b, 0), parcial: con.length < valores.length }
}

/** `–12,3 %` / `18 %`: el margen en porcentaje, sin decimales falsos. */
export function pctTexto(p: number | null): string | null {
  if (p === null) return null
  return `${p.toLocaleString('es-AR', { maximumFractionDigits: 0 })} %`
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL MARGEN DE UNA FILA — vivía en `chipsCartera.ts`, que se retiró el 10/09/2026 junto con los
// chips «sin CUIT · sin teléfono · sin contrato» que el dueño mandó sacar de la pantalla. La
// regla del margen no era un chip: es economía de la obra, y su casa es este archivo — que además
// era el otro que declaraba `sin precio en OBRAS`, la misma frase escrita dos veces.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EL MARGEN DE LA FILA. UNA definición, y `null` cuando no se puede afirmar.
 *
 * Manda lo que OBRAS publica (`obra_economia_cartera.margen`): es el número que el dueño mira en el
 * Sheet, y recalcularlo acá sería una segunda versión del mismo concepto. Sólo si la vista NO lo
 * trae se deriva, y con la MISMA fórmula que el rótulo de la columna declara —contratado − MO −
 * materiales—, que es lo que hace que las dos no puedan divergir.
 *
 * SI FALTA CUALQUIERA DE LOS TRES, EL RESULTADO ES `null`. Tratar un hueco como cero publicaría el
 * margen entero como ganancia el día que el costo de materiales no esté cargado.
 */
export function margenDeLaFila(e: {
  margenPublicado: number | null
  contratado: number | null
  costoMo: number | null
  costoMateriales: number | null
}): number | null {
  if (e.margenPublicado !== null) return e.margenPublicado
  if (e.contratado === null || e.costoMo === null || e.costoMateriales === null) return null
  return e.contratado - e.costoMo - e.costoMateriales
}
