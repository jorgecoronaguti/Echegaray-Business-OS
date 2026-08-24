// 09 · QUIÉN ESTÁ HOY EN ESTA OBRA, POR CUADRILLA.
//
// ═══ NO HAY UNA SEGUNDA FUENTE DE PRESENCIA ═══
//
// Las marcas salen de `presencia_del_dia` —la misma vista que lee «En obra ahora» y el Resumen de
// la obra— y la pertenencia a la cuadrilla, de `obra_asignacion`, que es la misma que dibuja la
// tabla de asignaciones de esta solapa. Acá no se lee nada nuevo: se CRUZAN dos listas que la
// pantalla ya tenía y que hasta hoy no se miraban juntas.
//
// ═══ LAS TRES COSAS QUE ESTA FUNCIÓN SE NIEGA A DECIR ═══
//
// 1. «Ausente». Una persona sin marca es SIN FICHAR: incluye al que no tiene teléfono, al que no le
//    dio permiso al GPS y al que faltó. Quién faltó lo declara el jefe, no la ausencia de un dato.
// 2. «0 personas» cuando nadie marcó. Cero marcas es «sin fichar», y con cero asignados la obra no
//    tiene plantel, que es otra cosa.
// 3. Que alguien que marcó no exista. Quien fichó en esta obra sin asignación vigente aparece igual,
//    en su propio grupo: esconderlo dejaría a una persona trabajando fuera de la pantalla.

import { esTrabajada } from './tipoHora.ts'

/** Lo mínimo de una marca. Es un subconjunto de `FilaPresencia` a propósito: esta regla no tiene por
 *  qué recompilarse cuando la vista agregue una columna. */
export interface MarcaDelDia {
  persona_id: string
  nombre_completo: string
  categoria: string | null
  puesto: string | null
  entrada: string | null
  salida: string | null
  estado: 'activo' | 'cerrada' | 'falta_salida' | 'sin_registrar'
  lat: number | null
  lon: number | null
  precision_m: number | null
}

/** Lo mínimo de una asignación de obra. */
export interface AsignadoDeObra {
  persona_id: string
  persona_nombre: string | null
  rol: string
  cuadrilla: string | null
  hasta: string | null
}

export const SIN_CUADRILLA = 'Sin cuadrilla'

export interface FilaHoy {
  personaId: string
  nombre: string
  /** Categoría de convenio o puesto: lo que la persona hace acá. `null` se dice, no se rellena. */
  rol: string | null
  marca: MarcaDelDia | null
  /** Tiene asignación vigente en esta obra. Falso = fichó acá sin estar asignado. */
  asignado: boolean
}

export interface GrupoHoy {
  cuadrilla: string
  presentes: number
  asignados: number
  filas: FilaHoy[]
}

export interface HoyEnObra {
  grupos: GrupoHoy[]
  /** Con la jornada abierta ahora mismo. */
  enObra: number
  /** Marcaron y ya cerraron, o les falta la salida. */
  cerraron: number
  /** Asignados vigentes sin ninguna marca hoy. NO son ausentes. */
  sinFichar: number
  /** Marcaron en esta obra sin asignación vigente. */
  sinAsignacion: number
  asignados: number
}

const vigente = (a: AsignadoDeObra) => !a.hasta

/**
 * EL CRUCE. Una fila por persona esperada o presente, agrupada por cuadrilla.
 *
 * El grupo se ordena por nombre de cuadrilla y las filas por nombre de persona: cualquier otro orden
 * —por hora de entrada, por ejemplo— hace que la lista baile entre dos cargas de la misma pantalla y
 * que buscar a alguien sea leerla entera.
 */
