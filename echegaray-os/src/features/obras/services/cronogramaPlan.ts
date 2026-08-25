// EL CRONOGRAMA COMO ESTÁ CARGADO — las filas de la pantalla 07 desde el plan guardado.
//
// ═══ POR QUÉ NO LO ARMA EL MOTOR DE CAMINO CRÍTICO ═══
//
// `cronogramaMotor.armarCronograma` calcula las fechas DESDE LA SECUENCIA. Con cero dependencias
// cargadas —el estado de TODAS las obras vivas— cada actividad arranca en el día 1 del origen y el
// Gantt dibuja veinte barras apiladas sobre la misma semana. Eso no es el plan de la obra: es lo que
// el plan sería si nada esperara a nada. La pantalla que el jefe abre todos los días tiene que
// dibujar `inicio_plan`/`fin_plan` tal como alguien los cargó.
//
// ═══ EL DESVÍO ES `forecast_fin − fin_plan`, LA MISMA DEFINICIÓN QUE LA CARTERA ═══
//
// `desvio_plan_dias` compara el fin PLANIFICADO contra el de la LÍNEA BASE, y el sellado copió el
// plan en las once obras vivas: da 0 en todas, incluida una vencida con 94 % de avance. Es un
// control validado contra la misma información que produce. `forecast_fin` es el ritmo MEDIDO
// contra la fecha comprometida, que es la pregunta que se hace quien abre el cronograma.
// Ver `carteraCanon.ts`, que resuelve lo mismo para la obra entera.
//
// SIN FORECAST NO HAY DESVÍO Y NO SE INVENTA UN CERO: `null`, y la columna escribe «sin forecast».
// «En fecha» es un hecho; no saberlo, otro.
//
// ═══ QUÉ NO SE PUBLICA ACÁ, Y POR QUÉ ═══
//
// El camino crítico y la holgura (el rayo del mockup 07 y dos de sus cinco cifras) NO se calculan:
// exigen precedencias declaradas y hoy hay CERO en la base. Marcar «crítica» a la actividad más
// larga sería inventar un camino crítico.

import { agruparActividades } from './cronograma.ts'
import { diasEntre } from './escalaCronograma.ts'
import type { Actividad } from '../types/index.ts'

/** Una fila del cronograma: un rubro (`nivel 0`) o una actividad (`nivel 1`). */
export interface FilaPlan {
  /** La identidad de la fila. Es también lo que selecciona un clic: un rubro no tiene `id` de
   *  actividad y con `actividadId` como clave las diez cabeceras se seleccionaban juntas. */
  clave: string
  nivel: 0 | 1
  nombre: string
  /** `null` en un rubro: un rubro no es una actividad. */
  actividadId: string | null
  /** El PLAN cargado. En un rubro, la envolvente de sus hijas — nunca las fechas guardadas en la
   *  fila de resumen, que están podridas («Encofrado» dice 100 % con una hija en 0). */
  inicio: string | null
  fin: string | null
  /** LA LÍNEA BASE, lo que se prometió al sellar. Sin sellar es `null` en las dos puntas y la capa
   *  no dibuja nada, en vez de dibujar el plan de hoy como si fuera lo prometido. */
  inicioBase: string | null
  finBase: string | null
  /** Cuándo termina al ritmo medido, tal como lo publica `actividad_fechas`. Es el DATO; que se
   *  dibuje o no —sólo se dibuja el tramo que se estira más allá del plan— es consecuencia. */
  finForecast: string | null
  /** `forecast_fin − fin_plan` en días corridos, con signo. `null` = falta una punta. */
  desvio: number | null
  avancePct: number | null
  esHito: boolean
  tieneImpedimento: boolean
  /** Ninguna de las dos fechas de plan. La fila existe y no se puede dibujar: se dice. */
  sinPlan: boolean
  nHijas: number
}

const soloFecha = (f: string | null | undefined): string | null => (f ? f.slice(0, 10) : null)

/**
 * DÍAS DE DESVÍO PROYECTADO de una actividad. `null` cuando falta el fin de plan o el forecast.
 * Conserva el signo: terminar antes del plan es `-3`, y aplanarlo a 0 borraría el adelanto.
 */
export function desvioProyectado(finPlan: string | null, forecast: string | null): number | null {
  const a = soloFecha(finPlan)
  const b = soloFecha(forecast)
  if (!a || !b) return null
  return diasEntre(a, b)
}

function deActividad(a: Actividad): FilaPlan {
  const inicio = soloFecha(a.inicio_plan)
  const fin = soloFecha(a.fin_plan) ?? inicio
  const forecast = soloFecha(a.forecast_fin)
  return {
    clave: a.id,
    nivel: 1,
    nombre: a.nombre,
    actividadId: a.id,
    inicio,
    fin,
    inicioBase: soloFecha(a.inicio_base),
    finBase: soloFecha(a.fin_base),
    finForecast: forecast,
    desvio: desvioProyectado(a.fin_plan, a.forecast_fin),
    avancePct: a.avance_pct == null ? null : Number(a.avance_pct),
    esHito: a.tipo === 'hito',
    tieneImpedimento: (a.impedimentos_abiertos ?? 0) > 0,
    sinPlan: !inicio && !fin,
    nHijas: 0,
  }
}

