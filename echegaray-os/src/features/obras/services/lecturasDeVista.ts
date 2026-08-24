// QUÉ LEE CADA SOLAPA DE LA OBRA — la matriz, en un solo lugar y en una función pura.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// El `Promise.all` del workspace ya cobraba por vista: cada lectura cuelga de un ternario
// (`vista === 'personal' ? getAsignaciones(...) : null`). Pero tres lecturas se habían quedado
// INCONDICIONALES, y dos de ellas no las usa ni la mitad de las solapas. La más cara del workspace
// —`obra_plan_vs_real`— era una de esas.
//
// ═══ LO MEDIDO (24/08/2026, PostgREST real, sesión de Dirección, mediana de 5) ═══
//
//   obra_plan_vs_real de UNA obra ······ 864 ms  (mínimo 390, máximo 2.586)
//   obra_plan_vs_real de las 17 obras ·· 488 ms
//
// Leer UNA obra sale más caro que leer las diecisiete: el `where obra_id = …` no baja a las CTEs
// agregadas de la vista (`hh`, `hh_plan`, `pres`, `cert` agrupan sobre TODAS las obras igual), así
// que el filtro no ahorra trabajo y encima empuja al planificador a un plan peor. Ese es el número
// que se pagaba en las TRES solapas que ni siquiera miran el resultado.
//
// `plan` lo consumen Resumen, Personal y Economía —y nadie más—. `restricciones` las consumen
// Resumen, Cronograma y Operación. Verificado contra el JSX del `page.tsx`: son las únicas que
// reciben la prop.
//
// LA MATRIZ VIVE ACÁ Y NO EN EL `page.tsx` porque una regla que sólo existe adentro de un componente
// de servidor no se puede probar sin levantar el servidor y la base. Acá es una función pura y su
// test tarda milisegundos. Es la misma lección de `test-que-afirma-el-estado-del-mundo`.
//
// CÓMO SE AGREGA UNA LECTURA NUEVA: se agrega su bandera acá, se declara qué solapas la piden, y el
// test de la matriz obliga a decidirlo. Una lectura sin bandera es una lectura que pagan las seis.

/** Las sub-vistas de la solapa Tareas. `null` cuando la solapa activa no es Tareas. */
export type SubTareas = 'arbol' | 'gantt' | 'parte' | null

/** Qué tiene que leer el workspace para dibujar esta solapa. Todo lo que diga `false` es una
 *  consulta a Supabase que NO sale — no una que sale y se descarta al renderizar. */
export type LecturasDeVista = {
  /** El plantel. Cronograma (panel de la actividad), Personal y el parte diario. */
  personas: boolean
  /** Las cuadrillas. Personal, el parte diario y el árbol de tareas. */
  cuadrillas: boolean
  /** Los partes de ejecución. El parte, Cronograma y «último movimiento» del Resumen. */
  partes: boolean
  /** `obra_plan_vs_real`. LA MÁS CARA: 864 ms medidos. Sólo Resumen, Personal y Economía. */
  plan: boolean
  /** `obra_restriccion`. Resumen (las abiertas), Cronograma y Operación (los impedimentos). */
  restricciones: boolean
}

/**
 * La matriz completa, calculada de la vista y la sub-vista YA RESUELTAS por `resolverVistaObra`
 * —o sea, después de traducir los alias viejos (`?vista=gantt` → `tareas/gantt`)—. Recibe los
 * nombres canónicos, no lo que vino en la URL: decidir sobre el crudo haría que un marcador viejo
 * cobrara distinto que el link de la solapa.
 */
export function lecturasDeVista(vista: string, sub: SubTareas): LecturasDeVista {
  const enTareas = vista === 'tareas'
  const esArbol = enTareas && sub === 'arbol'
  const esCronograma = enTareas && sub === 'gantt'
  const esParte = enTareas && sub === 'parte'

  return {
    personas: esCronograma || vista === 'personal' || esParte,
    cuadrillas: vista === 'personal' || esParte || esArbol,
    partes: esParte || esCronograma || vista === 'resumen',
    plan: vista === 'resumen' || vista === 'personal' || vista === 'economia',
    restricciones: vista === 'resumen' || esCronograma || vista === 'operacion',
  }
}
