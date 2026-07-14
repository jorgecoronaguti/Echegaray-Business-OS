// Clasificador de directivas → dominio experto. El canal interactivo era un
// generalista; con esto, una directiva de un dominio (finanzas, laboral, impuestos,
// adicional exigible…) se atiende con las SKILLS de ese especialista inyectadas
// (reusa el mismo skill-map que el worker), no con criterio genérico.
//
// Barato y rápido: una vuelta de haiku que elige un slug de la lista. Si no encaja
// en un dominio, devuelve 'general' (el asistente administrativo de siempre). Si el
// clasificador falla por lo que sea, degrada a 'general' (nunca rompe el /ask).
import { resolveEngine } from '../engines/index.mjs'

// Descripción corta por capacidad — lo que el clasificador ve. Las claves DEBEN
// existir en CAPABILITY_SKILLS (skill-map.mjs).
const CAP_DESC = {
  'advise.finance': 'caja, cobranzas, pagos, flujo de fondos, tesorería, financiamiento, capital de trabajo',
  'advise.accounting': 'contabilidad, P&L, resultado económico, margen, cierre contable',
  'advise.tax': 'impuestos, IVA, ingresos brutos, ganancias, ARCA/DGR, retenciones, alícuotas',
  'advise.legal': 'contratos, adicionales exigibles, reclamos, garantías, pliegos, cláusulas',
  'advise.hr': 'personal, UOCRA, IERIC, altas/bajas, jornales, legajos, fondo de cese laboral',
  'advise.safety': 'seguridad e higiene, ART, incidentes, riesgo laboral, pliego SSMA',
  'advise.procurement': 'compras, proveedores, subcontratistas, abastecimiento, cotización de insumos',
  'advise.estimating': 'cotizar una obra, presupuestar, cómputo, valorizar un adicional, análisis de costo',
  'advise.engineering': 'planificación, cronograma, avance de obra, productividad, rendimientos, ruta crítica',
  'advise.civil': 'técnica constructiva, materiales, patologías, sistemas estructurales, viabilidad técnica',
  'advise.quality': 'control de calidad, ensayos, tolerancias, no conformidades',
  'advise.equipment': 'equipos, vehículos, flota, mantenimiento, habilitaciones, comprar vs alquilar',
  'advise.site': 'coordinación de obra, jefe de obra, frentes de trabajo, conflictos en sitio',
  'advise.data': 'auditar/leer/integrar fuentes de datos, Sheets, Drive, migraciones, conciliación',
}

export const CLASSIFIABLE = Object.keys(CAP_DESC)

/** Devuelve un slug de CAP_DESC o 'general'. Nunca lanza. */
export async function classifyDirective(directive, ctx) {
  const text = String(directive || '').trim()
  if (!text) return 'general'
  const list = Object.entries(CAP_DESC).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  const prompt =
    `Clasificá esta DIRECTIVA del dueño de una constructora en UNA de estas áreas expertas. ` +
    `Devolvé SOLO el slug exacto (ej. "advise.finance"), sin nada más. Si es una consulta ` +
    `administrativa/operativa general, un saludo, o no encaja claramente en un dominio experto, devolvé "general".\n\n` +
    `ÁREAS:\n${list}\n\nDIRECTIVA: ${text}\n\nSlug:`
  try {
    const engine = resolveEngine('anthropic-api')
    const eng = await engine.run(
      { prompt, model: 'haiku', maxToolIterations: 1, maxCostUsd: 0.02, task: { id: 'classify', capability_slug: 'read.analyze' } },
      ctx,
    )
    const raw = String(eng.result || '').toLowerCase()
    return CLASSIFIABLE.find((k) => raw.includes(k)) || 'general'
  } catch (e) {
    ctx?.logger?.warn?.('classify-directive: falló, degrada a general', { error: e?.message })
    return 'general'
  }
}
