#!/usr/bin/env node
// SYNC del SCORECARD de Admin/Finanzas + KPIs del propio OS → public.finanzas_scorecard (F6).
//
// POR QUÉ (27/07). La salud del área ya vive en fuentes únicas (finanzas_modelo_liquidez), la frescura
// en fuentes_datos y las predicciones congeladas en finanzas_caja_negra. Faltaba UN tablero que junte
// "cómo está el área" con "cuánto aprende el OS" y muestre TENDENCIA. Este sync arma ese snapshot y lo
// congela append-only; la Web SÓLO lo lee (0 recálculo en React).
//
// NO recalcula ni duplica: LEE las fuentes únicas, apunta a ellas con `fuente_unica` y marca lo que la
// fuente todavía no da como 'sin_datos' (nunca un número inventado). Cada corrida mina un corrida_id
// nuevo → dos snapshots conviven como dos puntos de la historia (así se construye la tendencia).
//
// NÚCLEO PURO (testeable, sin BD) vs BORDE con I/O:
//   construirSaludArea / construirFrescura / medirPrecisionForecast / construirMetricasOs / anotarTendencia
//     → PUROS. De las fotos crudas arman las filas del scorecard. Se testean en sync-scorecard-finanzas.test.mjs.
//   main() → BORDE. Lee Supabase, llama a los puros, inserta append-only.
//
//   node orquestador/scripts/sync-scorecard-finanzas.mjs
import { randomUUID } from 'node:crypto'
import { query, closePool } from '../lib/db.mjs'

export const AREA = 'admin_finanzas'

