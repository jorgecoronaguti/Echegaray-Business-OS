// HORAS NORMALES vs HORAS EXTRA — interpretar y componer la carga de una celda diaria.
//
// POR QUÉ ESTE ARCHIVO EXISTE. La primera versión del skill trataba TODA celda con
// fórmula como intocable. Eso era prudente pero falso: en JORNALES las fórmulas de una
// celda diaria son, casi sin excepción, la forma en que la empresa registra HORAS EXTRA
// sin perder la jornada normal. Bloquearlas dejaba afuera justo el caso que más importa
// controlar.
//
// INVENTARIO REAL (censo de las 3.415 celdas diarias de "Obreros 26" + 268 de
// "Oficina 26", 30/07/2026): 2.851 celdas escritas, de las cuales sólo **27 tienen
// fórmula**, en estas formas:
//
//     =4+2*1,5  ×7      =4+3*1,5  ×4      =9+4*1,3  ×4      =8+10  ×3+1
//     =9+2*1,3  ×2      =8+6      ×1      =8+4*1,5  ×1      =4     ×1
//     =14+3     ×1      =8+4,5    ×1      =9-2,5+2  ×1
//
// De ahí sale la gramática, que NO se inventó: se leyó.
//
//     =N            jornada normal, sin extras
//     =N+E          normal N, extras E (extras ya expresadas en horas)
//     =N+Q*C        normal N, Q horas extra al coeficiente C (1,5 = 50%; 1,3 = 30%)
//
// Y sale también el límite honesto: `=9-2,5+2` (una corrección: 9, menos 2,5 por retirarse
// antes, más 2 extra) NO se descompone de forma inequívoca. Se lee su valor total, se
// muestra, y NO se pisa sin confirmación explícita. Inventar una descomposición ahí sería
// exactamente el tipo de precisión falsa que las reglas de oro prohíben.
//
// 0 celdas con texto libre dentro de una columna diaria real (el "NO SE TOCA HASTA JUL"
// del archivo vive en una columna que NO es de fecha en su bloque). La guarda contra texto
// se mantiene igual, defensiva.
//
// Todo acá es PURO: no hay red, ni base, ni fecha del sistema.

import { parseHoras } from './jornales-estructura.mjs'

/** Forma reconocida del contenido de una celda diaria. */
export const FORMA = Object.freeze({
  VACIA: 'vacia',
  NUMERO: 'numero', // 9        → normal 9, extras 0
  SUMA: 'suma', // =9+2     → normal 9, extras 2
  SUMA_COEF: 'suma_coef', // =4+3*1,5 → normal 4, extras 4,5 (3 h al 1,5)
  NO_INTERPRETABLE: 'no_interpretable', // =9-2,5+2 → total sí, descomposición no
  TEXTO: 'texto', // cualquier cosa que no sea un número de horas
})

/** Estados de asistencia. `tarde` existe porque la propia planilla lo nombra: la leyenda
 *  de "Obreros 26" trae FALTA / TARDANZA / SE RETIRA ANTES / ENFERMEDAD / PERMISO. */
export const ESTADO = Object.freeze({
  PRESENTE: 'presente',
  AUSENTE: 'ausente',
  TARDE: 'tarde',
  PARCIAL: 'parcial',
})

export const HORAS_MAX = Number(process.env.ORQ_ASISTENCIA_HORAS_MAX ?? 24)
export const HORAS_MIN = 0

/** Un token numérico de fórmula: acepta coma o punto decimal (el archivo usa coma). */
const NUM = String.raw`\d{1,3}(?:[.,]\d{1,3})?`
const RE_SOLO_NUM = new RegExp(`^=\\s*(${NUM})\\s*$`)
const RE_SUMA = new RegExp(`^=\\s*(${NUM})\\s*\\+\\s*(${NUM})\\s*$`)
const RE_SUMA_COEF = new RegExp(`^=\\s*(${NUM})\\s*\\+\\s*(${NUM})\\s*\\*\\s*(${NUM})\\s*$`)

const n = (s) => parseHoras(s)
/** Redondeo a 2 decimales: 3*1,3 en binario da 3.9000000000000004. */
const r2 = (x) => Math.round(x * 100) / 100

/**
 * Interpreta el contenido de una celda diaria y separa jornada normal de horas extra.
 *
 * @param {{formula?:string|null, valor?:any, numero?:number|null, escrita?:boolean}} celda
 *        tal como la devuelve `leerCeldaDiaria`
 * @returns {{forma:string, total:number|null, normales:number|null, extras:number|null,
 *            cantidad_extra:number|null, coeficiente:number|null, inequivoca:boolean,
 *            editable:boolean, formula_original:string|null, valor_original:any}}
 *
 * `inequivoca`: la descomposición normal/extra es confiable.
 * `editable`: se puede reemplazar sin una confirmación extra del usuario.
 */
