// CONSULTAS DE ASISTENCIA EN LENGUAJE NATURAL — leer JORNALES para RESPONDER.
//
// POR QUÉ EXISTE. El registro (comunicacion/asistencia-ui.mjs + tools/jornales-asistencia.mjs)
// resuelve la CARGA. Faltaba lo que el dueño y el jefe de obra preguntan todos los días y
// hoy se responde abriendo la planilla a mano: "¿quién trabajó hoy?", "¿cuánto llevó Aguero
// esta quincena?", "¿cuántas horas extra hizo Messinas del 16 al 30?".
//
// REGLAS QUE GOBIERNAN ESTE ARCHIVO:
//   · JORNALES es la ÚNICA fuente de verdad: no hay copia ni caché entre pedidos.
//   · SÓLO LECTURA: no importa nada que escriba y no arma ningún batch.
//   · NO SE INVENTA NADA: una celda vacía no es 0 (es "sin cargar" y se informa aparte), y
//     una fórmula que no se descompone en normal/extra suma al TOTAL y se declara como no
//     separable en vez de mentir un desglose.
//   · NO SE FILTRAN INTERNALS: el texto que sale a Mattermost no lleva coordenadas de
//     celda, pestañas, ids de archivo, rutas ni fórmulas — sólo negocio.
//   · UNA LECTURA POR PESTAÑA: los 14 bloques de quincena del año viven en la misma hoja.
//
// `parsearConsulta` es PURO y testeable sin red; `responderConsulta` es el único I/O.

import {
  bloquePorFecha, columnaDeFecha, trabajadoresDeBloque, obrasDeBloque,
  leerCeldaDiaria, normalizarClave, diaSemanaIso,
} from './jornales-estructura.mjs'
import { interpretarCarga, FORMA, fmt } from './horas-extra.mjs'
import { leerEstructuraJornales, pestanaOperativaPara, JORNALES_SPREADSHEET_ID, MOTIVO } from './tools/jornales-asistencia.mjs'
import { fechaOperativaSanJuan, fechaAr, nombreDia, limpiar, fechaDesdeTexto } from './fecha-operativa.mjs'

/** Techo del período consultado. Un rango enorme no es una consulta útil: es una
 *  exportación, y además obligaría a leer varias pestañas de años distintos. */
export const MAX_DIAS = Number(process.env.ORQ_CONSULTA_MAX_DIAS ?? 62)

export const MOTIVO_CONSULTA = Object.freeze({
  NO_ES_CONSULTA: 'no_es_consulta', RANGO_DEMASIADO_LARGO: 'rango_demasiado_largo',
  FECHA_NO_EN_JORNALES: 'fecha_no_en_jornales', SIN_DATOS_EN_RANGO: 'sin_datos_en_el_rango',
  OBRA_DESCONOCIDA: 'obra_desconocida', OBRA_AMBIGUA: 'obra_ambigua',
  TRABAJADOR_DESCONOCIDO: 'trabajador_desconocido', TRABAJADOR_AMBIGUO: 'trabajador_ambiguo',
  SIN_COINCIDENCIA: 'sin_coincidencia', PESTANA_NO_ENCONTRADA: MOTIVO.PESTANA_NO_ENCONTRADA,
  FECHA_ILEGIBLE: 'fecha_ilegible',
})

// ── FECHAS ──────────────────────────────────────────────────────────────────
// Aritmética de días CALENDARIO en UTC a propósito (igual que el parser estructural): un
// día no es un instante, y meterle zona horaria acá es lo que corre las fechas.
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const msDe = (iso) => { const m = RE_ISO.exec(String(iso)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN }
const sumarDias = (iso, n) => new Date(msDe(iso) + n * 86400000).toISOString().slice(0, 10)
const diasEntre = (a, b) => Math.round((msDe(b) - msDe(a)) / 86400000)
function rangoFechas(desde, hasta) {
  const n = diasEntre(desde, hasta)
  if (!Number.isFinite(n) || n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => sumarDias(desde, i))
}

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}
const NOMBRES_MES = Object.keys(MESES).join('|')
const armarIso = (d, m, a) => (Number.isFinite(a) && m >= 1 && m <= 12 && d >= 1 && d <= 31
  ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null)
const anioDe = (iso) => { const a = Number(String(iso ?? '').slice(0, 4)); return Number.isFinite(a) && a > 0 ? a : NaN }
const ultimoDiaMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate()

