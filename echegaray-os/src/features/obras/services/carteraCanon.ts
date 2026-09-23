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
import { coincideObra } from '../../../shared/utils/obra.ts'
import { jerarquiaDeObras, type FilaDeObra, type ObraConPadre } from '../../clientes/services/obrasAdicionales.ts'

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
export function coincideTexto(nombre: string, cliente: string | null, query: string, codigo: string | null = null): boolean {
  // EL C\u00d3DIGO INTERNO (`OB-0012`) TAMBI\u00c9N SE BUSCA, y con la regla \u00fanica de `shared/utils/obra`:
  // \u00abob12\u00bb y \u00ab12\u00bb encuentran la obra. Nombre y cliente se siguen buscando igual que antes.
  return coincideObra({ nombre, cliente, codigo }, query)
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

// ═══ LOS TEXTOS FIJOS DEL DISEÑO ERP OBRAS 01 / M01 (dueño, 23/09/2026) ═══
//
// Se copian literales del `.html` aprobado: la bajada del título, el pie de la tabla, la línea de
// archivadas. Son funciones y no cadenas en el JSX porque el número que llevan adentro es un dato
// (cuántas vivas, cuántas con fin proyectado después del plan) y eso sí se prueba con `node --test`.

/** «11 vivas · 4 con fin proyectado después del plan» — la bajada bajo el título «Obras». */
export function bajadaCartera(obras: ObraDeCartera[]): string {
  const vivas = obras.filter((o) => o.estado !== 'cerrada')
  const conAtraso = vivas.filter((o) => (diasDeAtraso(o) ?? 0) > 0).length
  return `${vivas.length} viva${vivas.length === 1 ? '' : 's'} · ${conAtraso} con fin proyectado después del plan`
}

/** «Se muestran 8 de 11.» — el pie de la tabla, sobre lo que SE VE contra lo que hay en la lista. */
export function textoSeMuestran(visibles: number, total: number): string {
  return `Se muestran ${visibles} de ${total}.`
}

/** «3 archivadas fuera de esta lista» (M01). `null` = no hay archivadas y la línea no se dibuja. */
export function textoArchivadas(n: number): string | null {
  if (n <= 0) return null
  return `${n} archivada${n === 1 ? '' : 's'} fuera de esta lista`
}

/** «11 obras, 9 con fechas de plan» — la bajada del Gantt en el teléfono (M02). */
export function bajadaGantt(obras: { fecha_inicio_plan: string | null; fecha_fin_plan: string | null }[]): string {
  const conPlan = obras.filter((o) => o.fecha_inicio_plan && o.fecha_fin_plan).length
  return `${obras.length} obra${obras.length === 1 ? '' : 's'}, ${conPlan} con fechas de plan`
}

/**
 * EL COLOR DEL ESTADO DEBAJO DEL NOMBRE (01, fila): el mismo semáforo que la columna PLAZO. El
 * diseño pinta «En ejecución · atraso» en rojo y «Previo» en gris; el ámbar es el mismo que el «+N d»
 * de la columna de al lado, para que las dos celdas de la fila no se contradigan.
 */
export function colorDeEstado(o: ObraDeCartera): string {
  const e = estadoDeCartera(o)
  if (e.tono === 'neg') return '#B42318'
  if (e.tono === 'pos') return '#067647'
  if (e.tono === 'neutro') return '#6B6B67'
  // 01.html: «En ejecución» va en azul (#175CD3); en ámbar sólo cuando el plazo está en ámbar
  // (+N d ≤ 10). El verde es de la COLUMNA Plazo («en fecha»), nunca del estado: pintar el estado de
  // verde se leía como «todo en fecha» (revisión visual 23/09/2026).
  const plazo = colorDePlazo(o)
  return plazo === '#B54708' ? plazo : '#175CD3'
}

/** La sub-línea de la fila del teléfono (M01): «Macro · Terminación · atraso». `atraso` va aparte
 *  porque el diseño lo pinta en rojo. */
export function sublineaTelefono(o: ObraDeCartera, cliente: string | null, etapaRotulo: string | null): { texto: string; atraso: boolean } {
  const partes = [cliente, etapaRotulo].filter((x): x is string => !!x)
  return { texto: partes.join(' · '), atraso: estadoDeCartera(o).tono === 'neg' }
}


// ═══ LA CARTERA SE LEE COMO EL CRM: POR CLIENTE, CON EL ADICIONAL DEBAJO DE SU OBRA MAYOR ═══
//
// Dueño, 23/09/2026: «que la vista Tabla tenga el mismo orden y jerarquía que el CRM de clientes,
// con la UI que tiene ahora; por lo tanto sacar la columna Cliente. Lo mismo con la vista Gantt».
// El CRM ordena clientes por obras activas (más arriba el que más tiene) y después por nombre, y
// debajo de cada uno sus obras en el orden del índice con el adicional colgado de su obra mayor
// (`jerarquiaDeObras`, la misma función). Acá se reproduce ESE criterio sobre las filas que la
// cartera ya trae, sin otra consulta.

export interface ObraAgrupable extends ObraDeCartera, ObraConPadre {
  cliente_slug: string | null
  cliente_nombre: string | null
  cliente_texto: string | null
}

export interface GrupoDeCliente<T extends ObraAgrupable> {
  /** Clave estable para React y para el test: slug, o el texto, o «sin-cliente». */
  clave: string
  nombre: string | null
  slug: string | null
  filas: FilaDeObra<T>[]
}

export const SIN_CLIENTE = 'sin cliente declarado'

export function agruparPorCliente<T extends ObraAgrupable>(obras: T[]): GrupoDeCliente<T>[] {
  const grupos = new Map<string, { nombre: string | null; slug: string | null; obras: T[] }>()
  for (const o of obras) {
    const nombre = o.cliente_nombre ?? o.cliente_texto ?? null
    const clave = o.cliente_slug ?? (nombre ? `texto:${nombre}` : 'sin-cliente')
    const g = grupos.get(clave) ?? { nombre, slug: o.cliente_slug ?? null, obras: [] }
    g.obras.push(o)
    grupos.set(clave, g)
  }
  const activas = (g: { obras: T[] }) => g.obras.filter((o) => o.estado === 'activa').length
  return [...grupos.entries()]
    .sort(([ka, a], [kb, b]) =>
      // El que no tiene cliente va al final: no es un cliente, es un dato que falta.
      Number(ka === 'sin-cliente') - Number(kb === 'sin-cliente')
      || activas(b) - activas(a)
      || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'))
    .map(([clave, g]) => ({ clave, nombre: g.nombre, slug: g.slug, filas: jerarquiaDeObras(g.obras) }))
}
