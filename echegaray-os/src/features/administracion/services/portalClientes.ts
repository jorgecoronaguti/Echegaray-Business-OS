import { z } from 'zod'
import { normalizarMail, pareceMail } from '@/app/portal/login/acceso'

// QUIÉN ENTRA AL PORTAL — la lógica pura de la consola de clientes.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// El portal quedó construido y desplegado el 26/08/2026 sin una sola pantalla desde donde operarlo:
// habilitar un mail exigía un INSERT a mano contra Postgres. Un módulo que sólo se opera por SQL no
// está terminado, está escrito.
//
// Acá vive lo que DECIDE, separado de lo que dibuja y de lo que escribe, para que se pruebe con
// `node --test` sin base ni navegador. El portero de verdad está en las acciones de servidor.
//
// ═══ LA REGLA QUE GOBIERNA TODO ═══
//
// El mail es la credencial. No hay contraseña: quien recibe el código en ese buzón ve la plata de
// ese cliente. Por eso todo lo de acá desconfía por defecto —normaliza, valida forma, rechaza el
// duplicado, exige alcance explícito— y por eso dar de baja NO borra: apaga. Un acceso borrado no
// deja rastro de que existió, y la pregunta «¿quién le dio acceso a este mail?» tiene que tener
// respuesta seis meses después.

export const ALCANCE_TODAS = 'todas'

/** Un mail habilitado, tal como se guarda. `obraId` null = alcanza TODAS las obras del cliente. */
export const altaSchema = z.object({
  clienteId: z.string().uuid('elegí un cliente'),
  // El mail se normaliza ANTES de validar: `Marta@X.com ` con un espacio al final es el mismo mail,
  // y si entra distinto el cliente escribe el suyo y el portal le dice que no está habilitado.
  mail: z.string().transform(normalizarMail).refine(pareceMail, 'ese mail no tiene forma de mail'),
  /** `null` = todas las obras del cliente. Un string vacío del `<select>` cuenta como null. */
  obraId: z.string().uuid().nullable().catch(null),
  nombre: z.string().trim().max(120).transform((s) => s || null).nullable(),
})

export type Alta = z.infer<typeof altaSchema>

/**
 * ¿ESTE ALTA PISA UNA QUE YA EXISTE?
 *
 * El índice único de la base es `(mail, coalesce(obra_id, ...))`, así que el mismo mail con alcance
 * total y con alcance a una obra conviven. Esta función dice lo que la base va a rechazar ANTES de
 * intentarlo, para que el mensaje sea «ya está habilitado» y no el texto de un error de Postgres.
 */
export function yaHabilitado(
  existentes: readonly { mail: string; obra_id: string | null }[],
  alta: Pick<Alta, 'mail' | 'obraId'>,
): boolean {
  return existentes.some((e) => e.mail === alta.mail && (e.obra_id ?? null) === (alta.obraId ?? null))
}

/**
 * QUÉ VE ESTE MAIL, EN CASTELLANO.
 *
 * `null` no es «ninguna»: es «todas». Ese es exactamente el tipo de NULL que leído como cero —o como
 * vacío— publica un permiso al revés, así que se nombra explícito y nunca se deja en blanco.
 */
export function alcanceDe(obraId: string | null, nombreObra?: string | null): string {
  if (obraId == null) return 'Todas sus obras'
  return nombreObra?.trim() || 'Una obra (sin nombre cargado)'
}

export type Intento = { mail: string; resultado: string; created_at: string }

/**
 * MAILS QUE GOLPEAN LA PUERTA SIN ESTAR HABILITADOS.
 *
 * No es una métrica de seguridad teórica: el caso real es el cliente al que se le cargó el mail con
 * un typo. Golpea, le dice que no está habilitado, y nadie se entera nunca porque el que sabe que
 * pasó es él. Tres rechazos del mismo mail es alguien que quiere entrar y no puede.
 *
 * Devuelve ordenado por cantidad, y el mail entero: recortarlo impediría ver el typo, que es
 * justamente lo que hay que ver.
 */
export function golpeanSinPermiso(intentos: readonly Intento[], desde = 3): { mail: string; veces: number; ultimo: string }[] {
  const cuenta = new Map<string, { veces: number; ultimo: string }>()
  for (const i of intentos) {
    if (i.resultado !== 'no_habilitado') continue
    const previo = cuenta.get(i.mail)
    // El último es el MÁS RECIENTE, no el último de la lista: el orden de la consulta no es un dato.
    cuenta.set(i.mail, {
      veces: (previo?.veces ?? 0) + 1,
      ultimo: !previo || i.created_at > previo.ultimo ? i.created_at : previo.ultimo,
    })
  }
  return [...cuenta.entries()]
    .filter(([, v]) => v.veces >= desde)
    .map(([mail, v]) => ({ mail, ...v }))
    .sort((a, b) => b.veces - a.veces || a.mail.localeCompare(b.mail))
}

/**
 * ¿ESTE CLIENTE PUEDE USAR EL PORTAL HOY? El semáforo de la consola.
 *
 * Las tres condiciones son independientes y las tres se muestran, porque arreglar una sin la otra
 * deja al cliente mirando una pantalla vacía y creyendo que el sistema está roto:
 *   · sin mail habilitado NADIE entra;
 *   · sin obras no hay qué mostrar;
 *   · con obras pero sin un solo pago cargado, el cronograma —la razón por la que el cliente entra—
 *     sale en blanco. `null` no es cero: la pantalla dice «sin plan», y eso al cliente le sirve poco.
 */
export type EstadoPortal = 'listo' | 'sin_mail' | 'sin_obras' | 'sin_cronograma'

export function estadoDelCliente(c: { mails: number; obras: number; pagos: number }): EstadoPortal {
  if (c.obras === 0) return 'sin_obras'
  if (c.mails === 0) return 'sin_mail'
  if (c.pagos === 0) return 'sin_cronograma'
  return 'listo'
}

export const TEXTO_ESTADO: Record<EstadoPortal, { rotulo: string; que_hacer: string }> = {
  listo: { rotulo: 'Puede entrar', que_hacer: '' },
  sin_mail: { rotulo: 'Sin mail habilitado', que_hacer: 'Cargale el mail: hasta que no lo tenga, no puede entrar.' },
  sin_obras: { rotulo: 'Sin obras', que_hacer: 'No tiene obras cargadas — no habría nada que mostrarle.' },
  sin_cronograma: { rotulo: 'Sin cronograma', que_hacer: 'Entra, pero el cronograma le sale vacío. Cargale los cobros.' },
}
