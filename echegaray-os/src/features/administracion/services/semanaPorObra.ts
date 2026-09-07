// LA SEMANA, POR OBRA — la grilla persona × día de `/administracion/personas?vista=asistencia`.
//
// Es la MISMA fuente que carga el jefe en `/campo/asistencia`: `registros_hh`. No hay una lectura
// «de administración» y otra «de campo» — dos consultas distintas sobre la misma jornada darían dos
// verdades sobre el mismo día, que es exactamente el defecto que este repo ya pagó.
//
// ═══ UNA PERSONA QUE CAMBIÓ DE OBRA TIENE DOS FILAS ═══
//
// La unidad de la grilla NO es la persona: es el par (persona, obra). Sumar las dos obras en una
// sola fila haría que las horas de La Estrella y las de Messina se vieran como un número solo, y la
// pregunta que esta pantalla contesta —cuánta mano de obra consumió cada obra— dejaría de tener
// respuesta. La segunda fila se marca `repetida` para que la pantalla la muestre atenuada.
//
// ═══ LOS TRES SILENCIOS NO SON EL MISMO SILENCIO ═══
//
//   sin_marcar   otros marcaron ese día y a éste no. ES UN RECLAMO: va en rojo y el pie lo nombra.
//   otra_obra    esa persona sí está marcada ese día, en otra obra. No se le reclama nada.
//   sin_dato     NADIE marcó ese día en ninguna obra. NO se puede afirmar «no se trabajó» ni
//                «nadie lo cargó»: son dos cosas distintas y la grilla no tiene con qué elegir.
//                Se dibuja «—» y el pie dice literalmente que no hay registro, sin interpretarlo.

import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { redondear } from './jornadaPorObra.ts'

export type EstadoCeldaObra =
  | 'horas'
  | 'ausente'
  | 'no_laborable'
  | 'otra_obra'
  | 'sin_marcar'
  | 'sin_dato'
  | 'futuro'

export interface CeldaObra {
  fecha: string
  estado: EstadoCeldaObra
  /** Horas trabajadas. `null` en todo lo que no sea `horas` — un cero afirmaría algo. */
  horas: number | null
}

/** Un par persona↔obra vigente en la semana, o que dejó registros en ella. */
export interface AsignacionSemana {
  persona_id: string
  nombre: string
  nota: string | null
  obra_id: string
  obra: string
}

export interface RegistroSemana {
  persona_id: string
  obra_id: string
  fecha: string
  horas: number
  tipo_hora: string
}

export interface FilaSemanaObra {
  clave: string
  persona: { id: string; nombre: string; nota: string | null }
  obra: { id: string; nombre: string }
  /** La misma persona ya apareció más arriba con otra obra. */
  repetida: boolean
  celdas: CeldaObra[]
  horas: number
  /** Las fechas que hay que reclamar. Vacío = nada que reclamar. */
  reclama: string[]
}

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

const clave = (persona: string, obra: string) => `${persona}·${obra}`

export interface EntradaSemanaObra {
  asignaciones: AsignacionSemana[]
  registros: RegistroSemana[]
  dias: string[]
  /** Feriados y no laborables de `calendario_no_laborable`. La grilla no los reclama. */
  noLaborables?: string[]
  /** Hoy, para no reclamar un día que todavía no terminó. */
  hoy: string
}

/**
 * Las filas de la grilla. Los pares salen de la UNIÓN de las asignaciones vigentes y de los
 * registros de la semana: alguien que cargó horas en una obra a la que ya no está asignado tiene
 * que verse igual — sus horas existen y son de esa obra.
 */
export function armarSemanaPorObra(e: EntradaSemanaObra): FilaSemanaObra[] {
  const noLaborables = new Set(e.noLaborables ?? [])
  const diasConDato = new Set(e.registros.map((r) => r.fecha))
  const porPar = new Map<string, RegistroSemana[]>()
  const diasDeLaPersona = new Map<string, Set<string>>()
  for (const r of e.registros) {
    const k = clave(r.persona_id, r.obra_id)
    const previos = porPar.get(k)
    if (previos) previos.push(r)
    else porPar.set(k, [r])
    const suyos = diasDeLaPersona.get(r.persona_id) ?? new Set<string>()
    suyos.add(r.fecha)
    diasDeLaPersona.set(r.persona_id, suyos)
  }

  const pares = unirPares(e.asignaciones, e.registros)
  const vistas = new Set<string>()
  return pares.map((par) => {
    const suyos = porPar.get(clave(par.persona_id, par.obra_id)) ?? []
    const celdas = e.dias.map((fecha) => celdaDe({
      fecha,
      registros: suyos.filter((r) => r.fecha === fecha),
      esNoLaborable: noLaborables.has(fecha),
      hayDatoEseDia: diasConDato.has(fecha),
      marcadoEnOtraObra: (diasDeLaPersona.get(par.persona_id) ?? new Set()).has(fecha),
      futuro: fecha > e.hoy,
    }))
    const repetida = vistas.has(par.persona_id)
    vistas.add(par.persona_id)
    return {
      clave: clave(par.persona_id, par.obra_id),
      persona: { id: par.persona_id, nombre: par.nombre, nota: par.nota },
      obra: { id: par.obra_id, nombre: par.obra },
      repetida,
      celdas,
      horas: redondear(celdas.reduce((s, c) => s + (c.horas ?? 0), 0)),
      reclama: celdas.filter((c) => c.estado === 'sin_marcar').map((c) => c.fecha),
    }
  })
}