// Un número finito o null — nunca NaN, nunca string. Preserva el valor tal cual (redondeo/criterio son
// de la fuente única; acá no se toca).
function num(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — SALUD DEL ÁREA (fuente única: finanzas_modelo_liquidez)
// ════════════════════════════════════════════════════════════════════════════

/**
 * De la foto del Modelo Único de Liquidez saca las filas de "salud del área". No recalcula un peso:
 * copia los leaves de la fuente única y, si un bloque vino 'sin dato', congela valor null / 'sin_datos'.
 *
 * @param {object|null} modelo la foto materializada en finanzas_modelo_liquidez.modelo
 * @returns {Array<object>} filas {seccion:'salud_area', metrica, etiqueta, valor, unidad, estado, fuente_unica, orden, detalle}
 */
export function construirSaludArea(modelo) {
  const FU = 'finanzas_modelo_liquidez'
  const d = modelo?.disponible || {}
  const o = modelo?.comprometido || {}
  const c = modelo?.deuda_comercial || {}
  const dOk = d.estado === 'ok'
  const oOk = o.estado === 'ok'
  const cOk = c.estado === 'ok'
  const motivoSinFoto = !modelo ? 'el modelo de liquidez aún no fue materializado' : null

  const fila = (metrica, etiqueta, valor, orden, ok = true, motivo = null, unidad = 'pesos') => {
    const v = ok ? num(valor) : null
    const estado = v === null ? 'sin_datos' : 'ok'
    const detalle = estado === 'sin_datos'
      ? { de_donde_saldria: 'finanzas_modelo_liquidez (Modelo Único de Liquidez del motor financiero)', motivo: motivo || motivoSinFoto || 'la fuente no trajo el valor' }
      : null
    return { seccion: 'salud_area', metrica, etiqueta, valor: v, unidad, estado, fuente_unica: FU, orden, detalle }
  }

  return [
    fila('caja_hoy', 'Caja disponible hoy', d.caja_hoy, 1, dOk),
    fila('proyeccion_7dias', 'Proyección de caja a 7 días', d.proyeccion_7dias, 2, dOk),
    fila('colchon_total', 'Colchón de liquidez', modelo?.colchon_total, 3, modelo != null),
    fila('cobranzas_por_cobrar_mes', 'Cobranzas por cobrar (mes)', d.cobranzas_por_cobrar_mes, 4, dOk),
    fila('cobranzas_vencidas', 'Cobranzas vencidas', d.cobranzas_vencidas, 5, dOk),
    fila('obligaciones_saldo', 'Obligaciones (saldo total)', o.saldo_total, 6, oOk),
    fila('obligaciones_vencido', 'Obligaciones vencidas', o.vencido, 7, oOk),
    fila('deuda_comercial_vencida', 'Deuda comercial vencida', c.vencido, 8, cOk),
  ]
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — FRESCURA DE FUENTES (fuente única: fuentes_datos, capacidad F1)
// ════════════════════════════════════════════════════════════════════════════

const ESTADOS_CON_PROBLEMA = ['atrasado', 'error', 'cobertura_parcial', 'conflicto', 'fuente_no_disponible']

/**
 * Resume el catálogo de fuentes_datos: % actualizado, cuántas hay, cuántas con problema y cuántas
 * críticas (alta) con problema. Es la métrica de "el OS sabe qué tan fresco es lo que mira".
 *
 * @param {Array<{estado:string, criticidad:string}>} fuentes filas de public.fuentes_datos
 * @returns {{total:number, actualizadas:number, con_problema:number, criticas_con_problema:number, pct_actualizado:number|null}}
 */
export function resumirFrescura(fuentes = []) {
  const total = fuentes.length
  if (total === 0) return { total: 0, actualizadas: 0, con_problema: 0, criticas_con_problema: 0, pct_actualizado: null }
  const actualizadas = fuentes.filter((f) => f.estado === 'actualizado').length
  const conProblema = fuentes.filter((f) => ESTADOS_CON_PROBLEMA.includes(f.estado)).length
  const criticas = fuentes.filter((f) => f.criticidad === 'alta' && ESTADOS_CON_PROBLEMA.includes(f.estado)).length
  return {
    total,
    actualizadas,
    con_problema: conProblema,
    criticas_con_problema: criticas,
    pct_actualizado: Math.round((actualizadas / total) * 1000) / 10,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — PRECISIÓN DEL FORECAST (fuente única: finanzas_caja_negra, F0/F2)
// ════════════════════════════════════════════════════════════════════════════

const HOY_ISO = () => new Date().toISOString().slice(0, 10)
const soloFecha = (v) => (v ? String(v).slice(0, 10) : null)

/**
 * Mide qué tan bien predijo el OS su propia caja, cruzando DENTRO de la caja negra:
 *   PREDICCIÓN → calendario 'saldo_final_proyectado' con fecha_objetivo = un día D futuro (hecha antes de D).
 *   REALIDAD   → modelo 'caja_hoy' registrado el propio día D (lo que el OS observó como caja real ese día).
 * Ambos viven en finanzas_caja_negra: no depende de ninguna fuente externa. Error por par = |pred−real|
 * / max(|real|, piso). Precisión = 100·(1 − MAPE), acotada a [0, 100].
 *
 * Mientras la caja negra no tenga pares evaluables (predicción + realidad del mismo día pasado), devuelve
 * estado 'sin_datos' — honesto, nunca un número inventado. Se vuelve significativo solo con historia real.
 *
 * @param {Array<object>} rows filas de finanzas_caja_negra {fuente, metrica, fecha_objetivo, valor, estado, registrado_en}
 * @param {{hoy?:string}} [opts]
 * @returns {{estado:'ok'|'sin_datos', precision_pct:number|null, mape:number|null, n_pares:number, detalle:object}}
 */
export function medirPrecisionForecast(rows = [], opts = {}) {
  const hoy = opts.hoy || HOY_ISO()
  // Realidad observada: el último 'caja_hoy' (modelo, estado ok) registrado en cada día.
  const realPorDia = new Map()
  for (const r of rows) {
    if (r.fuente !== 'modelo' || r.metrica !== 'caja_hoy' || r.estado !== 'ok') continue
    const v = num(r.valor)
    if (v === null) continue
    const dia = soloFecha(r.registrado_en)
    if (!dia) continue
    const prev = realPorDia.get(dia)
    if (!prev || String(r.registrado_en) > String(prev.registrado_en)) realPorDia.set(dia, { valor: v, registrado_en: r.registrado_en })
  }

  const pares = []
  for (const r of rows) {
    if (r.fuente !== 'calendario' || r.metrica !== 'saldo_final_proyectado' || r.estado !== 'ok') continue
    const pred = num(r.valor)
    const D = soloFecha(r.fecha_objetivo)
    if (pred === null || !D) continue
    if (D > hoy) continue // el día objetivo todavía no llegó: no hay realidad contra qué medir
    const hecha = soloFecha(r.registrado_en)
    if (hecha && hecha >= D) continue // no es un pronóstico: se registró el mismo día o después
    const real = realPorDia.get(D)
    if (!real) continue // no se observó la caja real de ese día
    const piso = Math.max(Math.abs(real.valor), 1_000_000) // evita dividir por ~0 y castigar de más días de caja mínima
    const ape = Math.abs(pred - real.valor) / piso
    pares.push({ fecha: D, lead_dias: diffDias(hecha, D), pred, real: real.valor, ape })
  }

  if (pares.length === 0) {
    return {
      estado: 'sin_datos',
      precision_pct: null,
      mape: null,
      n_pares: 0,
      detalle: {
        de_donde_saldria: 'finanzas_caja_negra: predicción calendario "saldo_final_proyectado" vs. modelo "caja_hoy" del mismo día ya vencido',
        motivo: 'aún no hay predicciones vencidas con su caja real observada para contrastar',
      },
    }
  }
  const mape = pares.reduce((a, p) => a + p.ape, 0) / pares.length
  const precision = Math.max(0, Math.min(100, 100 * (1 - mape)))
  return {
    estado: 'ok',
    precision_pct: Math.round(precision * 10) / 10,
    mape: Math.round(mape * 1000) / 10,
    n_pares: pares.length,
    detalle: { evaluado_hasta: hoy, peor_ape_pct: Math.round(Math.max(...pares.map((p) => p.ape)) * 1000) / 10 },
  }
}

function diffDias(desde, hasta) {
  if (!desde || !hasta) return null
  const a = new Date(`${desde}T00:00:00Z`).getTime()
  const b = new Date(`${hasta}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — MÉTRICAS DEL PROPIO OS (cuánto aprende)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Arma las filas de "métricas del OS": precisión del forecast, frescura de fuentes y las capacidades
 * todavía sin dato (auto-imputación, horas ahorradas) — que se muestran 'sin_datos' + de dónde saldrían,
 * nunca un número inventado.
 */
export function construirMetricasOs(frescura, precision) {
  const filas = []

  // Precisión del forecast (F0/F2).
  filas.push({
    seccion: 'metricas_os', metrica: 'forecast_precision', etiqueta: 'Precisión del forecast de caja',
    valor: precision.estado === 'ok' ? precision.precision_pct : null, unidad: 'porcentaje',
    estado: precision.estado, fuente_unica: 'finanzas_caja_negra', orden: 1,
    detalle: precision.estado === 'ok'
      ? { n_pares: precision.n_pares, mape_pct: precision.mape, ...precision.detalle }
      : precision.detalle,
  })
  filas.push({
    seccion: 'metricas_os', metrica: 'forecast_muestras', etiqueta: 'Predicciones ya evaluables',
    valor: precision.n_pares, unidad: 'cantidad', estado: 'ok', fuente_unica: 'finanzas_caja_negra', orden: 2,
    detalle: precision.n_pares === 0 ? { nota: 'crece cuando venzan predicciones del calendario con su caja real observada' } : null,
  })

  // Frescura de fuentes (F1).
  const pct = frescura.pct_actualizado
  filas.push({
    seccion: 'metricas_os', metrica: 'frescura_pct', etiqueta: 'Frescura de fuentes (% actualizado)',
    valor: pct, unidad: 'porcentaje', estado: pct === null ? 'sin_datos' : 'ok', fuente_unica: 'fuentes_datos', orden: 3,
    detalle: pct === null ? { de_donde_saldria: 'fuentes_datos', motivo: 'no hay fuentes catalogadas' } : { total: frescura.total, actualizadas: frescura.actualizadas },
  })
  filas.push({
    seccion: 'metricas_os', metrica: 'frescura_fuentes_total', etiqueta: 'Fuentes catalogadas',
    valor: frescura.total, unidad: 'cantidad', estado: 'ok', fuente_unica: 'fuentes_datos', orden: 4, detalle: null,
  })
  filas.push({
    seccion: 'metricas_os', metrica: 'frescura_atrasadas', etiqueta: 'Fuentes atrasadas / con error',
    valor: frescura.con_problema, unidad: 'cantidad', estado: 'ok', fuente_unica: 'fuentes_datos', orden: 5, detalle: null,
  })
  filas.push({
    seccion: 'metricas_os', metrica: 'frescura_criticas_con_problema', etiqueta: 'Fuentes críticas con problema',
    valor: frescura.criticas_con_problema, unidad: 'cantidad', estado: 'ok', fuente_unica: 'fuentes_datos', orden: 6, detalle: null,
  })

  // Capacidades del OS todavía sin fuente: se declaran 'sin_datos' con el origen esperado. Honestidad
  // sobre inventar un número — cuando exista el dato, el sync lo llenará sin tocar la Web.
  filas.push({
    seccion: 'metricas_os', metrica: 'auto_imputacion_pct', etiqueta: 'Auto-imputación de comprobantes',
    valor: null, unidad: 'porcentaje', estado: 'sin_datos', fuente_unica: 'comprobantes_arca', orden: 7,
    detalle: { de_donde_saldria: 'comprobantes_arca / Compras: % de comprobantes imputados a obra por el OS sin intervención humana', motivo: 'aún sin capacidad de medición conectada' },
  })
  filas.push({
    seccion: 'metricas_os', metrica: 'horas_ahorradas_mes', etiqueta: 'Horas humanas ahorradas (mes)',
    valor: null, unidad: 'cantidad', estado: 'sin_datos', fuente_unica: 'orq.chat_result / acciones', orden: 8,
    detalle: { de_donde_saldria: 'registro de tareas resueltas por el OS (cargas, conciliaciones, reportes) × tiempo humano estimado por tarea', motivo: 'aún sin registro de tiempo ahorrado' },
  })

  return filas
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — TENDENCIA (variación vs. snapshot anterior)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Materializa la tendencia EN EL SYNC (no en la Web): para cada fila anota en detalle el valor anterior
 * y la variación absoluta contra el snapshot previo de la misma métrica. Así la Web sólo pinta la flecha.
 *
 * @param {Array<object>} filas filas nuevas del snapshot
 * @param {Array<{seccion:string, metrica:string, valor:number|null}>} previas filas de la corrida anterior
 */
export function anotarTendencia(filas, previas = []) {
  const idx = new Map(previas.map((p) => [`${p.seccion}:${p.metrica}`, p.valor === null || p.valor === undefined ? null : Number(p.valor)]))
  return filas.map((f) => {
    const anterior = idx.has(`${f.seccion}:${f.metrica}`) ? idx.get(`${f.seccion}:${f.metrica}`) : undefined
    if (anterior === undefined || anterior === null || f.valor === null) return f
    const variacion = f.valor - anterior
    return { ...f, detalle: { ...(f.detalle || {}), valor_anterior: anterior, variacion } }
  })
}

// ════════════════════════════════════════════════════════════════════════════
// BORDE CON I/O
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  // 1) Fuentes únicas (sólo lectura; el sync nunca recalcula el negocio).
  const modeloRes = await query('select modelo, calculado_en from public.finanzas_modelo_liquidez where id = 1')
  const modelo = modeloRes.rows[0]?.modelo ?? null
  const modeloCalc = modeloRes.rows[0]?.calculado_en ?? null

  const fuentesRes = await query('select estado, criticidad from public.fuentes_datos')
  const cajaNegraRes = await query(
    `select fuente, metrica, fecha_objetivo, valor, estado, registrado_en
       from public.finanzas_caja_negra
      where (fuente = 'calendario' and metrica = 'saldo_final_proyectado')
         or (fuente = 'modelo' and metrica = 'caja_hoy')`,
  )

  const frescura = resumirFrescura(fuentesRes.rows)
  const precision = medirPrecisionForecast(cajaNegraRes.rows)

  // 2) Armar el snapshot (puros).
  let filas = [
    ...construirSaludArea(modelo),
    ...construirMetricasOs(frescura, precision),
  ]

  // 3) Tendencia vs. la corrida anterior.
  const previasRes = await query(
    `select seccion, metrica, valor from public.finanzas_scorecard
      where area = $1 and capturado_en = (
        select max(capturado_en) from public.finanzas_scorecard where area = $1)`,
    [AREA],
  )
  filas = anotarTendencia(filas, previasRes.rows)

  // 4) Congelar el snapshot append-only. capturado_en = momento de la LECTURA (run time): así dos
  //    snapshots del mismo día ordenan bien en la tendencia. La marca de datos de la fuente (cuándo el
  //    modelo calculó) viaja en detalle.datos_al de la salud del área, sin pisar el tiempo de lectura.
  const corridaId = randomUUID()
  const capturadoEn = new Date().toISOString()
  const datosAl = modeloCalc ? new Date(modeloCalc).toISOString() : null
  if (datosAl) {
    for (const f of filas) {
      if (f.seccion === 'salud_area') f.detalle = { ...(f.detalle || {}), datos_al: datosAl }
    }
  }
  for (const f of filas) {
    await query(
      `insert into public.finanzas_scorecard
        (corrida_id, area, seccion, metrica, etiqueta, valor, unidad, estado, fuente_unica, orden, detalle, capturado_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       on conflict (corrida_id, area, seccion, metrica) do nothing`,
      [corridaId, AREA, f.seccion, f.metrica, f.etiqueta, f.valor, f.unidad, f.estado, f.fuente_unica, f.orden, JSON.stringify(f.detalle ?? null), capturadoEn],
    )
  }

  const salud = filas.filter((f) => f.seccion === 'salud_area')
  const os = filas.filter((f) => f.seccion === 'metricas_os')
  const sinDato = filas.filter((f) => f.estado === 'sin_datos').length
  console.log(`✓ scorecard materializado · corrida ${corridaId}`)
  console.log(`  salud del área: ${salud.length} KPIs · métricas OS: ${os.length} · sin_datos: ${sinDato}`)
  console.log(`  frescura: ${frescura.pct_actualizado ?? 's/d'}% actualizado (${frescura.total} fuentes, ${frescura.criticas_con_problema} críticas con problema)`)
  console.log(`  forecast: ${precision.estado === 'ok' ? `${precision.precision_pct}% (${precision.n_pares} pares)` : 'aún sin datos'}`)
}

// Sólo corre main() si se invoca directo (no al importarse desde el test).
const invocadoDirecto = process.argv[1] && process.argv[1].endsWith('sync-scorecard-finanzas.mjs')
if (invocadoDirecto) {
  main().then(() => closePool()).catch(async (e) => {
    console.error('sync-scorecard-finanzas falló:', e?.message ?? e)
    await closePool()
    process.exit(1)
  })
}
