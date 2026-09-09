// HH CONTRA AVANCE: CUÁNTO NOS COSTÓ HACER UNA UNIDAD, Y CONTRA QUÉ SE COMPARA.
//
// Pantalla 7 del handoff v2 — *«la única pregunta que convierte la liquidación en gestión»*. Es
// también el pedido más caro de §7: hoy `registros_hh` guarda horas y (a veces) actividad, pero NO
// guarda cuánto se ejecutó ni en qué unidad. Sin esa cantidad no hay rendimiento, y el trabajo de
// este módulo es decirlo en pantalla en vez de fabricarlo.
//
// ═══ LO QUE NO SE PUEDE MEDIR SE ESCRIBE «NO SE PUEDE MEDIR» ═══
//
// Las tres salidas fáciles y por qué ninguna se toma:
//
//   · Usar el `pct` de la actividad como cantidad. Un 60 % no es una cantidad: 60 % de una losa no
//     son 60 m², y dividir horas por un porcentaje da un número con unidades inventadas.
//   · Repartir las horas sin actividad entre las actividades que sí la tienen. Eso mueve el
//     rendimiento de una obra que trabajó bien hacia la que no cargó el parte.
//   · Comparar HH gastadas contra `hh_plan` y llamar «rendimiento» al cociente. Eso mide CONSUMO
//     de presupuesto, no productividad: una actividad al 20 % que gastó el 20 % de sus horas no es
//     eficiente, es sólo coherente. Se publica igual —`consumoPlanPct`— pero con ese nombre.
//
// ═══ POR QUÉ ES PURO ═══
//
// Los casos que importan —la actividad sin cantidad, la hora sin actividad, el plan sin horas— son
// cinco tests de milisegundos. Con la cuenta adentro de una vista SQL sólo se podría probar contra
// datos reales, que son justamente los que hoy están incompletos.

/** Una actividad de la ventana con sus horas ya sumadas. Lo que hay HOY en la base. */
export interface ActividadConHH {
  actividadId: string
  /** «Obra · Actividad», ya armado por quien lee: acá no se conocen las obras. */
  etiqueta: string
  /** HH imputadas a esa actividad en la ventana. */
  hh: number
  /** `obra_actividad.hh_plan`. `null` = la actividad no tiene horas presupuestadas. */
  hhPlan: number | null
  /** `obra_actividad.pct` de avance físico. NO es una cantidad ejecutada (ver cabecera). */
  pct: number | null
  /**
   * LO QUE FALTA EN EL MODELO. Hoy `registros_hh` no tiene dónde guardarlas, así que quien lee pasa
   * `null` y la línea entera dice «no se puede medir». El día que la columna exista, esta función
   * ya la sabe usar y no hay que reescribir la pantalla.
   */
  unidad: string | null
  cantidadEjecutada: number | null
  /** Cantidad prevista en la misma unidad. Sin ella no hay HH/unidad de plan. */
  cantidadPlan: number | null
}

export interface LineaProductividad extends ActividadConHH {
  /** HH por unidad REAL. `null` = no se puede medir. */
  hhPorUnidadReal: number | null
  /** HH por unidad de PLAN. `null` = no hay contra qué comparar. */
  hhPorUnidadPlan: number | null
  /** % mejor (positivo) o peor (negativo) que el plan. `null` = no medible. */
  rendimientoPct: number | null
  /** Consumo de las HH presupuestadas. NO es rendimiento: se llama por su nombre. */
  consumoPlanPct: number | null
  /** `null` = se midió. Con texto = la frase exacta que va en la celda. */
  porQueNoSeMide: string | null
  /** Qué dato lo destraba (§7 del handoff). Vacío cuando se midió. */
  queLoDestraba: string | null
}

const redondear = (n: number, d = 2): number => {
  const f = 10 ** d
  return Math.round(n * f) / f
}

const positivo = (v: number | null | undefined): boolean => v != null && Number.isFinite(v) && v > 0

/** LA FRASE, UNA SOLA VEZ. La pantalla la muestra y el test la afirma: dos copias se desincronizan. */
export const SIN_MEDIDA = 'no se puede medir'
export const DESTRABA_CANTIDAD =
  'cargar la cantidad ejecutada y su unidad al cargar el día (hoy registros_hh no tiene dónde guardarlas)'
export const DESTRABA_PLAN = 'cargar la cantidad prevista de la actividad para tener HH/unidad de plan'
export const DESTRABA_ACTIVIDAD = 'elegir la actividad al cargar el día'

/**
 * UNA ACTIVIDAD MEDIDA — o la razón por la que no.
 *
 * El orden de los cortes es el orden en que se pierde la información: sin cantidad ejecutada no hay
 * ni siquiera un HH/unidad real, así que ése corta primero y no se sigue.
 */
export function medirActividad(a: ActividadConHH): LineaProductividad {
  const base: LineaProductividad = {
    ...a,
    hhPorUnidadReal: null, hhPorUnidadPlan: null, rendimientoPct: null,
    consumoPlanPct: positivo(a.hhPlan) ? redondear((a.hh / (a.hhPlan as number)) * 100, 1) : null,
    porQueNoSeMide: null, queLoDestraba: null,
  }
  if (!positivo(a.cantidadEjecutada) || !a.unidad?.trim()) {
    return { ...base, porQueNoSeMide: SIN_MEDIDA, queLoDestraba: DESTRABA_CANTIDAD }
  }
  const real = redondear(a.hh / (a.cantidadEjecutada as number))
  if (!positivo(a.cantidadPlan) || !positivo(a.hhPlan)) {
    return { ...base, hhPorUnidadReal: real, porQueNoSeMide: null, queLoDestraba: DESTRABA_PLAN }
  }
  const plan = redondear((a.hhPlan as number) / (a.cantidadPlan as number))
  return {
    ...base,
    hhPorUnidadReal: real,
    hhPorUnidadPlan: plan,
    // POSITIVO ES MEJOR: menos horas por unidad que el plan. Se calcula sobre el plan y no sobre el
    // real para que dos actividades con desvíos opuestos den porcentajes simétricos.
    rendimientoPct: plan > 0 ? redondear(((plan - real) / plan) * 100, 1) : null,
  }
}

export interface ResumenProductividad {
  /** Horas de la ventana imputadas a alguna actividad. */
  hhConActividad: number
  /** Horas que nadie imputó a ninguna actividad. No se reparten: se muestran. */
  hhSinActividad: number
  /** Actividades con HH/unidad real calculado. */
  medidas: number
  /** Actividades que no se pudieron medir. */
  sinMedida: number
}

/**
 * EL PIE DEL CUADRO. `hhSinActividad` es una línea propia porque es trabajo administrativo
 * pendiente y no un rendimiento malo: mezclarla adentro de las actividades ensuciaría la única
 * cuenta que la pantalla existe para dar.
 */
export function resumenProductividad(
  lineas: readonly LineaProductividad[], hhSinActividad: number,
): ResumenProductividad {
  return {
    hhConActividad: redondear(lineas.reduce((s, l) => s + (Number(l.hh) || 0), 0)),
    hhSinActividad: redondear(Number(hhSinActividad) || 0),
    medidas: lineas.filter((l) => l.hhPorUnidadReal != null).length,
    sinMedida: lineas.filter((l) => l.hhPorUnidadReal == null).length,
  }
}
