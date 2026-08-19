// FILTRAR LA CARTERA — la regla, pura y sin pantalla.
//
// ═══ POR QUÉ SÓLO DOS FILTROS ═══
//
// El dueño pidió filtros y, en el mismo pedido, *"respetá mis lineamientos de diseño"*: less is
// more, cero dashboarditis, alta densidad útil. Un panel con un control por columna sería
// exactamente lo contrario — siete controles para una tabla de trece filas.
//
// Se filtra por lo único que no se resuelve ordenando:
//
//  · ETAPA, porque «mostrame las que están en terminación» es una pregunta de todos los días y la
//    columna ordenada no la contesta: sigue mostrando las trece.
//  · TEXTO, que cubre obra Y cliente con un solo control. Un desplegable de clientes sería un
//    segundo control para lo que un campo ya hace, y además envejece con cada cliente nuevo.
//
// Todo lo demás (avance, monto, plazo) se contesta ORDENANDO, que ya está. Un filtro numérico
// obligaría a elegir umbrales que nadie pidió.

import { ETAPAS, type Etapa } from '../types/index.ts'

export interface FiltroObras {
  /** Etapa exacta, o `null` = todas. */
  etapa: Etapa | null
  /** Texto libre sobre nombre de obra y de cliente. Vacío = sin filtro. */
  q: string
}

export const SIN_FILTRO: FiltroObras = { etapa: null, q: '' }

export function esEtapa(v: string | null | undefined): v is Etapa {
  return typeof v === 'string' && (ETAPAS as readonly string[]).includes(v)
}

/** Lee el filtro de la URL. Un valor que no existe se ignora en vez de romper la pantalla. */
export function filtroDesde(params: {
  etapa?: string | string[] | null, q?: string | string[] | null,
}): FiltroObras {
  const uno = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  const etapa = uno(params.etapa)
  return { etapa: esEtapa(etapa) ? etapa : null, q: (uno(params.q) ?? '').trim() }
}

export function hayFiltro(f: FiltroObras): boolean {
  return f.etapa !== null || f.q !== ''
}

/** Sin tildes y en minúscula: buscar «galpon» tiene que encontrar «Galpón». */
function plano(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export interface ObraFiltrable {
  nombre: string | null
  cliente_nombre?: string | null
  etapa?: string | null
}

export function filtrar<T extends ObraFiltrable>(obras: T[], f: FiltroObras): T[] {
  const q = plano(f.q)
  return obras.filter((o) => {
    if (f.etapa && o.etapa !== f.etapa) return false
    if (!q) return true
    return plano(`${o.nombre ?? ''} ${o.cliente_nombre ?? ''}`).includes(q)
  })
}
