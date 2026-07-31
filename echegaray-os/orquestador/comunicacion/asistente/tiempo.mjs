// TIEMPO EN LENGUAJE NATURAL → un instante absoluto. Determinístico, 0 API.
//
// POR QUÉ NO LO HACE EL MODELO. Los modelos erran día-de-semana y aritmética de fechas con
// una frecuencia que en este dominio no es tolerable: un recordatorio entregado el jueves
// equivocado no se nota hasta que ya pasó. Acá se resuelve con calendario, se prueba con
// tests, y cuesta cero. El modelo, cuando interviene, devuelve la FRASE temporal; la cuenta
// la hace este archivo.
//
// ZONA. La empresa vive en America/Argentina/San_Juan = UTC-3 fijo (Argentina no aplica
// horario de verano desde 2009). Se usa el offset directo en vez de Intl porque el
// resultado tiene que ser un instante estable y comparable en la base, y porque toda la
// aritmética del OS (schedules.mjs) ya asume UTC-3.
//
// AMBIGÜEDAD. "el jueves que viene" significa cosas distintas según quién lo diga. En vez de
// elegir por el usuario, este módulo la DECLARA y devuelve las dos lecturas posibles; quien
// llama pregunta una sola vez. Adivinar acá es exactamente cómo se agenda una reunión en la
// semana equivocada.

const OFFSET_TXT = '-03:00'
const OFFSET_MS = -3 * 3600 * 1000
const DIA_MS = 86_400_000

const DOW = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5, sabado: 6, 'sábado': 6 }
const DOW_NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}
const MES_NOMBRE = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const NUM_PALABRA = {
  un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30,
}

const dosDig = (n) => String(n).padStart(2, '0')

/** Campos de pared en hora AR de un instante. */
export function paredAR(fecha) {
  const d = new Date(fecha.getTime() + OFFSET_MS)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), dow: d.getUTCDay() }
}

/** Hora de pared AR → instante ISO-8601 con offset (lo que viaja por los contratos). */
export function instanteAR(y, m, d, hh = 0, mm = 0) {
  return `${y}-${dosDig(m)}-${dosDig(d)}T${dosDig(hh)}:${dosDig(mm)}:00${OFFSET_TXT}`
}

/** ISO con offset → Date. */
export const aFecha = (iso) => new Date(iso)

/** Suma días sobre campos de pared, normalizando por calendario (meses, años bisiestos). */
function sumarDias({ y, m, d }, n) {
  const base = new Date(Date.UTC(y, m - 1, d))
  const r = new Date(base.getTime() + n * DIA_MS)
  return { y: r.getUTCFullYear(), m: r.getUTCMonth() + 1, d: r.getUTCDate(), dow: r.getUTCDay() }
}

// ── Hora del día ─────────────────────────────────────────────────────────────

const FRANJA = [
  [/\b(a la|por la|de)\s+ma[ñn]ana\b/i, 9, 0],
  [/\b(al|a)\s+mediod[ií]a\b/i, 12, 0],
  [/\b(a la|por la|de)\s+tarde\b/i, 15, 0],
  [/\b(a la|por la|de|esta)\s+noche\b/i, 21, 0],
]

/**
 * Hora explícita del texto. Devuelve `{hh, mm, span, explicita}`; si no hay ninguna,
 * `explicita:false` y la hora por defecto (08:00, la misma convención que orq.schedules).
 */
export function parseHoraDelDia(texto) {
  const t = String(texto || '')
  const ampm = ((t.match(/\b(a\.?\s?m\.?|p\.?\s?m\.?)\b/i) || [])[0] || '').toLowerCase().replace(/[.\s]/g, '')
  const m = t.match(/\ba\s*las?\s*(\d{1,2})(?:[:.](\d{2}))?/i)
    || t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs|hrs|horas)\b/i)
  if (m) {
    let hh = Number(m[1]); const mm = Number(m[2] ?? 0)
    if (ampm === 'pm' && hh < 12) hh += 12
    if (ampm === 'am' && hh === 12) hh = 0
    if (hh > 23 || mm > 59) return { hh: 8, mm: 0, span: null, explicita: false }
    return { hh, mm, span: m[0], explicita: true }
  }
  for (const [re, hh, mm] of FRANJA) {
    const g = t.match(re)
    if (g) return { hh, mm, span: g[0], explicita: true }
  }
  return { hh: 8, mm: 0, span: null, explicita: false }
}

