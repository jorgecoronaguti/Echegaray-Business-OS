// CARGAR ASISTENCIA — una obra, un día, las horas de cada uno. La aritmética, sin base ni sesión.
//
// ═══ POR QUÉ ESTO NO ES UNA TABLA NUEVA ═══
//
// El OS ya tiene TRES hechos distintos sobre el tiempo de una persona y ninguno se deriva de otro:
// `asistencia_marca` es la PRESENCIA que ficha el propio empleado; `comunicacion.asistencia_novedades`
// es el motivo de una jornada incompleta que carga el bot hacia el Sheet JORNALES; y `registros_hh`
// es la HORA IMPUTADA A UNA OBRA. Lo que el jefe carga acá —obra, día, horas de cada uno— es
// exactamente el tercero, así que va a `registros_hh` y no inventa un cuarto lugar donde vivan las
// horas de la misma jornada.
//
// ═══ SIN MARCAR NO ES AUSENTE ═══
//
// La regla que gobierna todo este archivo. Una fila sin registro es IGNORANCIA, no una falta: se
// devuelve `sin_marcar`, el pie la reclama y nadie la cuenta como ausencia. Un ausente es una
// decisión de alguien y deja una fila propia con `tipo_hora='ausencia'`.
//
// ═══ LA AUSENCIA TIENE HORAS Y NO ES TRABAJO ═══
//
// `registros_hh` exige `horas > 0`, así que el ausente NO se guarda como cero: se guarda con las
// horas de la jornada y `tipo_hora='ausencia'`, que es la semántica que `tipoHora.ts` ya declara
// («una ausencia tiene horas y no es trabajo»). Por eso el total del pie suma sólo las trabajadas:
// un ausente con 8,8 registradas aporta 0 al total del día.

import { esTrabajada } from '../../obras/services/tipoHora.ts'

/** Lo que la pantalla puede decir de una persona en un día. */
export type EstadoJornada = 'presente' | 'ausente' | 'sin_marcar'

/** Alguien asignado a la obra ese día. `nota` es el renglón gris debajo del nombre. */
export interface PersonaDeLaObra {
  persona_id: string
  nombre: string
  /** El rol de la asignación, o la categoría si no hay rol. Nunca se inventa. */
  nota: string | null
}

/** Una fila de `registros_hh` de esa obra y ese día, tal como vuelve de la base. */
export interface RegistroDelDia {
  id: string
  persona_id: string
  fecha: string
  horas: number
  tipo_hora: string
  notas: string | null
}

export interface FilaJornada {
  persona: PersonaDeLaObra
  estado: EstadoJornada
  /** Horas TRABAJADAS ya cargadas. `null` cuando no hay nada cargado — no es cero. */
  horas: number | null
  /** Lo que la casilla trae puesto: lo cargado si existe, y si no la jornada de la obra. */
  propuesta: number
  /** El registro que se va a corregir al guardar. `null` = hay que insertar. */
  registroId: string | null
  /** La observación cargada con las horas (el «turno médico» del diseño). */
  observacion: string | null
}

export interface ResumenJornada {
  presentes: number
  ausentes: number
  sinMarcar: number
  /** Horas trabajadas del día. Las de un ausente no entran. */
  horas: number
  /** Los nombres que quedaron sin marcar, en el orden de la lista. */
  faltan: string[]
}

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Redondeo a dos decimales sin arrastrar el error binario: 8,8 × 3 tiene que decir 26,4 y no 26,400000000000002. */
export const redondear = (n: number): number => Math.round(n * 100) / 100

/**
 * Las filas de la pantalla: una por persona asignada, con lo que ya está cargado encima.
 *
 * `jornada` es la jornada pactada de la obra (`obra_canonica.jornada_horas`), no una constante:
 * un 8 escrito acá sería una cuarta definición de cuánto dura un día de trabajo.
 */
