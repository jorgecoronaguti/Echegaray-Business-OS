// LAS SEÑALES DE LA PRIMERA LÍNEA DE BASE MAESTRA — criterio 1 y 2 del patrón v2 (`17v2:40-56`).
//
// Lo primero que se ve al entrar no es la biblioteca: es lo que impide cotizar con ella. Las dos
// señales del mockup, y las dos tienen fuente real:
//
//   TAREAS TIPO SIN ANÁLISIS — `analisis_id` en null. Sin análisis no hay costo unitario, así que
//   la tarea no se puede presupuestar: el presupuesto que la use queda con un renglón en cero.
//   RECURSOS SIN PRECIO — `costo_base` en null. Toda tarea que los use queda con el costo
//   incompleto, y el incompleto no se ve: se ve un número más chico.
//
// ═══ SIN PERMISO ECONÓMICO, LA SEGUNDA SEÑAL NO SE DIBUJA ═══
//
// `recurso_precio` sólo abre para `ve_economia()`: un jefe de obra recibe CERO FILAS, sin error, y
// entonces los 409 recursos se leen «sin precio». Publicarle esa cifra le diría que hay 409 precios
// por cargar que están cargados, y lo mandaría a cargarlos de nuevo. Es el mismo defecto que ya
// documenta `types/index.ts`: una lectura recortada por permiso NO es una ausencia de dato.

import type { SenalDeTrabajo } from '../../../shared/components/v2/trabajo.ts'

/** Lo mínimo de una tarea tipo para saber si reclama algo. */
export interface FilaTareaSenal { analisis_id: string | null }
/** Lo mínimo de un recurso. `costo_base` en null = sin precio cargado. */
export interface FilaRecursoSenal { costo_base: number | null }

export interface HrefsBaseMaestra {
  sinAnalisis: string
  sinPrecio: string
}

export function senalesDeBaseMaestra({
  tareas, recursos, economia, hrefs,
}: {
  /** `null` = no se pudieron leer. NO es «no hay ninguna sin análisis». */
  tareas: FilaTareaSenal[] | null
  /** `null` = no se pudieron leer. */
  recursos: FilaRecursoSenal[] | null
  /** ¿Quien mira ve precio? Sin esto, la señal de precio no se puede afirmar. */
  economia: boolean
  hrefs: HrefsBaseMaestra
}): SenalDeTrabajo[] {
  const s: SenalDeTrabajo[] = []

  if (tareas === null) {
    s.push({
      clave: 'sin-analisis', numero: null, texto: 'tareas tipo sin análisis',
      bloquea: 'No pude leerlas: esta pantalla no puede afirmar que todas tengan análisis',
      accion: 'Revisar', href: hrefs.sinAnalisis, icono: 'presupuesto',
    })
  } else {
    const n = tareas.filter((t) => t.analisis_id === null).length
    if (n > 0) {
      s.push({
        clave: 'sin-analisis', numero: n,
        texto: n === 1 ? 'tarea tipo sin análisis' : 'tareas tipo sin análisis',
        bloquea: 'No se pueden presupuestar: no tienen costo unitario',
        accion: 'Cargar', href: hrefs.sinAnalisis, icono: 'presupuesto',
      })
    }
  }

  // SIN PERMISO NO HAY SEÑAL, y tampoco un 0: las dos son afirmaciones y ninguna se puede hacer.
  if (!economia) return s

  if (recursos === null) {
    s.push({
      clave: 'sin-precio', numero: null, texto: 'recursos sin precio',
      bloquea: 'No pude leerlos: esta pantalla no puede afirmar que todos tengan precio',
      accion: 'Revisar', href: hrefs.sinPrecio, icono: 'compra',
    })
  } else {
    const n = recursos.filter((r) => r.costo_base === null).length
    if (n > 0) {
      s.push({
        clave: 'sin-precio', numero: n,
        texto: n === 1 ? 'recurso sin precio' : 'recursos sin precio',
        bloquea: 'Toda tarea que los use queda con el costo incompleto',
        accion: 'Cargar', href: hrefs.sinPrecio, icono: 'compra',
      })
    }
  }

  return s
}
