// Clasificador de directivas → dominio experto. INSTANTÁNEO (por palabras clave, sin
// llamar al modelo): antes hacía una vuelta de haiku que sumaba ~1-2s de latencia a
// CADA respuesta. Para el canal interactivo prioriza velocidad; si no encaja claro,
// 'general' (asistente sin skill específica). El ruteo fino profundo lo hace el worker.
import { CAPABILITY_SKILLS } from './skill-map.mjs'

// Palabras/raíces clave por capacidad (en minúsculas, sin tildes para robustez).
// Se elige la capacidad con más coincidencias; empate/cero → 'general'.
const CAP_KEYWORDS = {
  'advise.finance': ['caja', 'saldo', 'cobranz', 'cobrar', 'pagar', 'pago', 'tesorer', 'flujo', 'fondos', 'liquidez', 'capital de trabajo', 'banco', 'cheque', 'transferenc'],
  'advise.accounting': ['contab', 'p&l', 'resultado', 'margen', 'balance', 'devengad', 'asiento', 'ganancia neta'],
  'advise.tax': ['impuesto', 'iva', 'ingresos brutos', 'ganancias', 'arca', 'afip', 'dgr', 'retenc', 'alicuota', 'fiscal', 'monotributo'],
  'advise.legal': ['contrato', 'adicional', 'reclamo', 'garantia', 'pliego', 'clausula', 'exigib', 'legal', 'demanda', 'penal'],
  'advise.hr': ['uocra', 'ieric', 'personal', 'empleado', 'jornal', 'legajo', 'alta', 'baja', 'despido', 'sueldo', 'fondo de cese', 'convenio', 'obrero'],
  'advise.safety': ['seguridad', 'higiene', 'art', 'accidente', 'incidente', 'riesgo laboral', 'ssma', 'epp'],
  'advise.procurement': ['comprar', 'compra', 'proveedor', 'subcontrat', 'abastec', 'cotiza insumo', 'orden de compra', 'presupuesto de compra'],
  'advise.estimating': ['cotizar', 'presupuest', 'computo', 'cómputo', 'valoriz', 'costo', 'precio unitario', 'analisis de precio'],
  'advise.engineering': ['plan', 'cronograma', 'avance', 'productividad', 'rendimiento', 'ruta critica', 'gantt', 'certificac'],
  'advise.civil': ['hormigon', 'estructura', 'material', 'patologia', 'fisura', 'losa', 'columna', 'suelo', 'tecnica constructiv'],
  'advise.quality': ['calidad', 'ensayo', 'tolerancia', 'no conformidad', 'control de calidad'],
  'advise.equipment': ['equipo', 'vehiculo', 'flota', 'camion', 'maquina', 'mantenimiento', 'rto', 'vtv', 'combustible', 'alquiler de equipo'],
  'advise.site': ['obra', 'jefe de obra', 'cuadrilla', 'frente', 'sitio', 'capataz'],
  'advise.data': ['auditar', 'integr', 'migrar', 'conciliar', 'fuente de datos', 'base de datos', 'sheet', 'planilla'],
}

/** Devuelve un slug de CAPABILITY_SKILLS o 'general'. Síncrono, instantáneo. */
export function classifyDirective(directive) {
  const t = String(directive || '').toLowerCase()
  if (!t.trim()) return 'general'
  let best = 'general'
  let bestScore = 0
  for (const [cap, kws] of Object.entries(CAP_KEYWORDS)) {
    if (!CAPABILITY_SKILLS[cap]) continue
    let score = 0
    for (const kw of kws) if (t.includes(kw)) score++
    if (score > bestScore) { bestScore = score; best = cap }
  }
  return bestScore > 0 ? best : 'general'
}
