// LA MARCA CON LA QUE SE NOMBRA TODO LO QUE UNA PRUEBA CREA, Y CÓMO SE BARRE DESPUÉS.
//
// ═══ POR QUÉ EXISTE ═══
//
// El 22/08/2026 había en la base productiva cuatro proveedores «QA NO DEBE ENTRAR <epoch>» y dos
// personas «e2e-hh-<epoch>». Ninguno de los dos nombres arranca con `ZZ-E2E`, que es lo que barren
// las limpiezas de los propios specs (`delete … like 'ZZ-E2E%'`). No es casualidad: un residuo se
// barre sólo si se llama como el barrido espera.
//
// Cada suite se inventaba su prefijo —`ZZ-E2E`, `ZZ-EMPLEADO`, `ZZ-QA-JEFE`, `ZZE2E-ALTA`,
// `e2e-hh-`, `QA-COLA-`— y por eso ninguna limpieza podía encontrar el residuo de otra. Acá vive
// uno solo. La regla está medida por `orquestador/lib/marca-de-prueba-e2e.test.mjs`, que lee los
// specs y se pone rojo si alguno escribe en un maestro con un nombre que no arranca con `ZZ`.
//
// `ZZ` no es capricho: ordena último en cualquier listado alfabético, así que lo que se escape cae
// al final del maestro y no en el medio de los datos reales.

import type { SupabaseClient } from '@supabase/supabase-js'

/** La marca. Todo lo que una prueba escriba en un maestro empieza con esto. */
export const MARCA_PRUEBA = 'ZZ-E2E'

/** Un nombre marcado y único: `ZZ-E2E hh 1787412345678`. El sello va al final para que el listado
 *  siga agrupando por lo que la fila ES, y no por cuándo se creó. */
export function marca(que: string): string {
  return `${MARCA_PRUEBA} ${que} ${Date.now()}`
}

/** Lo que cuelga de una persona y hay que sacar ANTES que a ella: la clave foránea manda el orden. */
const DEPENDIENTES_DE_PERSONA = ['registros_hh', 'obra_asignacion', 'cuadrilla_integrante']

/**
 * SACA DEL PLANTEL LAS PERSONAS QUE CREÓ UNA PRUEBA — LAS DE ESTA CORRIDA Y LAS ABANDONADAS.
 *
 * ═══ POR QUÉ NO BARRE TODO LO QUE EMPIECE CON LA MARCA ═══
 *
 * Playwright corre varios workers a la vez. Un barrido de `like 'ZZ-E2E%'` en el `afterAll` de un
 * archivo se lleva por delante las personas que OTRO archivo está usando en ese mismo momento, y el
 * rojo que sale de ahí no señala ningún defecto del producto. Por eso:
 *
 *   · lo de ESTA corrida se identifica por su marca completa, que trae el sello de tiempo;
 *   · lo abandonado por corridas viejas se barre sólo si tiene más de un día — a esa edad ya no hay
 *     ningún worker usándolo.
 *
 * Un error de borrado NO tumba la prueba: se devuelve. Un `afterAll` que revienta tapa el resultado
 * real del test con un problema de limpieza y manda a buscar el defecto al lugar equivocado.
 */
export async function limpiarPersonasDePrueba(
  cliente: SupabaseClient,
  marcaPropia: string,
): Promise<string[]> {
  const problemas: string[] = []
  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const mias = await cliente.from('personas').select('id').like('nombre_completo', `${marcaPropia}%`)
  const viejas = await cliente.from('personas').select('id')
    .like('nombre_completo', `${MARCA_PRUEBA}%`).lt('created_at', ayer)
  for (const r of [mias, viejas]) if (r.error) problemas.push(`personas: ${r.error.message}`)

  const ids = [...new Set([...(mias.data ?? []), ...(viejas.data ?? [])].map((p) => p.id as string))]
  if (ids.length === 0) return problemas

  for (const tabla of DEPENDIENTES_DE_PERSONA) {
    const { error } = await cliente.from(tabla).delete().in('persona_id', ids)
    if (error) problemas.push(`${tabla}: ${error.message}`)
  }
  const { error } = await cliente.from('personas').delete().in('id', ids)
  if (error) problemas.push(`personas: ${error.message}`)
  return problemas
}
