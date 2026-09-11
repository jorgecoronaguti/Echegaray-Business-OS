// LA PRESENCIA DEL DÍA — «¿está o no está?», y nada más.
//
// El dueño, 08/09/2026, textual: *«una cosa es asistir y otra la carga de horas»* y *«la versión
// mobile de carga de asistencia no tiene que referenciar horas de trabajo sino si está o no la
// persona»*.
//
// ═══ QUÉ DECIDE ESTE ARCHIVO Y QUÉ NO ═══
//
// Decide la pantalla de PRESENCIA: con qué estado nace cada casilla, qué hace «marcar a todos»,
// qué viaja a la base, qué cambió de verdad respecto de lo guardado y cómo se dice el resultado.
// NO decide horas: eso sigue siendo `jornadaPorObra.ts`, que no se toca. Las dos reglas viven
// separadas porque los dos hechos son separados — el día que se fundan, vuelve el defecto que este
// trabajo existe para deshacer.
//
// ═══ LA CASILLA NACE SIN MARCAR. ES LA MISMA LECCIÓN QUE COSTÓ 77,4 HH ═══
//
// La tentación es que nazca «presente», porque el día normal es que estén todos. Eso es
// exactamente lo que hizo `FormAsistencia` en su primera versión con las horas: un solo toque en
// Guardar escribió la jornada de nueve personas en una obra viva. Acá el costo sería peor, porque
// una presencia declarada es la prueba de que alguien constató que la persona estaba.
//
// El día normal cuesta UN toque —«Marcar a todos como presentes»—, que además NO pisa a quien ya
// se marcó como ausente: se ofrece, no se impone. Misma forma que `ponerLaJornada`.
//
// ═══ LO QUE ESTE ARCHIVO ESCRIBE EN `registros_hh`: LA JORNADA POR DEFECTO, Y NADA MÁS ═══
//
// Hasta la tarde del 08/09/2026 acá no salía ni una hora. Ese día el dueño pidió que declarar el
// presente cargue la jornada sola («9 hs los L, M, M, J y 8 hs los V»), y por eso al final del
// archivo vive `planDeHorasPorDefecto`. Lo que NO cambió: la pantalla nunca pregunta un número, y
// el defecto no pisa ni borra una hora que cargó una persona. El porqué completo está abajo, al
// lado de la función.

import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { jornadaPorDefecto } from './jornadaPorDefecto.ts'
import { esMotivo, tipoDeMotivo } from './motivoDeAusencia.ts'

/** Los tres estados que la pantalla puede afirmar. `null` en una casilla NO es un cuarto estado:
 *  es «todavía nadie dijo nada», y eso no se guarda. */
export type EstadoPresencia = 'presente' | 'ausente' | 'licencia'

export interface CasillaPresencia {
  estado: EstadoPresencia | null
  /** Clave del catálogo de motivos. Sólo tiene sentido con `ausente` o `licencia`. */
  motivo: string | null
}

/** Lo que ya está guardado en `asistencia_dia` para esa persona y ese día. */
export interface PresenciaGuardada {
  persona_id: string
  estado: EstadoPresencia
  motivo: string | null
}

/** Lo que viaja a la acción. Una marca por persona: la tabla tiene un único (persona, fecha). */
export interface MarcaPresencia {
  persona_id: string
  estado: EstadoPresencia
  motivo: string | null
}

export interface ResumenPresencia {
  presentes: number
  ausentes: number
  licencias: number
  /** Cuántas personas de la cuadrilla siguen sin que nadie diga nada de ellas. */
  sinMarcar: number
}

const VACIA: CasillaPresencia = { estado: null, motivo: null }

