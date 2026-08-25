// LOS ACCESOS AL PORTAL DEL CLIENTE Y SU ACTIVIDAD — lecturas de la pantalla 31.
//
// ═══ STUB HASTA QUE ATERRICE back-28-32 ═══
//
// Firma del CONTRATO-28-32. La lista vacía es la verdad de hoy: sin `public.cliente_acceso` no hay
// ningún mail habilitado, y eso es exactamente lo que la pantalla tiene que decir. Un acceso de
// ejemplo acá sería peor que en cualquier otra pantalla del OS: la lista de mails habilitados es
// la lista de quién puede ver los montos de la empresa desde afuera.

import type { AccesoPortal, ActividadPortal } from '../types/cobranzas'

/** Los mails habilitados, incluidos los revocados (la pantalla los distingue y los cuenta aparte). */
export async function getAccesos(_clienteId: string): Promise<AccesoPortal[]> {
  return []
}

/** «Qué hicieron en el portal», del más nuevo al más viejo. */
export async function getActividadPortal(_clienteId: string): Promise<ActividadPortal[]> {
  return []
}
