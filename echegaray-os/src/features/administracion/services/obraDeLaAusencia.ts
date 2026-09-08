// A QUÉ OBRA SE LE IMPUTA UNA AUSENCIA QUE VINO SIN OBRA.
//
// Vive aparte de `planDeJornada.ts` por tamaño (ese archivo ya está en el techo de 500 líneas) y
// porque es una regla completa en sí misma: se lee sola y se prueba sola, sin base y sin sesión.

// ── LA AUSENCIA ES DE LA PERSONA, NO DE UNA OBRA ────────────────────────────────────────────────
//
// El defecto (dueño, 08/09): *«si la persona está ausente o de licencia no me puede pedir que le
// asigne obra, cambiar eso»*. En la captura, GONZALEZ TOBARES —sin obra vigente, con las horas del
// día en LA ESTRELLA, que está cerrada y por eso no aparece en el selector— quedaba en un callejón:
// el panel pedía «Elegí la obra», ninguna de las ofrecidas era la del día, y declarar un accidente
// de trabajo obligaba a inventar una obra activa a la que imputarle una ausencia que no ocurrió ahí.
//
// Que alguien no venga es un hecho de la PERSONA. La obra sólo dice dónde se contabiliza, y eso el
// sistema lo puede deducir. Para «trabajó» la obra sigue siendo obligatoria: unas horas sin obra no
// tienen a quién imputarle el costo.
//
// ═══ POR QUÉ EL DÍA LE GANA A LA ASIGNACIÓN ═══
//
// El orden pedido nombraba primero la asignación vigente. Se invirtió a propósito para los días que
// YA tienen registros: resolver otra obra cuando el día está cargado en LA ESTRELLA convertiría la
// corrección en un MOVIMIENTO de obra —inserta en la nueva y borra la vieja— que nadie pidió, y el
// panel ya tiene un control explícito para mover un día. Con el día vacío no hay nada que mover y
// manda la asignación, que es donde se espera a la persona.
//
// ═══ NUNCA `null`, AUNQUE LA COLUMNA LO ACEPTE ═══
//
// `registros_hh.obra_canonica_id` es nullable en el esquema, pero la policy `hh_insert_por_obra`
// (migración `20260819T2900`) exige `obra_canonica_id is not null`, y `select`/`delete` también:
// una fila sin obra ENTRARÍA sólo para volverse invisible e imborrable. Ése es exactamente el
// agujero que esa migración cerró. Cuando no hay ninguna obra deducible, se dice — no se inventa
// una obra activa ni se escribe una fila que después nadie puede tocar.

export type PorQueEsaObra =
  | 'elegida' | 'registros-del-dia' | 'asignacion-vigente' | 'ultimos-registros' | 'ninguna'

export interface ObraDeLaAusencia {
  obra: string | null
  porque: PorQueEsaObra
}

/**
 * A qué obra se le imputa una ausencia que vino sin obra elegida.
 *
 * Pura y sin base: la cadena de fallbacks es la regla, y una regla que sólo se puede probar con
 * Supabase arriba no se prueba nunca.
 */
export function resolverObraDeLaAusencia(ctx: {
  /** La que eligió quien corrige. Si eligió, no se deduce nada. */
  elegida?: string | null
  /** Obras donde la persona YA tiene registros ese día. Vale aunque estén cerradas. */
  delDia?: readonly string[]
  /** Obras con asignación vigente ese día. */
  asignadasVigentes?: readonly string[]
  /** Obras de sus últimos registros, la más reciente primero. */
  ultimas?: readonly string[]
}): ObraDeLaAusencia {
  const primera = (xs: readonly string[] | undefined): string | null => xs?.[0] ?? null
  if (ctx.elegida) return { obra: ctx.elegida, porque: 'elegida' }
  const delDia = primera(ctx.delDia)
  if (delDia) return { obra: delDia, porque: 'registros-del-dia' }
  const asignada = primera(ctx.asignadasVigentes)
  if (asignada) return { obra: asignada, porque: 'asignacion-vigente' }
  const ultima = primera(ctx.ultimas)
  if (ultima) return { obra: ultima, porque: 'ultimos-registros' }
  return { obra: null, porque: 'ninguna' }
}

/**
 * Lo que el acuse agrega cuando la obra NO la eligió una persona, o `null` si la eligió.
 *
 * Una imputación que decidió el sistema se NOMBRA. Si no, el día aparece en una obra que quien
 * corrigió nunca vio en la pantalla.
 */
export function avisoDeObraDeducida(porque: PorQueEsaObra, nombreObra: string): string | null {
  if (porque === 'elegida' || porque === 'ninguna') return null
  const razon = porque === 'registros-del-dia'
    ? 'es donde ya estaban las horas de ese día'
    : porque === 'asignacion-vigente'
      ? 'es la obra a la que está asignada ese día'
      : 'es la obra de sus últimos registros'
  return `La ausencia quedó imputada a ${nombreObra}: ${razon}.`
}

/** El error cuando no hay ninguna obra deducible. Se pide elegir: inventar una sería peor. */
export const SIN_OBRA_DEDUCIBLE =
  'No pude deducir a qué obra imputarle la ausencia: esa persona no tiene horas ese día, ni '
  + 'asignación vigente, ni registros anteriores. Elegí una obra.'
