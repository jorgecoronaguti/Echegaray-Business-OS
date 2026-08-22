// QUÉ FILAS SE VEN — buscador, vistas y colapso, sobre el árbol ya aplanado. NÚCLEO PURO.
//
// ═══ EL PADRE DE UNA COINCIDENCIA SIEMPRE SE VE ═══
//
// Buscar «encofrado» y recibir seis filas sueltas sin su rubro deja al que mira sin saber a qué
// sector pertenece cada una. Un árbol filtrado que pierde el camino deja de ser un árbol: se
// conservan los ANTEPASADOS de cada coincidencia, aunque ellos no coincidan.

import { ejecutorDe, sinAnalisis, type Agregado, type NodoObra } from './wbs.ts'
import type { EstadoActividad } from '../types/index.ts'

// ═══ FILTROS RÁPIDOS AL ESTILO DE UN GESTOR DE PROYECTOS (22/08/2026 · overhaul UX) ═══
//
// «Con problema» agrupaba conceptos del modelo (sin análisis, subcontrato, sin ejecutor) bajo un
// rótulo que nadie podía predecir. Los filtros nuevos nombran lo que un jefe de obra busca:
// atrasadas, bloqueadas, sin asignar. La deuda de carga (sin análisis) sigue visible como estado
// de la fila; no necesita un filtro con nombre técnico.
export const VISTAS_ARBOL = ['todo', 'en_curso', 'atrasadas', 'bloqueadas', 'sin_asignar', 'critico'] as const
export type VistaArbol = (typeof VISTAS_ARBOL)[number]

export const VISTA_ARBOL_LABEL: Record<VistaArbol, string> = {
  todo: 'Todo',
  en_curso: 'En curso',
  atrasadas: 'Atrasadas',
  bloqueadas: 'Bloqueadas',
  sin_asignar: 'Sin asignar',
  critico: 'Camino crítico',
}

export function esVistaArbol(v: unknown): v is VistaArbol {
  return typeof v === 'string' && (VISTAS_ARBOL as readonly string[]).includes(v)
}

/** El avance que muestra la fila: el propio si es ejecutable, el del rollup si es contenedor. */
export function avanceDe(n: NodoObra, agregados: Map<string, Agregado>): number | null {
  return n.es_contenedor ? (agregados.get(n.id)?.avance_pct ?? null) : n.avance_pct
}

/**
 * EL ESTADO DE UNA FILA, en el orden en que un jefe de obra los necesita.
 *
 * La prioridad no es caprichosa: **un HECHO le gana a una deuda de carga**. Una actividad terminada
 * sigue estando terminada aunque nadie haya cargado su análisis, y pintarla «Sin análisis» haría
 * que el que mira busque trabajo donde ya no hay. Lo único que se pone antes del hecho es el
 * impedimento, porque es lo que hay que ir a resolver hoy.
 */
export type ClaveEstado =
  | 'impedimento' | 'hecha' | 'en_curso_critica' | 'en_curso'
  | 'sin_analisis' | 'sin_cuadrilla' | 'sin_plan' | 'pendiente'

export function estadoDeFila(
  n: NodoObra, avance: number | null,
): { clave: ClaveEstado; label: string } {
  if (n.impedimentos_abiertos > 0) return { clave: 'impedimento', label: 'Impedimento' }
  if (avance !== null && avance >= 100) return { clave: 'hecha', label: 'Hecha' }
  const enCurso = (avance !== null && avance > 0) || n.estado === 'en_curso'
  if (enCurso && n.es_critica) return { clave: 'en_curso_critica', label: 'En curso · crítica' }
  if (enCurso) return { clave: 'en_curso', label: 'En curso' }
  if (sinAnalisis(n)) return { clave: 'sin_analisis', label: 'Sin análisis' }
  // «SIN CUADRILLA» PREGUNTA POR EL EJECUTOR, NO POR EL RESPONSABLE. Mientras el campo mezclaba los
  // dos daba lo mismo; ahora no: una actividad con jefe asignado y sin cuadrilla sigue sin poder
  // arrancar, y un paquete subcontratado nunca estuvo en deuda de cuadrilla.
  if (!n.es_contenedor && ejecutorDe(n) === null) return { clave: 'sin_cuadrilla', label: 'Sin cuadrilla' }
  if (!n.fin_plan && !n.es_contenedor) return { clave: 'sin_plan', label: 'Sin plan' }
  return { clave: 'pendiente', label: 'Pendiente' }
}

