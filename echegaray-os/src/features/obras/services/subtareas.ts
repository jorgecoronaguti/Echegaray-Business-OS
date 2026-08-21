// QUÉ ES UNA SUBTAREA Y QUÉ ES UNA ACTIVIDAD DEL PLAN. NÚCLEO PURO.
//
// ═══ EL DEFECTO QUE ESTO ARREGLA (21/08/2026) ═══
//
// `actividad_padre_id` cambió de significado y nadie movió el filtro que lo leía.
//
// Cuando la columna nació (`20260819T4700`) sólo la usaba una cosa: una TAREA que descompone una
// actividad. Por eso el Gantt, la Lista, el Tablero y Próximos mostraban `!a.actividad_padre_id` —
// «todo lo que no es una subtarea»— y funcionaba, porque la columna estaba NULL en las 350 filas.
//
// `20260821T2000` la convirtió en la arista real del árbol de la obra y le colgó **161 actividades
// de su rubro**. Con el filtro viejo, esas 161 dejaron de ser «actividades del plan» y pasaron a
// leerse como subtareas: el Gantt de `le-comedor` quedó con CERO barras teniendo 39 actividades
// vivas, y nada falló. La pantalla abría, la tabla se dibujaba, y el plan no estaba.
//
// La distinción correcta la da el TIPO DEL PADRE, que es lo que la base hace cumplir desde esa
// misma migración:
//
//   · hija de un `resumen`  → es una actividad del plan, dentro de su rubro/sector/frente;
//   · hija de una ejecutable → es una SUBTAREA, un ítem de la lista de esa actividad. No va al
//     Gantt ni al promedio de avance: pesaría doble contra una actividad que nadie partió.

interface FilaJerarquica {
  id: string
  tipo: string
  actividad_padre_id: string | null
}

/** ¿Esta fila descompone a otra actividad, en vez de ser una del plan? */
export function esSubtarea<T extends FilaJerarquica>(fila: T, porId: Map<string, T>): boolean {
  if (!fila.actividad_padre_id) return false
  const padre = porId.get(fila.actividad_padre_id)
  // Un padre que no está en la lista —archivado, o de otra ventana— no convierte a nadie en
  // subtarea: preferimos mostrarla en el plan a que desaparezca sin que nadie se entere.
  if (!padre) return false
  return padre.tipo !== 'resumen'
}

/** Las filas que SON del plan, y las subtareas indexadas por la actividad que descomponen. */
export function separarPlanYSubtareas<T extends FilaJerarquica>(
  filas: readonly T[],
): { plan: T[]; subtareas: Map<string, T[]> } {
  const porId = new Map(filas.map((f) => [f.id, f]))
  const plan: T[] = []
  const subtareas = new Map<string, T[]>()
  for (const f of filas) {
    if (!esSubtarea(f, porId)) { plan.push(f); continue }
    const padre = f.actividad_padre_id as string
    const previas = subtareas.get(padre) ?? []
    previas.push(f)
    subtareas.set(padre, previas)
  }
  return { plan, subtareas }
}