// Formas de fecha que el dueño escribe. El orden importa: "29 de julio" antes que
// "29/7", y el mes solo (que es un PERÍODO) se resuelve al final.
const F_DMY = String.raw`\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?`
const F_DIA_MES = String.raw`\d{1,2}\s+de\s+(?:${NOMBRES_MES})(?:\s+del?\s+\d{4})?`
const F_REL = String.raw`hoy|ayer|anteayer`
const F_FECHA = `(?:${F_DIA_MES}|${F_DMY}|${F_REL})`

/** Una expresión de fecha suelta → ISO. `null` si no se puede resolver (por ejemplo
 *  "hoy" sin fecha de contexto): el llamador decide el default, acá no se inventa. */
const RELATIVAS = { hoy: 0, ayer: -1, anteayer: -2 }
export function interpretarFecha(expr, isoContexto) {
  const t = String(expr ?? '').trim()
  if (t in RELATIVAS) return isoContexto ? sumarDias(isoContexto, RELATIVAS[t]) : null
  const dm = new RegExp(`^(\\d{1,2})\\s+de\\s+(${NOMBRES_MES})(?:\\s+del?\\s+(\\d{4}))?$`).exec(t)
  if (dm) return existe(armarIso(+dm[1], MESES[dm[2]], dm[3] ? +dm[3] : anioDe(isoContexto)))
  return existe(fechaDesdeTexto(t, isoContexto))
}

/**
 * Un ISO que además existe en el calendario. "31/04" y "30/02" pasan los rangos sueltos
 * (día ≤ 31, mes ≤ 12) y producen 2026-04-31 / 2026-02-30, que después la aritmética de
 * días corre solita al 1/5 y al 2/3: la consulta contestaría por un día que nadie pidió.
 */
function existe(iso) {
  const m = RE_ISO.exec(String(iso ?? ''))
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? iso : null
}

// ── PARSEO DE LA INTENCIÓN ──────────────────────────────────────────────────
/** El texto habla de asistencia/jornales/horas. Sin esto, no es una consulta nuestra.
 *  `\bhora` y no `hora`: si no, "ahora" activaría el skill. */
// `falt`/`vino`/`ausent` estaban afuera: "quién faltó ayer" no era tema de consulta y caía
// en el flujo de REGISTRO, abriendo el formulario en vez de contestar. Es de las formas más
// naturales de preguntar y la usa el dueño.
const RE_TEMA = /\b(asistenc|presentism|jornal|trabaj|hora|falt|ausent|vino|presente)/
/** Marcas de PREGUNTA: sin una de estas (o una fecha, o una entidad) el texto es el
 *  comando de REGISTRO y no se le roba al otro flujo. */
const RE_PREGUNTA = /\b(quien|quienes|cuant|cuanto|como viene|detalle|resumen de)/
/** Comandos del formulario de registro: nunca son consultas. */
const RE_REGISTRO = /\b(confirm|cancel|sobrescrib|sobreescrib)/
const RE_MARCA_REGISTRO = /^\s*(?:(?:obra|cliente)\s*:?\s*\d{1,2}|\d{1,3}\s+(?:ausent|present|parcial|falt)\w*(?:\s+\d+([.,]\d+)?)?)\s*$/

const RE_ENTRE = new RegExp(`\\bentre\\s+(?:el\\s+)?(${F_FECHA})\\s+(?:y|hasta)\\s+(?:el\\s+)?(${F_FECHA})`)
const RE_DEL_AL = new RegExp(`\\b(?:del|desde|de)\\s+(?:el\\s+)?(${F_FECHA})\\s+(?:al|hasta(?:\\s+el)?|a)\\s+(?:el\\s+)?(${F_FECHA})`)
const RE_FECHA_MARCADA = new RegExp(`\\b(?:de|del|el|dia|fecha)\\s+(?:el\\s+)?(${F_FECHA})`)
const RE_REL_SUELTA = new RegExp(`\\b(${F_REL})\\b`)
const RE_MES_SOLO = new RegExp(`\\b(?:de|del|en|durante)\\s+(${NOMBRES_MES})(?:\\s+del?\\s+(\\d{4}))?`)

