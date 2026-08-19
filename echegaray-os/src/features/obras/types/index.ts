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
  /** NO HAY `hh_real` ACÁ. Se cargaba a mano en el panel de la actividad, al lado de las horas
   *  imputadas de verdad en `registros_hh`: dos números para el mismo hecho. La columna se borró de
   *  la base el 19/08/2026 con 0 filas cargadas de 344. HH real por actividad la publica
   *  `obra_actividad_hh` sumando las imputaciones, y es el único cálculo. */
  /** Archivada NO es borrada: sale del Gantt y de los promedios, y su historia queda. */
  archivada: boolean
  creada_en_web: boolean

  // ═══ LO QUE AGREGA `obra_actividad_control` ═══
  //
  // Gantt, Lista, Tablero, Próximos, Ejecución y Plan vs Real leen TODOS la misma vista. Antes el
  // Gantt leía la tabla y Plan vs Real una vista aparte: dos caminos al mismo trabajo es cómo se
  // llega a que dos pantallas muestren distinto avance de la misma actividad.

  /** El nombre de la actividad de resumen que la cuelga. La jerarquía ya vivía en `codigo_padre`;
   *  esto es sólo publicar el nombre en vez del código. */
  rubro: string | null
  unidad: string | null
  cantidad_objetivo: number | null
  /** `cantidad` · `partes` · `manual`. Ver `avance_pct` y `origen_avance`. */
  metodo_avance: MetodoAvance
  cuadrilla_id: string | null
  /** La cuadrilla PREVISTA. Quién trabajó de verdad sale de `registros_hh`. */
  cuadrilla_prevista: string | null
  partida_codigo: string | null
  partida_cantidad: number | null

  cantidad_ejecutada: number | null
  n_partes: number
  ultimo_parte: string | null
  hh_real: number | null
  hh_extra: number | null
  n_imputaciones: number
  impedimentos_abiertos: number

  /** EL avance. Calculado desde la producción, sumado de los partes, o el declarado — y
   *  `origen_avance` dice cuál de los tres, porque no valen lo mismo. */
  avance_pct: number | null
  origen_avance: OrigenAvance | null
  /** El estado cargado, salvo que haya un impedimento abierto: entonces `bloqueada`. NO se guarda
   *  —se deriva—, así que resolver el impedimento la destraba sola. */
  estado_operativo: EstadoActividad | 'bloqueada'
  /** Unidades por hora hombre. Existe sólo con producción física Y horas imputadas. */
  productividad: number | null
  consumo_hh_pct: number | null

  /** Si está, esta fila es una TAREA de esa actividad. Un solo nivel: una tarea no tiene tareas.
   *  Las tareas NO se dibujan en el Gantt, la Lista ni el Tablero —pesarían doble contra una
   *  actividad que nadie partió—: viven dentro del panel de su actividad. */
  actividad_padre_id: string | null
  n_tareas: number
  n_tareas_hechas: number
  /** Pedidos de material colgados de esta actividad. El pedido sigue siendo de la OBRA: esto sólo
   *  dice para qué se pidió, cuando alguien lo declaró. */
  n_pedidos: number
}

/** Los cinco estados del tablero. `bloqueada` NO se guarda: sale de tener un impedimento abierto. */
export const ESTADOS_ACTIVIDAD = ['pendiente', 'lista', 'en_curso', 'hecha'] as const
export type EstadoActividad = (typeof ESTADOS_ACTIVIDAD)[number]

export const ESTADO_LABEL: Record<EstadoActividad | 'bloqueada', string> = {
  pendiente: 'Pendiente',
  lista: 'Lista',
  en_curso: 'En curso',
  bloqueada: 'Bloqueada',
  hecha: 'Hecha',
}

/** El orden del tablero, de izquierda a derecha. */
export const COLUMNAS_TABLERO = ['pendiente', 'lista', 'en_curso', 'bloqueada', 'hecha'] as const

export type MetodoAvance = 'cantidad' | 'partes' | 'manual'
export type OrigenAvance = 'cantidad' | 'partes' | 'declarado'

export const METODO_LABEL: Record<MetodoAvance, string> = {
  cantidad: 'Se calcula desde la producción cargada',
  partes: 'Se suma de los partes diarios',
  manual: 'Lo declara una persona',
}

/**
 * Las unidades de medición de obra.
 *
 * NO ES UN CHECK EN LA BASE y no debe serlo: el catálogo de una constructora crece con cada obra
 * —un día aparece «jornal», otro «gl»— y una migración para poder cargar una unidad nueva es la
 * clase de fricción que hace que se deje de usar la pantalla. La lista es una AYUDA de carga; el
 * campo acepta lo que haga falta.
 */
export const UNIDADES = ['m²', 'm³', 'ml', 'm', 'un', 'kg', 'tn', 'l', 'gl', 'h', 'jornal', '%'] as const

/** Un parte de ejecución: lo que pasó un día en una actividad. Es un HECHO y no se reescribe. */
export interface ParteEjecucion {
  id: string
  obra_id: string
  actividad_id: string
  fecha: string
  cantidad: number | null
  avance_pct: number | null
  comentario: string | null
  fuente: string
  creado_en: string
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

/** `archivo` o `carpeta`. Es lo único que hay que saber para armar la URL de Drive: un id de
 *  carpeta abierto como archivo da 404, y al revés también. */
export type TipoDrive = 'archivo' | 'carpeta'

/** Lo que se pudo leer de un enlace de Drive pegado. `mime_type` sólo viene cuando la URL LO DICE
 *  —una hoja de cálculo, un doc, una carpeta—; para un `/file/d/` genérico es null, porque la URL
 *  no dice qué hay adentro y adivinarlo sería fabricar un dato. */
export interface ReferenciaDrive {
  drive_file_id: string
  tipo: TipoDrive
  mime_type: string | null
}

/**
 * Un archivo o carpeta de Drive vinculado a la obra. El archivo NO se copia: vive en Drive.
 *
 * `name` es el nombre RESUELTO, no el guardado: `getDocumentos` le da precedencia a `drive_index`
 * —el espejo de Drive— y recién si el archivo no está indexado usa el que se guardó al vincular.
 * Así un archivo renombrado en Drive aparece con su nombre nuevo sin tocar el vínculo.
 */
export interface DocumentoObra {
  drive_file_id: string
  rol: string | null
  origen: 'confirmado' | 'inferido'
  tipo: TipoDrive
  name: string | null
  path: string | null
  mime_type: string | null
  modified_time: string | null
  creado_en: string | null
  /** Para qué actividad de la obra es. NULL es lo normal: un plano general no es de ninguna. */
  actividad_id: string | null
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
/** El plantel elegible, tal como lo publica `persona_plantel`: CINCO columnas y ninguna más. El
 *  puesto y la fecha de ingreso quedaron afuera de esa vista a propósito —ver el comentario de
 *  `vistas-security-invoker.test.mjs`—, así que tampoco están acá. */
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
  /** El nombre de la cuadrilla canónica, con el texto legacy ('1', '2') como respaldo. */
  cuadrilla: string | null
  cuadrilla_id: string | null
  actividad_id: string | null
  desde: string | null
  hasta: string | null
  notas: string | null
  persona_nombre: string | null
  persona_especialidad: string | null
  /** La categoría de convenio, para la columna «Rol / categoría». Sale de `persona_plantel`: no se
   *  copia en la asignación, porque el día que se corrija el legajo la copia envejecería sola. */
  persona_categoria: string | null
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