export function interpretarCarga(celda = {}) {
  const formula = celda.formula ?? null
  const valorOriginal = celda.valor_crudo ?? celda.valor ?? null
  const efectivo = typeof celda.numero === 'number' ? celda.numero : n(valorOriginal)
  const base = { formula_original: formula, valor_original: valorOriginal }

  const vacia = !formula && (valorOriginal == null || String(valorOriginal).trim() === '')
  if (vacia) {
    return { ...base, forma: FORMA.VACIA, total: null, normales: null, extras: null, cantidad_extra: null, coeficiente: null, inequivoca: true, editable: true }
  }

  if (!formula) {
    const h = n(valorOriginal)
    if (h == null) {
      // Texto libre en una columna diaria: no se toca. No aparece en el archivo hoy,
      // pero si aparece mañana no se pisa por sorpresa.
      return { ...base, forma: FORMA.TEXTO, total: null, normales: null, extras: null, cantidad_extra: null, coeficiente: null, inequivoca: false, editable: false }
    }
    return { ...base, forma: FORMA.NUMERO, total: h, normales: h, extras: 0, cantidad_extra: null, coeficiente: null, inequivoca: true, editable: true }
  }

  const f = String(formula).trim()
  let m = RE_SUMA_COEF.exec(f)
  if (m) {
    const normales = n(m[1]); const cant = n(m[2]); const coef = n(m[3])
    const extras = r2(cant * coef)
    return { ...base, forma: FORMA.SUMA_COEF, total: r2(normales + extras), normales, extras, cantidad_extra: cant, coeficiente: coef, inequivoca: true, editable: true }
  }
  m = RE_SUMA.exec(f)
  if (m) {
    const normales = n(m[1]); const extras = n(m[2])
    return { ...base, forma: FORMA.SUMA, total: r2(normales + extras), normales, extras, cantidad_extra: null, coeficiente: null, inequivoca: true, editable: true }
  }
  m = RE_SOLO_NUM.exec(f)
  if (m) {
    const h = n(m[1])
    return { ...base, forma: FORMA.NUMERO, total: h, normales: h, extras: 0, cantidad_extra: null, coeficiente: null, inequivoca: true, editable: true }
  }
  // Fórmula real pero fuera de la gramática (`=9-2,5+2`). El TOTAL se conoce (lo calculó
  // el Sheet), la composición no. Se muestra y se pide confirmación para reemplazarla.
  return {
    ...base, forma: FORMA.NO_INTERPRETABLE, total: efectivo ?? null,
    normales: null, extras: null, cantidad_extra: null, coeficiente: null,
    inequivoca: false, editable: false,
  }
}

/** Número → texto canónico para una fórmula (punto decimal; el cliente de Google lo
 *  localiza a coma en un sheet es_AR). Sin ceros de más: 9, no 9.0. */
function numeroCanonico(x) {
  const v = r2(Number(x))
  return Number.isInteger(v) ? String(v) : String(v)
}

/**
 * Compone lo que se va a ESCRIBIR en la celda, respetando la convención del archivo.
 *
 *   sin extras  → un NÚMERO puro (así están 2.824 de las 2.851 celdas escritas)
 *   con extras  → una FÓRMULA que preserva la separación (`=9+2`), y si venía en la forma
 *                 con coeficiente y sigue siendo consistente, se preserva `=4+3*1.5`
 *
 * Nunca concatena texto del cliente: sólo números ya validados en servidor. Por eso no
 * hay superficie de inyección de fórmula — cualquier cosa que no sea número no llega acá.
 */
export function componerCarga({ normales, extras = 0, cantidad_extra = null, coeficiente = null } = {}) {
  const nor = Number(normales)
  const ext = Number(extras || 0)
  if (!Number.isFinite(nor) || !Number.isFinite(ext)) throw new Error('componerCarga: horas no numéricas')
  if (ext === 0) {
    return { escribir: r2(nor), es_formula: false, formula: null, normales: r2(nor), extras: 0, total: r2(nor) }
  }
  // Preservar la forma con coeficiente sólo si sigue siendo aritméticamente cierta.
  const conCoef = cantidad_extra != null && coeficiente != null
    && Number.isFinite(Number(cantidad_extra)) && Number.isFinite(Number(coeficiente))
    && r2(Number(cantidad_extra) * Number(coeficiente)) === r2(ext)
  const derecha = conCoef
    ? `${numeroCanonico(cantidad_extra)}*${numeroCanonico(coeficiente)}`
    : numeroCanonico(ext)
  const formula = `=${numeroCanonico(nor)}+${derecha}`
  return { escribir: formula, es_formula: true, formula, normales: r2(nor), extras: r2(ext), total: r2(nor + ext) }
}