/** Palabras que no son ni obra ni persona: se descartan al buscar la entidad. */
const STOP = new Set([
  'asistencia', 'asistencias', 'presentismo', 'jornal', 'jornales', 'hora', 'horas',
  'extra', 'extras', 'quien', 'quienes', 'trabajo', 'trabajaron', 'trabajado', 'trabaja',
  'trabajamos', 'cuanto', 'cuanta', 'cuantas', 'cuantos', 'de', 'del', 'la', 'el', 'los',
  'las', 'y', 'a', 'al', 'dia', 'dias', 'fecha', 'fechas', 'mostrame', 'dame', 'decime',
  'ver', 'sobre', 'para', 'desde', 'hasta', 'entre', 'durante', 'hizo', 'hicieron',
  'tiene', 'tuvo', 'total', 'totales', 'me', 'mi', 'que', 'se', 'personal', 'plantel',
  'cuadrilla', 'gente', 'detalle', 'resumen', 'hay', 'hubo', 'estuvo', 'estuvieron',
  'hoy', 'ayer', 'anteayer',
  // Los verbos de la propia pregunta NO son el nombre de una persona ni de una obra.
  // Sin esto "quién faltó ayer" buscaba a alguien llamado "falto".
  'falto', 'falta', 'faltaron', 'faltan', 'ausente', 'ausentes', 'ausencia', 'ausencias',
  'vino', 'vinieron', 'presente', 'presentes', 'trabajaba', 'trabajando',
  ...Object.keys(MESES),
])
/** Un token que es una fecha ("29/07") NUNCA es el nombre de una obra ni de una persona.
 *  Sin esta guarda, "asistencia 29/07" —que es el comando de REGISTRO con fecha— se leía
 *  como "asistencia de la obra 29/07" y el skill le robaba el turno al otro flujo. */
const RE_TOKEN_FECHA = /^\d{1,2}(?:[/-]\d{1,2}){1,2}$/
const RE_MARCA_OBRA = /^(obra|obras|cliente|clientes|en)$/
const RE_MARCA_PERSONA = /^(trabajador|trabajadores|obrero|obreros|empleado|persona)$/

/**
 * Texto libre → intención de consulta, o `null` si NO es una consulta de asistencia.
 * Puro: no toca red, ni base, ni fecha del sistema. `alcance_ambiguo` existe porque el
 * lenguaje real no distingue "de Messinas" (obra) de "de Aguero" (persona): el parser no
 * adivina, marca la ambigüedad y la PLANILLA la resuelve en `responderConsulta`.
 */
export function parsearConsulta(texto, { isoContexto } = {}) {
  const t = limpiar(texto)
  if (!t) return null
  if (RE_REGISTRO.test(t) || RE_MARCA_REGISTRO.test(t)) return null
  if (!RE_TEMA.test(t)) return null

  const f = extraerFechas(t, isoContexto)
  const ent = extraerEntidad(f.resto)
  // Sin fecha, sin entidad y sin marca de pregunta, "asistencia" es el comando de
  // REGISTRO: se devuelve null para no secuestrarlo.
  if (!f.conFecha && !ent.texto && !RE_PREGUNTA.test(t)) return null

  const alcance = ent.texto ? (ent.marcaObra && !ent.marcaPersona ? 'obra' : 'trabajador') : 'todo'
  const ambiguo = alcance === 'trabajador' && !ent.marcaPersona
  return {
    tipo: /\bextra/.test(t) ? 'horas_extra' : 'asistencia',
    alcance, fecha: f.fecha, desde: f.desde, hasta: f.hasta,
    obra: alcance === 'obra' || ambiguo ? ent.texto : null,
    trabajador: alcance === 'trabajador' ? ent.texto : null,
    alcance_ambiguo: ambiguo,
    fecha_ilegible: f.ilegible ?? null,
  }
}

/**
 * Saca del texto la fecha o el período y devuelve lo que queda para buscar la entidad.
 * Un período gana a una fecha suelta, y una fecha suelta gana a un mes completo.
 *
 * `ilegible`: el texto SÍ traía una expresión con forma de fecha pero no se pudo resolver
 * ("del 32/13", "del 30/02"). No es lo mismo que no haber pedido fecha: si se confundieran,
 * la consulta contestaría por HOY y el jefe leería números de otro día creyendo que son los
 * que pidió. Se marca acá y el que responde corta con un error explícito.
 */
function extraerFechas(t, isoContexto) {
  const r = extraerFechasBase(t, isoContexto)
  if (r.conFecha && r.fecha == null && r.desde == null && r.hasta == null) r.ilegible = r.expr ?? null
  return r
}

function extraerFechasBase(t, isoContexto) {
  const per = RE_ENTRE.exec(t) ?? RE_DEL_AL.exec(t)
  if (per) {
    let desde = interpretarFecha(per[1], isoContexto)
    let hasta = interpretarFecha(per[2], isoContexto)
    if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde]
    return { resto: t.replace(per[0], ' '), fecha: null, desde, hasta, conFecha: true, expr: `${per[1]} a ${per[2]}` }
  }
  const una = RE_FECHA_MARCADA.exec(t) ?? RE_REL_SUELTA.exec(t)
  if (una) return { resto: t.replace(una[0], ' '), fecha: interpretarFecha(una[1], isoContexto), desde: null, hasta: null, conFecha: true, expr: una[1] }
  const mes = RE_MES_SOLO.exec(t)
  if (!mes) return { resto: t, fecha: null, desde: null, hasta: null, conFecha: false }
  const a = mes[2] ? +mes[2] : anioDe(isoContexto)
  const m = MESES[mes[1]]
  const hay = Number.isFinite(a)
  return {
    resto: t.replace(mes[0], ' '), fecha: null, conFecha: true, expr: mes[1],
    desde: hay ? armarIso(1, m, a) : null, hasta: hay ? armarIso(ultimoDiaMes(a, m), m, a) : null,
  }
}

