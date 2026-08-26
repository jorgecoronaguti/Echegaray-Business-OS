// QUÉ MUESTRA CADA VISTA DE LA BASE MAESTRA — los cortes del canónico, puros y probados.
//
// Vive fuera de los componentes por la regla del repo: un conteo de filtro es lógica, y una lógica
// que sólo se puede ejercitar levantando la pantalla no se ejercita nunca. Acá se prueba sin React
// y sin Supabase (`vistas.test.ts`).
//
// ═══ LAS DOS BARRAS DE CHIPS SON LAS DEL ZIP ═══
//
//   17 · Tareas    Todo · Con desvío · Sin dato real
//   18 · Recursos  Todo · Mano de obra · Materiales · Con problema
//
// El corte «Con desvío» del canónico es `real / base > 1,1` calculado en la pantalla; acá lo decide
// `desvioObservado`, que usa una banda SIMÉTRICA de 10 % y está probada. Es la misma pregunta con
// el umbral que el repo ya defendió por escrito (`reglas.ts` §5b), no un umbral nuevo.

import { coincide, desvioObservado, type Frescura } from './reglas.ts'

// ═══ 17 · LOS CORTES DE TAREAS ═════════════════════════════════════════════════════════════════

export const CORTES_TAREA = ['todo', 'desvio', 'sinDato', 'sinAnalisis'] as const
export type CorteTarea = (typeof CORTES_TAREA)[number]

export const ROTULO_CORTE: Record<CorteTarea, string> = {
  todo: 'Todo',
  desvio: 'Con desvío',
  sinDato: 'Sin dato real',
  // El corte que el 17 v2 agrega (`filtro: "sin"`), y es donde aterriza la primera señal de la
  // pantalla. NO es «sin dato real»: aquél es sin rendimiento MEDIDO en obra —la tarea cotiza
  // igual—; éste es sin análisis, o sea sin costo unitario, y esa tarea no se puede presupuestar.
  sinAnalisis: 'Sin análisis',
}

export type SenalesTarea = {
  hs_unitarias: number | null
  hs_observado: number | null
  /** `null` = no tiene análisis vigente. Sin él no hay costo unitario. */
  analisis_id: string | null
}

export function corteDe(v: string | undefined): CorteTarea {
  return (CORTES_TAREA as readonly string[]).includes(v ?? '') ? (v as CorteTarea) : 'todo'
}

export function cumpleCorte(t: SenalesTarea, corte: CorteTarea): boolean {
  if (corte === 'sinAnalisis') return t.analisis_id === null
  // «Sin dato real» es sin OBSERVADO **o** sin base: las dos dejan la comparación sin hacer, que es
  // lo que este corte junta. Es literal del canónico (`t.real === null || t.hh === null`).
  if (corte === 'sinDato') return t.hs_observado == null || t.hs_unitarias == null
  if (corte === 'desvio') return desvioObservado(t.hs_unitarias, t.hs_observado)?.direccion === 'peor'
  return true
}

// ═══ 18 · LOS CORTES DE RECURSOS ═══════════════════════════════════════════════════════════════
//
// «Con problema» del canónico junta tres avisos: sin precio, precio viejo y precio sin proveedor.
// Acá son: SIN PRECIO · precio VIEJO (frescura, corte de 180 días) · precio SIN FECHA.
//
// EL CORTE DE «VIEJO» NO ES EL DEL MOCKUP y es a propósito. El zip marca a los 60 días; en esta
// base 60 días es `nueva` y el corte de «ya no sirve para cotizar» son 180 (`reglas.ts` §2, con su
// razón escrita). Con el umbral del mockup, «Con problema» traería casi la lista entera y el chip
// dejaría de señalar algo. Sin fecha SÍ entra: una antigüedad desconocida no se puede defender.

export const CORTES_RECURSO = ['todo', 'mano_obra', 'material', 'problema', 'sin_precio'] as const
export type CorteRecurso = (typeof CORTES_RECURSO)[number]

