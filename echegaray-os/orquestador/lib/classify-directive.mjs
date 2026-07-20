// Clasificador de directivas → dominio experto. INSTANTÁNEO (por palabras clave, sin
// llamar al modelo): antes hacía una vuelta de haiku que sumaba ~1-2s de latencia a
// CADA respuesta. Para el canal interactivo prioriza velocidad; si no encaja claro,
// 'general' (asistente sin skill específica). El ruteo fino profundo lo hace el worker.
import { CAPABILITY_SKILLS } from './skill-map.mjs'

// Palabras/raíces clave por capacidad (en minúsculas, sin tildes para robustez).
// Se elige la capacidad con más coincidencias; empate/cero → 'general'.
const CAP_KEYWORDS = {
  // FINANZAS — vocabulario REAL del dueño (auditado 2026-07-19: "cash flow", "forecast",
  // "conciliar" y "administracion" caían a 'general' → el chat respondía sin NADA de finanzas.
  // Área declarada como foco: acá el ruteo tiene que ser generoso, no tacaño.
  'advise.finance': ['caja', 'saldo', 'cobranz', 'cobrar', 'pagar', 'pago', 'tesorer', 'flujo', 'fondos', 'liquidez', 'capital de trabajo', 'working capital', 'banco', 'bancari', 'cheque', 'echeq', 'transferenc', 'gasto', 'gastar', 'deuda', 'debo', 'debemos', 'adeud', 'cobro', 'cobros', 'vencimiento', 'anticipo', 'efectivo', 'financ', 'vencid', 'atrasad', 'impago', 'cash flow', 'cashflow', 'cash-flow', 'forecast', 'proyecci', 'concilia', 'dso', 'mora', 'morosidad', 'cobrabilidad', 'plazo de pago', 'cuenta corriente', 'posicion financiera', 'disponibilidad', 'egreso', 'ingreso de dinero', 'presupuesto de caja', 'runway', 'fondo de maniobra'],
  'advise.accounting': ['contab', 'p&l', 'p y l', 'pyl', 'resultado', 'estado de resultado', 'margen', 'balance', 'devengad', 'asiento', 'ganancia neta', 'rentabilidad', 'utilidad', 'ebitda', 'costo fijo', 'costo variable', 'amortizac', 'depreciac', 'cierre contable'],
  'advise.tax': ['impuesto', 'iva', 'ingresos brutos', 'ganancias', 'arca', 'afip', 'dgr', 'retenc', 'alicuota', 'fiscal', 'monotributo', 'factur', 'percepcion', 'f931'],
  'advise.legal': ['contrato', 'adicional', 'reclamo', 'garantia', 'pliego', 'clausula', 'exigib', 'legal', 'demanda', 'penal', 'penalidad', 'multa', 'rescision', 'incumplimiento', 'certificado de obra'],
  'advise.hr': ['uocra', 'ieric', 'personal', 'empleado', 'operario', 'en blanco', 'blanqueo', 'jornal', 'legajo', 'alta', 'baja', 'despido', 'sueldo', 'fondo de cese', 'convenio', 'obrero', 'nomina', 'aguinaldo', 'vacaciones', 'presentismo', 'indemniz', 'ausent', 'examen medico', 'apto medico', 'preocupacional', 'telegrama', 'carta documento', 'intimacion', 'libreta', 'categoria', 'quincena'],
  'advise.safety': ['seguridad', 'higiene', 'art', 'accidente', 'incidente', 'riesgo laboral', 'ssma', 'epp', 'casco', 'arnes', 'capacitacion', 'siniestr', 'entrar a planta', 'ingreso a planta', 'acceso a planta', 'ssma', 'induccion', 'apto para ingresar'],
  'advise.procurement': ['compr', 'proveedor', 'subcontrat', 'abastec', 'cotiza insumo', 'orden de compra', 'presupuesto de compra', 'remito', 'insumo', 'stock', 'pedido de material', 'pedidos de material', 'pedido', 'pedidos', 'materiales'],
  'advise.estimating': ['cotiz', 'presupuest', 'computo', 'cómputo', 'valoriz', 'costo', 'precio unitario', 'analisis de precio', 'apu', 'oferta', 'metro cuadrado'],
    // 'plan' PELADO matcheaba "planta" (bug real: "entrar a planta de ARCOR" iba a planificación
  // en vez de seguridad) y también "plano"/"plantel". Se usan las formas reales del dominio.
  'advise.engineering': ['planific', 'replanific', 'reprogram', 'plan de obra', 'plan de trabajo', 'atras', 'cronograma', 'avance', 'productividad', 'rendimiento', 'ruta critica', 'gantt', 'certificac', 'hito', 'programa de obra', 'plazo de obra'],
    // 'estructura' PELADO era contaminación pura: en esta empresa significa casi siempre el centro
  // de costo 'Estructura' (imputar a obra o a Estructura) o la estructura de una pestaña. Medido
  // 2026-07-20: "qué estructura tiene que tener la pestaña de egresos" cargaba ingeniería civil y
  // le comía un lugar a Sheets. Ahora se exige que sea estructura CONSTRUCTIVA.
  'advise.civil': ['hormigon', 'estructura de hormigon', 'estructura metalica', 'estructural', 'calculo estructural', 'patologia', 'fisura', 'losa', 'columna', 'suelo', 'tecnica constructiv', 'zapata', 'viga', 'encofrado', 'armadura', 'cimiento', 'mamposteria', 'revoque'],
  'advise.quality': ['calidad', 'ensayo', 'tolerancia', 'no conformidad', 'control de calidad', 'probeta', 'inspeccion'],
  'advise.equipment': ['equipo', 'vehiculo', 'flota', 'camion', 'maquina', 'mantenimiento', 'rto', 'vtv', 'combustible', 'alquiler de equipo', 'grua', 'autoelevador', 'retroexcavadora', 'hormigonera'],
  'advise.site': ['obra', 'jefe de obra', 'cuadrilla', 'frente', 'sitio', 'capataz', 'parte diario', 'jornada'],
  'advise.data': ['auditar', 'integr', 'migrar', 'conciliar', 'fuente de datos', 'base de datos', 'sheet', 'planilla'],
  // ARCHIVISTA / orden documental del data room. advise.admin ya estaba mapeado a
  // administracion-operativa + orden-documental-dataroom en skill-map, pero SIN keywords acá
  // era inalcanzable desde el chat (la skill existía, desconectada). Keywords distintivos de
  // ORGANIZAR el archivo (no un dato de negocio): carpetas, nomenclatura, mover/renombrar/archivar.
  'advise.admin': ['carpeta', 'carpetas', 'orden documental', 'data room', 'dataroom', 'archivar', 'nomenclatura', 'renombrar', 'clasificar', 'crear carpeta', 'mover archivo', 'estructura de carpeta', 'organizar el drive', 'ordenar el drive', 'donde guardo', 'donde va este', 'archivo desordenad',
    // El PROCESO administrativo (no solo el archivo): "cómo organizo la administración",
    // "circuito administrativo", "control interno". Antes caía a 'general' (auditoría 2026-07-19).
    'administrac', 'administrativ', 'circuito', 'control interno', 'back office', 'backoffice', 'procedimiento',
    // CIERRE DE MES: la pregunta más frecuente del área ('¿puedo cerrar?', '¿qué me falta?') caía a
    // 'general' — justo la que tiene capacidad determinística detrás (control_administrativo).
    'cierre de mes', 'cerrar el mes', 'cierre mensual', 'que me falta', 'esta todo en orden', 'estudio contable', 'imputar', 'imputac', 'sin imputar', 'conciliacion bancaria'],
  // Decisión de negocio / comercial (Go-No-Go, selección de obra, pipeline, riesgo del negocio).
  // Antes NO existía en el clasificador → la skill gestion-empresarial-riesgos era inalcanzable
  // desde el chat pese a estar mapeada a advise.commercial. Cableada.
  'advise.commercial': ['go/no-go', 'go no go', 'conviene', 'aceptar la obra', 'aceptamos', 'rechazar', 'pipeline', 'licitac', 'oportunidad', 'seleccion de obra', 'elegir obra', 'riesgo del negocio', 'entrar a la obra', 'nos conviene', 'vale la pena', 'riesgo', 'riesgos', 'exposicion', 'concentracion', 'estado de la empresa', 'situacion de la empresa', 'como venimos', 'como estamos', 'panorama', 'scorecard', 'tablero', 'empresa', 'compania', 'negocio'],
}