export function armarJornada({ personas, registros, jornada }: {
  personas: PersonaDeLaObra[]
  registros: RegistroDelDia[]
  jornada: number
}): FilaJornada[] {
  const porPersona = new Map<string, RegistroDelDia[]>()
  for (const r of registros) {
    const previos = porPersona.get(r.persona_id)
    if (previos) previos.push(r)
    else porPersona.set(r.persona_id, [r])
  }

  return personas.map((persona) => {
    const suyos = porPersona.get(persona.persona_id) ?? []
    // El ausente gana sobre cualquier otra fila del día: si alguien declaró que no vino, la
    // pantalla no puede mostrar «presente» porque además exista una imputación vieja.
    const ausencia = suyos.find((r) => !esTrabajada(r.tipo_hora))
    const trabajadas = suyos.filter((r) => esTrabajada(r.tipo_hora))
    if (ausencia) {
      return {
        persona,
        estado: 'ausente' as const,
        horas: 0,
        propuesta: jornada,
        registroId: ausencia.id,
        observacion: ausencia.notas,
      }
    }
    if (trabajadas.length === 0) {
      return {
        persona, estado: 'sin_marcar' as const, horas: null, propuesta: jornada,
        registroId: null, observacion: null,
      }
    }
    const horas = redondear(trabajadas.reduce((s, r) => s + numero(r.horas), 0))
    return {
      persona,
      estado: 'presente' as const,
      horas,
      propuesta: horas,
      // Con más de una fila trabajada (normales + extras cargadas aparte) no hay UN registro que
      // corregir: se manda `null` y la acción resuelve el conjunto. Corregir la primera y dejar la
      // otra en pie duplicaría las horas del día en silencio.
      registroId: trabajadas.length === 1 ? trabajadas[0].id : null,
      observacion: trabajadas.find((r) => r.notas)?.notas ?? null,
    }
  })
}

/** El pie: «7 presentes · 1 no vino · 59 hs» y a quién falta marcar. */
export function resumenJornada(filas: FilaJornada[]): ResumenJornada {
  return {
    presentes: filas.filter((f) => f.estado === 'presente').length,
    ausentes: filas.filter((f) => f.estado === 'ausente').length,
    sinMarcar: filas.filter((f) => f.estado === 'sin_marcar').length,
    horas: redondear(filas.reduce((s, f) => s + (f.estado === 'presente' ? (f.horas ?? 0) : 0), 0)),
    faltan: filas.filter((f) => f.estado === 'sin_marcar').map((f) => f.persona.nombre),
  }
}

/** «Falta marcar a Molina» / «Faltan marcar 3». Vacío cuando no falta nadie: el pie no advierte de nada. */
export function avisoDeFaltantes(faltan: string[]): string | null {
  if (faltan.length === 0) return null
  if (faltan.length === 1) return `Falta marcar a ${faltan[0]}`
  if (faltan.length === 2) return `Falta marcar a ${faltan[0]} y ${faltan[1]}`
  return `Faltan marcar ${faltan.length} personas`
}

/**
 * Lo que el jefe tipeó en una casilla, convertido en horas.
 *
 * La coma se acepta: en un teclado en español es lo que sale. En blanco devuelve `null` —dejar de
 * marcar no es marcar cero—, y un valor imposible devuelve el motivo para que la casilla lo diga en
 * vez de guardar cualquier cosa.
 */
export function leerHoras(bruto: string): { horas: number | null; error: string | null } {
  const t = bruto.trim().replace(',', '.')
  if (t === '') return { horas: null, error: null }
  const n = Number(t)
  if (!Number.isFinite(n)) return { horas: null, error: 'Poné un número de horas' }
  if (n < 0) return { horas: null, error: 'Las horas no pueden ser negativas' }
  if (n === 0) return { horas: null, error: 'Cero horas no es una marca: si no vino, tocá la A' }
  if (n > 24) return { horas: null, error: 'En un día no se pueden trabajar más de 24 horas' }
  return { horas: redondear(n), error: null }
}

/** Lo que sobra de la jornada pactada. No dice «extra al 50%»: el recargo lo elige quien liquida. */
export function sobreLaJornada(horas: number, jornada: number): number {
  return horas > jornada ? redondear(horas - jornada) : 0
}
