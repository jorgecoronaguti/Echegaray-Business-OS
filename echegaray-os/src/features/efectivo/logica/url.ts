// LA URL DE «EFECTIVO A RENDIR». Todo el estado vive acá: se comparte con un enlace y vuelve con «atrás».
//
//   /administracion/compras?vista=a-rendir                       D01 la lista (f=todas|obra|anuladas recorta)
//   …&panel=entregar                                             D02 sobre D01
//   …&persona=<persona_id>                                       la persona: sus entregas y rendiciones, con saldo corrido
//   …&persona=<persona_id>&panel=entregar                        D02 sobre la persona, con ella ya elegida
//   …&entrega=ER-0147                                            D03 la ficha
//   …&entrega=ER-0147&panel=devolucion                           D06 sobre D03
//   …&entrega=ER-0147&panel=recibo&item=<rendición>              firmar el recibo de un gasto manual (01/10/2026)
//   …&entrega=ER-0147&panel=imputar                              imputar una compra ya cargada (24/09/2026)
//   …&entrega=ER-0147&comprobante=<id>                           D04 revisar (D05 si está observado)
//   …&entrega=ER-0147&panel=editar                               editar la entrega (25/09/2026)
//   …&entrega=ER-0147&panel=editar-devolucion&item=<id>          editar una devolución
//   …&entrega=ER-0147&panel=editar-comprobante&item=<id>         editar un ticket o una rendición
//   …&panel=emitir-recibo                                        recibo de pago en efectivo a un tercero, sobre D01 (02/10/2026)

export const RUTA = '/administracion/compras'

/** Donde va el id de la rendición en una URL que se arma antes de que exista (la que sigue a «Rendir el gasto»). */
export const MARCA_RENDICION = '__RENDICION__'

export interface EstadoURL {
  f?: 'abiertas' | 'todas' | 'obra' | 'anuladas'
  entrega?: string | null
  /** El id de la persona cuya cronología se abre (29/09/2026: la unidad de la pantalla es la persona). */
  persona?: string | null
  panel?: 'entregar' | 'devolucion' | 'imputar' | 'rendir' | 'recibo' | 'emitir-recibo' | PanelEdicion | null
  comprobante?: string | null
  /** El id de lo que se edita en `editar-devolucion` / `editar-comprobante`, o la rendición cuyo recibo se firma en `recibo`. */
  item?: string | null
}

export type PanelEdicion = 'editar' | 'editar-devolucion' | 'editar-comprobante'

export function urlEfectivo(e: EstadoURL = {}): string {
  const p = new URLSearchParams({ vista: 'a-rendir' })
  if (e.f && e.f !== 'abiertas') p.set('f', e.f)
  if (e.entrega) p.set('entrega', e.entrega)
  if (e.persona) p.set('persona', e.persona)
  if (e.panel) p.set('panel', e.panel)
  if (e.comprobante) p.set('comprobante', e.comprobante)
  if (e.item) p.set('item', e.item)
  return `${RUTA}?${p.toString()}`
}

/** El enlace a la fila de Compras que rinde un ticket: la corrección se hace ahí, no acá. */
export function urlFilaDeCompras(fila: number): string {
  return `${RUTA}?s=${fila}`
}
