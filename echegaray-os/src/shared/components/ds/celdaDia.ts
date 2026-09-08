// LA CELDA DE UN DÍA TIENE DOS CAPAS, Y NINGUNA HABLA POR LA OTRA.
//
// El dueño, 08/09/2026: *«una cosa es asistir y otra la carga de horas»*. Las dos verdades tienen
// dos fuentes distintas —`asistencia_marca` (la persona fichó desde su teléfono) y `registros_hh`
// (alguien le cargó horas a una obra)— y la pantalla las venía fundiendo en una: «sin horas» se
// leía como «no vino» y «no fichó» aparecía sobre gente que sí trabajó todo el día.
//
//   ARRIBA  · PRESENCIA · un ESTADO: ● fichó (verde) · A ausencia (rojo) · L licencia (neutro) ·
//             nada cuando no hay marca ni declaración. Es la única capa con color semántico.
//   ABAJO   · HORAS     · una CANTIDAD: el número en monoespaciada y tinta. Nunca lleva color de
//             estado: 8,0 h no es «bien» ni «mal», es 8,0 h.
//
// PRESENTE SIN HORAS Y HORAS SIN FICHAJE SON DOS VERDADES VÁLIDAS. La primera es alguien que marcó
// y a quien todavía no le cargaron el día; la segunda, lo que pasa en toda la empresa mientras el
// fichaje no está en uso (4 marcas de prueba en toda la historia contra cientos de registros de
// horas por mes). Ninguna de las dos es una falta, y por eso la celda sin horas lleva un marco
// punteado NEUTRO —«sin cargar»— y jamás rojo.
//
// Es una función pura para que el criterio se pruebe sin montar React: lo que decide qué se dibuja
// es esto; el componente sólo lo pinta.
//
// Referencias (docs/engineering/UX_ASISTENCIA_VS_HORAS.md): Procore separa «Timesheets» (horas)
// de «My Time / clock in-out»; Connecteam separa la solapa «Today» (quién está) de «Timesheets»
// (horas); Deputy no dice «Absent» a quien no fichó: dice «Possible Absentee» y luego «Unsubmitted».

/** El estado de presencia del día. `ficho` sale de una marca real; `ausente` y `licencia` de una
 *  declaración en `registros_hh`; `sin_marca` es la ausencia de dato, no la ausencia de la persona. */
export type PresenciaDia = 'ficho' | 'ausente' | 'licencia' | 'sin_marca'

/** Propiedad del DÍA, no de la persona: gobierna qué silencios son esperables. */
export type CalendarioDia = 'habil' | 'no_laborable' | 'futuro'

export interface EntradaCeldaDia {
  presencia: PresenciaDia
  /** `null` = nadie cargó una hora. `0` sería otra afirmación. */
  horas: number | null
  dia: CalendarioDia
  /** El motivo de la ausencia o la licencia. Va al `title`: en 44 px no entra. */
  motivo?: string | null
}

export type TonoPresencia = 'pos' | 'neg' | 'neutro' | 'ninguno'

export interface CapaPresencia {
  simbolo: '●' | 'A' | 'L' | ''
  tono: TonoPresencia
  titulo: string
}

export interface CapaHoras {
  texto: string
  /** `tinta` hay número · `inerte` hay un guión que explica el silencio · `vacio` no se escribe nada. */
  tono: 'tinta' | 'inerte' | 'vacio'
  /** Día hábil ya pasado sin horas y sin ausencia/licencia declarada: la carga está pendiente.
   *  Es lo único que dibuja el marco punteado, y es neutro. */
  sinCargar: boolean
  titulo: string
}

export interface CapasCeldaDia {
  arriba: CapaPresencia
  abajo: CapaHoras
  /** Las dos capas en una frase, para el `title` de la celda entera. */
  titulo: string
}

/** `8` → `8,0` · `7.5` → `7,5`. Una sola forma de escribir horas en la celda. */
export function formatearHoras(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function presenciaDe(e: EntradaCeldaDia): CapaPresencia {
  const con = (base: string) => (e.motivo ? `${base}: ${e.motivo.toLowerCase()}` : base)
  switch (e.presencia) {
    case 'ficho': return { simbolo: '●', tono: 'pos', titulo: 'Fichó' }
    case 'ausente': return { simbolo: 'A', tono: 'neg', titulo: con('Ausencia declarada') }
    case 'licencia': return { simbolo: 'L', tono: 'neutro', titulo: con('Licencia') }
    case 'sin_marca':
      // NUNCA «no fichó». Sin marca es que no hay dato de fichaje; el fichaje desde el celular no
      // está en uso y la frase acusaría a todo el plantel.
      return { simbolo: '', tono: 'ninguno', titulo: e.dia === 'habil' ? 'Sin marca de entrada/salida' : '' }
  }
}

function horasDe(e: EntradaCeldaDia): CapaHoras {
  if (e.horas != null) {
    return { texto: formatearHoras(e.horas), tono: 'tinta', sinCargar: false, titulo: `${formatearHoras(e.horas)} h cargadas` }
  }
  if (e.dia === 'futuro') return { texto: '', tono: 'vacio', sinCargar: false, titulo: '' }
  if (e.dia === 'no_laborable') return { texto: '—', tono: 'inerte', sinCargar: false, titulo: 'No laborable' }
  // El día está explicado por la capa de arriba: una ausencia o una licencia no tienen horas que
  // cargar, y pedirlas sería pedir un dato que no existe.
  if (e.presencia === 'ausente' || e.presencia === 'licencia') {
    return { texto: '', tono: 'vacio', sinCargar: false, titulo: '' }
  }
  return { texto: '', tono: 'vacio', sinCargar: true, titulo: 'Sin horas cargadas: no es una falta' }
}

export function decidirCeldaDia(e: EntradaCeldaDia): CapasCeldaDia {
  const arriba = presenciaDe(e)
  const abajo = horasDe(e)
  return { arriba, abajo, titulo: [arriba.titulo, abajo.titulo].filter(Boolean).join(' · ') }
}
