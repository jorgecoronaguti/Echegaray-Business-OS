// LO QUE LA PANTALLA 24 DECIDE SOBRE UNA FILA DE LA PESTAÑA COMPRAS. Puro, y por eso probado.
//
// ═══ POR QUÉ LA LISTA CAMBIÓ DE FUENTE (25/08/2026) ═══
//
// Hasta hoy la pantalla listaba `comprobante_compra` —la vista del libro de compras de ARCA— y su
// texto de ayuda afirmaba que «la pestaña Compras del Sheet es una proyección de lo mismo, no una
// segunda versión». Medido el 25/08, eso es falso: ARCA tiene 632 comprobantes y la pestaña 882
// filas. La diferencia no es ruido, es todo lo que ARCA no puede tener — el gasto sin factura, los
// sueldos, los impuestos, las boletas, y la imputación a obra que escribe el dueño a mano.
//
// El pedido fue explícito: «la sección compras en app.ecsas tiene que replicar toda la información
// que actualmente se concentra en pestaña Compras». Así que la lista es la pestaña. El control
// fiscal contra ARCA sigue siendo otra pregunta y sigue teniendo su lugar; lo que no puede seguir es
// que la pantalla llame «Compras» a una población distinta de la que el dueño llama Compras.
//
// ═══ «PROYECTADO» NO ES UN GASTO HECHO ═══
//
// El mockup dibuja tres estados (A pagar · Pagado · Retenido) y la pestaña tiene cuatro
// (Pagado 821 · Proyectado 39 · Pendiente 16 · ELIMINADO 6). «Proyectado» es una PROYECCIÓN: el
// dueño la escribe para que la caja la vea venir, y todavía no existe como obligación. Meterla en la
// pastilla de «A pagar» la presentaría como un hecho, que es exactamente lo que las reglas de este
// sistema prohíben. Lleva pastilla propia, apagada, y no suma en «A pagar».

/** La paleta del canónico `24`, líneas 195-197. */
const TONO = {
  pagado: { color: '#067647', fondo: '#F1F9F4', borde: '#D6EBDF' },
  aPagar: { color: '#B54708', fondo: '#FDF6EE', borde: '#F0E1CD' },
  alerta: { color: '#B42318', fondo: '#FEF6F5', borde: '#F3DDDA' },
  neutro: { color: '#6B6B67', fondo: '#FAFAF8', borde: '#E7E6E2' },
} as const

export interface Pastilla { texto: string; color: string; fondo: string; borde: string }

/** El estado que el dueño escribe en la columna «Estado» de su pestaña. */
export const ESTADO = {
  PAGADO: 'Pagado',
  PENDIENTE: 'Pendiente',
  PROYECTADO: 'Proyectado',
  ANULADA: 'ELIMINADO',
} as const

/**
 * LA PASTILLA DE UNA FILA. Nunca inventa un estado: lo que la pestaña no dice se dibuja «Sin
 * estado» y apagado, no se asume pagado ni pendiente.
 */
export function pastillaDe(estado: string | null): Pastilla {
  switch (estado?.trim()) {
    case ESTADO.PAGADO: return { texto: 'Pagado', ...TONO.pagado }
    case ESTADO.PENDIENTE: return { texto: 'A pagar', ...TONO.aPagar }
    case ESTADO.PROYECTADO: return { texto: 'Proyectado', ...TONO.neutro }
    case ESTADO.ANULADA: return { texto: 'Anulada', ...TONO.alerta }
    default: return { texto: 'Sin estado', ...TONO.neutro }
  }
}

/** Lo mínimo que necesita saberse de una fila para contarla, filtrarla y sumarla. */
export interface Filtrable {
  estado: string | null
  obra_texto: string | null
  anulada: boolean
  total: number | null
  tiene_adjunto?: boolean
}

export const FILTROS = ['todo', 'aPagar', 'sinObra', 'sinComprobante', 'sueltos'] as const
export type FiltroSheet = (typeof FILTROS)[number]

export const ROTULO: Record<FiltroSheet, string> = {
  todo: 'Todo',
  aPagar: 'A pagar',
  sinObra: 'Sin obra',
  sinComprobante: 'Sin comprobante',
  sueltos: 'Comprobantes sin vincular',
}

/** El filtro de la URL, cerrado: cualquier cosa rara vuelve a «todo». */
export function filtroDe(v: string | null | undefined): FiltroSheet {
  return (FILTROS as readonly string[]).includes(String(v)) ? (v as FiltroSheet) : 'todo'
}

/**
 * ¿Esta fila entra en esta vista?
 *
 * LAS ANULADAS NO ENTRAN EN NINGÚN FILTRO SALVO «TODO», y se replican igual para que la cuenta de
 * arriba cierre contra la pestaña. Que el dueño las vea en su Sheet y la pantalla las esconda del
 * conteo total sería mentir por omisión; que aparezcan en «A pagar» sería peor.
 */
export function pasa(f: Filtrable, filtro: FiltroSheet): boolean {
  if (filtro === 'todo') return true
  if (f.anulada) return false
  switch (filtro) {
    case 'aPagar': return f.estado === ESTADO.PENDIENTE
    case 'sinObra': return !f.obra_texto?.trim()
    case 'sinComprobante': return f.tiene_adjunto !== true
    default: return true
  }
}

export interface Totales {
  nTotal: number
  nSinObra: number
  nSinComprobante: number
  aPagar: number
  total: number
}

/**
 * LOS NÚMEROS DEL PIE. Las anuladas NO suman: sus importes están en cero en la pestaña, así que
 * incluirlas no cambiaría el total — pero sí cambiaría los CONTEOS, y «6 sin obra» que en realidad
 * son 6 filas muertas manda a alguien a trabajar sobre nada.
 */
export function totalesDe(filas: Filtrable[]): Totales {
  const vivas = filas.filter((f) => !f.anulada)
  return {
    nTotal: filas.length,
    nSinObra: vivas.filter((f) => !f.obra_texto?.trim()).length,
    nSinComprobante: vivas.filter((f) => f.tiene_adjunto !== true).length,
    aPagar: vivas.filter((f) => f.estado === ESTADO.PENDIENTE).reduce((s, f) => s + (f.total ?? 0), 0),
    total: vivas.reduce((s, f) => s + (f.total ?? 0), 0),
  }
}

/** El conteo de cada chip, sobre la población entera y no sobre la página que se está mirando. */
export function conteosDe(filas: Filtrable[]): Record<FiltroSheet, number> {
  return {
    todo: filas.length,
    aPagar: filas.filter((f) => pasa(f, 'aPagar')).length,
    sinObra: filas.filter((f) => pasa(f, 'sinObra')).length,
    sinComprobante: filas.filter((f) => pasa(f, 'sinComprobante')).length,
    sueltos: 0,
  }
}

/**
 * CÓMO SE MUESTRA UN ADJUNTO. Un `null` significa «no hay papel», y eso se DICE — no se dibuja un
 * hueco. La miniatura sólo para lo que es imagen: un PDF renderizado como `<img>` se ve roto.
 */
export function claseDeAdjunto(mediaType: string | null | undefined): 'imagen' | 'pdf' | 'otro' | 'ninguno' {
  const t = String(mediaType ?? '').toLowerCase()
  if (!t) return 'ninguno'
  if (t === 'application/pdf') return 'pdf'
  if (t.startsWith('image/')) return 'imagen'
  return 'otro'
}
