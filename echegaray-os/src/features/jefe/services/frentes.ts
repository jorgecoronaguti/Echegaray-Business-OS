// EL FRENTE — la unidad con la que el jefe de obra piensa el día.
//
// ═══ UN FRENTE ES UN CONTENEDOR DEL ÁRBOL, NO UNA IDEA NUEVA ═══
//
// `obra_wbs` ya recorre la estructura y marca `es_contenedor`. Un frente es exactamente eso: el
// nodo que agrupa («GALPÓN 2», «Eje 5–8 · Fundaciones») con las tareas medibles que le cuelgan, a
// cualquier profundidad. No se inventa una tabla de frentes ni un campo nuevo: si mañana el árbol
// gana un nivel, los frentes lo siguen solos.
//
// ═══ EL CONTENEDOR NO SE MIDE: SE AGREGA, Y SE DICE SOBRE CUÁNTO ═══
//
// La base rechaza un avance cargado contra un `tipo='resumen'`. Acá se respeta la misma regla desde
// el otro lado: el porcentaje del frente NO es un dato propio, es el promedio de sus tareas medidas
// — y viaja siempre con su COBERTURA. «40 % sobre 3 de 11 tareas» y «40 % sobre 11 de 11» son dos
// afirmaciones muy distintas y hasta hoy se veían iguales.
//
// Un frente sin una sola tarea medida devuelve `null`, nunca 0. Cero es un frente que no arrancó;
// null es un frente que nadie sabe cómo va.

import { avanceAgregado } from '../../obras/services/avance.ts'

/** Una fila de `obra_wbs`. Sólo lo que este módulo mira. */
export interface NodoArbol {
  actividad_id: string
  actividad_padre_id: string | null
  nombre: string
  camino: string
  nivel: number
  archivada: boolean
  es_contenedor: boolean
}

/** Lo que este módulo necesita de `obra_actividad_control`. */
export interface TareaMedida {
  actividad_id: string
  avance_pct: number | null
  /** El PESO de la tarea dentro del frente. HH plan no es costo —el jefe de obra las ve en la 07 y
   *  en la 08—: es cuánto trabajo es cada tarea, y sin eso el frente promedia peras con sandías. */
  hh_plan: number | null
}

export interface Frente {
  id: string
  nombre: string
  camino: string
  nivel: number
  /** Los ids de las tareas MEDIBLES que le cuelgan, a cualquier profundidad. Sin contenedores. */
  tareas: string[]
}

/** El avance de un frente, con la cobertura pegada al número. */
export interface AvanceDeFrente {
  /** `null` cuando ninguna tarea tiene avance: no se sabe, y eso no es cero. */
  pct: number | null
  medidas: number
  total: number
}

const vivo = (n: NodoArbol) => !n.archivada

/**
 * Los frentes de la obra, en orden de árbol.
 *
 * `wbs` tiene que venir ordenado por `ruta_orden` —así lo devuelve la vista— y el orden se conserva:
 * el jefe recorre la obra en orden constructivo, no alfabético.
 */
export function frentesDe(wbs: NodoArbol[]): Frente[] {
  const vivos = wbs.filter(vivo)
  const hijasDe = new Map<string, NodoArbol[]>()
  for (const n of vivos) {
    if (!n.actividad_padre_id) continue
    const l = hijasDe.get(n.actividad_padre_id) ?? []
    l.push(n)
    hijasDe.set(n.actividad_padre_id, l)
  }
  return vivos
    .filter((n) => n.es_contenedor)
    .map((n) => ({
      id: n.actividad_id,
      nombre: n.nombre,
      camino: n.camino,
      nivel: n.nivel,
      tareas: medibles(n, hijasDe),
    }))
}

/** Las tareas medibles bajo un nodo. Recursivo: un frente puede tener sub-frentes. */
function medibles(raiz: NodoArbol, hijasDe: Map<string, NodoArbol[]>): string[] {
  const salida: string[] = []
  const pila = [...(hijasDe.get(raiz.actividad_id) ?? [])]
  while (pila.length > 0) {
    const n = pila.shift() as NodoArbol
    if (n.es_contenedor) pila.unshift(...(hijasDe.get(n.actividad_id) ?? []))
    else salida.push(n.actividad_id)
  }
  return salida
}

