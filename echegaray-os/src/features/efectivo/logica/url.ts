// LA URL DE «EFECTIVO A RENDIR». Todo el estado vive acá: se comparte con un enlace y vuelve con «atrás».
//
//   /administracion/compras?vista=a-rendir                       D01 la lista (f=todas|obra|anuladas recorta)
//   …&panel=entregar                                             D02 sobre D01
//   …&entrega=ER-0147                                            D03 la ficha
//   …&entrega=ER-0147&panel=devolucion                           D06 sobre D03
//   …&entrega=ER-0147&panel=imputar                              imputar una compra ya cargada (24/09/2026)
//   …&entrega=ER-0147&comprobante=<id>                           D04 revisar (D05 si está observado)

export const RUTA = '/administracion/compras'

export interface EstadoURL {
  f?: 'abiertas' | 'todas' | 'obra' | 'anuladas'
  entrega?: string | null
  panel?: 'entregar' | 'devolucion' | 'imputar' | null
  comprobante?: string | null
}

export function urlEfectivo(e: EstadoURL = {}): string {
  const p = new URLSearchParams({ vista: 'a-rendir' })
  if (e.f && e.f !== 'abiertas') p.set('f', e.f)
  if (e.entrega) p.set('entrega', e.entrega)
  if (e.panel) p.set('panel', e.panel)
  if (e.comprobante) p.set('comprobante', e.comprobante)
  return `${RUTA}?${p.toString()}`
}

/** El enlace a la fila de Compras que rinde un ticket: la corrección se hace ahí, no acá. */
export function urlFilaDeCompras(fila: number): string {
  return `${RUTA}?s=${fila}`
}
