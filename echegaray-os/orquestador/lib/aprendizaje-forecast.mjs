// APRENDIZAJE DEL FORECAST — mide la PRECISIÓN de lo que el motor predijo contra lo que pasó de verdad.
//
// ═══ QUÉ ES (F2, sobre el cimiento de F0) ═══
//
// F0 dejó la caja negra (public.finanzas_caja_negra): cada predicción del motor financiero, congelada
// con fecha, jamás pisada. F2 es la otra mitad del ciclo de aprendizaje: contrastar cada predicción
// contra el REAL observado del mismo día/horizonte, medir sesgo y error (error medio y MAPE del saldo
// proyectado a 7 y 30 días), y —cuando el error es SISTEMÁTICO— PROPONER un ajuste al supuesto. No lo
// aplica: cambiar un supuesto que mueve plata es decisión del dueño.
//
// ═══ DE DÓNDE SALE EL "REAL" — SIN RECALCULAR UN PESO (una-fuente) ═══
//
// El real de un día NO se recalcula. La propia caja negra ya lo tiene: cuando el motor corrió el día D,
// leyó la caja REAL del Sheet (cash-briefing, dueño del saldo) y la congeló como modelo:caja_hoy /
// calendario:caja_inicial. Esa lectura ES la realidad de ese día. Entonces F2 sólo cruza dos filas de
// la MISMA caja negra: lo que una corrida vieja PREDIJO para el día D, contra lo que una corrida de ese
// día OBSERVÓ. El borde puede además anclar el "hoy" con el cash-briefing vivo (la lectura más fresca).
//
// ═══ HONESTIDAD (el principio de confianza) ═══
//
// Un horizonte cuyo día objetivo todavía no llegó se reporta 'aun_no_medible' — NUNCA un error falso.
// Un día ya pasado del que no se capturó la caja real es 'sin_real' (medible en principio, falta el
// dato), distinto de un error. Hoy la historia recién empieza: casi todo será 'aun_no_medible', y eso
// es exactamente lo correcto. Se entrega la MAQUINARIA de medición, no una baja de error ya lograda.
//
// ═══ GOBERNANZA (no negociable) ═══
//
// El núcleo puro NO tiene ninguna vía para APLICAR un ajuste. Detecta el sesgo y DEVUELVE una propuesta
// (estado 'propuesta', aplicar:false, requiere_confirmacion_dueno:true). El borde puede REGISTRAR esa
// propuesta en el backlog (reversible, descartable), pero jamás toca un supuesto de plata. Y todo
// ajuste que el dueño sí aplique queda MEDIDO (evaluarAjuste): si no mejoró la precisión, se revierte.

// Métricas de plata cuyo forecast se contrasta contra la caja real observada. Cada una apunta a un día
// concreto (fecha_objetivo) o a un horizonte relativo (dias_N desde el día del cálculo).
export const METRICAS_CAJA = Object.freeze(['saldo_final_proyectado', 'proyeccion_7dias', 'saldo_proyectado_final'])

// n mínimo de mediciones para hablar de sesgo SISTEMÁTICO (menos que esto es anécdota, no patrón) y
// fracción del mismo signo que lo confirma. Umbrales conservadores: preferimos no proponer a proponer
// sobre ruido.
export const MIN_MEDICIONES_SESGO = 3
export const FRACCION_SESGO = 0.8

