// LA GEOMETRÍA DE LOS GRÁFICOS DE CAJA — pura, para que el SVG sólo dibuje.
//
// Los gráficos de la pestaña son COMBO de dos ejes (barras apiladas a la izquierda, saldo a la
// derecha). Un gráfico de dos escalas alinea dos cosas que no tienen por qué alinearse, así que en la
// app las MISMAS series se dibujan en dos paneles apilados que comparten el eje de días: arriba lo
// que sale (barras), abajo el saldo (líneas). Nada se recalcula: los valores son los del anexo que
// lee el gráfico de la pestaña.
import type { GraficoCaja, SerieCaja } from './cajaSheet.ts'

/** Un tramo de barra apilada: de `y0` a `y1` (positivos hacia arriba, negativos hacia abajo). */
export interface Tramo { serie: number; i: number; y0: number; y1: number }

/** Las series apiladas por punto del dominio: cada valor se apoya sobre la suma de las anteriores con su signo. */
export function apilar(series: SerieCaja[], n: number): Tramo[] {
  const out: Tramo[] = []
  for (let i = 0; i < n; i++) {
    let arriba = 0
    let abajo = 0
    series.forEach((s, k) => {
      const v = s.valores[i]
      if (v == null || v === 0) return
      if (v > 0) { out.push({ serie: k, i, y0: arriba, y1: arriba + v }); arriba += v } else { out.push({ serie: k, i, y0: abajo, y1: abajo + v }); abajo += v }
    })
  }
  return out
}

export interface Escala { min: number; max: number; ticks: number[] }

/** Un eje que incluye el cero y termina en un número redondo, con 3–5 marcas. */
export function escala(valores: number[]): Escala {
  const finitos = valores.filter((v) => Number.isFinite(v))
  if (!finitos.length) return { min: 0, max: 1, ticks: [0, 1] }
  let min = Math.min(0, ...finitos)
  let max = Math.max(0, ...finitos)
  if (min === max) max = min + 1
  const paso = pasoRedondo((max - min) / 4)
  min = Math.floor(min / paso) * paso
  max = Math.ceil(max / paso) * paso
  const ticks: number[] = []
  for (let t = min; t <= max + paso / 2; t += paso) ticks.push(Math.round(t / paso) * paso)
  return { min, max, ticks }
}

function pasoRedondo(bruto: number): number {
  const e = 10 ** Math.floor(Math.log10(Math.abs(bruto) || 1))
  const f = bruto / e
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  return nice * e
}

/** `$ 12 M`, `$ 0,5 M`, `−$ 3 M`: el rótulo corto de una marca del eje. */
export function rotuloEje(n: number): string {
  if (n === 0) return '0'
  const v = n / 1e6
  const abs = Math.abs(v)
  const s = abs >= 10 ? Math.round(abs).toLocaleString('es-AR') : abs.toLocaleString('es-AR', { maximumFractionDigits: 1 })
  return `${v < 0 ? '−' : ''}$ ${s} M`
}

/** Los dos paneles de un gráfico: las series de barras y las de línea, ya separadas. */
export function paneles(g: GraficoCaja): { barras: SerieCaja[]; lineas: SerieCaja[] } {
  const esLinea = (s: SerieCaja) => (s.tipo ?? g.tipo) === 'LINE'
  return { barras: g.series.filter((s) => !esLinea(s)), lineas: g.series.filter(esLinea) }
}

/** Los índices del dominio que llevan rótulo: como mucho `max`, repartidos, siempre el primero y el último. */
export function indicesRotulados(n: number, max = 8): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i)
  const paso = Math.ceil((n - 1) / (max - 1))
  const out: number[] = []
  for (let i = 0; i < n - 1; i += paso) out.push(i)
  // El penúltimo no puede pegarse al último: dos rótulos encimados no se leen.
  if (out.length > 1 && n - 1 - out[out.length - 1] < paso * 0.7) out.pop()
  out.push(n - 1)
  return out
}

// ═══ FECHAS Y CELDAS COMO SE LEEN EN LA APP (auditoría 18/09/2026) ═══

