// EL REGISTRO CRONOLÓGICO DE UNA PERSONA — sus días, agrupados por semana y por mes.
//
// El dueño: *«que cada persona vaya quedando registro cronológico propio»*. Eso no es una tabla
// nueva: es `registros_hh` filtrada por persona y LEÍDA en orden, con los cortes que hacen que un
// listado de sesenta filas se pueda usar. Guardar un total por semana al lado de sus filas sería la
// segunda versión del mismo número, y el día que se corrija una imputación dejarían de coincidir.
//
// ═══ EL CORTE ES POR SEMANA ISO, LA MISMA QUE YA DERIVA POSTGRES ═══
//
// `registros_hh.fecha_inicio_semana` la calcula el trigger `registros_hh_normalizar` desde la fecha.
// Se usa ÉSA y no una semana calculada acá: dos definiciones de «lunes» discrepan un día cada
// domingo y nadie lo ve hasta que los totales no cierran.
//
// ═══ UNA AUSENCIA TIENE HORAS Y NO ES TRABAJO ═══
//
// Los totales de cada tramo cuentan sólo las trabajadas. Las ausencias se cuentan aparte, con su
// número: esconderlas haría que un mes con cuatro faltas se leyera igual que uno sin ninguna.

import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { etiquetaDeMotivo } from './motivoDeAusencia.ts'
import type { ImputacionHH } from '../types/index.ts'

export interface TramoCronologico {
  /** El lunes de la semana, o el primer día del mes: es la clave del corte. */
  clave: string
  rotulo: string
  registros: ImputacionHH[]
  /** Horas TRABAJADAS del tramo. Las ausencias no entran. */
  horas: number
  /** Cuántos días distintos se declararon ausentes en el tramo. */
  ausencias: number
  /** Cuántos días distintos tienen trabajo declarado. No es la cantidad de filas: alguien con
   *  normales y extras el mismo día trabajó UN día, no dos. */
  dias: number
}

const redondear = (n: number): number => Math.round(n * 100) / 100

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

const dia = (r: ImputacionHH): string | null => r.fecha?.slice(0, 10) ?? null

/** `2026-09-07` → `semana del 7 de septiembre`. */
export function rotuloDeSemana(lunes: string): string {
  return `semana del ${Number(lunes.slice(8, 10))} de ${MESES[Number(lunes.slice(5, 7)) - 1]}`
}

/** `2026-09` → `septiembre 2026`. */
export function rotuloDeMes(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
}

function tramo(clave: string, rotulo: string, registros: ImputacionHH[]): TramoCronologico {
  const trabajadas = registros.filter((r) => esTrabajada(r.tipo_hora))
  return {
    clave,
    rotulo,
    registros,
    horas: redondear(trabajadas.reduce((s, r) => s + Number(r.horas), 0)),
    ausencias: new Set(registros.filter((r) => !esTrabajada(r.tipo_hora)).map(dia).filter(Boolean)).size,
    dias: new Set(trabajadas.map(dia).filter(Boolean)).size,
  }
}

function agrupar(
  registros: ImputacionHH[],
  claveDe: (r: ImputacionHH) => string,
  rotuloDe: (clave: string) => string,
): TramoCronologico[] {
  const mapa = new Map<string, ImputacionHH[]>()
  for (const r of registros) {
    const k = claveDe(r)
    const previos = mapa.get(k)
    if (previos) previos.push(r)
    else mapa.set(k, [r])
  }
  // DEL MÁS RECIENTE AL MÁS VIEJO: lo que se viene a mirar es lo último, no el primer día de 2024.
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([k, rs]) => tramo(k, rotuloDe(k), ordenar(rs)))
}

/** Dentro del tramo, del día más reciente al más viejo. Las filas legacy sin día van al final:
 *  su grano es la semana y ubicarlas en un día sería inventarles una fecha. */
function ordenar(rs: ImputacionHH[]): ImputacionHH[] {
  return [...rs].sort((a, b) => {
    if (!a.fecha) return 1
    if (!b.fecha) return -1
    return b.fecha.localeCompare(a.fecha)
  })
}

/** Los tramos por semana. La clave sale de `fecha_inicio_semana`, que la deriva Postgres. */
export const porSemana = (registros: ImputacionHH[]): TramoCronologico[] =>
  agrupar(registros, (r) => r.fecha_inicio_semana, rotuloDeSemana)

/** Los tramos por mes. Del DÍA, no de la semana: una semana a caballo de dos meses pertenece a los
 *  dos, y ubicarla entera en el mes de su lunes correría horas de mes sin que nadie lo pidiera. */
export const porMes = (registros: ImputacionHH[]): TramoCronologico[] =>
  agrupar(
    registros.filter((r) => r.fecha),
    (r) => (r.fecha as string).slice(0, 7),
    rotuloDeMes,
  )

/** El pie del registro: cuánto abarca lo que se está mirando. `null` cuando no hay ninguna fila con
 *  día — un rango inventado sobre filas sin fecha no dice nada. */
export function abarca(registros: ImputacionHH[]): { desde: string; hasta: string } | null {
  const dias = registros.map(dia).filter(Boolean).sort() as string[]
  return dias.length === 0 ? null : { desde: dias[0], hasta: dias[dias.length - 1] }
}

/** «Cargó Rodrigo el 07/09» / «Corrigió Ana el 09/09». Vacío cuando la fila no tiene traza: las 19
 *  filas legacy del Sheet vinieron sin autor y decir «cargó el sistema» sería inventarlo. */
export function trazaDe(r: ImputacionHH): string | null {
  const cuando = (iso: string | null) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : null)
  if (r.corregido_en) {
    return `corrigió ${r.corrigio ?? 'alguien'} el ${cuando(r.corregido_en)}`
  }
  if (!r.creado_en) return null
  return r.cargo ? `${r.cargo} · ${cuando(r.creado_en)}` : (cuando(r.creado_en) as string)
}

/**
 * Lo que se ve en la columna TIPO del historial: «Ausencia · Enfermedad», «Licencia · Vacaciones».
 *
 * La etiqueta sale del catálogo, no de `notas` en crudo: si alguien guardó una clave que ya no
 * existe, se muestra el tipo solo en vez de un texto que nadie puede interpretar.
 */
export function tipoYMotivo(r: { tipo_hora: string; notas: string | null }): string | null {
  if (esTrabajada(r.tipo_hora)) return r.tipo_hora === 'normal' ? null : r.tipo_hora
  const cabeza = r.tipo_hora === 'licencia' ? 'Licencia' : 'Ausencia'
  const motivo = etiquetaDeMotivo(r.notas)
  return motivo ? `${cabeza} · ${motivo}` : cabeza
}
