// POLÍTICA DE JORNADA — un solo lugar decide cuántas horas vale "presente".
//
// POR QUÉ NO ES UNA CONSTANTE EN LA INTERFAZ. "Presente = 8" es falso en este
// archivo. Medido sobre los 14 bloques de "Obreros 26" (30/07/2026), la moda real por
// día de la semana es:
//     lunes a jueves → 9      viernes → 8      sábado → sin moda (4 / 5,5 / 6 / 8)
//     domingo        → sin carga ordinaria
// Es la semana de 44 horas (9×4 + 8). Escribir 8 un martes habría metido un error de
// una hora por persona por día, silencioso, que el Sheet arrastra a horas, importe,
// total de quincena y línea de jornales del cash flow.
//
// Y el número tampoco es eterno: en enero el archivo usaba 8 todos los días y en
// abril pasó a 9. Por eso la política no es una tabla escrita a mano: se CALIBRA
// leyendo el bloque en el que se va a escribir — JORNALES sigue siendo la fuente de
// verdad, incluso de su propia regla. La tabla de abajo es sólo el piso para cuando
// el bloque no tiene evidencia suficiente, y en ese caso se DECLARA que se está
// usando el piso en vez de la evidencia.
//
// El sábado se deja deliberadamente sin default: el archivo no muestra una regla
// única (4; 5,5 —hay una nota del propio dueño "5,5 es el dia sabado"—; 6; 8). Un
// sábado se carga a mano. Inventar un default ahí sería precisión falsa.

import { parseHoras, celdaEscrita, normalizarClave } from './jornales-estructura.mjs'

/** Piso por día de la semana (0=domingo … 6=sábado). `null` = requiere valor manual. */
export const JORNADA_PISO = Object.freeze({
  0: null, // domingo: no hay carga ordinaria
  1: 9,
  2: 9,
  3: 9,
  4: 9,
  5: 8, // viernes
  6: null, // sábado: sin regla única en el archivo → manual
})

/** Límites de una carga manual. Configurables por entorno, nunca dispersos en la UI. */
export const HORAS_MIN = Number(process.env.ORQ_ASISTENCIA_HORAS_MIN ?? 0)
export const HORAS_MAX = Number(process.env.ORQ_ASISTENCIA_HORAS_MAX ?? 24)

/** Muestras mínimas de un día para creerle a la evidencia del bloque. */
const MUESTRAS_MIN = Number(process.env.ORQ_ASISTENCIA_MUESTRAS_MIN ?? 3)

/** Valor que escribe un ausente. Explícito y numérico: 0, nunca celda vacía (vacío
 *  significa "no hay dato", que es otra cosa). */
export const HORAS_AUSENTE = 0

export const ESTADO = Object.freeze({
  PRESENTE: 'presente',
  AUSENTE: 'ausente',
  PARCIAL: 'parcial',
})

/**
 * Calibra la jornada completa por día de la semana leyendo el bloque real.
 * Cuenta sólo celdas ESCRITAS, numéricas, > 0 y SIN fórmula (una fórmula es hora
 * extra calculada, no la jornada base). Devuelve la moda por día y las muestras que
 * la respaldan, para poder mostrar de dónde sale el número.
 */
