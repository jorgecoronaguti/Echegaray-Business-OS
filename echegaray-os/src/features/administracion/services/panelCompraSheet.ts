// LO QUE EL PANEL DE UNA FILA DE COMPRAS *AFIRMA* — separado de cómo lo dibuja.
//
// `PanelCompraSheet.tsx` no puede probarse con `node --test`: el runner no carga `.tsx`. Y lo que
// hay que proteger acá no es el JSX sino las afirmaciones — qué falta en esta fila, con qué palabra
// se nombra y de qué color va —, que es exactamente donde «NULL nunca es cero» se rompe sin que
// nadie lo note: un `saldo_pendiente` en 0 dibujado como «debe $0» diría lo contrario de la verdad.

// Se importa de `canon/formato` y NO del barril `canon`: el barril arrastra los componentes `.tsx`
// y `node --test` no los carga, así que un import cómodo dejaría este módulo sin poder probarse —
// que es justo lo que lo trajo acá.
import { pesos } from '../../../shared/components/canon/formato.ts'
import { esEstructura } from './comprasSheet.ts'
import type { FilaConPapel } from './comprasSheetService.ts'

/** `C.tenue` del canon. Literal para no arrastrar el barril; el test de conformidad lo fija. */
const TENUE = '#91918B'

/** Una propiedad del panel. `tono` sólo se despega del negro cuando el valor es una ausencia. */
export type Prop = { k: string; v: string; tono?: 'falta' | 'apagado' | 'ok' }

export const COLOR_PROP: Record<NonNullable<Prop['tono']>, string> = {
  falta: '#B54708',
  apagado: TENUE,
  ok: '#067647',
}

/**
 * LAS OCHO PROPIEDADES DE LA v2, en su orden. Es una función pura sobre la fila — de ahí que el
 * test pueda fijar qué dice cada una sin montar React.
 *
 * NULL NO ES CERO y no es «sin definir» a secas: cada ausencia dice qué falta con el vocabulario de
 * esa columna. «sin comprobante» es trabajo pendiente (el gasto no acredita IVA) y por eso va en
 * ámbar; «sin clasificar» en Tipo de costo es apagado, porque no bloquea nada.
 */
export function propiedadesDe(f: FilaConPapel): Prop[] {
  const obra = f.obra_texto?.trim()
  const deuda = f.saldo_pendiente
  return [
    { k: 'Fecha', v: f.fecha ? new Date(f.fecha).toLocaleDateString('es-AR') : 'sin fecha', tono: f.fecha ? undefined : 'falta' },
    {
      k: 'Comprobante',
      v: f.comprobante ? `${f.tipo ? `${f.tipo} ` : ''}${f.comprobante}` : 'sin comprobante',
      tono: f.comprobante ? undefined : 'falta',
    },
    { k: 'Destino', v: obra || 'sin imputar', tono: obra ? (esEstructura(obra) ? 'apagado' : undefined) : 'falta' },
    obraProp(f),
    { k: 'Unidad', v: f.unidad_negocio || 'sin definir', tono: f.unidad_negocio ? undefined : 'apagado' },
    {
      k: 'Tipo de costo',
      v: f.categoria ?? (esEstructura(obra) ? 'Estructura · no de obra' : 'sin clasificar'),
      tono: f.categoria ? undefined : 'apagado',
    },
    { k: 'Forma de pago', v: f.tipo_pago || 'sin definir', tono: f.tipo_pago ? undefined : 'apagado' },
    // CUÁNDO HAY QUE PAGARLA — la columna Q «Fecha prevista de pago (día)». Bajó de la lista al panel
    // el 15/09/2026, cuando el dueño pidió ver en la fila la fecha del comprobante y la del pago. No
    // se borró: es el dato que decide el orden de los pagos, y la fuente del filtro «Vencimiento»
    // (AN es un ARRAYFORMULA sobre esa misma Q). Sin esto, la pantalla habría perdido el concepto.
    {
      k: 'A pagar',
      v: f.fecha_prevista ? new Date(f.fecha_prevista).toLocaleDateString('es-AR') : 'sin fecha prevista',
      tono: f.fecha_prevista ? undefined : 'apagado',
    },
    // LOS DOS TRAMOS DE PAGO, tal como los registra la pestaña. Una sola línea y sólo cuando hay algo
    // que decir: una fila sin pagar no gana un renglón que diga «—».
    ...tramosDePago(f),
    {
      k: 'Deuda parcial',
      v: (deuda != null && deuda > 0 ? pesos(deuda) : null) ?? 'sin deuda',
      tono: deuda != null && deuda > 0 ? 'falta' : 'ok',
    },
    { k: 'Origen', v: `pestaña Compras · fila ${f.fila}`, tono: 'apagado' },
  ]
}

