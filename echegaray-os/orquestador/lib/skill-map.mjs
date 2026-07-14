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
  'advise.estimating':   ['costos-presupuestacion', 'ingenieria-civil-construccion'],
  'advise.quality':      ['calidad-obra'],
  'advise.site':         ['direccion-obra', 'seguridad-higiene-art', 'planificacion-produccion'],
  'advise.equipment':    ['equipos-flota-construccion', 'costos-presupuestacion'],
  'advise.tax':          ['impuestos-construccion'],
  'advise.admin':        ['administracion-operativa-construccion', 'orden-documental-dataroom'],
  'advise.safety':       ['seguridad-higiene-art'],
  'advise.data':         ['lectura-drive-documentos-multiformato', 'integraciones-apis-sistemas-externos', 'google-sheets-business-systems', 'arquitectura-integracion-finanzas-obras'],
}

/** Skills de dominio para una capability. [] si no hay mapeo (el caller decide fallback). */
export function skillsForCapability(capabilitySlug) {
  return CAPABILITY_SKILLS[capabilitySlug] || []
}
