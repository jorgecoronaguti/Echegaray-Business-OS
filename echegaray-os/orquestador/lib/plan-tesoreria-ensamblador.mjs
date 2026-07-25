// ENSAMBLADOR DEL PLAN DE TESORERÍA — trae las fuentes reales y arma los cuatro horizontes.
//
// Se separó del núcleo puro (plan-tesoreria.mjs) sólo por tamaño de archivo: acá vive el I/O (calendario,
// modelo de liquidez, tasas de condiciones) y el armado de horizontes; el núcleo `construirPlan` y el
// diseñador de estrategias siguen siendo puros y viven en sus propios módulos. Ningún número de plata se
// recalcula acá: se ORQUESTAN las piezas que ya existen. `planTesoreria` se re-exporta desde
// plan-tesoreria.mjs para no romper a quien lo importaba de ahí.

import { HORIZONTES } from './plan-tesoreria.mjs'
import { modeloLiquidez } from './ingenieria-financiera.mjs'
import { calendarioDiario } from './calendario-financiero.mjs'
import { ACUERDO } from './banco-santander.mjs'

/**
 * Arma el plan de tesorería para hoy / 7 / 30 / 90 días. Trae UNA vez el calendario de 90 días y el
 * modelo de liquidez (para las líneas y la posición), y construye cada horizonte cortando la ventana.
 * Cada bloque degrada con honestidad si su fuente no responde — nunca inventa un movimiento ni una tasa.
 *
 * @param {object} deps {google}
 * @param {object} [opts] {hoy, liquidezMinima, tasaPrestamoTNA, tasaDescuentoChequeTNA}
 */
export async function planTesoreria(deps = {}, opts = {}) {
  const hoy = opts.hoy ? new Date(opts.hoy) : new Date()
  const liquidezMinima = Math.max(0, Number(opts.liquidezMinima) || 0)

  // Las tasas de las líneas alternativas salen de la fuente única de condiciones; lo que no tiene tasa
  // no entra (compararFinanciamiento lo excluye), nunca se inventa.
  const paramsFin = await tasasDeCondiciones(opts)

  let calendario = null
  try { calendario = await calendarioDiario(deps, { hoy, dias: 90 }) } catch (e) {
    return { fecha: hoy.toLocaleDateString('es-AR'), estado: 'sin dato', motivo: `no se pudo armar el calendario: ${String(e?.message ?? e).slice(0, 120)}`, horizontes: {} }
  }

  let modelo = null
  try { modelo = await modeloLiquidez(deps, hoy) } catch { modelo = null }
  const limiteDescubierto = ACUERDO.importe
  const cajaInicial = calendario.caja_inicial

  // El plan anterior (si el caller lo pasa) habilita el punto "qué cambió" por acción y por horizonte.
  // Sin él, el contrato lo declara honestamente — nunca inventa una comparación.
  const planAnterior = opts.planAnterior || null

  // EL DISEÑADOR DE ESTRATEGIAS (estrategias-tesoreria.mjs) es quien piensa como CFO: por cada horizonte
  // genera VARIAS estrategias completas (posturas distintas sobre la MISMA data), las compara y elige una;
  // el plan operativo es la CONSECUENCIA de la elegida. Import perezoso: evita cualquier ciclo de carga.
  const { disenarEstrategias } = await import('./estrategias-tesoreria.mjs')

  const horizontes = {}
  for (const h of HORIZONTES) {
    const dias = (calendario.dias || []).slice(0, h.dias)
    const accionesAnteriores = planAnterior?.horizontes?.[h.clave]?.acciones || null
    const dis = disenarEstrategias({ dias, cajaInicial, liquidezMinima, limiteDescubierto, hoy, paramsFin, accionesAnteriores })
    // Retrocompat: la web sigue leyendo resumen/resumen_estrategico/acciones — ahora son los de la
    // estrategia ELEGIDA. `estrategias` es la capa nueva: las generadas, cuál se eligió y por qué;
    // `sensibilidad` es la capa de what-ifs (cobros) que informa sin competir en el ranking.
    const { acciones, resumen, resumen_estrategico } = dis.plan_elegido
    horizontes[h.clave] = { titulo: h.titulo, dias: h.dias, resumen, resumen_estrategico, acciones, estrategias: dis.estrategias, sensibilidad: dis.sensibilidad }
  }

  return {
    fecha: hoy.toLocaleDateString('es-AR'),
    estado: 'ok',
    caja_inicial: cajaInicial,
    liquidez_minima: liquidezMinima,
    limite_linea: limiteDescubierto,
    posicion: modelo ? { colchon_total: modelo.colchon_total, vencido_fiscal: modelo.comprometido?.vencido ?? null, vencido_comercial: modelo.deuda_comercial?.vencido ?? null } : { estado: 'sin dato' },
    horizontes,
    tasas_faltantes: paramsFin.faltan,
    fuentes: `${calendario.fuentes} · condiciones_financieras (tasas de líneas) · el motor de ingeniería financiera orquestado (no recalcula)`,
    sin_fecha: calendario.sin_fecha || null,
  }
}

/** Lee las tasas de las líneas alternativas de la fuente única, sin inventar ninguna. */
async function tasasDeCondiciones(opts = {}) {
  const out = { tasaPrestamoTNA: opts.tasaPrestamoTNA, tasaDescuentoChequeTNA: opts.tasaDescuentoChequeTNA, faltan: [] }
  try {
    const { condicionesVigentes, paramsParaMotor } = await import('./condiciones-financieras.mjs')
    const conds = await condicionesVigentes({})
    const { params, faltan } = paramsParaMotor(conds)
    if (out.tasaPrestamoTNA == null && params.tasaPrestamoTNA != null) out.tasaPrestamoTNA = params.tasaPrestamoTNA
    if (out.tasaDescuentoChequeTNA == null && params.tasaDescuentoChequeTNA != null) out.tasaDescuentoChequeTNA = params.tasaDescuentoChequeTNA
    out.faltan = faltan
  } catch { /* sin la fuente de condiciones: sólo se compara con el descubierto verificado */ }
  return out
}
