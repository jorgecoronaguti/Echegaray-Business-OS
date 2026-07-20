// Mapa CAPACIDAD -> conjunto de skills de dominio que el especialista debe usar en
// una tarea de ese dominio. Es la selección "según la tarea": el Director rutea la
// tarea a una capability (advise.finance, advise.legal, ...) y ésta define el
// conjunto de conocimiento experto que se inyecta. Cubre los 14 dominios reales de
// negocio (ningún dominio queda huérfano). El nombre es el directorio en
// .claude/skills/. Vive en código (versionado, auditable), no en un context_ref
// frágil de la DB.
//
// Criterio: skill primaria del rol + las secundarias que un profesional de ese rol
// cruza de verdad (ej. el CFO cruza finanzas con impuestos; RRHH cruza laboral con
// seguridad e higiene y administración operativa).
export const CAPABILITY_SKILLS = {
  'advise.finance':      ['finanzas-tesoreria-construccion', 'impuestos-construccion'],
  'advise.accounting':   ['contabilidad-constructoras', 'impuestos-construccion'],
  'advise.legal':        ['derecho-construccion-contratos', 'derecho-laboral-construccion'],
  'advise.hr':           ['derecho-laboral-construccion', 'seguridad-higiene-art', 'administracion-operativa-construccion', 'orden-documental-dataroom'],
  'advise.procurement':  ['compras-abastecimiento-subcontratacion', 'costos-presupuestacion'],
  'advise.engineering':  ['planificacion-produccion', 'costos-presupuestacion', 'direccion-obra'],
  'advise.civil':        ['ingenieria-civil-construccion', 'calidad-obra'],
  'advise.architecture': ['ingenieria-civil-construccion', 'calidad-obra', 'direccion-obra'],
  'advise.commercial':   ['gestion-empresarial-riesgos', 'costos-presupuestacion'],
  // Organización completa (8 especialistas nuevos). El Presupuestador cruza costo
  // con criterio técnico; el Jefe de Obra cruza coordinación con seguridad; Fiscal
  // es monodominio de alto riesgo de vigencia; Continuidad de Datos es el motor de
  // confiabilidad de fuentes. Equipos usa su skill dedicada + costos (para el costo
  // por equipo) — gap_skill cerrado: existe equipos-flota-construccion.
  'advise.estimating':   ['costos-presupuestacion', 'ingenieria-civil-construccion', 'planificacion-produccion', 'compras-abastecimiento-subcontratacion'],
  'advise.quality':      ['calidad-obra'],
  'advise.site':         ['direccion-obra', 'seguridad-higiene-art', 'planificacion-produccion'],
  'advise.equipment':    ['equipos-flota-construccion', 'costos-presupuestacion'],
  'advise.tax':          ['impuestos-construccion'],
  'advise.admin':        ['administracion-operativa-construccion', 'orden-documental-dataroom'],
  'advise.safety':       ['seguridad-higiene-art'],
  // ORDEN = PRIORIDAD: el chat corta en 4 skills, y cuando esta capacidad se combina con otra
  // (ej. "mejorame la pestaña de cobranzas del sheet" = finance + data) las últimas se pierden.
  // google-sheets-business-systems va PRIMERA porque es la operativa real de estas preguntas;
  // antes quedaba cortada y el chat opinaba de un Sheet sin el criterio de Sheets (auditoría 2026-07-19).
  'advise.data':         ['google-sheets-business-systems', 'arquitectura-integracion-finanzas-obras', 'lectura-drive-documentos-multiformato', 'integraciones-apis-sistemas-externos'],
}

/** Skills de dominio para una capability. [] si no hay mapeo (el caller decide fallback). */
export function skillsForCapability(capabilitySlug) {
  return CAPABILITY_SKILLS[capabilitySlug] || []
}

// El CLAUDE.md raíz lo marca como OBLIGATORIO, no opcional: para leer, auditar, corregir o rediseñar
// un Google Sheet real de negocio se activa `google-sheets-business-systems` MÁS la skill de dominio
// dueña del dato. Auditoría 2026-07-19: no pasaba — 7 de 8 áreas quedaban sin ella porque la
// capacidad de dominio ganaba la clasificación y `advise.data` no llegaba al tope de skills.
// Un Sheet mal tocado rompe el sistema de negocio de la empresa, así que esto es regla dura.
const SHEET_RE = /\b(sheet|sheets|planilla|planillas|pesta[ñn]a|spreadsheet|celda|celdas|f[oó]rmula|f[oó]rmulas|excel|xlsx?|hoja de c[aá]lculo|tabla din[aá]mica)\b/i
export const SKILL_SHEETS = 'google-sheets-business-systems'

/** ¿La directiva habla de un Sheet/planilla (y por lo tanto exige el criterio de Sheets)? PURA. */
export function mencionaSheet(directive) {
  return SHEET_RE.test(String(directive || ''))
}

/**
 * Conjunto de skills para una directiva: las de dominio según las capacidades detectadas, y —si se
 * habla de un Sheet— la de Sheets GARANTIZADA dentro del tope. Se inserta en 2ª posición: primero
 * manda el dominio dueño del dato (qué dato es correcto), después cómo se toca la planilla.
 * PURA (testeable sin DB ni API).
 */
export function skillsParaDirectiva(capabilities, directive, max = 4) {
  const base = [...new Set((capabilities || []).flatMap((c) => skillsForCapability(c)))]
  if (!mencionaSheet(directive)) return base.slice(0, max)
  // (el caller decide `max`: ver skillsSegunProfundidad)
  const sinSheets = base.filter((s) => s !== SKILL_SHEETS)
  const conSheets = sinSheets.length ? [sinSheets[0], SKILL_SHEETS, ...sinSheets.slice(1)] : [SKILL_SHEETS]
  return conSheets.slice(0, max)
}

/**
 * Cuántas skills cargar según lo que la pregunta REALMENTE necesita. Medido 2026-07-19:
 * "cuánta caja tengo hoy" cargaba 8.405 tokens de criterio experto (finanzas + impuestos) para una
 * pregunta que responde una tool determinística con el número exacto — no hace falta la ley
 * impositiva para decir el saldo. A $0,58 promedio por consulta en los días de uso real, esa
 * diferencia es plata.
 *
 * - CONSULTA DE DATO (no es de criterio): 1 skill — la del dominio dueño del dato. Alcanza para
 *   interpretar el número; el resto lo dan las capacidades determinísticas.
 * - CONSULTA DE CRITERIO ("cómo mejoro", "está bien", "mejores prácticas"): hasta 4. Acá el
 *   conocimiento ES la respuesta y ahorrar tokens sería ahorrar calidad.
 * - Si toca un Sheet, la skill de Sheets entra igual (regla obligatoria): mínimo 2.
 */
export function skillsSegunProfundidad(capabilities, directive, { asesoria = false } = {}) {
  const tocaSheet = mencionaSheet(directive)
  const max = asesoria ? 4 : (tocaSheet ? 2 : 1)
  return skillsParaDirectiva(capabilities, directive, max)
}
