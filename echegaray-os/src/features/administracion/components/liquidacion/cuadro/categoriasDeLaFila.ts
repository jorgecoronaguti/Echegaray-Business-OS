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
   * LA QUINCENA CERRADA. `null` en la abierta. Una cerrada no tiene modelo blanco+negro —no se recalcula sobre algo
   * ya pagado— y por eso decía «Recibo: sin recibo todavía · —/h» para gente a la que se le liquidaron horas × $/h.
   *
   * `origen` DECIDE CÓMO SE DICE, y no es cosmética: `sello` es el registro de `liquidacion_linea` —lo que se
   * pagó— y `reconstruido` es la tarifa recompuesta desde `persona_tarifa`, que en 45 de 324 líneas no coincide
   * con lo guardado. Sólo el registro puede decirse como hecho.
   */
  sello?: { origen: 'sello' | 'reconstruido'; valorHora: number | null; pisoDesde: string | null; hasta: string } | null
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
    // ═══ UNA QUINCENA CERRADA DICE SU $/H, Y DICE DE DÓNDE SALE ═══
    //
    // No hay recibo que mostrar —la cerrada no vuelve a estimar el blanco— pero sí hay un $/h. Cuál se muestra y
    // CÓMO se dice depende del origen, y ésa es la corrección de la auditoría del 17/09/2026: «Se liquidó a $X/h»
    // sobre una reconstrucción es una afirmación falsa con forma de hecho (Bazán, 16–31/03: decía $4.000 y el
    // registro guarda $4.300). El registro se afirma; la reconstrucción se declara como lo que es.
    if (e.sello && e.sello.valorHora != null) {
      const esRegistro = e.sello.origen === 'sello'
      const piso = `Piso del convenio para ${plat} a esa fecha: ${pesos(e.pisoPlataforma)}/h${e.sello.pisoDesde ? ` (rige desde el ${dia(e.sello.pisoDesde)})` : ''}.`
      // LA CATEGORÍA CASI NUNCA SE SELLA: `categoria_sellada` está vacía en las 324 líneas cerradas de la base.
      const deHoy = `La categoría no quedó sellada al cerrar: «${plat}» es la del legajo de HOY.`
      return {
        recibo: esRegistro
          ? `Se liquidó a ${pesos(e.sello.valorHora)}/h`
          : `Sin línea guardada · tarifa de esa fecha ${pesos(e.sello.valorHora)}/h`,
        plataforma,
        titulo: (esRegistro
          ? [
            `Quincena CERRADA: ${pesos(e.sello.valorHora)}/h es el $/h GUARDADO en la línea del cierre (liquidacion_linea.valor_hora). Es el registro de lo que se pagó, no un recálculo de hoy.`,
            piso, deHoy,
          ]
          : [
            `Quincena CERRADA y SIN LÍNEA GUARDADA para esta persona: no hay registro de lo que se le pagó.`,
            `${pesos(e.sello.valorHora)}/h es una RECONSTRUCCIÓN: la tarifa que regía al ${dia(e.sello.hasta)} según persona_tarifa. Puede no ser lo que se liquidó.`,
            piso, deHoy,
          ]).join('\n'),
        coinciden: esRegistro && e.pisoPlataforma != null && Math.round(e.sello.valorHora) === Math.round(e.pisoPlataforma),
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
