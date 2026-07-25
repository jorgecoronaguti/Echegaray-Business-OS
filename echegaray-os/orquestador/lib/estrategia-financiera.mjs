// finanzas.estrategia_financiera — LA SALIDA ESTRATÉGICA del Financial Engineering.
//
// POR QUÉ (25/07). El dueño: "el Financial Engineering no debe comportarse como un planificador
// operativo de pagos. Debe comportarse como un ESTRATEGA FINANCIERO de nivel CFO: evaluar múltiples
// estrategias completas antes de elegir una. No quiero una lista de tareas. Quiero una ESTRATEGIA."
//
// QUÉ ES. Un documento estratégico completo que responde, con evidencia y en pesos: qué problema
// financiero existe, qué estrategia conviene, qué se debe coordinar, cuánto mejora, qué riesgos quedan,
// y por qué esa estrategia es superior a las alternativas. El plan_tesoreria sigue existiendo como la
// CONSECUENCIA operativa de la estrategia elegida — no se confunde con la estrategia.
//
// QUÉ NO ES. No recalcula un solo peso. ENSAMBLA lo que los motores ya deciden:
//   · planTesoreria (F4/F5) → por horizonte: estrategias completas que compiten, la elegida, la
//     comparación (ahorro vs 2da), el resumen estratégico, las acciones (consecuencia) y la sensibilidad;
//   · modeloLiquidez → el diagnóstico de liquidez (fuente única);
//   · calendarioDiario → los movimientos con dimensiones (obra/proveedor/cliente/categoría/medio) para
//     el impacto por dimensión.
// No React, no Sheets, no tareas operativas: sólo la salida estratégica (el tool es el contrato).

import { HORIZONTES } from './plan-tesoreria.mjs'

const OBJETIVO_ESTRATEGICO =
  'Optimizar simultáneamente: (1) liquidez, (2) costo financiero total, (3) continuidad operativa de ' +
  'las obras, (4) riesgo fiscal y bancario, y (5) la relación con proveedores y clientes — eligiendo, ' +
  'entre varias estrategias completas, la que mejor equilibra esas cinco dimensiones bajo la ' +
  'restricción que gobierna el horizonte.'

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? `$${Math.round(n).toLocaleString('es-AR')}` : 's/d')
const round = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null)
const clave7 = 'dias_7'

/** I/O: trae plan + modelo + movimientos y arma el documento. No recalcula: consume y ensambla. */
export async function estrategiaFinanciera(deps = {}, opts = {}) {
  const { planTesoreria } = await import('./plan-tesoreria.mjs')
  const plan = await planTesoreria(deps, opts)
  if (plan.estado !== 'ok') {
    return { fecha: plan.fecha, estado: 'sin dato', motivo: plan.motivo || 'el plan de tesorería no está disponible', objetivo_estrategico: OBJETIVO_ESTRATEGICO }
  }
  const hoy = opts.hoy ? new Date(opts.hoy) : new Date()
  let modelo = null
  try { const { modeloLiquidez } = await import('./ingenieria-financiera.mjs'); modelo = await modeloLiquidez(deps, hoy) } catch { modelo = null }
  // Los movimientos con dimensiones (obra/proveedor/cliente/categoría/medio) para el impacto por
  // dimensión. Misma fuente que el plan consume; degrada a [] si no responde (nunca inventa).
  let movimientos = []
  try { const { calendarioDiario } = await import('./calendario-financiero.mjs'); const c = await calendarioDiario(deps, { hoy, dias: 90 }); movimientos = (c?.dias || []).flatMap((d) => (d.movimientos || []).map((m) => ({ ...m, dia: d.fecha }))) } catch { movimientos = [] }
  return ensamblarEstrategia({ plan, modelo, movimientos, opts })
}

/**
 * NÚCLEO PURO: arma el documento estratégico a partir de lo que los motores ya decidieron.
 * @param {{plan:object, modelo:object|null, movimientos:Array, opts:object}} p
 */