/**
 * A QUIÉN SE MARCA: la cuadrilla, sin los jefes de obra.
 *
 * El dueño, 08/09/2026, textual: *«los jefes de obra no tienen que marcar si han asistido o no,
 * ellos marcan a los demás»*. Quien está parado en la obra con el teléfono en la mano es el jefe:
 * pedirle que se declare presente a sí mismo es pedirle que atestigüe su propia asistencia, y una
 * declaración así no prueba nada — la de su jornada la hace Administración, con las horas.
 *
 * SÓLO SACA DE ESTA LISTA. Las horas del jefe se siguen cargando en la pantalla de horas, con todas
 * las filas: son costo de la obra igual que las demás, y esa lista no se toca.
 *
 * Quién es jefe lo decidió `esJefeDeObra(puesto)` en el servidor y viaja en `persona.esJefe`. Acá no
 * se vuelve a mirar el puesto: una segunda regla sobre la misma pregunta terminaría dejando fuera
 * de la lista a alguien distinto del que la grilla agrupa como jefe.
 */
export function personasAMarcar<T extends { persona: { esJefe?: boolean } }>(
  filas: readonly T[],
): T[] {
  return filas.filter((f) => f.persona.esJefe !== true)
}

/**
 * El estado inicial de la pantalla: lo que YA está guardado, y nada inventado para el resto.
 *
 * Reabrir el día y ver lo que uno marcó a la mañana es el caso normal —el jefe carga a las 7:30 y
 * corrige a las 10 cuando aparece el que faltaba—, así que lo guardado se muestra tal cual. Quien
 * no tiene fila guardada nace `null`: la pantalla no puede afirmar por él.
 */
export function casillasDePresencia(
  personaIds: readonly string[], guardadas: readonly PresenciaGuardada[] = [],
): Record<string, CasillaPresencia> {
  const porPersona = new Map(guardadas.map((g) => [g.persona_id, g]))
  const out: Record<string, CasillaPresencia> = {}
  for (const id of personaIds) {
    const g = porPersona.get(id)
    out[id] = g ? { estado: g.estado, motivo: g.motivo ?? null } : { ...VACIA }
  }
  return out
}

/**
 * Cuando la cuadrilla cambia sin recargar la pantalla («Traer a alguien a esta obra» hace
 * `router.refresh()` y este componente no se vuelve a montar), el recién llegado se quedaba sin
 * casilla y «marcar a todos» lo salteaba, porque ese botón recorre las casillas y no las filas.
 * Misma regla y mismo motivo que `sumarPersonasNuevas` en `jornadaPorObra.ts`.
 *
 * A quien ya tenía casilla NO se le toca nada: lo tipeado gana.
 */
export function sumarPersonasNuevasPresencia(
  previas: Record<string, CasillaPresencia>, personaIds: readonly string[],
): Record<string, CasillaPresencia> {
  const out = { ...previas }
  for (const id of personaIds) if (!out[id]) out[id] = { ...VACIA }
  return out
}

/**
 * «Marcar a todos como presentes» — el día normal en un toque.
 *
 * SÓLO llena las que están sin marcar. Pisar un «no vino» ya marcado convertiría el atajo en una
 * trampa: el jefe marca la ausencia primero (es lo que se acuerda), toca el atajo para el resto, y
 * la ausencia desaparecería sin que nada lo diga.
 */
export function marcarTodosPresentes(
  casillas: Record<string, CasillaPresencia>,
): Record<string, CasillaPresencia> {
  const out: Record<string, CasillaPresencia> = {}
  for (const [id, c] of Object.entries(casillas)) {
    out[id] = c.estado ? c : { estado: 'presente', motivo: null }
  }
  return out
}

/**
 * Elegir un motivo decide si el día es AUSENCIA o LICENCIA — no lo decide el botón que se tocó.
 *
 * La pantalla ofrece dos botones («No vino» y «Licencia») porque son dos gestos distintos en la
 * cabeza del jefe, pero la clasificación de fondo la tiene `tipoDeMotivo`, que es la misma que usa
 * la carga de horas y el bot de Mattermost desde julio. Sin esto, «No vino → enfermedad» quedaría
 * guardado como falta y «Licencia → faltó sin avisar» como licencia: dos mentiras opuestas.
 */
export function estadoSegunMotivo(
  elegido: Exclude<EstadoPresencia, 'presente'>, motivo: string | null,
): Exclude<EstadoPresencia, 'presente'> {
  if (!motivo) return elegido
  return tipoDeMotivo(motivo) === 'licencia' ? 'licencia' : 'ausente'
}