/** dd/mm/yy desde `2026-09-19` o desde `19/09/2026`; cualquier otro texto vuelve igual. */
export function fechaCorta(s: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(2)}`
  const larga = /^(\d{1,2})\/(\d{1,2})\/\d{2}(\d{2})$/.exec(s.trim())
  if (larga) return `${larga[1].padStart(2, '0')}/${larga[2].padStart(2, '0')}/${larga[3]}`
  return s
}

/**
 * LO QUE SE ESCRIBE EN UNA CELDA DE LAS TABLAS: el texto de la pestaña, salvo la fecha, que va en
 * dd/mm/yy. VACÍA ES VACÍA: la pestaña escribe «—» cuando quiere decir cero; una celda sin nada no se
 * rellena con un guión inventado.
 */
export function textoCelda(c: { texto: string; fecha?: string | null }): string {
  if (c.fecha) return fechaCorta(c.fecha)
  return fechaCorta(c.texto ?? '')
}

/** La ventana del período en dd/mm/yy, una sola vez: si el período ya ES la ventana (un rango a mano), no se repite. */
export function rotuloVentana(periodo: string, rango: { desde: string | null; hasta: string | null }): string {
  const { desde, hasta } = rango
  const ventana = desde && hasta ? `${fechaCorta(desde)} – ${fechaCorta(hasta)}` : desde ? `desde el ${fechaCorta(desde)}` : hasta ? `hasta el ${fechaCorta(hasta)}` : 'desde el inicio'
  return periodo.toLowerCase() === ventana.toLowerCase() ? ventana : `${periodo} · ${ventana}`
}

// ═══ LA DISPOSICIÓN DE UN COMBO: dos paneles y el pie, sin pisarse ═══

export const GEOMETRIA = Object.freeze({
  ANCHO: 720, IZQ: 64, DER: 12,
  ALTO_BARRAS: 150, ALTO_LINEAS: 130,
  /** Aire ENTRE los dos paneles: el rótulo del piso de las barras y el del techo de las líneas no se tocan. */
  ENTRE: 34,
  /** Aire arriba: la marca más alta lleva su rótulo por encima de la línea. */
  TECHO: 10,
  PIE: 22,
  /** El rótulo de una marca del eje: 9 px de letra, dibujado con la base 3 px por debajo de la línea. */
  LETRA: 9, BAJA: 3,
})

export interface Panel { arriba: number; abajo: number }
export interface Disposicion { barras: Panel | null; lineas: Panel | null; separador: number | null; yPie: number; alto: number }

/** Dónde va cada panel, la línea que los separa y el pie de fechas, en coordenadas del SVG. */
export function disposicion(hayBarras: boolean, hayLineas: boolean): Disposicion {
  const G = GEOMETRIA
  let y = G.TECHO
  const barras = hayBarras ? { arriba: y, abajo: y + G.ALTO_BARRAS } : null
  if (barras) y = barras.abajo + (hayLineas ? G.ENTRE : 8)
  const lineas = hayLineas ? { arriba: y, abajo: y + G.ALTO_LINEAS } : null
  if (lineas) y = lineas.abajo + 8
  const alto = y + G.PIE
  return { barras, lineas, separador: barras && lineas ? barras.abajo + G.ENTRE / 2 : null, yPie: alto - G.PIE + 12, alto }
}

/** La franja vertical que ocupa el rótulo de una marca puesta en `y`: [arriba, abajo]. */
export const franjaDeRotulo = (y: number): [number, number] => [y + GEOMETRIA.BAJA - GEOMETRIA.LETRA, y + GEOMETRIA.BAJA]

/** Ancho aproximado de un rótulo del eje de días (letra de 9 px: ~5,4 px por carácter). */
const anchoRotulo = (s: string) => s.length * GEOMETRIA.LETRA * 0.6

/**
 * LOS RÓTULOS DEL EJE DE DÍAS, en dd/mm/yy y sin pisarse: el reparto con más rótulos (hasta 12) en
 * que ninguno toca al vecino, siempre el primero y el último.
 */
export interface RotuloDelEje { i: number; texto: string; x: number; ancla: 'start' | 'middle' | 'end'; desde: number; hasta: number }

export function rotulosDelEje(dominio: string[]): RotuloDelEje[] {
  const n = dominio.length
  if (!n) return []
  const textos = dominio.map(fechaCorta)
  const colocar = (max: number): RotuloDelEje[] => indicesRotulados(n, max).map((i) => {
    const x = xDe(i, n)
    const w = anchoRotulo(textos[i])
    // Los extremos se apoyan hacia adentro: el primero empieza en su punto, el último termina en el suyo.
    const ancla = n > 2 && i === 0 ? 'start' : n > 2 && i === n - 1 ? 'end' : 'middle'
    const desde = ancla === 'start' ? x : ancla === 'end' ? x - w : x - w / 2
    return { i, texto: textos[i], x, ancla, desde, hasta: desde + w }
  })
  // De más a menos rótulos, el primer reparto en que ninguno toca al vecino (10 px de aire).
  for (let max = Math.min(n, 12); max > 2; max--) {
    const r = colocar(max)
    if (r.every((x, k) => k === 0 || r[k - 1].hasta + 10 <= x.desde)) return r
  }
  return colocar(2)
}

/** La x del centro del punto `i` de un dominio de `n`. */
export const xDe = (i: number, n: number) => GEOMETRIA.IZQ + ((i + 0.5) / n) * (GEOMETRIA.ANCHO - GEOMETRIA.IZQ - GEOMETRIA.DER)
