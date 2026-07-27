// APRENDIZAJE DE COBRANZAS — cuánto se atrasa CADA cliente, aprendido de su propia historia.
//
// ═══ QUÉ ES (F3, sobre las fuentes que ya existen) ═══
//
// El calendario y el plan de tesorería proyectan cada cobro por su fecha NOMINAL (la que está cargada en
// la pestaña Cobranzas). En la realidad cada cliente se atrasa distinto: uno paga el día, otro treinta
// días después. Este módulo APRENDE de la historia real de Cobranzas —fecha esperada (P) vs. fecha real
// efectiva de cobro (Q), por cliente— el atraso típico y su dispersión, y ofrece, para cada cobro
// PENDIENTE, una fecha esperada AJUSTADA y una probabilidad/confianza. Nada de esto es un hecho: es una
// capa de ESTIMACIÓN declarada.
//
// ═══ DE DÓNDE SALE LA HISTORIA — SIN RECALCULAR UN PESO (una-fuente) ═══
//
// La dueña del dato de cobranzas es la pestaña Cobranzas del Cash Flow, ya espejada en public.cobranza
// (cobranzas-replica.mjs): cliente_texto, total, fecha_vencimiento (P, esperada), fecha_cobro (Q, real),
// estado. Un cobro cuenta como HISTORIA sólo si su estado dice "Cobrado" y tiene ambas fechas: recién ahí
// el atraso Q−P es un hecho observado, no una proyección. Este módulo NO recalcula montos ni reescribe
// cobranzas — lee la historia y estima.
//
// ═══ GOBERNANZA (no negociable) ═══
//
// La fecha ajustada se marca SIEMPRE como inferida (tipo:'INFERIDO'). La evidencia depende de cuántos
// cobros históricos tenga ese cliente: 'inferido_fuerte' (≥ MIN_COBROS_FUERTE), 'inferido_parcial'
// (≥ MIN_COBROS_PARCIAL), o 'sin_historia_suficiente' → cae al atraso global y lo DICE, con baja
// confianza. Nunca se presenta la fecha esperada como certeza, nunca se pisa la fecha nominal en ninguna
// fuente: se ofrece como capa de PROYECCIÓN que el calendario/plan pueden consumir como escenario.
//
// ═══ HONESTIDAD (el principio de confianza) ═══
//
// Si hoy no hay suficiente Q real cargada, la maquinaria lo dice: un cliente sin historia devuelve baja
// confianza y ajuste 0 (usa la fecha nominal), no un número inventado. La métrica declarada: el error de
// fecha de cobro por cliente debería bajar a medida que se cargan cobros reales — se entrega la máquina,
// no una baja de error ya lograda.

// n de cobros históricos para hablar de un atraso con evidencia. Por debajo del parcial no se concluye:
// se cae al global y se declara baja confianza. Conservador: preferimos declarar el hueco a inventar.
export const MIN_COBROS_FUERTE = 5
export const MIN_COBROS_PARCIAL = 2

// Los estados que significan "cobrado de verdad". Sale de la propia pestaña (ver cobranzas-por-cliente:
// NO_COBRADO = Facturado/Pendiente/Proyectado). Sólo un cobrado con ambas fechas entra a la historia.
const RE_COBRADO = /cobrad/i

