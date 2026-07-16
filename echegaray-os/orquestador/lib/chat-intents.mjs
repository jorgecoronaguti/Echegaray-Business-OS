// Detección de INTENCIÓN del chat para no dejar que una respuesta determinística de LECTURA
// (listar mails, ver agenda) secuestre un pedido de ACCIÓN (enviar un mail, agendar). Bug
// repetido y caro: el voseo/subjuntivo argentino rompe cualquier terminación fija de verbo
// ("comprá" no matchea "compra", "mandes" no matchea "mand[aá]"). REGLA: raíces, no
// conjugaciones. Vive como lib puro para poder testearlo (importar interactive-server arranca
// el server).

const MAIL_WORD = /\b(mails?|correos?|e-?mails?)\b/i
// Raíces de verbo/campo de composición de mail. Raíz = todas las formas (mandá/mandes/mandar…).
const MAIL_VERB_OR_FIELD = /\b(envi|mand|reenvi|respond|contest|redact|escrib|adjunt|asunto|destinatari|cuerpo|borrador)/i

/**
 * ¿El pedido es COMPONER/ENVIAR/REENVIAR un mail (no leerlos)? directive = turno actual;
 * histText = texto de la charla reciente (para follow-ups tipo "el cuerpo dice…", "con adjunto").
 */
export function isMailComposeIntent(directive, histText = '') {
  const d = String(directive || '')
  if (MAIL_WORD.test(d) && MAIL_VERB_OR_FIELD.test(d)) return true
  // Follow-up dentro de un hilo de mail: la charla previa ya venía armando un envío y este
  // turno agrega un detalle (cuerpo/adjunto/asunto/destinatario o un email).
  const h = String(histText || '')
  if (h && /\b(mails?|correos?)\b/i.test(h) && /\b(adjunt|asunto|cuerpo|destinatari|que\s+diga|@)/i.test(d)) return true
  return false
}

/** ¿El pedido es CREAR/EDITAR un evento o TAREA (no ver la agenda)? "agendá una reunión…"
 *  tiene "agenda" y sería secuestrado por la lectura de calendario. */
export function isCalendarWriteIntent(directive) {
  const d = String(directive || '')
  return /\b(reuni[oó]n|evento|cita|turno|tarea|pendiente|recordatori)\b/i.test(d)
    && /\b(cre|agend|program|anot|pon[eég]|reserv|nuev|complet|marc)/i.test(d)
}

/** ¿Es un pedido de LEER la bandeja (mostrar mails), y NO de componer? Guarda la detección
 *  determinística de lectura. */
export function isMailReadIntent(directive, histText = '') {
  const d = String(directive || '')
  if (!/\b(mis\s+)?(mails?|correos?|emails?)\b/i.test(d)) return false
  if (isMailComposeIntent(d, histText)) return false
  if (/\b(envi|mand|reenvi|respond|redact|escrib|adjunt)/i.test(d)) return false
  return true
}
