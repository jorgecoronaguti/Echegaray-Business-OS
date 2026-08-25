// LA ARITMÉTICA DEL GANTT DE LA PANTALLA 03 — fuera del componente, para que se pueda romper en rojo.
//
// ═══ POR QUÉ SE MUDÓ ACÁ (24/08/2026) ═══
//
// Esto vivía repartido entre `GanttTareas.tsx` y `TabTareas.tsx`, y no había UN test que se pusiera
// rojo si la escala se corría un día: son cuatro funciones que se equivocan EN SILENCIO. Una barra
// que arranca un día tarde no da error, dibuja una obra que no es; un conector mal calculado dibuja
// una flecha entre dos actividades que no tienen nada que ver — y una flecha es una AFIRMACIÓN
// sobre qué espera a qué. Una barra corrida se nota mirando; una flecha corrida se cree.
//
// ═══ POR QUÉ EN PÍXELES Y NO EN % (y por qué no reusa `conectoresGantt.ts`) ═══
//
// `conectoresGantt.ts` resuelve el MISMO dibujo para el cronograma de la pantalla 07, donde el
// lienzo es porcentual (`escalaCronograma`) y el codo mide 1,2 % del ancho. Acá el lienzo es de
// escala fija —un día vale `DIA_PX`— y ese mismo 1,2 % daría un codo de 3px en una obra de un mes y
// de 105px en una de un año. Son dos geometrías distintas con el mismo nombre: compartirlas
// obligaría a que una de las dos pantallas dibuje mal para que la otra dibuje bien.

import type { NodoObra } from './wbs.ts'
import type { FilaVisible } from './vistaArbol.ts'
import { porcentaje } from '../../../shared/utils/format.ts'

/** Un día del canónico 03 mide 24px. A menos, un mes entero mide lo que una palabra y el Gantt deja
 *  de decir CUÁNDO — que es lo único que un Gantt sabe decir. */
export const DIA_PX = 24
const DIA_MS = 86_400_000

export const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

export interface EscalaGantt {
  /** Medianoche UTC del primer día dibujado. */
  desde: number
  dias: number
  /** Índice del día de hoy dentro de la escala, o null si la obra no lo contiene. */
  hoy: number | null
}

export type TonoBarra = 'pos' | 'curso' | 'warn' | 'plan'

export interface BarraGantt {
  id: string
  /** Día de inicio y cantidad de días, en índices de la escala. */
  dia: number
  dias: number
  tono: TonoBarra
  /** 0–100. El relleno de la pista. */
  avance: number
  /** El % al final de la barra; null cuando no hay nada medido que anunciar. */
  etiqueta: string | null
  /** Barra plana de contenedor: agrega a sus hijas, no se mide. */
  resumen: boolean
}

/** El rango temporal del carril: del primer inicio al último fin de plan, con hoy adentro. */
export function rangoDeObra(
  nodos: readonly NodoObra[], hoy: string,
): { desde: number; hasta: number } | null {
  let desde = Infinity, hasta = -Infinity
  for (const n of nodos) {
    if (n.inicio_plan) desde = Math.min(desde, t(n.inicio_plan))
    if (n.fin_plan) hasta = Math.max(hasta, t(n.fin_plan))
  }
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return null
  const h = t(hoy)
  return { desde: Math.min(desde, h), hasta: Math.max(hasta, h) + DIA_MS }
}

export function escalaDe(rango: { desde: number; hasta: number }, hoy: number): EscalaGantt {
  const dias = Math.max(1, Math.round((rango.hasta - rango.desde) / DIA_MS))
  const i = Math.floor((hoy - rango.desde) / DIA_MS)
  return { desde: rango.desde, dias, hoy: i >= 0 && i < dias ? i : null }
}

/** El día `iso` como índice de la escala. Fuera de rango se recorta: una fecha de plan anterior al
 *  rango sólo pasa si el rango se calculó sobre otro conjunto de nodos. */
export function indiceDe(iso: string, e: EscalaGantt): number {
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Math.min(e.dias - 1, Math.max(0, Math.round((ms - e.desde) / DIA_MS)))
}

/** El tramo de un contenedor: del primer inicio al último fin de sus descendientes.
 *  `Agregado` publica `fin_plan` pero NO el inicio, y el corchete del canónico necesita los dos
 *  extremos. Se calcula acá y no se le agrega un campo al rollup: el rollup lo consumen el pie y
 *  la fila, y ninguno de los dos necesita saber cuándo arranca un rubro. */
export function tramosDeContenedores(
  nodos: readonly NodoObra[],
): Map<string, { inicio: string; fin: string }> {
  const padre = new Map<string, string | null>(nodos.map((n) => [n.id, n.padre_id]))
  const tramo = new Map<string, { inicio: string; fin: string }>()
  for (const n of nodos) {
    if (n.es_contenedor || !n.inicio_plan || !n.fin_plan) continue
    let id = n.padre_id
    while (id) {
      const p = tramo.get(id)
      tramo.set(id, p
        ? { inicio: n.inicio_plan < p.inicio ? n.inicio_plan : p.inicio, fin: n.fin_plan > p.fin ? n.fin_plan : p.fin }
        : { inicio: n.inicio_plan, fin: n.fin_plan })
      id = padre.get(id) ?? null
    }
  }
  return tramo
}

