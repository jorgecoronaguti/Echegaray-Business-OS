// LA FECHA DE VENCIMIENTO — validarla, y decidir si de verdad se guardó.
//
// Vive fuera de `actions.ts` porque un módulo `'use server'` sólo puede exportar funciones async:
// todo lo que se pueda probar sin base tiene que estar de este lado. Y esto es exactamente lo que
// hay que poder probar sin base — las dos formas de mentir de esta escritura:
//
//  1. **Una fecha que el calendario no tiene.** `2026-02-31` pasa cualquier regex de
//     `\d{4}-\d{2}-\d{2}` y Postgres la rechaza con un mensaje que nadie entiende. Peor:
//     `new Date('2026-02-31')` en JavaScript no falla, la corre al 3 de marzo. Un vencimiento
//     corrido en silencio es una libreta que se cree vigente unos días de más.
//  2. **La escritura que no escribió.** La RLS de `documentacion_legajo` exige `es_administracion()`
//     en el UPDATE. Cuando no se cumple, PostgREST no devuelve error: devuelve 204 con cero filas
//     afectadas, igual que cuando escribió bien. Sin releer la fila y compararla, la pantalla diría
//     «guardado» sobre una base que no cambió.

/** El resultado de leer lo que llegó del formulario. `null` es «sin vencimiento», no un error. */
export type Vencimiento =
  | { ok: true; fecha: string | null }
  | { ok: false; error: string }

/**
 * VACÍO ES BORRAR EL VENCIMIENTO, no un error: un papel al que se le cargó una fecha por
 * equivocación se corrige sacándosela, y queda «sin control de vigencia» — que es distinto de
 * «vence hoy» y distinto de «vigente».
 */
export function leerVencimiento(valor: string): Vencimiento {
  const v = valor.trim()
  if (v === '') return { ok: true, fecha: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { ok: false, error: 'La fecha tiene que ser un día del calendario (AAAA-MM-DD)' }
  }
  // La ida y vuelta por UTC es lo que descarta el 31 de febrero: si el día no existe, JavaScript lo
  // corre al mes siguiente y la cadena que vuelve ya no es la que entró.
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    return { ok: false, error: `El ${v.slice(8, 10)}/${v.slice(5, 7)} no existe en ese año` }
  }
  return { ok: true, fecha: v }
}

/** Lo que devuelve el veredicto: el mismo contrato que espera `InlineEdit`. */
export type Veredicto = { ok: true } | { ok: false; error: string }

/**
 * ¿QUEDÓ ESCRITO LO QUE SE PIDIÓ?
 *
 * `leida` es `undefined` cuando la relectura no encontró la fila: o no existe, o la policy de
 * SELECT la filtró. Las dos cosas significan lo mismo para quien está mirando —no puedo probarte
 * que se guardó— y ninguna se contesta con `ok`.
 */
export function veredictoDeRelectura(esperado: string | null, leida: string | null | undefined): Veredicto {
  if (leida === undefined) {
    return {
      ok: false,
      error: 'Esa fila del legajo no aparece al releerla. O no existe, o tu usuario no tiene permiso de administración sobre el legajo.',
    }
  }
  // La base devuelve una `date`, que PostgREST serializa como AAAA-MM-DD; el recorte la deja
  // comparable aunque un día llegue con hora pegada.
  const guardado = leida?.slice(0, 10) ?? null
  if (guardado !== esperado) {
    return {
      ok: false,
      error: `No se guardó: la fila sigue con ${guardado ?? 'sin vencimiento'}. Esta escritura la permite sólo administración.`,
    }
  }
  return { ok: true }
}