const menor = (xs: (string | null)[]): string | null =>
  xs.filter((x): x is string => Boolean(x)).sort()[0] ?? null
const mayor = (xs: (string | null)[]): string | null =>
  xs.filter((x): x is string => Boolean(x)).sort().at(-1) ?? null

/** La cabecera de un rubro, DERIVADA de sus hijas. El desvío es el PEOR de ellas y no el promedio:
 *  un rubro donde una actividad atrasa quince días atrasa quince días; promediarlo diría «+4». */
function deRubro(clave: string, nombre: string, hijas: FilaPlan[]): FilaPlan {
  const desvios = hijas.map((h) => h.desvio).filter((x): x is number => x != null)
  const conAvance = hijas.filter((h) => h.avancePct != null)
  const fin = mayor(hijas.map((h) => h.fin))
  return {
    clave: `rubro:${clave}`,
    nivel: 0,
    nombre,
    actividadId: null,
    inicio: menor(hijas.map((h) => h.inicio)),
    fin,
    inicioBase: menor(hijas.map((h) => h.inicioBase)),
    finBase: mayor(hijas.map((h) => h.finBase)),
    finForecast: mayor(hijas.map((h) => h.finForecast)),
    desvio: desvios.length ? Math.max(...desvios) : null,
    avancePct: conAvance.length
      ? Math.round(conAvance.reduce((s, h) => s + (h.avancePct ?? 0), 0) / conAvance.length)
      : null,
    esHito: false,
    tieneImpedimento: hijas.some((h) => h.tieneImpedimento),
    sinPlan: hijas.every((h) => h.sinPlan),
    nHijas: hijas.length,
  }
}

/**
 * LAS FILAS DEL CRONOGRAMA, en el orden del tracker: cada rubro y debajo sus actividades.
 *
 * Agrupa con `agruparActividades` —la MISMA regla que el árbol de Tareas y el Gantt global—: si acá
 * se agrupara distinto, la misma obra tendría rubros distintos según desde qué pantalla se la mire.
 */
export function filasDelPlan(actividades: readonly Actividad[]): FilaPlan[] {
  const salida: FilaPlan[] = []
  for (const g of agruparActividades(actividades as Actividad[])) {
    const hijas = g.hijas.map(deActividad)
    salida.push(deRubro(g.clave, g.nombre, hijas))
    salida.push(...hijas)
  }
  return salida
}

/**
 * LA VENTANA QUE TIENE QUE ABARCAR EL LIENZO: plan, línea base y proyección.
 *
 * Las tres, no sólo el plan. Una actividad que se adelantó dibujaría su base fuera del lienzo —o
 * sea, no la dibujaría— y el desvío que la pantalla existe para mostrar sería justo el que no se ve.
 */
export function pares(filas: readonly FilaPlan[]): { inicio: string | null; fin: string | null }[] {
  return filas.flatMap((f) => [
    { inicio: f.inicio, fin: f.fin },
    { inicio: f.inicioBase, fin: f.finBase },
    { inicio: f.fin, fin: f.finForecast },
  ])
}

/** Lo que el pie de la pantalla necesita saber del cronograma entero. */
export interface ResumenDelCronograma {
  /** El último fin de línea base sellada. `null` = nadie selló. */
  finBase: string | null
  finPlan: string | null
  finForecast: string | null
  /** Días entre el fin de plan y el fin proyectado. `null` si falta una de las dos puntas. */
  desvioDelFin: number | null
  /** Actividades con desvío proyectado positivo, y cuántas se pudieron medir. */
  atrasadas: number
  medidas: number
  /** Actividades (no rubros) sin ninguna fecha de plan. Cambian lo que significa todo el resto. */
  sinPlan: number
  actividades: number
}

/** El resumen del cronograma. Sólo cuenta filas de ACTIVIDAD: contar los rubros sumaría cada
 *  atraso una vez más por cada rubro que lo hereda. */
export function resumenDelCronograma(filas: readonly FilaPlan[]): ResumenDelCronograma {
  const actos = filas.filter((f) => f.nivel !== 0)
  const finPlan = mayor(actos.map((f) => f.fin))
  const finForecast = mayor(actos.map((f) => f.finForecast))
  const conDesvio = actos.filter((f) => f.desvio != null)
  return {
    finBase: mayor(actos.map((f) => f.finBase)),
    finPlan,
    finForecast,
    desvioDelFin: desvioProyectado(finPlan, finForecast),
    atrasadas: conDesvio.filter((f) => (f.desvio ?? 0) > 0).length,
    medidas: conDesvio.length,
    sinPlan: actos.filter((f) => f.sinPlan).length,
    actividades: actos.length,
  }
}
