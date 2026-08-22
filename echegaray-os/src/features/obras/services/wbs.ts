// EL ÁRBOL DE LA OBRA — aplanado, rollup y filtros. NÚCLEO PURO: entra un arreglo, sale otro.
//
// ═══ EL ORDEN Y EL NIVEL SALEN DE LA BASE, NO DE ACÁ ═══
//
// `obra_wbs` recorre la jerarquía y devuelve `nivel`, `ruta_orden` y `camino`. Ordenar por
// `ruta_orden` ya entrega el árbol aplanado con cada rama debajo de su padre. Rearmar la recursión
// en TypeScript sería una segunda definición de la estructura de la obra: el día que la migración
// cambie el criterio de orden, la pantalla seguiría mostrando el viejo sin un solo error.
//
// Lo que SÍ vive acá es lo que la base no puede contestar sin fijar un criterio de negocio: cuánto
// avanza un contenedor, con qué se lo pondera, y qué se ve cuando alguien filtra o colapsa.
//
// ═══ UNA TRAMPA MEDIDA EN LA BASE REAL (21/08/2026) ═══
//
// De las 275 actividades de san-francisco, quattropani y messina, **cero tienen `hh_plan`**. Un
// rollup que sólo supiera ponderar por HH devolvería `null` en los 148 contenedores y la pantalla
// entera diría «sin base». Por eso el rollup declara CON QUÉ ponderó (`ponderacion`): con HH cuando
// hay HH, en partes iguales cuando no hay ninguna, y `null` sólo cuando ninguna hija tiene avance.
// El criterio se muestra al lado del número en vez de esconderse adentro.
//
// La CUENTA en sí no vive acá: es `avanceAgregado` de `avance.ts`, una sola para todo el OS. Este
// archivo sólo la traduce al vocabulario del árbol (`ponderacion`, entero).

import { avanceAgregado } from './avance.ts'
import type { EstadoActividad, MetodoAvance, TipoActividad } from '../types/index.ts'

export type RolEstructura = 'rubro' | 'sector' | 'nivel' | 'frente' | 'elemento'

/** Una fila del árbol, ya cruzada entre `obra_wbs` y `obra_actividad_control`. */
export interface NodoObra {
  id: string
  padre_id: string | null
  nivel: number
  camino: string
  es_contenedor: boolean
  tiene_hijas: boolean
  nombre: string
  tipo: TipoActividad
  rol_estructura: RolEstructura | null
  partida_codigo: string | null
  unidad: string | null
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
  hh_plan: number | null
  hh_real: number | null
  metodo_avance: MetodoAvance
  avance_pct: number | null
  fin_plan: string | null
  /** El texto que va en RESPONSABLE. `null` = nadie lo declaró; la pantalla escribe «sin asignar». */
  responsable: string | null
  es_subcontrato: boolean
  estado: EstadoActividad | null
  impedimentos_abiertos: number
  n_pasos: number
  n_pasos_hechos: number
  peso_pasos: number | null
  /** El análisis de la base maestra con el que se planificó. Sin él no hay rendimiento ni duración. */
  analisis_id: string | null
  /** La tarea tipo: la llave del histórico de rendimiento. */
  tarea_tipo_id: string | null
  /** La partida del presupuesto de la que salió. Es lo que habilita «Ver partida». */
  cotizacion_partida_id: string | null
  tope_frente: number | null
  dotacion_prevista: number | null
  cuadrilla_id: string | null
  /** Días que NO se comprimen con más gente. Van al cuarto argumento de `duracionDias`, sumados
   *  aparte: curar dos días son dos días haya una persona o veinte. */
  tiempo_tecnico: boolean
  dias_plan: number | null
  es_critica: boolean
}

/**
 * DEUDA DE CARGA QUE BLOQUEA. Una actividad ejecutable sin análisis, sin HH y sin cantidad objetivo
 * no se puede dimensionar: no tiene duración, no tiene rendimiento y su avance no se puede calcular
 * más que declarándolo. No es lo mismo que «sin plan» (que es no tener fechas).
 */
export function sinAnalisis(n: NodoObra): boolean {
  if (n.es_contenedor) return false
  return n.analisis_id === null && n.hh_plan === null && n.cantidad_objetivo === null
}

/** Con qué se ponderó el avance de un contenedor. Se muestra: un promedio no vale lo que un HH. */
export type Ponderacion = 'hh' | 'iguales'

export interface Agregado {
  /** Suma de las HH de las hijas. `null` si ninguna tiene HH: cero horas diría que no lleva mano de obra. */
  hh_plan: number | null
  hh_real: number | null
  /** El avance del contenedor, 0–100. `null` si ninguna hija tiene avance. */
  avance_pct: number | null
  ponderacion: Ponderacion | null
  /** La fecha fin más TARDÍA de las hijas: un contenedor termina cuando termina la última. */
  fin_plan: string | null
  n_actividades: number
  n_sin_analisis: number
}

