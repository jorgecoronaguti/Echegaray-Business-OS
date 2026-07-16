// Clasificador de directivas → dominio experto. INSTANTÁNEO (por palabras clave, sin
// llamar al modelo): antes hacía una vuelta de haiku que sumaba ~1-2s de latencia a
// CADA respuesta. Para el canal interactivo prioriza velocidad; si no encaja claro,
// 'general' (asistente sin skill específica). El ruteo fino profundo lo hace el worker.
import { CAPABILITY_SKILLS } from './skill-map.mjs'

// Palabras/raíces clave por capacidad (en minúsculas, sin tildes para robustez).
// Se elige la capacidad con más coincidencias; empate/cero → 'general'.
const CAP_KEYWORDS = {
  'advise.finance': ['caja', 'saldo', 'cobranz', 'cobrar', 'pagar', 'pago', 'tesorer', 'flujo', 'fondos', 'liquidez', 'capital de trabajo', 'banco', 'cheque', 'transferenc', 'gasto', 'gastar', 'deuda', 'vencimiento', 'anticipo', 'efectivo', 'financ'],
  'advise.accounting': ['contab', 'p&l', 'resultado', 'margen', 'balance', 'devengad', 'asiento', 'ganancia neta', 'rentabilidad', 'utilidad', 'ebitda'],
  'advise.tax': ['impuesto', 'iva', 'ingresos brutos', 'ganancias', 'arca', 'afip', 'dgr', 'retenc', 'alicuota', 'fiscal', 'monotributo', 'factur', 'percepcion', 'f931'],
  'advise.legal': ['contrato', 'adicional', 'reclamo', 'garantia', 'pliego', 'clausula', 'exigib', 'legal', 'demanda', 'penal', 'penalidad', 'multa', 'rescision', 'incumplimiento', 'certificado de obra'],
  'advise.hr': ['uocra', 'ieric', 'personal', 'empleado', 'jornal', 'legajo', 'alta', 'baja', 'despido', 'sueldo', 'fondo de cese', 'convenio', 'obrero', 'nomina', 'aguinaldo', 'vacaciones', 'presentismo', 'indemniz', 'ausent'],
  'advise.safety': ['seguridad', 'higiene', 'art', 'accidente', 'incidente', 'riesgo laboral', 'ssma', 'epp', 'casco', 'arnes', 'capacitacion', 'siniestr'],
  'advise.procurement': ['compr', 'proveedor', 'subcontrat', 'abastec', 'cotiza insumo', 'orden de compra', 'presupuesto de compra', 'remito', 'insumo', 'stock', 'pedido de material'],
  'advise.estimating': ['cotiz', 'presupuest', 'computo', 'cómputo', 'valoriz', 'costo', 'precio unitario', 'analisis de precio', 'apu', 'oferta', 'metro cuadrado'],
  'advise.engineering': ['plan', 'cronograma', 'avance', 'productividad', 'rendimiento', 'ruta critica', 'gantt', 'certificac', 'hito', 'programa de obra', 'plazo de obra'],
  'advise.civil': ['hormigon', 'estructura', 'material', 'patologia', 'fisura', 'losa', 'columna', 'suelo', 'tecnica constructiv', 'zapata', 'viga', 'encofrado', 'armadura', 'cimiento', 'mamposteria', 'revoque'],
  'advise.quality': ['calidad', 'ensayo', 'tolerancia', 'no conformidad', 'control de calidad', 'probeta', 'inspeccion'],
  'advise.equipment': ['equipo', 'vehiculo', 'flota', 'camion', 'maquina', 'mantenimiento', 'rto', 'vtv', 'combustible', 'alquiler de equipo', 'grua', 'autoelevador', 'retroexcavadora', 'hormigonera'],
  'advise.site': ['obra', 'jefe de obra', 'cuadrilla', 'frente', 'sitio', 'capataz', 'parte diario', 'jornada'],
  'advise.data': ['auditar', 'integr', 'migrar', 'conciliar', 'fuente de datos', 'base de datos', 'sheet', 'planilla'],
  // Decisión de negocio / comercial (Go-No-Go, selección de obra, pipeline, riesgo del negocio).
  // Antes NO existía en el clasificador → la skill gestion-empresarial-riesgos era inalcanzable
  // desde el chat pese a estar mapeada a advise.commercial. Cableada.
  'advise.commercial': ['go/no-go', 'go no go', 'conviene', 'aceptar la obra', 'aceptamos', 'rechazar', 'pipeline', 'licitac', 'oportunidad', 'seleccion de obra', 'elegir obra', 'riesgo del negocio', 'entrar a la obra', 'nos conviene', 'vale la pena'],
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

/** Como classifyDirective pero devuelve TODAS las capacidades que matchean (ranked por
 *  score), para pedidos que cruzan dominios (ej. cotizar = costos + ingeniería + legal +
 *  finanzas). Acotado a `max` para no inflar el prompt/costo. [] si es general. */
export function classifyDirectiveMulti(directive, max = 3) {
  const t = String(directive || '').toLowerCase()
  if (!t.trim()) return []
  const scored = []
  for (const [cap, kws] of Object.entries(CAP_KEYWORDS)) {
    if (!CAPABILITY_SKILLS[cap]) continue
    let score = 0
    for (const kw of kws) if (t.includes(kw)) score++
    if (score > 0) scored.push({ cap, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map((s) => s.cap)
}
