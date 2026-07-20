import type { SupabaseClient } from '@supabase/supabase-js'

// INTELIGENCIA ORGANIZACIONAL — la biblioteca de las 8 áreas, para la web.
//
// Lee `public.biblioteca_completa`, la MISMA vista que consume el chat y `os.mjs`. No recalcula ni
// duplica: si acá aparece un número distinto al del chat, es un bug, no una diferencia de criterio.
// Esa es la regla de fuente única del proyecto.
//
// Un área sin piezas NO se oculta: se muestra en cero. El hueco es la información más accionable
// que puede dar esta pantalla — "Calidad no sabe nada" es trabajo, no un espacio en blanco.

/** Las 8 áreas oficiales. Espejo de `public.area_canonica`, en el orden del programa. */
export const AREAS_OFICIALES = [
  { clave: 'compras', nombre: 'Compras' },
  { clave: 'administracion_finanzas', nombre: 'Administración y Finanzas' },
  { clave: 'obras', nombre: 'Obras' },
  { clave: 'personas', nombre: 'Personas' },
  { clave: 'contabilidad_legales', nombre: 'Contabilidad y Legales' },
  { clave: 'comercial', nombre: 'Comercial / Cotización' },
  { clave: 'calidad', nombre: 'Calidad' },
  { clave: 'gestion_general', nombre: 'Gestión General' },
] as const

export interface PiezaBiblioteca {
  area: string | null
  tipo: string
  titulo: string
  confianza: string | null
  activo: boolean
  origen_tabla: string
}

export interface ResumenArea {
  clave: string
  nombre: string
  total: number
  /** Conteo por tipo de pieza. Lo que falta se ve porque queda en cero, no porque se oculte. */
  porTipo: Record<string, number>
  huecos: string[]
}

/** Los tipos que debería tener toda área sana, con el hueco que se declara si faltan. */
const EXIGIDOS: Array<{ tipo: string; hueco: string }> = [
  { tipo: 'afirmacion', hueco: 'sin conocimiento confirmado' },
  { tipo: 'fuente', hueco: 'sin fuente de datos declarada' },
  { tipo: 'kpi', hueco: 'sin KPI: no se puede medir si mejora' },
  { tipo: 'framework', hueco: 'sin criterio profesional asignado' },
  { tipo: 'playbook', hueco: 'sin playbook: se improvisa' },
]

export async function getBiblioteca(
  supabase: SupabaseClient,
): Promise<{ areas: ResumenArea[]; sinClasificar: number; error: string | null }> {
  const { data, error } = await supabase
    .from('biblioteca_completa')
    .select('area, tipo, titulo, confianza, activo, origen_tabla')

  if (error) return { areas: [], sinClasificar: 0, error: error.message }

  const piezas = (data ?? []) as PiezaBiblioteca[]

  const areas: ResumenArea[] = AREAS_OFICIALES.map((a) => {
    const propias = piezas.filter((p) => p.area === a.clave)
    const porTipo: Record<string, number> = {}
    for (const p of propias) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1
    const huecos = EXIGIDOS.filter((e) => !porTipo[e.tipo]).map((e) => e.hueco)
    return { clave: a.clave, nombre: a.nombre, total: propias.length, porTipo, huecos }
  })

  // Las piezas sin área son trabajo real (hoy: pendientes del backlog sin origen rastreable).
  // Se cuentan y se muestran; esconderlas daría una sensación falsa de cobertura completa.
  const sinClasificar = piezas.filter((p) => p.area === null).length

  return { areas, sinClasificar, error: null }
}

/** Detalle de un área: las piezas agrupadas por tipo, para la vista de una sola área. */
export async function getAreaDetalle(
  supabase: SupabaseClient,
  clave: string,
): Promise<{ piezas: PiezaBiblioteca[]; error: string | null }> {
  const { data, error } = await supabase
    .from('biblioteca_completa')
    .select('area, tipo, titulo, confianza, activo, origen_tabla')
    .eq('area', clave)
    .order('tipo')

  if (error) return { piezas: [], error: error.message }
  return { piezas: (data ?? []) as PiezaBiblioteca[], error: null }
}
