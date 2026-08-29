// LOS UMBRALES, LEÍDOS DE DONDE VIVEN.
//
// Antes eran constantes de TypeScript sin fuente ni fecha. Ahora son filas de
// `parametro_operativo` con procedencia y estado, y la migración
// `20260829T1400_los_umbrales_dejan_de_vivir_en_typescript.sql` explica por qué.
//
// ═══ NO HAY VALOR POR DEFECTO ═══
//
// Si la fila no está, o si la RLS se la niega a quien pregunta, este módulo devuelve `null` y la
// pantalla dice que no lo sabe. Poner un `?? 17` acá sería exactamente el defecto que la tabla vino
// a matar: un número sin fuente decidiendo qué presupuesto se pinta en rojo, con la agravante de
// que ahora habría DOS definiciones —la fila y el respaldo— que pueden empezar a diferir sin que
// nadie lo note. NULL ≠ 0 y NULL ≠ «el valor de siempre».
//
// ═══ EL PORTERO NO ESTÁ ACÁ ═══
//
// `margen_objetivo_pct` está marcado `economico` y la policy de la tabla se lo niega a un jefe de
// obra. Verificado el 29/08/2026 contra la base, como `authenticated` con el uuid de un jefe real:
// devuelve las otras cuatro claves y no ésa. Acá no se filtra nada — filtrar en el cliente sería
// una segunda cerradura que puede desalinearse con la primera.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Los estados de dominio del contrato del cotizador. La UI traduce; el modelo es de dominio. */
export type EstadoParametro =
  | 'EXTRAIDO' | 'CALCULADO' | 'HISTORICO' | 'PROPUESTO' | 'CONFIRMADO' | 'VALIDADO'
  | 'FALTA_DATO' | 'AMBIGUO' | 'CONFLICTO' | 'ERROR' | 'NO_APLICA'

export interface ParametroOperativo {
  clave: string
  valor: number
  unidad: 'pct' | 'fraccion' | 'dias' | 'horas' | 'cantidad'
  ambito: string
  economico: boolean
  descripcion: string
  /** De dónde salió el número. Sin esto la tabla sería el mismo número sin fuente, mudado de lugar. */
  fuente: string
  estado: EstadoParametro
  /** Qué otra fuente dice otra cosa. Sólo cuando el estado es CONFLICTO — el CHECK lo obliga. */
  conflicto: string | null
  version: number
  vigencia_desde: string
}

export type Parametros = Readonly<Record<string, ParametroOperativo>>

const CAMPOS = 'clave, valor, unidad, ambito, economico, descripcion, fuente, estado, conflicto, version, vigencia_desde'

/**
 * LOS PARÁMETROS VIGENTES DE UN ÁMBITO, indexados por clave.
 *
 * Devuelve `{}` cuando no hay ninguno y el error por separado: una tabla vacía y una consulta que
 * falló se ven iguales desde una lista vacía, y son cosas distintas — la primera es «nadie lo
 * definió», la segunda es «no pude leer».
 */
export async function getParametrosOperativos(
  supabase: SupabaseClient,
  ambito: string,
): Promise<{ data: Parametros; error: string | null }> {
  const { data, error } = await supabase
    .from('parametro_operativo_vigente')
    .select(CAMPOS)
    .eq('ambito', ambito)

  if (error) return { data: {}, error: error.message }

  const mapa: Record<string, ParametroOperativo> = {}
  for (const f of (data ?? []) as unknown as ParametroOperativo[]) {
    // `numeric` de Postgres llega como string por PostgREST cuando no entra en un double seguro.
    mapa[f.clave] = { ...f, valor: Number(f.valor) }
  }
  return { data: Object.freeze(mapa), error: null }
}

/**
 * EL VALOR DE UNA CLAVE, o `null` si no está. PURA.
 *
 * `null` cubre tres casos que la pantalla tiene que poder distinguir del número: la fila no existe,
 * la RLS se la negó a este rol, o la consulta falló. Los tres significan «no lo sé», y ninguno
 * significa cero.
 */
export function valorDe(p: Parametros, clave: string): number | null {
  const f = p[clave]
  return f && Number.isFinite(f.valor) ? f.valor : null
}

/** ¿Este umbral está en conflicto declarado? La pantalla lo muestra; no lo resuelve. PURA. */
export function enConflicto(p: Parametros, clave: string): string | null {
  const f = p[clave]
  return f?.estado === 'CONFLICTO' ? (f.conflicto ?? 'conflicto declarado sin detalle') : null
}
