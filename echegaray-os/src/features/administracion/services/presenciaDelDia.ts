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
// ═══ NADA DE ACÁ TOCA `registros_hh` ═══
//
// Ni una hora. Lo único que sale de este archivo es qué escribir en `asistencia_dia`.

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