/** Lo que queda del texto después de sacar fechas: la obra o la persona. */
function extraerEntidad(resto) {
  let marcaObra = false; let marcaPersona = false
  const palabras = []
  for (const tk of String(resto).split(/\s+/).filter(Boolean)) {
    if (RE_MARCA_OBRA.test(tk)) { marcaObra = true; continue }
    if (RE_MARCA_PERSONA.test(tk)) { marcaPersona = true; continue }
    if (STOP.has(tk) || /^\d+(?:[.,]\d+)?$/.test(tk) || RE_TOKEN_FECHA.test(tk)) continue
    palabras.push(tk)
  }
  return { texto: palabras.join(' ') || null, marcaObra, marcaPersona }
}

// ── LECTURA (una vez por pestaña) ───────────────────────────────────────────
/** Lector con memoria POR CONSULTA: lee cada pestaña una sola vez y deriva cada bloque
 *  una sola vez. La memoria muere con la consulta — no hay caché entre pedidos. */
function lectorJornales(google, spreadsheetId) {
  let tabs = null
  const porPestana = new Map()
  const derivado = new Map()
  return {
    async para(iso) {
      if (!tabs) tabs = await google.listTabs(spreadsheetId)
      const tab = pestanaOperativaPara(tabs, iso)
      if (!tab) return { ok: false, motivo: MOTIVO.PESTANA_NO_ENCONTRADA }
      if (!porPestana.has(tab)) {
        porPestana.set(tab, await leerEstructuraJornales(google, { spreadsheetId, pestana: tab, fecha: iso }))
      }
      return porPestana.get(tab)
    },
    bloque(est, bloque) {
      const k = `${est.pestana}#${bloque.fila}`
      if (!derivado.has(k)) {
        derivado.set(k, { trabajadores: trabajadoresDeBloque(est.grid, bloque), obras: obrasDeBloque(est.grid, bloque) })
      }
      return derivado.get(k)
    },
  }
}

// ── RESOLUCIÓN DE OBRA / TRABAJADOR ─────────────────────────────────────────
/** Elige por SUBSTRING normalizado ("Messinas" → MESSINAS|BASES DE TANQUE, "Aguero" →
 *  AGUERO CRISTIAN). Lo exacto gana a lo parcial; si quedan varias no se elige ninguna. */
export function elegirCandidato(candidatas, texto) {
  const needle = normalizarClave(texto)
  if (!needle) return { ok: false, motivo: 'sin_texto' }
  const exactas = candidatas.filter((c) => c.buscables.some((b) => b === needle))
  const pool = exactas.length ? exactas : candidatas.filter((c) => c.buscables.some((b) => b.includes(needle)))
  if (!pool.length) return { ok: false, motivo: 'sin_coincidencia', opciones: candidatas.map((c) => c.etiqueta) }
  if (pool.length > 1) return { ok: false, motivo: 'ambiguo', opciones: pool.map((c) => c.etiqueta) }
  return { ok: true, elegida: pool[0] }
}

// `etiqueta`: los espacios repetidos del Sheet ("LA  ESTRELLA") se colapsan SÓLO para
// mostrar; para comparar se usa la clave normalizada, que nunca se altera.
const candidatasObra = (obras) => [...new Map(obras.map((o) => [o.clave, {
  clave: o.clave, etiqueta: o.etiqueta.replace(/\s+/g, ' ').trim(),
  buscables: [o.clave, o.cliente_clave, o.obra_clave, normalizarClave(o.etiqueta)].filter(Boolean),
}])).values()]

const candidatasTrabajador = (gente) => [...new Map(gente.map((t) => [t.nombre_clave, {
  clave: t.nombre_clave, etiqueta: t.nombre_original.trim(), buscables: [t.nombre_clave],
}])).values()]

function seleccionar(trabajadores, sel) {
  if (sel.alcance === 'obra') return trabajadores.filter((t) => `${t.cliente_clave}|${t.obra_clave}` === sel.clave)
  if (sel.alcance === 'trabajador') return trabajadores.filter((t) => t.nombre_clave === sel.clave)
  return trabajadores
}