export function ensamblarEstrategia({ plan, modelo = null, movimientos = [], opts = {} } = {}) {
  const gob = horizonteGobernante(plan.horizontes || {})
  const H = (plan.horizontes || {})[gob.clave] || {}
  const estr = H.estrategias || { generadas: [], elegida: null, comparacion: '' }
  const generadas = estr.generadas || []
  const elegida = generadas.find((g) => g.clave === estr.elegida) || generadas[0] || null
  const acciones = H.acciones || []

  return {
    fecha: plan.fecha,
    estado: 'ok',
    objetivo_estrategico: OBJETIVO_ESTRATEGICO,
    horizonte_gobernante: { clave: gob.clave, titulo: H.titulo || gob.clave, por_que: gob.motivo },
    diagnostico_liquidez: diagnosticoLiquidez(modelo, plan),
    problema_principal: problemaPrincipal(modelo, plan, elegida, acciones),
    estrategia_recomendada: elegida ? estrategiaRecomendada(elegida, H) : null,
    alternativas_evaluadas: generadas.map((g) => resumirAlternativa(g, g.clave === estr.elegida)),
    eleccion: {
      elegida: estr.elegida,
      por_que: estr.comparacion || 'una sola estrategia factible en este horizonte',
      ahorro_vs_segunda: ahorroVsSegunda(generadas, estr.elegida),
    },
    coordinaciones: coordinaciones(acciones),
    pagos: clasificarPagos(acciones),
    cobranzas: clasificarCobranzas(acciones, H.sensibilidad),
    financiamiento: clasificarFinanciamiento(acciones, plan.tasas_faltantes || []),
    costo_financiero_esperado: sumaCampo(acciones, 'costo_financiero'),
    impacto_caja: impactoCaja(plan.horizontes || {}),
    impacto_por: impactoPorDimension(movimientos, acciones),
    riesgos: riesgos(elegida, acciones),
    supuestos: supuestos(plan, opts),
    datos_faltantes: datosFaltantes(plan, modelo, movimientos),
    nivel_confianza: nivelConfianza(plan, modelo, movimientos),
    cambios_vs_anterior: H.resumen_estrategico?.cambios_vs_plan_anterior || 'sin plan anterior para comparar (primer plan o no provisto)',
    fuentes: plan.fuentes,
  }
}

/**
 * El horizonte cuya restricción GOBIERNA la estrategia: el MÁS CORTO con tensión real (aparecieron
 * estrategias avanzadas, o el plan financia/posterga/negocia/usa línea). Si ninguno tiene tensión, la
 * tesorería se gobierna por los 7 días. Nunca inventa: mira lo que las acciones ya deciden.
 */
export function horizonteGobernante(horizontes = {}) {
  for (const h of HORIZONTES) {
    const H = horizontes[h.clave]
    if (!H) continue
    const acc = H.acciones || []
    const tenso = acc.some((a) => /financiar|postergar|negociar|cheque|cancelar/.test(String(a.tipo)) || a.linea || a.excede_limite || a.nueva_fecha)
    const avanzadas = (H.estrategias?.generadas || []).length > 3
    if (tenso || avanzadas) return { clave: h.clave, motivo: `es el horizonte más corto con tensión real: ${tenso ? 'el plan financia/posterga/negocia o usa una línea' : 'aparecieron estrategias alternativas que compiten'}` }
  }
  return { clave: horizontes[clave7] ? clave7 : (HORIZONTES.find((h) => horizontes[h.clave])?.clave || clave7), motivo: 'sin tensión de liquidez en ningún horizonte: la tesorería se gobierna por los próximos 7 días' }
}

/** Diagnóstico de liquidez desde el modelo (fuente única). Degrada a "sin dato" si el modelo no vino. */
export function diagnosticoLiquidez(modelo, plan) {
  if (!modelo) return { estado: 'sin dato', nota: 'el modelo de liquidez no respondió; se usa sólo la posición del plan', colchon_total: plan?.posicion?.colchon_total ?? null }
  const linea = modelo.lineas?.descubierto || {}
  return {
    caja_hoy: round(modelo.disponible?.caja_hoy),
    cobranzas_por_cobrar: round(modelo.disponible?.cobranzas_por_cobrar),
    cobranzas_vencidas: round(modelo.disponible?.cobranzas_vencidas),
    comprometido_total: round(modelo.comprometido?.saldo),
    comprometido_vencido: round(modelo.comprometido?.vencido),
    proximos_30_dias: round(modelo.comprometido?.proximos_30),
    linea_disponible: round(linea.disponible),
    costo_marginal_dinero: modelo.lineas?.costo_marginal_dia ? `${fmt(modelo.lineas.costo_marginal_dia)}/día por cada millón en descubierto` : 's/d',
    colchon_total: round(modelo.colchon_total),
    lectura: modelo.colchon_total != null
      ? (modelo.colchon_total < 0 ? 'colchón NEGATIVO: la empresa no cubre lo vencido con caja + línea' : 'colchón positivo: hay margen, pero cada peso de descubierto tiene costo')
      : 'sin colchón calculable',
  }
}