/** Lo que se le manda a la acción: las casillas con estado. Lo que quedó sin marcar no viaja —y por
 *  eso no se toca lo que esa persona ya tuviera guardado—. */
export function loQueViajaPresencia(
  casillas: Record<string, CasillaPresencia>,
): MarcaPresencia[] {
  const out: MarcaPresencia[] = []
  for (const [persona_id, c] of Object.entries(casillas)) {
    if (!c.estado) continue
    // UNA PRESENCIA NO LLEVA MOTIVO. Es lo mismo que afirma el CHECK de la tabla: sin esto, marcar
    // «no vino · lluvia» y después corregir a «está» dejaría el motivo pegado y los conteos por
    // causa mentirían para siempre.
    const motivo = c.estado === 'presente' ? null : (esMotivo(c.motivo) ? c.motivo : null)
    out.push({ persona_id, estado: c.estado, motivo })
  }
  return out
}

/**
 * QUÉ CAMBIÓ DE VERDAD. Guardar dos veces seguidas sin tocar nada no puede escribir nada.
 *
 * No es una optimización: es lo que hace que el acuse diga la verdad. Sin esto, reabrir el día y
 * tocar Guardar respondía «15 presentes» como si se hubieran declarado quince presencias nuevas, y
 * `marcado_por` se reescribía con el nombre de quien sólo pasó a mirar.
 */
export function planDePresencia(
  marcas: readonly MarcaPresencia[], guardadas: readonly PresenciaGuardada[] = [],
): { cambios: MarcaPresencia[]; intactas: number } {
  const previo = new Map(guardadas.map((g) => [g.persona_id, g]))
  const cambios: MarcaPresencia[] = []
  let intactas = 0
  for (const m of marcas) {
    const antes = previo.get(m.persona_id)
    if (antes && antes.estado === m.estado && (antes.motivo ?? null) === m.motivo) intactas += 1
    else cambios.push(m)
  }
  return { cambios, intactas }
}

