// J03 · CÓMO VIENE LA OBRA — real contra esperado, y después el por qué. PURO.
//
// ═══ «ESPERADO» ES UN CÁLCULO DECLARADO, NO UN DATO DE LA BASE ═══
//
// La base no publica una curva plan: publica `inicio_plan` y `fin_plan` por actividad. De ahí sale
// el esperado de hoy — lo que debería estar hecho si cada tarea avanzara parejo entre su inicio y su
// fin — y se agrega con la MISMA regla que el avance real (`avanceAgregado`, ponderado por HH plan).
// Usar dos reglas distintas para las dos mitades de la comparación haría que la diferencia entre
// ellas mida el método y no la obra.
//
// Una tarea SIN fechas de plan no entra ni con 0 ni con 100: sale del cálculo y la cobertura lo
// dice. Meterla con cero afirmaría que está atrasada; meterla con cien, que ya debería estar hecha.
// Las dos afirmaciones serían inventadas.
//
// ═══ LO QUE ESTA PANTALLA NO PUEDE DECIR TODAVÍA ═══
//
// El contrato J03 pide «HH perdidas por causa». Ese dato NO EXISTE: `obra_restriccion` guarda qué
// frena y desde cuándo, pero nadie imputa las horas detenidas contra el impedimento. Se publica lo
// que sí es un hecho —cuántas tareas frena cada tipo de impedimento y desde qué día— y el hueco
// queda escrito acá en vez de rellenarse con una estimación disfrazada de medición.

import { avanceAgregado } from '../../obras/services/avance.ts'
import { diasEntre } from './frentes.ts'
import { estaTerminada, soloTareas } from './dia.ts'
import type { ActividadDelJefe, Impedimento } from './jefeService.ts'

/** Lo mínimo que hace falta de una actividad para ubicarla en el tiempo del plan. */
export interface TareaEnPlan {
  avance_pct: number | null
  hh_plan: number | null
  inicio_plan: string | null
  fin_plan: string | null
}

/** El esperado de hoy, con la cobertura pegada al número. */
export interface Esperado {
  /** `null` cuando ninguna tarea del conjunto tiene plan: nadie dijo cuándo, y eso no es cero. */
  pct: number | null
  /** Cuántas de `total` tienen las dos fechas de plan. */
  conPlan: number
  total: number
}

/**
 * Cuánto debería estar hecho HOY. Lineal entre inicio y fin de cada tarea: es la única forma
 * defendible sin una curva de recursos cargada, y va rotulada como lo que es.
 */
export function avanceEsperado(tareas: TareaEnPlan[], hoy: string): Esperado {
  const conPlan = tareas.filter((t) => t.inicio_plan && t.fin_plan)
  if (conPlan.length === 0) return { pct: null, conPlan: 0, total: tareas.length }
  const { pct } = avanceAgregado(conPlan.map((t) => ({
    avance_pct: esperadoDeUna(t.inicio_plan as string, t.fin_plan as string, hoy),
    hh_plan: t.hh_plan,
  })))
  return { pct, conPlan: conPlan.length, total: tareas.length }
}

/** Una tarea que empieza y termina el mismo día está al 100 % ese día, no dividida por cero. */
function esperadoDeUna(inicio: string, fin: string, hoy: string): number {
  const largo = diasEntre(inicio, fin)
  const corrido = diasEntre(inicio, hoy)
  if (largo == null || corrido == null) return 0
  if (corrido < 0) return 0
  // El tope va ANTES del piso: una tarea de un solo día planificada para hoy tiene que estar hecha
  // hoy. Preguntando primero por «todavía no arrancó» daba 0 y la tarea del día desaparecía.
  if (largo <= 0 || corrido >= largo) return 100
  return Math.round((corrido / largo) * 1000) / 10
}

export interface HHDeLaObra {
  /** Horas efectivamente imputadas. `null` si ninguna actividad las trae. */
  real: number | null
  plan: number | null
  /**
   * Real − plan SOBRE LO YA TERMINADO. Es la única comparación honesta: una tarea a medio hacer
   * tiene menos horas que su plan por definición, y contarla daría un ahorro que no existe.
   */
  desvioCerrado: number | null
  terminadas: number
}

export function hhDeLaObra(tareas: ActividadDelJefe[]): HHDeLaObra {
  const suma = (xs: (number | null)[]) => {
    const con = xs.filter((x): x is number => x != null)
    return con.length === 0 ? null : Math.round(con.reduce((a, b) => a + b, 0) * 10) / 10
  }
  const cerradas = tareas.filter((t) => estaTerminada(t) && t.hh_plan != null && t.hh_real != null)
  const desvio = cerradas.length === 0
    ? null
    : Math.round(cerradas.reduce((s, t) => s + ((t.hh_real ?? 0) - (t.hh_plan ?? 0)), 0) * 10) / 10
  return {
    real: suma(tareas.map((t) => t.hh_real)),
    plan: suma(tareas.map((t) => t.hh_plan)),
    desvioCerrado: desvio,
    terminadas: cerradas.length,
  }
}