/** El problema financiero principal a resolver, derivado del diagnóstico y de lo que el plan decide. */
export function problemaPrincipal(modelo, plan, elegida, acciones = []) {
  const financia = acciones.filter((a) => /financiar|cheque/.test(String(a.tipo)))
  const posterga = acciones.filter((a) => /postergar|negociar/.test(String(a.tipo)))
  const colchon = modelo?.colchon_total ?? plan?.posicion?.colchon_total ?? null
  if (colchon != null && colchon < 0) return { titulo: 'Colchón negativo', detalle: `lo vencido supera a caja + línea disponible por ${fmt(Math.abs(colchon))}: hay que generar liquidez (adelantar cobros, negociar plazos) antes que optimizar costo.`, severidad: 'alta' }
  if (financia.length) return { titulo: 'Bache de caja a cubrir', detalle: `el plan necesita financiar ${financia.length} pago(s) (${fmt(sumaCampo(financia, 'impacto_pesos'))}): el problema es cubrirlos al MENOR costo financiero sin romper obras ni relaciones.`, severidad: 'media' }
  if (posterga.length) return { titulo: 'Calce de vencimientos', detalle: `hay ${posterga.length} egreso(s) a postergar/negociar para respetar la liquidez mínima: el problema es coordinar el timing sin costo de mora ni daño comercial.`, severidad: 'media' }
  return { titulo: 'Optimización de excedente', detalle: 'no hay tensión de liquidez: el problema es no dejar caja ociosa ni pagar de más — capturar prontos pagos y cancelar líneas caras.', severidad: 'baja' }
}

/** La estrategia recomendada = la elegida por el diseñador, con sus 6 caras completas. */
export function estrategiaRecomendada(elegida, H) {
  return {
    clave: elegida.clave,
    objetivo: elegida.objetivo,
    razonamiento: elegida.razonamiento,
    palancas: elegida.palancas,
    beneficios: elegida.beneficios,
    riesgos: elegida.riesgos,
    impacto: elegida.impacto,
    que_coordina: H.resumen_estrategico?.que_coordina || null,
    que_optimiza: H.resumen_estrategico?.que_optimiza || null,
    estrategia_global: H.resumen_estrategico?.estrategia_global || null,
  }
}

/** Cada alternativa evaluada, completa (para poder comparar por qué NO se eligieron). */
export function resumirAlternativa(g, esElegida) {
  return {
    clave: g.clave, es_elegida: !!esElegida,
    objetivo: g.objetivo, razonamiento: g.razonamiento,
    beneficios: g.beneficios, riesgos: g.riesgos, impacto: g.impacto,
    por_que_descartada: esElegida ? null : (g.alternativas_descartadas?.[0]?.motivo || g.motivo_descarte || 'quedó dominada por la elegida en el criterio lexicográfico (factibilidad → costo → cumplimiento → liquidez → uso de línea)'),
  }
}

/** Ahorro de la elegida frente a la 2da mejor: diferencia de costo financiero entre ambas. */
export function ahorroVsSegunda(generadas = [], claveElegida) {
  const conCosto = generadas.filter((g) => g.impacto && typeof g.impacto.costo_financiero_total === 'number')
  if (conCosto.length < 2) return { monto: null, nota: 'no hay una segunda estrategia comparable con costo calculado' }
  const elegida = conCosto.find((g) => g.clave === claveElegida)
  const otras = conCosto.filter((g) => g.clave !== claveElegida).sort((a, b) => a.impacto.costo_financiero_total - b.impacto.costo_financiero_total)
  const segunda = otras[0]
  if (!elegida || !segunda) return { monto: null, nota: 'falta la elegida o la segunda para comparar' }
  const dif = segunda.impacto.costo_financiero_total - elegida.impacto.costo_financiero_total
  return { monto: round(dif), segunda: segunda.clave, nota: dif >= 0 ? `la elegida ahorra ${fmt(dif)} de costo financiero frente a "${segunda.clave}"` : `la elegida cuesta ${fmt(-dif)} MÁS que "${segunda.clave}", pero gana por factibilidad/cumplimiento/liquidez (criterio lexicográfico, el costo no es lo único)` }
}

