// LAS DOS CATEGORÍAS DE UNA FILA, CON SU $/H — dueño, 16/09/2026, textual: *«necesito que en liq hs me indiques la
// categoría que dice el recibo y la que sale en la plataforma con su monto por hora en cada caso»*.
//
// El blanco se paga por la categoría del recibo (memoria: blanco = categoría del recibo; negro = categoría de
// plataforma), y las dos pueden no coincidir: González Carlos S. es «Ayudante» en el legajo y «OFICIAL» en el recibo.
// Hasta hoy la fila decía sólo la de plataforma y el $/h del recibo, y el dueño no podía ver de dónde salía cada número.
// Puro: recibe lo que la fila ya tiene y devuelve dos renglones y un title. Nada se calcula acá.

export interface EntradaDeCategorias {
  /** El rótulo de la categoría del legajo (plataforma), ya legible: «Oficial», «Ayudante»… `null` = sin categoría. */
  plataforma: string | null
  /** El piso vigente de esa categoría (escala del CCT), $/h. */
  pisoPlataforma: number | null
  /** Lo que dice el recibo que manda en el blanco. */
  categoriaRecibo: string | null | undefined
  valorHoraRecibo: number | null | undefined
  periodoRecibo: string | null | undefined
  /** `recibo` = el del período; `estimado` = el $/h viene del último recibo real; sin recibo = nunca tuvo. */
  estado: 'recibo' | 'estimado' | null
}

export interface CategoriasDeLaFila {
  recibo: string
  plataforma: string
  titulo: string
  /** Las dos categorías nombran lo mismo y el $/h coincide: no hay nada que comparar. */
  coinciden: boolean
}

const pesos = (n: number | null | undefined): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`

/** «OFICIAL ESPECIALIZADO» → «Oficial especializado». */
export const legible = (s: string | null | undefined): string | null => {
  const t = String(s ?? '').trim().toLowerCase()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null
}

/** «Q2-08/2026» → «2ª ago-26»; «Q1-09/2026» → «1ª sep-26». Otro formato, tal cual. */
export function periodoCorto(p: string | null | undefined): string {
  const m = /^Q([12])-(\d{2})\/(\d{4})$/.exec(String(p ?? ''))
  if (!m) return String(p ?? '')
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m[2]) - 1] ?? m[2]
  return `${m[1]}ª ${mes}-${m[3].slice(2)}`
}

export function categoriasDeLaFila(e: EntradaDeCategorias): CategoriasDeLaFila {
  const plat = e.plataforma ?? 'sin categoría'
  const plataforma = `Plataforma: ${plat} · ${pesos(e.pisoPlataforma)}/h`
  const catRecibo = legible(e.categoriaRecibo)
  const hayRecibo = e.estado != null && (catRecibo != null || e.valorHoraRecibo != null) && e.periodoRecibo != null
  if (!hayRecibo) {
    return {
      recibo: 'Recibo: sin recibo todavía',
      plataforma,
      titulo: `Sin recibo real: el blanco se estima con el piso de plataforma (${plat} ${pesos(e.pisoPlataforma)}/h).`,
      coinciden: false,
    }
  }
  const periodo = periodoCorto(e.periodoRecibo)
  const recibo = `Recibo: ${catRecibo ?? '¿categoría?'} · ${pesos(e.valorHoraRecibo)}/h`
  const coinciden = catRecibo != null && catRecibo.toLowerCase() === plat.toLowerCase()
    && e.valorHoraRecibo != null && e.pisoPlataforma != null && Math.round(e.valorHoraRecibo) === Math.round(e.pisoPlataforma)
  const titulo = [
    `Recibo ${periodo}${e.estado === 'estimado' ? ' (último real; el de este período no llegó)' : ''}: ${catRecibo ?? 'sin categoría'} · ${pesos(e.valorHoraRecibo)}/h`,
    `Plataforma (legajo): ${plat} · piso ${pesos(e.pisoPlataforma)}/h`,
    coinciden ? 'Coinciden.' : 'NO coinciden: el blanco se paga por el recibo; el negro por la plataforma.',
  ].join('\n')
  return { recibo, plataforma, titulo, coinciden }
}
