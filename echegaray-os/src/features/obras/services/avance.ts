// CÓMO SE MIDE UN AVANCE — los cuatro métodos, y qué se puede hacer en lote con cada uno. PURO.
//
// ═══ CADA MÉTODO LEE SU NÚMERO DE UN LUGAR DISTINTO ═══
//
// `obra_actividad_control` calcula el avance según `metodo_avance`, y no todos salen de la misma
// columna. Esto no es un detalle de implementación: es la razón por la que una escritura hecha en
// el lugar equivocado **no mueve el número y no falla**, que es la peor combinación posible.
//
//   cantidad → suma de `obra_ejecucion.cantidad` sobre `cantidad_objetivo`
//   partes   → suma de `obra_ejecucion.avance_pct`
//   pasos    → peso de `obra_actividad_paso` con `hecho_en`, sobre el peso total
//   manual   → `obra_actividad.pct`
//
// De ahí sale la regla de abajo: un porcentaje general aplicado en lote SIRVE para manual, partes y
// cantidad (con objetivo cargado), y NO sirve para pasos — ahí el número lo produce el tildado de
// los pasos, y escribir un porcentaje al lado dejaría el registro firmado y la actividad quieta.

import type { MetodoAvance } from '../types/index.ts'

export interface PasoMedible {
  peso: number
  hecho: boolean
}

/** El avance por pasos: fracción del peso ejecutado. Los pesos son RELATIVOS, no suman 100. */
export function avancePorPasos(pasos: readonly PasoMedible[]): number | null {
  const total = pasos.reduce((s, p) => s + p.peso, 0)
  if (total <= 0) return null
  const hecho = pasos.filter((p) => p.hecho).reduce((s, p) => s + p.peso, 0)
  return Math.round((hecho / total) * 1000) / 10
}

/** Lo mínimo que hace falta de una actividad para agregarla: su avance y su peso. */
export interface MedidaAgregable {
  avance_pct: number | null
  /** El peso. `null` o 0 = «esta actividad no declara cuánto trabajo es». */
  hh_plan: number | null
}

/**
 * EL AVANCE DE UN CONJUNTO — LA ÚNICA REGLA. Frente, rubro, obra: se agrega siempre así.
 *
 * **Ponderado por `hh_plan`. Si NINGUNA actividad del conjunto declara HH, promedio simple, y esa
 * caída queda DECLARADA** (`ponderado: false`) para que la pantalla pueda decir con qué se midió.
 * `null` cuando ninguna tiene avance: nadie sabe cómo va, y eso no es cero.
 *
 * ═══ POR QUÉ ACÁ Y NO EN CADA PANTALLA ═══
 *
 * Hasta hoy convivían DOS reglas sobre el mismo hecho: la 08 ponderaba por HH plan y la pantalla del
 * jefe (J06) promediaba simple. El mismo frente daba dos porcentajes distintos según por dónde se
 * entrara — y ninguno de los dos era «el avance del frente», porque el avance del frente es uno solo.
 *
 * ═══ LA JUSTIFICACIÓN DEL PROMEDIO SIMPLE, DESCARTADA POR ESCRITO ═══
 *
 * `frentes.ts` argumentaba: «el jefe de obra no ve costo, y ponderar por horas planificadas haría que
 * un frente cambie de porcentaje cuando alguien corrige una estimación de horas — un número que se
 * mueve solo es un número en el que nadie confía». Se descarta por tres razones:
 *
 *   1. HH plan NO es costo. Es la medida del trabajo, y el jefe de obra las ve en la 07 y en la 08.
 *      El argumento protegía de una fuga de información que no existe.
 *   2. El promedio simple TAMBIÉN se mueve solo —cambia al agregar o archivar una actividad— y
 *      además miente en el caso que importa: 900 HH al 0 % y 100 HH al 100 % dan «50 % del frente»
 *      con el 90 % del trabajo sin empezar. Un número estable y falso es peor que uno que se corrige.
 *   3. La vista SQL publicada ya agrega ponderando. Dejar la pantalla del jefe promediando simple
 *      mantenía dos verdades sobre el mismo frente en el mismo sistema.
 *
 * Lo que sí sobrevive del argumento viejo es el fallback: sin HH cargadas no hay peso que aplicar, y
 * ahí el promedio simple es la única respuesta posible. Por eso se declara en vez de esconderse.
 */
