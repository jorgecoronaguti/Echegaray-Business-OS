// EL UNIVERSO DE CONOCIMIENTO DEL FINANCIAL ENGINEERING.
//
// POR QUÉ (24/07). El dueño: "el Financial Engineering debe usar automáticamente TODO el conocimiento
// disponible del Business OS para optimizar y coordinar los flujos de caja. Su universo ya no se limita
// al Flujo de Caja ni a Supabase: debe considerar automáticamente todas las fuentes que puedan afectar
// una decisión financiera." Sin nuevas integraciones, sin cambiar contratos, sin duplicar fuentes.
//
// Este módulo NO trae datos ni recalcula nada: es un CATÁLOGO de PUNTEROS a las fuentes que YA existen,
// para que el razonamiento financiero (el modelo de liquidez, el plan, el CFO IA) sepa qué mirar y de
// dónde. Cada entrada dice qué aporta a una decisión financiera, cuál es su fuente única, y su
// NATURALEZA: 'verdad' (estructurada, conciliable — Supabase/Sheets/banco/ARCA) o 'conocimiento'
// (Drive: no es fuente de verdad; se consulta con el conector existente cuando una decisión lo
// necesita, y si hay que persistir algo, se ingiere por el camino normal del OS).
//
// La regla de oro que codifica: Drive es CONOCIMIENTO, nunca VERDAD. Y ninguna fuente se duplica: acá
// sólo se apunta a la que ya es dueña del dato.

/**
 * El catálogo. `fuente` es el módulo/tabla/conector que YA existe (no se crea nada). `estructurada`
 * = el dato ya vive consultable en Supabase/Sheets (se consume directo); si es false, el dato vive en
 * Drive/documento y se trae con el conector `lectura-drive-documentos-multiformato` bajo demanda.
 */
export const CATALOGO = [
  { clave: 'caja', nombre: 'Caja y disponibilidades', naturaleza: 'verdad', estructurada: true,
    fuente: 'cash-briefing.mjs (Flujo de Caja)', aporte: 'saldo de hoy, cobranzas del mes, vencimientos 7 días — el punto de partida de toda decisión' },
  { clave: 'banco', nombre: 'Movimientos bancarios', naturaleza: 'verdad', estructurada: true,
    fuente: 'banco_movimientos + _BANCO_RAW', aporte: 'el saldo real conciliado y la posición vs. el descubierto' },
  { clave: 'obligaciones', nombre: 'Obligaciones (fiscal/previsional/financiación)', naturaleza: 'verdad', estructurada: true,
    fuente: 'obligacion_resumen (vista única)', aporte: 'qué se debe, cuánto está vencido y qué entra en 30 días' },
  { clave: 'descubierto', nombre: 'Descubierto y su costo', naturaleza: 'verdad', estructurada: true,
    fuente: 'costo-descubierto.mjs', aporte: 'la vara del costo del dinero, verificada contra el cargo real' },
  { clave: 'creditos', nombre: 'Créditos y condiciones de financiamiento', naturaleza: 'verdad', estructurada: true,
    fuente: 'condiciones_financieras', aporte: 'tasas y cupos reales (descubierto, préstamo, tarjeta) para elegir la financiación más barata' },
  { clave: 'cheques', nombre: 'Cheques emitidos y en cartera', naturaleza: 'verdad', estructurada: true,
    fuente: 'cheques-cobertura.mjs / cheques-recibidos.mjs', aporte: 'qué sale y qué entra en valores, y cuándo se vuelve caja' },
  { clave: 'compras', nombre: 'Compras y deuda a proveedores', naturaleza: 'verdad', estructurada: true,
    fuente: 'compras-proveedores.mjs (Compras)', aporte: 'la deuda comercial y su plazo — a quién y cuándo hay que pagar' },
  { clave: 'arca', nombre: 'ARCA (comprobantes fiscales)', naturaleza: 'verdad', estructurada: true,
    fuente: 'comprobantes_arca + libro-iva.mjs', aporte: 'IVA a pagar, crédito/débito fiscal, y el respaldo de facturas' },
  { clave: 'facturas', nombre: 'Facturas emitidas y recibidas', naturaleza: 'verdad', estructurada: true,
    fuente: 'comprobantes_arca', aporte: 'lo facturado (por cobrar) y lo recibido (por pagar) con respaldo fiscal' },
  { clave: 'certificaciones', nombre: 'Certificaciones de obra', naturaleza: 'verdad', estructurada: true,
    fuente: 'certificados (registrar_certificacion)', aporte: 'el ingreso devengado por avance aprobado — la cobranza que viene' },
  { clave: 'obras', nombre: 'Obras (avance, costo, margen)', naturaleza: 'verdad', estructurada: true,
    fuente: 'obra_canonica / costos_obra / obra-economics.mjs', aporte: 'qué obra genera o consume caja, y el riesgo de que un pago la frene' },
  { clave: 'cronogramas', nombre: 'Cronograma / calendario financiero', naturaleza: 'verdad', estructurada: true,
    fuente: 'calendario-financiero.mjs (finanzas_calendario)', aporte: 'la trayectoria día a día de la caja — cuándo aprieta' },
  { clave: 'contratos', nombre: 'Contratos', naturaleza: 'conocimiento', estructurada: false,
    fuente: 'Drive (lectura-drive-documentos-multiformato)', aporte: 'plazos de pago pactados, anticipos, fondos de reparo, penalidades — condiciones que cambian una decisión y todavía no están estructuradas' },
  { clave: 'documentacion_tecnica', nombre: 'Documentación técnica', naturaleza: 'conocimiento', estructurada: false,
    fuente: 'Drive (lectura-drive-documentos-multiformato)', aporte: 'contexto de una obra o un adicional que puede afectar un cobro o un costo' },
]

