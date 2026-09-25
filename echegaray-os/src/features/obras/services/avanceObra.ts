// EL AVANCE DE ERP OBRAS SE MIDE POR TAREAS — UNA SOLA DEFINICIÓN (dueño, 25/09/2026).
//
// «En ERP Obras el avance se mide por TAREAS; en el CRM de Administración, por la plata cotizada y
// consumida.» La cartera decía Quattropani 47 % y el Resumen de la misma obra 27 %, ponderado por
// costo de MO: dos números para el mismo concepto. Desde acá, la cartera, el Resumen (PC y teléfono),
// el cierre y el avance de rubro/épica/historia en Tareas salen de ESTA regla. El peso por costo de MO
// sigue existiendo como PESO (columna «Pond.», ponderación), nunca como «Avance».
//
// LA REGLA ES LA DE `public.obra_avance` (Postgres, 20260821T4000), escrita acá para poder aplicarla a
// un subárbol: cuentan las tareas (no `resumen`, no colgadas de otra tarea) CON fecha de plan; si
// alguna de las medidas tiene HH plan, se pondera por HH; si no, promedio simple; se redondea a entero.
// La obra entera NO se recalcula en el navegador: la cartera y el Resumen leen `obra_panel.avance_pct`,
// que es esa vista, por `cifraAvanceObra`. Si alguien cambia la vista, cambia esto también.

export interface TareaParaAvance {
  avance_pct: number | null
  inicio_plan: string | null
  hh_plan: number | null
}

/** El avance de un conjunto de tareas, con la regla de `obra_avance`. `null` = ninguna tarea medida. */
export function avancePorTareas(tareas: readonly TareaParaAvance[]): number | null {
  const conAvance = tareas.filter((t) => t.inicio_plan != null && t.avance_pct != null)
  const conHH = conAvance.filter((t) => t.hh_plan != null)
  const sumaHH = conHH.reduce((s, t) => s + Number(t.hh_plan), 0)
  if (sumaHH > 0) return Math.round(conHH.reduce((s, t) => s + Number(t.avance_pct) * Number(t.hh_plan), 0) / sumaHH)
  if (conAvance.length === 0) return null
  return Math.round(conAvance.reduce((s, t) => s + Number(t.avance_pct), 0) / conAvance.length)
}

/** Lo que la cartera y el Resumen leen de `obra_panel` para el avance. */
export interface ObraConAvance {
  avance_pct: number | null
  n_actividades_medidas?: number | null
  n_actividades?: number | null
}

/**
 * LA CIFRA DE AVANCE DE UNA OBRA, IGUAL EN TODAS LAS CARAS: «47%» (sin espacio, como el diseño 01/03)
 * con «86 de 95 tareas medidas». Sin cifra, la palabra: «sin tareas» o «sin medir» — nunca 0 %.
 */
export function cifraAvanceObra(o: ObraConAvance): { valor: string | null; bajada: string; falta: string } {
  const n = o.n_actividades ?? null
  const medidas = o.n_actividades_medidas ?? null
  const bajada = n == null ? '' : n === 0 ? 'sin tareas' : `${medidas ?? 0} de ${n} tareas medidas`
  if (o.avance_pct == null) return { valor: null, bajada, falta: n === 0 ? 'sin tareas' : 'sin medir' }
  return { valor: `${Math.round(o.avance_pct)}%`, bajada, falta: '' }
}
