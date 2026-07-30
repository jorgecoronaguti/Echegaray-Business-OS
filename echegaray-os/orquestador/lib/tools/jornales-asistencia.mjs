// ADAPTADOR `google_sheets.jornales` — la única puerta por la que se lee y se escribe
// la asistencia en el Sheet JORNALES.
//
// REGLA QUE GOBIERNA ESTE ARCHIVO: JORNALES es la fuente única de verdad. Acá no hay
// caché de trabajadores, ni de obras, ni de asignaciones, ni de horas. Cada operación
// vuelve a leer la planilla. Supabase guarda auditoría, no una copia maestra.
//
// Separación explícita (el pedido lo exige y también es lo que hace esto revisable):
//   · parser de estructura      → jornales-estructura.mjs   (puro)
//   · política de jornada       → jornada-politica.mjs      (puro)
//   · lectura / plan / escritura→ este archivo               (I/O contra Sheets)
//   · interfaz de chat          → comunicacion/asistencia-*  (no sabe de celdas)
//
// Lo que este archivo NUNCA hace: crear una columna de fecha, tocar una fórmula, tocar
// formatos, totales, tarifas, nombres, fechas, obras, otras filas, otras fechas u otras
// pestañas. Escribe exactamente las celdas diarias planificadas y nada más.

import { createHash } from 'node:crypto'
import {
  detectarBloques, bloquePorFecha, columnaDeFecha, trabajadoresDeBloque, obrasDeBloque,
  personalDeObra, leerCeldaDiaria, celdaA1, letraColumna, diaSemanaIso, normalizarClave,
} from '../jornales-estructura.mjs'
import { calibrarJornada, horasJornadaCompleta, horasDeEstado, estadoDeHoras } from '../jornada-politica.mjs'

/** Archivo JORNALES. Configurable por entorno; el default es el archivo real vigente. */
export const JORNALES_SPREADSHEET_ID =
  process.env.GOOGLE_JORNALES_SPREADSHEET_ID || '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'

/** Prefijo de la pestaña operativa de obreros. La pestaña se resuelve por AÑO, no se
 *  escribe "Obreros 26" en el código: en enero de 2027 la pestaña será otra. */
export const PESTANA_PREFIJO = process.env.GOOGLE_JORNALES_PESTANA_PREFIJO || 'Obreros'

/** Rango de lectura. Amplio a propósito: los bloques crecen hacia abajo durante el año. */
const RANGO = process.env.GOOGLE_JORNALES_RANGO || 'A1:BB800'

export const MOTIVO = Object.freeze({
  FECHA_NO_EN_JORNALES: 'fecha_no_en_jornales',
  PESTANA_NO_ENCONTRADA: 'pestana_no_encontrada',
  SIN_PERSONAL: 'sin_personal',
  OBRA_DESCONOCIDA: 'obra_desconocida',
  CELDA_CON_FORMULA: 'celda_con_formula',
  TEXTO_NO_NUMERICO: 'texto_no_numerico',
  TRABAJADOR_NO_EN_BLOQUE: 'trabajador_no_en_bloque',
  OBRA_NO_COINCIDE: 'obra_no_coincide',
  CONFLICTO_CONCURRENCIA: 'conflicto_concurrencia',
  PESTANA_PROTEGIDA: 'pestana_protegida',
  VERIFICACION_FALLIDA: 'verificacion_fallida',
})

/**
 * Huella de una celda: fórmula + valor crudo. Es lo que se compara antes de escribir
 * para detectar que alguien tocó la planilla mientras el jefe completaba el formulario.
 * Incluye la fórmula a propósito: cambiar `8` por `=8` es un cambio real.
 */
export function huellaCelda(estado) {
  // JSON y no una cadena con separador: el plan se guarda como `jsonb` en la sesion, y
  // Postgres RECHAZA el byte NUL dentro de jsonb. El separador que habia aca era, de
  // hecho, un \0: `guardarPlan` habria fallado en produccion y ningun test en memoria lo
  // notaba. Un par [formula, valor] tampoco se puede confundir por donde corta.
  return JSON.stringify([estado?.formula ?? null, estado?.valor_crudo ?? null])
}