export function avanceAgregado(
  medidas: readonly MedidaAgregable[],
): { pct: number | null; medidas: number; ponderado: boolean } {
  const conDato = medidas.filter((m) => m.avance_pct != null)
  if (!conDato.length) return { pct: null, medidas: 0, ponderado: false }
  const pesos = conDato.map((m) => (m.hh_plan == null || m.hh_plan < 0 ? 0 : m.hh_plan))
  const total = pesos.reduce((a, b) => a + b, 0)
  const pct = total > 0
    ? conDato.reduce((acc, m, i) => acc + (pesos[i] / total) * (m.avance_pct as number), 0)
    : conDato.reduce((acc, m) => acc + (m.avance_pct as number), 0) / conDato.length
  return { pct: Math.round(pct * 10) / 10, medidas: conDato.length, ponderado: total > 0 }
}

/** El avance por cantidad acumulada. Sin objetivo cargado no hay porcentaje: es `null`, no 0. */
export function avancePorCantidad(ejecutada: number | null, objetivo: number | null): number | null {
  if (objetivo === null || objetivo <= 0 || ejecutada === null) return null
  return Math.min(100, Math.round((ejecutada / objetivo) * 1000) / 10)
}

/**
 * LO QUE HAY QUE ESCRIBIR para dejar una actividad medida por cantidad en un acumulado.
 *
 * El campo de la pantalla 05 pide la **cantidad acumulada** y la vista SUMA los registros: escribir
 * el acumulado como si fuera un registro nuevo duplicaría todo lo anterior. Lo que se guarda es la
 * diferencia. Puede ser negativa —una corrección a la baja es un hecho— y por eso no se recorta.
 */
export function deltaDeCantidad(acumuladaNueva: number, acumuladaAnterior: number | null): number {
  return Math.round((acumuladaNueva - (acumuladaAnterior ?? 0)) * 1e6) / 1e6
}

/**
 * LA MISMA TRAMPA, DEL OTRO LADO: el método `partes` SUMA los porcentajes de cada registro.
 *
 * Poner «esta actividad queda en 75 %» sobre una que ya sumaba 65 no se escribe como 75: se escribe
 * como 10. Escribir el objetivo daría 140 %, y la vista lo recorta a 100 — el número queda bien por
 * casualidad y el historial queda mintiendo para siempre.
 */
export function deltaDeAvance(objetivoPct: number, acumuladoPct: number | null): number {
  return Math.round((objetivoPct - (acumuladoPct ?? 0)) * 10) / 10
}

/**
 * HH PROYECTADAS al ritmo observado. Sin horas reales o sin avance no hay base: `null`.
 * Un avance de 0 tampoco sirve — dividir por él daría infinito, no una proyección.
 */
export function hhProyectadas(hhReal: number | null, avancePct: number | null): number | null {
  if (hhReal === null || avancePct === null || avancePct <= 0) return null
  return Math.round((hhReal / avancePct) * 100)
}

/** El umbral del contrato visual: las proyectadas se pintan en warn cuando superan el plan × 1,05. */
export function proyeccionExcedida(proyectadas: number | null, plan: number | null): boolean {
  if (proyectadas === null || plan === null || plan <= 0) return false
  return proyectadas > plan * 1.05
}

export const OPERACIONES_MASIVAS = ['avance', 'estado', 'responsable', 'fechas'] as const
export type OperacionMasiva = (typeof OPERACIONES_MASIVAS)[number]

export const OPERACION_LABEL: Record<OperacionMasiva, string> = {
  avance: 'Avance', estado: 'Estado', responsable: 'Responsable', fechas: 'Fechas',
}

export function esOperacionMasiva(v: unknown): v is OperacionMasiva {
  return typeof v === 'string' && (OPERACIONES_MASIVAS as readonly string[]).includes(v)
}

/** Lo mínimo que hace falta saber de una actividad para decidir si una operación en lote le aplica. */
export interface CandidataMasiva {
  id: string
  metodo_avance: MetodoAvance
  cantidad_objetivo: number | null
  avance_pct: number | null
  es_contenedor: boolean
  es_subcontrato: boolean
  /** Cuántos pasos tiene cargados. Sin pasos, el método `pasos` no tiene peso que sumar. */
  n_pasos: number
}

/**
 * ¿ESTA OPERACIÓN LE APLICA A ESTA ACTIVIDAD?
 *
 * Estado, responsable y fechas son atributos de la fila y no dependen de cómo se mida. El avance
 * sí: ver la cabecera de este archivo.
 */
export function operacionCompatible(a: CandidataMasiva, op: OperacionMasiva): boolean {
  if (a.es_contenedor) return false
  if (op !== 'avance') return true
  switch (a.metodo_avance) {
    case 'manual': return true
    case 'partes': return true
    case 'cantidad': return a.cantidad_objetivo !== null && a.cantidad_objetivo > 0
    case 'pasos': return false
  }
}

