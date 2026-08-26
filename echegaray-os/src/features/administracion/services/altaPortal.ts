import { yaHabilitado, type Alta } from './portalClientes.ts'

// LAS DECISIONES DE LA CONSOLA DEL PORTAL que no viven en `portalClientes.ts` — puras y probadas.
//
// ═══ POR QUÉ EXISTE, Y POR QUÉ NO VA EN `portalClientes.ts` ═══
//
// Dar de baja un mail NO borra la fila: apaga `activo`, porque el rastro de quién le dio acceso a
// quién tiene que sobrevivir a la baja. Esa decisión —correcta— deja una trampa aritmética: la fila
// apagada SIGUE ocupando el índice único `(mail, cliente_id, coalesce(obra_id, ZERO))`. Así que
// volver a habilitar el mismo mail después de una baja no es un alta nueva: es un INSERT que la base
// rechaza con «duplicate key», y el administrador queda mirando un error de Postgres frente a un
// pedido perfectamente legítimo. Es el camino más probable de todos —se dio de baja por error y se
// quiere revertir— y era el único que fallaba.
//
// Vive acá y no en `portalClientes.ts` porque ese archivo es del frente que construyó el portal:
// mezclarle estas decisiones obligaría a los dos frentes a escribir el mismo archivo. Compone su
// `yaHabilitado`, no lo reescribe.

export type FilaMail = { id: string; mail: string; obra_id: string | null; activo: boolean }

export type DecisionAlta =
  /** Ya está habilitado y prendido: no hay nada que escribir. */
  | { accion: 'duplicado' }
  /** Existe apagado: se vuelve a prender ESA fila, conservando quién lo dio de alta y cuándo. */
  | { accion: 'reactivar'; id: string }
  /** No existe: fila nueva. */
  | { accion: 'insertar' }

/**
 * QUÉ HACER CON ESTE ALTA, mirando lo que ya hay para ESE cliente.
 *
 * `existentes` tiene que traer las filas APAGADAS también. Filtrarlas antes de llamar acá devuelve
 * `insertar` para algo que la base va a rechazar: el índice único no distingue activo de inactivo.
 */
export function decidirAlta(existentes: readonly FilaMail[], alta: Pick<Alta, 'mail' | 'obraId'>): DecisionAlta {
  if (yaHabilitado(existentes.filter((e) => e.activo), alta)) return { accion: 'duplicado' }
  const apagada = existentes.find(
    (e) => !e.activo && e.mail === alta.mail && (e.obra_id ?? null) === (alta.obraId ?? null),
  )
  return apagada ? { accion: 'reactivar', id: apagada.id } : { accion: 'insertar' }
}

/**
 * LOS GOLPES QUE TODAVÍA SON UN PROBLEMA.
 *
 * `golpeanSinPermiso` cuenta rechazos históricos, y ahí adentro caen dos casos distintos: el mail
 * con un typo que sigue sin poder entrar, y el mail que golpeó el martes y se habilitó el miércoles.
 * El segundo ya está resuelto: dejarlo en la lista la llena de ruido y hace que se deje de mirar,
 * que es exactamente cómo el primero pasa desapercibido.
 *
 * `habilitados` son los mails HOY prendidos, normalizados igual que los de `portal_acceso`.
 */
export function golpesSinResolver<T extends { mail: string }>(
  golpes: readonly T[],
  habilitados: Iterable<string>,
): T[] {
  const prendidos = new Set(habilitados)
  return golpes.filter((g) => !prendidos.has(g.mail))
}