export interface FinProyectado {
  /** La fecha más lejana que la base proyecta entre las tareas abiertas. `null` si no proyecta. */
  fecha: string | null
  /** Días contra el fin de plan de la obra. Positivo = se pasa. `null` sin uno de los dos. */
  dias: number | null
}

/**
 * El fin proyectado sale de `forecast_fin`, que YA calcula la base. No se recalcula acá: dos
 * proyecciones del mismo fin es cómo se llega a que la pantalla y el cronograma discutan.
 */
export function finProyectado(tareas: ActividadDelJefe[], finPlanObra: string | null): FinProyectado {
  const fechas = tareas
    .filter((t) => !estaTerminada(t))
    .map((t) => t.forecast_fin)
    .filter((f): f is string => !!f)
    .sort()
  const fecha = fechas.at(-1) ?? null
  return { fecha, dias: fecha && finPlanObra ? diasEntre(finPlanObra, fecha) : null }
}

export interface GrupoDeAvance {
  clave: string
  nombre: string
  pct: number | null
  esperado: number | null
  /** Puntos de avance contra el esperado. Negativo = atrasado. `null` sin una de las dos puntas. */
  delta: number | null
  medidas: number
  total: number
}

/**
 * El avance por frente, real contra esperado.
 *
 * Se agrupa por el FRENTE del árbol y no por `rubro`: son dos jerarquías distintas y no coinciden
 * —el porqué completo está en `frentes.ts`—, y J02 y J06 ya ubican el trabajo por frente. Dos
 * pantallas que agrupan el mismo trabajo de dos maneras es peor que una sola imperfecta.
 */
export function avancePorFrente(
  actividades: ActividadDelJefe[],
  frentes: Map<string, { id: string; nombre: string }>,
  hoy: string,
  sinFrente = 'Sin frente',
): GrupoDeAvance[] {
  const grupos: { clave: string; nombre: string; tareas: ActividadDelJefe[] }[] = []
  const indice = new Map<string, { clave: string; nombre: string; tareas: ActividadDelJefe[] }>()
  for (const t of soloTareas(actividades)) {
    const nombre = frentes.get(t.actividad_id)?.nombre ?? t.rubro?.trim() ?? sinFrente
    let g = indice.get(nombre)
    if (!g) {
      g = { clave: nombre, nombre, tareas: [] }
      indice.set(nombre, g)
      grupos.push(g)
    }
    g.tareas.push(t)
  }
  return grupos.map((g) => {
    const real = avanceAgregado(g.tareas)
    const esperado = avanceEsperado(g.tareas, hoy)
    return {
      clave: g.clave,
      nombre: g.nombre,
      pct: real.pct,
      esperado: esperado.pct,
      delta: real.pct == null || esperado.pct == null
        ? null
        : Math.round((real.pct - esperado.pct) * 10) / 10,
      medidas: real.medidas,
      total: g.tareas.length,
    }
  })
}

export interface CausaDeAtraso {
  clave: string
  /** El `tipo` del impedimento tal como lo escribió quien lo cargó. */
  tipo: string
  /** Cuántos impedimentos abiertos de ese tipo. */
  n: number
  /** Cuántas tareas distintas frena. Puede ser menor que `n`: dos impedimentos, una tarea. */
  tareas: number
  /** Días abiertos del más viejo. `null` cuando ninguno trae fecha de alta. */
  diasElMasViejo: number | null
}

/**
 * Por qué se atrasó, con lo que HAY. Sin HH detenidas —nadie las imputa contra el impedimento— la
 * magnitud que sí es un hecho es cuánto trabajo frena cada causa y desde hace cuánto.
 */
export function causasDeAtraso(impedimentos: Impedimento[], hoy: string): CausaDeAtraso[] {
  const indice = new Map<string, { tipo: string; ids: Set<string>; n: number; desde: string | null }>()
  for (const i of impedimentos) {
    const tipo = i.tipo?.trim() || 'sin clasificar'
    const g = indice.get(tipo) ?? { tipo, ids: new Set<string>(), n: 0, desde: null }
    g.n += 1
    if (i.actividad_id) g.ids.add(i.actividad_id)
    const alta = i.creado_en?.slice(0, 10) ?? null
    if (alta && (g.desde == null || alta < g.desde)) g.desde = alta
    indice.set(tipo, g)
  }
  return [...indice.values()]
    .map((g) => ({
      clave: g.tipo,
      tipo: g.tipo,
      n: g.n,
      tareas: g.ids.size,
      diasElMasViejo: g.desde ? diasEntre(g.desde, hoy) : null,
    }))
    .sort((a, b) => b.tareas - a.tareas || b.n - a.n)
}