/** La lista de fuentes que el pedido del dueño exige considerar como mínimo. */
export const MINIMO_EXIGIDO = [
  'supabase', 'sheets', 'drive', 'banco', 'arca', 'compras', 'obras',
  'certificaciones', 'contratos', 'facturas', 'creditos', 'descubierto', 'cronogramas',
]

/**
 * NÚCLEO PURO: la cobertura del universo de conocimiento. No trae datos: reporta, del catálogo, cuántas
 * fuentes son verdad estructurada (se consumen directo) y cuántas son conocimiento en Drive (se traen
 * con el conector cuando una decisión lo necesita). Es la medida de "estoy considerando todo".
 */
export function coberturaDeFuentes() {
  const estructuradas = CATALOGO.filter((f) => f.estructurada)
  const enDrive = CATALOGO.filter((f) => !f.estructurada)
  return {
    total: CATALOGO.length,
    verdad_estructurada: estructuradas.length,
    conocimiento_en_drive: enDrive.length,
    // La regla no negociable: ninguna fuente de Drive puede declararse 'verdad'.
    drive_es_conocimiento: CATALOGO.every((f) => f.fuente.startsWith('Drive') ? f.naturaleza === 'conocimiento' : true),
    fuentes: CATALOGO,
  }
}

/**
 * NÚCLEO PURO: para una decisión concreta, qué fuentes del catálogo hay que considerar. No decide la
 * decisión —eso es del motor— sólo asegura que el razonamiento no se olvide de una fuente relevante.
 *
 * @param {string} decision 'pagar' | 'cobrar' | 'financiar' | 'plan' | 'liquidez'
 */
export function fuentesParaDecision(decision = 'plan') {
  const map = {
    liquidez: ['caja', 'banco', 'obligaciones', 'descubierto', 'creditos', 'cheques'],
    pagar: ['caja', 'banco', 'obligaciones', 'compras', 'arca', 'descubierto', 'creditos', 'contratos'],
    cobrar: ['caja', 'certificaciones', 'facturas', 'obras', 'contratos', 'cronogramas'],
    financiar: ['descubierto', 'creditos', 'banco', 'cheques', 'obligaciones'],
    plan: MINIMO_EXIGIDO,
  }
  const claves = map[decision] || map.plan
  return CATALOGO.filter((f) => claves.includes(f.clave))
}
