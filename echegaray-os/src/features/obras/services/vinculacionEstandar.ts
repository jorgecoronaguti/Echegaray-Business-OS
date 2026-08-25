// VINCULAR UNA ACTIVIDAD AL ESTÁNDAR — la decisión de QUÉ se escribe y qué NO se toca.
//
// ═══ EL HECHO QUE ORIGINA ESTE ARCHIVO ═══
//
// Las 350 actividades reales de la empresa entraron por el tracker de Drive y NINGUNA tiene
// `tarea_tipo_id`. El motor nuevo —tarea tipo, análisis, variante, estándar productivo— no las
// conoce, así que la obra no compara contra ningún rendimiento y nada de lo que aprende vuelve a la
// base maestra. Vincularlas es el gesto que las conecta.
//
// ═══ LA REGLA: EL ESTÁNDAR APORTA, NUNCA PISA ═══
//
// Vincular trae el estándar vigente, y traerlo NO puede significar reemplazar lo que la obra ya
// sabe. `hh_plan` y `unidad` sólo se completan si están vacíos. Si el jefe de obra ya cargó 180 hs
// de plan, ése es el dato real de esta obra y el teórico no lo reemplaza: la comparación entre los
// dos ES el control, y pisarlo lo borra.
//
// Y las unidades NO se convierten. m² y m³ del mismo tabique son dos hechos distintos y el factor
// es el espesor, que no está en ninguna de las dos filas. Misma regla que `compararComputoContraPlan`
// en `orquestador/lib/documentacion-obra-vinculo.mjs`.
//
// La lógica vive acá —pura, sin Supabase— porque es la que hay que poder probar sin base. La acción
// (`actionsVinculacion.ts`) lee, llama a esto y escribe lo que esto decidió.

/** Los mismos cuatro estados que publica `public.estado_vinculacion_actividad` (20260822T6100). */
export type EstadoVinculacion = 'no_aplica' | 'sin_vincular' | 'sin_analisis' | 'vinculada'

export interface ActividadAVincular {
  tipo: string | null
  tiempoTecnico: boolean
  tareaTipoId: string | null
  analisisId: string | null
  unidad: string | null
  cantidadObjetivo: number | null
  hhPlan: number | null
}

export interface EstandarVigente {
  tareaTipoId: string
  analisisId: string
  variante: string | null
  unidad: string | null
  hhPorUnidad: number | null
}

/**
 * ESPEJO EXACTO de `public.estado_vinculacion_actividad(text, boolean, uuid, uuid)`.
 *
 * Existe en los dos lados porque los dos lo necesitan —la vista para listar, el panel para dibujar—
 * y el test de la migración mide el de la base contra estos mismos casos. Si alguna vez difieren,
 * la pantalla diría una cosa y el listado otra sobre la misma actividad.
 */
export function estadoVinculacion(a: Pick<ActividadAVincular,
  'tipo' | 'tiempoTecnico' | 'tareaTipoId' | 'analisisId'>): EstadoVinculacion {
  if ((a.tipo ?? 'tarea') !== 'tarea') return 'no_aplica'
  if (a.tiempoTecnico) return 'no_aplica'
  if (a.tareaTipoId === null) return 'sin_vincular'
  if (a.analisisId === null) return 'sin_analisis'
  return 'vinculada'
}

/** Dos unidades son la misma si lo son al escribirlas de cualquier manera: «M2», «m²», «m 2». No
 *  convierte nada — sólo decide si comparar tiene sentido. */
export function mismaUnidad(a: string | null, b: string | null): boolean {
  const plano = (u: string | null) => (u ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/²/g, '2').replace(/³/g, '3').replace(/[^a-z0-9]/g, '')
  return plano(a) === plano(b)
}

export interface PlanDeVinculacion {
  /** Lo que se va a escribir en `obra_actividad`. Sólo campos que cambian. */
  patch: { tarea_tipo_id: string; analisis_id: string; unidad?: string; hh_plan?: number }
  /** Qué trajo el estándar, en castellano, para mostrarlo después de guardar. */
  trajo: string[]
  /** Qué NO tocó y por qué. Es la mitad importante: sin esto, «guardado» no dice si pisó algo. */
  respeto: string[]
}

/**
 * QUÉ ESCRIBE UNA VINCULACIÓN.
 *
 * Siempre el vínculo. La unidad y el `hh_plan`, sólo si la actividad no los tiene. Nunca una
 * conversión de unidades.
 */
export function planDeVinculacion(
  actividad: ActividadAVincular, estandar: EstandarVigente,
): PlanDeVinculacion {
  const patch: PlanDeVinculacion['patch'] = {
    tarea_tipo_id: estandar.tareaTipoId,
    analisis_id: estandar.analisisId,
  }
  const trajo: string[] = []
  const respeto: string[] = []

  if (actividad.unidad === null && estandar.unidad !== null) {
    patch.unidad = estandar.unidad
    trajo.push(`unidad ${estandar.unidad}`)
  } else if (actividad.unidad !== null && !mismaUnidad(actividad.unidad, estandar.unidad)) {
    respeto.push(`la actividad se mide en ${actividad.unidad} y el estándar en ${estandar.unidad ?? 'sin unidad'} — no se convierte`)
  }

  const unidadDelPlan = patch.unidad ?? actividad.unidad
  if (actividad.hhPlan !== null) {
    respeto.push(`hh_plan ya cargado (${actividad.hhPlan}) — el estándar no reemplaza lo que la obra planificó`)
  } else if (estandar.hhPorUnidad === null) {
    respeto.push('el análisis no publica hs por unidad')
  } else if (actividad.cantidadObjetivo === null) {
    respeto.push('la actividad no tiene cantidad objetivo: sin cantidad no hay hh_plan')
  } else if (!mismaUnidad(unidadDelPlan, estandar.unidad)) {
    respeto.push('las unidades no coinciden: el hh_plan no se calcula')
  } else {
    patch.hh_plan = Math.round(estandar.hhPorUnidad * actividad.cantidadObjetivo * 100) / 100
    trajo.push(`hh_plan ${patch.hh_plan} (${estandar.hhPorUnidad} hs × ${actividad.cantidadObjetivo})`)
  }

  return { patch, trajo, respeto }
}

/** El resumen que ve la persona después de guardar. Nombra siempre lo que NO se tocó. */
export function resumenDeVinculacion(plan: PlanDeVinculacion): string {
  const partes: string[] = ['Vinculada.']
  if (plan.trajo.length) partes.push(`Trajo del estándar: ${plan.trajo.join(', ')}.`)
  if (plan.respeto.length) partes.push(`Sin tocar: ${plan.respeto.join('; ')}.`)
  return partes.join(' ')
}
