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
  contratado: number | null
  /**
   * POR QUÉ CAMINO SALIÓ EL CONTRATADO (`obra_economia_cartera.origen`). No es metadato: cambia lo
   * que el número SIGNIFICA, y hasta el 10/09/2026 la pantalla los dibujaba todos iguales.
   *
   *   `oc-pesos` · `oc-usd-x-tc`  hay un PRECIO en la columna de contrato de OBRAS.
   *   `suma-viva`                 OBRAS no tiene precio: es la suma de lo que Cobranzas registró
   *                               como venta hasta hoy. Sube cada vez que se factura, y por eso no
   *                               se puede leer como «lo que vale la obra».
   *   `null`                      no hay ninguno de los dos.
   */
  origen: string | null
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
    .select('obra_canonica_id, contratado, origen')
  if (error) return null
  const m = new Map<string, EconomiaDeObra>()
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    m.set(String(f.obra_canonica_id), {
      obra_canonica_id: String(f.obra_canonica_id),
      contratado: aNumero(f.contratado),
      origen: f.origen == null ? null : String(f.origen),
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

// ═══ `sumaConHuecos` Y `pctTexto` SE RETIRARON CON SU ÚLTIMO CONSUMIDOR (10/09/2026) ═══
//
// `sumaConHuecos` sólo sumaba las dos columnas de costo de la cartera (MO ppto. · Mat. ppto.), que
// se fueron con la orden del dueño de sacar el ERP del CRM; `pctTexto` ya había quedado sin llamador
// cuando se retiró Margen. Una función exportada que nadie llama no es inofensiva: es la pieza
// servida que hace que la columna vuelva sin que nadie la decida — pasó con el margen.

// ═══ `margenDeLaFila` TAMBIÉN SE FUE (10/09/2026) ═══
//
// Era la última función de este módulo que restaba costos contra el contratado. Se retiró con las
// dos lecturas de costo: una regla sin consumidor es verde que no cuida nada, y servida como estaba
// era la invitación a que la columna volviera. El margen se mide en `features/obras`, contra el
// costo REAL y el forecast, y tiene sus tests allá.
