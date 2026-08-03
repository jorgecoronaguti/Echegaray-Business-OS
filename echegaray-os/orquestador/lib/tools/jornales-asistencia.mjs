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
  colSheet,
} from '../jornales-estructura.mjs'
import { calibrarJornada, horasJornadaCompleta } from '../jornada-politica.mjs'
import { interpretarCarga, componerCarga, resolverCarga, estadoDeCarga, FORMA } from '../horas-extra.mjs'

/** Archivo JORNALES. Configurable por entorno; el default es el archivo real vigente. */
export const JORNALES_SPREADSHEET_ID =
  process.env.GOOGLE_JORNALES_SPREADSHEET_ID || '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'

/** Prefijo de la pestaña operativa de obreros. La pestaña se resuelve por AÑO, no se
 *  escribe "Obreros 26" en el código: en enero de 2027 la pestaña será otra. */
export const PESTANA_PREFIJO = process.env.GOOGLE_JORNALES_PESTANA_PREFIJO || 'Obreros'

/** Rango de lectura. Amplio a propósito: los bloques crecen hacia abajo durante el año. */
const RANGO = process.env.GOOGLE_JORNALES_RANGO || 'A1:BB800'

/** Marca que dice EXPLÍCITAMENTE "no toques esta celda". Es el estado por defecto de una
 *  celda ya cargada: quedarse quieto es la opción segura sobre el jornal de una persona. */
export const SIN_CAMBIO = 'sin_cambio'

