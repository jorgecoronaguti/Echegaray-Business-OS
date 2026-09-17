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
  /**
   * LA FOTO DE UNA QUINCENA CERRADA. `null` en la abierta. Una cerrada no tiene modelo blanco+negro —no se recalcula
   * sobre algo ya pagado— y por eso decía «Recibo: sin recibo todavía · —/h» para gente a la que se le liquidaron
   * horas × $/h. Con el sello dice su $/h y de cuándo es.
   */
  sello?: { valorHora: number | null; pisoDesde: string | null; hasta: string } | null
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

/** `2026-06-15` → `15/06/2026`. La fecha va en el `title`: sin ella, un valor viejo se lee como el de hoy. */
const dia = (iso: string | null | undefined): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : 'esa fecha'

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
    // ═══ UNA QUINCENA CERRADA DICE SU $/H (dueño, 17/09/2026) ═══
    //
    // No hay recibo que mostrar —la cerrada no vuelve a estimar el blanco— pero sí hay un $/h: el que se usó para
    // liquidarla. Decir «sin recibo todavía · —/h» sobre una quincena ya pagada esconde un dato que existe. Se dice
    // con su fecha, para que nadie lo lea como el valor de hoy.
    if (e.sello && e.sello.valorHora != null) {
      return {
        // «$/h de la quincena · $5.400/h» repetía la unidad. Se dice como el hecho que es: ya se pagó a ese valor.
        recibo: `Se liquidó a ${pesos(e.sello.valorHora)}/h`,
        plataforma,
        titulo: [
          `Quincena CERRADA: ${pesos(e.sello.valorHora)}/h es la tarifa con la que se liquidó, tomada al ${dia(e.sello.hasta)}. No es la de hoy.`,
          `Piso del convenio para ${plat} a esa fecha: ${pesos(e.pisoPlataforma)}/h${e.sello.pisoDesde ? ` (rige desde el ${dia(e.sello.pisoDesde)})` : ''}.`,
          // LA CATEGORÍA NO SE SELLA: `liquidacion_linea.categoria_sellada` está vacío en toda la base.
          `La categoría no quedó sellada al cerrar: «${plat}» es la del legajo de HOY.`,
        ].join('\n'),
        coinciden: e.pisoPlataforma != null && Math.round(e.sello.valorHora) === Math.round(e.pisoPlataforma),
      }
    }
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
