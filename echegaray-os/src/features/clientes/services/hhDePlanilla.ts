// LAS HH REALES DE UNA OBRA EN EL CRM SON LAS DE LA PLANILLA JORNALES (dueño, 13/09/2026).
//
// «Están mal las HH de la obra Quattropani porque no leíste de JORNALES la quincena anterior, la
// fecha de inicio y exactamente las personas involucradas; rehacer y revisar en todas las obras.»
//
// ═══ EL DEFECTO, MEDIDO ═══
//
// JORNALES, celda por celda, tiene en Quattropani sólo dos personas desde el bloque del 17/08
// (Quiroga Sebastián 191 h, Reta Ramón 187 h). La ficha le sumaba 114 h de filas cargadas desde la
// app sin respaldo en la planilla: Maldonado 80 h `web:asistencia-obra`, cuatro `web:presencia-defecto`
// de 8 h del 11/09 y Agüero 2 h `web:obra`. Mismo patrón en pisos-industriales, messina-playon,
// entrepiso e instalación eléctrica.
//
// ═══ LA REGLA ═══
//
// En el CRM —HH, inicio, personas, desglose y mano de obra— cuenta SÓLO `fuente_legacy =
// 'sheet:jornales'`. Lo cargado en la app NO se borra ni se esconde: se dice aparte, «N h cargadas en
// la app sin respaldo en JORNALES (persona · días)». Liquidación NO usa esta regla: ahí la web carga
// el día en curso a propósito, antes de que exista en la planilla.
//
// ═══ EL JEFE DE OBRA CUENTA (dueño, 13/09/2026) ═══
//
// «Maldonado es jefe de obra y tiene 80 h en Quattropani del 01 al 11/09, cargadas en la app. ¿Cuentan
// como horas de la obra? — sí, jefe de esa obra». JORNALES tiene a los jefes sólo hasta agosto; desde
// septiembre sus horas están sólo en la app. Cuenta la fila `web:*` de trabajo de un JEFE DE OBRA en
// un día que la planilla no tiene de esa persona: si JORNALES tiene el día, manda JORNALES y la fila
// de la app no se cuenta dos veces. Un obrero común cargado en la app sigue afuera.
//
// ═══ TODAS LAS HORAS TRABAJADAS CUENTAN (dueño, 14/09/2026) ═══
//
// «no son las mismas hs q se tienen q leer de la misma bd de supabase». Horas y Liquidación cuentan
// toda fila trabajada de `registros_hh`, y el CRM también: `web:presencia-defecto`, `web:obra`, las
// correcciones y los obreros cargados en la app. Quattropani 2026 daba 565 h contra 644 de la tabla.
// Medido: 0 días con JORNALES y otra fuente a la vez para la misma persona, así que sumar todo no
// duplica. Lo de arriba queda como historia de por qué existió `sin_respaldo`, que ahora sale vacío.
//
// La definición vive UNA vez en SQL (`hh_que_cuentan_en_obra`, 20260915T0200); esta función es su
// espejo para los tests y para armar la frase, y `hh-por-obra.pg.test.mjs` compara las dos.

/** El origen que manda: lo que JORNALES tiene, cuenta siempre. */
export const FUENTE_PLANILLA = 'sheet:jornales'

export const esDePlanilla = (fuente: unknown): boolean => fuente === FUENTE_PLANILLA

const TRABAJADAS = new Set(['normal', 'extra_50', 'extra_100'])

/** Una fila de `registros_hh` tal como la mira el CRM. */
export interface FilaHH {
  personaId: string | null
  nombre: string | null
  fecha: string | null
  horas: number
  tipoHora: string
  fuente: string | null
  /** La persona es jefe de obra según `esJefeDeObra(puesto)`. Ausente = no lo es. */
  esJefe?: boolean
}

/** De dónde sale una fila que cuenta. `null` = no cuenta como hora de obra. */
export type OrigenHH = 'jornales' | 'jefe_app' | 'app'

