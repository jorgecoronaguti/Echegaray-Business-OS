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
    { k: 'Unidad', v: f.unidad_negocio || 'sin definir', tono: f.unidad_negocio ? undefined : 'apagado' },
    {
      k: 'Tipo de costo',
      v: f.categoria ?? (esEstructura(obra) ? 'Estructura · no de obra' : 'sin clasificar'),
      tono: f.categoria ? undefined : 'apagado',
    },
    { k: 'Forma de pago', v: f.tipo_pago || 'sin definir', tono: f.tipo_pago ? undefined : 'apagado' },
    {
      k: 'Deuda parcial',
      v: (deuda != null && deuda > 0 ? pesos(deuda) : null) ?? 'sin deuda',
      tono: deuda != null && deuda > 0 ? 'falta' : 'ok',
    },
    { k: 'Origen', v: `pestaña Compras · fila ${f.fila}`, tono: 'apagado' },
  ]
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