/** Año operativo de una fecha ISO (el que decide la pestaña). */
const anioDe = (iso) => Number(String(iso).slice(0, 4))

/**
 * Resuelve el nombre de la pestaña operativa para una fecha, entre las que existen.
 * Preferencia: coincidencia exacta `<Prefijo> <AA>`, luego cualquiera que empiece con
 * el prefijo y contenga el año de dos dígitos. Nunca devuelve una pestaña de otro año.
 */
export function pestanaOperativaPara(pestanas, iso, { prefijo = PESTANA_PREFIJO } = {}) {
  const aa = String(anioDe(iso) % 100).padStart(2, '0')
  const lista = (pestanas || []).filter(Boolean)
  const exacta = lista.find((t) => normalizarClave(t) === normalizarClave(`${prefijo} ${aa}`))
  if (exacta) return exacta
  const pref = normalizarClave(prefijo)
  return lista.find((t) => normalizarClave(t).startsWith(pref) && normalizarClave(t).includes(aa)) ?? null
}

/**
 * LECTURA 1 · `leer_estructura_jornales`. Trae la grilla y los bloques detectados.
 * No interpreta asistencia: sólo estructura.
 */
export async function leerEstructuraJornales(google, { spreadsheetId = JORNALES_SPREADSHEET_ID, pestana, fecha } = {}) {
  let tab = pestana
  if (!tab) {
    const tabs = await google.listTabs(spreadsheetId)
    tab = pestanaOperativaPara(tabs, fecha)
    if (!tab) return { ok: false, motivo: MOTIVO.PESTANA_NO_ENCONTRADA, pestanas: tabs }
  }
  const grid = await google.readSheetGrid(spreadsheetId, `${tab}!${RANGO}`)
  const bloques = detectarBloques(grid, { anio: fecha ? anioDe(fecha) : undefined })
  return { ok: true, spreadsheet_id: spreadsheetId, pestana: tab, grid, bloques }
}

/**
 * Contexto completo para operar una fecha: bloque, columna del día, cuadrilla del
 * bloque y jornada calibrada. Es la base de todas las operaciones siguientes, y la
 * que declara con claridad el caso "esa fecha todavía no existe en JORNALES".
 */
export async function contextoParaFecha(google, { spreadsheetId, pestana, fecha } = {}) {
  const est = await leerEstructuraJornales(google, { spreadsheetId, pestana, fecha })
  if (!est.ok) return est
  const bloque = bloquePorFecha(est.bloques, fecha)
  if (!bloque) return { ok: false, motivo: MOTIVO.FECHA_NO_EN_JORNALES, pestana: est.pestana, fecha }
  const col = columnaDeFecha(bloque, fecha)
  if (!col.ok) return { ok: false, motivo: col.motivo, pestana: est.pestana, fecha }
  const trabajadores = trabajadoresDeBloque(est.grid, bloque)
  const calibracion = calibrarJornada(est.grid, bloque, trabajadores)
  const dia = diaSemanaIso(fecha)
  return {
    ok: true,
    spreadsheet_id: est.spreadsheet_id,
    pestana: est.pestana,
    grid: est.grid,
    bloque,
    columna: col.col,
    columna_letra: letraColumna(col.col),
    fecha,
    dia_semana: dia,
    trabajadores,
    calibracion,
    jornada: horasJornadaCompleta(dia, calibracion),
  }
}

/** LECTURA 2 · `listar_obras_por_fecha`. Sólo lo que JORNALES dice para ESE bloque. */
export async function listarObrasPorFecha(google, opts) {
  const ctx = await contextoParaFecha(google, opts)
  if (!ctx.ok) return ctx
  const obras = obrasDeBloque(ctx.grid, ctx.bloque)
  return {
    ok: true, fecha: ctx.fecha, pestana: ctx.pestana, bloque_fila: ctx.bloque.fila1,
    jornada: ctx.jornada, obras,
  }
}

