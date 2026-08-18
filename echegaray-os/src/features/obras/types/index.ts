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
  /** El cliente al que pertenece. La obra cuelga del cliente: es la jerarquía del módulo. */
  cliente_id: string | null
  cliente_slug: string | null
  cliente_nombre: string | null
  /** Lo que dijo la fuente, conservado como procedencia. El que manda es `cliente_id`. */
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
  /** Promedio sobre las actividades PLANIFICADAS (con fecha) que no son de resumen.
   *  Se calcula UNA vez, en la vista `obra_avance`, y de ahí lo leen también /chat y
   *  /control-obras: dos cálculos del mismo número fue el defecto que obligó a unificarlo. */
  avance_pct: number | null
  /** Cuántas actividades entran en ese promedio. Es la cobertura del número, y va a la vista. */
  n_actividades_medidas: number
  /** Actividades reales sin fecha: no se pueden medir todavía, y por eso no entran al promedio. */
  n_actividades_sin_planificar: number
  n_actividades: number
  avance_sincronizado_en: string | null
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
  /** LA IDENTIDAD: `sección/nombre`, derivada del contenido de la fila del tracker. No es la
   *  posición: cuando lo era, insertar una fila hacía que cada actividad pisara a su vecina. */
  clave: string
  seccion: string | null
  /** El `#` del tracker tal como vino. Puede faltar y puede repetirse — en San Francisco esa
   *  columna arranca como código y a la mitad pasa a ser una cantidad. Sirve para mostrar. */
  codigo: string | null
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
  /** Cuándo se congeló la línea base. Con fecha, `sellarBaseline` ya no vuelve a correr. */
  sellada_en: string | null
  /** La persona que responde por la actividad. Una cuadrilla no rinde cuentas; una persona sí. */
  responsable_id: string | null
  hh_plan: number | null
  hh_real: number | null
  /** Archivada NO es borrada: sale del Gantt y de los promedios, y su historia queda. */
  archivada: boolean
  creada_en_web: boolean
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

/** Los cuatro tipos de precedencia. `FS` —termina una, empieza la otra— es el 95% de una obra. */
export const TIPO_DEPENDENCIA = ['FS', 'SS', 'FF', 'SF'] as const
export type TipoDependencia = (typeof TIPO_DEPENDENCIA)[number]

export const TIPO_DEPENDENCIA_LABEL: Record<TipoDependencia, string> = {
  FS: 'termina y recién ahí empieza',
  SS: 'empiezan juntas',
  FF: 'terminan juntas',
  SF: 'empieza una y recién ahí termina la otra',
}

/**
 * UNA PRECEDENCIA entre dos actividades: `origen` habilita a `destino`.
 *
 * La tabla nace vacía y se declara: el dato NO existe en ninguna fuente —el tracker de Drive no
 * tiene columna de predecesoras— y NO se deduce de las fechas. Que una actividad empiece cuando
 * otra termina no prueba que dependa de ella; puede ser que compartan la misma cuadrilla.
 */
export interface Dependencia {
  id: string
  obra_id: string
  origen_id: string
  destino_id: string
  tipo: TipoDependencia
  lag_dias: number
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

/**
 * PLAN CONTRA REAL — una fila por obra, de la vista `obra_plan_vs_real`.
 *
 * La vista publica LAS DOS PUNTAS de cada comparación además del desvío, y anula el desvío cuando
 * le falta una punta. Esos `null` son el dato más importante del tipo: no son "cero", son "falta
 * la otra mitad", y la pantalla tiene que decir cuál falta en vez de dibujar un 0%.
 */
export interface PlanVsReal {
  obra_id: string
  nombre: string
  cliente_id: string | null
  cliente_nombre: string | null
  estado: string
  etapa: Etapa | null
  // Plazo
  inicio_plan: string | null
  fin_plan: string | null
  inicio_base: string | null
  fin_base: string | null
  desvio_plazo_dias: number | null
  actividades_atrasadas: number | null
  actividades_con_baseline: number | null
  // Avance
  avance_pct: number | null
  n_actividades_medidas: number
  n_actividades: number
  // HH
  hh_plan: number | null
  hh_estimada: number | null
  hh_real: number | null
  desvio_hh_pct: number | null
  // Economía
  presupuesto_id: string | null
  monto_presupuestado: number | null
  costo_presupuestado: number | null
  costo_real: number | null
  desvio_costo_pct: number | null
  monto_contratado: number | null
  margen_esperado: number | null
  margen_actual: number | null
  // Contrato
  certificado: number | null
  facturado: number | null
  cobrado: number | null
  pendiente_certificar: number | null
  pendiente_cobrar: number | null
}

/** Una persona del legajo. `personas` es la única fuente de nombres del plantel. */
export interface Persona {
  id: string
  nombre_completo: string
  categoria: string | null
  especialidad: string | null
  fecha_egreso: string | null
}

export const ROLES_ASIGNACION = ['responsable', 'integrante'] as const
export type RolAsignacion = (typeof ROLES_ASIGNACION)[number]

/** Quién trabaja en la obra. `persona` viene del join con `personas`. */
export interface Asignacion {
  id: string
  obra_id: string
  persona_id: string
  rol: RolAsignacion
  cuadrilla: string | null
  actividad_id: string | null
  desde: string | null
  hasta: string | null
  notas: string | null
  persona_nombre: string | null
  persona_especialidad: string | null
}

/** Un certificado de avance contra el contrato base. Las tres etapas van por separado y sin orden
 *  impuesto: un certificado sin facturar y una factura sin cobrar son estados reales, no errores. */
export interface Certificado {
  id: string
  obra_canonica_id: string | null
  numero: string | null
  descripcion: string | null
  fecha_certificacion: string
  monto_certificado: number
  fecha_facturacion: string | null
  monto_facturado: number | null
  referencia_factura: string | null
  fecha_cobranza: string | null
  monto_cobrado: number | null
  notas: string | null
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

/** Días de desvío del fin planificado contra la línea base. Positivo = atrasado.
 *  Devuelve null si no hay baseline: un desvío sin contra qué medir no es cero, es desconocido. */
export function desvioDias(a: Pick<Actividad, 'fin_plan' | 'fin_base'>): number | null {
  if (!a.fin_plan || !a.fin_base) return null
  const ms = new Date(a.fin_plan + 'T00:00:00Z').getTime() - new Date(a.fin_base + 'T00:00:00Z').getTime()
  return Math.round(ms / 86400000)
}