/**
 * ¿SE PUEDE MEDIR ESTA ACTIVIDAD, DE ALGUNA MANERA?
 *
 * Un contenedor no: se agrega. Una medida por cantidad sin objetivo cargado tampoco —sin el total
 * no hay porcentaje— y una medida por pasos sin pasos, tampoco: no hay peso que sumar. Manual y
 * partes se pueden medir siempre, porque en los dos el número lo declara una persona.
 *
 * ═══ POR QUÉ NO ALCANZA CON «SIN ANÁLISIS» (21/08/2026) ═══
 *
 * El contrato visual apaga la casilla de lo que está «sin análisis». Medido contra la base real:
 * **las 275 actividades de las tres obras están sin análisis** —ninguna tiene analisis_id, hh_plan
 * ni cantidad objetivo—, así que esa regla apaga la pantalla entera y deja el avance masivo inerte
 * justo donde más falta hace. Y es una regla más dura de lo que el problema pide: declarar «este
 * muro va por el 75 %» no necesita un análisis de precios, necesita a alguien que lo mire.
 *
 * La deuda de carga sigue dicha: es el estado «Sin análisis» de la fila y el contador del pie.
 * Lo que no hace es impedir cargar lo único que hoy se puede cargar.
 */
export function seleccionable(a: CandidataMasiva): boolean {
  if (a.es_contenedor) return false
  switch (a.metodo_avance) {
    case 'cantidad': return a.cantidad_objetivo !== null && a.cantidad_objetivo > 0
    case 'pasos': return a.n_pasos > 0
    case 'manual':
    case 'partes': return true
  }
}

export interface ResumenSeleccion {
  n: number
  por_pasos: number
  otros_metodos: number
  subcontratos: number
  retrocesos: number
  incompatibles: number
}

export function resumenSeleccion(
  seleccion: readonly CandidataMasiva[], op: OperacionMasiva, valor: number | null,
): ResumenSeleccion {
  const retro = valor === null ? 0
    : seleccion.filter((a) => a.avance_pct !== null && valor < a.avance_pct).length
  return {
    n: seleccion.length,
    por_pasos: seleccion.filter((a) => a.metodo_avance === 'pasos').length,
    // Sólo el avance depende del método: cambiar el estado o el responsable de veinte
    // actividades no pierde precisión por cómo se midan.
    otros_metodos: op === 'avance' ? seleccion.filter((a) => a.metodo_avance !== 'pasos').length : 0,
    subcontratos: seleccion.filter((a) => a.es_subcontrato).length,
    retrocesos: op === 'avance' ? retro : 0,
    incompatibles: seleccion.filter((a) => !operacionCompatible(a, op)).length,
  }
}

const plural = (n: number, una: string, varias: string) => (n === 1 ? una : varias)

/**
 * EL AVISO — uno solo, en el orden de gravedad del contrato visual.
 *
 * Tres avisos apilados no se leen: se leen los tres como uno solo y no se actúa sobre ninguno.
 * El orden es el del handoff: primero lo que pierde información (el retroceso), después lo que
 * pierde precisión, y al final de quién es la firma.
 */
export function avisoMasivo(r: ResumenSeleccion): string | null {
  if (r.retrocesos > 0) {
    return plural(r.retrocesos,
      `${r.retrocesos} actividad quedaría con menos avance del registrado. Se guarda igual y queda el retroceso en el historial.`,
      `${r.retrocesos} actividades quedarían con menos avance del registrado. Se guarda igual y queda el retroceso en el historial.`)
  }
  if (r.otros_metodos > 0) {
    return plural(r.otros_metodos,
      `${r.otros_metodos} no se mide por pasos: aplicar un porcentaje general le quita precisión.`,
      `${r.otros_metodos} no se miden por pasos: aplicar un porcentaje general les quita precisión.`)
  }
  if (r.subcontratos > 0) {
    return `Hay ${r.subcontratos} de subcontrato: el avance lo firma el jefe de obra.`
  }
  return null
}

/** El valor que va a quedar en la fila, o `null` cuando la operación no le aplica: la pantalla
 *  escribe «—» y no un número que no se va a escribir. */
export function quedaraEn(a: CandidataMasiva, op: OperacionMasiva, valor: number): number | null {
  return operacionCompatible(a, op) ? valor : null
}

/**
 * EL RÓTULO DEL BOTÓN DICE CUÁNTAS SE TOCAN DE VERDAD, no cuántas hay tildadas.
 *
 * «Aplicar a 20» sobre una selección donde 6 se miden por pasos escribiría 14 y diría 20. El número
 * del botón es una promesa: tiene que ser el mismo que después informa el resultado.
 */
export function avanceMasivoLabel(r: ResumenSeleccion): string {
  return `Aplicar a ${r.n - r.incompatibles}`
}