// ── Fecha ────────────────────────────────────────────────────────────────────

/** Próxima ocurrencia de un día de semana desde `hoy` (incluye hoy si `incluirHoy`). */
function proximoDow(hoy, dow, incluirHoy) {
  let add = (dow - hoy.dow + 7) % 7
  if (add === 0 && !incluirHoy) add = 7
  return sumarDias(hoy, add)
}

/** Número escrito con palabra o dígito ("dos", "2"). */
function aNumero(txt) {
  const s = String(txt || '').trim().toLowerCase()
  if (/^\d+$/.test(s)) return Number(s)
  return NUM_PALABRA[s] ?? null
}

/** "dentro de dos horas", "en 30 minutos", "en 3 días". Devuelve un instante o null. */
function parseRelativoDuracion(t, ahora) {
  const m = t.match(/\b(?:dentro de|en)\s+([a-záéíóú]+|\d+)\s*(minutos?|horas?|d[ií]as?|semanas?)\b/i)
  if (!m) return null
  const n = aNumero(m[1])
  if (!n) return null
  const u = m[2].toLowerCase()
  const ms = u.startsWith('minuto') ? 60_000 : u.startsWith('hora') ? 3_600_000 : u.startsWith('d') ? DIA_MS : 7 * DIA_MS
  const inst = new Date(ahora.getTime() + n * ms)
  const p = paredAR(inst)
  return { instante: instanteAR(p.y, p.m, p.d, p.hh, p.mm), span: m[0], conHora: true }
}

/** Fecha calendaria explícita: "15 de agosto", "15/8", "15/08/2026". */
function parseFechaExplicita(t, hoy) {
  let m = t.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+(?:de\s+)?(\d{4}))?\b/i)
  if (m && MES[m[2].toLowerCase()]) {
    const d = Number(m[1]); const mes = MES[m[2].toLowerCase()]
    let y = m[3] ? Number(m[3]) : hoy.y
    if (!m[3] && (mes < hoy.m || (mes === hoy.m && d < hoy.d))) y += 1 // ya pasó este año
    return { y, m: mes, d, span: m[0] }
  }
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (m) {
    const d = Number(m[1]); const mes = Number(m[2])
    if (mes < 1 || mes > 12 || d < 1 || d > 31) return null
    let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : hoy.y
    if (!m[3] && (mes < hoy.m || (mes === hoy.m && d < hoy.d))) y += 1
    return { y, m: mes, d, span: m[0] }
  }
  return null
}

/** Día de semana nombrado. Declara ambigüedad en "que viene"/"próximo" cuando la hay. */
function parseDiaSemana(t, hoy) {
  const m = t.match(/\b(?:este|el|la|los|del)?\s*(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)s?\b(\s*(?:que viene|pr[oó]ximo|pr[oó]xima|de la semana que viene))?/i)
  if (!m) return null
  const dow = DOW[m[1].toLowerCase().replace('é', 'e').replace('á', 'a')]
  if (dow == null) return null
  const proximo = Boolean(m[2])
  const a = proximoDow(hoy, dow, false)
  if (!proximo) return { ...a, span: m[0] }
  // "que viene": ¿la ocurrencia próxima cae todavía en ESTA semana? Entonces hay dos
  // lecturas legítimas y no se elige por el usuario.
  const finDeSemanaActual = (7 - hoy.dow) % 7 // días hasta el domingo inclusive
  const dias = (dow - hoy.dow + 7) % 7 || 7
  if (dias <= finDeSemanaActual) {
    const b = sumarDias(a, 7)
    return { ...b, span: m[0], ambiguo: true, alternativa: a }
  }
  return { ...a, span: m[0] }
}

