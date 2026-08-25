// LOS TIPOS DE LA BASE MAESTRA.
//
// `ServiceResult` se reusa del módulo de obras a propósito: un segundo tipo con la misma forma
// obligaría a traducir en cada borde y las dos formas terminarían divergiendo.

import type { EstadoAnalisis, Frescura, RendimientoDeObra, TipoComposicion } from '../services/reglas'

export type { ServiceResult } from '@/features/obras/types'

// ═══ EL CORTE ECONÓMICO ════════════════════════════════════════════════════════════════════════
//
// `recurso_precio` sólo abre para `ve_economia()`: un jefe de obra recibe CERO FILAS, sin error.
// Leído desde `recurso_costo` —que es un LEFT JOIN— eso llega como `costo_base: null` en TODOS los
// recursos, que es exactamente igual a «nadie cargó el precio».
//
// Por eso el servicio publica `economia` aparte, leído del rol: es la única manera de que la
// pantalla pueda decir «sin permiso» en vez de «sin cargar». Sin este campo, la pantalla mentiría
// —diría que falta cargar 409 precios que están cargados— y mandaría a alguien a cargarlos de nuevo.
export type Economia = {
  /** ¿El que mira ve precio y costo? Dirección y Administración sí; jefe de obra no. */
  ve: boolean
}

// ═══ PANTALLA 17 · TAREAS TIPO ═════════════════════════════════════════════════════════════════

export type TareaTipoFila = {
  id: string
  codigo: string
  nombre: string
  unidad: string
  division: string | null
  metodo_medicion: string | null
  descripcion: string | null
  /** De `analisis_costo.hs_unitarias` — la suma de las cantidades de mano de obra. */
  hs_unitarias: number | null
  /** De `rendimiento_recomendado`. NULL = nunca se midió en obra. */
  hs_observado: number | null
  /** El esfuerzo que el motor de aprendizaje PROPONE, o NULL si la muestra no alcanza. Viaja hasta
   *  el listado para que la fila pueda decir «hay una decisión pendiente» sin inventarse un umbral
   *  propio: quien decide que la base tiene que cambiar es la vista, no la pantalla. */
  hs_recomendado: number | null
  /** Cuántos registros de obra sostienen lo observado. 0 = nunca se midió. */
  muestra: number
  estado: EstadoAnalisis
  falta: string | null
  analisis_id: string | null
  version: number | null
  /** De qué está hecha, para la columna COMPOSICIÓN del canónico. Sale del TIPO de cada recurso del
   *  análisis vigente, que NO depende de `recurso_precio` y por eso vale igual para un jefe de obra. */
  composicion: TipoComposicion[]
  /** En cuántas partidas de presupuesto y actividades de obra entró. `null` = no se pudo contar —y
   *  eso NO es cero: `cotizacion_partida` es económica y `obra_actividad` se acota por obra, así que
   *  quien no ve una de las dos fuentes recibe null en vez de un número que miente por lo bajo. */
  usos: number | null
}

export type LineaAnalisis = {
  id: string
  recurso_id: string
  codigo: string
  nombre: string
  unidad: string
  tipo: 'mano_obra' | 'carga_social' | 'material' | 'equipo' | 'otro'
  familia: string | null
  cantidad: number
  orden: number
  nota: string | null
  desperdicio: number
  /** null cuando no hay precio cargado O cuando quien mira no ve economía — los distingue `Economia`. */
  costo_base: number | null
  costo_con_desperdicio: number | null
  fecha_precio: string | null
  fuente: string | null
}

export type CostoAnalisis = {
  n_lineas: number
  n_lineas_sin_precio: number
  costo_directo: number | null
  costo_mano_obra: number | null
  costo_cargas_sociales: number | null
  costo_materiales: number | null
  costo_equipos: number | null
  hs_unitarias: number | null
  precio_mas_viejo: string | null
  tiene_mano_obra: boolean
  tiene_cargas_sociales: boolean
}

export type VersionAnalisis = {
  id: string
  version: number
  vigente: boolean
  motivo: string | null
  creado_en: string
  autor_nombre: string | null
  hs_unitarias: number | null
}