export function hoyEnObra(asignaciones: AsignadoDeObra[], marcas: MarcaDelDia[]): HoyEnObra {
  const porPersona = new Map<string, MarcaDelDia>()
  for (const m of marcas) {
    // DOS MARCAS DE LA MISMA PERSONA EL MISMO DÍA: gana la que todavía está abierta. Una jornada
    // cerrada a las 12 y otra abierta a las 13 son media jornada y una jornada en curso; publicar la
    // cerrada diría que ya se fue.
    const previa = porPersona.get(m.persona_id)
    if (!previa || (previa.estado !== 'activo' && m.estado === 'activo')) porPersona.set(m.persona_id, m)
  }

  const filasPorCuadrilla = new Map<string, FilaHoy[]>()
  const asignadosPorCuadrilla = new Map<string, number>()
  const yaVistos = new Set<string>()

  for (const a of asignaciones.filter(vigente)) {
    if (yaVistos.has(a.persona_id)) continue
    yaVistos.add(a.persona_id)
    const cuadrilla = a.cuadrilla?.trim() || SIN_CUADRILLA
    const lista = filasPorCuadrilla.get(cuadrilla) ?? []
    const marca = porPersona.get(a.persona_id) ?? null
    lista.push({
      personaId: a.persona_id,
      nombre: a.persona_nombre ?? marca?.nombre_completo ?? 'sin nombre en el legajo',
      rol: marca?.categoria ?? marca?.puesto ?? a.rol,
      marca,
      asignado: true,
    })
    filasPorCuadrilla.set(cuadrilla, lista)
    asignadosPorCuadrilla.set(cuadrilla, (asignadosPorCuadrilla.get(cuadrilla) ?? 0) + 1)
  }

  let sinAsignacion = 0
  for (const [personaId, marca] of porPersona) {
    if (yaVistos.has(personaId)) continue
    sinAsignacion++
    const lista = filasPorCuadrilla.get(SIN_CUADRILLA) ?? []
    lista.push({
      personaId,
      nombre: marca.nombre_completo,
      rol: marca.categoria ?? marca.puesto,
      marca,
      asignado: false,
    })
    filasPorCuadrilla.set(SIN_CUADRILLA, lista)
  }

  const grupos: GrupoHoy[] = [...filasPorCuadrilla.entries()]
    .map(([cuadrilla, filas]) => ({
      cuadrilla,
      filas: filas.slice().sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
      presentes: filas.filter((f) => f.marca).length,
      asignados: asignadosPorCuadrilla.get(cuadrilla) ?? 0,
    }))
    .sort((x, y) => x.cuadrilla.localeCompare(y.cuadrilla, 'es'))

  const todas = grupos.flatMap((g) => g.filas)
  return {
    grupos,
    enObra: todas.filter((f) => f.marca?.estado === 'activo').length,
    cerraron: todas.filter((f) => f.marca && f.marca.estado !== 'activo').length,
    sinFichar: todas.filter((f) => f.asignado && !f.marca).length,
    sinAsignacion,
    asignados: yaVistos.size,
  }
}

/** El estado de una fila, en palabras. Es lo que va al lado del punto — nunca una pastilla. */
export function estadoDeFila(f: FilaHoy): { texto: string; tono: 'pos' | 'warn' | 'nulo' | 'pendiente' } {
  if (!f.marca) return { texto: 'sin fichar', tono: 'nulo' }
  if (f.marca.estado === 'activo') return { texto: 'en obra', tono: 'pos' }
  if (f.marca.estado === 'falta_salida') return { texto: 'falta la salida', tono: 'warn' }
  return { texto: 'cerró la jornada', tono: 'pendiente' }
}

// ═══ 09 · LO QUE EL PANEL «ATENCIÓN DE HOY» PUEDE DECIR ═══
//
// El canónico dibuja cuatro avisos y el primero de su maqueta es «Ausente con aviso». Acá NO existe:
// la ausencia declarada no está en ninguna tabla del OS —`presencia_del_dia` sólo sabe de marcas— y
// un aviso que se llenara con los que no ficharon convertiría «no tengo el dato» en «faltó», que es
// justo la afirmación que esta pantalla tiene prohibida.
//
// Los cuatro que sí existen salen todos del cruce que ya está hecho arriba: no hay una lectura más.

export type ClaveAviso = 'sin_fichar' | 'sin_asignacion' | 'falta_salida' | 'sin_cuadrilla'

export interface AvisoDelDia {
  clave: ClaveAviso
  titulo: string
  detalle: string
  n: number
  tono: 'warn' | 'neg' | 'pendiente'
}