/** Estado actual de la celda de un trabajador para la fecha del contexto. */
function estadoActual(ctx, t) {
  const cel = leerCeldaDiaria(ctx.grid, t.fila, ctx.columna)
  return {
    ...cel,
    celda_a1: celdaA1(ctx.pestana, t.fila1, ctx.columna),
    fila1: t.fila1,
    estado_equivalente: estadoDeHoras(cel.horas, { diaSemana: ctx.dia_semana, calibracion: ctx.calibracion }),
    huella: huellaCelda(cel),
  }
}

/**
 * LECTURA 3 · `listar_personal_por_obra_y_fecha` + LECTURA 4 · `leer_asistencia_existente`.
 * Van juntas porque separarlas obligaría a leer el Sheet dos veces para la misma
 * pantalla: la cuadrilla ya viene con lo que hoy tiene cargado.
 */
export async function listarPersonalPorObraYFecha(google, { claveObra, ...opts } = {}) {
  const ctx = await contextoParaFecha(google, opts)
  if (!ctx.ok) return ctx
  const obras = obrasDeBloque(ctx.grid, ctx.bloque)
  const obra = obras.find((o) => o.clave === claveObra)
  if (!obra) return { ok: false, motivo: MOTIVO.OBRA_DESCONOCIDA, obras_validas: obras.map((o) => o.clave) }
  const personal = personalDeObra(ctx.grid, ctx.bloque, claveObra).map((t) => ({
    nombre_original: t.nombre_original,
    nombre_clave: t.nombre_clave,
    categoria: t.categoria,
    actual: estadoActual(ctx, t),
  }))
  if (!personal.length) return { ok: false, motivo: MOTIVO.SIN_PERSONAL, obra, fecha: ctx.fecha }
  return {
    ok: true, fecha: ctx.fecha, dia_semana: ctx.dia_semana, pestana: ctx.pestana,
    columna_letra: ctx.columna_letra, obra, jornada: ctx.jornada, personal, ctx,
  }
}

/**
 * PLANIFICACIÓN. Traduce marcas (`nombre_clave` → estado [+ horas]) en celdas concretas,
 * calculando para cada una el valor actual, el propuesto y si está bloqueada. NO escribe.
 * Es exactamente lo que se le muestra al jefe de obra antes de confirmar y lo que
 * después se vuelve a verificar contra la planilla.
 */
export function planificarAsistencia(ctx, { claveObra, marcas, actor } = {}) {
  const dePlanilla = new Map(personalDeObra(ctx.grid, ctx.bloque, claveObra).map((t) => [t.nombre_clave, t]))
  const items = []
  for (const m of marcas || []) {
    const t = dePlanilla.get(m.nombre_clave)
    // El cliente NUNCA elige una fila ni un nombre libre: si la clave no está en la
    // cuadrilla que la planilla declara para esta obra y fecha, se rechaza.
    if (!t) { items.push({ nombre_clave: m.nombre_clave, bloqueada: MOTIVO.TRABAJADOR_NO_EN_BLOQUE }); continue }
    const act = estadoActual(ctx, t)
    const h = horasDeEstado(m.estado, {
      diaSemana: ctx.dia_semana, calibracion: ctx.calibracion, horasManuales: m.horas,
    })
    const base = {
      nombre_original: t.nombre_original, nombre_clave: t.nombre_clave, fila1: t.fila1,
      col: ctx.columna, celda_a1: act.celda_a1, estado: m.estado,
      horas_actuales: act.horas, valor_actual: act.valor_crudo, formula_actual: act.formula,
      huella: act.huella,
    }
    if (!h.ok) { items.push({ ...base, bloqueada: h.motivo, detalle: h }); continue }
    if (act.formula) { items.push({ ...base, horas_nuevas: h.horas, bloqueada: MOTIVO.CELDA_CON_FORMULA }); continue }
    if (act.texto_no_numerico) { items.push({ ...base, horas_nuevas: h.horas, bloqueada: MOTIVO.TEXTO_NO_NUMERICO }); continue }
    const accion = !act.escrita ? 'nueva' : (act.horas === h.horas ? 'sin_cambio' : 'modifica')
    items.push({ ...base, horas_nuevas: h.horas, accion, bloqueada: null })
  }
  const por = (f) => items.filter(f).length
  const escribibles = items.filter((i) => !i.bloqueada && i.accion !== 'sin_cambio')
  const resumen = {
    trabajadores: items.length,
    presentes: por((i) => i.estado === 'presente' && !i.bloqueada),
    ausentes: por((i) => i.estado === 'ausente' && !i.bloqueada),
    parciales: por((i) => i.estado === 'parcial' && !i.bloqueada),
    celdas_nuevas: por((i) => i.accion === 'nueva'),
    celdas_modificadas: por((i) => i.accion === 'modifica'),
    sin_cambio: por((i) => i.accion === 'sin_cambio'),
    bloqueadas: por((i) => i.bloqueada),
    a_escribir: escribibles.length,
  }
  return {
    ok: true, fecha: ctx.fecha, dia_semana: ctx.dia_semana, spreadsheet_id: ctx.spreadsheet_id,
    pestana: ctx.pestana, columna_letra: ctx.columna_letra, bloque_fila: ctx.bloque.fila1,
    clave_obra: claveObra, jornada: ctx.jornada, items, escribibles, resumen,
    // Sobrescribir un dato existente y distinto exige un sí explícito del jefe.
    requiere_confirmacion_sobrescritura: resumen.celdas_modificadas > 0,
    idempotency_key: claveIdempotencia({ ctx, claveObra, items, actor }),
  }
}

