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
export type PresenciaDia = 'ficho' | 'presente' | 'ausente' | 'licencia' | 'sin_marca'

/** Propiedad del DÍA, no de la persona: gobierna qué silencios son esperables.
 *
 *  `hoy` es su propio caso y no un `habil` más: el marco punteado dice «esto está pendiente», y a
 *  las 14:52 del mismo día nadie llegó tarde con nada — la jornada ni siquiera terminó. Con `habil`
 *  la columna del día en curso salía entera en cajitas punteadas (captura del dueño, 08/09/2026).
 *  Sigue siendo editable: cargar las horas de hoy es lo más común que hace esta pantalla. */
export type CalendarioDia = 'habil' | 'hoy' | 'no_laborable' | 'futuro'

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
  /** SIN NÚMERO, EL SÍMBOLO ES EL DATO Y VA EN EL CENTRO (dueño, 08/09/2026: «se ve mal la L»).
   *  Una insignia arriba tiene sentido cuando acompaña a un número; sola, en el borde superior, se
   *  lee corrida respecto de los números de sus vecinos. Con número al lado vuelve arriba. */
  centrado: boolean
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

function presenciaDe(e: EntradaCeldaDia): Omit<CapaPresencia, 'centrado'> {
  const con = (base: string) => (e.motivo ? `${base}: ${e.motivo.toLowerCase()}` : base)
  switch (e.presencia) {
    case 'ficho': return { simbolo: '●', tono: 'pos', titulo: 'Fichó' }
    // DECLARADO POR EL JEFE (`asistencia_dia`), no fichado por la persona. Mismo símbolo porque
    // para leer la grilla lo que importa es que estuvo; distinto título porque las dos cosas no se
    // prueban igual: una la marcó la persona con hora, la otra la afirmó su jefe.
    case 'presente': return { simbolo: '●', tono: 'pos', titulo: 'Presente (lo declaró el jefe)' }
    case 'ausente': return { simbolo: 'A', tono: 'neg', titulo: con('Ausencia declarada') }
    case 'licencia': return { simbolo: 'L', tono: 'neutro', titulo: con('Licencia') }
    case 'sin_marca':
      // NUNCA «no fichó». Sin marca es que no hay dato de fichaje; el fichaje desde el celular no
      // está en uso y la frase acusaría a todo el plantel.
      return {
        simbolo: '', tono: 'ninguno',
        titulo: e.dia === 'habil' || e.dia === 'hoy' ? 'Sin marca de entrada/salida' : '',
      }
  }
}

function horasDe(e: EntradaCeldaDia): CapaHoras {
  if (e.horas != null) {
    return { texto: formatearHoras(e.horas), tono: 'tinta', sinCargar: false, titulo: `${formatearHoras(e.horas)} h cargadas` }
  }
  if (e.dia === 'futuro') return { texto: '', tono: 'vacio', sinCargar: false, titulo: '' }
  // HOY NO SE RECLAMA. La jornada está corriendo: `sinCargar` es «se pasó el día y nadie cargó»,
  // y decirlo a las dos de la tarde acusa de un silencio que todavía es normal.
  if (e.dia === 'hoy') {
    return { texto: '', tono: 'vacio', sinCargar: false, titulo: 'Hoy: sin horas cargadas todavía' }
  }
  if (e.dia === 'no_laborable') return { texto: '—', tono: 'inerte', sinCargar: false, titulo: 'No laborable' }
  // El día está explicado por la capa de arriba: una ausencia o una licencia no tienen horas que
  // cargar, y pedirlas sería pedir un dato que no existe.
  if (e.presencia === 'ausente' || e.presencia === 'licencia') {
    // Sin horas y con la ausencia declarada, el día ya está explicado por la capa de arriba.
    return { texto: '', tono: 'vacio', sinCargar: false, titulo: '' }
  }
  return { texto: '', tono: 'vacio', sinCargar: true, titulo: 'Sin horas cargadas: no es una falta' }
}