/**
 * LO QUE YA SE PAGÓ, EN LOS DOS TRAMOS DE LA PESTAÑA.
 *
 * `Monto Parcial 1` no aparece y no es un olvido: es la fórmula `=T-O` —el saldo que queda después
 * del primer tramo, negativo— y mostrarlo como un pago haría que la pantalla cuente la misma plata
 * dos veces. El segundo tramo se nombra con su fecha porque sin ella «$1.300.000» no dice cuándo.
 */
export function tramosDePago(f: FilaConPapel): Prop[] {
  const out: Prop[] = []
  const t1 = f.monto_pagado ?? 0
  const t2 = f.monto_parcial_2 ?? 0
  if (t1 <= 0 && t2 <= 0) return out
  const forma = f.pago_total_o_parcial?.trim()
  if (t1 > 0) out.push({ k: 'Pagado', v: `${pesos(t1)}${forma ? ` · ${forma}` : ''}`, tono: 'ok' })
  if (t2 > 0) {
    const cuando = f.fecha_prevista_2 ? new Date(f.fecha_prevista_2).toLocaleDateString('es-AR') : null
    out.push({ k: '2.º tramo', v: `${pesos(t2)}${cuando ? ` · ${cuando}` : ''}`, tono: 'ok' })
  }
  return out
}

/**
 * LA OBRA (dueño, 14/09/2026), con el rótulo único y dicho de dónde sale. Una obra que el sync infirió
 * de J y K no se dibuja igual que una elegida: se lee «inferida» y en apagado. Una celda que no se
 * entendió va en ámbar con su motivo, porque alguien escribió algo y hay que decírselo.
 */
export function obraProp(f: FilaConPapel): Prop {
  const o = f.obra
  if (!o) return { k: 'Obra', v: 'sin leer', tono: 'apagado' }
  if (o.inconsistencia) return { k: 'Obra', v: `${o.celda ?? 'la celda'} · ${o.inconsistencia}`, tono: 'falta' }
  if (o.rotulo) {
    return o.origen === 'inferida' ? { k: 'Obra', v: `${o.rotulo} · inferida`, tono: 'apagado' } : { k: 'Obra', v: o.rotulo }
  }
  if (o.celda) return { k: 'Obra', v: o.celda }
  if (o.origen === 'sin_obra') return { k: 'Obra', v: 'sin obra asignada', tono: 'falta' }
  return { k: 'Obra', v: 'sin obra', tono: 'apagado' }
}

/** Qué reclama esta fila, si reclama algo. `null` = está completa y el panel no dibuja la banda. */
export function reclamoDe(f: FilaConPapel): { texto: string; verbo: string; filtro: string } | null {
  if (!f.obra_texto?.trim()) {
    return { texto: 'El costo no impacta en ninguna obra.', verbo: 'Ver las sin imputar', filtro: 'sinObra' }
  }
  if (!f.comprobante) {
    return { texto: 'Sin comprobante el gasto no acredita IVA.', verbo: 'Ver las sin comprobante', filtro: 'sinComprobante' }
  }
  if (f.saldo_pendiente != null && f.saldo_pendiente > 0) {
    return { texto: `Queda ${pesos(f.saldo_pendiente) ?? '—'} sin pagar.`, verbo: 'Ver las a pagar', filtro: 'aPagar' }
  }
  return null
}
