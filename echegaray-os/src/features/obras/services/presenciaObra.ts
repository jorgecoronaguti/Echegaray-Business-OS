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
