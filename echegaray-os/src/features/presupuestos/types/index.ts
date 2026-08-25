// EL PRESUPUESTO, TAL COMO LO DEVUELVE LA BASE.
//
// En la pantalla se llama «Presupuesto»; en Postgres la tabla se llama `cotizaciones` porque ahí
// ya hay código del orquestador leyéndola (`lib/cotizaciones.mjs`, `recotizacion-arcor.mjs`). El
// nombre de la pantalla vive acá, en el tipo, y el de la base en las consultas: renombrar la tabla
// para que coincida con el rótulo habría roto código vivo por una cuestión de vocabulario.
//
// ═══ POR QUÉ NINGÚN CAMPO ECONÓMICO ES `number` A SECAS ═══
//
// Todos los importes salen de `numeric` de Postgres. PostgREST los emite como número JSON, pero un
// `numeric` sin filas devuelve `null` y una vista con `coalesce(sum(...), 0)` devuelve `0` — y esos
// dos ceros significan cosas opuestas: «no hay partidas» y «las partidas suman cero». El tipo deja
// pasar el `null` a propósito para que la pantalla tenga que decidir, y `escalonesDe()` en
// `./services/cascada` es quien decide.

/** Los cinco estados que admite el CHECK de `cotizaciones`. No hay más, y no se inventan acá. */
export type EstadoPresupuesto = 'borrador' | 'enviada' | 'adjudicada' | 'perdida' | 'anulada'

export const ESTADOS: readonly EstadoPresupuesto[] = [
  'borrador', 'enviada', 'adjudicada', 'perdida', 'anulada',
] as const

/** Una fila de `cotizacion_cascada`: la cabecera y su cascada hasta el precio, ya calculada. */
export interface PresupuestoCascada {
  id: string
  numero: string | null
  version: number
  vigente: boolean
  estado: EstadoPresupuesto
  cliente: string | null
  cliente_id: string | null
  obra_nombre: string | null
  obra_canonica_id: string | null
  fecha_cotizacion: string | null
  congelada_en: string | null
  convertida_obra_id: string | null

  parametro_comercial_id: string | null

  // LOS OCHO DE LA CASCADA DEL LIBRO, en FRACCIÓN. Siete son decisión empresarial; el IVA es lo
  // único normativo. Antes eran cinco con otras bases, y sus valores «de la empresa» vivían en un
  // `defaultValue` de React.
  pct_gastos_generales: number
  pct_beneficio: number
  pct_financiero: number
  factor_financiero: number
  pct_iibb: number
  pct_ganancias: number
  pct_cheque: number
  pct_iva: number

  costo_directo: number | null
  hh_previstas: number | null
  n_partidas: number
  n_sin_analisis: number
  n_sin_computo: number
  n_sin_precio_subcontrato: number

  gastos_generales: number | null
  costo_industrial: number | null
  beneficio: number | null
  financiero: number | null
  iibb: number | null
  ganancias: number | null
  subtotal: number | null
  impuesto_cheque: number | null
  venta_sin_iva: number | null
  iva: number | null
  venta_final: number | null
  coeficiente_sin_iva: number | null
  coeficiente_con_iva: number | null
  /** Alias de `venta_sin_iva`: el precio que se oferta. El IVA no es precio de la empresa. */
  precio_venta: number | null
  /** El MARGEN sobre el precio, que NO es el beneficio: el beneficio es markup sobre el costo. */
  margen_sobre_precio_pct: number | null
}

/** Una fila de `parametro_comercial`: los ocho porcentajes vigentes, con su fuente. */
export interface ParametroComercial {
  id: string
  version: number
  pct_gastos_generales: number
  pct_beneficio: number
  pct_financiero: number
  factor_financiero: number
  pct_iibb: number
  pct_ganancias: number
  pct_cheque: number
  pct_iva: number
  fuente: string
  notas: string | null
}

/** Una fila de `cotizacion_partida_valorizada`: la partida con su costo congelado o vivo. */
export interface PartidaValorizada {
  partida_id: string
  cotizacion_id: string
  orden: number
  rubro: string | null
  codigo: string | null
  descripcion: string
  cantidad: number | null
  unidad: string | null
  tarea_tipo_id: string | null
  analisis_id: string | null
  metodo_medicion: MetodoMedicion | null
  subcontratada: boolean
  precio_subcontrato: number | null
  congelada: boolean
  costo_unitario: number | null
  hs_unitarias: number | null
  subtotal: number | null
  hh: number | null
  sin_analisis: boolean
}

export type MetodoMedicion = 'cantidad' | 'pasos' | 'manual'

/** Una línea de composición, venga de la copia congelada o del análisis vivo. Una sola forma. */
export interface LineaComposicion {
  orden: number
  recurso_codigo: string | null
  recurso_nombre: string
  unidad: string | null
  tipo: TipoRecurso | null
  cantidad: number
  costo_unitario: number | null
  desperdicio: number | null
  fecha_precio: string | null
}

export type TipoRecurso = 'mano_obra' | 'carga_social' | 'material' | 'equipo' | 'otro'

/** Una plantilla de secuencia con sus pasos, tal como la elige la pantalla 13. */
export interface Plantilla {
  id: string
  nombre: string
  descripcion: string | null
  pasos: PasoPlantilla[]
}

export interface PasoPlantilla {
  orden: number
  nombre: string
  peso: number
  tiempo_tecnico: boolean
  dias_tecnicos: number | null
  depende_del_anterior: boolean
}

/** Lo que `rendimiento_recomendado` sabe de una tarea tipo. `hs_recomendado` null = sin evidencia. */
export interface RendimientoRecomendado {
  tarea_tipo_id: string
  codigo: string
  nombre: string
  unidad: string
  hs_analisis: number | null
  muestra: number
  obras: number
  hs_observado_promedio: number | null
  hs_observado_mediana: number | null
  dispersion: number | null
  hs_recomendado: number | null
  lectura: string
}

/** Lo que devuelve `convertir_partida_a_plan`. `hh_total` null = la partida no tiene análisis. */
export interface ResultadoConversion {
  frentes: number
  actividades: number
  hh_total: number | null
  sin_analisis: boolean
  metodo: MetodoMedicion
}
