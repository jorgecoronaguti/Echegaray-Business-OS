// Intención de PROGRAMAR/LISTAR/FRENAR una tarea recurrente, detectada en LENGUAJE NATURAL
// desde el chat (0-API). El backend (orq.schedules + createSchedule/listSchedules/
// toggleSchedule + el timer que las dispara) ya existe; esto es lo que faltaba: que el dueño
// diga "todos los lunes a las 8 revisá cobranzas y avisame" y quede programado, SIN formulario
// ni código. Cadencia en el formato de computeNextRun: daily:HH:MM | weekly:<dow>:HH:MM |
// monthly:DD:HH:MM. Zona AR (UTC-3). Determinístico y testeable: no gasta API.

// Día → token de 3 letras que espera computeNextRun (DOW de schedules.mjs). Incluye singular,
// con/sin acento y plural para sábado/domingo (los otros ya terminan en -s en singular).
const DOW = {
  lunes: 'lun', martes: 'mar', miercoles: 'mie', 'miércoles': 'mie', jueves: 'jue', viernes: 'vie',
  sabado: 'sab', 'sábado': 'sab', sabados: 'sab', 'sábados': 'sab', domingo: 'dom', domingos: 'dom',
}
const DOW_LEGIBLE = { dom: 'domingo', lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado' }

// Gatillos de PROGRAMAR una recurrencia (raíces, robusto al voseo). SIN \b final: en JS el
// boundary es ASCII y rompe "programame" (raíz+letra) y "pará" (acento) — mismo bug que ya
// mordió en otras detecciones. El \b va solo al INICIO.
const CREATE_TRIGGER = /\b(program[aá]|agend[aá]|record[aá]|todos los|todas las|cada (d[ií]a|semana|mes|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|diariamente|semanalmente|mensualmente|todas las ma[ñn]anas|cada ma[ñn]ana)/i
// Intención de LISTAR lo programado.
const LIST_RE = /\b(qu[eé]|cu[aá]les?|mis|las)\b[^.?!]*\b(tareas?\s+programad|recurrenc|programad|agendad|agenda|schedule)|\bqu[eé]\s+(tengo|hay)\s+(programad|agendad|en la agenda)/i
// Intención de FRENAR/borrar una recurrencia.
const STOP_RE = /\b(par[aá]|paren|cancel[aá]|cancel|borr[aá]|elimin[aá]|desactiv[aá]|deshabilit[aá]|fren[aá]|dej[aá] de hacer)[^.?!]*\b(tarea|recurrenc|programad|agendad|la de|el de|schedule)/i

/** Extrae hora HH:MM (default 08:00). Reconoce "a las 8", "a las 08:30", "9hs", "8 am/pm". */
function parseHora(t) {
  const ampm = ((t.match(/\b(a\.?\s?m\.?|p\.?\s?m\.?)\b/i) || [])[0] || '').toLowerCase().replace(/[.\s]/g, '')
  const m = t.match(/\ba\s*las?\s*(\d{1,2})(?:[:.](\d{2}))?/i)
    || t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs|hrs|horas)\b/i)
  if (!m) return { hh: 8, mm: 0, span: null }
  let hh = Number(m[1]); const mm = Number(m[2] ?? 0)
  if (ampm === 'pm' && hh < 12) hh += 12
  if (ampm === 'am' && hh === 12) hh = 0
  if (hh > 23) hh = 8
  return { hh, mm, span: m[0] }
}

const hhmm = (hh, mm) => `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`

function parseCadencia(t) {
  const { hh, mm, span: horaSpan } = parseHora(t)
  const hora = hhmm(hh, mm)
  const horaLeg = ` a las ${hora}`
  const spans = horaSpan ? [horaSpan] : []

  // Mensual: "el día 5 de cada mes", "todos los meses el 5", "cada mes", "mensualmente".
  let m = t.match(/\bel\s+d[ií]a\s+(\d{1,2})\s+de\s+cada\s+mes\b/i)
    || t.match(/\b(?:todos los meses|cada mes)\b[^.?!]*?\bel\s+(\d{1,2})\b/i)
  if (m) { spans.push(m[0]); return { cadence: `monthly:${Number(m[1])}:${hora}`, legible: `el día ${Number(m[1])} de cada mes${horaLeg}`, spans } }
  if (/\b(todos los meses|cada mes|mensualmente)\b/i.test(t)) {
    const g = t.match(/\b(todos los meses|cada mes|mensualmente)\b/i); spans.push(g[0])
    return { cadence: `monthly:1:${hora}`, legible: `el día 1 de cada mes${horaLeg}`, spans }
  }

  // Semanal por día: "todos los lunes", "cada martes", "los viernes".
  m = t.match(/\b(?:todos los|cada|los|todas las)\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\b/i)
    || t.match(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\b/i)
  if (m) {
    const dow = DOW[m[1].toLowerCase()]
    if (dow) { spans.push(m[0]); return { cadence: `weekly:${dow}:${hora}`, legible: `todos los ${DOW_LEGIBLE[dow]}${horaLeg}`, spans } }
  }
  // Semanal genérico: "cada semana", "todas las semanas", "semanalmente" → lunes.
  if (/\b(todas las semanas|cada semana|semanalmente)\b/i.test(t)) {
    const g = t.match(/\b(todas las semanas|cada semana|semanalmente)\b/i); spans.push(g[0])
    return { cadence: `weekly:lun:${hora}`, legible: `todos los lunes${horaLeg}`, spans }
  }

  // Diaria: "todos los días", "cada día", "diariamente", "todas las mañanas".
  if (/\b(todos los d[ií]as|cada d[ií]a|diariamente|todas las ma[ñn]anas|cada ma[ñn]ana|todas las noches)\b/i.test(t)) {
    const g = t.match(/\b(todos los d[ií]as|cada d[ií]a|diariamente|todas las ma[ñn]anas|cada ma[ñn]ana|todas las noches)\b/i); spans.push(g[0])
    return { cadence: `daily:${hora}`, legible: `todos los días${horaLeg}`, spans }
  }
  return null
}

