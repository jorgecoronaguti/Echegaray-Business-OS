// LA PESTAÑA VIEJA — qué hacer cuando se publicó una versión nueva mientras la página estaba abierta.
//
// Medido en producción el 16/09/2026: el dueño marcó asistencia en Plantel desde el teléfono con la
// página abierta desde antes de un deploy. Cada botón llama a una Server Action por su id; el deploy
// nuevo ya no tiene ese id, el servidor contesta «Server Action was not found» y NO SE GRABA NADA
// (reproducido con Playwright: 404 `UnrecognizedActionError`, la pantalla cae). Ese día hubo seis
// deploys. Vercel resuelve esto con Skew Protection, pero el plan es hobby y la API la rechaza
// (`invalid_billing_plan`, verificado): se resuelve en la app.
//
// DOS REDES:
//   · ANTES del toque: la pestaña pregunta qué versión está publicada (al volver a verse y cada
//     minuto) y, si cambió, se recarga en cuanto nadie está escribiendo.
//   · DESPUÉS, si igual pasó: el error de acción desconocida recarga la página en vez de dejarla caída,
//     y avisa que hay que repetir el toque. Con un freno para no entrar en un bucle de recargas.

/** La versión con la que se compiló ESTA pestaña. `local` fuera de Vercel. */
export const VERSION_DE_LA_PESTANA = process.env.NEXT_PUBLIC_VERSION_DESPLEGADA || 'local'

export function hayVersionNueva(deLaPestana: string, publicada: string | null | undefined): boolean {
  if (!publicada || deLaPestana === 'local' || publicada === 'local') return false
  return publicada !== deLaPestana
}

/** ¿El error es una Server Action que el servidor ya no conoce (pestaña de otra versión)? */
export function esAccionDeOtraVersion(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: unknown; message?: unknown }
  if (e.name === 'UnrecognizedActionError') return true
  return typeof e.message === 'string' && /Server Action .* was not found on the server|failed-to-find-server-action/i.test(e.message)
}

/** Freno de bucle: no recargar de nuevo si ya se recargó por lo mismo hace menos de este tiempo. */
export const RECARGA_MINIMA_MS = 60_000

export function puedeRecargar(ultimaRecarga: number | null, ahora: number): boolean {
  return ultimaRecarga == null || ahora - ultimaRecarga >= RECARGA_MINIMA_MS
}

export const CLAVE_ULTIMA_RECARGA = 'os:recarga-por-version'
export const CLAVE_AVISO_RECARGA = 'os:aviso-recarga-por-version'