/** El conteo del día. `total` es la cuadrilla que la pantalla está mostrando. */
export function resumenPresencia(
  marcas: readonly MarcaPresencia[], total: number,
): ResumenPresencia {
  const cuenta = (e: EstadoPresencia) => marcas.filter((m) => m.estado === e).length
  const presentes = cuenta('presente')
  const ausentes = cuenta('ausente')
  const licencias = cuenta('licencia')
  return {
    presentes, ausentes, licencias,
    sinMarcar: Math.max(0, total - presentes - ausentes - licencias),
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * El acuse, en la unidad de la presencia: estados contados, en palabras. NUNCA horas.
 *
 * Regla del handoff (docs/engineering/UX_ASISTENCIA_VS_HORAS.md §5): «una frase, una unidad». Un
 * acuse que dijera «15 presentes · 120 h» volvería a fundir los dos hechos en la misma línea.
 * Los ceros no se escriben: «13 presentes · 0 ausentes» invita a leer un problema donde no hay uno.
 */
export function acusePresencia(r: ResumenPresencia): string {
  const partes = [
    r.presentes > 0 ? plural(r.presentes, 'presente', 'presentes') : null,
    r.ausentes > 0 ? plural(r.ausentes, 'ausente', 'ausentes') : null,
    r.licencias > 0 ? plural(r.licencias, 'licencia', 'licencias') : null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : 'Sin nadie marcado'
}

/** Lo que falta por marcar, dicho una sola vez y sin acusar a nadie. `null` cuando está completo. */
export function avisoSinMarcar(sinMarcar: number): string | null {
  if (sinMarcar <= 0) return null
  return sinMarcar === 1
    ? 'Falta 1 persona por marcar.'
    : `Faltan ${sinMarcar} personas por marcar.`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PUENTE HACIA LAS HORAS — la única dirección permitida
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface CasillaHorasSegunPresencia {
  /** Si el campo de horas se puede tocar. Un ausente declarado no tiene horas que cargar. */
  editable: boolean
  /** La jornada como SUGERENCIA (placeholder gris), sólo para los presentes. Nunca un valor. */
  sugerencia: number | null
  /** La letra que la pantalla de horas muestra en lugar del campo: 'A' · 'L' · null. */
  letra: 'A' | 'L' | null
}

/**
 * La presencia declarada CONDICIONA la carga de horas; las horas NO declaran presencia.
 *
 * Es la única dirección que existe entre las dos pantallas, y existe porque pedirle horas a alguien
 * que el propio jefe declaró ausente hace diez minutos es pedir un dato que no puede existir. Al
 * revés está prohibido: escribir 8 horas no marca a nadie como presente — quien no fue declarado
 * queda editable y sin sugerencia, que es lo que la pantalla de horas hace hoy.
 *
 * LA SUGERENCIA SALE DE LA FECHA, NO DE LA OBRA. Hasta el 08/09/2026 era
 * `obra_canonica.jornada_horas`, que dice 9 para todas las obras y todos los días; el dueño fijó la
 * regla por día de la semana («9 de L a J y 8 los V»), y el fin de semana sin defecto. Por eso el
 * segundo parámetro es la fecha del día que se está cargando y no un número: pasar la jornada de la
 * obra sería volver a la definición vieja sin que nada lo diga.
 */
export function horasSegunPresencia(
  estado: EstadoPresencia | null, fecha: string,
): CasillaHorasSegunPresencia {
  if (estado === 'ausente') return { editable: false, sugerencia: null, letra: 'A' }
  if (estado === 'licencia') return { editable: false, sugerencia: null, letra: 'L' }
  if (estado === 'presente') {
    return { editable: true, sugerencia: jornadaPorDefecto(fecha), letra: null }
  }
  return { editable: true, sugerencia: null, letra: null }
}

/** Índice por persona de lo guardado, para que las pantallas no repitan el `find`. */
export function presenciaPorPersona(
  guardadas: readonly PresenciaGuardada[],
): Map<string, PresenciaGuardada> {
  return new Map(guardadas.map((g) => [g.persona_id, g]))
}

/**
 * A quién NO se le piden horas: los declarados ausentes o de licencia.
 *
 * Es lo que impide que «poner la jornada a los que faltan» le escriba 8,8 hs a alguien que el
 * propio jefe declaró ausente hace diez minutos — el atajo recorre casillas y no sabe nada de la
 * presencia. Sin esto, la pantalla de horas contradiría en un toque lo que la de presencia acaba
 * de afirmar, y las dos verdades quedarían guardadas a la vez.
 */
export function personasSinHoras(guardadas: readonly PresenciaGuardada[]): Set<string> {
  return new Set(guardadas.filter((g) => g.estado !== 'presente').map((g) => g.persona_id))
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS HORAS POR DEFECTO — la decisión del dueño del 08/09/2026, a la tarde
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Textual: *«que por defecto cuando se ponga la asistencia se le cargue 9 hs los L, M, M, J y 8 hs
// los V, permitiendo luego edición de esto mismo en la planilla de asistencia»*.
//
// Esto DEROGA, sólo para este caso y con esta forma, la regla de más arriba de que nada de este
// archivo toca `registros_hh`. La separación de los dos hechos sigue en pie —la pantalla pregunta
// «¿está?» y nunca un número—: lo que cambia es que declarar a alguien presente ahora ESCRIBE la
// jornada que ese día tiene por defecto, en vez de dejarla sugerida en otra pantalla a la que casi
// nadie llegaba. La consecuencia hay que decirla entera: **una presencia declarada imputa costo de
// mano de obra a la obra donde se marcó**. Por eso la escritura es la más conservadora posible:
//
//  · NO PISA NADA. Si la persona ya tiene cualquier fila de horas ese día —cargada a mano, en otra
//    obra, o una ausencia— no se inserta nada. El defecto sólo llena el vacío.
//  · SE BORRA SOLO CUANDO ES SUYO. Corregir a «no vino» borra la fila por defecto (que nadie miró)
//    y NUNCA una hora que alguien cargó a mano: eso queda como conflicto, para que lo resuelva
//    quien tiene el dato. Lo mismo que hace `combinarCeldaDia` con la celda de la grilla.
//  · EL FIN DE SEMANA NO TIENE DEFECTO. `jornadaPorDefecto` devuelve `null` el sábado y el domingo:
//    marcar presente ahí no escribe horas. Un sábado trabajado se carga a mano, como hasta hoy.
//
// Editar después en la planilla de Asistencia pisa esta fila como cualquier otra —la celda, el
// panel «corregir» y el formulario de horas hacen `update` sobre el `id`— y el `fuente_legacy` pasa
// a ser el del camino que editó. Por eso la marca de origen sirve para exactamente una cosa: saber,
// mientras nadie la tocó, que esa fila la escribió un defecto y no una persona.

/** La marca de origen de una fila escrita por este camino. Es lo único que distingue una jornada
 *  que nadie miró de una que alguien cargó — y por eso es lo único que este código puede borrar. */
export const FUENTE_HORAS_POR_DEFECTO = 'web:presencia-defecto'

/**
 * EL ORIGEN DE UNA FILA QUE UNA PERSONA CORRIGIÓ A MANO.
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (medido en producción el 11/09/2026) ═══
 *
 * El 10/09 a las 11:41 este camino escribió 9 h a las dos personas de apellido Quiroga, y a las
 * 22:08 alguien las corrigió a 13 h desde la planilla. La fila quedó con `horas = 13` y
 * `fuente_legacy = 'web:presencia-defecto'`: ningún camino de edición cambiaba el origen, aunque el
 * comentario de más arriba lo afirmara y el borrado de abajo se apoyara en eso. Consecuencia
 * concreta: si después alguien declaraba a esa persona ausente, `planDeHorasPorDefecto` leía «esto
 * lo escribió un defecto, nadie lo miró» y BORRABA las 13 h que el dueño había tecleado, sin avisar.
 */
export const FUENTE_CORRECCION_HORAS = 'web:correccion-horas'

/** Una fila de `registros_hh` de ese día, mirada sólo por lo que decide el plan. */
export interface HoraDelDia {
  id: string
  persona_id: string
  tipo_hora: string
  fuente_legacy: string | null
  /**
   * QUIÉN LA TOCÓ DESPUÉS. El trigger `set_actualizado_en` lo escribe con `auth.uid()` en CADA
   * update, así que una fila con autor es una fila que una persona modificó — sin importar por qué
   * camino ni si ese camino se acordó de cambiarle el origen. Es la evidencia que protege a las
   * filas que YA están en la base con el origen equivocado: marcarlas de nuevo a mano no es opción.
   */
  actualizado_por?: string | null
}

/**
 * ¿ESTA FILA ES UNA JORNADA POR DEFECTO QUE NADIE MIRÓ? Es lo único que este código puede borrar.
 *
 * Dos condiciones, y las dos hacen falta: que la haya escrito este camino Y que nadie la haya
 * tocado después. Con sólo la primera, una corrección a mano sobre una fila por defecto se borraba
 * como si fuera una sugerencia automática.
 */
export function esDefectoQueNadieMiro(h: HoraDelDia): boolean {
  return h.fuente_legacy === FUENTE_HORAS_POR_DEFECTO && h.actualizado_por == null
}

/** Lo que se inserta. `notas` va nula a propósito: el motivo es de la ausencia, no de la jornada. */
export interface HoraPorDefecto {
  persona_id: string
  obra_canonica_id: string
  fecha: string
  horas: number
  tipo_hora: 'normal'
  fuente_legacy: typeof FUENTE_HORAS_POR_DEFECTO
  notas: null
}

export interface PlanDeHorasPorDefecto {
  insertar: HoraPorDefecto[]
  /** `id`s de filas por defecto que quedaron sin presencia que las respalde. */
  borrar: string[]
  /** Personas declaradas ausentes que tienen horas TRABAJADAS cargadas a mano ese día. No se toca
   *  ninguna de las dos afirmaciones: se nombra el conflicto. */
  conflictos: string[]
  /** La jornada que rige ese día, o `null` el fin de semana. Viaja para que el acuse no la
   *  recalcule con otra regla. */
  jornada: number | null
}

/**
 * QUÉ HORAS ESCRIBE (O BORRA) UNA TANDA DE PRESENCIAS. Función pura: decide, no escribe.
 *
 * `horasExistentes` son las filas de ESE DÍA de esas personas, **de cualquier obra**. Filtrarlas por
 * la obra de la pantalla sería el defecto grave de acá: quien ya tiene 9 h cargadas en otra obra
 * recibiría 9 h más en ésta, y el día pasaría a costar el doble sin que nada lo diga.
 */
export function planDeHorasPorDefecto({ presencias, horasExistentes, fecha, obra }: {
  presencias: readonly MarcaPresencia[]
  horasExistentes: readonly HoraDelDia[]
  fecha: string
  obra: string
}): PlanDeHorasPorDefecto {
  const jornada = jornadaPorDefecto(fecha)
  const porPersona = new Map<string, HoraDelDia[]>()
  for (const h of horasExistentes) {
    const suyas = porPersona.get(h.persona_id)
    if (suyas) suyas.push(h)
    else porPersona.set(h.persona_id, [h])
  }

  const insertar: HoraPorDefecto[] = []
  const borrar: string[] = []
  const conflictos: string[] = []

  for (const m of presencias) {
    const suyas = porPersona.get(m.persona_id) ?? []
    if (m.estado === 'presente') {
      // CUALQUIER FILA FRENA EL DEFECTO, no sólo una trabajada. Una ausencia ya cargada para ese
      // día es una afirmación de alguien: agregarle 9 h normales al lado dejaría el mismo día
      // declarado como trabajado y como no trabajado a la vez.
      if (jornada !== null && suyas.length === 0) {
        insertar.push({
          persona_id: m.persona_id,
          obra_canonica_id: obra,
          fecha,
          horas: jornada,
          tipo_hora: 'normal',
          fuente_legacy: FUENTE_HORAS_POR_DEFECTO,
          notas: null,
        })
      }
      continue
    }
    // AUSENTE O LICENCIA. La ausencia en sí la escribe el camino que ya existe (`corregirJornada` /
    // la carga de horas): acá sólo se retira la jornada que este mismo defecto había puesto.
    const manuales = suyas.filter((h) => !esDefectoQueNadieMiro(h) && esTrabajada(h.tipo_hora))
    if (manuales.length > 0) {
      // NO SE BORRA NADA CUANDO HAY TRABAJO CARGADO A MANO — ni siquiera la fila por defecto que
      // pueda convivir con él. Alguien afirmó que esa persona trabajó y otro que no vino: borrar
      // por nuestra cuenta es elegir cuál de los dos tenía razón sin tener el dato.
      conflictos.push(m.persona_id)
      continue
    }
    for (const h of suyas) if (esDefectoQueNadieMiro(h)) borrar.push(h.id)
  }

  return { insertar, borrar, conflictos, jornada }
}

/**
 * Lo que el acuse agrega cuando el defecto escribió algo. `null` cuando no escribió nada — y ése es
 * el punto: decir «se cargaron 9 h» un sábado, o cuando todos ya tenían horas, sería exactamente el
 * tipo de verde inventado que el resto de esta pantalla evita. La frase nombra las dos jornadas
 * porque explica la REGLA, no el número de hoy, y termina diciendo dónde se corrige.
 */
export function acuseDeHorasPorDefecto(
  { insertadas, borradas, conflictos }: { insertadas: number; borradas: number; conflictos: number },
): string | null {
  const partes: string[] = []
  if (insertadas > 0) {
    partes.push('horas cargadas por defecto: 9 h (lun–jue) / 8 h (vie); editables en Asistencia')
  }
  if (borradas > 0) {
    partes.push(`se quitaron las horas por defecto de ${plural(borradas, 'persona', 'personas')}`)
  }
  if (conflictos > 0) {
    partes.push(
      `${plural(conflictos, 'persona', 'personas')} con horas cargadas a mano que quedaron como estaban: revisalo en Asistencia`,
    )
  }
  return partes.length > 0 ? partes.join(' · ') : null
}