// ── API principal ────────────────────────────────────────────────────────────

/**
 * Convierte una frase temporal en un instante absoluto.
 *
 * @param {string} texto
 * @param {{ahora?:Date}} [o]
 * @returns {null | {instante:string, conHora:boolean, spans:string[],
 *                   ambiguo?:boolean, opciones?:Array<{valor:string, etiqueta:string}>}}
 *   `conHora:false` significa que la hora es la default (08:00) y no la dijo la persona:
 *   quien llama decide si eso alcanza (una tarea con vencimiento) o si hay que decirlo en
 *   la confirmación (un recordatorio).
 */
export function parseCuando(texto, { ahora = new Date() } = {}) {
  const t = String(texto || '').toLowerCase()
  if (!t.trim()) return null
  const hoy = paredAR(ahora)

  const rel = parseRelativoDuracion(t, ahora)
  if (rel) return { instante: rel.instante, conHora: true, spans: [rel.span] }

  const hora = parseHoraDelDia(t)
  const spans = hora.span ? [hora.span] : []
  const conHora = hora.explicita
  const armar = (f) => instanteAR(f.y, f.m, f.d, hora.hh, hora.mm)

  if (/\bpasado ma[ñn]ana\b/.test(t)) {
    return { instante: armar(sumarDias(hoy, 2)), conHora, spans: [...spans, 'pasado mañana'] }
  }
  if (/\bma[ñn]ana\b/.test(t) && !/\b(a la|por la|de) ma[ñn]ana\b/.test(t)) {
    return { instante: armar(sumarDias(hoy, 1)), conHora, spans: [...spans, 'mañana'] }
  }
  if (/\bhoy\b|\besta noche\b/.test(t)) {
    return { instante: armar(hoy), conHora, spans: [...spans, /\besta noche\b/.test(t) ? 'esta noche' : 'hoy'] }
  }

  const exp = parseFechaExplicita(t, hoy)
  if (exp) return { instante: armar(exp), conHora, spans: [...spans, exp.span] }

  const dow = parseDiaSemana(t, hoy)
  if (dow) {
    const principal = armar(dow)
    if (!dow.ambiguo) return { instante: principal, conHora, spans: [...spans, dow.span] }
    const alt = armar(dow.alternativa)
    return {
      instante: principal, conHora, spans: [...spans, dow.span], ambiguo: true,
      opciones: [
        { valor: alt, etiqueta: `este ${formatearAR(alt, { conHora: false })}` },
        { valor: principal, etiqueta: `el ${formatearAR(principal, { conHora: false })}` },
      ],
    }
  }

  // Sólo una hora, sin día: es HOY si todavía no pasó, mañana si ya pasó.
  if (hora.explicita) {
    const candidato = armar(hoy)
    if (aFecha(candidato).getTime() > ahora.getTime()) return { instante: candidato, conHora: true, spans }
    return { instante: armar(sumarDias(hoy, 1)), conHora: true, spans }
  }
  return null
}

/** Instante ISO → texto para una persona ("jueves 6 de agosto a las 20:00"). */
export function formatearAR(iso, { conHora = true } = {}) {
  const p = paredAR(aFecha(iso))
  const dia = `${DOW_NOMBRE[p.dow]} ${p.d} de ${MES_NOMBRE[p.m]}`
  return conHora ? `${dia} a las ${dosDig(p.hh)}:${dosDig(p.mm)}` : dia
}

/** ¿El instante ya pasó? Un recordatorio en el pasado es un dato equivocado, no un caso borde. */
export const yaPaso = (iso, ahora = new Date()) => aFecha(iso).getTime() <= ahora.getTime()

/** Quita del texto las frases temporales, dejando el CONTENIDO (qué hay que recordar/hacer). */
export function quitarTiempo(texto, spans = []) {
  let d = ` ${String(texto || '')} `
  for (const s of spans) if (s) d = d.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
  return d.replace(/\s+/g, ' ').trim()
}