/**
 * Clave de idempotencia estable. Cubre archivo, pestaña, fecha, obra, quién confirma y
 * el payload normalizado: repetir exactamente la misma confirmación no produce una
 * segunda mutación ni una segunda auditoría.
 */
export function claveIdempotencia({ ctx, claveObra, items, actor } = {}) {
  const payload = (items || [])
    .filter((i) => !i.bloqueada)
    .map((i) => `${i.nombre_clave}=${i.horas_nuevas}`)
    .sort()
    .join(';')
  const material = [
    ctx?.spreadsheet_id, ctx?.pestana, ctx?.fecha, normalizarClave(claveObra),
    actor?.plataforma_user_id ?? '', payload,
  ].join('|')
  return createHash('sha256').update(material).digest('hex').slice(0, 32)
}

/**
 * ESCRITURA · `registrar_asistencia`.
 *
 * Antes de escribir vuelve a leer la planilla y RE-RESUELVE cada celda por nombre
 * (no por la fila guardada: si alguien insertó una fila, la coordenada vieja apunta a
 * otra persona). Después compara la huella con la del plan: si algo cambió, no escribe
 * NADA y devuelve conflicto. La escritura es UNA sola operación batch, y al final se
 * relee para verificar que lo persistido es lo enviado.
 */
export async function registrarAsistencia(google, { plan, confirmarSobrescritura = false } = {}) {
  if (!plan?.escribibles?.length) {
    return { ok: true, escritas: 0, celdas: [], nota: 'nada que escribir' }
  }
  if (plan.requiere_confirmacion_sobrescritura && !confirmarSobrescritura) {
    return { ok: false, motivo: 'sobrescritura_no_confirmada', celdas_modificadas: plan.resumen.celdas_modificadas }
  }

  // 1) Relectura fresca + re-resolución por nombre.
  const ctx = await contextoParaFecha(google, {
    spreadsheetId: plan.spreadsheet_id, pestana: plan.pestana, fecha: plan.fecha,
  })
  if (!ctx.ok) return ctx
  const ahora = new Map(personalDeObra(ctx.grid, ctx.bloque, plan.clave_obra).map((t) => [t.nombre_clave, t]))

  const data = []
  const celdas = []
  const conflictos = []
  for (const item of plan.escribibles) {
    const t = ahora.get(item.nombre_clave)
    if (!t) { conflictos.push({ ...item, motivo: MOTIVO.TRABAJADOR_NO_EN_BLOQUE }); continue }
    const act = estadoActual(ctx, t)
    // 2) Control de concurrencia: la celda tiene que estar como cuando se planificó.
    if (act.huella !== item.huella) {
      conflictos.push({
        nombre_original: t.nombre_original, celda_a1: act.celda_a1, motivo: MOTIVO.CONFLICTO_CONCURRENCIA,
        valor_al_planificar: item.valor_actual, valor_ahora: act.valor_crudo,
      })
      continue
    }
    if (act.formula) { conflictos.push({ ...item, motivo: MOTIVO.CELDA_CON_FORMULA }); continue }
    const rango = celdaA1(ctx.pestana, t.fila1, ctx.columna)
    data.push({ range: rango, values: [[item.horas_nuevas]] })
    celdas.push({
      nombre_original: t.nombre_original, celda_a1: rango, fila1: t.fila1,
      old_value: act.valor_crudo, new_value: item.horas_nuevas, estado: item.estado,
    })
  }
  // Conflicto funcional: se corta TODA la operación. No se escribe a medias ni se
  // reintenta solo — el jefe tiene que ver los valores actuales antes de reconfirmar.
  if (conflictos.length) return { ok: false, motivo: MOTIVO.CONFLICTO_CONCURRENCIA, conflictos, escritas: 0 }
  if (!data.length) return { ok: true, escritas: 0, celdas: [], nota: 'nada que escribir tras la relectura' }

  // 3) UNA sola operación batch para todas las celdas.
  const res = await google.batchUpdateValues(plan.spreadsheet_id, data)
  // La guarda central del cliente puede negar la escritura (pestaña candada por el
  // dueño o editada a mano). Eso NO es éxito: se informa tal cual.
  if (res?.protegido) {
    return { ok: false, motivo: MOTIVO.PESTANA_PROTEGIDA, bloqueadas: res.bloqueadas ?? null, escritas: 0 }
  }

  // 4) Verificación por relectura: lo persistido tiene que ser lo enviado.
  const verificacion = await verificarPersistencia(google, { plan, ctx, celdas })
  if (!verificacion.ok) return { ok: false, motivo: MOTIVO.VERIFICACION_FALLIDA, ...verificacion, escritas: celdas.length }

  return {
    ok: true, escritas: celdas.length, celdas, pestana: ctx.pestana, columna_letra: ctx.columna_letra,
    google_meta: { updated_cells: res?.totalUpdatedCells ?? null, updated_ranges: res?.totalUpdatedRanges ?? null },
  }
}