const VACIO: Agregado = {
  hh_plan: null, hh_real: null, avance_pct: null, ponderacion: null,
  fin_plan: null, n_actividades: 0, n_sin_analisis: 0,
}

function sumar(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return a + b
}

/** Lo que aporta al padre una fila: si es contenedor, su agregado; si es ejecutable, ella misma. */
function aporteDe(n: NodoObra, agregados: Map<string, Agregado>): Agregado {
  if (n.es_contenedor) return agregados.get(n.id) ?? VACIO
  return {
    hh_plan: n.hh_plan,
    hh_real: n.hh_real,
    avance_pct: n.avance_pct,
    ponderacion: null,
    fin_plan: n.fin_plan,
    n_actividades: 1,
    n_sin_analisis: sinAnalisis(n) ? 1 : 0,
  }
}

/**
 * El avance ponderado de una lista de aportes, con el criterio que se pudo usar.
 *
 * LA REGLA NO VIVE ACÁ: es `avanceAgregado` de `avance.ts`, la misma que usan la pantalla del jefe
 * (J06), la dotación (08), la ficha de la obra y la vista publicada `obra_avance`. Lo que queda acá
 * es la TRADUCCIÓN a lo que el árbol publica —`ponderacion` y un entero—, porque el rollup dibuja el
 * criterio al lado del número y la franja del pie escribe `${avance}%` sin decimales.
 *
 * Lo que había era una tercera implementación de la misma cuenta: filtraba las hijas sin HH en vez
 * de darles peso 0 —aritméticamente lo mismo— y por eso daba el mismo número. Una regla que hoy
 * coincide por tres caminos distintos es una regla que mañana se corrige en uno solo.
 */
function ponderar(aportes: Agregado[]): Pick<Agregado, 'avance_pct' | 'ponderacion'> {
  const { pct, ponderado } = avanceAgregado(aportes)
  if (pct === null) return { avance_pct: null, ponderacion: null }
  return { avance_pct: Math.round(pct), ponderacion: ponderado ? 'hh' : 'iguales' }
}

/**
 * EL ROLLUP: un agregado por contenedor, de abajo hacia arriba.
 *
 * Se recorre en orden inverso de PROFUNDIDAD para que un contenedor siempre encuentre a sus hijas
 * ya resueltas — funciona con N niveles sin recursión y sin riesgo de pila. La base ya garantiza
 * que no hay ciclos (`obra_actividad_arista_valida`).
 */
export function rollup(nodos: readonly NodoObra[]): Map<string, Agregado> {
  const hijas = new Map<string, NodoObra[]>()
  for (const n of nodos) {
    if (!n.padre_id) continue
    const l = hijas.get(n.padre_id) ?? []
    l.push(n)
    hijas.set(n.padre_id, l)
  }
  const agregados = new Map<string, Agregado>()
  const porProfundidad = [...nodos].sort((a, b) => b.nivel - a.nivel)
  for (const n of porProfundidad) {
    if (!n.es_contenedor) continue
    const aportes = (hijas.get(n.id) ?? []).map((h) => aporteDe(h, agregados))
    agregados.set(n.id, {
      ...ponderar(aportes),
      hh_plan: aportes.reduce<number | null>((s, a) => sumar(s, a.hh_plan), null),
      hh_real: aportes.reduce<number | null>((s, a) => sumar(s, a.hh_real), null),
      fin_plan: aportes.reduce<string | null>((f, a) => (a.fin_plan && (!f || a.fin_plan > f) ? a.fin_plan : f), null),
      n_actividades: aportes.reduce((s, a) => s + a.n_actividades, 0),
      n_sin_analisis: aportes.reduce((s, a) => s + a.n_sin_analisis, 0),
    })
  }
  return agregados
}

/** El total de la obra: la suma de las raíces, con el mismo criterio que un contenedor cualquiera. */
export function totalObra(nodos: readonly NodoObra[], agregados: Map<string, Agregado>): Agregado {
  const raices = nodos.filter((n) => !n.padre_id)
  const aportes = raices.map((r) => aporteDe(r, agregados))
  return {
    ...ponderar(aportes),
    hh_plan: aportes.reduce<number | null>((s, a) => sumar(s, a.hh_plan), null),
    hh_real: aportes.reduce<number | null>((s, a) => sumar(s, a.hh_real), null),
    fin_plan: aportes.reduce<string | null>((f, a) => (a.fin_plan && (!f || a.fin_plan > f) ? a.fin_plan : f), null),
    n_actividades: aportes.reduce((s, a) => s + a.n_actividades, 0),
    n_sin_analisis: aportes.reduce((s, a) => s + a.n_sin_analisis, 0),
  }
}
