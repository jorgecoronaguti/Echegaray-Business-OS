// LAS REGLAS DE LA CARTERA TAL COMO LAS ESCRIBE EL CANÓNICO 01. NÚCLEO PURO: entra una fila, sale
// una decisión de lectura. Sin React, sin Supabase, sin `new Date()` adentro.
//
// ═══ UNA SOLA DEFINICIÓN DE «ATRASO» PARA TODA LA PANTALLA (24/08/2026) ═══
//
// El mockup 01 calcula `o.dias` UNA vez y con ese número hace tres cosas: pinta la columna PLAZO,
// decide si el estado dice «· atraso», y cuenta el chip «Con atraso» (tip textual del zip: *«Fin
// proyectado después del plan»*). El mockup 02 lo confirma del otro lado: la métrica PLAZO vale
// «+16 d» y su sub-línea dice «fin proyectado 21/09».
//
// Así que atraso ES `forecast_fin − fecha_fin_plan`, y no el `desvio_plazo_dias` de
// `obra_plan_vs_real` que la cartera usaba hasta hoy. Esa columna compara el fin PLANIFICADO contra
// el fin de la LÍNEA BASE, y el propio comentario de `celdasCartera.tsx` ya declaraba el defecto:
// medido contra producción el 20/08, el sellado copió el plan en las once obras vivas, así que
// daba 0 en TODAS —incluida una obra vencida el 04/08 con 94% de avance— y la columna pintaba once
// «en fecha». Un control validado contra la misma información que produce.
//
// `forecast_fin` es el mayor forecast de las actividades de la obra: es el ritmo MEDIDO contra la
// fecha comprometida, que es la pregunta que hace quien abre la cartera a la mañana.
//
// SIN LAS DOS FECHAS NO HAY ATRASO Y NO SE INVENTA UN CERO: devuelve `null`, y la columna escribe
// «sin plan». Cero días de atraso es un hecho («llega en fecha»); no saberlo, otro.

/** Lo mínimo de una obra que estas reglas necesitan. Un subconjunto a propósito: no se recompilan
 *  cuando `obra_panel` agregue una columna. */
export interface ObraDeCartera {
  estado: string
  etapa: string | null
  fecha_fin_plan: string | null
  forecast_fin: string | null
  avance_pct: number | null
}

const DIA_MS = 86_400_000

/** Días de un ISO a otro, contados en UTC — nunca con el huso del navegador que mira. */
function dias(desdeIso: string, hastaIso: string): number {
  const a = Date.parse(`${desdeIso.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${hastaIso.slice(0, 10)}T00:00:00Z`)
  return Math.round((b - a) / DIA_MS)
}

/**
 * DÍAS DE ATRASO PROYECTADO. `null` = falta una de las dos fechas y no se puede afirmar nada.
 * Nunca negativo: adelantarse al plan no es «-3 días de atraso», es llegar en fecha (0).
 */
export function diasDeAtraso(o: ObraDeCartera): number | null {
  if (!o.fecha_fin_plan || !o.forecast_fin) return null
  return Math.max(0, dias(o.fecha_fin_plan, o.forecast_fin))
}

/** El texto de la columna PLAZO del canónico 01. */
export function textoDePlazo(o: ObraDeCartera): string {
  if (esPrevio(o)) return 'sin plan'
  const d = diasDeAtraso(o)
  if (d === null) return 'sin plan'
  return d > 0 ? `+${d} d` : 'en fecha'
}

/** ¿Esta obra todavía no arrancó? El mockup la llama «Previo» y le apaga avance y plazo. */
export function esPrevio(o: ObraDeCartera): boolean {
  return o.estado !== 'cerrada' && o.etapa === 'previo'
}

export type TonoCartera = 'pos' | 'curso' | 'warn' | 'neg' | 'neutro'