export const ROTULO_CORTE_RECURSO: Record<CorteRecurso, string> = {
  todo: 'Todo',
  mano_obra: 'Mano de obra',
  material: 'Materiales',
  problema: 'Con problema',
  // El corte del 17 v2 (`filtro: "sin"`). Es un SUBCONJUNTO de «Con problema», que junta tres
  // avisos: sin precio, precio viejo y precio sin fecha. La señal de arriba cuenta sólo el
  // primero, así que necesita su propio recorte — mandarla a «Con problema» la haría aterrizar
  // en una lista más grande que el número que acaba de leer.
  sin_precio: 'Sin precio',
}

export type SenalesRecurso = { tipo: string; costo_base: number | null; frescura: Frescura }

export function corteRecursoDe(v: string | undefined): CorteRecurso {
  return (CORTES_RECURSO as readonly string[]).includes(v ?? '') ? (v as CorteRecurso) : 'todo'
}

export function tieneProblema(r: SenalesRecurso): boolean {
  return r.costo_base == null || r.frescura === 'vieja' || r.frescura === 'sin_fecha'
}

export function cumpleCorteRecurso(r: SenalesRecurso, corte: CorteRecurso): boolean {
  if (corte === 'mano_obra') return r.tipo === 'mano_obra' || r.tipo === 'carga_social'
  if (corte === 'material') return r.tipo === 'material'
  if (corte === 'problema') return tieneProblema(r)
  if (corte === 'sin_precio') return r.costo_base == null
  return true
}

// ═══ LA SUB-VISTA DE `/recursos` ═══════════════════════════════════════════════════════════════
//
// `insumos` y `equipos` SIGUEN ENTRANDO aunque ya no sean vistas: el canónico 18 dibuja UNA lista
// con una columna TIPO, así que las dos se fundieron en `recursos`. Los enlaces viejos —los que
// están en mensajes y marcadores— caen en la lista unificada en vez de en un 404. `insumos` llega
// con el chip «Materiales» puesto, que es la misma lista que dejó. `equipos` NO: el canónico no
// dibuja un chip de equipos, así que cae en la lista entera —donde los equipos están, con su TIPO
// a la vista— en lugar de estrenar un quinto chip que el zip no tiene.

export const VISTAS_RECURSOS = ['recursos', 'mano-obra', 'plantillas', 'precios'] as const
export type VistaRecursos = (typeof VISTAS_RECURSOS)[number]

export function vistaDe(v: string | undefined): VistaRecursos {
  if (v === 'insumos' || v === 'equipos') return 'recursos'
  return (VISTAS_RECURSOS as readonly string[]).includes(v ?? '') ? (v as VistaRecursos) : 'recursos'
}

/** El chip que corresponde: el pedido explícito manda; si no, el que traía el enlace viejo. */
export function corteDeLaVista(v: string | undefined, tipo: string | undefined): CorteRecurso {
  if (tipo) return corteRecursoDe(tipo)
  if (v === 'insumos') return 'material'
  return 'todo'
}

// ═══ LO QUE MIRA EL BUSCADOR ═══════════════════════════════════════════════════════════════════
//
// El canónico busca sobre `nombre + código + rubro` en 17 y sobre `nombre + proveedor + tipo` en 18.
// Se conservan los dos juegos —y se agrega la UNIDAD en 17, porque «m3» es una búsqueda real de esta
// base— con la normalización de `coincide`: sin acentos y sin distinguir mayúsculas, porque la base
// dice «HORMIGON» y quien busca escribe «hormigón».
//
// EL RUBRO SIGUE SIENDO BUSCABLE aunque el canónico 17 no dibuje chips de rubro: la versión anterior
// de esta pantalla los tenía, y sacarlos sin dejar la búsqueda por rubro le quitaría a alguien la
// única manera de ver «todo lo de Albañilería».

export function coincideTarea(
  t: { codigo: string; nombre: string; division: string | null; unidad: string },
  consulta: string,
): boolean {
  return coincide([t.codigo, t.nombre, t.division, t.unidad], consulta)
}

export function coincideRecurso(
  r: { codigo: string; nombre: string; familia: string | null; proveedor: string | null; unidad: string },
  consulta: string,
): boolean {
  return coincide([r.codigo, r.nombre, r.familia, r.proveedor, r.unidad], consulta)
}