// Match de keyword con LÍMITE DE PALABRA al inicio: "iva" NO matchea dentro de "act·iva·s"
// (bug real que mandaba "comprar retroexcavadora" a impuestos). Los prefijos siguen andando
// ("compr"→comprar, "retenc"→retención) porque solo anclamos el INICIO, no el final.
// KEYWORDS FUERTES: valen doble. Una palabra genérica ("pago", "obra", "costo") aparece en
// preguntas de medio sistema; una específica ("iva", "uocra", "rto", "epp") sólo puede ser de su
// dominio. Sin esto empataban y ganaba el orden de declaración — bug real: "cuánto pago de IVA
// este mes" caía en finanzas y respondía sin la skill impositiva. La señal inequívoca manda.
const FUERTES = new Set([
  'iva', 'ingresos brutos', 'ganancias', 'arca', 'afip', 'dgr', 'f931', 'monotributo', 'alicuota', 'retenc',
  'uocra', 'ieric', 'telegrama', 'carta documento', 'fondo de cese', 'aguinaldo', 'indemniz', 'legajo',
  'epp', 'art', 'accidente', 'ssma', 'siniestr',
  'rto', 'vtv', 'flota', 'autoelevador', 'retroexcavadora',
  'no conformidad', 'probeta', 'ensayo',
  'apu', 'precio unitario', 'analisis de precio',
  'ebitda', 'p&l', 'devengad',
  'hormigon', 'encofrado', 'mamposteria',
])

