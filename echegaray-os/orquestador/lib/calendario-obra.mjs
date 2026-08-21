// EL CALENDARIO DE LA OBRA — convierte entre fechas y días TRABAJADOS.
//
// El cronograma no se calcula en días corridos. Una tarea de 5 días que arranca un jueves termina
// el miércoles siguiente, no el lunes, y si el lunes es feriado termina el jueves. Hacer esa cuenta
// con `fecha + n` es la manera más silenciosa de correr una obra entera tres días.
//
// Este módulo es PURO: no consulta la base. Recibe qué días de la semana se trabajan y qué fechas
// no se trabajan, y con eso responde. El motor de cronograma trabaja sobre ÍNDICES de día hábil
// (0, 1, 2…) y sólo al final vuelve a fechas — así la aritmética del camino crítico no tiene que
// saber nada de feriados.

/** ISO de una fecha, sin zona horaria: la fecha de obra es un día del calendario, no un instante. */
export const aISO = (d) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/** Día de la semana en numeración isodow: 1 lunes … 7 domingo. Coincide con `obra_canonica.dias_habiles`. */
export function isodow(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const n = new Date(Date.UTC(a, m - 1, d)).getUTCDay() // 0 domingo … 6 sábado
  return n === 0 ? 7 : n
}

export function sumarDias(iso, n) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

export class CalendarioObra {
  /**
   * @param {number[]} diasHabiles  isodow de los días que se trabajan. Por defecto lunes a viernes.
   * @param {Iterable<string>} noLaborables  fechas ISO que no se trabajan (feriados, paros).
   */
  constructor(diasHabiles = [1, 2, 3, 4, 5], noLaborables = []) {
    this.diasHabiles = new Set(diasHabiles)
    this.noLaborables = new Set([...noLaborables].map(aISO))
    if (this.diasHabiles.size === 0) throw new Error('una obra sin ningún día hábil no puede planificarse')
  }

  esHabil(iso) {
    return this.diasHabiles.has(isodow(iso)) && !this.noLaborables.has(aISO(iso))
  }

  /** El primer día hábil desde `iso` inclusive. Si `iso` ya es hábil, es `iso`. */
  proximoHabil(iso) {
    let f = aISO(iso)
    for (let i = 0; i < 400; i++) {
      if (this.esHabil(f)) return f
      f = sumarDias(f, 1)
    }
    throw new Error(`no encontré un día hábil en 400 días desde ${iso}: revisá los días hábiles de la obra`)
  }

  /** Suma `n` días HÁBILES. n=0 devuelve el próximo hábil; n negativo camina para atrás. */
  sumarHabiles(iso, n) {
    let f = this.proximoHabil(iso)
    const paso = n < 0 ? -1 : 1
    let quedan = Math.abs(n)
    let vueltas = 0
    while (quedan > 0) {
      f = sumarDias(f, paso)
      if (this.esHabil(f)) quedan--
      if (++vueltas > 4000) throw new Error('el calendario no avanza: hay demasiados días no laborables seguidos')
    }
    return f
  }

  /** Días hábiles entre dos fechas, contando ambas puntas. Devuelve 0 si `hasta` es anterior. */
  habilesEntre(desde, hasta) {
    let f = aISO(desde)
    const fin = aISO(hasta)
    if (fin < f) return 0
    let n = 0
    let vueltas = 0
    while (f <= fin) {
      if (this.esHabil(f)) n++
      f = sumarDias(f, 1)
      if (++vueltas > 40000) throw new Error('rango de fechas absurdo')
    }
    return n
  }

  /**
   * Índice de día hábil de `iso` contando desde `origen` (origen = 0). Si `iso` cae en un día no
   * laborable, devuelve el índice del próximo hábil: una tarea no puede empezar un domingo.
   *
   * Puede ser NEGATIVO, y tiene que poder serlo: una actividad que arrancó antes del origen del
   * cronograma existe igual. Devolver 0 la aplastaría contra el primer día y el plan entero se
   * dibujaría arrancando hoy — que es exactamente el error que esto vino a arreglar.
   */
  indice(origen, iso) {
    const f = this.proximoHabil(iso)
    const o = aISO(origen)
    if (f >= o) return this.habilesEntre(o, f) - 1
    return -(this.habilesEntre(f, o) - 1)
  }

  /** La vuelta: qué fecha es el día hábil número `i` contando desde `origen`. Acepta i negativo. */
  fecha(origen, i) {
    return this.sumarHabiles(origen, i)
  }
}