export function decidirCeldaDia(e: EntradaCeldaDia): CapasCeldaDia {
  const arriba = presenciaDe(e)
  const abajo = horasDe(e)
  // La celda que no muestra ningún número no tiene de qué ser insignia: el símbolo ES la celda.
  const centrado = arriba.simbolo !== '' && abajo.texto === ''
  return {
    arriba: { ...arriba, centrado },
    abajo,
    titulo: [arriba.titulo, abajo.titulo].filter(Boolean).join(' · '),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS TRES FUENTES, COMBINADAS UNA SOLA VEZ
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Desde el 08/09/2026 hay TRES hechos distintos sobre un día y una persona, y ninguno se deriva de
// otro (docs/engineering/UX_ASISTENCIA_VS_HORAS.md · migración 20260908T1900):
//
//   PRESENCIA DECLARADA → `asistencia_dia`     · la afirma el JEFE: está / no vino / licencia.
//   FICHAJE             → `asistencia_marca`   · la marca la PERSONA, con hora.
//   HORAS               → `registros_hh`       · cuántas horas y a qué obra. Es costo.
//
// Cada pantalla que muestre un día tiene que combinarlos IGUAL, y por eso se combinan acá: tres
// pantallas con tres criterios propios producen tres respuestas distintas a la misma pregunta, y
// la que se cree es la última que alguien miró.
//
// ═══ LAS DOS REGLAS QUE ESTA FUNCIÓN EXISTE PARA SOSTENER ═══
//
//  1. PRESENCIA SIN HORAS Y HORAS SIN PRESENCIA SON VÁLIDAS, Y SE VEN DISTINTAS. La primera es el
//     jefe que marcó la cuadrilla a las 7:30 y todavía no cargó el día. La segunda es lo que pasa
//     hoy en toda la empresa. Ninguna de las dos es una falta.
//  2. UNA AUSENCIA DECLARADA CON HORAS CARGADAS EL MISMO DÍA ES UN CONFLICTO VISIBLE. Las dos
//     afirmaciones no pueden ser ciertas a la vez. La celda NO elige por nadie: lo muestra y deja
//     que lo resuelva quien sabe cuál de las dos está mal. Silenciarlo —quedarse con una y tapar la
//     otra— es lo único que no se puede hacer, porque una de las dos se liquida.

/** Lo que declaró el jefe en `asistencia_dia`. `null` = nadie dijo nada de esa persona ese día. */
export type PresenciaDeclarada = 'presente' | 'ausente' | 'licencia' | null

export interface FuentesDelDia {
  /** `asistencia_dia`. La declaración del jefe. */
  declarada: PresenciaDeclarada
  /** `asistencia_marca`: hay marca de entrada real de la persona. */
  ficho?: boolean
  /** `registros_hh`: horas TRABAJADAS cargadas. `null` = nada cargado; `0` sería otra afirmación. */
  horas: number | null
  /** Lo que la CARGA DE HORAS declaró (`tipo_hora` ausencia/licencia). Existe desde antes que
   *  `asistencia_dia` y sigue siendo válido: los días viejos sólo tienen esto. */
  enHoras?: Exclude<PresenciaDeclarada, 'presente'>
  dia: CalendarioDia
  motivo?: string | null
}

export interface CeldaCombinada {
  entrada: EntradaCeldaDia
  /** La presencia declarada y las horas del día se contradicen. */
  conflicto: boolean
  /** De dónde salió lo que se está mostrando arriba. Para el `title` y para los tests. */
  origen: 'declarada' | 'fichaje' | 'horas' | 'ninguno'
}

/**
 * Las tres fuentes → lo que la celda dibuja. Función pura: la prueban 15 casos en `celdaDia.test.ts`.
 *
 * PRECEDENCIA, y por qué en ese orden:
 *
 *  1. LO DECLARADO EN `asistencia_dia` GANA. Es el hecho construido para responder esta pregunta,
 *     y es el más fresco: alguien lo afirmó mirando a la persona.
 *  2. LO DECLARADO EN LA CARGA DE HORAS (`tipo_hora = ausencia|licencia`) le sigue. Es la misma
 *     clase de afirmación, hecha por el camino viejo, y es lo único que tienen los días anteriores
 *     al 08/09/2026. Sin esto, toda la historia perdería sus ausencias de un día para el otro.
 *  3. EL FICHAJE. Es un hecho más duro que los dos anteriores —tiene hora— pero responde otra
 *     pregunta: a qué hora entró, no si el jefe lo dio por presente. Cuando hay declaración, el
 *     fichaje se suma al título; no la reemplaza.
 *  4. NADA. `sin_marca`, que NUNCA se lee como ausente.
 *
 * Las HORAS no entran en la precedencia: no declaran presencia. Es la regla que este trabajo
 * existe para sostener — un número de horas no puede convertir un silencio en «vino».
 */
export function combinarCeldaDia(f: FuentesDelDia): CeldaCombinada {
  const ficho = f.ficho === true
  const declarado = f.declarada ?? f.enHoras ?? null
  const origenDeclarado: CeldaCombinada['origen'] = f.declarada ? 'declarada' : 'horas'

  // CONFLICTO: se declaró que no vino y sin embargo el día tiene horas trabajadas cargadas, o una
  // marca de entrada. Sólo se mide sobre lo declarado en `asistencia_dia`: `enHoras` sale de la
  // misma tabla que las horas y no puede contradecirse consigo misma.
  const noVino = f.declarada === 'ausente' || f.declarada === 'licencia'
  const conflicto = noVino && ((f.horas ?? 0) > 0 || ficho)

  if (declarado) {
    const presencia: PresenciaDia = declarado === 'presente'
      // Fichó Y lo declararon presente: se muestra el fichaje, que es el que trae la hora.
      ? (ficho ? 'ficho' : 'presente')
      : declarado
    return {
      entrada: { presencia, horas: f.horas, dia: f.dia, motivo: f.motivo ?? null },
      conflicto,
      origen: declarado === 'presente' && ficho ? 'fichaje' : origenDeclarado,
    }
  }

  if (ficho) {
    return {
      entrada: { presencia: 'ficho', horas: f.horas, dia: f.dia, motivo: null },
      conflicto: false,
      origen: 'fichaje',
    }
  }

  // NI DECLARACIÓN NI MARCA. Puede haber horas cargadas: eso se ve abajo, en su propia capa, y
  // arriba no se escribe nada. «Horas sin presencia» es una verdad válida, no una falta.
  return {
    entrada: { presencia: 'sin_marca', horas: f.horas, dia: f.dia, motivo: null },
    conflicto: false,
    origen: 'ninguno',
  }
}

/** El `title` del conflicto, en una frase que dice las dos afirmaciones y no elige. */
export function tituloDeConflicto(f: FuentesDelDia): string | null {
  if (f.declarada !== 'ausente' && f.declarada !== 'licencia') return null
  const que = f.declarada === 'licencia' ? 'licencia' : 'ausencia'
  if ((f.horas ?? 0) > 0) {
    return `Conflicto: ${que} declarada y ${formatearHoras(f.horas as number)} h cargadas el mismo día`
  }
  if (f.ficho) return `Conflicto: ${que} declarada y marca de entrada el mismo día`
  return null
}
