// J02 · LA LISTA DE TAREAS DEL JEFE — buscar, filtrar y agrupar por frente.
//
// ═══ LOS CUATRO FILTROS SON CUATRO HECHOS ═══
//
// El contrato visual dibuja «Todas · En curso · Crítico · Con problema». Tres de los cuatro salen
// de la base tal cual. El cuarto NO: no hay camino crítico en el modelo. `obra_dependencia` está
// vacía —el motor de camino crítico existe, en `orquestador/lib/cronograma.mjs`, y todavía no tiene
// una sola dependencia cargada contra la que correr— así que ninguna actividad puede decir si es
// crítica. Pintar un chip «Crítico» que filtra por otra cosa sería inventar el dato más caro de la
// pantalla.
//
// En su lugar va ATRASADAS, que es el hecho más cercano y que sí está: el fin de plan pasó y la
// tarea no está terminada. Cuando se carguen las dependencias, el chip se cambia — el hueco queda
// declarado, no tapado.

import { diasDeAtraso } from './frentes.ts'
import type { ActividadDelJefe } from './jefeService.ts'
import { estaTerminada, soloTareas } from './dia.ts'

export const FILTROS = ['todas', 'curso', 'atrasadas', 'problema'] as const
export type Filtro = (typeof FILTROS)[number]

export const FILTRO_LABEL: Record<Filtro, string> = {
  todas: 'Todas',
  curso: 'En curso',
  atrasadas: 'Atrasadas',
  problema: 'Con problema',
}

/** Un filtro que no existe no vacía la pantalla: cae a «todas». */
export function filtroDe(valor: string | null | undefined): Filtro {
  return (FILTROS as readonly string[]).includes(valor ?? '') ? (valor as Filtro) : 'todas'
}

/** Sin tildes y en minúsculas: «Mampostería» tiene que encontrarse tecleando «mamposteria». */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function filtrar(
  actividades: ActividadDelJefe[], q: string, filtro: Filtro, hoy: string,
): ActividadDelJefe[] {
  const texto = normalizar(q.trim())
  return soloTareas(actividades).filter((a) => {
    if (texto && !normalizar(`${a.nombre} ${a.rubro ?? ''} ${a.cuadrilla_prevista ?? ''}`).includes(texto)) {
      return false
    }
    if (filtro === 'curso') return a.estado_operativo === 'en_curso'
    if (filtro === 'atrasadas') {
      return !estaTerminada(a) && diasDeAtraso(a.fin_plan, a.fin_real, hoy) != null
    }
    if (filtro === 'problema') {
      // Tres cosas frenan una tarea, y las tres son un hecho registrado: un impedimento abierto,
      // no tener con qué medirla, o no tener a nadie a cargo.
      return a.impedimentos_abiertos > 0 || a.metodo_avance == null
        || (a.cuadrilla_prevista == null && !estaTerminada(a))
    }
    return true
  })
}

export interface GrupoDeTareas {
  clave: string
  nombre: string
  tareas: ActividadDelJefe[]
}

export const SIN_FRENTE = 'Sin frente'

/**
 * Agrupadas por su frente, conservando el ORDEN CONSTRUCTIVO en que vinieron.
 *
 * El frente sale del ÁRBOL (`frentePorTarea`) y no de `rubro`: son dos jerarquías distintas y no
 * coinciden — ver el porqué completo en `frentes.ts`. Sin el árbol se cae a `rubro`, que es lo
 * único que hay cuando la lectura del árbol falló, y ahí es mejor un frente viejo que ninguno.
 *
 * Alfabetizar los grupos parecería más prolijo y sería peor: la obra se recorre en el orden en que
 * se construye, y «GALPÓN 2» antes que «GALPÓN 10» no es un capricho tipográfico.
 */
export function agruparPorFrente(
  tareas: ActividadDelJefe[], frentes?: Map<string, { id: string; nombre: string }>,
): GrupoDeTareas[] {
  const grupos: GrupoDeTareas[] = []
  const indice = new Map<string, GrupoDeTareas>()
  for (const t of tareas) {
    const nombre = frentes?.get(t.actividad_id)?.nombre ?? t.rubro?.trim() ?? SIN_FRENTE
    let g = indice.get(nombre)
    if (!g) {
      g = { clave: nombre, nombre, tareas: [] }
      indice.set(nombre, g)
      grupos.push(g)
    }
    g.tareas.push(t)
  }
  return grupos
}

/** El renglón bajo el nombre de la tarea: quién la tiene y con qué se la mide. */
export function detalleDeTarea(a: ActividadDelJefe, hoy: string): { texto: string; tono: 'muted' | 'warn' | 'neg' } {
  if (a.impedimentos_abiertos > 0) {
    return {
      texto: `${a.impedimentos_abiertos} ${a.impedimentos_abiertos === 1 ? 'impedimento abierto' : 'impedimentos abiertos'}`,
      tono: 'neg',
    }
  }
  if (a.metodo_avance == null) return { texto: 'sin método de medición', tono: 'warn' }
  // UNA TAREA TERMINADA NO NECESITA CUADRILLA. Marcarle «sin cuadrilla asignada» en ámbar pintaba
  // de problema el trabajo ya hecho: en esta obra son 60 de 89 tareas y el color dejaba de señalar.
  if (estaTerminada(a)) {
    return { texto: a.fin_real ? `terminada el ${diaMes(a.fin_real)}` : 'terminada', tono: 'muted' }
  }
  const dias = diasDeAtraso(a.fin_plan, a.fin_real, hoy)
  if (dias != null) return { texto: `${dias} ${dias === 1 ? 'día' : 'días'} pasado el plan`, tono: 'warn' }
  return { texto: a.cuadrilla_prevista ?? 'sin cuadrilla asignada', tono: a.cuadrilla_prevista ? 'muted' : 'warn' }
}

/** `2026-08-14` → `14/08`. En el teléfono el año sobra. */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