/**
 * LA PASTILLA DE ESTADO, en el orden del mockup: terminada → previo → atraso → en ejecución.
 *
 * `pausada` NO está en el zip y sí en la base: una obra frenada se leería «En ejecución», que es
 * exactamente lo contrario de lo que pasa. Se agrega como neutro —parar puede ser una decisión
 * tomada, no un problema— y queda declarado como desvío del mockup.
 *
 * El umbral de 10 días es del zip (`if (o.dias > 10)`): debajo de eso el atraso se lee en la
 * columna PLAZO en ámbar, no en el estado. No es un umbral inventado acá.
 */
export function estadoDeCartera(o: ObraDeCartera): { t: string; tono: TonoCartera } {
  if (o.estado === 'cerrada') return { t: 'Terminada', tono: 'pos' }
  if (esPrevio(o)) return { t: 'Previo', tono: 'neutro' }
  if (o.estado === 'pausada') return { t: 'Pausada', tono: 'neutro' }
  if (o.estado !== 'activa') return { t: o.estado, tono: 'neutro' }
  const d = diasDeAtraso(o)
  if (d !== null && d > 10) return { t: 'En ejecución · atraso', tono: 'neg' }
  return { t: 'En ejecución', tono: 'curso' }
}

/** Los cinco filtros del canónico 01, en su orden y con el texto del zip. */
export const FILTROS_CARTERA = [
  { k: 'todo', t: 'Todo', tip: 'Toda la cartera' },
  { k: 'curso', t: 'En ejecución', tip: 'Obras en ejecución' },
  { k: 'atraso', t: 'Con atraso', tip: 'Fin proyectado después del plan' },
  { k: 'problema', t: 'Con problema', tip: 'Impedimentos o datos faltantes' },
  { k: 'previo', t: 'Previo', tip: 'Obras sin arrancar' },
] as const

export type FiltroCartera = (typeof FILTROS_CARTERA)[number]['k']

export function esFiltroCartera(v: unknown): v is FiltroCartera {
  return typeof v === 'string' && FILTROS_CARTERA.some((f) => f.k === v)
}

/**
 * ¿ESTA OBRA ENTRA EN ESTE FILTRO? Misma lógica que el `lista = O.filter(...)` del mockup.
 *
 * `problema` cuenta impedimentos ABIERTOS. Cuando la lectura de impedimentos se cayó llega `null`,
 * y `null` NO es 0: un control que no pudo mirar no dice «no hay», así que la obra no se descarta —
 * el filtro deja de poder afirmar y muestra de más antes que esconder trabajo trabado.
 */
export function entraEnFiltro(
  o: ObraDeCartera, filtro: FiltroCartera, impedimentos: number | null,
): boolean {
  switch (filtro) {
    case 'todo': return true
    case 'curso': return o.estado === 'activa' && !esPrevio(o)
    case 'atraso': return (diasDeAtraso(o) ?? 0) > 0
    case 'problema': return impedimentos === null || impedimentos > 0
    case 'previo': return esPrevio(o)
  }
}

/** El texto que se busca en el buscador del zip: nombre + cliente, sin acentos ni mayúsculas. */
export function coincideTexto(nombre: string, cliente: string | null, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!q) return true
  const t = `${nombre} ${cliente ?? ''}`.toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return t.includes(q)
}

/** El color de la barra de avance del zip: verde 100 · rojo si atrasada · azul en curso · gris cero. */
export function colorDeBarra(o: ObraDeCartera): string {
  const av = o.avance_pct ?? 0
  if (av >= 100) return '#067647'
  if (av <= 0) return '#D7D5CF'
  return (diasDeAtraso(o) ?? 0) > 10 ? '#B42318' : '#175CD3'
}

/** El color del número de la columna PLAZO del zip. */
export function colorDePlazo(o: ObraDeCartera): string {
  if (esPrevio(o)) return '#91918B'
  const d = diasDeAtraso(o)
  if (d === null) return '#91918B'
  if (d > 10) return '#B42318'
  if (d > 0) return '#B54708'
  return '#067647'
}