// ── EJECUCIÓN ───────────────────────────────────────────────────────────────
/** Responde leyendo JORNALES: `{ok:true, texto, datos}` o `{ok:false, motivo, texto}`.
 *  Nunca lanza por un problema de datos ni de intención. */
export async function responderConsulta(google, consulta, {
  ahora = new Date(), spreadsheetId = JORNALES_SPREADSHEET_ID, maxDias = MAX_DIAS,
} = {}) {
  const ayuda = { ok: false, motivo: MOTIVO_CONSULTA.NO_ES_CONSULTA, texto: renderAyudaConsultas() }
  if (!consulta) return ayuda
  // Pidió una fecha que no se entiende. Contestar por HOY sería peor que no contestar: los
  // números serían reales, pero de otro día que el jefe no pidió.
  if (consulta.fecha_ilegible) {
    return {
      ok: false,
      motivo: MOTIVO_CONSULTA.FECHA_ILEGIBLE,
      texto: `No entendí la fecha «${String(consulta.fecha_ilegible).slice(0, 30)}». Escribila como 29/07, "29 de julio", o decime "hoy".`,
    }
  }
  const hoy = fechaOperativaSanJuan(ahora)
  let desde = consulta.desde ?? consulta.fecha ?? hoy
  let hasta = consulta.hasta ?? consulta.fecha ?? hoy
  if (desde > hasta) [desde, hasta] = [hasta, desde]
  const fechas = rangoFechas(desde, hasta)
  if (!fechas.length) return ayuda
  if (fechas.length > maxDias) {
    return {
      ok: false, motivo: MOTIVO_CONSULTA.RANGO_DEMASIADO_LARGO,
      texto: `El período pedido son ${fechas.length} días y el máximo por consulta es ${maxDias}. Pedime un tramo más corto (por ejemplo una quincena).`,
    }
  }

  // 1) Estructura de cada fecha, con UNA lectura por pestaña.
  const lector = lectorJornales(google, spreadsheetId)
  const dias = []; const sinDatos = []
  for (const f of fechas) {
    const est = await lector.para(f)
    if (!est.ok) { sinDatos.push({ fecha: f, motivo: est.motivo }); continue }
    const bloque = bloquePorFecha(est.bloques, f)
    if (!bloque) { sinDatos.push({ fecha: f, motivo: MOTIVO_CONSULTA.FECHA_NO_EN_JORNALES }); continue }
    const col = columnaDeFecha(bloque, f)
    if (!col.ok) { sinDatos.push({ fecha: f, motivo: col.motivo }); continue }
    const { trabajadores, obras } = lector.bloque(est, bloque)
    dias.push({ fecha: f, dia_semana: diaSemanaIso(f), grid: est.grid, col: col.col, trabajadores, obras })
  }
  if (!dias.length) return sinNada({ desde, hasta, sinDatos })

  // 2) Qué se está preguntando: una obra, una persona, o todo.
  const sel = resolverAlcance(consulta, dias)
  if (!sel.ok) return sel

  // 3) Agregación sobre las celdas reales.
  const datos = agregar({ dias, sel, desde, hasta, sinDatos })
  return { ok: true, texto: renderConsulta({ consulta, datos }), datos }
}

/** Ninguna de las fechas pedidas existe en la planilla. No es un error del usuario y no
 *  se crea ninguna columna: se informa tal cual. */
function sinNada({ desde, hasta, sinDatos }) {
  const unaSola = desde === hasta
  if (sinDatos.some((s) => s.motivo === MOTIVO.PESTANA_NO_ENCONTRADA)) {
    return {
      ok: false, motivo: MOTIVO_CONSULTA.PESTANA_NO_ENCONTRADA,
      texto: `La planilla de jornales todavía no tiene la hoja del año de ${fechaAr(desde)}. No se creó ninguna: hay que prepararla primero.`,
    }
  }
  return {
    ok: false,
    motivo: unaSola ? MOTIVO_CONSULTA.FECHA_NO_EN_JORNALES : MOTIVO_CONSULTA.SIN_DATOS_EN_RANGO,
    texto: unaSola
      ? `El ${fechaAr(desde)} todavía no existe en la planilla de jornales (${nombreDia(diaSemanaIso(desde))}). No hay nada para informar y no se creó ninguna columna.`
      : `Entre el ${fechaAr(desde)} y el ${fechaAr(hasta)} no hay ningún día cargado en la planilla de jornales.`,
  }
}