/**
 * LOS AVISOS DEL DÍA, ordenados por lo que hay que hacer antes.
 *
 * Un aviso con 0 NO se emite. Cuatro renglones que dicen «0» son cuatro renglones que enseñan a no
 * mirar el panel, y el día que uno diga 3 va a estar tan gris como los otros tres.
 */
export function avisosDelDia(r: HoyEnObra): AvisoDelDia[] {
  const faltaSalida = r.grupos
    .flatMap((g) => g.filas)
    .filter((f) => f.marca?.estado === 'falta_salida').length
  const sinCuadrilla = r.grupos.find((g) => g.cuadrilla === SIN_CUADRILLA)
  // El grupo SIN_CUADRILLA junta dos cosas distintas: los asignados a la obra sin cuadrilla y los
  // que ficharon sin asignación. Sólo los primeros son «sin cuadrilla»; los segundos ya tienen su
  // propio aviso y contarlos dos veces inflaría el panel con el mismo problema dicho dos veces.
  const huerfanos = sinCuadrilla?.asignados ?? 0

  const todos: AvisoDelDia[] = [
    {
      clave: 'sin_asignacion',
      titulo: 'Fichó sin asignación',
      detalle: 'trabaja acá y no figura en el plantel de la obra',
      n: r.sinAsignacion,
      tono: 'neg',
    },
    {
      clave: 'falta_salida',
      titulo: 'Falta la salida',
      detalle: 'jornada abierta de un día anterior',
      n: faltaSalida,
      tono: 'warn',
    },
    {
      clave: 'sin_fichar',
      // NO dice «ausente». Incluye al que no tiene teléfono y al que no le dio permiso al GPS.
      titulo: 'Sin fichar',
      detalle: 'asignado a la obra y todavía sin marca',
      n: r.sinFichar,
      tono: 'pendiente',
    },
    {
      clave: 'sin_cuadrilla',
      titulo: 'Sin cuadrilla',
      detalle: 'asignado a la obra entera, sin frente',
      n: huerfanos,
      tono: 'pendiente',
    },
  ]
  return todos.filter((a) => a.n > 0)
}

/** Lo mínimo de un registro de horas para esta cuenta. Subconjunto de `RegistroHH` a propósito. */
export interface HoraDelDia {
  persona_id: string | null
  fecha: string | null
  horas: number
  tipo_hora: string
}

export interface HorasDeHoy {
  porPersona: Map<string, number>
  /** `null` cuando NO hay ni un registro imputado a esa fecha. Nunca 0: la jornada en curso casi
   *  siempre se imputa al cierre, y un 0 acá diría «hoy no se trabajó» a las diez de la mañana. */
  total: number | null
}

/**
 * LAS HORAS IMPUTADAS AL DÍA — que no son la asistencia.
 *
 * Fichar y imputar son dos hechos distintos: se puede estar en obra sin una sola HH cargada, y se
 * pueden cargar HH de alguien que nunca fichó. Por eso esta columna dice «sin imputar» y no «0», y
 * por eso el rótulo del KPI habla de HH IMPUTADAS y no de «HH de hoy».
 *
 * Sólo cuentan las horas TRABAJADAS: una ausencia tiene horas cargadas y no es trabajo.
 */
export function horasDeHoy(registros: readonly HoraDelDia[], fecha: string): HorasDeHoy {
  const porPersona = new Map<string, number>()
  let total: number | null = null
  for (const r of registros) {
    // Sin fecha el registro es del Sheet legacy de JORNALES —semanal— y no se puede atribuir a un
    // día. Repartirlo por siete sería fabricar el dato que falta.
    if (r.fecha !== fecha) continue
    if (!esTrabajada(r.tipo_hora)) continue
    total = (total ?? 0) + r.horas
    if (r.persona_id) porPersona.set(r.persona_id, (porPersona.get(r.persona_id) ?? 0) + r.horas)
  }
  return { porPersona, total }
}