/** Los cinco estados que se pueden ELEGIR. `bloqueada` no está: se deriva del impedimento. */
export function estadoElegible(v: unknown): v is EstadoActividad {
  return v === 'pendiente' || v === 'lista' || v === 'en_curso' || v === 'hecha'
}

function normalizar(s: string): string {
  return s.toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** ¿La fila, por sí sola, entra en la vista y en la búsqueda? Sin mirar a sus antepasados.
 *  `hoy` viene de afuera: la regla es pura y el test no depende del día en que corre. */
export function coincide(
  n: NodoObra, avance: number | null, vista: VistaArbol, query: string, hoy: string,
): boolean {
  if (query) {
    const q = normalizar(query)
    // Se busca por los TRES: quien escribe «Pérez» busca al responsable y quien escribe «Cuadrilla
    // 2» busca la composición. Con un solo campo, una de las dos búsquedas no encontraba nada.
    const texto = normalizar(
      `${n.nombre} ${n.partida_codigo ?? ''} ${n.responsable ?? ''} ${n.cuadrilla ?? ''} ${n.subcontratista ?? ''}`,
    )
    if (!texto.includes(q)) return false
  }
  switch (vista) {
    case 'todo': return true
    case 'en_curso': return avance !== null && avance > 0 && avance < 100
    // ATRASADA = venció su fin de plan y no está terminada. El avance nulo cuenta: «nadie midió»
    // no puede esconder un vencimiento — se muestra y que se resuelva mirándola.
    case 'atrasadas':
      return !n.es_contenedor && n.fin_plan !== null && n.fin_plan < hoy && (avance === null || avance < 100)
    case 'bloqueadas': return n.impedimentos_abiertos > 0
    // SIN ASIGNAR pregunta por el EJECUTOR (cuadrilla o subcontratista), no por el responsable:
    // una actividad con jefe y sin cuadrilla sigue sin poder arrancar.
    case 'sin_asignar': return !n.es_contenedor && ejecutorDe(n) === null
    case 'critico': return n.es_critica
  }
}

export interface FilaVisible {
  nodo: NodoObra
  avance: number | null
  agregado: Agregado | null
  /** Se dibuja el caret sólo si tiene hijas que hoy pasan el filtro. */
  plegable: boolean
  plegado: boolean
}

/**
 * LAS FILAS QUE SE DIBUJAN.
 *
 * Tres pasadas y ninguna recursión: marcar coincidencias, subir los antepasados, y recién ahí
 * aplicar el colapso — en ese orden. Si el colapso se aplicara primero, buscar algo escondido
 * dentro de un rubro cerrado devolvería «nada coincide» teniendo la fila delante.
 */
export function filasVisibles(
  nodos: readonly NodoObra[],
  agregados: Map<string, Agregado>,
  opciones: { vista: VistaArbol; query: string; plegados: ReadonlySet<string>; hoy?: string },
): FilaVisible[] {
  const { vista, query, plegados, hoy = '' } = opciones
  const porId = new Map(nodos.map((n) => [n.id, n]))
  const avances = new Map(nodos.map((n) => [n.id, avanceDe(n, agregados)]))

  const dentro = new Set<string>()
  for (const n of nodos) {
    if (!coincide(n, avances.get(n.id) ?? null, vista, query, hoy)) continue
    dentro.add(n.id)
    let p = n.padre_id
    while (p && !dentro.has(p)) { dentro.add(p); p = porId.get(p)?.padre_id ?? null }
  }

  const conHijas = new Set<string>()
  for (const n of nodos) if (n.padre_id && dentro.has(n.id)) conHijas.add(n.padre_id)

  const escondido = (n: NodoObra): boolean => {
    let p = n.padre_id
    while (p) {
      if (plegados.has(p)) return true
      p = porId.get(p)?.padre_id ?? null
    }
    return false
  }

  return nodos
    .filter((n) => dentro.has(n.id) && !escondido(n))
    .map((n) => ({
      nodo: n,
      avance: avances.get(n.id) ?? null,
      agregado: agregados.get(n.id) ?? null,
      plegable: conHijas.has(n.id),
      plegado: plegados.has(n.id),
    }))
}

/** Los contenedores: lo que colapsa «Colapsar». Las actividades nunca se pliegan, no tienen hijas. */
export function contenedores(nodos: readonly NodoObra[]): string[] {
  return nodos.filter((n) => n.es_contenedor && n.tiene_hijas).map((n) => n.id)
}
