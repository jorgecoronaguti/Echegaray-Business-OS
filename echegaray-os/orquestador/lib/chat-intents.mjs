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

// ── F7 · Ruteo de CONSULTAS del chat interno a capacidades DETERMINÍSTICAS (0-API) ──
// El chat interno de la web NO usa un modelo de lenguaje ni llama a ninguna API: mapea la pregunta del
// dueño a una capacidad que el OS YA calculó y materializó en una tabla, por RAÍCES de palabra (mismo
// principio que arriba: el voseo/es-AR rompe terminaciones fijas). Cada capacidad = un set de métricas
// que la Web lee de una tabla (patrón la-web-lee); acá sólo se decide CUÁL, no se calcula un peso.
//
// REGLA DURA: lo que no matchea devuelve null → el backend responde "no tengo esa capacidad todavía" y
// NUNCA inventa un número. Preferimos un "no sé" honesto a un peso fabricado.

// Orden importa: la primera regla que matchea gana. Las de una métrica financiera explícita (cobranzas,
// obligaciones) van ANTES que 'obra' y que la genérica 'caja'/'scorecard', para que "lo que me deben" o
// "lo que tengo que pagar" no caigan en la capacidad equivocada. 'obra' va antes que la genérica
// "¿cómo va…?" de scorecard para que "cómo va la obra Estrella" rutee a obra, no al tablero global.
const CONSULTA_RUTEO = [
  { capacidad: 'cobranzas', re: /\bcobr|por\s+cobrar|me\s+deben|deudor|cuentas?\s+por\s+cobrar/i },
  { capacidad: 'obligaciones', re: /\boblig|\bdeuda|\bpagar\b|\bpagos?\b|acreedor|vencid/i },
  { capacidad: 'obra', re: /\bobra\b|\bobras\b|\bavance|costo\s+de\s+la\s+obra/i },
  { capacidad: 'caja', re: /\bcaja\b|liquid|disponib|colch[oó]n|\bsaldo\b|posici[oó]n\s+financ|cu[aá]nt[oa]\s+(?:plata|dinero|efectivo)|cu[aá]nt[oa].{0,15}\b(?:teng|hay)/i },
  { capacidad: 'scorecard', re: /scorecard|indicador|m[eé]tric|tablero|\bkpi|forecast|precisi[oó]n|frescur|resumen|situaci[oó]n\s+financ|salud\s+(?:del\s+[aá]rea|financ)|c[oó]mo\s+(?:va|vamos|estamos)\b|c[oó]mo\s+est[aá]\s+(?:la\s+)?(?:empresa|finanz|[aá]rea)|c[oó]mo\s+aprend/i },
]

/**
 * Rutea una CONSULTA del chat interno a una capacidad determinística ya materializada por el OS.
 * @param {string} texto pregunta del dueño (voseo/es-AR tolerado)
 * @returns {('caja'|'cobranzas'|'obligaciones'|'obra'|'scorecard')|null} capacidad, o null si no hay
 *          ninguna que cubra la pregunta (el backend responde honestamente, sin inventar).
 */
export function routeConsulta(texto) {
  const t = String(texto || '').trim()
  if (!t) return null
  for (const { capacidad, re } of CONSULTA_RUTEO) {
    if (re.test(t)) return capacidad
  }
  return null
}