/** Traduce el texto de la consulta a un filtro concreto contra la planilla. */
function resolverAlcance(consulta, dias) {
  const obras = candidatasObra(dias.flatMap((d) => d.obras))
  const gente = candidatasTrabajador(dias.flatMap((d) => d.trabajadores))
  const elegida = (alcance, r) => ({ ok: true, alcance, clave: r.elegida.clave, etiqueta: r.elegida.etiqueta })
  const ambigua = (que, texto, r) => falla(
    que === 'obra' ? MOTIVO_CONSULTA.OBRA_AMBIGUA : MOTIVO_CONSULTA.TRABAJADOR_AMBIGUO,
    `Hay más de una ${que} que coincide con «${texto}». ¿Cuál?`, r.opciones)

  if (consulta.alcance === 'obra') {
    const r = elegirCandidato(obras, consulta.obra)
    if (r.ok) return elegida('obra', r)
    return r.motivo === 'ambiguo' ? ambigua('obra', consulta.obra, r)
      : falla(MOTIVO_CONSULTA.OBRA_DESCONOCIDA, `No encontré una obra que coincida con «${consulta.obra}» en esas fechas.`, r.opciones)
  }

  if (consulta.alcance === 'trabajador') {
    const texto = consulta.trabajador
    const rp = elegirCandidato(gente, texto)
    if (rp.ok) return elegida('trabajador', rp)
    if (rp.motivo === 'ambiguo') return ambigua('persona', texto, rp)
    // "de Messinas" puede ser una obra y no una persona: el lenguaje no lo distingue, la
    // planilla sí. Se reintenta como obra antes de afirmar que no existe.
    if (!consulta.alcance_ambiguo) {
      return falla(MOTIVO_CONSULTA.TRABAJADOR_DESCONOCIDO, `No encontré a nadie que coincida con «${texto}» en esas fechas.`, rp.opciones)
    }
    const ro = elegirCandidato(obras, consulta.obra ?? texto)
    if (ro.ok) return elegida('obra', ro)
    if (ro.motivo === 'ambiguo') return ambigua('obra', texto, ro)
    return falla(MOTIVO_CONSULTA.SIN_COINCIDENCIA,
      `No encontré ni una persona ni una obra que coincida con «${texto}» en esas fechas.`,
      [...rp.opciones, ...ro.opciones])
  }

  return { ok: true, alcance: 'todo', clave: null, etiqueta: 'todas las obras' }
}

function falla(motivo, mensaje, opciones = []) {
  const lista = [...new Set(opciones)].slice(0, 12)
  return { ok: false, motivo, opciones: lista, texto: [mensaje, '', ...lista.map((o) => `· ${o}`)].join('\n').trim() }
}

/** Recorre día por día y persona por persona las celdas reales y suma. */
function agregar({ dias, sel, desde, hasta, sinDatos }) {
  const ceros = { presentes: 0, ausentes: 0, sin_cargar: 0, horas_normales: 0, horas_extra: 0, horas_total: 0 }
  const resumen = { ...ceros, personas: 0, con_texto: 0, no_separables: 0, con_error: 0 }
  const porFecha = []; const porPersona = new Map()
  const acc = { extras: [], noSeparables: [], conTexto: [], conError: [], sinPersonal: [] }

  for (const d of dias) {
    const elegidos = seleccionar(d.trabajadores, sel)
    if (!elegidos.length) { acc.sinPersonal.push(d.fecha); continue }
    const dia = { fecha: d.fecha, dia_semana: d.dia_semana, ...ceros, detalle: [] }
    for (const t of elegidos) {
      const carga = interpretarCarga(leerCeldaDiaria(d.grid, t.fila, d.col))
      const nombre = t.nombre_original.trim()
      const item = { nombre, obra: obraDe(t), forma: carga.forma, normales: null, extras: null, total: null }
      dia.detalle.push(item)
      contar(carga, item, { dia, resumen, p: persona(porPersona, t, nombre), fecha: d.fecha, nombre, acc })
    }
    porFecha.push(dia)
  }
  resumen.personas = porPersona.size
  return {
    alcance: sel.alcance, etiqueta: sel.etiqueta, desde, hasta, dias: porFecha.length,
    resumen: redondear(resumen),
    por_fecha: porFecha.map(redondear),
    por_persona: [...porPersona.values()].map(redondear),
    horas_extra_detalle: acc.extras,
    no_separables_detalle: acc.noSeparables,
    con_texto_detalle: acc.conTexto,
    con_error_detalle: acc.conError,
    fechas_sin_datos: sinDatos,
    fechas_sin_personal: acc.sinPersonal,
  }
}