/**
 * El avance del frente, con la cobertura pegada al número.
 *
 * ═══ LA REGLA ES UNA SOLA Y VIVE EN `avance.ts` ═══
 *
 * `avanceAgregado`: **ponderado por HH plan, con promedio simple DECLARADO como fallback** cuando
 * ninguna tarea tiene HH cargadas. Este módulo promediaba simple y la 08 ponderaba: el mismo frente
 * daba dos porcentajes distintos según por dónde se entrara. La justificación vieja del promedio
 * simple —y por qué se descartó— está escrita en el módulo canónico, al lado de la regla que la
 * reemplaza.
 *
 * Lo que sí es propio de acá y no se movió: un frente sin una sola tarea medida devuelve `null`,
 * nunca 0, y el número viaja siempre con sobre cuántas tareas se sacó.
 */
export function avanceDelFrente(tareas: TareaMedida[]): AvanceDeFrente {
  const { pct, medidas } = avanceAgregado(tareas)
  return { pct, medidas, total: tareas.length }
}

/** `2026-08-21` → días de calendario entre dos fechas. Positivo si `b` es posterior a `a`. */
export function diasEntre(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  return Math.round((tb - ta) / 86_400_000)
}

/**
 * Los días de atraso de una tarea. `null` cuando no se puede medir, que NO es cero.
 *
 * Sin `fin_plan` no hay contra qué medir: una tarea sin plan no está atrasada, está sin planificar,
 * y publicar «0 días de atraso» ahí es afirmar que va en horario cuando nadie dijo cuándo terminaba.
 * Terminada antes de tiempo devuelve `null` y no un negativo: el adelanto es otra pregunta.
 */
export function diasDeAtraso(
  finPlan: string | null, finReal: string | null, hoy: string,
): number | null {
  if (!finPlan) return null
  const d = diasEntre(finPlan, finReal ?? hoy)
  if (d == null || d <= 0) return null
  return d
}

/** El atraso del frente: el de su tarea más atrasada. Es la que fija la fecha de fin del frente. */
export function atrasoDelFrente(
  tareas: { fin_plan: string | null; fin_real: string | null }[], hoy: string,
): number | null {
  const dias = tareas
    .map((t) => diasDeAtraso(t.fin_plan, t.fin_real, hoy))
    .filter((d): d is number => d != null)
  return dias.length === 0 ? null : Math.max(...dias)
}

/**
 * A qué frente pertenece cada tarea, según el ÁRBOL.
 *
 * ═══ POR QUÉ NO SE USA `rubro` ═══
 *
 * `obra_actividad_control.rubro` sale de `codigo_padre`: busca un 'resumen' de la misma obra cuyo
 * `codigo` coincida. Ese par se conserva como RASTRO DE LA FUENTE (el tracker del que se importó la
 * obra) y no es la jerarquía: desde `20260821T2000` el padre es `actividad_padre_id`. En
 * san-francisco las dos no coinciden, y el efecto medido es que la misma tarea aparecía bajo
 * «GALPÓN 4» en la pantalla del frente y bajo «Sin frente» en la lista de tareas.
 *
 * Dos pantallas que ubican el mismo trabajo en lugares distintos es peor que no ubicarlo: el jefe
 * deja de creerle a las dos. La jerarquía es una sola y sale de acá.
 *
 * Devuelve el contenedor MÁS CERCANO. Con frentes anidados, «Eje 5–8» le gana a «Fundaciones»: es
 * el que el jefe reconoce parado ahí.
 */
export function frentePorTarea(wbs: NodoArbol[]): Map<string, { id: string; nombre: string }> {
  const porId = new Map(wbs.map((n) => [n.actividad_id, n]))
  const salida = new Map<string, { id: string; nombre: string }>()
  for (const n of wbs) {
    if (n.archivada || n.es_contenedor) continue
    let padre = n.actividad_padre_id ? porId.get(n.actividad_padre_id) : undefined
    // Un ciclo en el árbol colgaría este bucle. La base ya lo impide, pero un tope hace que un dato
    // corrupto sea una tarea sin frente y no una pantalla que no carga nunca.
    for (let saltos = 0; padre && saltos < 50; saltos += 1) {
      if (padre.es_contenedor) {
        salida.set(n.actividad_id, { id: padre.actividad_id, nombre: padre.nombre })
        break
      }
      padre = padre.actividad_padre_id ? porId.get(padre.actividad_padre_id) : undefined
    }
  }
  return salida
}
