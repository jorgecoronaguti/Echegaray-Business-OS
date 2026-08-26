// LAS TRES VENTANAS DE «CUADRILLAS Y HH» — mes, quincena y semana, de UNA lectura. `21v2:85-93`.
//
// ═══ POR QUÉ LAS TRES A LA VEZ ═══
//
// El mockup escribe las HH de las tres al lado de su nombre —«Agosto 2026 1.158 HH · Quincena en
// curso 512 HH · Esta semana 248 HH»— y no sólo las de la abierta. Un conteo que aparece recién al
// hacer clic no sirve para elegir dónde hacer clic.
//
// ═══ LA VENTANA QUE SE LEE NO ES EL MES ═══
//
// La semana va de lunes a domingo y puede empezar en julio y terminar en agosto: leer «el mes» y
// filtrar la semana adentro daría una semana recortada, con menos horas de las que tuvo. Se lee la
// UNIÓN de las tres ventanas y cada período se agrupa sobre la suya. Es una sola lectura igual.
//
// ═══ FICHADO NO ES PRESENTE, Y SIN FICHAR NO ES AUSENTE ═══
//
// El mockup dibuja «5/6 presentes» con la barra verde. Esta pantalla escribe FICHADOS, que es lo
// que la base sabe: `presencia_del_dia` tiene marcas, no asistencia. Un operario sin teléfono, uno
// que le negó el permiso al GPS y uno que faltó se ven idénticos desde acá, y convertir esa
// ignorancia en una ausencia fabricaría una novedad de liquidación con cara de dato. Es la misma
// regla que aplica «En obra ahora».

import { ventanaDe, type Ventana } from './periodoHH.ts'
import { agruparHHSemana, type HHDeLaSemana, type LecturaHH, type VinculoVigente } from './hhSemanaCuadrillas.ts'

/** El orden del mockup: de la ventana más ancha a la más angosta (`21v2:216`). */
export const PERIODOS_HH = ['mes', 'quincena', 'semana'] as const
export type PeriodoHH = (typeof PERIODOS_HH)[number]

export function esPeriodoHH(v: unknown): v is PeriodoHH {
  return typeof v === 'string' && (PERIODOS_HH as readonly string[]).includes(v)
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Cómo se llama cada período en la banda. El mes se nombra («Agosto 2026») y los otros dos se dicen
 * en relación a hoy («Quincena en curso», «Esta semana»), que es como los nombra quien los usa.
 */
export function rotuloDePeriodo(p: PeriodoHH, hoy: string): string {
  if (p === 'quincena') return 'Quincena en curso'
  if (p === 'semana') return 'Esta semana'
  const [a, m] = hoy.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

export const VENTANAS = (hoy: string): Record<PeriodoHH, Ventana> => ({
  mes: ventanaDe('mes', hoy),
  quincena: ventanaDe('quincena', hoy),
  semana: ventanaDe('semana', hoy),
})

/** La ventana mínima que contiene a todas. Es lo único que hace falta traer de la base. */
export function ventanaQueContiene(ventanas: Ventana[]): Ventana {
  return {
    desde: ventanas.reduce((a, v) => (v.desde < a ? v.desde : a), ventanas[0].desde),
    hasta: ventanas.reduce((a, v) => (v.hasta > a ? v.hasta : a), ventanas[0].hasta),
  }
}

export interface HHDePeriodo extends HHDeLaSemana { ventana: Ventana }

/**
 * EL AGRUPADO DE LOS TRES PERÍODOS, PURO. Sin base, sin reloj y sin red.
 *
 * Cada uno se agrupa sobre SU ventana y no sobre la leída: `agruparHHSemana` ya descarta lo que cae
 * afuera, así que la semana no hereda las horas del mes por venir en la misma lectura.
 */
export function agruparPorPeriodo(lectura: LecturaHH, hoy: string): Record<PeriodoHH, HHDePeriodo> {
  const v = VENTANAS(hoy)
  const de = (p: PeriodoHH): HHDePeriodo => ({
    ...agruparHHSemana(lectura.vinculos, lectura.registros, v[p].desde, v[p].hasta),
    ventana: v[p],
  })
  return { mes: de('mes'), quincena: de('quincena'), semana: de('semana') }
}

/** Cuánta gente vigente tiene cada cuadrilla y cuánta de ésa marcó hoy. */
export interface Fichaje { integrantes: number; fichados: number }

/**
 * QUIÉN MARCÓ HOY, POR CUADRILLA. `21v2:108-114`.
 *
 * `integrantes` sale de los vínculos vigentes —la misma fuente con la que se suman las HH— y no del
 * contador de la fila, que puede haberse leído en otra consulta: dos denominadores distintos para
 * la misma cuadrilla es la forma más barata de publicar dos verdades.
 */
export function fichajePorCuadrilla(
  vinculos: VinculoVigente[],
  personasQueMarcaron: Set<string>,
): Map<string, Fichaje> {
  const gente = new Map<string, Set<string>>()
  for (const v of vinculos) {
    const ya = gente.get(v.cuadrilla_id)
    if (ya) ya.add(v.persona_id)
    else gente.set(v.cuadrilla_id, new Set([v.persona_id]))
  }
  const salida = new Map<string, Fichaje>()
  for (const [cuadrilla, personas] of gente) {
    let fichados = 0
    for (const p of personas) if (personasQueMarcaron.has(p)) fichados += 1
    salida.set(cuadrilla, { integrantes: personas.size, fichados })
  }
  return salida
}

/**
 * El pie de la banda: «1.158 HH en 4 cuadrillas · 15 personas» (`21v2:224`).
 *
 * Las personas se cuentan sobre los vínculos vigentes y NO se suman por cuadrilla: quien está en
 * dos cuadrillas es una persona, no dos, y la misma regla que evita duplicar sus horas tiene que
 * evitar duplicarla a ella.
 */
export function pieDeLaBanda(horas: number, cuadrillas: number, vinculos: VinculoVigente[]): string {
  const personas = new Set(vinculos.map((v) => v.persona_id)).size
  const hh = horas.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  return `${hh} HH en ${cuadrillas} ${cuadrillas === 1 ? 'cuadrilla' : 'cuadrillas'}`
    + ` · ${personas} ${personas === 1 ? 'persona' : 'personas'}`
}