/** Clasifica UNA celda diaria y la suma en el día, en el total y en la persona. */
function contar(carga, item, { dia, resumen, p, fecha, nombre, acc }) {
  const sumar = (campo, v) => { dia[campo] += v; resumen[campo] += v; p[campo] += v }
  // Vacía y texto NO son horas y no entran en ningún total: una celda vacía es "sin
  // cargar" (no una ausencia) y el texto es un dato que no entendemos.
  if (carga.forma === FORMA.VACIA) { dia.sin_cargar++; resumen.sin_cargar++; p.dias_sin_cargar++; return }
  if (carga.forma === FORMA.TEXTO) { resumen.con_texto++; acc.conTexto.push({ fecha, nombre }); return }
  // Fórmula con error (#REF!, #DIV/0!): NO es una ausencia ni un cero. Antes caía en el
  // `?? 0` de abajo y el informe decía "ausente (0)" de alguien que trabajó. Se cuenta
  // aparte, se declara, y no entra en ningún total.
  if (carga.forma === FORMA.ERROR) {
    resumen.con_error++
    acc.conError.push({ fecha, nombre, formula: carga.formula_original ?? null })
    return
  }

  item.total = Number(carga.total ?? 0)
  sumar('horas_total', item.total)
  if (carga.inequivoca) {
    item.normales = Number(carga.normales ?? 0); item.extras = Number(carga.extras ?? 0)
    sumar('horas_normales', item.normales); sumar('horas_extra', item.extras)
    if (item.extras > 0) acc.extras.push({ fecha, nombre, normales: item.normales, extras: item.extras, total: item.total })
  } else {
    // El TOTAL lo calculó el Sheet, la composición no es inequívoca: se declara.
    resumen.no_separables++; p.no_separables++
    acc.noSeparables.push({ fecha, nombre, total: item.total })
  }
  if (item.total > 0) { dia.presentes++; resumen.presentes++; p.dias_presente++ }
  else { dia.ausentes++; resumen.ausentes++; p.dias_ausente++ }
}

const obraDe = (t) => [t.cliente_original, t.obra_original].map((s) => String(s ?? '').trim()).filter(Boolean).join(' · ')

function persona(mapa, t, nombre) {
  if (!mapa.has(t.nombre_clave)) {
    mapa.set(t.nombre_clave, {
      nombre, obra: obraDe(t), dias_presente: 0, dias_ausente: 0, dias_sin_cargar: 0,
      no_separables: 0, horas_normales: 0, horas_extra: 0, horas_total: 0,
    })
  }
  return mapa.get(t.nombre_clave)
}

/** Redondeo a 2 decimales de todo lo numérico: 3*1,3 en binario da 3.9000000000000004. */
const redondear = (o) => Object.fromEntries(Object.entries(o)
  .map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v]))

// ── RENDER PARA MATTERMOST ──────────────────────────────────────────────────
// Markdown corto, igual en web y en móvil. Acá NO entra ninguna coordenada de celda,
// pestaña, id de archivo, ruta ni fórmula: sólo negocio.

const dm = (iso) => fechaAr(iso).slice(0, 5)
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const MAX_DETALLE = 14 // personas que se listan una a una antes de mostrar sólo el agregado

export function renderConsulta({ consulta, datos }) {
  const r = datos.resumen
  const unDia = datos.desde === datos.hasta
  const cabecera = unDia
    ? `${fechaAr(datos.desde)} (${nombreDia(diaSemanaIso(datos.desde))})`
    : `${fechaAr(datos.desde)} al ${fechaAr(datos.hasta)}`
  const l = [
    `**${consulta.tipo === 'horas_extra' ? 'Horas extra' : 'Asistencia'} · ${datos.etiqueta}** — ${cabecera}`,
    '',
    unDia
      ? `Presentes: ${r.presentes} · Ausentes: ${r.ausentes} · Sin cargar: ${r.sin_cargar}`
      : `Jornadas presentes: ${r.presentes} · Ausencias: ${r.ausentes} · Sin cargar: ${r.sin_cargar} · Personas: ${r.personas}`,
    `Horas normales: ${fmt(r.horas_normales)} · Horas extra: ${fmt(r.horas_extra)} · **Total: ${fmt(r.horas_total)}**`,
  ]
  if (consulta.tipo === 'horas_extra') l.push(...bloqueExtras(datos))
  else if (unDia) l.push(...bloqueDetalleDia(datos))
  else l.push(...bloquePorDia(datos), ...bloquePorPersona(datos))

  l.push(...advertencias(datos, r))
  return l.filter((x) => x !== null).join('\n')
}