export type Rendimiento = {
  hs_analisis: number | null
  muestra: number
  obras: number
  hs_observado_promedio: number | null
  hs_observado_mediana: number | null
  dispersion: number | null
  hs_recomendado: number | null
  lectura: string
  /** Cuándo entró la última muestra. Es lo que hace CADUCAR una decisión anterior. */
  ultima_muestra: string | null
  /** Las horas de la muestra que NO produjeron. El rendimiento ya las descuenta. */
  hh_improductivas: number | null
}

export type PasoPlantilla = {
  orden: number
  nombre: string
  peso: number
  tiempo_tecnico: boolean
  dias_tecnicos: number | null
}

export type Plantilla = {
  id: string
  nombre: string
  descripcion: string | null
  se_repite_por: string[] | null
  activa: boolean
  pasos: PasoPlantilla[]
}

export type UsoDeTarea = {
  obra_id: string | null
  obra_nombre: string
  referencia: string | null
  estado: string | null
  cantidad: number | null
  unidad: string | null
}

export type FichaTarea = {
  tarea: TareaTipoFila
  lineas: LineaAnalisis[]
  costo: CostoAnalisis | null
  versiones: VersionAnalisis[]
  rendimiento: Rendimiento | null
  plantilla: Plantilla | null
  uso: UsoDeTarea[]
  /** Una barra por obra con dato medido — «Rendimiento por obra» del canónico 17. */
  obras: RendimientoDeObra[]
  /** Cuándo se actualizó por última vez la base para esta tarea: la fecha del análisis vigente. */
  actualizado: string | null
  /** Lo que esta ficha NO pudo leer y por qué. Se muestra; no se pinta como lista vacía. */
  avisos: string[]
}

// ═══ PANTALLA 18 · RECURSOS ════════════════════════════════════════════════════════════════════

export type RecursoFila = {
  recurso_id: string
  codigo: string
  nombre: string
  unidad: string
  tipo: 'mano_obra' | 'carga_social' | 'material' | 'equipo' | 'otro'
  familia: string | null
  division: string | null
  desperdicio: number
  activo: boolean
  costo_base: number | null
  costo_con_desperdicio: number | null
  fecha_precio: string | null
  fuente: string | null
  proveedor: string | null
  frescura: Frescura
  /** En cuántas tareas tipo VIGENTES entra. `null` = no se pudo contar, que no es cero. */
  usos: number | null
}

/** Un precio de `recurso_precio`, con de dónde salió. Es historia: nunca se pisa, se agrega. */
export type PrecioHistorico = {
  costo: number | null
  fecha_precio: string | null
  fuente: string | null
  proveedor: string | null
  vigente: boolean
  /** Contra el precio ANTERIOR de este mismo recurso, como fracción. null en el primero. */
  variacion: number | null
}

/** Dónde entra este recurso: la tarea tipo y cuánto lleva por unidad. */
export type UsoDeRecurso = {
  tarea_tipo_id: string
  codigo: string
  nombre: string
  unidad_tarea: string
  cantidad: number
}

export type FichaRecurso = {
  recurso: RecursoFila
  /** Vacío puede significar dos cosas opuestas y por eso está `historial_visible`. */
  historial: PrecioHistorico[]
  /** false = no se leyó por permiso económico. La pantalla NO puede decir «sin historial». */
  historial_visible: boolean
  usos: UsoDeRecurso[]
  /** «VARIACIÓN 6 M» del canónico 18: el precio vigente contra el que regía seis meses atrás. */
  variacion_6m: { fraccion: number; desde: string } | null
  avisos: string[]
}

export type CategoriaManoObra = {
  clave: string
  nombre: string
  /** El de `uocra_escala`, con la grafía del acuerdo. */
  nombre_convenio: string | null
  basico_hora: number | null
  mensual: number | null
  jornal: number | null
  valor_hora: number | null
  cargas_hora: number | null
  costo_empresa_hora: number | null
  capacidad: number | null
  personas: number
}

export type CargaSocialFila = {
  concepto: string
  porcentaje: number
  vigencia_desde: string
  fuente: string | null
}

export type VersionPrecio = {
  fecha: string | null
  fuente: string | null
  proveedor: string | null
  n_recursos: number
  vigentes: number
  frescura: Frescura
}

export type MetaRecursos = {
  n_insumos: number
  n_familias: number
  n_equipos: number
  n_sin_precio: number
  escala_vigente: string | null
  escala_fuente: string | null
  cargas_vigencia: string | null
  cargas_total: number | null
  jornada_horas: number
}