/** La barra de una fila: la pista es el PLAN y el relleno el avance medido.
 *  Sin fechas de plan devuelve null — la fila queda vacía y el Gantt escribe el motivo, porque una
 *  barra inventada desde hoy taparía el único dato que hay: que esa actividad no está planificada. */
export function barraDe(
  f: FilaVisible, e: EscalaGantt, hoy: string, tramos: Map<string, { inicio: string; fin: string }>,
): BarraGantt | null {
  const n = f.nodo
  const tr = n.es_contenedor ? tramos.get(n.id) ?? null : null
  const inicio = n.es_contenedor ? tr?.inicio ?? null : n.inicio_plan
  const fin = n.es_contenedor ? tr?.fin ?? null : n.fin_plan
  if (!inicio || !fin) return null
  const dia = indiceDe(inicio, e)
  const dias = Math.max(1, indiceDe(fin, e) - dia + 1)
  // El contenedor no se mide: su barra es el corchete plano del canónico, sin relleno ni %.
  if (n.es_contenedor) {
    return { id: n.id, dia, dias, tono: 'plan', avance: 0, etiqueta: null, resumen: true }
  }
  const av = f.avance
  const hecha = av != null && av >= 100
  const arranco = (av != null && av > 0) || n.estado === 'en_curso'
  const vencida = fin < hoy && !hecha
  const tono: TonoBarra = hecha ? 'pos'
    : arranco ? (n.es_critica || vencida ? 'warn' : 'curso')
    : vencida ? 'warn' : 'plan'
  return {
    id: n.id, dia, dias, tono, avance: Math.min(100, Math.max(0, av ?? 0)),
    etiqueta: av != null && av > 0 ? porcentaje(av) : null, resumen: false,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAS DEPENDENCIAS, DIBUJADAS EN L
// ═══════════════════════════════════════════════════════════════════════════════

export interface RelacionEnGantt {
  origen_id: string
  destino_id: string
}

/** Una fila tal como la dibuja el Gantt: el ÍNDICE en el arreglo ES la fila de la pantalla. */
export interface FilaDelGantt {
  id: string
  barra: { dia: number; dias: number } | null
}

export interface ConectorEnL {
  clave: string
  /** El `d` del path: sale del fin del origen, dobla, y entra al arranque del destino. */
  d: string
}

export interface ConectoresEnL {
  conectores: ConectorEnL[]
  /** Dependencias reales que NO se dibujaron: una punta plegada dentro de un frente cerrado, fuera
   *  de la vista filtrada, sin fechas de plan, o pasado el techo. Media flecha apuntando al borde
   *  se lee como una dependencia hacia afuera de la obra, así que no se dibuja ninguna mitad. */
  omitidas: number
}

/** Cuánto se separa el codo de la punta, en px. Con 0 el trazo vertical quedaría pegado a la barra
 *  y la flecha nacería adentro. Son los mismos números del canónico 03. */
const CODO = 8
const HOLGURA = 3

/**
 * LOS CONECTORES DE LAS DEPENDENCIAS VISIBLES, en píxeles del lienzo del Gantt.
 *
 * `filas` viene en el orden en que se dibujan, así que el mismo arreglo que pinta las barras pinta
 * las flechas. Pasar otro orden apuntaría a la fila de al lado — el defecto exacto que este archivo
 * existe para poder probar.
 */
export function conectoresEnL(
  filas: readonly FilaDelGantt[],
  relaciones: readonly RelacionEnGantt[],
  { altoFila, maximo = 200 }: { altoFila: number; maximo?: number },
): ConectoresEnL {
  const indice = new Map<string, number>()
  filas.forEach((f, i) => indice.set(f.id, i))

  const conectores: ConectorEnL[] = []
  let omitidas = 0
  for (const r of relaciones) {
    const iO = indice.get(r.origen_id)
    const iD = indice.get(r.destino_id)
    const bO = iO == null ? null : filas[iO].barra
    const bD = iD == null ? null : filas[iD].barra
    if (iO == null || iD == null || !bO || !bD || iO === iD) { omitidas++; continue }
    if (conectores.length >= maximo) { omitidas++; continue }

    const x1 = (bO.dia + bO.dias) * DIA_PX
    const y1 = iO * altoFila + altoFila / 2
    const x2 = bD.dia * DIA_PX - HOLGURA
    const y2 = iD * altoFila + altoFila / 2
    // Cuando el destino arranca ANTES de que el origen termine, el codo se apoya del lado del
    // origen: el trazo sale hacia adelante, baja y vuelve. Es una dependencia que el plan no está
    // respetando, y se dibuja igual — esconderla sería esconder el problema.
    const codo = x2 > x1 + 12 ? x1 + CODO : x2 - 10
    conectores.push({
      clave: `${r.origen_id}->${r.destino_id}`,
      d: `M${x1} ${y1} H${codo} V${y2} H${x2}`,
    })
  }
  return { conectores, omitidas }
}