/** Relee sólo las celdas escritas y compara con el valor enviado. */
async function verificarPersistencia(google, { plan, ctx, celdas }) {
  const est = await leerEstructuraJornales(google, {
    spreadsheetId: plan.spreadsheet_id, pestana: plan.pestana, fecha: plan.fecha,
  })
  if (!est.ok) return { ok: false, motivo: est.motivo }
  const diferencias = []
  for (const c of celdas) {
    const cel = leerCeldaDiaria(est.grid, c.fila1 - 1, ctx.columna)
    if (cel.horas !== c.new_value) {
      diferencias.push({ celda_a1: c.celda_a1, esperado: c.new_value, leido: cel.horas })
    }
  }
  return diferencias.length ? { ok: false, diferencias } : { ok: true, verificadas: celdas.length }
}

/** Vista `dry-run`: exactamente lo que se escribiría, sin escribir. */
export function dryRun(plan) {
  return {
    sheet: plan.pestana,
    fecha: plan.fecha,
    obra: plan.clave_obra,
    jornada: plan.jornada,
    filas: plan.items.map((i) => ({
      trabajador: i.nombre_original ?? i.nombre_clave,
      celda: i.celda_a1 ?? null,
      valor_actual: i.formula_actual ?? i.valor_actual ?? null,
      valor_propuesto: i.bloqueada ? null : i.horas_nuevas,
      accion: i.bloqueada ? `BLOQUEADA: ${i.bloqueada}` : i.accion,
    })),
    resumen: plan.resumen,
  }
}