export const MOTIVO = Object.freeze({
  FECHA_NO_EN_JORNALES: 'fecha_no_en_jornales',
  PESTANA_NO_ENCONTRADA: 'pestana_no_encontrada',
  SIN_PERSONAL: 'sin_personal',
  OBRA_DESCONOCIDA: 'obra_desconocida',
  FORMULA_NO_INTERPRETABLE: 'formula_no_interpretable',
  TEXTO_NO_NUMERICO: 'texto_no_numerico',
  FORMULA_CON_ERROR: 'formula_con_error',
  TRABAJADOR_AMBIGUO: 'trabajador_ambiguo',
  TRABAJADOR_NO_EN_BLOQUE: 'trabajador_no_en_bloque',
  OBRA_NO_COINCIDE: 'obra_no_coincide',
  CONFLICTO_CONCURRENCIA: 'conflicto_concurrencia',
  PESTANA_PROTEGIDA: 'pestana_protegida',
  // EL FRENO DE MANO GENERAL (`~/.config/echegaray-orq/SHEETS-CONGELADOS`) NO ES UN CANDADO DE
  // PESTAÑA, y hasta el 03/08 se reportaban igual. Ese día, en producción, dos cargas de Rodrigo
  // —una del 31/07 y otra del 03/08— murieron con `pestana_protegida` y el jefe leyó que la
  // pestaña estaba "tomada por alguien que la está editando". No la estaba: el dueño había
  // congelado la escritura de TODOS los Sheets media hora antes. Una causa equivocada manda a
  // buscar el problema al lugar equivocado — y de paso hace parecer roto un módulo que funcionaba.
  ESCRITURA_CONGELADA: 'escritura_congelada',
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
    columna_letra: letraColumna(colSheet(est.grid, col.col)),
    columna_sheet: colSheet(est.grid, col.col),
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

/**
 * Estado actual de la celda de un trabajador para la fecha del contexto, YA interpretado
 * en jornada normal + horas extra. Es lo que se precarga en la edición: si la celda dice
 * `=9+2`, el formulario arranca con 9 normales y 2 extra, no con una celda intocable.
 */
function estadoActual(ctx, t) {
  const cel = leerCeldaDiaria(ctx.grid, t.fila, ctx.columna)
  const carga = interpretarCarga(cel)
  return {
    ...cel,
    carga,
    celda_a1: celdaA1(ctx.pestana, t.fila1, ctx.columna_sheet ?? ctx.columna),
    fila1: t.fila1,
    estado_equivalente: estadoDeCarga(carga, { jornada: ctx.jornada }),
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
    ref: t.ref,
    nombre_clave: t.nombre_clave,
    categoria: t.categoria,
    actual: estadoActual(ctx, t),
    // ¿La celda del día ya tiene algo escrito? Lo decide el default: una celda cargada
    // arranca en SIN CAMBIO, una vacía puede precargarse como presente.
    get cargada() { return this.actual.escrita === true },
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
  const cuadrilla = personalDeObra(ctx.grid, ctx.bloque, claveObra)
  const items = []
  for (const m of marcas || []) {
    const res = resolverTrabajador(cuadrilla, m)
    // El cliente NUNCA elige una fila. La `ref` la emitió el servidor al listar la
    // cuadrilla; si sólo llega un nombre, se acepta únicamente cuando identifica a UNA
    // fila. Dos homónimos ya no colapsan en una escritura a la fila equivocada.
    if (!res.ok) {
      items.push({ ref: m.ref ?? null, nombre_clave: m.nombre_clave ?? null, bloqueada: res.motivo })
      continue
    }
    items.push(planificarUno(ctx, res.t, m))
  }
  const por = (f) => items.filter(f).length
  const suma = (campo) => items.filter((i) => !i.bloqueada && i.accion !== 'sin_cambio')
    .reduce((a, i) => a + (i[campo] ?? 0), 0)
  const escribibles = items.filter((i) => !i.bloqueada && i.accion !== 'sin_cambio')
  const resumen = {
    trabajadores: items.length,
    presentes: por((i) => i.estado === 'presente' && !i.bloqueada),
    ausentes: por((i) => i.estado === 'ausente' && !i.bloqueada),
    tardes: por((i) => i.estado === 'tarde' && !i.bloqueada),
    parciales: por((i) => i.estado === 'parcial' && !i.bloqueada),
    con_extras: por((i) => !i.bloqueada && (i.extras_nuevas ?? 0) > 0),
    horas_normales: Math.round(suma('normales_nuevas') * 100) / 100,
    horas_extra: Math.round(suma('extras_nuevas') * 100) / 100,
    horas_total: Math.round(suma('total_nuevo') * 100) / 100,
    celdas_nuevas: por((i) => i.accion === 'nueva'),
    celdas_modificadas: por((i) => i.accion === 'modifica'),
    sin_cambio: por((i) => i.accion === 'sin_cambio'),
    bloqueadas: por((i) => i.bloqueada),
    reemplazan_formula: por((i) => i.reemplaza_formula_no_interpretable),
    pierden_extras: por((i) => i.pierde_extras && i.accion !== 'sin_cambio'),
    horas_extra_borradas: Math.round(items
      .filter((i) => !i.bloqueada && i.accion !== 'sin_cambio' && i.pierde_extras)
      .reduce((a, i) => a + (i.extras_borradas ?? 0), 0) * 1000) / 1000,
    a_escribir: escribibles.length,
  }
  return {
    ok: true, fecha: ctx.fecha, dia_semana: ctx.dia_semana, spreadsheet_id: ctx.spreadsheet_id,
    pestana: ctx.pestana, columna_letra: ctx.columna_letra, bloque_fila: ctx.bloque.fila1,
    clave_obra: claveObra, jornada: ctx.jornada, items, escribibles, resumen,
    // Sobrescribir un dato existente y distinto exige un sí explícito del jefe.
    requiere_confirmacion_sobrescritura: resumen.celdas_modificadas > 0,
    // Borrar horas extra ya cargadas exige un sí explícito: tiene efecto sobre el jornal.
    pierde_horas_extra: resumen.pierden_extras > 0,
    // Reemplazar una fórmula que NO se pudo descomponer exige un sí aparte: no es lo
    // mismo cambiar un 9 por un 8 que borrar `=9-2,5+2` sin saber qué representaba.
    requiere_confirmacion_formula: resumen.reemplazan_formula > 0,
    idempotency_key: claveIdempotencia({ ctx, claveObra, items, actor }),
  }
}

/**
 * Resuelve la marca a UNA fila de la cuadrilla. Preferencia: `ref` estructural (bloque +
 * fila real), que es lo que el servidor emitió al listar. El nombre normalizado se acepta
 * como compatibilidad, pero SÓLO si identifica a una sola persona: si hay homónimos en la
 * misma obra, se rechaza en vez de elegir por azar — antes ganaba la última fila y la otra
 * persona quedaba sin cargar, con la auditoría a nombre del equivocado.
 */
function resolverTrabajador(cuadrilla, m) {
  if (m?.ref) {
    const t = cuadrilla.find((x) => x.ref === m.ref)
    return t ? { ok: true, t } : { ok: false, motivo: MOTIVO.TRABAJADOR_NO_EN_BLOQUE }
  }
  const clave = m?.nombre_clave ?? null
  if (!clave) return { ok: false, motivo: MOTIVO.TRABAJADOR_NO_EN_BLOQUE }
  const hits = cuadrilla.filter((x) => x.nombre_clave === clave)
  if (hits.length === 1) return { ok: true, t: hits[0] }
  return { ok: false, motivo: hits.length ? MOTIVO.TRABAJADOR_AMBIGUO : MOTIVO.TRABAJADOR_NO_EN_BLOQUE }
}

/**
 * Planifica UN trabajador: resuelve horas normales + extras, decide si la celda actual se
 * puede reemplazar, y compone exactamente lo que se escribiría.
 *
 * La distinción que hace este cuerpo es la que cambió respecto de la primera versión:
 * una celda con fórmula ya NO está bloqueada por el hecho de tener una fórmula. Está
 * bloqueada si es TEXTO, y necesita confirmación aparte si la fórmula no se pudo
 * descomponer en normal + extra. Una `=9+2` es una carga de asistencia normal y se edita
 * como cualquier otra.
 */
function planificarUno(ctx, t, m) {
  const act = estadoActual(ctx, t)
  const carga = act.carga
  const base = {
    ref: t.ref, nombre_original: t.nombre_original, nombre_clave: t.nombre_clave,
    fila1: t.fila1, fila: t.fila,
    col: ctx.columna, celda_a1: act.celda_a1, estado: m.estado,
    // Estado ANTERIOR, ya desglosado (es lo que se muestra y lo que se audita).
    valor_actual: act.valor_crudo, formula_actual: act.formula,
    normales_actuales: carga.normales, extras_actuales: carga.extras, total_actual: carga.total,
    forma_actual: carga.forma, huella: act.huella,
  }

  // SIN CAMBIO explícito: la celda ya está cargada y el jefe no pidió tocarla. No se
  // compone nada, no se escribe nada, y el preview la muestra como está. Es el estado
  // por defecto de toda celda ya cargada — antes el default proponía pisarla.
  if (m.estado === SIN_CAMBIO) {
    return {
      ...base, accion: 'sin_cambio', bloqueada: null,
      normales_nuevas: carga.normales, extras_nuevas: carga.extras, total_nuevo: carga.total,
      escribir: null, es_formula: false, formula_nueva: act.formula ?? null,
      reemplaza_formula_no_interpretable: false, pierde_extras: false,
    }
  }

  // Texto libre: no se toca nunca.
  if (carga.forma === FORMA.TEXTO) return { ...base, bloqueada: MOTIVO.TEXTO_NO_NUMERICO }
  // Fórmula con error (#REF!, #DIV/0!): sin valor interpretable. No se pisa ni se
  // reemplaza con confirmación: no se sabe qué se estaría destruyendo.
  if (carga.forma === FORMA.ERROR) return { ...base, bloqueada: MOTIVO.FORMULA_CON_ERROR }

  const r = resolverCarga({ estado: m.estado, normales: m.normales, extras: m.extras, jornada: ctx.jornada })
  if (!r.ok) return { ...base, bloqueada: r.motivo, detalle: r }

  // Preservar la forma con coeficiente (`=4+3*1,5`) cuando el jefe no cambió las extras:
  // así una corrección de la jornada normal no destruye la información de que esas horas
  // extra eran 3 al 1,5.
  const mismasExtras = carga.inequivoca && carga.extras === r.extras
  const comp = componerCarga({
    normales: r.normales,
    extras: r.extras,
    cantidad_extra: mismasExtras ? carga.cantidad_extra : null,
    coeficiente: mismasExtras ? carga.coeficiente : null,
  })

  // ¿Esta operación BORRA horas extra que ya estaban cargadas? Es la diferencia entre
  // "no hubo extras" y "estás borrando 6 h extra", que el resumen no distinguía.
  const extrasAntes = carga.extras ?? 0
  const item = {
    ...base,
    pierde_extras: extrasAntes > 0 && (r.extras ?? 0) < extrasAntes,
    extras_borradas: extrasAntes > 0 ? Math.round((extrasAntes - (r.extras ?? 0)) * 1000) / 1000 : 0,
    normales_nuevas: r.normales, extras_nuevas: r.extras, total_nuevo: r.total,
    escribir: comp.escribir, es_formula: comp.es_formula, formula_nueva: comp.formula,
    reemplaza_formula_no_interpretable: carga.forma === FORMA.NO_INTERPRETABLE,
    bloqueada: null,
  }
  if (!act.escrita) return { ...item, accion: 'nueva' }
  // "Sin cambio" se decide por la REPRESENTACIÓN, no sólo por el total: pasar de
  // `=9+2` a un 11 pelado cambia el archivo aunque el total sea el mismo.
  const igual = carga.total === r.total
    && (act.formula ?? null) === (comp.formula ?? null)
  return { ...item, accion: igual ? 'sin_cambio' : 'modifica' }
}

/**
 * Clave de idempotencia estable. Cubre archivo, pestaña, fecha, obra, quién confirma y
 * el payload normalizado: repetir exactamente la misma confirmación no produce una
 * segunda mutación ni una segunda auditoría.
 */
export function claveIdempotencia({ ctx, claveObra, items, actor } = {}) {
  // El payload incluye normal y extra por separado: cargar 9+2 no es lo mismo que cargar
  // 11, y una repetición "idéntica" que en realidad cambia el desglose no puede colar
  // como duplicado.
  const payload = (items || [])
    .filter((i) => !i.bloqueada)
    .map((i) => `${i.ref}=${i.normales_nuevas}+${i.extras_nuevas}`)
    .sort()
    .join(';')
  const material = [
    ctx?.spreadsheet_id, ctx?.pestana, ctx?.fecha, normalizarClave(claveObra),
    actor?.plataforma_user_id ?? '', payload,
  ].join('|')
  return createHash('sha256').update(material).digest('hex').slice(0, 32)
}

/**
 * NÚCLEO PURO: la confirmación humana con la que se levanta el freno de mano para ESTA
 * escritura. `null` si no hay actor identificado — y entonces no se escribe nada.
 *
 * El nombre que se deja escrito es el username de la plataforma cuando existe (es lo que
 * una persona reconoce al auditar) y el id si no; nunca los dos, y nunca un placeholder.
 *
 * @param {{actor?:{plataforma_username?:string, plataforma_user_id?:string}|null, fecha?:string}} o
 * @returns {{actor:string, motivo:string}|null}
 */
export function confirmacionDe({ actor, fecha } = {}) {
  const quien = String(actor?.plataforma_username ?? actor?.plataforma_user_id ?? '').trim()
  if (!quien) return null
  return {
    actor: quien,
    motivo: `asistencia del ${fecha ?? 's/f'} confirmada en el chat por ${quien}`,
  }
}

/**
 * ESCRITURA · `registrar_asistencia`.
 *
 * Antes de escribir vuelve a leer la planilla y RE-RESUELVE cada celda por nombre
 * (no por la fila guardada: si alguien insertó una fila, la coordenada vieja apunta a
 * otra persona). Después compara la huella con la del plan: si algo cambió, no escribe
 * NADA y devuelve conflicto. La escritura es UNA sola operación batch, y al final se
 * relee para verificar que lo persistido es lo enviado.
 *
 * `actor` es QUIÉN confirmó, y es el mismo que ya entra en `claveIdempotencia`: no hay
 * una segunda identidad. Con él se arma la confirmación humana que levanta el freno de
 * mano para ESTA escritura (ver `congelador-sheets.mjs`). Sin actor no se arma nada y el
 * freno queda puesto: falla cerrado, como todo lo que en este subsistema necesita nombre.
 */
export async function registrarAsistencia(google, { plan, confirmarSobrescritura = false, confirmarReemplazoFormula = false, actor = null } = {}) {
  if (!plan?.escribibles?.length) {
    return { ok: true, escritas: 0, celdas: [], nota: 'nada que escribir' }
  }
  if (plan.requiere_confirmacion_sobrescritura && !confirmarSobrescritura) {
    return { ok: false, motivo: 'sobrescritura_no_confirmada', celdas_modificadas: plan.resumen.celdas_modificadas }
  }
  if (plan.requiere_confirmacion_formula && !confirmarReemplazoFormula) {
    return { ok: false, motivo: 'reemplazo_formula_no_confirmado', celdas: plan.resumen.reemplazan_formula }
  }

  // 1) Relectura fresca + re-resolución por nombre.
  const ctx = await contextoParaFecha(google, {
    spreadsheetId: plan.spreadsheet_id, pestana: plan.pestana, fecha: plan.fecha,
  })
  if (!ctx.ok) return ctx
  const cuadrillaAhora = personalDeObra(ctx.grid, ctx.bloque, plan.clave_obra)

  const data = []
  const celdas = []
  const conflictos = []
  for (const item of plan.escribibles) {
    const res = resolverTrabajador(cuadrillaAhora, item)
    if (!res.ok) { conflictos.push({ ...item, motivo: res.motivo }); continue }
    const t = res.t
    const act = estadoActual(ctx, t)
    // 2) Control de concurrencia: la celda tiene que estar como cuando se planificó.
    if (act.huella !== item.huella) {
      conflictos.push({
        nombre_original: t.nombre_original, celda_a1: act.celda_a1, motivo: MOTIVO.CONFLICTO_CONCURRENCIA,
        valor_al_planificar: item.valor_actual, valor_ahora: act.valor_crudo,
      })
      continue
    }
    if (act.carga?.forma === FORMA.TEXTO) { conflictos.push({ ...item, motivo: MOTIVO.TEXTO_NO_NUMERICO }); continue }
    if (act.carga?.forma === FORMA.ERROR) { conflictos.push({ ...item, motivo: MOTIVO.FORMULA_CON_ERROR }); continue }
    const rango = celdaA1(ctx.pestana, t.fila1, ctx.columna_sheet ?? ctx.columna)
    // Lo que se escribe es un NÚMERO o una FÓRMULA compuesta sólo con números validados
    // en servidor (ver componerCarga). Nada de esto viene del cliente como texto.
    data.push({ range: rango, values: [[item.escribir]] })
    celdas.push({
      nombre_original: t.nombre_original, celda_a1: rango, fila1: t.fila1, fila: t.fila,
      ref: t.ref, estado: item.estado,
      // Evidencia completa del cambio, con el desglose de los dos lados.
      old_value: act.valor_crudo,
      old_formula: act.formula ?? null,
      old_effective_value: act.carga?.total ?? null,
      old_normal_hours: act.carga?.normales ?? null,
      old_extra_hours: act.carga?.extras ?? null,
      new_normal_hours: item.normales_nuevas,
      new_extra_hours: item.extras_nuevas,
      new_total_hours: item.total_nuevo,
      new_formula: item.formula_nueva ?? null,
      new_value: item.escribir,
    })
  }
  // Conflicto funcional: se corta TODA la operación. No se escribe a medias ni se
  // reintenta solo — el jefe tiene que ver los valores actuales antes de reconfirmar.
  if (conflictos.length) return { ok: false, motivo: MOTIVO.CONFLICTO_CONCURRENCIA, conflictos, escritas: 0 }
  if (!data.length) return { ok: true, escritas: 0, celdas: [], nota: 'nada que escribir tras la relectura' }

  // 3) UNA sola operación batch para todas las celdas.
  //
  // `compartida: true` — JORNALES no es una pestaña del OS: administración la carga todos los días y
  // acá sólo se ponen celdas sueltas. La guarda por FIRMA de pestaña (¿alguien tocó algo en A1:BZ?)
  // ahí da que sí SIEMPRE, y el 30/07 eso no sólo descartó la carga: auto-candó la pestaña y dejó la
  // asistencia muerta. La protección que corresponde es la de arriba y es más fuerte: se releyó cada
  // celda destino y se comparó su huella; si algo cambió, no se escribe NADA. El candado explícito del
  // dueño sigue mandando: si él toma la pestaña, esto se corta igual.
  const res = await google.batchUpdateValues(plan.spreadsheet_id, data, {
    compartida: true,
    // EL FRENO DE MANO, LEVANTADO POR LA PERSONA QUE CONFIRMÓ. No es el OS decidiendo escribir: del
    // otro lado hubo un jefe de obra que vio el preview y apretó Registrar. Sin actor identificado
    // esto es `null` y la escritura queda frenada — la asistencia no se carga a nombre de nadie.
    confirmacion: confirmacionDe({ actor, fecha: plan.fecha }),
  })
  // La guarda central del cliente puede negar la escritura. Eso NO es éxito: se informa tal cual,
  // y se distingue POR QUÉ — el freno de mano general viene marcado con `congelado` y se lo
  // arrastra hasta el mensaje, en vez de disfrazarlo de candado de pestaña.
  if (res?.protegido) {
    return {
      ok: false,
      motivo: res.congelado ? MOTIVO.ESCRITURA_CONGELADA : MOTIVO.PESTANA_PROTEGIDA,
      bloqueadas: res.bloqueadas ?? null,
      escritas: 0,
    }
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
    // Se verifica el TOTAL interpretado, no el texto: si se escribió `=9+2`, la celda
    // vuelve con la fórmula y con 11 calculado. Comparar contra el texto daría un falso
    // negativo en toda escritura con horas extra.
    const carga = interpretarCarga(leerCeldaDiaria(est.grid, c.fila, ctx.columna))
    if (carga.total !== c.new_total_hours) {
      diferencias.push({ celda_a1: c.celda_a1, esperado: c.new_total_hours, leido: carga.total })
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
      normales_actuales: i.normales_actuales ?? null,
      extras_actuales: i.extras_actuales ?? null,
      total_actual: i.total_actual ?? null,
      valor_propuesto: i.bloqueada ? null : i.escribir,
      normales_nuevas: i.bloqueada ? null : i.normales_nuevas,
      extras_nuevas: i.bloqueada ? null : i.extras_nuevas,
      total_nuevo: i.bloqueada ? null : i.total_nuevo,
      accion: i.bloqueada ? `BLOQUEADA: ${i.bloqueada}` : i.accion,
    })),
    resumen: plan.resumen,
  }
}