/** Cadencia (diaria/semanal/mensual) desde texto libre → {cadence, legible} | null.
 *  EXPORTADA: la tool programar_tarea la usa para convertir la fecha de forma determinística
 *  (los LLM erran día-de-semana/fechas). */
export function parseCadence(texto) {
  const r = parseCadencia(String(texto || '').toLowerCase())
  return r ? { cadence: r.cadence, legible: r.legible } : null
}

/** 'weekly:lun:08:00' → "todos los lunes a las 08:00" (para listar/confirmar). */
export function describeCadence(cadence) {
  const p = String(cadence || '').toLowerCase().split(':')
  const hora = p.length >= 3 ? `${p[p.length - 2]}:${p[p.length - 1]}` : '08:00'
  if (p[0] === 'daily') return `todos los días a las ${hora}`
  if (p[0] === 'weekly') return `todos los ${DOW_LEGIBLE[p[1]] || p[1]} a las ${hora}`
  if (p[0] === 'monthly') return `el día ${p[1]} de cada mes a las ${hora}`
  return String(cadence || '')
}

/** Quita de la directiva las frases temporales y los verbos de "programar", dejando la ACCIÓN. */
function extraerDirectiva(original, spans) {
  let d = ` ${original} `
  for (const s of spans) if (s) d = d.replace(s, ' ')
  d = d.replace(/\b(program[aá]\w*|agend[aá]\w*|record[aá]\w*|quiero que|necesito que|hac[eé] que|me gustar[ií]a que|por favor)/gi, ' ')
  d = d.replace(/\s+/g, ' ').trim()
  d = d.replace(/^(que|de|a|el|la|,|:|;|\.|-)\s+/i, '').trim()
  d = d.replace(/^(que|,|:|;|\.|-)\s+/i, '').trim()
  return d
}

/**
 * Analiza una directiva y devuelve la intención de agenda:
 *  { action: 'create', cadence, cadenceLegible, directive, titulo }  (cadence/directive null → falta dato)
 *  { action: 'list' }
 *  { action: 'stop', targetName }
 *  null  (no es un pedido de agenda)
 */
export function parseScheduleRequest(texto) {
  const t = String(texto || '').trim()
  if (!t) return null
  const low = t.toLowerCase()

  if (STOP_RE.test(low)) {
    const m = low.match(/\b(?:tarea|recurrencia)\s+(?:de|para)?\s*([a-záéíóúñ0-9 ]{3,40})$/i)
      || low.match(/\b(?:la|el)\s+de\s+([a-záéíóúñ0-9 ]{3,40})$/i)
      || low.match(/\bde\s+([a-záéíóúñ0-9 ]{3,40})$/i)
    return { action: 'stop', targetName: m ? m[1].trim() : null }
  }
  if (LIST_RE.test(low)) return { action: 'list' }

  // Una PREGUNTA que casualmente dice "todos los días/cada día" ("cuánto gasto todos los días")
  // NO es agenda. Solo cuenta como programar si hay verbo explícito (programá/agendá/recordá) o
  // no es interrogativa.
  const hasProgramVerb = /\b(program[aá]|agend[aá]|record[aá])/i.test(low)
  const isQuestion = /^\s*(qu[eé]|cu[aá]nto|cu[aá]l|c[oó]mo|d[oó]nde|qui[eé]n|cu[aá]ndo)\b/i.test(low) || /\?\s*$/.test(t)
  if (CREATE_TRIGGER.test(low) && !(isQuestion && !hasProgramVerb)) {
    const cad = parseCadencia(low)
    if (!cad) return { action: 'create', cadence: null, cadenceLegible: null, directive: null, titulo: null }
    const directive = extraerDirectiva(t, cad.spans)
    return {
      action: 'create',
      cadence: cad.cadence,
      cadenceLegible: cad.legible,
      directive: directive || null,
      titulo: (directive || t).slice(0, 60),
    }
  }
  return null
}
