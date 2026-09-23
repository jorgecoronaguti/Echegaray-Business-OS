// EL GANTT DE LA CARTERA (diseño ERP Obras 02 / M02, dueño 23/09/2026): la geometría de cada barra,
// pura y sin pantalla.
//
// ═══ UNA SOLA DEFINICIÓN DEL PLAZO ═══
//
// Lee las MISMAS columnas de `obra_panel` que la tabla (`fecha_inicio_plan`, `fecha_fin_plan`,
// `forecast_fin`, `avance_pct`) y el atraso sale de `carteraCanon.diasDeAtraso`: la barra rayada
// «proyección más allá del plan» mide exactamente los días que la columna PLAZO escribe como «+N d».
// El pie del diseño lo dice con todas las letras: *«No hay línea base útil: el sellado copió el plan
// y da desvío 0 en las 11 obras. La proyección sale de forecast_fin»*.
//
// ═══ LA VENTANA ES FIJA Y LA ELIGE EL QUE MIRA ═══
//
// «Mes · Trimestre · Año» del diseño: una ventana de meses enteros alrededor de HOY, no el rango de
// las obras. Una barra que empieza antes de la ventana se recorta en el borde; una obra que cae
// entera afuera lo dice con palabras, no con una barra de tres píxeles.

import { diasDeAtraso, estadoDeCartera, type ObraDeCartera } from './carteraCanon.ts'

export const ESCALAS_CARTERA = [
  { k: 'mes', t: 'Mes' },
  { k: 'trimestre', t: 'Trimestre' },
  { k: 'anio', t: 'Año' },
] as const
export type EscalaCartera = (typeof ESCALAS_CARTERA)[number]['k']

/** Cuántos meses antes y después del mes de HOY abarca cada escala. `telefono` es la de M02:
 *  siete meses con HOY cerca del borde derecho. */
const MESES: Record<EscalaCartera | 'telefono', { antes: number; despues: number }> = {
  mes: { antes: 1, despues: 1 },
  trimestre: { antes: 2, despues: 3 },
  anio: { antes: 4, despues: 7 },
  telefono: { antes: 5, despues: 1 },
}

const NOMBRE_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export interface MesDeVentana {
  label: string
  /** El mes de HOY: el diseño lo escribe en 500 y en tinta. */
  actual: boolean
}

export interface VentanaGantt {
  /** Primer día del primer mes, en ms UTC. */
  desdeMs: number
  /** Primer día del mes SIGUIENTE al último, en ms UTC (exclusivo). */
  hastaMs: number
  meses: MesDeVentana[]
}

const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

export function ventanaGantt(hoyIso: string, escala: EscalaCartera | 'telefono'): VentanaGantt {
  const anio = Number(hoyIso.slice(0, 4))
  const mes0 = Number(hoyIso.slice(5, 7)) - 1
  const { antes, despues } = MESES[escala]
  const meses: MesDeVentana[] = []
  for (let i = -antes; i <= despues; i++) {
    const idx = ((mes0 + i) % 12 + 12) % 12
    meses.push({ label: NOMBRE_MES[idx], actual: i === 0 })
  }
  return {
    desdeMs: Date.UTC(anio, mes0 - antes, 1),
    hastaMs: Date.UTC(anio, mes0 + despues + 1, 1),
    meses,
  }
}

/** La posición de una fecha dentro de la ventana, en % del ancho del lienzo. Sin recortar: el
 *  que dibuja decide si recorta. */
export function posicionEn(v: VentanaGantt, iso: string): number {
  return ((ms(iso) - v.desdeMs) / (v.hastaMs - v.desdeMs)) * 100
}

export interface ObraDeGantt extends ObraDeCartera {
  fecha_inicio_plan: string | null
}

export interface Tramo {
  /** % del ancho del lienzo. */
  left: number
  width: number
}

export type TonoGantt = 'curso' | 'warn' | 'neg' | 'pos' | 'plan'

export interface BarrasGantt {
  /** La barra clara del plan (02) o la única barra del teléfono (M02). */
  plan: Tramo
  /** Lo ejecutado: el plan × avance. `null` sin avance publicado. */
  ejecutado: Tramo | null
  /** La rayada más allá del plan: de `fecha_fin_plan` a `forecast_fin`. `null` sin atraso. */
  proyeccion: Tramo | null
  /** Rojo si el estado es «· atraso»; ámbar si proyecta después; azul (escritorio) o grafito
   *  (teléfono) en fecha; verde al 100 %. */
  tono: TonoGantt
  /** «+16 d» al lado de la barra del teléfono. `null` sin atraso. */
  rotuloAtraso: string | null
  /** La obra cae entera fuera de la ventana: se dice, no se dibuja. */
  fueraDeVentana: boolean
}

const recortar = (a: number, b: number): Tramo => {
  const l = Math.max(0, Math.min(100, a))
  const r = Math.max(0, Math.min(100, b))
  return { left: l, width: Math.max(0, r - l) }
}

/**
 * LAS BARRAS DE UNA OBRA. `null` = sin las dos fechas de plan: el diseño escribe «sin fechas
 * cargadas — no se dibuja una barra inventada» y acá no se inventa ni un inicio ni un fin.
 */
export function barrasDe(o: ObraDeGantt, v: VentanaGantt): BarrasGantt | null {
  if (!o.fecha_inicio_plan || !o.fecha_fin_plan) return null
  const x0 = posicionEn(v, o.fecha_inicio_plan)
  const x1 = posicionEn(v, o.fecha_fin_plan)
  const d = diasDeAtraso(o)
  const xF = d != null && d > 0 && o.forecast_fin ? posicionEn(v, o.forecast_fin) : x1
  const fueraDeVentana = Math.max(x1, xF) < 0 || x0 > 100
  const plan = recortar(x0, x1)
  const av = o.avance_pct
  const ejecutado = av == null ? null : recortar(x0, x0 + ((x1 - x0) * Math.min(100, Math.max(0, av))) / 100)
  const proyeccion = d != null && d > 0 && o.forecast_fin ? recortar(x1, xF) : null
  const estado = estadoDeCartera(o)
  const tono: TonoGantt = av != null && av >= 100 ? 'pos'
    : estado.tono === 'neg' ? 'neg'
      : d != null && d > 0 ? 'warn'
        : 'curso'
  return {
    plan, ejecutado, proyeccion, tono,
    rotuloAtraso: d != null && d > 0 ? `+${d} d` : null,
    fueraDeVentana,
  }
}

/** La leyenda del escritorio (02), literal. */
export const LEYENDA_GANTT = ['plan', 'ejecutado', 'proyección más allá del plan'] as const
/** La leyenda del teléfono (M02), literal. */
export const LEYENDA_GANTT_TELEFONO = ['en plazo', 'proyectada después', 'atraso'] as const
/** El texto de la fila sin fechas del escritorio (02), literal. */
export const SIN_FECHAS_ESCRITORIO = 'sin fechas cargadas — no se dibuja una barra inventada'
/** El texto de la fila sin fechas del teléfono (M02), literal. */
export const SIN_FECHAS_TELEFONO = 'sin fechas de plan'
/** La obra cae entera fuera de la ventana elegida. No está en el diseño: es lo que pasa cuando la
 *  ventana es fija y la obra no. */
export const FUERA_DE_VENTANA = 'fuera del período que se muestra'