export function calibrarJornada(grid, bloque, trabajadores, { muestrasMin = MUESTRAS_MIN } = {}) {
  const conteo = new Map() // dia_semana → Map(horas → veces)
  for (const f of bloque.fechas) {
    if (f.dia_semana == null) continue
    for (const t of trabajadores) {
      const c = (grid.filas?.[t.fila] || [])[f.col]
      if (!celdaEscrita(c) || c?.formula) continue
      const h = parseHoras(typeof c?.numero === 'number' ? c.numero : c?.valor)
      if (h == null || h <= 0) continue
      if (!conteo.has(f.dia_semana)) conteo.set(f.dia_semana, new Map())
      const m = conteo.get(f.dia_semana)
      m.set(h, (m.get(h) ?? 0) + 1)
    }
  }
  const porDia = {}
  for (let d = 0; d <= 6; d++) {
    const m = conteo.get(d)
    if (!m || !m.size) {
      porDia[d] = { horas: JORNADA_PISO[d], origen: 'piso', muestras: 0 }
      continue
    }
    const orden = [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
    const [horas, veces] = orden[0]
    const total = [...m.values()].reduce((a, b) => a + b, 0)
    // Sin muestras suficientes no se le cree a la evidencia: se declara el piso.
    if (veces < muestrasMin) porDia[d] = { horas: JORNADA_PISO[d], origen: 'piso', muestras: total }
    else porDia[d] = { horas, origen: 'calibrado', muestras: total, distribucion: orden.slice(0, 4) }
  }
  return { porDia, muestras_min: muestrasMin }
}

/**
 * Horas que corresponden a "presente" para una fecha, según la calibración.
 * `requiere_manual: true` significa que el sistema NO tiene una jornada completa
 * defendible para ese día (típicamente sábado o domingo) y hay que ingresar horas.
 */
export function horasJornadaCompleta(diaSemana, calibracion) {
  const c = calibracion?.porDia?.[diaSemana]
  if (!c || c.horas == null) {
    return { horas: null, origen: c?.origen ?? 'piso', requiere_manual: true, dia_semana: diaSemana }
  }
  return { horas: c.horas, origen: c.origen, muestras: c.muestras ?? 0, requiere_manual: false, dia_semana: diaSemana }
}

/**
 * Valida y normaliza horas ingresadas a mano (jornada parcial). Acepta coma o punto,
 * rechaza texto libre y NaN, acota al rango configurado. Devuelve `{ok, horas}` o
 * `{ok:false, motivo}` — nunca lanza, porque el llamador es una interfaz de chat.
 */
export function normalizarHorasManuales(entrada, { min = HORAS_MIN, max = HORAS_MAX } = {}) {
  if (entrada == null || String(entrada).trim() === '') return { ok: false, motivo: 'vacio' }
  const h = parseHoras(entrada)
  if (h == null) return { ok: false, motivo: 'no_numerico' }
  if (h < min) return { ok: false, motivo: 'menor_al_minimo', min }
  if (h > max) return { ok: false, motivo: 'mayor_al_maximo', max }
  return { ok: true, horas: h }
}

/**
 * Traduce un estado de asistencia a las horas que se van a ESCRIBIR en la celda.
 * Es la única traducción estado→número del sistema: la interfaz no calcula horas.
 */
export function horasDeEstado(estado, { diaSemana, calibracion, horasManuales } = {}) {
  const e = normalizarClave(estado).toLowerCase()
  if (e === ESTADO.AUSENTE) return { ok: true, horas: HORAS_AUSENTE, estado: ESTADO.AUSENTE }
  if (e === ESTADO.PARCIAL) {
    const v = normalizarHorasManuales(horasManuales)
    if (!v.ok) return { ok: false, motivo: v.motivo, min: v.min, max: v.max }
    return { ok: true, horas: v.horas, estado: ESTADO.PARCIAL }
  }
  if (e === ESTADO.PRESENTE) {
    const j = horasJornadaCompleta(diaSemana, calibracion)
    if (j.requiere_manual) return { ok: false, motivo: 'jornada_requiere_manual', dia_semana: diaSemana }
    return { ok: true, horas: j.horas, estado: ESTADO.PRESENTE, origen_jornada: j.origen }
  }
  return { ok: false, motivo: 'estado_desconocido' }
}

/** Estado que ya representa una celda con valor (para precargar la interfaz sin
 *  reinterpretar: 0 es ausente, la jornada completa es presente, el resto parcial). */
export function estadoDeHoras(horas, { diaSemana, calibracion } = {}) {
  if (horas == null) return null
  if (horas === 0) return ESTADO.AUSENTE
  const j = horasJornadaCompleta(diaSemana, calibracion)
  if (!j.requiere_manual && horas === j.horas) return ESTADO.PRESENTE
  return ESTADO.PARCIAL
}