// ═══ 09 · EL BUSCADOR Y LOS FILTROS DE LA BANDA (canónico 09) ═══
//
// El canónico pone sobre la lista un campo de búsqueda y cuatro pastillas con su cuenta. No es un
// adorno: la obra grande tiene cuatro cuadrillas y treinta personas, y la pregunta de las siete de
// la mañana —«¿quién no fichó?»— se contestaba leyendo las cuatro listas enteras.
//
// LAS PASTILLAS SON LAS DEL DATO, NO LAS DEL DIBUJO. La maqueta ofrece «Ausentes»; acá no existe
// —ver arriba— y en su lugar van las dos excepciones que sí son hechos: los que CERRARON la
// jornada y los que ficharon SIN ASIGNACIÓN. Una pastilla llamada «ausentes» llena con los que no
// ficharon convertiría «no tengo el dato» en una acusación.

export type FiltroHoy = 'todo' | 'en_obra' | 'sin_fichar' | 'cerraron' | 'sin_asignacion'

export const FILTROS_HOY: { clave: FiltroHoy; label: string }[] = [
  { clave: 'todo', label: 'Todos' },
  { clave: 'en_obra', label: 'En obra' },
  { clave: 'sin_fichar', label: 'Sin fichar' },
  { clave: 'cerraron', label: 'Cerraron' },
  { clave: 'sin_asignacion', label: 'Sin asignación' },
]

/** Si una fila cae dentro del filtro. Una sola definición: la usan el conteo de la pastilla y el
 *  filtrado de la lista, y si fueran dos, la pastilla diría 3 y la lista mostraría 2. */
export function caeEnFiltro(f: FilaHoy, filtro: FiltroHoy): boolean {
  if (filtro === 'todo') return true
  if (filtro === 'en_obra') return f.marca?.estado === 'activo'
  if (filtro === 'sin_fichar') return f.asignado && !f.marca
  if (filtro === 'cerraron') return Boolean(f.marca) && f.marca!.estado !== 'activo'
  return !f.asignado
}

/** El texto compara contra el nombre y el rol, en minúsculas. Es lo que hace el canónico y lo que
 *  hace falta: se busca «tello» o se busca «ayudante». */
const coincideTexto = (f: FilaHoy, q: string) =>
  q === '' || `${f.nombre} ${f.rol ?? ''}`.toLowerCase().includes(q)

/**
 * LAS FILAS QUE SE VEN. El grupo conserva SUS cuentas —presentes y asignados son la realidad de la
 * cuadrilla, no de la búsqueda—: recalcularlas sobre lo filtrado haría que buscar «Tello» dijera
 * que la Cuadrilla 1 tiene una sola persona.
 *
 * Un grupo sin filas visibles no se dibuja: una cabecera de cuadrilla vacía se lee como una
 * cuadrilla sin nadie, que es un hecho distinto de «nadie de esta cuadrilla coincide».
 */
export function filtrarHoy(
  grupos: readonly GrupoHoy[], { texto = '', filtro = 'todo' }: { texto?: string; filtro?: FiltroHoy } = {},
): GrupoHoy[] {
  const q = texto.trim().toLowerCase()
  return grupos
    .map((g) => ({ ...g, filas: g.filas.filter((f) => coincideTexto(f, q) && caeEnFiltro(f, filtro)) }))
    .filter((g) => g.filas.length > 0)
}

/** Cuántas hay detrás de cada pastilla. Sobre TODAS las filas, no sobre las que quedaron a la
 *  vista: un contador que se recalcula con el filtro puesto dice «Sin fichar 0» justo cuando se
 *  está mirando el filtro de en obra. */
export function cuentasDeHoy(grupos: readonly GrupoHoy[]): Record<FiltroHoy, number> {
  const todas = grupos.flatMap((g) => g.filas)
  return {
    todo: todas.length,
    en_obra: todas.filter((f) => caeEnFiltro(f, 'en_obra')).length,
    sin_fichar: todas.filter((f) => caeEnFiltro(f, 'sin_fichar')).length,
    cerraron: todas.filter((f) => caeEnFiltro(f, 'cerraron')).length,
    sin_asignacion: todas.filter((f) => caeEnFiltro(f, 'sin_asignacion')).length,
  }
}