function bloqueExtras(datos) {
  const d = datos.horas_extra_detalle
  if (!d.length) return ['', '_No hay horas extra registradas en ese período._']
  const l = ['', '**Horas extra**', ...d.slice(0, 30).map((e) => `· ${dm(e.fecha)} — ${e.nombre}: ${fmt(e.normales)} + ${fmt(e.extras)} extra = ${fmt(e.total)} h`)]
  if (d.length > 30) l.push(`_…y ${d.length - 30} más._`)
  return l
}

function bloqueDetalleDia(datos) {
  const dia = datos.por_fecha[0]
  if (!dia || dia.detalle.length > MAX_DETALLE) return []
  return ['', '**Detalle**', ...dia.detalle.map((i) => `· ${i.nombre} — ${describirItem(i)}`)]
}

const bloquePorDia = (datos) => ['', '**Por día**', ...datos.por_fecha.map((d) => `· ${dm(d.fecha)} ${DIA_CORTO[d.dia_semana] ?? ''} — ${pl(d.presentes, 'presente', 'presentes')}${d.ausentes ? ` · ${pl(d.ausentes, 'ausente', 'ausentes')}` : ''}${d.sin_cargar ? ` · ${d.sin_cargar} sin cargar` : ''} · ${fmt(d.horas_total)} h${d.horas_extra ? ` (${fmt(d.horas_extra)} extra)` : ''}`)]

function bloquePorPersona(datos) {
  const g = datos.por_persona
  if (datos.alcance === 'trabajador' || !g.length || g.length > MAX_DETALLE) return []
  return ['', '**Por persona**', ...g.map((p) => `· ${p.nombre} — ${pl(p.dias_presente, 'jornada', 'jornadas')} · ${fmt(p.horas_total)} h${p.horas_extra ? ` (${fmt(p.horas_extra)} extra)` : ''}${p.dias_ausente ? ` · ${pl(p.dias_ausente, 'ausencia', 'ausencias')}` : ''}`)]
}

function describirItem(i) {
  if (i.forma === FORMA.VACIA) return 'sin cargar'
  if (i.forma === FORMA.TEXTO) return 'la planilla tiene texto en lugar de horas'
  if (i.total === 0) return 'ausente (0)'
  if (i.normales == null) return `${fmt(i.total)} h — el total está cargado con un cálculo que no se puede separar en normal y extra`
  if (!i.extras) return `${fmt(i.total)} h`
  return `${fmt(i.normales)} + ${fmt(i.extras)} extra = ${fmt(i.total)} h`
}

/** Todo lo que el informe NO puede afirmar se dice acá, en vez de esconderlo. */
function advertencias(datos, r) {
  const quienes = (lista) => lista.map((x) => `${x.nombre} (${dm(x.fecha)})`).slice(0, 6).join(', ')
  const faltantes = datos.fechas_sin_datos.map((s) => dm(s.fecha))
  const l = []
  if (!r.presentes && !r.ausentes && r.sin_cargar) l.push('', '_Todavía no hay nada cargado para eso._')
  if (r.no_separables) l.push('', `⚠️ ${pl(r.no_separables, 'carga', 'cargas')} con un cálculo que no se puede separar en normal y extra: ${quienes(datos.no_separables_detalle)}. El total sí está contado; el desglose de esas horas no.`)
  if (r.con_texto) l.push('', `⚠️ ${r.con_texto} ${r.con_texto === 1 ? 'celda tiene' : 'celdas tienen'} texto en lugar de horas: ${quienes(datos.con_texto_detalle)}. No entra en ningún total.`)
  if (r.con_error) l.push('', `⚠️ ${r.con_error} ${r.con_error === 1 ? 'celda tiene un VALOR NO INTERPRETABLE' : 'celdas tienen un VALOR NO INTERPRETABLE'} (la planilla devuelve un error): ${quienes(datos.con_error_detalle)}. No cuentan como ausencia ni como cero — hay que mirarlas en la planilla.`)
  if (faltantes.length) l.push('', `_Sin columna en la planilla (no se informan): ${faltantes.slice(0, 10).join(', ')}${faltantes.length > 10 ? '…' : ''}._`)
  if (datos.fechas_sin_personal.length) l.push('', `_Sin personal asignado: ${datos.fechas_sin_personal.map(dm).slice(0, 10).join(', ')}._`)
  return l
}

export const renderAyudaConsultas = () => [
  '**Consultar asistencia**', '',
  '`asistencia de hoy` · `quién trabajó hoy`',
  '`asistencia del 29/07` · `asistencia del 29 de julio`',
  '`asistencia de la obra Messinas` · `asistencia en Taller`',
  '`cuánto trabajó Aguero` · `asistencia de Aguero del 16/07 al 30/07`',
  '`horas extra de hoy` · `horas extra de Messinas` · `horas extra de julio`',
].join('\n')