/** Normaliza horas ingresadas a mano. Acepta coma o punto; rechaza texto, NaN e Infinity. */
export function normalizarHoras(entrada, { min = HORAS_MIN, max = HORAS_MAX, permitirVacio = false } = {}) {
  if (entrada == null || String(entrada).trim() === '') {
    return permitirVacio ? { ok: true, horas: 0 } : { ok: false, motivo: 'vacio' }
  }
  if (typeof entrada === 'number' && !Number.isFinite(entrada)) return { ok: false, motivo: 'no_numerico' }
  const h = parseHoras(entrada)
  if (h == null) return { ok: false, motivo: 'no_numerico' }
  if (h < min) return { ok: false, motivo: 'negativo', min }
  if (h > max) return { ok: false, motivo: 'mayor_al_maximo', max }
  return { ok: true, horas: r2(h) }
}

/**
 * Valida y resuelve la carga de un trabajador a partir de su estado.
 *
 *   presente → normales = jornada detectada (si no hay, se piden a mano); extras opcionales
 *   ausente  → normales 0 y extras 0. Un ausente con horas extra es incoherente y se rechaza
 *   tarde    → normales EFECTIVAMENTE trabajadas (manuales, obligatorias); extras opcionales
 *   parcial  → normales manuales obligatorias; extras opcionales
 *
 * Devuelve `{ok, normales, extras, total}` o `{ok:false, motivo}`. Nunca lanza.
 */
export function resolverCarga({ estado, normales, extras, jornada } = {}) {
  const e = String(estado ?? '').toLowerCase()

  if (e === ESTADO.AUSENTE) {
    const ex = normalizarHoras(extras, { permitirVacio: true })
    if (!ex.ok) return { ok: false, motivo: ex.motivo }
    if (ex.horas > 0) return { ok: false, motivo: 'ausente_con_extras' }
    return { ok: true, estado: e, normales: 0, extras: 0, total: 0 }
  }

  let nor
  if (e === ESTADO.PRESENTE) {
    if (jornada?.requiere_manual || jornada?.horas == null) {
      // Día sin jornada inferible (sábado, domingo): no se inventa un número.
      const m = normalizarHoras(normales)
      if (!m.ok) return { ok: false, motivo: 'jornada_requiere_manual' }
      nor = m.horas
    } else {
      nor = Number(jornada.horas)
    }
  } else if (e === ESTADO.TARDE || e === ESTADO.PARCIAL) {
    const m = normalizarHoras(normales)
    if (!m.ok) return { ok: false, motivo: m.motivo === 'vacio' ? 'faltan_horas_normales' : m.motivo, max: m.max, min: m.min }
    nor = m.horas
  } else {
    return { ok: false, motivo: 'estado_desconocido' }
  }

  const ex = normalizarHoras(extras, { permitirVacio: true })
  if (!ex.ok) return { ok: false, motivo: ex.motivo, max: ex.max, min: ex.min }

  const total = r2(nor + ex.horas)
  if (total > HORAS_MAX) return { ok: false, motivo: 'total_mayor_al_maximo', max: HORAS_MAX, total }
  return { ok: true, estado: e, normales: r2(nor), extras: ex.horas, total }
}

/**
 * Estado que ya representa una carga existente, para precargar la edición sin
 * reinterpretar. Una celda vacía NO es un estado (no hay dato todavía).
 */
export function estadoDeCarga(carga, { jornada } = {}) {
  if (!carga || carga.forma === FORMA.VACIA) return null
  if (!carga.inequivoca) return null // no se afirma un estado sobre algo que no se entendió
  if (carga.total === 0) return ESTADO.AUSENTE
  const jn = jornada?.requiere_manual ? null : jornada?.horas
  if (jn != null && carga.normales === jn) return ESTADO.PRESENTE
  return ESTADO.PARCIAL
}

/** Texto corto y legible de una carga, para el chat. */
export function describirCarga(carga) {
  if (!carga || carga.forma === FORMA.VACIA) return 'sin cargar'
  if (carga.forma === FORMA.TEXTO) return `texto: ${String(carga.valor_original).slice(0, 24)}`
  if (carga.forma === FORMA.NO_INTERPRETABLE) {
    return `${fmt(carga.total)} h (fórmula ${carga.formula_original}, no se puede separar normal/extra)`
  }
  if (!carga.extras) return `${fmt(carga.normales)} h`
  return `${fmt(carga.normales)} + ${fmt(carga.extras)} extra = ${fmt(carga.total)} h`
}

/** Número para mostrar, en formato local (coma decimal). */
export function fmt(x) {
  if (x == null) return '—'
  return String(r2(Number(x))).replace('.', ',')
}