/** Coordinaciones de ingresos y egresos que la estrategia propone (agrupa las acciones por naturaleza). */
export function coordinaciones(acciones = []) {
  const ingresos = acciones.filter((a) => /cobrar/.test(String(a.tipo))).map(descAccion)
  const egresos = acciones.filter((a) => !/cobrar/.test(String(a.tipo))).map(descAccion)
  return { ingresos, egresos }
}

/** Pagos a mover / dividir / postergar / priorizar (por tipo y campos de la acción). */
export function clasificarPagos(acciones = []) {
  const pagos = acciones.filter((a) => !/cobrar/.test(String(a.tipo)))
  return {
    priorizar: pagos.filter((a) => String(a.tipo) === 'pagar' && !a.parcial).map(descAccion),
    dividir: pagos.filter((a) => a.parcial || /parcial/i.test(String(a.descripcion))).map(descAccion),
    postergar: pagos.filter((a) => String(a.tipo) === 'postergar').map(descAccion),
    mover: pagos.filter((a) => String(a.tipo) === 'negociar_plazo' || a.nueva_fecha).map(descAccion),
  }
}

/** Cobranzas a adelantar (sensibilidad) o gestionar (acciones de cobro). */
export function clasificarCobranzas(acciones = [], sensibilidad = null) {
  const gestionar = acciones.filter((a) => /cobrar/.test(String(a.tipo))).map(descAccion)
  const adelantar = sensibilidad?.cobros ? [].concat(sensibilidad.cobros.recomendacion ? [sensibilidad.cobros.recomendacion] : (sensibilidad.cobros.detalle ? [sensibilidad.cobros.detalle] : [])) : []
  return { gestionar, adelantar, nota_sensibilidad: sensibilidad?.cobros?.nota || null }
}

/** Financiamiento a usar (líneas que el plan activa) o evitar (las que exceden límite o no tienen tasa). */
export function clasificarFinanciamiento(acciones = [], tasasFaltantes = []) {
  const usar = acciones.filter((a) => a.linea || /financiar|cheque|cancelar/.test(String(a.tipo))).map((a) => ({ ...descAccion(a), linea: a.linea, costo_financiero: a.costo_financiero }))
  const evitar = []
  for (const a of acciones) if (a.excede_limite) evitar.push({ ...descAccion(a), motivo: 'excede el límite de la línea' })
  for (const t of tasasFaltantes) evitar.push({ descripcion: `${t.via || t} — sin tasa cargada`, motivo: 'no se puede comparar sin la tasa real: no se usa a ciegas (se declara el gap, no se inventa)' })
  return { usar, evitar }
}

/** Impacto en caja a 7 / 30 / 90 días: el saldo proyectado y el costo financiero de cada horizonte. */
export function impactoCaja(horizontes = {}) {
  const de = (clave) => {
    const H = horizontes[clave]
    if (!H) return { estado: 'sin dato' }
    const r = H.resumen || {}
    return { saldo_proyectado: round(r.saldo_proyectado_final), costo_financiero: round(r.costo_financiero_total), pico_linea: round(r.pico_uso_linea ?? r.pico_linea) }
  }
  return { dias_7: de('dias_7'), dias_30: de('dias_30'), dias_90: de('dias_90') }
}

/** Impacto por obra / proveedor / cliente / banco / impuestos — desde los movimientos estructurados.
 *  Agrupa la ventana COMPLETA de 90 días (la foto entera); el banco sale de las líneas que activan las
 *  acciones del horizonte gobernante. */
export function impactoPorDimension(movimientos = [], acciones = []) {
  const ventana = movimientos.slice(0)
  const acum = (keyFn, filtro = () => true) => {
    const m = new Map()
    for (const mv of ventana) { if (!filtro(mv)) continue; const k = keyFn(mv); if (!k) continue; m.set(k, (m.get(k) || 0) + (Math.abs(Number(mv.monto)) || 0)) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nombre, monto]) => ({ nombre, monto: round(monto) }))
  }
  const esImpuesto = (mv) => (mv.categoria || '') === 'impuesto'
  const bancoDeAcciones = () => {
    const m = new Map()
    for (const a of acciones) { const b = a.linea || a.medio; if (!b) continue; m.set(b, (m.get(b) || 0) + (Math.abs(Number(a.impacto_pesos)) || 0)) }
    return [...m.entries()].map(([nombre, monto]) => ({ nombre, monto: round(monto) }))
  }
  return {
    obra: acum((mv) => mv.obra),
    proveedor: acum((mv) => mv.proveedor, (mv) => mv.tipo === 'egreso'),
    cliente: acum((mv) => mv.cliente, (mv) => mv.tipo === 'ingreso'),
    banco: bancoDeAcciones(),
    impuestos: acum((mv) => mv.categoria === 'impuesto' ? (mv.detalle || mv.proveedor || 'impuesto') : null, esImpuesto),
    nota: movimientos.length ? null : 'sin movimientos estructurados disponibles: el desglose por dimensión no se pudo armar (se declara, no se estima)',
  }
}

