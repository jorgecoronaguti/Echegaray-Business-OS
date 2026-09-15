// LA TARDANZA ES UNA MARCA SOBRE UNA PRESENCIA (dueño, 15/09/2026): llegó tarde o se fue antes.
//
// Una sola en la quincena pierde el presentismo entero (`presentismo.ts`). Vive en `asistencia_dia`
// —la presencia declarada— y no en `registros_hh`: es un hecho sobre la persona ese día, no una hora
// imputada a una obra. Sólo tiene sentido con `presente`: el CHECK `asistencia_dia_tardanza_solo_presente`
// lo impide en la base y `loQueViajaPresencia` en la pantalla.

export interface Tardanza {
  llego_tarde: boolean
  salio_antes: boolean
}

export const SIN_TARDANZA: Tardanza = { llego_tarde: false, salio_antes: false }

/** Ausente en lo guardado (columna sin aplicar) se lee como `false`: la marca vieja no puede «cambiar». */
export const mismaTardanza = (a: Partial<Tardanza>, b: Partial<Tardanza>): boolean =>
  (a.llego_tarde === true) === (b.llego_tarde === true) && (a.salio_antes === true) === (b.salio_antes === true)

export const hayTardanza = (t: Partial<Tardanza> | null | undefined): boolean =>
  t?.llego_tarde === true || t?.salio_antes === true

/**
 * EN UNA QUINCENA CERRADA LA TARDANZA NO SE ESCRIBE: lo sellado no se toca (dueño, 15/09/2026). La
 * presencia en sí se sigue guardando —es un hecho del día—; la marca vuelve a lo que ya estaba guardado
 * y el acuse lo dice. Devuelve cuántas marcas se descartaron, para que el acuse no diga «guardado»
 * sobre lo que no.
 */
export function sinTardanzasNuevas<M extends Partial<Tardanza> & { persona_id: string; estado: string }>(
  marcas: readonly M[], guardadas: readonly (Partial<Tardanza> & { persona_id: string; estado: string })[],
): { marcas: M[]; descartadas: number } {
  const previo = new Map(guardadas.map((g) => [g.persona_id, g]))
  let descartadas = 0
  const out = marcas.map((m) => {
    const antes = previo.get(m.persona_id)
    const vieja: Tardanza = antes && antes.estado === 'presente' && m.estado === 'presente'
      ? { llego_tarde: antes.llego_tarde === true, salio_antes: antes.salio_antes === true }
      : SIN_TARDANZA
    if (!mismaTardanza(vieja, m)) descartadas += 1
    return { ...m, ...vieja }
  })
  return { marcas: out, descartadas }
}

/** «llegó tarde» · «salió antes» · «llegó tarde y salió antes». Vacío sin marca. */
export function rotuloTardanza(t: Partial<Tardanza> | null | undefined): string {
  const partes = [t?.llego_tarde === true ? 'llegó tarde' : null, t?.salio_antes === true ? 'salió antes' : null]
    .filter((x): x is string => x != null)
  return partes.join(' y ')
}
