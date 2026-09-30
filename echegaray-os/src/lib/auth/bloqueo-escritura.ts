// EL 403 DE LA LENTE TIENE QUE DECIR QUE ES DE LA LENTE.
//
// Con «Ver como» puesta, el middleware corta toda escritura con un 403 de texto plano. Una server action
// de Next que recibe eso no devuelve `{ok:false}`: lanza («An unexpected response was received from the
// server») y, en las pantallas que hacen `await accion(form)` sin try/catch, el botón queda en
// «Creando…» o no hace nada. Desde afuera es idéntico a «la obra está rota». La respuesta lleva una
// cabecera propia para que el cliente sepa que fue la lente y no un permiso ni un error de la base.

export const CABECERA_BLOQUEO = 'x-os-bloqueo'
export const BLOQUEO_POR_LENTE = 'lente'

export const MENSAJE_LENTE =
  'Estás viendo la aplicación con «Ver como»: con la lente puesta no se puede cargar nada. Salí de la lente (franja de arriba) y repetí la acción.'

type ConCabeceras = { status: number; headers: { get(nombre: string): string | null } }

/** ¿Esta respuesta es el corte de escrituras de la lente? Exige las dos señales: 403 y la cabecera. */
export function esBloqueoPorLente(r: ConCabeceras): boolean {
  return r.status === 403 && r.headers.get(CABECERA_BLOQUEO) === BLOQUEO_POR_LENTE
}
