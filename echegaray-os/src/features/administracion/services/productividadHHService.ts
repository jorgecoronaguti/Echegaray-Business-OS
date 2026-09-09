// LAS LECTURAS DE PRODUCTIVIDAD. Ni una regla acá: trae filas y las agrupa por actividad.
//
// La cuenta —y sobre todo la negativa de hacerla cuando falta el dato— vive en `productividadHH.ts`,
// que se prueba sin Supabase.
//
// ═══ LO QUE ESTE ARCHIVO SABE Y LA PANTALLA TIENE QUE DECIR ═══
//
// `registros_hh` NO tiene columna de cantidad ejecutada ni de unidad, y `obra_actividad` tampoco
// tiene cantidad prevista. Por eso las tres viajan en `null` desde acá y TODA línea sale hoy con
// «no se puede medir». No es un bug de esta pantalla: es el pedido de §7 del handoff, y publicarlo
// es lo que lo convierte en trabajo en vez de en una intención.
//
// ═══ SÓLO HORAS TRABAJADAS ═══
//
// Una licencia paga no produjo unidades, y meterla en el numerador de HH/unidad empeoraría el
// rendimiento de la actividad por un día de lluvia. `esTrabajada` es la misma definición que usa la
// liquidación; acá se reusa, no se reescribe.

import type { SupabaseClient } from '@supabase/supabase-js'
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import {
  medirActividad, resumenProductividad,
  type ActividadConHH, type LineaProductividad, type ResumenProductividad,
} from './productividadHH.ts'
import type { Quincena } from './quincena.ts'

export interface ProductividadDeLaQuincena {
  lineas: LineaProductividad[]
  resumen: ResumenProductividad
  errores: { que: string; error: string }[]
}

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

const numero = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

interface FilaHH {
  actividad_id: string | null
  horas: number | string | null
  tipo_hora: string
}

interface FilaActividad {
  id: string
  nombre: string
  obra_id: string
  hh_plan: number | string | null
  pct: number | string | null
}

/** LAS TRES LECTURAS EN UNA TANDA. */
export async function getProductividadDeLaQuincena(
  supabase: SupabaseClient, q: Quincena,
): Promise<ProductividadDeLaQuincena> {
  const [hh, actividades, obras] = await Promise.all([
    supabase.from('registros_hh')
      .select('actividad_id, horas, tipo_hora')
      .gte('fecha', q.desde).lte('fecha', q.hasta),
    supabase.from('obra_actividad').select('id, nombre, obra_id, hh_plan, pct'),
    supabase.from('obra_canonica').select('id, nombre'),
  ])

  const errores: { que: string; error: string }[] = []
  // UN MENSAJE VACÍO NO ES UN MENSAJE. PostgREST devuelve 403 con `message: ""` cuando falta el
  // GRANT, y un aviso en blanco manda a leer los logs para descubrir que la tabla está cerrada.
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (!e || sinTabla(e)) return
    const texto = e.message?.trim()
    errores.push({
      que,
      error: texto || `la base rechazó la consulta (permiso o GRANT faltante${e.code ? `, código ${e.code}` : ''}).`,
    })
  }
  anotar('las horas de la quincena', hh.error)
  anotar('las actividades de obra', actividades.error)
  anotar('las obras', obras.error)

  const nombreObra = new Map(
    ((obras.data ?? []) as { id: string; nombre: string }[]).map((o) => [o.id, o.nombre]),
  )
  const porActividad = new Map(
    ((actividades.data ?? []) as FilaActividad[]).map((a) => [a.id, a]),
  )

  const { horasPorActividad, hhSinActividad } = agrupar(hh.data)
  const lineas = [...horasPorActividad.entries()]
    .map(([id, horas]) => medirActividad(entradaDe(id, horas, porActividad.get(id), nombreObra)))
    // LAS QUE MÁS HORAS SE LLEVARON, PRIMERO: es donde una medición cambia más plata.
    .sort((a, b) => b.hh - a.hh)

  return { lineas, resumen: resumenProductividad(lineas, hhSinActividad), errores }
}

/**
 * HORAS POR ACTIVIDAD, Y LAS QUE NO TIENEN NINGUNA APARTE.
 *
 * Las huérfanas NO se reparten entre las actividades cargadas: eso movería el rendimiento de la obra
 * que cargó bien el parte hacia la que no lo cargó. Se cuentan y se muestran en su propia línea.
 */
function agrupar(data: unknown): { horasPorActividad: Map<string, number>; hhSinActividad: number } {
  const filas = ((data ?? []) as FilaHH[]).filter((f) => esTrabajada(f.tipo_hora))
  const horasPorActividad = new Map<string, number>()
  let hhSinActividad = 0
  for (const f of filas) {
    const h = numero(f.horas)
    if (f.actividad_id == null) { hhSinActividad += h; continue }
    horasPorActividad.set(f.actividad_id, (horasPorActividad.get(f.actividad_id) ?? 0) + h)
  }
  return { horasPorActividad, hhSinActividad }
}

/**
 * LA ENTRADA DE UNA ACTIVIDAD. `unidad`, `cantidadEjecutada` y `cantidadPlan` van en `null` porque
 * NO EXISTEN EN EL MODELO — no porque estén vacías. El día que las columnas se agreguen, este es el
 * único lugar que cambia: la cuenta y la pantalla ya saben qué hacer con ellas.
 */
function entradaDe(
  id: string, hh: number, a: FilaActividad | undefined, nombreObra: Map<string, string>,
): ActividadConHH {
  const obra = a ? (nombreObra.get(a.obra_id) ?? a.obra_id) : null
  return {
    actividadId: id,
    etiqueta: a ? `${obra} · ${a.nombre}` : 'Actividad que ya no existe',
    hh: Math.round(hh * 100) / 100,
    hhPlan: a?.hh_plan == null ? null : numero(a.hh_plan),
    pct: a?.pct == null ? null : numero(a.pct),
    unidad: null,
    cantidadEjecutada: null,
    cantidadPlan: null,
  }
}