const _kwCache = new Map()
function matchKw(t, kw) {
  let re = _kwCache.get(kw)
  if (!re) { re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); _kwCache.set(kw, re) }
  return re.test(t)
}
function contarMatches(t, kws) { let s = 0; for (const kw of kws) if (matchKw(t, kw)) s += FUERTES.has(kw) ? 2 : 1; return s }

/** Devuelve un slug de CAPABILITY_SKILLS o 'general'. Síncrono, instantáneo. */
export function classifyDirective(directive) {
  const t = String(directive || '').toLowerCase()
  if (!t.trim()) return 'general'
  let best = 'general'
  let bestScore = 0
  for (const [cap, kws] of Object.entries(CAP_KEYWORDS)) {
    if (!CAPABILITY_SKILLS[cap]) continue
    const score = contarMatches(t, kws)
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
    const score = contarMatches(t, kws)
    if (score > 0) scored.push({ cap, score })
  }
  scored.sort((a, b) => b.score - a.score)
  // ANTI-CONTAMINACIÓN (auditoría 2026-07-19): antes bastaba UNA palabra incidental para arrastrar
  // un dominio ajeno — "qué estructura debería tener el flujo de fondos" cargaba ingeniería civil y
  // calidad de obra ('estructura'), que diluían a las de finanzas dentro del tope de 4 skills del
  // chat. Regla: el dominio ganador entra siempre; los secundarios solo si tienen señal REAL
  // (≥2 keywords propias, o empatan con el ganador). Determinístico y testeable.
  // Guarda obligatoria: si NINGUNA capacidad matcheó, `scored` está vacío. Sin esto,
  // `scored[0].score` tira TypeError y se cae el ruteo entero del chat ante cualquier pregunta
  // que no matchee una palabra clave — bug real introducido con el filtro y detectado al probar
  // las 8 áreas. Es la ruta más caliente del sistema: no puede lanzar nunca.
  if (!scored.length) return []
  const best = scored[0].score
  const filtrado = scored.filter((s, i) => i === 0 || s.score >= 2 || s.score >= best)
  return filtrado.slice(0, max).map((s) => s.cap)
}

// CONTINUACIONES: "segui", "dale", "ok", "y ahora?", "hacelo". No tienen NINGUNA palabra clave, así
// que caen a 'general' con CERO skills — en medio de una edición de Sheet el chat se queda sin el
// experto justo cuando más lo necesita. Bug real visto en el log (2026-07-19 23:37): venía con la
// skill de Sheets, el dueño escribió "segui" y la vuelta siguiente ruteó `general, skills: []`.
//
// OJO con \b: en JS sin flag unicode, 'á' no es carácter de palabra, así que /continuá\b/ NUNCA
// matchea al final del string. Se usa un lookahead negativo de letra en su lugar.
// Regla: si el mensaje es una continuación (corto y sin señal propia), se rutea con el CONTEXTO de
// lo que se venía hablando. No se inventa dominio: se hereda el que ya estaba.
const CONTINUACION_RE = /^\s*(segu[ií]|dale|ok|oka?y|listo|hacelo|hacela|hazlo|adelante|continu[aá]|continuar|sigue|y ahora|proceg?u[ií]|s[ií]|bueno|perfecto|mejor[aá](lo|la)?|arregl[aá](lo|la)?|aplicalo|aplicala|termin[aá](lo|la)?|dale que va)(?![a-záéíóúñ])[\s.!?]*$/i

/** ¿Es un "seguí/dale/ok" sin contenido propio? PURA. */
export function esContinuacion(directive) {
  const t = String(directive || '').trim()
  if (!t) return true
  if (t.length > 40) return false
  return CONTINUACION_RE.test(t)
}

/**
 * Texto a usar para rutear: el mensaje, o —si es una continuación— el mensaje MÁS lo último que
 * dijo el dueño, para heredar el dominio. PURA.
 * @param {Array<{role:string,text:string}>} history
 */
export function textoParaRutear(directive, history) {
  if (!esContinuacion(directive)) return String(directive || '')
  const previos = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role === 'me' && String(m.text || '').trim())
    .slice(-3)
    .map((m) => String(m.text))
  return [String(directive || ''), ...previos].join(' \n ')
}
