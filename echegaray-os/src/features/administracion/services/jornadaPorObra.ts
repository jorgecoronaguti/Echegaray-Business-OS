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
  /**
   * ¿Es jefe de obra? Lo decide `esJefeDeObra(persona_directorio.puesto)` en el servidor — el MISMO
   * criterio que agrupa la grilla de quincena y el Plantel, no una segunda regla.
   *
   * OPCIONAL: quien arma filas a mano (los tests, o una lectura donde el puesto no viajó) no afirma
   * nada sobre el puesto de nadie. `undefined` se lee como «no es jefe» a los efectos de la lista
   * de horas, que incluye a todos igual; lo que decide la de presencia es `personasAMarcar`.
   */
  esJefe?: boolean
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

/** Horas en el locale del lugar: `8,8`, no `8.8`. El teclado del teléfono escribe coma y
 *  `leerHoras` la acepta, así que lo que se muestra es exactamente lo que se puede volver a tipear. */
export const hs = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** Lo que sobra de la jornada pactada. No dice «extra al 50%»: el recargo lo elige quien liquida. */
export function sobreLaJornada(horas: number, jornada: number): number {
  return horas > jornada ? redondear(horas - jornada) : 0
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ESTADO DE LAS CASILLAS DE `/campo/asistencia`
//
// Vive acá y no en el componente por lo que costó tenerlo allá: la primera versión hacía nacer la
// casilla CON la jornada puesta como valor, y con eso `sin_marcar` se volvió inalcanzable —toda
// fila nacía «presente»— y un solo toque en Guardar escribía la jornada completa de las nueve
// personas. Así se fabricaron 77,4 HH en una obra viva: un número tipeado, ocho filas por default.
//
// Un comentario que dice «sin marcar no es ausente» no es un control. Esto sí: son funciones puras
// con sus pruebas, y si el default vuelve, se ponen rojas.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface CasillaJornada {
  /** Lo tipeado. Vacío = sin marcar. NUNCA se precarga con la jornada. */
  texto: string
  /** `true` sólo si alguien tocó la «A». */
  ausente: boolean
  /** POR QUÉ no vino. Clave del catálogo, elegida en un SEGUNDO toque: marcar que alguien faltó y
   *  no saber todavía por qué es honesto, y exigir la causa para poder guardar haría que se elija
   *  cualquiera con tal de cerrar el formulario. */
  motivo?: string | null
}

export type VistaCasilla = {
  persona_id: string
  estado: EstadoJornada
  horas: number | null
  error: string | null
  motivo: string | null
}

/**
 * Cómo nacen las casillas al abrir el día.
 *
 * LO YA CARGADO SE MUESTRA; LO QUE NO ESTÁ, NO SE INVENTA. Una fila sin registro nace VACÍA y en
 * `sin_marcar`: la jornada de la obra se ofrece como sugerencia visual (`placeholder`) y con el
 * botón «poner la jornada», que es un acto de alguien. Precargarla como VALOR convierte el silencio
 * de ocho personas en una afirmación que nadie hizo.
 */
export function casillasIniciales(filas: FilaJornada[]): Record<string, CasillaJornada> {
  const m: Record<string, CasillaJornada> = {}
  for (const f of filas) {
    m[f.persona.persona_id] = f.estado === 'ausente'
      ? { texto: '', ausente: true, motivo: f.observacion }
      : { texto: f.estado === 'presente' && f.horas !== null ? hs(f.horas) : '', ausente: false }
  }
  return m
}

/**
 * Las casillas después de que la cuadrilla CAMBIÓ sin recargar la pantalla.
 *
 * 08/09/2026 · Traer a alguien a la obra hace `router.refresh()`: el servidor devuelve una fila
 * más, pero `useState` no vuelve a correr su inicializador y esa persona quedaba sin casilla. Se
 * veía bien —`estadoDeCasilla(id, undefined)` la dibuja vacía, que es lo correcto— y «poner la
 * jornada a los que faltan» la SALTEABA, porque ese botón recorre las casillas que existen y no las
 * filas. El recién llegado era el único al que había que tipearle las horas a mano.
 *
 * LO YA TIPEADO NO SE PISA: quien vino escribiendo horas y trae a un compañero no puede perderlas.
 * Y quien dejó de estar en la cuadrilla se va: su casilla no puede seguir viajando en el guardado.
 */
export function sumarPersonasNuevas(
  casillas: Record<string, CasillaJornada>, filas: FilaJornada[],
): Record<string, CasillaJornada> {
  const base = casillasIniciales(filas)
  const m: Record<string, CasillaJornada> = {}
  for (const id of Object.keys(base)) m[id] = casillas[id] ?? base[id]
  return m
}

/** El estado de una casilla, leído de lo que hay escrito en ella. */
export function estadoDeCasilla(persona_id: string, c: CasillaJornada | undefined): VistaCasilla {
  if (c?.ausente) {
    return { persona_id, estado: 'ausente', horas: null, error: null, motivo: c.motivo ?? null }
  }
  const { horas, error } = leerHoras(c?.texto ?? '')
  return {
    persona_id,
    estado: horas === null ? 'sin_marcar' : 'presente',
    horas,
    error,
    motivo: null,
  }
}

/** «Poner la jornada a todos»: llena SÓLO las casillas vacías. Lo ya escrito no se pisa — el que
 *  corrigió a González a 5 no puede perder la corrección por tocar un botón general. */
export function ponerLaJornada(
  casillas: Record<string, CasillaJornada>, jornada: number,
): Record<string, CasillaJornada> {
  if (!(jornada > 0)) return casillas
  const m: Record<string, CasillaJornada> = {}
  for (const [id, c] of Object.entries(casillas)) {
    m[id] = c.ausente || c.texto.trim() !== '' ? c : { ...c, texto: hs(jornada) }
  }
  return m
}

/**
 * QUÉ VIAJA AL SERVIDOR. Sólo lo confirmado: un número escrito o una «A» tocada.
 *
 * Lo que queda `sin_marcar` NO viaja, y por eso guardar el día no puede convertir un silencio en
 * una afirmación. Una casilla con un valor imposible tampoco viaja: se corrige antes.
 */
export function loQueViaja(
  vista: VistaCasilla[], jornada: number,
): { persona_id: string; estado: 'presente' | 'ausente'; horas: number; motivo?: string | null }[] {
  const salida: {
    persona_id: string; estado: 'presente' | 'ausente'; horas: number; motivo?: string | null
  }[] = []
  for (const v of vista) {
    if (v.error) continue
    if (v.estado === 'ausente') {
      // SIN JORNADA PACTADA LA AUSENCIA NO SE PUEDE MEDIR, y `registros_hh` exige horas > 0. No se
      // descarta en silencio: `ausenciasSinJornada` la nombra para que la pantalla lo diga.
      if (jornada > 0) {
        salida.push({ persona_id: v.persona_id, estado: 'ausente', horas: jornada, motivo: v.motivo })
      }
      continue
    }
    if (v.estado === 'presente' && v.horas !== null) {
      salida.push({ persona_id: v.persona_id, estado: 'presente', horas: v.horas })
    }
  }
  return salida
}

/** A quiénes se marcó ausentes pero no se puede registrar porque la obra no tiene jornada pactada.
 *  Se nombran: descartarlas en silencio con un acuse de éxito es peor que no dejar marcarlas. */
export function ausenciasSinJornada(vista: VistaCasilla[], jornada: number): string[] {
  return jornada > 0 ? [] : vista.filter((v) => v.estado === 'ausente').map((v) => v.persona_id)
}