/**
 * ¿ESTA FILA CUENTA COMO HORA DE OBRA? El espejo de `hh_que_cuentan_en_obra`.
 *
 * Toda fila de JORNALES (sus ausencias y licencias marcan el desglose, no suman) y toda fila trabajada
 * de otra fuente. El origen sólo distingue al jefe para marcarlo; no decide si cuenta.
 */
export function origenesHH(filas: readonly FilaHH[]): (OrigenHH | null)[] {
  return filas.map((f) => {
    if (esDePlanilla(f.fuente)) return 'jornales'
    if (!TRABAJADAS.has(f.tipoHora)) return null
    return f.esJefe === true ? 'jefe_app' : 'app'
  })
}

/** Lo cargado en la app que la planilla no respalda, por persona. */
export interface SinRespaldo {
  personaId: string | null
  nombre: string | null
  horas: number
  /** ISO `YYYY-MM-DD`, ordenados y sin repetir. */
  dias: string[]
}

export interface HHDeObraCRM {
  hh: number | null
  personas: number
  inicio: string | null
  ultima: string | null
  sinRespaldo: SinRespaldo[]
}

/**
 * LAS HH DE UNA OBRA SEGÚN LA REGLA DEL CRM. Pura.
 *
 * `hh` es `null` cuando la planilla no tiene ninguna hora trabajada: una obra con sólo filas de la app
 * NO dice «0 h», dice «—» y al lado cuántas horas cargó la app.
 */
export function hhDeObraCRM(filas: readonly FilaHH[]): HHDeObraCRM {
  let hh: number | null = null
  const personas = new Set<string>()
  let inicio: string | null = null
  let ultima: string | null = null
  const fuera = new Map<string, SinRespaldo>()
  const origenes = origenesHH(filas)
  for (const [i, f] of filas.entries()) {
    if (!TRABAJADAS.has(f.tipoHora)) continue
    if (origenes[i] != null) {
      hh = (hh ?? 0) + f.horas
      if (f.personaId) personas.add(f.personaId)
      if (f.fecha && (!inicio || f.fecha < inicio)) inicio = f.fecha
      if (f.fecha && (!ultima || f.fecha > ultima)) ultima = f.fecha
      continue
    }
    const k = f.personaId ?? ''
    const s = fuera.get(k) ?? { personaId: f.personaId, nombre: f.nombre, horas: 0, dias: [] }
    s.horas += f.horas
    if (f.fecha && !s.dias.includes(f.fecha)) s.dias = [...s.dias, f.fecha].sort()
    fuera.set(k, s)
  }
  const sinRespaldo = [...fuera.values()].sort((a, b) => b.horas - a.horas)
  return { hh, personas: personas.size, inicio, ultima, sinRespaldo }
}

const fmt = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * «N h cargadas en la app sin respaldo en JORNALES (persona · días; …)». `null` = no hay nada afuera.
 *
 * El nombre va como lo guarda `personas` y los días en DD/MM: es lo que alguien necesita para ir a la
 * planilla y decidir si falta cargarlo ahí o si la carga de la app estaba mal.
 */
export function fraseSinRespaldo(s: readonly SinRespaldo[]): string | null {
  if (s.length === 0) return null
  const total = s.reduce((a, x) => a + x.horas, 0)
  const detalle = s.map((x) => `${x.nombre ?? 'sin persona'} ${fmt(x.horas)} h · ${x.dias.map(ddmm).join(', ')}`)
  return `${fmt(total)} h cargadas en la app sin respaldo en JORNALES (${detalle.join('; ')})`
}

/** Lo que viaja de SQL (`sin_respaldo`) convertido. Descarta lo que no trae horas. */
export function armarSinRespaldo(v: unknown): SinRespaldo[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((x): SinRespaldo[] => {
    const r = x as Record<string, unknown>
    const horas = Number(r.horas)
    if (!Number.isFinite(horas) || horas <= 0) return []
    const dias = Array.isArray(r.dias) ? r.dias.map((d) => String(d).slice(0, 10)).sort() : []
    return [{
      personaId: typeof r.persona_id === 'string' ? r.persona_id : null,
      nombre: typeof r.nombre === 'string' ? r.nombre : null,
      horas, dias,
    }]
  })
}
