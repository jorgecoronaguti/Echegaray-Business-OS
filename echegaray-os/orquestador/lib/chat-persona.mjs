// Persona experta por dominio para el chat. Cuando un pedido clasifica a un dominio, el chat
// RAZONA como ese especialista real de Echegaray (no como "asistente genérico") — así APLICA la
// skill cargada en vez de recitarla. Es lo que hace que se sienta el cerebro experto.
export const PERSONA_EXPERTA = {
  'advise.finance': 'el CFO / responsable de tesorería de Echegaray Construcciones',
  'advise.accounting': 'el contador de gestión de Echegaray Construcciones',
  'advise.legal': 'el abogado de la construcción de Echegaray Construcciones',
  'advise.hr': 'el responsable de RRHH y laboral (convenio UOCRA) de Echegaray Construcciones',
  'advise.procurement': 'el jefe de compras y subcontratación de Echegaray Construcciones',
  'advise.engineering': 'el jefe de planificación y producción de obra de Echegaray Construcciones',
  'advise.civil': 'el ingeniero civil de Echegaray Construcciones',
  'advise.architecture': 'el proyectista de Echegaray Construcciones',
  'advise.commercial': 'el asesor comercial y de riesgos de Echegaray Construcciones',
  'advise.estimating': 'el especialista en costos y presupuestación de Echegaray Construcciones',
  'advise.quality': 'el responsable de calidad de obra de Echegaray Construcciones',
  'advise.site': 'el director de obra de Echegaray Construcciones',
  'advise.equipment': 'el responsable de equipos y flota de Echegaray Construcciones',
  'advise.tax': 'el asesor impositivo de Echegaray Construcciones',
  'advise.safety': 'el responsable de seguridad e higiene y ART de Echegaray Construcciones',
  'advise.admin': 'el responsable de administración y ORDEN DOCUMENTAL (archivista del data room) de Echegaray Construcciones',
}

// Marcadores de consulta de CRITERIO (no un dato suelto): merecen sonnet + razonamiento experto.
// SIN \b final: en JS el boundary es ASCII y "convien"+"e" / "cotiz"+"o" no tienen boundary
// (rompía el match). El \b inicial alcanza; los prefijos son distintivos (recomend→recomendás).
export const ASESORIA_RE = /\b(convien|deber[íi]a|recomend|analiz|eval[uú]|opin|vale la pena|mejor opci[oó]n|compar|por qu[eé]|riesgo|qu[eé] hago|c[oó]mo (cotiz|calcul|manej|encar|financ)|tiene sentido|qu[eé] pas[aá] si)/i

/** Dada la capacidad principal y la directiva, devuelve la persona experta (o null) y si es una
 *  consulta de criterio profunda (→ sonnet). La persona sola es gratis; la profundidad sube modelo. */
export function personaParaConsulta(capability, directive) {
  const persona = PERSONA_EXPERTA[capability] || null
  const asesoria = !!persona && ASESORIA_RE.test(String(directive || ''))
  return { persona, asesoria }
}
