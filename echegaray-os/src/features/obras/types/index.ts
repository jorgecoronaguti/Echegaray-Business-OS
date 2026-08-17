// MÓDULO 01 — OBRAS · los tipos del dominio.
//
// FRONTERA: Obras no administra Compras, Finanzas ni Personal. El costo real que aparece acá sale
// de `obra_panel`, que lo calcula desde `costos_obra` por alias — no hay una columna de costo en
// ninguna tabla de este módulo, y no debe haberla. Lo mismo con HH y con cobranza.

/** Las cinco etapas del ciclo de vida, en su orden. La etapa gobierna qué habilita el módulo. */
export const ETAPAS = ['previo', 'inicio', 'desarrollo', 'terminacion', 'cierre'] as const
export type Etapa = (typeof ETAPAS)[number]

export const ETAPA_LABEL: Record<Etapa, string> = {
  previo: 'Previo',
  inicio: 'Inicio',
  desarrollo: 'Desarrollo',
  terminacion: 'Terminación',
  cierre: 'Cierre',
}

/** Una fila del portafolio. Todo sale de la vista `obra_panel`. */
export interface ObraPanel {
  obra_id: string
  nombre: string
  cliente_texto: string | null
  estado: string
  tipo: string
  /** Puede ser NULL: la etapa que nadie declaró no se inventa con un default. */
  etapa: Etapa | null
  jefe_obra: string | null
  monto_contratado: number | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  fecha_inicio_real: string | null
  fecha_fin_real: string | null
  drive_carpeta_id: string | null
  costo_real: number | null
  n_comprobantes: number | null
  margen_sobre_contratado_pct: number | null
  /** Promedio sobre las actividades PLANIFICADAS (con fecha) que no son de resumen. */
  avance_pct: number | null
  /** Cuántas actividades entran en ese promedio. Es la cobertura del número, y va a la vista. */
  n_actividades_medidas: number
  n_actividades: number
  restricciones_abiertas: number
  restricciones_vencidas: number
}

export type TipoActividad = 'tarea' | 'resumen' | 'hito'

/** Una actividad del cronograma. `inicio_base`/`fin_base` es la línea base congelada: si están en
 *  null, la obra todavía no tiene plan aprobado y el desvío no se puede medir — se dice, no se
 *  dibuja un cero. */
export interface Actividad {
  id: string
  obra_id: string
  codigo: string
  codigo_padre: string | null
  nombre: string
  tipo: TipoActividad
  orden: number
  inicio_plan: string | null
  fin_plan: string | null
  dias_plan: number | null
  inicio_real: string | null
  fin_real: string | null
  dias_real: number | null
  inicio_base: string | null
  fin_base: string | null
  pct: number | null
  estado: string | null
  cuadrilla: string | null
  comentario: string | null
  editado_a_mano: boolean
  fuente_pestana: string | null
}

export const TIPO_RESTRICCION = [
  'material', 'informacion', 'equipo', 'mano_de_obra', 'trabajo_previo',
  'permiso', 'ingenieria_cliente', 'seguridad', 'acceso', 'contrato', 'otro',
] as const
export type TipoRestriccion = (typeof TIPO_RESTRICCION)[number]

export const TIPO_RESTRICCION_LABEL: Record<TipoRestriccion, string> = {
  material: 'Material',
  informacion: 'Información / plano',
  equipo: 'Equipo',
  mano_de_obra: 'Mano de obra',
  trabajo_previo: 'Trabajo previo',
  permiso: 'Permiso / habilitación',
  ingenieria_cliente: 'Ingeniería del cliente',
  seguridad: 'Seguridad',
  acceso: 'Espacio / acceso',
  contrato: 'Contrato / adicional',
  otro: 'Otro',
}

/** Una restricción del make-ready. Sin `responsable` y sin `fecha_compromiso` no es gestión: es una
 *  queja anotada. Las dos columnas existen desde el día uno por eso. */
export interface Restriccion {
  id: string
  obra_id: string
  actividad_id: string | null
  tipo: TipoRestriccion
  descripcion: string
  responsable: string | null
  fecha_necesidad: string | null
  fecha_compromiso: string | null
  fecha_liberacion: string | null
  estado: 'abierta' | 'en_curso' | 'liberada'
}

/** Un archivo de Drive vinculado a la obra. El archivo NO se copia: vive en Drive. */
export interface DocumentoObra {
  drive_file_id: string
  rol: string | null
  origen: 'manual' | 'path_inferido'
  name: string | null
  path: string | null
  mime_type: string | null
  modified_time: string | null
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

/** Días de desvío del fin planificado contra la línea base. Positivo = atrasado.
 *  Devuelve null si no hay baseline: un desvío sin contra qué medir no es cero, es desconocido. */
export function desvioDias(a: Pick<Actividad, 'fin_plan' | 'fin_base'>): number | null {
  if (!a.fin_plan || !a.fin_base) return null
  const ms = new Date(a.fin_plan + 'T00:00:00Z').getTime() - new Date(a.fin_base + 'T00:00:00Z').getTime()
  return Math.round(ms / 86400000)
}