const aFecha = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'string') { const s = v.slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null }
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
// Días calendario entre dos 'YYYY-MM-DD' (b − a), en UTC para no depender del huso. Entero.
export function diasEntre(a, b) {
  const fa = aFecha(a); const fb = aFecha(b)
  if (fa == null || fb == null) return null
  const da = new Date(`${fa}T00:00:00Z`); const db = new Date(`${fb}T00:00:00Z`)
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}
// Suma N días a un 'YYYY-MM-DD' (UTC), devuelve 'YYYY-MM-DD'. El día calendario es lo único que importa.
export function sumarDias(fechaStr, n) {
  const f = aFecha(fechaStr)
  if (f == null) return null
  const d = new Date(`${f}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + Math.round(Number(n) || 0))
  return d.toISOString().slice(0, 10)
}
// Un 'YYYY-MM-DD' → Date LOCAL (misma convención de día que el calendario: aDia/claveDia usan local).
export function fechaLocal(fechaStr) {
  const f = aFecha(fechaStr)
  if (f == null) return null
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const normCliente = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const redondear = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d)
const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export function mediana(xs) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
// Desviación absoluta mediana (MAD): dispersión robusta, resistente a un cobro atípico. En días.
export function mad(xs) {
  if (!xs.length) return null
  const med = mediana(xs)
  return mediana(xs.map((x) => Math.abs(x - med)))
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — de la historia a los perfiles de atraso por cliente
// ════════════════════════════════════════════════════════════════════════════

/** ¿Este registro es un cobro efectivo cerrado (entra a la historia de atraso)? Estado cobrado y ambas fechas. */
export function esCobroCerrado(reg = {}) {
  if (!RE_COBRADO.test(String(reg.estado ?? ''))) return false
  return aFecha(reg.fecha_esperada ?? reg.fecha_vencimiento) != null && aFecha(reg.fecha_cobro) != null
}

/** El atraso en días de UN cobro cerrado (Q − P), o null si no es historia usable. Signo: + = tarde, − = adelantado. */
export function delayDeCobro(reg = {}) {
  if (!esCobroCerrado(reg)) return null
  return diasEntre(reg.fecha_esperada ?? reg.fecha_vencimiento, reg.fecha_cobro)
}

// La etiqueta de evidencia según cuántos cobros históricos hay. No es decorativa: gobierna si el perfil
// se usa o se cae al global.
function evidenciaDe(n) {
  if (n >= MIN_COBROS_FUERTE) return 'inferido_fuerte'
  if (n >= MIN_COBROS_PARCIAL) return 'inferido_parcial'
  return 'sin_historia_suficiente'
}
// Confianza numérica en [0,1]: sube con n, baja con dispersión. Interpretable, no una fórmula mágica.
function confianzaDe(n, dispersion) {
  const base = n >= MIN_COBROS_FUERTE ? 0.8 : n >= MIN_COBROS_PARCIAL ? 0.5 : 0.2
  const penal = dispersion != null && dispersion > 30 ? 0.15 : 0
  return redondear(Math.max(0.1, base - penal), 2)
}

/**
 * NÚCLEO PURO: el perfil de atraso de UN cliente a partir de sus registros (cobrados + pendientes).
 * atraso_mediano/atraso_promedio en días, dispersión (MAD), tasa de cobro (cobrados/total), y la
 * evidencia/confianza que declara cuánto vale este perfil.
 */
export function perfilCliente(cliente, regs = []) {
  const nTotal = regs.length
  const delays = regs.map(delayDeCobro).filter((x) => x != null)
  const nCobros = delays.length
  const dispersion = redondear(mad(delays), 1)
  return {
    cliente: normCliente(cliente),
    n_total: nTotal,
    n_cobros: nCobros,
    atraso_mediano: nCobros ? redondear(mediana(delays), 1) : null,
    atraso_promedio: nCobros ? redondear(promedio(delays), 1) : null,
    dispersion_dias: dispersion,
    atraso_min: nCobros ? Math.min(...delays) : null,
    atraso_max: nCobros ? Math.max(...delays) : null,
    tasa_cobro: nTotal ? redondear(nCobros / nTotal, 3) : null,
    evidencia: evidenciaDe(nCobros),
    confianza: confianzaDe(nCobros, dispersion),
  }
}

/**
 * NÚCLEO PURO: agrupa la historia por cliente y devuelve un perfil por cada uno, más un perfil GLOBAL
 * (todos los cobros juntos) que sirve de fallback para el cliente sin historia. No toca BD ni reloj.
 *
 * @param {Array} historia registros {cliente|cliente_texto, estado, fecha_esperada|fecha_vencimiento, fecha_cobro}
 */
export function perfilesDeCobro(historia = []) {
  const porCliente = new Map()
  for (const r of historia) {
    const k = normCliente(r.cliente ?? r.cliente_texto ?? r.contraparte)
    if (!k) continue
    if (!porCliente.has(k)) porCliente.set(k, [])
    porCliente.get(k).push(r)
  }
  const por_cliente = {}
  for (const [k, regs] of porCliente) por_cliente[k] = perfilCliente(k, regs)
  const global = perfilCliente('__GLOBAL__', historia.filter((r) => normCliente(r.cliente ?? r.cliente_texto ?? r.contraparte)))
  return {
    por_cliente,
    global,
    n_clientes: Object.keys(por_cliente).length,
    fuente: 'public.cobranza (espejo fiel de la pestaña Cobranzas) — sólo cobros cerrados entran al atraso',
  }
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — proyectar un cobro pendiente con la fecha ajustada (SIEMPRE inferida)
// ════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: dada una cobranza PENDIENTE, devuelve su fecha esperada AJUSTADA y una probabilidad/
 * confianza. La fecha nominal NO se toca: se devuelve aparte. Todo se marca tipo:'INFERIDO'.
 *
 * Cascada de evidencia: perfil del cliente si tiene historia suficiente → si no, atraso global declarado
 * → si no hay ni global (historia vacía), ajuste 0 sobre la fecha nominal, y se DICE. Un cliente sin
 * datos nunca recibe un número inventado.
 *
 * @param {{cliente?, cliente_texto?, fecha_esperada?, fecha_vencimiento?}} cobranza
 * @param {{por_cliente:object, global:object}} perfiles
 * @returns {object} proyección declarada
 */
export function proyectarCobro(cobranza = {}, perfiles = {}) {
  const cliente = normCliente(cobranza.cliente ?? cobranza.cliente_texto ?? cobranza.contraparte)
  const esperada = aFecha(cobranza.fecha_esperada ?? cobranza.fecha_vencimiento ?? cobranza.fecha)
  const pc = perfiles?.por_cliente?.[cliente] ?? null
  const usaCliente = !!pc && pc.evidencia !== 'sin_historia_suficiente'
  const globalUsable = !!perfiles?.global && perfiles.global.n_cobros > 0
  const perfil = usaCliente ? pc : globalUsable ? perfiles.global : null
  const base = usaCliente ? 'cliente' : globalUsable ? 'global' : 'ninguna'

  const ajuste = perfil?.atraso_mediano != null ? Math.round(perfil.atraso_mediano) : 0
  const fecha_ajustada = esperada ? sumarDias(esperada, ajuste) : null
  const evidencia = usaCliente ? pc.evidencia : globalUsable ? 'inferido_global' : 'sin_base'
  const confianza = perfil ? (usaCliente ? pc.confianza : redondear(perfil.confianza * 0.5, 2)) : 0.1

  return {
    tipo: 'INFERIDO',
    cliente: cliente || null,
    base,
    fecha_esperada: esperada,            // NOMINAL — no se pisa, se conserva
    fecha_ajustada,                      // INFERIDA
    dias_ajuste: fecha_ajustada ? ajuste : null,
    dispersion_dias: perfil?.dispersion_dias ?? null,
    probabilidad_cobro: perfil?.tasa_cobro ?? null,   // INFERIDA de la tasa histórica; NO es la col S del Sheet
    confianza,
    evidencia,
    n_cobros: perfil?.n_cobros ?? 0,
    nota: notaProyeccion({ base, evidencia, esperada, ajuste, perfil }),
  }
}

function notaProyeccion({ base, evidencia, esperada, ajuste, perfil }) {
  if (!esperada) return 'sin fecha esperada cargada: no puedo proyectar un día; se declara el hueco'
  if (base === 'ninguna') return 'no hay historia de cobros: uso la fecha nominal (ajuste 0) y lo declaro — estimación de baja confianza'
  if (base === 'global') return `cliente sin historia suficiente: uso el atraso GLOBAL (${ajuste}d) como referencia, baja confianza`
  const disp = perfil?.dispersion_dias
  const dispTxt = disp != null && disp > 30 ? ` — pero muy variable (±${disp}d): tomar con cautela` : ''
  return `atraso típico del cliente ${ajuste}d sobre ${perfil?.n_cobros ?? 0} cobros (${evidencia})${dispTxt}`
}

/**
 * NÚCLEO PURO: aplica el escenario realista a una lista de movimientos del calendario SIN mutarlos.
 * Para cada ingreso de cobranza, reemplaza `fecha` por la fecha ajustada (si se pudo proyectar) y
 * conserva la nominal en `fecha_nominal`, adjuntando la proyección declarada en `_proyeccion_cobro`.
 * Todo lo demás (egresos, ingresos sin cliente/fecha) pasa intacto. Aditivo y reversible: quien no pasa
 * perfiles, no ve ningún cambio.
 *
 * @param {Array} movimientos {tipo, categoria, cliente, fecha(Date), fecha_esperada?(Date|str), ...}
 * @param {object} perfiles salida de perfilesDeCobro
 */
export function ajustarMovimientosCobranza(movimientos = [], perfiles = {}) {
  return movimientos.map((m) => {
    if (m?.tipo !== 'ingreso') return m
    if (m.categoria && m.categoria !== 'cobranza') return m
    // La fecha esperada nominal: la explícita si vino, si no la que el movimiento ya trae como fecha.
    const esperada = m.fecha_esperada ?? m.fecha
    const proy = proyectarCobro({ cliente: m.cliente, fecha_esperada: esperada }, perfiles)
    if (!proy.fecha_ajustada) return { ...m, _proyeccion_cobro: proy }
    const nueva = fechaLocal(proy.fecha_ajustada)
    return { ...m, fecha: nueva ?? m.fecha, fecha_nominal: m.fecha, _proyeccion_cobro: proy }
  })
}

// ════════════════════════════════════════════════════════════════════════════
// BORDE CON I/O — leer la historia de public.cobranza y armar los perfiles
// ════════════════════════════════════════════════════════════════════════════

/**
 * BORDE: lee la historia de cobranzas de public.cobranza (espejo de la pestaña) y devuelve los perfiles
 * de atraso por cliente. NO escribe nada, NO recalcula montos: sólo lee y estima (Nivel D, reversible).
 * Si la tabla no existe o está vacía, degrada a perfiles vacíos y lo declara — nunca inventa historia.
 *
 * @param {object} deps {query?}
 */
export async function perfilesDeCobroDesdeDB(deps = {}) {
  const query = deps.query || (await import('./db.mjs')).query
  let rows = []
  try {
    ({ rows } = await query(
      `select cliente_texto, total::float8 total, fecha_vencimiento, fecha_cobro, estado
         from public.cobranza`,
    ))
  } catch {
    return { ...perfilesDeCobro([]), disponible: false, nota: 'no pude leer public.cobranza; se entrega la maquinaria sin historia' }
  }
  const historia = rows.map((r) => ({
    cliente_texto: r.cliente_texto,
    estado: r.estado,
    fecha_esperada: aFecha(r.fecha_vencimiento),
    fecha_cobro: aFecha(r.fecha_cobro),
    total: num(r.total),
  }))
  const p = perfilesDeCobro(historia)
  const conCobros = Object.values(p.por_cliente).filter((c) => c.n_cobros > 0).length
  return {
    ...p,
    disponible: true,
    nota: p.global.n_cobros === 0
      ? 'aún no hay cobros cerrados (estado Cobrado con fecha esperada y real): la maquinaria mide, la historia recién arranca'
      : `${p.global.n_cobros} cobros cerrados en ${conCobros} clientes con atraso medible`,
  }
}