/** Los pares (persona, obra) de la semana, ordenados por persona y con la obra como desempate. */
function unirPares(
  asignaciones: AsignacionSemana[], registros: RegistroSemana[],
): AsignacionSemana[] {
  const mapa = new Map<string, AsignacionSemana>()
  for (const a of asignaciones) mapa.set(clave(a.persona_id, a.obra_id), a)
  for (const r of registros) {
    const k = clave(r.persona_id, r.obra_id)
    if (mapa.has(k)) continue
    // Un registro sin asignación vigente: la persona TRABAJÓ ahí. El nombre se toma de cualquier
    // asignación suya; si no tiene ninguna, la fila no se puede nombrar y no se dibuja — inventarle
    // un nombre sería peor que no mostrarla, y la lectura de la pantalla lo declara.
    const conNombre = asignaciones.find((a) => a.persona_id === r.persona_id)
    if (!conNombre) continue
    mapa.set(k, { ...conNombre, obra_id: r.obra_id, obra: r.obra_id })
  }
  return [...mapa.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es') || a.obra.localeCompare(b.obra, 'es'))
}

function celdaDe({ fecha, registros, esNoLaborable, hayDatoEseDia, marcadoEnOtraObra, futuro }: {
  fecha: string
  registros: RegistroSemana[]
  esNoLaborable: boolean
  hayDatoEseDia: boolean
  marcadoEnOtraObra: boolean
  futuro: boolean
}): CeldaObra {
  const ausencia = registros.find((r) => !esTrabajada(r.tipo_hora))
  if (ausencia) return { fecha, estado: 'ausente', horas: null }
  const trabajadas = registros.filter((r) => esTrabajada(r.tipo_hora))
  if (trabajadas.length > 0) {
    return { fecha, estado: 'horas', horas: redondear(trabajadas.reduce((s, r) => s + numero(r.horas), 0)) }
  }
  if (esNoLaborable) return { fecha, estado: 'no_laborable', horas: null }
  if (futuro) return { fecha, estado: 'futuro', horas: null }
  if (marcadoEnOtraObra) return { fecha, estado: 'otra_obra', horas: null }
  if (!hayDatoEseDia) return { fecha, estado: 'sin_dato', horas: null }
  return { fecha, estado: 'sin_marcar', horas: null }
}

/** El total por columna y el de la semana. `null` en un día sin ningún dato: un 0 diría que se
 *  trabajaron cero horas, y lo que pasa es que no hay con qué contestar. */
export function totalesPorDia(filas: FilaSemanaObra[], dias: string[]): (number | null)[] {
  return dias.map((fecha, i) => {
    const celdas = filas.map((f) => f.celdas[i]).filter((c) => c?.fecha === fecha)
    if (celdas.every((c) => c.estado !== 'horas')) return null
    return redondear(celdas.reduce((s, c) => s + (c.horas ?? 0), 0))
  })
}

export const totalDeLaSemanaPorObra = (filas: FilaSemanaObra[]): number =>
  redondear(filas.reduce((s, f) => s + f.horas, 0))

/** Cuántas personas tiene cada obra en la semana. Los chips del encabezado. */
export function personasPorObra(filas: FilaSemanaObra[]): { obra_id: string; nombre: string; personas: number }[] {
  const mapa = new Map<string, { obra_id: string; nombre: string; personas: Set<string> }>()
  for (const f of filas) {
    const e = mapa.get(f.obra.id) ?? { obra_id: f.obra.id, nombre: f.obra.nombre, personas: new Set<string>() }
    e.personas.add(f.persona.id)
    mapa.set(f.obra.id, e)
  }
  return [...mapa.values()]
    .map((e) => ({ obra_id: e.obra_id, nombre: e.nombre, personas: e.personas.size }))
    .sort((a, b) => b.personas - a.personas || a.nombre.localeCompare(b.nombre, 'es'))
}

/** «1 día sin marcar» — el ámbar del encabezado. Cuenta DÍAS distintos, no celdas: tres personas sin
 *  marcar el mismo miércoles son un día reclamado, no tres. */
export function diasSinMarcar(filas: FilaSemanaObra[]): number {
  return new Set(filas.flatMap((f) => f.reclama)).size
}
