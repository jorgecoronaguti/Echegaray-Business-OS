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
  out.push(n - 1)
  return out
}