/** Riesgos agregados de la estrategia elegida + los que arrastran sus acciones. */
export function riesgos(elegida, acciones = []) {
  const out = []
  if (elegida?.riesgos) out.push(...(Array.isArray(elegida.riesgos) ? elegida.riesgos : [elegida.riesgos]))
  for (const a of acciones) if (a.excede_limite) out.push(`"${a.descripcion}" excede el límite de la línea: riesgo bancario.`)
  for (const a of acciones) if (a.riesgos && !out.includes(a.riesgos)) out.push(a.riesgos)
  return [...new Set(out.filter(Boolean))].slice(0, 12)
}

/** Supuestos declarados de la estrategia (nunca ocultos). */
export function supuestos(plan, opts = {}) {
  const s = [
    `Liquidez mínima objetivo: ${fmt(plan.liquidez_minima)} (${opts.liquidezMinima != null ? 'fijada por el pedido' : 'default 0 — si querés un piso, pasalo'}).`,
    `Límite de la línea (acuerdo): ${fmt(plan.limite_linea)}.`,
    'Costo del descubierto: CFT verificado contra el cargo real del banco (no estimado).',
    'Criterio de tesorería: percibido (caja), no devengado.',
  ]
  if (plan.sin_fecha) s.push(`Hay ${plan.sin_fecha.n || plan.sin_fecha} movimiento(s) sin fecha (${fmt(plan.sin_fecha.monto)}) que NO entran en ningún día del plan.`)
  return s
}

/** Datos faltantes que degradan la confianza (tasas, movimientos sin fecha, modelo/movimientos ausentes). */
export function datosFaltantes(plan, modelo, movimientos = []) {
  const out = []
  for (const t of plan.tasas_faltantes || []) out.push(`Tasa sin cargar: ${t.via || t} — esa alternativa de financiamiento no se pudo evaluar.`)
  if (plan.sin_fecha && (plan.sin_fecha.n || plan.sin_fecha)) out.push(`${plan.sin_fecha.n || plan.sin_fecha} movimiento(s) sin fecha: quedan fuera de la trayectoria.`)
  if (!modelo) out.push('El modelo de liquidez no respondió: el diagnóstico se apoya sólo en la posición del plan.')
  if (!movimientos.length) out.push('Sin movimientos estructurados: el impacto por obra/proveedor/cliente no se pudo desglosar.')
  return out
}

/** Nivel de confianza, derivado de los gaps reales — nunca "alta" si falta evidencia crítica. */
export function nivelConfianza(plan, modelo, movimientos = []) {
  let puntos = 0
  if (modelo) puntos++
  if (movimientos.length) puntos++
  if (!(plan.tasas_faltantes || []).length) puntos++
  if (!plan.sin_fecha || !(plan.sin_fecha.n || plan.sin_fecha)) puntos++
  const nivel = puntos >= 4 ? 'alta' : puntos >= 2 ? 'media' : 'baja'
  return { nivel, base: `${puntos}/4 señales de evidencia presentes (modelo, movimientos, tasas completas, todo fechado)`, degradada_por: datosFaltantes(plan, modelo, movimientos).slice(0, 4) }
}

// ── helpers puros chicos ──
function sumaCampo(acciones = [], campo) { return round(acciones.reduce((s, a) => s + (Number(a[campo]) || 0), 0)) }
function descAccion(a) { return { fecha: a.fecha, descripcion: a.descripcion, motivo: a.motivo, impacto_pesos: a.impacto_pesos, costo_financiero: a.costo_financiero, medio: a.medio, linea: a.linea, nueva_fecha: a.nueva_fecha, requiere_aprobacion: a.requiere_aprobacion, estrategia: a.estrategia } }
