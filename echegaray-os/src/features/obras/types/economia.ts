// LA ECONOMÍA DE LA OBRA, EN SU PROPIO ARCHIVO — es un concepto, no una fila más de `PlanVsReal`.

/**
 * EL PANEL ECONÓMICO DE LA OBRA — vista `obra_economia` (20260822T6210).
 *
 * Ocho magnitudes, cada una con su regla, y CUALQUIERA puede ser `null`. Un `null` acá no es un
 * hueco a rellenar con la magnitud de al lado: es la respuesta correcta cuando falta la base. La
 * columna `*_origen` / `base_del_forecast` dice qué falta, y la pantalla la muestra.
 *
 * NO existe «margen actual». `contratado − costo real` le falta todo lo que queda por gastar, y el
 * costo real de esta casa no incluye la mano de obra (se imputa como Estructura): la resta daba
 * $64.713.000 de «margen» en una obra al 86% con tres facturas de materiales.
 */
/**
 * LA MANO DE OBRA PROPIA DE LA OBRA A LA FECHA — `costo_de_obras_a_la_fecha` (20260915T0500), la misma
 * que la ficha del CRM. No sale de `obra_economia`: `costo_real_mano_de_obra` es lo que Compras imputó
 * con área «personas» y en Quattropani da $0.
 */
export interface ManoObraPropia {
  /** Recibos + negro de las horas valorizadas. `null` = ninguna hora valorizada. */
  importe: number | null
  /** La parte estimada (sin recibo del estudio todavía). */
  estimado: number | null
  /** Horas FALTA_DATO que no suman. */
  horasSinDato: number
  /** `false` = el rol no lee recibos ni tarifas: la línea no se dibuja. */
  puedeVer: boolean
}

export interface EconomiaObra {
  /** No es columna de la vista: la agrega `getEconomiaObra`. `null` = no se pudo leer. */
  mano_obra_propia?: ManoObraPropia | null
  obra_id: string
  obra: string
  // Venta
  venta_contratada: number | null
  adicionales_aprobados: number | null
  n_adicionales_aprobados: number
  venta_total: number | null
  // Costo
  costo_objetivo: number | null
  costo_objetivo_origen: string
  costo_real: number | null
  costo_real_n_comprobantes: number | null
  costo_real_mano_de_obra: number | null
  /** Hoy siempre `null`: no hay fuente por obra. `costo_comprometido_estado` dice por qué. */
  costo_comprometido: number | null
  costo_comprometido_estado: string
  costo_restante_proyectado: number | null
  costo_final_proyectado: number | null
  base_del_forecast: string | null
  // Margen — las dos únicas restas que son margen
  margen_cotizado: number | null
  margen_final_proyectado: number | null
  // Ciclo comercial
  certificado: number | null
  facturado: number | null
  cobrado: number | null
  cobrado_neto: number | null
  por_cobrar_proyectado: number | null
  n_cobranzas: number
}