const aFechaStr = (v) => {
  if (v == null) return null
  if (typeof v === 'string') return v.slice(0, 10)
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
// Suma N días a un 'YYYY-MM-DD' en UTC (sin tocar husos: el día calendario es lo que importa).
function sumarDias(fechaStr, n) {
  const f = aFechaStr(fechaStr)
  if (f == null) return null
  const d = new Date(`${f}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// 'dias_7' → 7, 'dias_30' → 30, cualquier otra cosa → null (no se inventa un horizonte).
export function diasDeHorizonte(h) {
  const m = /^dias_(\d+)$/.exec(String(h ?? ''))
  return m ? Number(m[1]) : null
}
const num = (v) => { if (v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const prom = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const redondear = (n, d = 4) => n == null ? null : Math.round(n * 10 ** d) / 10 ** d

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — error, sesgo, cuadro de precisión, propuesta, evaluación
// ════════════════════════════════════════════════════════════════════════════

/**
 * Error de UNA predicción contra su real. Convención de signo: error = predicho − real, así un error
 * POSITIVO significa que el forecast SOBREESTIMÓ (predijo más caja de la que hubo). error_pct es null
 * cuando el real es 0 (dividir por cero no es un error de 0%, es "no medible por porcentaje").
 */
export function calcularError(predicho, real) {
  const p = num(predicho); const r = num(real)
  if (p == null || r == null) return { error: null, error_abs: null, error_pct: null }
  const error = p - r
  return { error, error_abs: Math.abs(error), error_pct: r === 0 ? null : error / Math.abs(r) }
}

/**
 * Le pone estado a UNA predicción cruzándola contra el mapa de reales observados.
 *   'medido'         → hay real para el día objetivo: se calcula el error.
 *   'aun_no_medible' → el día objetivo es futuro (relativo a hoy): todavía no pasó. NUNCA un error falso.
 *   'sin_real'       → el día ya pasó pero no se capturó la caja real de ese día (hueco de dato).
 *
 * @param {{metrica,horizonte,fecha_objetivo,valor}} pred con fecha_objetivo YA resuelta al día concreto
 * @param {Map<string,number>} realesPorFecha  'YYYY-MM-DD' → saldo real observado ese día
 * @param {string} hoy  'YYYY-MM-DD'
 */
export function medirPrediccion(pred, realesPorFecha, hoy) {
  const objetivo = aFechaStr(pred.fecha_objetivo)
  const base = { ...pred, fecha_objetivo: objetivo, real: null, error: null, error_abs: null, error_pct: null }
  if (objetivo == null) return { ...base, estado: 'sin_fecha' }
  if (realesPorFecha.has(objetivo)) {
    const real = realesPorFecha.get(objetivo)
    return { ...base, real, ...calcularError(pred.valor, real), estado: 'medido' }
  }
  return { ...base, estado: objetivo > aFechaStr(hoy) ? 'aun_no_medible' : 'sin_real' }
}

/**
 * NÚCLEO PURO: arma el cuadro de precisión. Agrupa las predicciones medidas por (métrica, horizonte) y
 * calcula, por grupo: sesgo (error medio con signo), MAE (error absoluto medio), MAPE, y si el sesgo es
 * SISTEMÁTICO. No consulta BD ni hora: todo sale de los argumentos.
 *
 * @param {Array} predicciones  normalizadas: {metrica, horizonte, fecha_objetivo(día concreto), valor}
 * @param {Map<string,number>} realesPorFecha
 * @param {string} hoy  'YYYY-MM-DD'
 */
export function cuadroPrecision(predicciones, realesPorFecha, hoy) {
  const medidas = predicciones.map((p) => medirPrediccion(p, realesPorFecha, hoy))
  const grupos = new Map()
  for (const m of medidas) {
    const k = `${m.metrica}|${m.horizonte ?? ''}`
    if (!grupos.has(k)) grupos.set(k, { metrica: m.metrica, horizonte: m.horizonte ?? null, items: [] })
    grupos.get(k).items.push(m)
  }
  const por_metrica_horizonte = [...grupos.values()].map(resumirGrupo)
    .sort((a, z) => a.metrica.localeCompare(z.metrica) || String(a.horizonte).localeCompare(String(z.horizonte)))
  return {
    hoy: aFechaStr(hoy),
    por_metrica_horizonte,
    total_predicciones: medidas.length,
    total_medidas: medidas.filter((m) => m.estado === 'medido').length,
    total_pendientes: medidas.filter((m) => m.estado === 'aun_no_medible').length,
  }
}

// Resume UN grupo (métrica+horizonte): las cifras salen sólo de las mediciones reales; los pendientes se
// cuentan aparte para que la confianza sea visible (n chico = no concluir).
function resumirGrupo(g) {
  const medidos = g.items.filter((m) => m.estado === 'medido')
  const errores = medidos.map((m) => m.error)
  const abs = medidos.map((m) => m.error_abs)
  const pct = medidos.filter((m) => m.error_pct != null).map((m) => Math.abs(m.error_pct))
  const sesgo = detectarSesgo(medidos)
  return {
    metrica: g.metrica,
    horizonte: g.horizonte,
    n_medido: medidos.length,
    n_aun_no_medible: g.items.filter((m) => m.estado === 'aun_no_medible').length,
    n_sin_real: g.items.filter((m) => m.estado === 'sin_real').length,
    error_medio: redondear(prom(errores), 2),         // SESGO en pesos: + sobreestima, − subestima
    mae: redondear(prom(abs), 2),                     // error absoluto medio en pesos
    mape: redondear(prom(pct), 4),                    // error porcentual absoluto medio (null si n_pct=0)
    n_pct: pct.length,
    sesgo,
  }
}

/**
 * Sesgo SISTEMÁTICO de un conjunto de mediciones: cuando el error tiene el mismo signo en una fracción
 * dominante de los casos y hay suficientes mediciones. Devuelve dirección y una intensidad, o
 * sistematico:false cuando no alcanza (n chico o signos mezclados). Nunca concluye sobre ruido.
 */
export function detectarSesgo(medidos) {
  const errs = medidos.map((m) => m.error).filter((e) => e != null)
  const n = errs.length
  if (n < MIN_MEDICIONES_SESGO) return { sistematico: false, motivo: 'pocas mediciones', n }
  const sobre = errs.filter((e) => e > 0).length
  const bajo = errs.filter((e) => e < 0).length
  const fracSobre = sobre / n; const fracBajo = bajo / n
  if (fracSobre >= FRACCION_SESGO) return { sistematico: true, direccion: 'sobreestima', fraccion: redondear(fracSobre), n }
  if (fracBajo >= FRACCION_SESGO) return { sistematico: true, direccion: 'subestima', fraccion: redondear(fracBajo), n }
  return { sistematico: false, motivo: 'signos mezclados', fraccion_sobre: redondear(fracSobre), n }
}

/**
 * NÚCLEO PURO: de un cuadro de precisión saca las PROPUESTAS de ajuste. Sólo emite donde el sesgo es
 * sistemático sobre una métrica de plata. Cada propuesta es exactamente eso —una propuesta—: aplicar
 * está en false y requiere confirmación del dueño. El motor NO cambia ningún supuesto solo.
 */
export function proponerAjustes(cuadro, opts = {}) {
  const soloCaja = opts.soloCaja !== false
  const propuestas = []
  for (const g of cuadro.por_metrica_horizonte || []) {
    if (soloCaja && !METRICAS_CAJA.includes(g.metrica)) continue
    if (!g.sesgo?.sistematico || g.n_medido < MIN_MEDICIONES_SESGO) continue
    // Factor de corrección SUGERIDO (informativo): cuánto habría que escalar el predicho para pegarle
    // al real en promedio. real_medio/predicho_medio ≈ 1 − sesgo_relativo. Nunca se aplica: se sugiere.
    const factor = g.mape != null && g.sesgo.direccion === 'sobreestima' ? redondear(1 - g.mape, 3)
      : g.mape != null ? redondear(1 + g.mape, 3) : null
    propuestas.push({
      tipo: 'ajuste_supuesto',
      metrica: g.metrica,
      horizonte: g.horizonte,
      diagnostico: `el forecast de ${g.metrica}${g.horizonte ? ` a ${g.horizonte}` : ''} ${g.sesgo.direccion} sistemáticamente: sesgo medio ${g.error_medio} (MAPE ${g.mape ?? 's/d'}) sobre ${g.n_medido} mediciones`,
      evidencia: { n_medido: g.n_medido, error_medio: g.error_medio, mae: g.mae, mape: g.mape, fraccion: g.sesgo.fraccion },
      factor_correccion_sugerido: factor,
      estado: 'propuesta',
      aplicar: false,
      requiere_confirmacion_dueno: true,
      nota: 'cambiar un supuesto que mueve plata es decisión del dueño; el motor recalcula su forecast pero NO aplica esto solo',
    })
  }
  return propuestas
}

/**
 * NÚCLEO PURO: mide si un ajuste que el dueño YA aplicó mejoró la precisión, para poder REVERTIR lo que
 * no sirve. Compara el error del período previo contra el posterior. Prefiere MAPE (comparable entre
 * métricas); si falta, cae a MAE. Un ajuste que empeora se marca para revertir.
 *
 * @param {{mae?:number, mape?:number}} antes
 * @param {{mae?:number, mape?:number}} despues
 */
export function evaluarAjuste({ antes = {}, despues = {} } = {}) {
  const usaMape = num(antes.mape) != null && num(despues.mape) != null
  const a = usaMape ? num(antes.mape) : num(antes.mae)
  const d = usaMape ? num(despues.mape) : num(despues.mae)
  if (a == null || d == null) {
    return { medible: false, veredicto: 'sin_dato', recomendacion: 'no hay historia suficiente antes/después para medir el ajuste' }
  }
  const delta = redondear(d - a, 4)  // negativo = el error BAJÓ = mejoró
  const mejoro = delta < 0
  const sinCambio = delta === 0
  return {
    medible: true,
    base: usaMape ? 'mape' : 'mae',
    error_antes: a, error_despues: d, delta,
    mejoro, veredicto: sinCambio ? 'sin_cambio' : mejoro ? 'mejoro' : 'empeoro',
    recomendacion: mejoro ? 'mantener el ajuste' : sinCambio ? 'indistinto — el ajuste no movió la precisión' : 'REVERTIR el ajuste: empeoró la precisión',
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BORDE CON I/O — leer la caja negra, cruzar predicho vs. real, y (con gobernanza) registrar propuestas
// ════════════════════════════════════════════════════════════════════════════

/**
 * Separa las filas crudas de la caja negra en PREDICCIONES de caja (con su día objetivo resuelto) y
 * ANCLAS de real (las lecturas reales de caja que la caja negra congeló). Puro y testeable: no toca BD.
 *
 * @param {Array} filas  {fuente, metrica, horizonte, fecha_objetivo, valor, estado, calculado_en}
 * @returns {{predicciones:Array, realesPorFecha:Map<string,number>}}
 */
export function separarCajaNegra(filas = []) {
  const predicciones = []
  const realesPorFecha = new Map()
  for (const f of filas) {
    if (f.estado && f.estado !== 'ok') continue
    const valor = num(f.valor)
    if (valor == null) continue
    // ANCLAS DE REAL: caja_hoy (modelo) y caja_inicial (calendario) son lecturas reales del Sheet el día
    // del cálculo. Ese número ES la caja real de ese día → ancla por la fecha del cálculo.
    if (f.metrica === 'caja_hoy' || f.metrica === 'caja_inicial') {
      const dia = aFechaStr(f.fecha_objetivo) || aFechaStr(f.calculado_en)
      if (dia != null) realesPorFecha.set(dia, valor)  // la última corrida del día gana (misma fuente)
      continue
    }
    if (!METRICAS_CAJA.includes(f.metrica)) continue
    // DÍA OBJETIVO de la predicción: si trae fecha concreta, esa; si es un horizonte dias_N, se resuelve
    // como el día del cálculo + N. Una predicción sin día resoluble se descarta (no se le inventa uno).
    let objetivo = aFechaStr(f.fecha_objetivo)
    if (objetivo == null) {
      const n = diasDeHorizonte(f.horizonte)
      objetivo = n != null ? sumarDias(f.calculado_en, n) : null
    }
    if (objetivo == null) continue
    predicciones.push({ metrica: f.metrica, horizonte: f.horizonte ?? null, fecha_objetivo: objetivo, valor, calculado_en: aFechaStr(f.calculado_en) })
  }
  return { predicciones, realesPorFecha }
}

/**
 * BORDE: mide la precisión del forecast leyendo la caja negra y (si hay Sheet) anclando el "hoy" con la
 * caja real fresca del cash-briefing. Devuelve el cuadro de precisión y las propuestas de ajuste. NO
 * escribe nada, NO aplica ningún ajuste: es lectura pura (Nivel D, reversible).
 *
 * @param {object} deps {query?, google?}
 * @param {object} [opts] {hoy?, dias? ventana de historia a leer}
 */
export async function precisionForecast(deps = {}, opts = {}) {
  const query = deps.query || (await import('./db.mjs')).query
  const hoy = aFechaStr(opts.hoy) || new Date().toISOString().slice(0, 10)
  const ventana = Math.max(1, Number(opts.dias) || 120)
  const { rows } = await query(
    `select fuente, metrica, horizonte, fecha_objetivo, valor::float8 valor, estado, calculado_en
       from public.finanzas_caja_negra
      where calculado_en >= now() - ($1 || ' days')::interval
      order by calculado_en asc`,
    [String(ventana)],
  )
  const { predicciones, realesPorFecha } = separarCajaNegra(rows)
  // Ancla del hoy con la lectura más fresca de caja (si el borde tiene acceso al Sheet). No recalcula:
  // consume el saldo que cash-briefing ya provee (dueño único del saldo).
  if (deps.google?.readSheetValues) {
    try {
      const { cashBriefing } = await import('./cash-briefing.mjs')
      const b = await cashBriefing(deps.google, new Date(`${hoy}T00:00:00Z`))
      const caja = num(b?.caja?.total)
      if (caja != null) realesPorFecha.set(hoy, caja)
    } catch { /* sin Sheet: el hoy queda anclado sólo por lo que la caja negra ya observó */ }
  }
  const cuadro = cuadroPrecision(predicciones, realesPorFecha, hoy)
  const propuestas = proponerAjustes(cuadro, opts)
  return {
    ...cuadro,
    propuestas,
    fuentes: 'public.finanzas_caja_negra (predicciones + anclas de caja real) · cash-briefing (ancla del hoy)',
    nota: cuadro.total_medidas === 0
      ? 'aún no hay predicciones cuyo día objetivo haya pasado con caja real capturada: la maquinaria mide, la historia recién arranca'
      : `${cuadro.total_medidas} predicciones medidas · ${cuadro.total_pendientes} aún no medibles`,
  }
}

// El registro de propuestas reusa el backlog autónomo (tabla existente): una propuesta de ajuste es un
// item de mejora que el dueño confirma o descarta. Nivel de autonomía 'E' = decisión externa/humana,
// porque mueve plata. Registrar la propuesta es interno y reversible; APLICAR el ajuste no se hace acá.
const AJUSTE_A_BACKLOG = (p) => ({
  tipo: 'mejora_potencial',
  titulo: `Ajuste de forecast propuesto: ${p.metrica}${p.horizonte ? ` (${p.horizonte})` : ''}`,
  evidencia: p.diagnostico,
  fuente: 'aprendizaje-forecast (caja negra vs. caja real)',
  confianza: 'calculado',
  impacto: 'media',
  urgencia: 'por_confirmar',
  esfuerzo: 'bajo',
  recomendacion: `${p.nota}. Factor de corrección sugerido: ${p.factor_correccion_sugerido ?? 's/d'}.`,
  nivel_autonomia_permitido: 'E',
})

/**
 * BORDE con gobernanza: registra una propuesta de ajuste en el backlog autónomo para que el dueño la
 * confirme. Idempotente por título (no duplica la misma propuesta abierta). Devuelve si la insertó.
 * NUNCA aplica el ajuste — sólo lo deja registrado como propuesta pendiente de confirmación.
 */
export async function registrarPropuestaAjuste(deps = {}, propuesta) {
  if (!propuesta || propuesta.estado !== 'propuesta' || propuesta.aplicar === true) {
    throw new Error('registrarPropuestaAjuste: sólo registra propuestas (estado "propuesta", aplicar:false)')
  }
  const query = deps.query || (await import('./db.mjs')).query
  const b = AJUSTE_A_BACKLOG(propuesta)
  const { rows } = await query(
    `insert into public.backlog_autonomo
       (tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo, recomendacion, nivel_autonomia_permitido)
     select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
      where not exists (
        select 1 from public.backlog_autonomo
         where titulo = $2 and estado in ('abierto', 'en_curso'))
     returning id`,
    [b.tipo, b.titulo, b.evidencia, b.fuente, b.confianza, b.impacto, b.urgencia, b.esfuerzo, b.recomendacion, b.nivel_autonomia_permitido],
  )
  return { registrada: rows.length > 0, id: rows[0]?.id ?? null, titulo: b.titulo }
}
