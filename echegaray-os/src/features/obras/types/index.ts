// MÓDULO 01 — OBRAS · los tipos del dominio.
//
// FRONTERA: Obras no administra Compras, Finanzas ni Personal. El costo real que aparece acá sale
// de `obra_panel`, que lo calcula desde `costos_obra` por alias — no hay una columna de costo en
// ninguna tabla de este módulo, y no debe haberla. Lo mismo con HH y con cobranza.

import type { FechasDeActividad } from './fechas.ts'

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
  // ═══ LAS FECHAS DE LA OBRA SON LAS DE SU PLAN (`obra_fechas`) ═══
  // La envolvente de sus actividades; el campo del formulario queda de respaldo y viaja aparte como
  // `*_declarado`. Antes la cabecera leía el formulario y el Resumen la envolvente: 8 de 11 obras
  // decían dos fechas distintas.
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  /** REAL: evidencia de las actividades o declaración PASADA. Nunca una fecha futura. */
  fecha_inicio_real: string | null
  fecha_fin_real: string | null
  fecha_inicio_plan_declarado: string | null
  fecha_fin_plan_declarado: string | null
  fecha_inicio_real_declarado: string | null
  fecha_fin_real_declarado: string | null
  /** `plan de actividades` · `declarado en la obra` · `null` si no hay ninguna fecha. */
  origen_fechas_plan: string | null
  origen_inicio_real: string | null
  /** Cuándo termina la obra al ritmo medido: el mayor forecast de sus actividades. */
  forecast_fin: string | null
  /** Actividades sin NINGUNA fecha. Es lo que falta programar, y se dice en todas las pantallas. */
  n_actividades_sin_fecha: number
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

// Las fechas de la actividad tienen su propio archivo: son el contrato de una vista.
export type { EstadoFecha, FechasDeActividad } from './fechas.ts'

/** Una actividad del cronograma. `inicio_base`/`fin_base` es la línea base congelada: si están en
 *  null, la obra todavía no tiene plan aprobado y el desvío no se puede medir — se dice, no se
 *  dibuja un cero. */
export interface Actividad extends FechasDeActividad {
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

  // ═══ LO QUE AGREGÓ EL MODELO DEL 21/08/2026 ═══
  //
  // Las cuatro primeras salen de `obra_actividad_control`; las cuatro últimas, de la tabla. Todas
  // llegan `undefined` en una base donde la migración todavía no se aplicó —el `select *` de
  // PostgREST devuelve las columnas que existan— y por eso el tipo las declara opcionales: una
  // migración en el repositorio no es una migración aplicada.
  n_pasos?: number
  n_pasos_hechos?: number
  /** La suma de los pesos de los pasos. Es la BASE del porcentaje, no el porcentaje. */
  peso_pasos?: number | null
  /** Qué es este contenedor dentro de la obra. NULL es válido: una obra chica no declara sectores. */
  rol_estructura?: 'rubro' | 'sector' | 'nivel' | 'frente' | 'elemento' | null
  /** El tope de personas simultáneas. Es del FRENTE: más gente que el tope no acorta el plazo. */
  tope_frente?: number | null
  dotacion_prevista?: number | null
  /** El análisis de la base maestra con el que se planificó. Sin él no hay rendimiento ni duración. */
  analisis_id?: string | null
  /** La tarea tipo de la base maestra. Es la llave del histórico (`rendimiento_recomendado`). */
  tarea_tipo_id?: string | null
  /** La partida del presupuesto de la que salió. Con ella se llega al análisis CONGELADO. */
  cotizacion_partida_id?: string | null
  /** Marca lo que NO se comprime con más gente: curado, fraguado, secado. Sus `dias_plan` son días
   *  fijos y entran aparte en la división HH ÷ capacidad. */
  tiempo_tecnico?: boolean | null
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

// LOS CUATRO MÉTODOS. `pasos` se agregó el 21/08/2026 y `partes` NO se retiró: son 141 actividades
// vivas que hoy se miden así, y sacarlo obligaría a reinterpretarlas sin que nadie lo haya pedido.
export type MetodoAvance = 'cantidad' | 'pasos' | 'partes' | 'manual'
export type OrigenAvance = 'cantidad' | 'pasos' | 'partes' | 'declarado'

export const METODO_LABEL: Record<MetodoAvance, string> = {
  cantidad: 'Se calcula desde la producción cargada',
  pasos: 'Pasos ponderados',
  partes: 'Se suma de los partes diarios',
  manual: 'Lo declara una persona',
}

/** El rótulo corto de la columna MEDICIÓN. `null` no es un método: es una deuda de carga. */
export const METODO_CORTO: Record<MetodoAvance, string> = {
  cantidad: 'Cantidad', pasos: 'Pasos', partes: 'Partes', manual: 'Manual',
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
  /** De dónde salió el vínculo. `carpeta_drive` NO es lo mismo que `confirmado`: es evidencia dura
   *  —el archivo está adentro de la carpeta de Drive que declara la obra, alguien lo puso ahí— pero
   *  nadie lo afirmó todavía. Mostrarlos con la misma palabra borraría exactamente la distinción
   *  que permite saber qué falta revisar. */
  origen: 'confirmado' | 'inferido' | 'carpeta_drive'
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
  // Plazo real y proyectado — la misma fuente que la cabecera de la ficha (`obra_fechas`).
  inicio_real: string | null
  fin_real: string | null
  forecast_fin: string | null
  desvio_forecast_dias: number | null
  /** Actividades sin ninguna fecha: el plan que todavía no existe, contado. */
  actividades_sin_fecha: number
  origen_fechas_plan: string | null
  /** El fin declarado a mano en la ficha de la obra. Se muestra rotulado, nunca como «el plan». */
  fin_plan_declarado: string | null
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

/**
 * LO QUE PUEDE NO EXISTIR, sin que eso sea un fallo.
 *
 * `ServiceResult` obliga a que `data: null` venga con un `error: string`, y ese contrato empujaba a
 * las lecturas por identificador a INVENTAR un error —`No existe la obra "x"`— para poder devolver
 * la ausencia. Consecuencia: la ficha dibujaba la pantalla roja de una base caída para una obra que
 * simplemente no está, y su `notFound()` era código inalcanzable.
 *
 * Con esto son TRES estados y no dos: encontrado, no encontrado, y fallo real. Quien pregunta
 * decide qué hacer con cada uno —la ficha manda el segundo al 404, el alta ofrece crear una nueva—
 * y el compilador obliga a mirar los dos casos.
 */
export type ServiceResultOpcional<T> = { data: T | null; error: null } | { data: null; error: string }

/** Días de desvío del fin planificado contra la línea base. Positivo = atrasado.
 *  Devuelve null si no hay baseline: un desvío sin contra qué medir no es cero, es desconocido. */
export function desvioDias(a: Pick<Actividad, 'fin_plan' | 'fin_base'>): number | null {
  if (!a.fin_plan || !a.fin_base) return null
  const ms = new Date(a.fin_plan + 'T00:00:00Z').getTime() - new Date(a.fin_base + 'T00:00:00Z').getTime()
  return Math.round(ms / 86400000)
}
