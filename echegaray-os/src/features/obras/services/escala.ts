// LA ESCALA HORIZONTAL DEL GANTT: dónde cae cada fecha y qué divisiones se dibujan arriba.
//
// Vive acá y no dentro del componente por la misma razón que `cronograma.ts`: es aritmética pura,
// se puede probar sin navegador, y es donde está la decisión que se equivoca en silencio — la
// posición de una barra. Se mudó de `Gantt.tsx` cuando ese archivo pasó el tope de 500 líneas.
//
// LA ESCALA SE ACUMULA POR CELDA; NUNCA `left = (fecha − inicio) × pxPorDía` sobre meses, porque los
// meses tienen entre 28 y 31 días y las cabeceras se irían corriendo respecto de las barras.

const DIA = 86400000

export type Escala = 'semana' | 'mes'
export const PX_POR_DIA: Record<Escala, number> = { semana: 13, mes: 4 }

const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const isoDe = (d: Date) => d.toISOString().slice(0, 10)

export function construirEscala(desde: Date, hasta: Date, escala: Escala) {
  const px = PX_POR_DIA[escala]
  const ancho = Math.ceil((hasta.getTime() - desde.getTime()) / DIA) * px
  const x = (iso: string) => ((aDate(iso).getTime() - desde.getTime()) / DIA) * px

  const meses: { label: string; x0: number }[] = []
  const ticks: { label: string; x: number }[] = []
  const cur = new Date(desde)
  cur.setUTCDate(1)
  while (cur < hasta) {
    const x0 = ((cur.getTime() - desde.getTime()) / DIA) * px
    if (x0 > -px) {
      meses.push({ label: cur.toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), x0: Math.max(0, x0) })
    }
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  if (escala === 'semana') {
    const d = new Date(desde)
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)) // primer lunes
    while (d < hasta) {
      ticks.push({ label: String(d.getUTCDate()).padStart(2, '0'), x: x(isoDe(d)) })
      d.setUTCDate(d.getUTCDate() + 7)
    }
  }
  return { px, ancho, x, meses, ticks }
}
